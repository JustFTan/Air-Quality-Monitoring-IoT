"use client";
import { useMemo, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { useApp } from "@/components/AppContext";
import { useApi } from "@/lib/api";
import { PARAM_KEYS, PARAM_COLOR, fmt, fmtFull, fmtDM, fmtHM, levelOf, levelLabel, niceScale, toMs } from "@/lib/aq";
import { Empty, LevelChip, Segmented } from "@/components/ui";
import Heatmap from "@/components/Heatmap";

const DAYS = [
  { value: "1", label: "1 hari" },
  { value: "3", label: "3 hari" },
  { value: "7", label: "7 hari" },
  { value: "14", label: "14 hari" },
];
const HOUR = 3600e3;
const keyOf = (ms) => new Date(ms).toISOString().slice(0, 13).replace("T", " ") + ":00:00";

function Tip({ active, payload, meta, cfg, param }) {
  if (!active || !payload?.length) return null;
  const r = payload[0].payload;
  const lv = levelOf(cfg, param, r.v);
  return (
    <div className="tip">
      <div className="tip-t">{fmtFull(r.t)}–{fmtHM(r.t + HOUR)}</div>
      <div className="tip-r" style={{ "--k": PARAM_COLOR[param] }}>
        <i />
        <span>{meta.label}</span>
        <b>{r.v == null ? "—" : `${fmt(r.v, meta.digits)} ${meta.unit}`}</b>
      </div>
      {r.n != null && <div className="tip-t" style={{ marginTop: 4, marginBottom: 0 }}>{r.n} data per 2 menit</div>}
      {lv != null && <div className="tip-lv"><LevelChip level={lv} label={levelLabel(cfg, param, lv)} /></div>}
    </div>
  );
}

export default function Hourly() {
  const { cfg, device, devicesLoading, poll } = useApp();
  const [param, setParam] = useState("co2");
  const [days, setDays] = useState(7);
  const [src, setSrc] = useState("reported");

  const q = useApi(device ? "/api/hourly" : null, { device, days }, { interval: poll });

  const model = useMemo(() => {
    if (!q.data) return null;
    const rep = new Map(q.data.reported.map((r) => [r.hour, r]));
    const comp = new Map(q.data.computed.map((r) => [r.hour, r]));
    const all = [...new Set([...rep.keys(), ...comp.keys()])].sort();
    return { rep, comp, all };
  }, [q.data]);

  const view = useMemo(() => {
    if (!model || !model.all.length || !cfg) return null;
    const m = src === "reported" ? model.rep : model.comp;
    const t0 = toMs(model.all[0]), t1 = toMs(model.all[model.all.length - 1]);
    const bars = [];
    for (let t = t0; t <= t1; t += HOUR) {
      const k = keyOf(t);
      const r = m.get(k);
      bars.push({ k, t, v: r?.[param] ?? null, n: src === "computed" ? r?.n : model.comp.get(k)?.n });
    }
    const values = new Map();
    m.forEach((r, k) => values.set(k.slice(0, 13), { v: r[param] ?? null, n: model.comp.get(k)?.n }));
    const days = [];
    for (let t = Math.floor(t0 / 864e5) * 864e5; t <= t1; t += 864e5) days.push(new Date(t).toISOString().slice(0, 10));
    const nums = bars.filter((b) => b.v != null);
    const peak = nums.reduce((a, b) => (a == null || b.v > a.v ? b : a), null);
    const low = nums.reduce((a, b) => (a == null || b.v < a.v ? b : a), null);
    const avg = nums.length ? nums.reduce((s, b) => s + b.v, 0) / nums.length : null;
    const max = peak ? peak.v : 1;
    const ns = niceScale(0, max * 1.08 || 1, 5);
    const stepMs = days.length > 2 ? 24 * HOUR : 3 * HOUR;
    const ticks = bars.filter((b) => (days.length > 2 ? b.t % (24 * HOUR) === 0 : b.t % stepMs === 0)).map((b) => b.k);
    return { bars, values, days, peak, low, avg, ns, ticks, n: nums.length };
  }, [model, src, param, cfg, days]);

  const compare = useMemo(() => {
    if (!model || !cfg) return null;
    const meta = cfg.params[param];
    const tol = 0.5 * Math.pow(10, -meta.digits) + 0.011;
    const lastHour = model.all[model.all.length - 1];
    const rows = [...model.all].reverse().map((k) => {
      const a = model.rep.get(k), b = model.comp.get(k);
      const av = a?.[param] ?? null, bv = b?.[param] ?? null;
      let level, label;
      if (a && b && av != null && bv != null) {
        const ok = Math.abs(av - bv) <= tol;
        level = ok ? 0 : 1; label = ok ? "Cocok" : "Selisih";
      } else if (!a && b) {
        if (k === lastHour) { level = null; label = "Jam berjalan"; } else { level = 1; label = "Belum diterima dari perangkat"; }
      } else if (a && !b) { level = 1; label = "Tanpa data menit"; }
      else { level = 1; label = "Nilai kosong"; }
      return { k, av, bv, n: b?.n, level, label, diff: av != null && bv != null ? av - bv : null };
    });
    const both = rows.filter((r) => r.level === 0 || (r.level === 1 && r.diff != null));
    return { rows, ok: rows.filter((r) => r.level === 0).length, total: both.length, meta };
  }, [model, param, cfg]);

  if (!cfg || devicesLoading) return <p className="muted">Memuat…</p>;
  if (!device) return <Empty title="Belum ada data masuk">Rata-rata per jam muncul setelah perangkat mengirim data minimal satu jam.</Empty>;

  const meta = cfg.params[param];
  return (
    <>
      <div className="filters">
        <div className="field">
          <span className="lab">Parameter</span>
          <Segmented
            label="Parameter" value={param} onChange={setParam}
            options={PARAM_KEYS.map((p) => ({ value: p, label: cfg.params[p].label }))}
          />
        </div>
        <div className="field">
          <span className="lab">Rentang</span>
          <Segmented label="Rentang hari" value={String(days)} onChange={(v) => setDays(Number(v))} options={DAYS} />
        </div>
        <div className="field">
          <span className="lab">Sumber nilai</span>
          <Segmented
            label="Sumber nilai" value={src} onChange={setSrc}
            options={[
              { value: "reported", label: "Dari perangkat", title: "Paket 1h_valid yang dikirim ESP32" },
              { value: "computed", label: "Dihitung dari data menit", title: "Rata-rata ulang dari data 2 menit tervalidasi" },
            ]}
          />
        </div>
      </div>

      {!view ? (
        <Empty title="Belum ada rata-rata per jam">
          ESP32 mengirim paket <code>1h_valid</code> setiap pergantian jam. Data akan muncul di sini setelah itu.
        </Empty>
      ) : (
        <div className={q.fetching ? "dim" : ""} style={{ display: "grid", gap: 20 }}>
          <div className="strip s3">
            {[
              { name: "Tertinggi", r: view.peak },
              { name: "Terendah", r: view.low },
            ].map(({ name, r }) => (
              <div className="kpi" key={name}>
                <div className="kpi-top"><span className="kpi-name">{name}</span></div>
                <div className="kpi-val">{r ? fmt(r.v, meta.digits) : "—"}<small>{meta.unit}</small></div>
                <div className="kpi-sub">{r ? `pukul ${fmtHM(r.t)}, ${fmtDM(r.t)}` : "Belum ada data"}</div>
              </div>
            ))}
            <div className="kpi">
              <div className="kpi-top"><span className="kpi-name">Rata-rata</span></div>
              <div className="kpi-val">{fmt(view.avg, meta.digits)}<small>{meta.unit}</small></div>
              <div className="kpi-sub">dari {view.n} jam</div>
            </div>
          </div>

          <section className="panel">
            <div className="panel-head">
              <h3>
                <span className="key" style={{ "--k": PARAM_COLOR[param] }} />
                {meta.label} per jam <span className="muted" style={{ fontWeight: 400 }}>{meta.unit}</span>
              </h3>
              <span className="note">{src === "reported" ? "Nilai dari perangkat" : "Dihitung dari data 2 menit"}</span>
            </div>
            <div style={{ height: 260 }} className="chart-box">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={view.bars} margin={{ top: 8, right: 12, bottom: 0, left: 0 }} barCategoryGap="18%">
                  <CartesianGrid stroke="var(--grid)" vertical={false} />
                  <XAxis
                    dataKey="k" ticks={view.ticks} interval={0} axisLine={{ stroke: "var(--axis)" }} tickLine={false} tickMargin={6}
                    tick={{ fontSize: 11, fill: "var(--muted)" }}
                    tickFormatter={(k) => (view.days.length > 2 ? fmtDM(toMs(k)) : fmtHM(toMs(k)))}
                  />
                  <YAxis
                    domain={view.ns.domain} ticks={view.ns.ticks} width={48} axisLine={false} tickLine={false}
                    tick={{ fontSize: 11, fill: "var(--muted)" }} tickFormatter={(v) => fmt(v, view.ns.ticks[1] - view.ns.ticks[0] >= 1 ? 0 : 1)}
                  />
                  <Tooltip content={<Tip meta={meta} cfg={cfg} param={param} />} cursor={{ fill: "var(--hover)" }} isAnimationActive={false} />
                  <Bar dataKey="v" fill={PARAM_COLOR[param]} radius={[2, 2, 0, 0]} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section className="panel">
            <div className="panel-head"><h3>Pola per jam dalam sehari</h3></div>
            <Heatmap values={view.values} days={view.days} param={param} cfg={cfg} />
          </section>

          <section>
            <div className="row" style={{ marginBottom: 8, flexWrap: "wrap" }}>
              <h3 style={{ fontSize: 14, fontWeight: 600 }}>Cek rata-rata jam: perangkat vs hitung ulang</h3>
              {compare && (
                <span className="note">
                  {compare.ok} dari {compare.total} jam cocok (toleransi pembulatan {fmt(0.5 * Math.pow(10, -meta.digits), meta.digits + 1)} {meta.unit})
                </span>
              )}
            </div>
            <div className="tablewrap scroll" style={{ maxHeight: 420 }}>
              <table className="t">
                <thead>
                  <tr>
                    <th>Jam</th>
                    <th>Dari perangkat</th>
                    <th>Hitung ulang</th>
                    <th>Selisih</th>
                    <th>Data menit</th>
                    <th className="l">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {compare?.rows.map((r) => (
                    <tr key={r.k}>
                      <td>{fmtFull(toMs(r.k))}</td>
                      <td>{r.av == null ? <span className="nullv">NULL</span> : fmt(r.av, meta.digits)}</td>
                      <td>{r.bv == null ? <span className="nullv">—</span> : fmt(r.bv, meta.digits)}</td>
                      <td>{r.diff == null ? "—" : fmt(r.diff, meta.digits + 1)}</td>
                      <td>{r.n != null ? `${r.n}/30` : "—"}</td>
                      <td className="l"><LevelChip level={r.level} label={r.label} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
