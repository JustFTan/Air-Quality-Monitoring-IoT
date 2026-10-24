"use client";
import { useMemo, useState } from "react";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ReferenceArea,
} from "recharts";
import {
  PARAM_COLOR, fmt, fmtAxis, fmtFull, makeTicks, niceScale, withGaps, levelOf, levelLabel, thresholdLines, thresholdNotes,
} from "@/lib/aq";
import { LevelChip, Segmented, StatusShape } from "@/components/ui";

function Tip({ active, payload, label, series, digits, unit, cfg, param }) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  const main = row[series[0].key];
  const lv = param && main != null ? levelOf(cfg, param, main) : null;
  return (
    <div className="tip">
      <div className="tip-t">{fmtFull(label)}</div>
      {series.map((s) => (
        <div className="tip-r" key={s.key} style={{ "--k": s.color }}>
          <i />
          <span>{s.label}</span>
          <b>
            {row[s.key] == null ? "—" : fmt(row[s.key], digits)} {row[s.key] == null ? "" : unit}
          </b>
        </div>
      ))}
      {lv != null && (
        <div className="tip-lv">
          <LevelChip level={lv} label={levelLabel(cfg, param, lv)} />
        </div>
      )}
    </div>
  );
}

export function Legend({ series }) {
  return (
    <div className="legend" aria-label="Legenda">
      {series.map((s) => (
        <span key={s.key} style={{ "--k": s.color }}>
          <i />
          {s.label}
        </span>
      ))}
    </div>
  );
}

/**
 * Grafik garis dengan sumbu waktu numerik. Garis putus di jeda data, ada garis ambang,
 * tooltip yang menampilkan semua seri, dan zoom dengan menyeret.
 */
