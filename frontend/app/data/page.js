"use client";
import { useState } from "react";
import { useApp } from "@/components/AppContext";
import { useApi, apiUrl } from "@/lib/api";
import { PARAM_KEYS, fmt, levelOf, levelLabel } from "@/lib/aq";
import { Empty, Segmented, StatusShape } from "@/components/ui";
import Icon from "@/components/Icon";

const TYPES = [
  { value: "2m_validated", label: "Per menit · tervalidasi" },
  { value: "2m_raw", label: "Per menit · mentah" },
  { value: "1h_valid", label: "Per jam" },
];
const PRESETS = [
  { value: "1", label: "1 jam" },
  { value: "6", label: "6 jam" },
  { value: "24", label: "24 jam" },
  { value: "168", label: "7 hari" },
  { value: "720", label: "30 hari" },
  { value: "custom", label: "Kustom" },
];
const PAGE_SIZES = [50, 100, 200];

const toApiTime = (v) => (v ? v.replace("T", " ") + (v.length === 16 ? ":00" : "") : undefined);

function ValCell({ p, v, cfg }) {
  if (v == null) return <span className="nullv">NULL</span>;
  const meta = cfg.params[p];
  const lv = levelOf(cfg, p, v);
  return (
    <span className="vcell" title={`${levelLabel(cfg, p, lv)} (${fmt(v, meta.digits)} ${meta.unit})`}>
      {fmt(v, meta.digits)}
      <StatusShape level={lv} size={10} />
      <span className="sr">{levelLabel(cfg, p, lv)}</span>
    </span>
  );
}

export default function DataPage() {
  const { cfg, device, devicesLoading, poll } = useApp();
  const [type, setType] = useState("2m_validated");
  const [preset, setPreset] = useState("24");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [size, setSize] = useState(100);
  const [page, setPage] = useState(0);
  const [order, setOrder] = useState("desc");

  const range = preset === "custom" ? { start: toApiTime(from), end: toApiTime(to) } : { hours: Number(preset) };
  const q = useApi(
    device ? "/api/readings" : null,
    { device, type, ...range, limit: size, offset: page * size, order },
    { interval: page === 0 ? poll : 0 }
  );
  const upd = (fn) => (v) => { fn(v); setPage(0); };

  if (!cfg || devicesLoading) return <p className="muted">Memuat…</p>;
  if (!device) return <Empty title="Belum ada data masuk">Tabel akan terisi setelah perangkat mengirim data.</Empty>;

  const d = q.data;
  const total = d?.total ?? 0;
  const first = total ? page * size + 1 : 0;
  const last = Math.min(total, (page + 1) * size);
  const isHour = type === "1h_valid";

  return (
    <>
      <div className="filters">
        <div className="field">
          <label htmlFor="type">Jenis data</label>
          <select id="type" className="select" value={type} onChange={(e) => upd(setType)(e.target.value)}>
            {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
        <div className="field">
          <span className="lab">Rentang</span>
          <Segmented label="Rentang waktu" value={preset} onChange={upd(setPreset)} options={PRESETS} />
        </div>
        {preset === "custom" && (
          <>
            <div className="field">
              <label htmlFor="from">Dari</label>
              <input id="from" type="datetime-local" className="input" value={from} onChange={(e) => upd(setFrom)(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="to">Sampai</label>
              <input id="to" type="datetime-local" className="input" value={to} onChange={(e) => upd(setTo)(e.target.value)} />
            </div>
          </>
        )}
        <div className="field">
          <span className="lab">Urutan</span>
          <Segmented
            label="Urutan waktu" value={order} onChange={upd(setOrder)}
            options={[{ value: "desc", label: "Terbaru dulu" }, { value: "asc", label: "Terlama dulu" }]}
          />
        </div>
        <a className="btn" style={{ marginLeft: "auto" }} href={apiUrl("/api/export.csv", { device, type, ...range })}>
          <Icon name="download" size={16} /> Unduh CSV
        </a>
      </div>

      <div className={`tablewrap${q.fetching ? " dim" : ""}`} style={{ maxHeight: "68vh" }}>
        <table className="t">
          <thead>
            <tr>
              <th>Waktu</th>
              {PARAM_KEYS.map((p) => (
                <th key={p}>{cfg.params[p].label} <span className="muted" style={{ fontWeight: 400 }}>{cfg.params[p].unit}</span></th>
              ))}
              <th>RSSI</th>
              <th className="l">Sensor</th>
              <th className="l">Diterima server</th>
            </tr>
          </thead>
          <tbody>
            {d?.items.map((r) => (
              <tr key={`${r.type}${r.created_at}`}>
                <td>{r.created_at}</td>
                {PARAM_KEYS.map((p) => (
                  <td key={p}><ValCell p={p} v={r[p]} cfg={cfg} /></td>
                ))}
                <td>{r.rssi ?? "—"}</td>
                <td className="l">
                  <span className="row" style={{ gap: 10 }}>
                    <span className="row" style={{ gap: 4 }} title="Sensor PM2.5"><StatusShape level={r.pm_ok == null ? null : r.pm_ok ? 0 : 3} size={10} />PM</span>
                    <span className="row" style={{ gap: 4 }} title="Sensor SHT31 (suhu & kelembapan)"><StatusShape level={r.sht_ok == null ? null : r.sht_ok ? 0 : 3} size={10} />SHT</span>
                  </span>
                </td>
                <td className="l muted">{r.received_at ?? "—"}</td>
              </tr>
            ))}
            {d && d.items.length === 0 && (
              <tr><td colSpan={9} className="l" style={{ padding: 28, textAlign: "center" }}>Tidak ada data pada rentang ini.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="pager">
        <button className="btn" disabled={page === 0} onClick={() => setPage((p) => p - 1)}><Icon name="left" size={16} /> Sebelumnya</button>
        <button className="btn" disabled={last >= total} onClick={() => setPage((p) => p + 1)}>Berikutnya <Icon name="right" size={16} /></button>
        <span className="note num">{fmt(first, 0)}–{fmt(last, 0)} dari {fmt(total, 0)} data{isHour ? " (per jam)" : ""}</span>
        <span className="grow" />
        <label className="note row" htmlFor="size">
          Baris per halaman
          <select id="size" className="select" value={size} onChange={(e) => { setSize(Number(e.target.value)); setPage(0); }}>
            {PAGE_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
      </div>
      <p className="note" style={{ marginTop: 10 }}>
        <code>NULL</code> berarti nilai ditolak validasi atau sensor gagal baca. Bentuk di samping angka menunjukkan kategori nilai tersebut.
      </p>
    </>
  );
}
