// Helper domain kualitas udara + format angka/waktu. Ambang dibaca dari /api/config.

export const PARAM_KEYS = ["co2", "pm25", "temp", "rh"];

export const PARAM_COLOR = {
  co2: "var(--c-co2)",
  pm25: "var(--c-pm25)",
  temp: "var(--c-temp)",
  rh: "var(--c-rh)",
};

export const SOURCES = [
  { value: "min_valid", label: "Per menit · tervalidasi" },
  { value: "min_raw", label: "Per menit · mentah" },
  { value: "hour_device", label: "Per jam · dari perangkat" },
  { value: "hour_calc", label: "Per jam · dihitung dari data menit" },
];

export const RANGES = [
  { h: 1, l: "1 jam" },
  { h: 6, l: "6 jam" },
  { h: 24, l: "24 jam" },
  { h: 168, l: "7 hari" },
  { h: 720, l: "30 hari" },
];

// ------------------------------------------------------------------ level
export function levelOf(cfg, p, v) {
  if (v == null || !cfg) return null;
  for (const r of cfg.params[p].ranges) {
    if ((r.from == null || v > r.from) && (r.to == null || v <= r.to)) return r.level;
  }
  return null;
}

export function levelLabel(cfg, p, level) {
  if (level == null || !cfg) return "—";
  const custom = cfg.params[p].labels;
  if (custom && level < custom.length) return custom[level];
  return cfg.levels[level].label;
}

// ------------------------------------------------------------------ angka
export function fmt(v, d = 1) {
  if (v == null || Number.isNaN(v)) return "—";
  return Number(v).toLocaleString("id-ID", { minimumFractionDigits: d, maximumFractionDigits: d });
}

export function fmtSigned(v, d = 1) {
  if (v == null) return "—";
  const s = fmt(Math.abs(v), d);
  return (v > 0 ? "+" : v < 0 ? "−" : "") + s;
}

// ------------------------------------------------------------------ waktu
// Server mengirim waktu lokal tanpa zona ("2026-10-23 16:36:00"). Kita anggap itu
// sebagai UTC lalu tampilkan juga sebagai UTC, jadi jam yang tampil sama persis dengan jam ESP32.
export const toMs = (s) => Date.parse(s.replace(" ", "T") + "Z");

const MON = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const p2 = (n) => String(n).padStart(2, "0");

export const fmtHM = (ms) => {
  const d = new Date(ms);
  return `${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}`;
};
export const fmtDM = (ms) => {
  const d = new Date(ms);
  return `${d.getUTCDate()} ${MON[d.getUTCMonth()]}`;
};
export const fmtFull = (ms) => `${fmtDM(ms)} ${fmtHM(ms)}`;

export function fmtAxis(ms, span) {
  const d = new Date(ms);
  const midnight = d.getUTCHours() === 0 && d.getUTCMinutes() === 0;
  if (span <= 36 * 3600e3) return fmtHM(ms);
  if (span <= 8 * 86400e3) return midnight ? fmtDM(ms) : fmtHM(ms);
  return fmtDM(ms);
}

const TICK_STEPS = [10, 30, 60, 120, 180, 360, 720, 1440, 2880, 10080].map((m) => m * 60000);
export function makeTicks(lo, hi, target = 6) {
  const span = hi - lo;
  if (!(span > 0)) return [lo];
  const step = TICK_STEPS.find((s) => span / s <= target) ?? TICK_STEPS[TICK_STEPS.length - 1];
  const out = [];
  for (let t = Math.ceil(lo / step) * step; t <= hi; t += step) out.push(t);
  return out;
}

export function relTime(sec) {
  if (sec == null) return "—";
  if (sec < 45) return "baru saja";
  const m = Math.round(sec / 60);
  if (m < 60) return `${m} menit lalu`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} jam ${m % 60 ? `${m % 60} menit ` : ""}lalu`;
  return `${Math.floor(h / 24)} hari lalu`;
}

export function fmtDuration(min) {
  if (min < 60) return `${min} menit`;
  const h = Math.floor(min / 60);
  return `${h} jam${min % 60 ? ` ${min % 60} menit` : ""}`;
}

// ------------------------------------------------------------------ skala sumbu Y
export function niceScale(lo, hi, count = 5) {
  const span = hi - lo || 1;
  const raw = span / (count - 1);
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  const f = raw / pow;
  const step = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * pow;
  const a = Math.floor(lo / step + 1e-9) * step;
  const b = Math.ceil(hi / step - 1e-9) * step;
  const ticks = [];
  for (let v = a; v <= b + step / 2; v += step) ticks.push(+v.toFixed(10));
  return { domain: [ticks[0], ticks[ticks.length - 1]], ticks };
}

// Sisipkan titik kosong di jeda data supaya garis terputus, bukan menyambung palsu.
export function withGaps(rows, gapMs, keys) {
  if (!gapMs) return rows;
  const out = [];
  for (let i = 0; i < rows.length; i++) {
    if (i > 0 && rows[i].t - rows[i - 1].t > gapMs) {
      const g = { t: rows[i - 1].t + gapMs / 2 };
      keys.forEach((k) => (g[k] = null));
      out.push(g);
    }
    out.push(rows[i]);
  }
  return out;
}

// Ambang untuk garis referensi grafik: batas antar rentang yang levelnya berbeda.
export function thresholdLines(cfg, p) {
  if (!cfg) return [];
  const rs = cfg.params[p].ranges;
  const out = [];
  for (let i = 0; i < rs.length - 1; i++) {
    const a = rs[i], b = rs[i + 1];
    if (a.level !== b.level) out.push({ y: a.to, level: Math.max(a.level, b.level) });
  }
  return out;
}

// Keterangan ambang untuk legenda: "Tidak sehat > 1.000", "Tidak nyaman < 20"
export function thresholdNotes(cfg, p) {
  if (!cfg) return [];
  const meta = cfg.params[p];
  const d = meta.digits;
  return meta.ranges
    .filter((r) => r.level > 0)
    .map((r) => {
      const label = levelLabel(cfg, p, r.level);
      if (r.from != null && r.to != null) return { level: r.level, text: `${label} ${fmt(r.from, 0)}–${fmt(r.to, 0)}` };
      if (r.from != null) return { level: r.level, text: `${label} > ${fmt(r.from, d === 0 ? 0 : 0)}` };
      return { level: r.level, text: `${label} < ${fmt(r.to, 0)}` };
    });
}

// ------------------------------------------------------------------ log
// INFO memakai bentuk kosong (netral), WARN segitiga kuning, ERROR kotak merah.
export const LOG_SHAPE = { INFO: null, WARN: 1, ERROR: 3 };

export const EVENT_LABEL = {
  ingest: "Data masuk",
  duplicate: "Kiriman ganda diabaikan",
  backfill: "Data tertunda diterima",
  gap: "Jeda data",
  sensor_fault: "Sensor gagal baca",
  validation_reject: "Ditolak validasi",
  hour_incomplete: "Rata-rata jam tidak lengkap",
  level_change: "Perubahan kategori",
  device_offline: "Perangkat offline",
  device_online: "Perangkat online lagi",
  invalid_payload: "Paket tidak valid",
  server_start: "Server dimulai",
};

export const eventLabel = (e) => EVENT_LABEL[e] || e;

export function rssiLabel(rssi) {
  if (rssi == null) return "—";
  if (rssi >= -60) return "Kuat";
  if (rssi >= -70) return "Cukup";
  return "Lemah";
}
