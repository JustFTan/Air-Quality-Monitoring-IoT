"""Database: SQLite lokal, atau Turso (libSQL lewat HTTP) kalau di-deploy ke Vercel.

Mode dipilih otomatis:
  - TURSO_DATABASE_URL terisi  -> Turso (cocok untuk Vercel, yang tidak punya disk permanen)
  - kosong                     -> file SQLite lokal (AQ_DB, default aq.db)

Kode lain cukup memakai `with db.connect() as conn` dan conn.execute(sql, params),
sama seperti sqlite3. Tambahan: conn.defer(sql, params) = tulis nanti. Di Turso semua
tulisan "defer" dikirim sekaligus dalam satu permintaan HTTP saat blok `with` selesai,
supaya jumlah round-trip kecil.
"""
import base64
import json
import os
import sqlite3
import urllib.error
import urllib.request
from contextlib import contextmanager

DB_FILE = os.getenv("AQ_DB", "aq.db")
TURSO_URL = os.getenv("TURSO_DATABASE_URL", "").strip()
TURSO_TOKEN = os.getenv("TURSO_AUTH_TOKEN", "").strip()
REMOTE = bool(TURSO_URL)

STATEMENTS = [
    """CREATE TABLE IF NOT EXISTS readings (
    type        TEXT NOT NULL,
    device      TEXT NOT NULL,
    created_at  TEXT NOT NULL,
    co2         REAL,
    pm25        REAL,
    temp        REAL,
    rh          REAL,
    rssi        INTEGER,
    uptime      TEXT,
    pm_ok       INTEGER,
    sht_ok      INTEGER,
    sd_ok       INTEGER,
    received_at TEXT,
    PRIMARY KEY (type, device, created_at)
)""",
    """CREATE TABLE IF NOT EXISTS logs (
    id      INTEGER PRIMARY KEY AUTOINCREMENT,
    ts      TEXT NOT NULL,
    level   TEXT NOT NULL,
    event   TEXT NOT NULL,
    device  TEXT,
    type    TEXT,
    message TEXT NOT NULL,
    payload TEXT
)""",
    # ringkasan per perangkat: status online dan jumlah data, supaya halaman tidak perlu memindai tabel readings
    """CREATE TABLE IF NOT EXISTS devices (
    device     TEXT PRIMARY KEY,
    last_seen  TEXT,
    first_data TEXT,
    last_data  TEXT,
    total      INTEGER NOT NULL DEFAULT 0,
    raw        INTEGER NOT NULL DEFAULT 0,
    validated  INTEGER NOT NULL DEFAULT 0,
    hourly     INTEGER NOT NULL DEFAULT 0,
    online     INTEGER
)""",
    # status pencatatan perubahan kategori, disimpan di database karena server (Vercel) tidak punya memori tetap
    """CREATE TABLE IF NOT EXISTS level_state (
    device   TEXT NOT NULL,
    param    TEXT NOT NULL,
    shown    INTEGER,
    cand     INTEGER,
    count    INTEGER NOT NULL DEFAULT 0,
    last_log TEXT,
    PRIMARY KEY (device, param)
)""",
    "CREATE INDEX IF NOT EXISTS idx_logs_ts ON logs(ts)",
    "CREATE INDEX IF NOT EXISTS idx_logs_level ON logs(level)",
    "CREATE INDEX IF NOT EXISTS idx_logs_event ON logs(event, id)",
]

# kolom yang ditambahkan di versi 2 (supaya aq.db lama dari versi 1 tetap bisa dipakai)
EXTRA_COLUMNS = {
    "uptime": "TEXT",
    "pm_ok": "INTEGER",
    "sht_ok": "INTEGER",
    "sd_ok": "INTEGER",
    "received_at": "TEXT",
}

BACKFILL_DEVICES = (
    "INSERT INTO devices(device,last_seen,first_data,last_data,total,raw,validated,hourly) "
    "SELECT device, MAX(received_at), MIN(created_at), MAX(created_at), COUNT(*), "
    "SUM(type='2m_raw'), SUM(type='2m_validated'), SUM(type='1h_valid') FROM readings GROUP BY device"
)


# ---------------------------------------------------------------- SQLite lokal
class LocalConn:
    def __init__(self):
        self._c = sqlite3.connect(DB_FILE, timeout=15)
        self._c.row_factory = sqlite3.Row

    def execute(self, sql, params=()):
        return self._c.execute(sql, params)

    def defer(self, sql, params=()):
        self._c.execute(sql, params)

    def flush(self):
        pass

    def close(self):
        self._c.commit()  # log tetap tersimpan walau request ditolak (HTTPException)
        self._c.close()


# ---------------------------------------------------------------- Turso (HTTP)
class Row(dict):
    """Baris hasil: r['kolom'], dict(r), r.keys()."""
    __slots__ = ()


