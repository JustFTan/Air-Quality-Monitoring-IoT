"""Backend dashboard kualitas udara: FastAPI + SQLite (lokal) atau Turso (Vercel).

Menerima paket JSON dari ESP32 (format makeJson() di Send.h, tidak perlu diubah),
menyimpan data per 2 menit (raw & validated) dan per jam (1h_valid), serta
mencatat semua kejadian penting ke tabel logs.
"""
import asyncio
import csv
import io
import json
import os
import sys
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import Body, FastAPI, HTTPException, Query, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))  # agar `import aq, db` jalan di Vercel

import aq  # noqa: E402
import db  # noqa: E402

TZ_OFFSET = int(os.getenv("TZ_OFFSET_HOURS", "7"))        # WIB
OFFLINE_AFTER_S = int(os.getenv("OFFLINE_AFTER_S", "360"))  # 3x interval 2 menit
LOG_KEEP = int(os.getenv("LOG_KEEP", "5000" if db.REMOTE else "50000"))

FMT = "%Y-%m-%d %H:%M:%S"
TYPES = ("2m_raw", "2m_validated", "1h_valid")
PARAMS = aq.PARAM_KEYS
FIELD = {"co2": "CO2v_1", "pm25": "PM25v_1", "temp": "Tempinv_1", "rh": "Humidinv_1"}
INTERVAL_S = {"2m_raw": 120, "2m_validated": 120, "1h_valid": 3600}
GAP_S = 210  # lebih dari ini antar dua data 2-menit dianggap ada jeda

# Status online dan status pencatatan perubahan kategori disimpan di database (tabel devices dan
# level_state), bukan di memori, karena server di Vercel bisa berpindah instance di tiap request.
LEVEL_CONFIRM = 3         # level baru harus bertahan 3 pembacaan (6 menit) sebelum dicatat
LEVEL_MIN_GAP = timedelta(minutes=30)  # jarak minimal antar catatan perubahan untuk parameter yang sama

EVENTS = ["backfill", "device_offline", "device_online", "duplicate", "gap", "hour_incomplete", "ingest",
          "invalid_payload", "level_change", "sensor_fault", "server_start", "validation_reject"]
QUIET_EVENTS = ("ingest", "backfill", "duplicate")  # tidak ditampilkan di "peristiwa terbaru" Ringkasan


# ---------------------------------------------------------------- util waktu
def now_local() -> datetime:
    return (datetime.now(timezone.utc) + timedelta(hours=TZ_OFFSET)).replace(tzinfo=None, microsecond=0)


def s(dt: datetime) -> str:
    return dt.strftime(FMT)


def parse(text: str) -> datetime:
    return datetime.strptime(text, FMT)


def num(v):
    """ESP32 mengirim angka sebagai string dan 'NULL' untuk data tidak valid."""
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    return f if f == f and abs(f) != float("inf") else None


def flag(v):
    return None if v is None else (1 if str(v) == "1" else 0)


def log(conn, level, event, message, device=None, type_=None, payload=None, ts=None):
    conn.defer(  # di Turso dikirim bersama tulisan lain dalam satu permintaan
        "INSERT INTO logs(ts,level,event,device,type,message,payload) VALUES (?,?,?,?,?,?,?)",
        (ts or s(now_local()), level, event, device, type_, message, payload),
    )


def describe(vals) -> str:
    out = []
    for p in PARAMS:
        meta = aq.PARAMS[p]
        v = vals.get(p)
        out.append(f"{meta['label']} " + ("NULL" if v is None else f"{v:.{meta['digits']}f} {meta['unit']}"))
    return ", ".join(out)


