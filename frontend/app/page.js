"use client";
import { useState } from "react";
import Link from "next/link";
import { useApp, useNow } from "@/components/AppContext";
import { useApi, API } from "@/lib/api";
import { useSeries } from "@/lib/useSeries";
import {
  PARAM_KEYS, PARAM_COLOR, RANGES, LOG_SHAPE, fmt, fmtSigned, fmtFull, fmtDuration, relTime, rssiLabel, toMs, eventLabel,
} from "@/lib/aq";
import { Empty, LevelChip, Segmented, Sparkline, StatusShape } from "@/components/ui";
import { ChartPanel } from "@/components/TimeChart";
import Gauge from "@/components/Gauge";
import Ribbon from "@/components/Ribbon";

function Kpi({ p, cfg, latest, stat, cells }) {
  const meta = cfg.params[p];
  const color = PARAM_COLOR[p];
  const d = latest?.delta_1h;
  return (
    <div className="kpi">
      <div className="kpi-top">
        <span className="kpi-name">
          <span className="key" style={{ "--k": color }} />
          {meta.label}
        </span>
        {latest && <LevelChip level={latest.level} label={latest.label} />}
      </div>
      <div className="kpi-val">
        {latest ? fmt(latest.value, meta.digits) : "—"}
        <small>{meta.unit}</small>
      </div>
      <div className="kpi-sub">
        {d != null ? (
          <span title="Dibanding rata-rata sekitar 1 jam sebelumnya">
            {d > 0.0001 ? "▲" : d < -0.0001 ? "▼" : "■"} {fmtSigned(d, meta.digits)} dari 1 jam lalu
          </span>
        ) : (
          <span>Belum ada pembanding 1 jam</span>
        )}
      </div>
      <div className="mm">
        {stat ? (
          [["min", stat.min], ["rata-rata", stat.avg], ["maks", stat.max]].map(([l, v]) => (
            <span key={l}><small>{l}</small>{fmt(v, meta.digits)}</span>
          ))
        ) : (
          <span>—</span>
        )}
      </div>
      <Sparkline values={cells.map((c) => c.v[p])} color={color} />
    </div>
  );
}

function DeviceSection({ d, age }) {
  const s = d.sensors || {};
  const ok = (v) => (v == null ? null : v ? 0 : 3);
  const sensor = (v) => (
    <span className="row" style={{ justifyContent: "flex-end", gap: 6 }}>
      <StatusShape level={ok(v)} size={11} />
      {v == null ? "—" : v ? "Normal" : "Gagal"}
    </span>
  );
  return (
    <section>
      <h3>Perangkat</h3>
      <dl className="kv">
        <dt>Status</dt>
        <dd><LevelChip level={d.online ? 0 : 3} label={d.online ? "Online" : "Offline"} /></dd>
        <dt>Data terakhir</dt>
        <dd>{relTime(age)}</dd>
        <dt>Sinyal WiFi</dt>
        <dd>{d.rssi != null ? `${d.rssi} dBm · ${rssiLabel(d.rssi)}` : "—"}</dd>
        <dt>Uptime</dt>
        <dd>{d.uptime || "—"}</dd>
        <dt>Sensor PM2.5</dt>
        <dd>{sensor(s.pm)}</dd>
        <dt>Sensor SHT31</dt>
        <dd>{sensor(s.sht)}</dd>
        <dt>Penyimpanan</dt>
        <dd>{sensor(s.sd)}</dd>
      </dl>
    </section>
  );
}