class Result:
    def __init__(self, rows, rowcount):
        self.rows = rows
        self.rowcount = rowcount

    def fetchone(self):
        return self.rows[0] if self.rows else None

    def fetchall(self):
        return self.rows

    def __iter__(self):
        return iter(self.rows)


def _arg(v):
    if v is None:
        return {"type": "null"}
    if isinstance(v, bool):
        return {"type": "integer", "value": str(int(v))}
    if isinstance(v, int):
        return {"type": "integer", "value": str(v)}
    if isinstance(v, float):
        return {"type": "float", "value": v}
    return {"type": "text", "value": str(v)}


def _val(c):
    t = c.get("type")
    if t == "null":
        return None
    if t == "integer":
        return int(c["value"])
    if t == "float":
        return float(c["value"])
    if t == "blob":
        return base64.b64decode(c.get("base64", ""))
    return c.get("value")


def _endpoint():
    base = TURSO_URL
    if base.startswith("libsql://"):
        base = "https://" + base[len("libsql://"):]
    return base.rstrip("/") + "/v2/pipeline"


def _pipeline(stmts):
    """Kirim beberapa statement dalam satu permintaan HTTP. Mengembalikan daftar Result."""
    reqs = [{"type": "execute", "stmt": {"sql": sql, "args": [_arg(a) for a in params]}}
            for sql, params in stmts]
    reqs.append({"type": "close"})
    body = json.dumps({"requests": reqs}).encode()
    headers = {"Content-Type": "application/json"}
    if TURSO_TOKEN:
        headers["Authorization"] = f"Bearer {TURSO_TOKEN}"
    last = None
    for attempt in range(2):  # satu kali coba ulang untuk gangguan jaringan / 5xx
        try:
            req = urllib.request.Request(_endpoint(), data=body, headers=headers, method="POST")
            with urllib.request.urlopen(req, timeout=8) as resp:
                data = json.loads(resp.read())
            break
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode(errors="replace")[:300]
            last = RuntimeError(f"Turso HTTP {exc.code}: {detail}")
            if exc.code < 500:
                raise last
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            last = RuntimeError(f"Turso tidak terjangkau: {exc}")
    else:
        raise last
    out = []
    for item in data["results"][:len(stmts)]:
        if item.get("type") != "ok":
            msg = (item.get("error") or {}).get("message", "error tidak diketahui")
            raise RuntimeError(f"Turso: {msg}")
        res = item["response"]["result"]
        cols = [c["name"] for c in res.get("cols", [])]
        rows = [Row(zip(cols, (_val(c) for c in r))) for r in res.get("rows", [])]
        out.append(Result(rows, res.get("affected_row_count", 0)))
    return out


class RemoteConn:
    def __init__(self):
        self._pending = []

    def execute(self, sql, params=()):
        return _pipeline([(sql, tuple(params))])[0]

    def defer(self, sql, params=()):
        self._pending.append((sql, tuple(params)))

    def flush(self):
        if self._pending:
            todo, self._pending = self._pending, []
            _pipeline(todo)

    def close(self):
        pass


# ---------------------------------------------------------------- umum
_ready = False


@contextmanager
def connect():
    init()
    conn = RemoteConn() if REMOTE else LocalConn()
    try:
        yield conn
    finally:
        try:
            conn.flush()
        finally:
            conn.close()


def init():
    """Buat tabel kalau belum ada. Dipanggil otomatis sekali per proses."""
    global _ready
    if _ready:
        return
    _ready = True  # set dulu supaya connect() di bawah tidak memanggil init() lagi
    try:
        conn = RemoteConn() if REMOTE else LocalConn()
        try:
            if REMOTE:
                _pipeline([(sql, ()) for sql in STATEMENTS])
                if not conn.execute("SELECT 1 FROM devices LIMIT 1").fetchall():
                    conn.execute(BACKFILL_DEVICES)
            else:
                conn.execute("PRAGMA journal_mode=WAL")
                for sql in STATEMENTS:
                    # idx_logs_event dll. aman; tabel readings lama bisa belum punya kolom baru
                    conn.execute(sql)
                have = {r["name"] for r in conn.execute("PRAGMA table_info(readings)")}
                for col, typ in EXTRA_COLUMNS.items():
                    if col not in have:
                        conn.execute(f"ALTER TABLE readings ADD COLUMN {col} {typ}")
                # indeks dibuat setelah migrasi karena memakai kolom received_at
                conn.execute("CREATE INDEX IF NOT EXISTS idx_readings_recv ON readings(device, received_at)")
                if not conn.execute("SELECT 1 FROM devices LIMIT 1").fetchall():
                    conn.execute(BACKFILL_DEVICES)
        finally:
            conn.close()
    except Exception:
        _ready = False
        raise