# ---------------------------------------------------------------- aplikasi
def check_devices(conn):
    """Catat device_offline saat data berhenti lebih dari OFFLINE_AFTER_S.

    Tidak ada proses latar belakang (Vercel tidak punya), jadi dipanggil tiap ada request
    (kirim data atau buka dashboard). Waktu di log dibuat sama dengan saat seharusnya terdeteksi.
    Pertama kali perangkat terlihat hanya merekam status awal tanpa log.
    """
    now = now_local()
    for r in conn.execute("SELECT device, last_seen, online FROM devices").fetchall():
        if not r["last_seen"]:
            continue
        last = parse(r["last_seen"])
        online = (now - last).total_seconds() <= OFFLINE_AFTER_S
        if r["online"] is None:
            conn.execute("UPDATE devices SET online=? WHERE device=? AND online IS NULL",
                         (int(online), r["device"]))
        elif r["online"] == 1 and not online:
            # UPDATE bersyarat: kalau dua request bersamaan, hanya satu yang menulis log
            if conn.execute("UPDATE devices SET online=0 WHERE device=? AND online=1",
                            (r["device"],)).rowcount == 1:
                secs = OFFLINE_AFTER_S
                log(conn, "ERROR", "device_offline",
                    f"Tidak ada data masuk selama {secs // 60} menit. Perangkat dianggap offline."
                    if secs >= 120 else f"Tidak ada data masuk selama {secs} detik. Perangkat dianggap offline.",
                    device=r["device"], ts=s(last + timedelta(seconds=secs)))


def prune_logs(conn):
    conn.defer("DELETE FROM logs WHERE id <= (SELECT COALESCE(MAX(id),0) - ? FROM logs)", (LOG_KEEP,))


async def monitor():
    """Hanya untuk mode lokal: cek offline tiap 30 detik walau tidak ada yang membuka dashboard."""
    n = 0
    while True:
        await asyncio.sleep(30)
        try:
            with db.connect() as conn:
                check_devices(conn)
                n += 1
                if n % 120 == 0:  # tiap ~1 jam
                    prune_logs(conn)
        except Exception as exc:  # jangan matikan loop
            print("monitor error:", exc)


@asynccontextmanager
async def lifespan(_app):
    task = None
    if not db.REMOTE:
        with db.connect() as conn:
            check_devices(conn)
            prune_logs(conn)
            log(conn, "INFO", "server_start", "Server dashboard dimulai.")
        task = asyncio.create_task(monitor())
    yield
    if task:
        task.cancel()