export function TimeChart({ rows, series, param, cfg, digits = 1, unit, height = 240, gapMs, showThresholds = true, domainKeys }) {
  const keys = series.map((s) => s.key);
  const kstr = keys.join();
  const data = useMemo(() => withGaps(rows, gapMs, keys), [rows, gapMs, kstr]); // eslint-disable-line react-hooks/exhaustive-deps
  const [zoom, setZoom] = useState(null);
  const [sel, setSel] = useState(null);
  const dk = (domainKeys || [keys[0]]).join();

  const xDomain = zoom || (data.length ? [data[0].t, data[data.length - 1].t] : [0, 1]);
  const ticks = useMemo(() => makeTicks(xDomain[0], xDomain[1]), [xDomain[0], xDomain[1]]); // eslint-disable-line react-hooks/exhaustive-deps

  const y = useMemo(() => {
    let lo = Infinity, hi = -Infinity;
    const ks = dk.split(",");
    for (const r of data) {
      if (zoom && (r.t < zoom[0] || r.t > zoom[1])) continue;
      for (const k of ks) {
        const v = r[k];
        if (v != null) { if (v < lo) lo = v; if (v > hi) hi = v; }
      }
    }
    if (!isFinite(lo)) return niceScale(0, 1);
    const pad = (hi - lo) * 0.12 || Math.max(1, Math.abs(hi) * 0.05);
    lo -= pad; hi += pad;
    if (cfg?.params[param]?.min_zero && lo < 0) lo = 0;
    return niceScale(lo, hi, 5);
  }, [data, zoom, dk, param, cfg]);

  if (!data.length) {
    return <div className="empty-chart" style={{ height }}>Belum ada data pada rentang ini.</div>;
  }

  const stepY = y.ticks.length > 1 ? y.ticks[1] - y.ticks[0] : 1;
  const tickDigits = stepY >= 1 ? 0 : stepY >= 0.1 ? 1 : 2;
  const span = xDomain[1] - xDomain[0];

  return (
    <div className="chart-box" style={{ height }}>
      {zoom && (
        <button type="button" className="btn zoom-reset" onClick={() => setZoom(null)}>
          Reset zoom
        </button>
      )}
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={data}
          margin={{ top: 8, right: 12, bottom: 0, left: 0 }}
          onMouseDown={(e) => e && e.activeLabel != null && setSel({ a: e.activeLabel, b: null })}
          onMouseMove={(e) => sel && e && e.activeLabel != null && setSel((s) => (s ? { ...s, b: e.activeLabel } : s))}
          onMouseUp={() => {
            if (sel && sel.b != null && Math.abs(sel.b - sel.a) > (gapMs || 60000)) {
              setZoom([Math.min(sel.a, sel.b), Math.max(sel.a, sel.b)]);
            }
            setSel(null);
          }}
          onMouseLeave={() => setSel(null)}
        >
          <CartesianGrid stroke="var(--grid)" vertical={false} />
          <XAxis
            dataKey="t" type="number" scale="time" domain={xDomain} ticks={ticks} allowDataOverflow
            tickFormatter={(v) => fmtAxis(v, span)} tick={{ fontSize: 11, fill: "var(--muted)" }}
            axisLine={{ stroke: "var(--axis)" }} tickLine={false} tickMargin={6}
          />
          <YAxis
            domain={y.domain} ticks={y.ticks} allowDataOverflow width={48}
            tickFormatter={(v) => fmt(v, tickDigits)} tick={{ fontSize: 11, fill: "var(--muted)" }}
            axisLine={false} tickLine={false}
          />
          {showThresholds && param &&
            thresholdLines(cfg, param).map((l) => (
              <ReferenceLine key={l.y} y={l.y} stroke={`var(--lv${l.level})`} strokeOpacity={0.85} strokeWidth={1} ifOverflow="hidden" />
            ))}
          <Tooltip
            content={<Tip series={series} digits={digits} unit={unit} cfg={cfg} param={param} />}
            cursor={{ stroke: "var(--ink-2)", strokeWidth: 1 }}
            isAnimationActive={false}
          />
          {sel && sel.b != null && <ReferenceArea x1={sel.a} x2={sel.b} fill="var(--ink)" fillOpacity={0.08} stroke="none" />}
          {[...series].reverse().map((s) => (
            <Line
              key={s.key} type="monotone" dataKey={s.key} stroke={s.color} strokeWidth={s.thin ? 1.25 : 2} dot={false}
              activeDot={{ r: 4, stroke: "var(--surface)", strokeWidth: 2, fill: s.color }}
              isAnimationActive={false} connectNulls={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function SeriesTable({ rows, series, digits = 1, max = 300 }) {
  const shown = useMemo(() => [...rows].reverse().slice(0, max), [rows, max]);
  return (
    <div className="scroll">
      <table className="t">
        <thead>
          <tr>
            <th>Waktu</th>
            {series.map((s) => (
              <th key={s.key}>{s.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {shown.map((r) => (
            <tr key={r.t}>
              <td>{fmtFull(r.t)}</td>
              {series.map((s) => (
                <td key={s.key}>{r[s.key] == null ? <span className="nullv">NULL</span> : fmt(r[s.key], digits)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Kartu grafik: judul, legenda, pilihan grafik/tabel, dan keterangan ambang. */
export function ChartPanel({
  title, param, cfg, rows, series, digits = 1, unit, gapMs, height = 220, fetching, showThresholds = true, extra, hint = true,
}) {
  const [view, setView] = useState("chart");
  const color = param ? PARAM_COLOR[param] : "var(--ink)";
  const notes = showThresholds && param ? thresholdNotes(cfg, param) : [];
  return (
    <section className={`panel${fetching ? " dim" : ""}`}>
      <div className="panel-head">
        <h3>
          <span className="key" style={{ "--k": color }} />
          {title} <span className="muted" style={{ fontWeight: 400 }}>{unit}</span>
        </h3>
        {extra}
        <div className="view-toggle">
          <Segmented
            label="Tampilan" value={view} onChange={setView}
            options={[{ value: "chart", label: "Grafik" }, { value: "table", label: "Tabel" }]}
          />
        </div>
      </div>
      {series.length > 1 && <Legend series={series} />}
      {view === "chart" ? (
        <TimeChart rows={rows} series={series} param={param} cfg={cfg} digits={digits} unit={unit} height={height} gapMs={gapMs} showThresholds={showThresholds} domainKeys={[series[0].key]} />
      ) : (
        <SeriesTable rows={rows} series={series} digits={digits} />
      )}
      <div className="panel-foot">
        {notes.map((n, i) => (
          <span key={i} className="row" style={{ gap: 5 }}>
            <StatusShape level={n.level} size={10} />
            {n.text}
          </span>
        ))}
        {hint && view === "chart" && <span style={{ marginLeft: "auto" }}>Seret pada grafik untuk memperbesar</span>}
      </div>
    </section>
  );
}