function QualitySection({ q, cfg }) {
  if (!q) return null;
  return (
    <section>
      <h3>Kelengkapan data 24 jam</h3>
      <div className="row" style={{ alignItems: "baseline" }}>
        <span style={{ fontSize: 28, fontWeight: 650, letterSpacing: "-0.02em" }}>{fmt(q.completeness, 1)}%</span>
        <span className="note">{q.received} dari {q.expected} data 2 menit</span>
      </div>
      <div className="bar" role="progressbar" aria-valuenow={q.completeness} aria-valuemin={0} aria-valuemax={100} aria-label="Kelengkapan data">
        <i style={{ width: `${Math.min(100, q.completeness ?? 0)}%` }} />
      </div>
      <dl className="kv">
        <dt>Ditolak validasi</dt>
        <dd className="note num" style={{ textAlign: "right" }}>
          {PARAM_KEYS.filter((p) => q.nulls[p] > 0).map((p) => `${cfg.params[p].label} ${q.nulls[p]}`).join(" · ") || "Tidak ada"}
        </dd>
        <dt>Jeda data</dt>
        <dd>{q.gap_count ? `${q.gap_count}× · total ${fmtDuration(q.gap_minutes)}` : "Tidak ada"}</dd>
      </dl>
      {q.gaps.length > 0 && (
        <ul className="events">
          {q.gaps.slice(0, 3).map((g) => (
            <li key={g.from}>
              <StatusShape level={1} size={11} />
              <span className="num">
                {g.from.slice(11, 16)} → {g.to.slice(11, 16)} <span className="muted">({fmtDuration(g.minutes)})</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function EventsSection({ events }) {
  return (
    <section>
      <div className="row">
        <h3 className="grow">Peristiwa terbaru</h3>
        <Link href="/logs" className="note">Semua log</Link>
      </div>
      {events.length === 0 ? (
        <p className="note">Belum ada peristiwa.</p>
      ) : (
        <ul className="events">
          {events.map((e) => (
            <li key={e.id}>
              <StatusShape level={LOG_SHAPE[e.level]} size={11} />
              <div>
                <div>{e.message}</div>
                <div className="t">{fmtFull(toMs(e.ts))} · {eventLabel(e.event)}</div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default function Overview() {
  const { cfg, device, devicesLoading, poll } = useApp();
  const now = useNow();
  const [hours, setHours] = useState(24);
  const [res, setRes] = useState("min_valid");

  const ov = useApi(device ? "/api/overview" : null, { device }, { interval: poll });
  const isHour = res === "hour_device";
  const effHours = isHour ? Math.max(hours, 24) : hours;
  const series = useSeries({ device, source: res, hours: effHours, poll });

  if (!cfg || devicesLoading) return <p className="muted">Memuat…</p>;
  if (!device) {
    return (
      <Empty title="Belum ada data masuk">
        <p>Arahkan ESP32 ke <code>POST {API}/api/post</code>, atau coba dulu dengan simulator:</p>
        <p><code>python simulate.py --live</code></p>
      </Empty>
    );
  }
  const d = ov.data;
  if (!d) return <p className="muted">Memuat data…</p>;
  if (!d.latest || !d.cells?.length) return <Empty title="Perangkat belum mengirim data">Data akan muncul di sini begitu paket pertama diterima.</Empty>;

  const age = d.age_s != null && ov.at ? d.age_s + (now - ov.at) / 1000 : d.age_s;
  const o = d.overall;
  const worst = o && d.latest[o.worst];
  const wmeta = o && cfg.params[o.worst];
  const others = PARAM_KEYS.filter((p) => p !== o?.worst && d.latest[p])
    .map((p) => `${cfg.params[p].label} ${d.latest[p].label.toLowerCase()}`).join(", ");
  const ispu = d.ispu;

  return (
    <>
      {!d.online && (
        <div className="alert" style={{ "--k": "var(--lv3)" }} role="alert">
          <StatusShape level={3} size={14} />
          <span>
            <b>Perangkat tidak mengirim data</b> sejak {relTime(age)}. Grafik di bawah menampilkan data terakhir yang diterima
            ({d.window_end.slice(0, 16)}).
          </span>
        </div>
      )}

      <div className="hero">
        <div>
          <h2>Kondisi udara sekarang</h2>
          <div className="verdict">
            <StatusShape level={o?.level} size={34} />
            <span className="word">{worst ? worst.label : "Belum ada data"}</span>
          </div>
          {worst && o.level === 0 && (
            <p>
              Semua parameter dalam kisaran baik: {PARAM_KEYS.filter((p) => d.latest[p])
                .map((p) => `${cfg.params[p].label} ${fmt(d.latest[p].value, cfg.params[p].digits)} ${cfg.params[p].unit}`).join(", ")}.
            </p>
          )}
          {worst && o.level > 0 && (
            <p>
              Ditentukan oleh <b style={{ color: "var(--ink)" }}>{wmeta.label} {fmt(worst.value, wmeta.digits)} {wmeta.unit}</b>.
              {others && <> Parameter lain: {others}.</>}
            </p>
          )}
          <p className="small" style={{ marginTop: 6 }}>
            Data terakhir pukul {d.window_end.slice(11, 16)}, {relTime(age)}.
          </p>
        </div>
        <Gauge
          value={ispu?.now}
          level={ispu?.now_level}
          label={ispu?.now != null ? cfg.levels[ispu.now_level].label : null}
          caption={ispu?.avg24 != null ? `Rata-rata 24 jam: ${ispu.avg24}` : null}
        />
        <Ribbon cells={d.cells} cfg={cfg} />
      </div>

      <div className="layout">
        <div className="stack">
          <div>
            <div className="strip">
              {PARAM_KEYS.map((p) => (
                <Kpi key={p} p={p} cfg={cfg} latest={d.latest[p]} stat={d.stats[p]} cells={d.cells} />
              ))}
            </div>
            <p className="note" style={{ marginTop: 6 }}>Min, rata-rata, dan maks dihitung dari 24 jam terakhir. Garis kecil menunjukkan tren 24 jam.</p>
          </div>

          <div className="filters" style={{ marginBottom: 0 }}>
            <div className="field">
              <span className="lab">Resolusi data</span>
              <Segmented
                label="Resolusi data" value={res} onChange={setRes}
                options={[{ value: "min_valid", label: "Per menit" }, { value: "hour_device", label: "Per jam" }]}
              />
            </div>
            <div className="field">
              <span className="lab">Rentang</span>
              <Segmented
                label="Rentang waktu" value={String(effHours)} onChange={(v) => setHours(Number(v))}
                options={RANGES.filter((r) => !isHour || r.h >= 24).map((r) => ({ value: String(r.h), label: r.l }))}
              />
            </div>
            <span className="note" style={{ marginLeft: "auto", alignSelf: "center" }}>
              {isHour ? "Rata-rata jam dari perangkat (1h_valid)" : "Data tervalidasi tiap 2 menit"}
              {!isHour && effHours > 24 ? ", dirata-rata per blok agar ringan" : ""}
            </span>
          </div>

          <div className="charts2">
            {PARAM_KEYS.map((p) => {
              const meta = cfg.params[p];
              return (
                <ChartPanel
                  key={`${p}-${res}-${effHours}`}
                  title={meta.label} unit={meta.unit} param={p} cfg={cfg} digits={meta.digits}
                  rows={series.rows} gapMs={series.gapMs} fetching={series.fetching || series.loading}
                  series={[{ key: p, label: meta.label, color: PARAM_COLOR[p] }]}
                />
              );
            })}
          </div>
        </div>

        <aside className="rail" aria-label="Info perangkat dan kualitas data">
          <DeviceSection d={d} age={age} />
          <QualitySection q={d.quality} cfg={cfg} />
          <EventsSection events={d.events} />
        </aside>
      </div>
    </>
  );
}
