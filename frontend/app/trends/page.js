"use client";
import { useState } from "react";
import { useApp } from "@/components/AppContext";
import { useApi, apiUrl } from "@/lib/api";
import { useSeries } from "@/lib/useSeries";
import { PARAM_KEYS, PARAM_COLOR, SOURCES, RANGES, fmt, levelOf, levelLabel } from "@/lib/aq";
import { Empty, LevelChip, Segmented, Switch } from "@/components/ui";
import { ChartPanel } from "@/components/TimeChart";
import Icon from "@/components/Icon";

export default function Trends() {
  const { cfg, device, devicesLoading, poll } = useApp();
  const [source, setSource] = useState("min_valid");
  const [hours, setHours] = useState(24);
  const [params, setParams] = useState([...PARAM_KEYS]);
  const [compare, setCompare] = useState(false);
  const [thr, setThr] = useState(true);

  const isHour = source.startsWith("hour");
  const effHours = isHour ? Math.max(hours, 24) : hours;
  const s = useSeries({ device, source, hours: effHours, compareRaw: compare, poll });

  const statsType = source === "min_raw" ? "2m_raw" : source === "hour_device" ? "1h_valid" : "2m_validated";
  const st = useApi(device ? "/api/stats" : null, { device, type: statsType, hours: effHours }, { interval: poll });
  const exportType = statsType;

  if (!cfg || devicesLoading) return <p className="muted">Memuat…</p>;
  if (!device) return <Empty title="Belum ada data masuk">Jalankan ESP32 atau <code>python simulate.py</code> untuk mengisi data.</Empty>;

  const toggle = (p) => setParams((cur) => (cur.includes(p) ? (cur.length > 1 ? cur.filter((x) => x !== p) : cur) : PARAM_KEYS.filter((k) => cur.includes(k) || k === p)));
  const latestRow = s.rows.length ? s.rows[s.rows.length - 1] : null;

  return (
    <>
      <div className="filters">
        <div className="field">
          <label htmlFor="src">Sumber data</label>
          <select id="src" className="select" value={source} onChange={(e) => { setSource(e.target.value); if (e.target.value !== "min_valid") setCompare(false); }}>
            {SOURCES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div className="field">
          <span className="lab">Rentang</span>
          <Segmented
            label="Rentang waktu" value={String(effHours)} onChange={(v) => setHours(Number(v))}
            options={RANGES.filter((r) => !isHour || r.h >= 24).map((r) => ({ value: String(r.h), label: r.l }))}
          />
        </div>
        <div className="field">
          <span className="lab">Parameter</span>
          <div className="pchips">
            {PARAM_KEYS.map((p) => (
              <button key={p} type="button" className="pchip" aria-pressed={params.includes(p)} style={{ "--k": PARAM_COLOR[p] }} onClick={() => toggle(p)}>
                <i />
                {cfg.params[p].label}
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <span className="lab">Tampilan</span>
          <div className="row" style={{ gap: 18 }}>
            <Switch checked={compare} onChange={(v) => source === "min_valid" && setCompare(v)}>
              <span style={{ opacity: source === "min_valid" ? 1 : 0.5 }}>Bandingkan dengan data mentah</span>
            </Switch>
            <Switch checked={thr} onChange={setThr}>Garis ambang</Switch>
          </div>
        </div>
        <a className="btn" style={{ marginLeft: "auto" }} href={apiUrl("/api/export.csv", { device, type: exportType, hours: effHours })}>
          <Icon name="download" size={16} /> Unduh CSV
        </a>
      </div>

      <section className="tablewrap" style={{ marginBottom: 20 }} aria-label="Ringkasan statistik">
        <table className="t">
          <thead>
            <tr>
              <th>Parameter</th>
              <th>Terakhir</th>
              <th>Minimum</th>
              <th>Rata-rata</th>
              <th>Maksimum</th>
              <th>Data valid</th>
              <th>Ditolak/kosong</th>
            </tr>
          </thead>
          <tbody>
            {PARAM_KEYS.map((p) => {
              const meta = cfg.params[p];
              const x = st.data?.params?.[p];
              const last = latestRow?.[p];
              const lv = levelOf(cfg, p, last);
              return (
                <tr key={p}>
                  <td className="l">
                    <span className="row"><span className="key" style={{ "--k": PARAM_COLOR[p] }} />{meta.label} <span className="muted">{meta.unit}</span></span>
                  </td>
                  <td>
                    <span className="vcell">
                      {last != null ? <><b>{fmt(last, meta.digits)}</b><LevelChip level={lv} label={levelLabel(cfg, p, lv)} /></> : "—"}
                    </span>
                  </td>
                  <td>{fmt(x?.min, meta.digits)}</td>
                  <td>{fmt(x?.avg, meta.digits)}</td>
                  <td>{fmt(x?.max, meta.digits)}</td>
                  <td>{x ? fmt(x.n, 0) : "—"}</td>
                  <td>{x ? (x.nulls ? <span>{fmt(x.nulls, 0)} <span className="muted">({fmt((100 * x.nulls) / (x.n + x.nulls || 1), 1)}%)</span></span> : "0") : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <div className="charts2">
        {params.map((p) => {
          const meta = cfg.params[p];
          const lines = [{ key: p, label: compare ? "Tervalidasi" : meta.label, color: PARAM_COLOR[p] }];
          if (compare) lines.push({ key: `${p}_raw`, label: "Mentah (sebelum validasi)", color: "var(--raw)", thin: true });
          return (
            <ChartPanel
              key={`${p}-${source}-${effHours}-${compare}`}
              title={meta.label} unit={meta.unit} param={p} cfg={cfg} digits={meta.digits} height={260}
              rows={s.rows} gapMs={s.gapMs} fetching={s.fetching || s.loading} showThresholds={thr} series={lines}
            />
          );
        })}
      </div>
      {compare && (
        <p className="note" style={{ marginTop: 12 }}>
          Garis abu-abu adalah data mentah. Lonjakan yang ditolak validasi edge terlihat di sana, tapi tidak ada di garis tervalidasi.
          Nilai di luar skala grafik dipotong, nilai pastinya ada di tooltip.
        </p>
      )}
    </>
  );
}