app = FastAPI(title="Air Quality Dashboard API", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


# ---------------------------------------------------------------- ingest
@app.post("/api/post", status_code=201)
def receive(response: Response, data: dict = Body(...)):
    raw = json.dumps(data, ensure_ascii=False)[:2000]
    with db.connect() as conn:
        check_devices(conn)  # kalau perangkat sempat mati, catat dulu sebelum data baru ini diproses
        try:
            type_, device = str(data["device_1"]).split("-", 1)
            created = parse(str(data["created_at_1"]))
            if type_ not in TYPES:
                raise ValueError(f"type '{type_}' tidak dikenal")
        except (KeyError, ValueError, TypeError) as exc:
            log(conn, "ERROR", "invalid_payload",
                f"Paket ditolak ({type(exc).__name__}: {exc}). Cek device_1 dan created_at_1.",
                payload=raw)
            raise HTTPException(422, "device_1 / created_at_1 tidak valid")

        ts = s(created)
        vals = {p: num(data.get(FIELD[p])) for p in PARAMS}
        rssi = num(data.get("RSSI_1"))

        prev = conn.execute(
            "SELECT created_at, co2, pm25, temp, rh FROM readings WHERE device=? AND type=? "
            "ORDER BY created_at DESC LIMIT 1", (device, type_)).fetchone()

        cur = conn.execute(
            "INSERT OR IGNORE INTO readings(type,device,created_at,co2,pm25,temp,rh,rssi,uptime,"
            "pm_ok,sht_ok,sd_ok,received_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
            (type_, device, ts, vals["co2"], vals["pm25"], vals["temp"], vals["rh"],
             int(rssi) if rssi is not None else None, str(data.get("Uptime_1", "")) or None,
             flag(data.get("PM25_status_1")), flag(data.get("SHT_status_1")),
             flag(data.get("SD_status_1")), s(now_local())))

        if cur.rowcount == 0:
            log(conn, "INFO", "duplicate",
                f"Data {type_} {ts} sudah ada, kiriman ulang diabaikan (tidak dobel).",
                device, type_, raw)
            response.status_code = 200
            return {"status": "duplicate"}

        # --- ringkasan perangkat; kalau sebelumnya offline, catat kembali online
        was = conn.execute("SELECT online FROM devices WHERE device=?", (device,)).fetchone()
        if was is not None and was["online"] == 0:
            log(conn, "INFO", "device_online", "Perangkat kembali mengirim data.", device)
        conn.defer(
            "INSERT INTO devices(device,last_seen,first_data,last_data,total,raw,validated,hourly,online) "
            "VALUES (?,?,?,?,1,?,?,?,1) ON CONFLICT(device) DO UPDATE SET last_seen=excluded.last_seen, "
            "first_data=MIN(COALESCE(first_data,excluded.first_data), excluded.first_data), "
            "last_data=MAX(COALESCE(last_data,excluded.last_data), excluded.last_data), "
            "total=total+1, raw=raw+excluded.raw, validated=validated+excluded.validated, "
            "hourly=hourly+excluded.hourly, online=1",
            (device, s(now_local()), ts, ts, int(type_ == "2m_raw"), int(type_ == "2m_validated"),
             int(type_ == "1h_valid")))
        if type_ == "1h_valid":
            prune_logs(conn)  # sekali per jam

        # --- urutan waktu: normal, terlambat (backfill), atau ada jeda
        interval = INTERVAL_S[type_]
        late_min = (now_local() - created).total_seconds() / 60
        in_order = prev is None or prev["created_at"] < ts
        if not in_order or late_min > (interval / 60) * 2.5 + 3:
            log(conn, "INFO", "backfill",
                f"Data tertunda {ts} (terlambat {int(late_min)} menit): {describe(vals)}",
                device, type_, raw)
        else:
            log(conn, "INFO", "ingest", f"Data {ts}: {describe(vals)}", device, type_, raw)

        if prev and in_order:
            gap = (created - parse(prev["created_at"])).total_seconds()
            limit = GAP_S if interval == 120 else interval * 1.1
            if gap > limit:
                log(conn, "WARN", "gap",
                    f"Jeda data {type_}: {int(gap // 60)} menit antara {prev['created_at']} dan {ts}.",
                    device, type_)

        # --- nilai kosong
        nulls = [aq.PARAMS[p]["label"] for p in PARAMS if vals[p] is None]
        if nulls:
            if type_ == "2m_raw":
                log(conn, "ERROR", "sensor_fault", f"Sensor gagal membaca: {', '.join(nulls)}.", device, type_)
            elif type_ == "2m_validated":
                log(conn, "WARN", "validation_reject",
                    f"Nilai ditolak validasi edge (range/outlier): {', '.join(nulls)}.", device, type_)
            else:
                log(conn, "WARN", "hour_incomplete",
                    f"Rata-rata jam {ts} tidak valid untuk: {', '.join(nulls)}.", device, type_)

        # --- perubahan kategori (hanya data tervalidasi yang berurutan)
        if type_ == "2m_validated" and prev and in_order:
            states = {r["param"]: r for r in conn.execute(
                "SELECT param, shown, cand, count, last_log FROM level_state WHERE device=?", (device,))}
            for p in PARAMS:
                pv, nv = prev[p], vals[p]
                if pv is None or nv is None:
                    continue
                st = states.get(p)
                shown = st["shown"] if st else aq.level_of(p, pv)  # level terakhir yang dicatat
                cand = st["cand"] if st else None
                count = st["count"] if st else 0
                last = parse(st["last_log"]) if st and st["last_log"] else None
                ln = aq.level_of(p, nv)
                if ln == shown:
                    new = (shown, None, 0, last)
                else:
                    c = count + 1 if cand == ln else 1
                    if c < LEVEL_CONFIRM or (last and created - last < LEVEL_MIN_GAP):
                        new = (shown, ln, c, last)  # tahan dulu supaya tidak bolak-balik di sekitar ambang
                    else:
                        meta = aq.PARAMS[p]
                        log(conn, "WARN" if ln >= 2 else "INFO", "level_change",
                            f"{meta['label']} berubah: {aq.label_of(p, shown)} → {aq.label_of(p, ln)} "
                            f"({nv:.{meta['digits']}f} {meta['unit']})", device, type_)
                        new = (ln, None, 0, created)
                if st is None or new != (st["shown"], st["cand"], st["count"], last):
                    conn.defer(
                        "INSERT INTO level_state(device,param,shown,cand,count,last_log) VALUES (?,?,?,?,?,?) "
                        "ON CONFLICT(device,param) DO UPDATE SET shown=excluded.shown, cand=excluded.cand, "
                        "count=excluded.count, last_log=excluded.last_log",
                        (device, p, new[0], new[1], new[2], s(new[3]) if new[3] else None))
    return {"status": "ok"}


# ---------------------------------------------------------------- helper query
def pick_device(conn, device):
    if device:
        return device
    r = conn.execute("SELECT device FROM devices ORDER BY last_seen DESC LIMIT 1").fetchone()
    return r["device"] if r else None


def latest_ts(conn, device, type_):
    return conn.execute("SELECT MAX(created_at) m FROM readings WHERE device=? AND type=?",
                        (device, type_)).fetchone()["m"]


def window(conn, device, type_, hours, start, end):
    """Rentang waktu: start/end eksplisit, atau N jam yang berakhir di data terbaru."""
    if end is None:
        end = latest_ts(conn, device, type_) or s(now_local())
    if start is None:
        start = s(parse(end) - timedelta(hours=hours if hours else 24))
    return start, end


def device_info(conn, device):
    r = conn.execute("SELECT last_seen FROM devices WHERE device=?", (device,)).fetchone()
    last = r["last_seen"] if r else None
    row = None
    for type_ in TYPES:  # data mentah dulu; kalau belum ada, jenis lain
        row = conn.execute(
            "SELECT rssi, uptime, pm_ok, sht_ok, sd_ok FROM readings WHERE device=? AND type=? "
            "ORDER BY created_at DESC LIMIT 1", (device, type_)).fetchone()
        if row:
            break
    age = (now_local() - parse(last)).total_seconds() if last else None
    return {
        "last_seen": last,
        "age_s": int(age) if age is not None else None,
        "online": age is not None and age <= OFFLINE_AFTER_S,
        "rssi": row["rssi"] if row else None,
        "uptime": row["uptime"] if row else None,
        "sensors": {"pm": row["pm_ok"], "sht": row["sht_ok"], "sd": row["sd_ok"]} if row else {},
    }


# ---------------------------------------------------------------- endpoint baca
@app.get("/api/health")
def health():
    return {"status": "ok", "server_time": s(now_local())}


@app.get("/api/config")
def config():
    return aq.config()


@app.get("/api/devices")
def devices():
    with db.connect() as conn:
        check_devices(conn)
        rows = conn.execute(
            "SELECT device, last_seen, total, raw, validated, hourly, first_data, last_data "
            "FROM devices ORDER BY last_seen DESC").fetchall()
        out = [{**dict(r), **device_info(conn, r["device"])} for r in rows]
    return {"server_time": s(now_local()), "devices": out}


def _avg(vals):
    vals = [v for v in vals if v is not None]
    return sum(vals) / len(vals) if vals else None


@app.get("/api/overview")
def overview(device: Optional[str] = None):
    with db.connect() as conn:
        check_devices(conn)
        device = pick_device(conn, device)
        if not device:
            return {"device": None}
        src = "2m_validated"
        end_s = latest_ts(conn, device, src)
        if not end_s:
            src = "2m_raw"
            end_s = latest_ts(conn, device, src)
        out = {"device": device, "source": src, "server_time": s(now_local()), **device_info(conn, device)}
        notable = [e for e in EVENTS if e not in QUIET_EVENTS]
        events = conn.execute(
            f"SELECT id, ts, level, event, type, message FROM logs WHERE event IN ({','.join('?' * len(notable))}) "
            "AND device=? ORDER BY id DESC LIMIT 6", (*notable, device)).fetchall()
        out["events"] = [dict(e) for e in events]
        if not end_s:
            return {**out, "latest": {}, "stats": {}, "cells": [], "quality": None, "ispu": None, "overall": None}

        end = parse(end_s)
        start = end - timedelta(hours=24)
        rows = [dict(r) for r in conn.execute(
            "SELECT created_at, co2, pm25, temp, rh FROM readings WHERE device=? AND type=? "
            "AND created_at>? AND created_at<=? ORDER BY created_at", (device, src, s(start), end_s))]
        for r in rows:
            r["dt"] = parse(r["created_at"])

        # nilai terbaru, delta 1 jam, statistik 24 jam
        latest, stats = {}, {}
        for p in PARAMS:
            meta = aq.PARAMS[p]
            series = [(r["dt"], r[p]) for r in rows if r[p] is not None]
            vals = [v for _, v in series]
            stats[p] = ({"min": min(vals), "max": max(vals), "avg": sum(vals) / len(vals), "n": len(vals)}
                        if vals else None)
            if series:
                t, v = series[-1]
                ref = _avg([x for tt, x in series if t - timedelta(minutes=70) <= tt <= t - timedelta(minutes=50)])
                lv = aq.level_of(p, v)
                latest[p] = {"value": v, "t": s(t), "level": lv, "label": aq.label_of(p, lv),
                             "delta_1h": (v - ref) if ref is not None else None}
            else:
                latest[p] = None

        # jalur 24 jam: 96 sel @15 menit, level = parameter terburuk
        origin = end.replace(minute=(end.minute // 15) * 15, second=0)
        first_cell = origin - timedelta(minutes=15 * 95)
        buckets = [[] for _ in range(96)]
        for r in rows:
            k = int((r["dt"] - first_cell).total_seconds() // 900)
            if 0 <= k < 96:
                buckets[k].append(r)
        cells = []
        for i, b in enumerate(buckets):
            avgs = {p: _avg([r[p] for r in b]) for p in PARAMS}
            lvls = {p: aq.level_of(p, v) for p, v in avgs.items() if v is not None}
            worst = max(lvls, key=lambda p: lvls[p]) if lvls else None
            cells.append({"t": s(first_cell + timedelta(minutes=15 * i))[:16], "n": len(b), "v": avgs,
                          "level": lvls[worst] if worst else None, "worst": worst})

        # kelengkapan data
        first_dt = rows[0]["dt"] if rows else end
        span_s = (end - max(start, first_dt)).total_seconds()
        expected = 720 if first_dt <= start + timedelta(minutes=2) else int(span_s // 120) + 1
        gaps = []
        for a, b in zip(rows, rows[1:]):
            d = (b["dt"] - a["dt"]).total_seconds()
            if d > GAP_S:
                gaps.append({"from": a["created_at"], "to": b["created_at"], "minutes": int(d // 60)})
        quality = {
            "expected": expected,
            "received": len(rows),
            "completeness": round(100 * min(len(rows), expected) / expected, 1) if expected else None,
            "nulls": {p: sum(1 for r in rows if r[p] is None) for p in PARAMS},
            "gap_count": len(gaps),
            "gap_minutes": sum(g["minutes"] for g in gaps),
            "gaps": list(reversed(gaps))[:4],
        }

        # level keseluruhan = parameter terburuk saat ini
        lv = {p: latest[p]["level"] for p in PARAMS if latest[p]}
        worst = max(lv, key=lambda p: lv[p]) if lv else None
        ispu_now = aq.ispu_pm25(latest["pm25"]["value"]) if latest["pm25"] else None
        ispu_avg = aq.ispu_pm25(stats["pm25"]["avg"]) if stats["pm25"] else None
        return {
            **out,
            "window_end": end_s,
            "latest": latest,
            "stats": stats,
            "cells": cells,
            "quality": quality,
            "overall": {"level": lv[worst], "worst": worst} if worst else None,
            "ispu": {"now": ispu_now, "now_level": aq.ispu_level(ispu_now),
                     "avg24": ispu_avg, "avg24_level": aq.ispu_level(ispu_avg)},
        }


@app.get("/api/readings")
def readings(
    device: Optional[str] = None,
    type: str = "2m_validated",
    hours: Optional[float] = None,
    start: Optional[str] = None,
    end: Optional[str] = None,
    bucket: int = Query(0, ge=0, le=1440, description="rata-rata per N menit; 0 = data asli"),
    limit: int = Query(5000, ge=1, le=20000),
    offset: int = Query(0, ge=0),
    order: str = "asc",
):
    if type not in TYPES:
        raise HTTPException(422, "type tidak dikenal")
    direction = "DESC" if order.lower() == "desc" else "ASC"
    with db.connect() as conn:
        device = pick_device(conn, device)
        if not device:
            return {"device": None, "total": 0, "items": []}
        lo, hi = window(conn, device, type, hours, start, end)
        where = "device=? AND type=? AND created_at>? AND created_at<=?"
        args = (device, type, lo, hi)
        if bucket > 1:
            b = bucket * 60
            key = f"CAST(strftime('%s',created_at) AS INTEGER)/{b}"
            total = conn.execute(f"SELECT COUNT(*) c FROM (SELECT 1 FROM readings WHERE {where} GROUP BY {key})",
                                 args).fetchone()["c"]
            rows = conn.execute(
                f"SELECT datetime(({key})*{b},'unixepoch') created_at, AVG(co2) co2, AVG(pm25) pm25, "
                f"AVG(temp) temp, AVG(rh) rh, COUNT(*) n FROM readings WHERE {where} "
                f"GROUP BY {key} ORDER BY 1 {direction} LIMIT ? OFFSET ?", (*args, limit, offset)).fetchall()
            items = [{**dict(r), **{p: (round(r[p], 2) if r[p] is not None else None) for p in PARAMS},
                      "type": type, "device": device} for r in rows]
        else:
            total = conn.execute(f"SELECT COUNT(*) c FROM readings WHERE {where}", args).fetchone()["c"]
            rows = conn.execute(
                f"SELECT type, device, created_at, co2, pm25, temp, rh, rssi, pm_ok, sht_ok, sd_ok, received_at "
                f"FROM readings WHERE {where} ORDER BY created_at {direction} LIMIT ? OFFSET ?",
                (*args, limit, offset)).fetchall()
            items = [dict(r) for r in rows]
    return {"device": device, "type": type, "start": lo, "end": hi, "total": total, "items": items}


@app.get("/api/stats")
def stats(device: Optional[str] = None, type: str = "2m_validated", hours: float = 24):
    with db.connect() as conn:
        device = pick_device(conn, device)
        if not device:
            return {"device": None, "params": {}}
        lo, hi = window(conn, device, type, hours, None, None)
        rows = conn.execute(
            "SELECT co2, pm25, temp, rh FROM readings WHERE device=? AND type=? AND created_at>? AND created_at<=?",
            (device, type, lo, hi)).fetchall()
    out = {}
    for p in PARAMS:
        vals = [r[p] for r in rows if r[p] is not None]
        out[p] = {"min": min(vals) if vals else None, "max": max(vals) if vals else None,
                  "avg": sum(vals) / len(vals) if vals else None, "n": len(vals), "nulls": len(rows) - len(vals)}
    return {"device": device, "type": type, "start": lo, "end": hi, "rows": len(rows), "params": out}


@app.get("/api/hourly")
def hourly(device: Optional[str] = None, days: float = Query(7, gt=0, le=90)):
    """Rata-rata jam dari perangkat (1h_valid) dan hasil hitung ulang dari data 2 menit tervalidasi."""
    with db.connect() as conn:
        device = pick_device(conn, device)
        if not device:
            return {"device": None, "reported": [], "computed": []}
        end = latest_ts(conn, device, "2m_validated") or latest_ts(conn, device, "1h_valid")
        if not end:
            return {"device": device, "reported": [], "computed": []}
        # batas jam penuh supaya jam pertama tidak terpotong
        lo = s(parse(end).replace(minute=0, second=0) - timedelta(days=days))
        reported = conn.execute(
            "SELECT created_at hour, co2, pm25, temp, rh FROM readings WHERE device=? AND type='1h_valid' "
            "AND created_at>=? ORDER BY created_at", (device, lo)).fetchall()
        computed = conn.execute(
            "SELECT substr(created_at,1,13)||':00:00' hour, AVG(co2) co2, AVG(pm25) pm25, AVG(temp) temp, "
            "AVG(rh) rh, COUNT(*) n, COUNT(co2) n_co2, COUNT(pm25) n_pm25, COUNT(temp) n_temp, COUNT(rh) n_rh "
            "FROM readings WHERE device=? AND type='2m_validated' AND created_at>=? "
            "GROUP BY 1 ORDER BY 1", (device, lo)).fetchall()
    rnd = lambda r: {k: (round(v, 2) if isinstance(v, float) else v) for k, v in dict(r).items()}
    return {"device": device, "start": lo, "end": end,
            "reported": [rnd(r) for r in reported], "computed": [rnd(r) for r in computed]}


@app.get("/api/logs")
def logs(
    level: Optional[str] = None,
    event: Optional[str] = None,
    device: Optional[str] = None,
    q: Optional[str] = None,
    hours: Optional[float] = None,
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
):
    base, args = [], []
    if device:
        base.append("(device=? OR device IS NULL)")
        args.append(device)
    if event:
        base.append("event=?")
        args.append(event)
    if hours:
        base.append("ts>=?")
        args.append(s(now_local() - timedelta(hours=hours)))
    if q:
        base.append("(message LIKE ? OR event LIKE ? OR payload LIKE ?)")
        args += [f"%{q}%"] * 3
    where_base = ("WHERE " + " AND ".join(base)) if base else ""

    cond, cargs = list(base), list(args)
    lv = []
    if level:
        lv = [x for x in level.upper().split(",") if x in ("INFO", "WARN", "ERROR")]
        if lv:
            cond.append(f"level IN ({','.join('?' * len(lv))})")
            cargs += lv
        else:  # tidak ada level valid dipilih -> tidak ada hasil
            cond.append("1=0")
    where = ("WHERE " + " AND ".join(cond)) if cond else ""

    with db.connect() as conn:
        check_devices(conn)
        # satu query hitung per tingkat; total halaman = jumlah tingkat yang dipilih (hemat baca di Turso)
        counts = {r["level"]: r["c"] for r in conn.execute(
            f"SELECT level, COUNT(*) c FROM logs {where_base} GROUP BY level", args)}
        chosen = lv if level else ["INFO", "WARN", "ERROR"]
        total = sum(counts.get(k, 0) for k in chosen) if chosen else 0
        items = conn.execute(
            f"SELECT id, ts, level, event, device, type, message, payload FROM logs {where} "
            f"ORDER BY id DESC LIMIT ? OFFSET ?", (*cargs, limit, offset)).fetchall() if total else []
    return {"total": total, "items": [dict(i) for i in items],
            "counts": {k: counts.get(k, 0) for k in ("INFO", "WARN", "ERROR")}, "events": EVENTS}


@app.get("/api/export.csv")
def export_csv(
    device: Optional[str] = None,
    type: str = "2m_validated",
    hours: Optional[float] = None,
    start: Optional[str] = None,
    end: Optional[str] = None,
):
    if type not in TYPES:
        raise HTTPException(422, "type tidak dikenal")
    with db.connect() as conn:
        device = pick_device(conn, device)
        lo, hi = window(conn, device, type, hours, start, end) if device else (None, None)
        rows = conn.execute(
            "SELECT created_at, co2, pm25, temp, rh, rssi, pm_ok, sht_ok FROM readings "
            "WHERE device=? AND type=? AND created_at>? AND created_at<=? ORDER BY created_at",
            (device, type, lo, hi)).fetchall() if device else []

    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["created_at", "co2_ppm", "pm25_ugm3", "temp_c", "rh_pct", "rssi", "pm_ok", "sht_ok"])
    for r in rows:
        w.writerow(["" if r[k] is None else r[k] for k in r.keys()])
    name = f"{device or 'data'}_{type}.csv"
    return StreamingResponse(iter([buf.getvalue()]), media_type="text/csv",
                             headers={"Content-Disposition": f'attachment; filename="{name}"'})
