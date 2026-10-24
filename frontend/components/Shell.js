"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Icon from "@/components/Icon";
import { Empty, Switch } from "@/components/ui";
import { useApp, useNow } from "@/components/AppContext";
import { API } from "@/lib/api";
import { relTime } from "@/lib/aq";

const NAV = [
  { href: "/", label: "Ringkasan", icon: "overview" },
  { href: "/trends", label: "Tren", icon: "trend" },
  { href: "/hourly", label: "Per jam", icon: "hourly" },
  { href: "/data", label: "Data", icon: "table" },
  { href: "/logs", label: "Log", icon: "log" },
];

const THEME_NEXT = { system: "light", light: "dark", dark: "system" };
const THEME_ICON = { system: "auto", light: "sun", dark: "moon" };
const THEME_LABEL = { system: "Tema: ikuti sistem", light: "Tema: terang", dark: "Tema: gelap" };

function Brand() {
  return (
    <div className="brand">
      <svg width="26" height="26" viewBox="0 0 26 26" aria-hidden="true">
        <rect width="26" height="26" rx="6" style={{ fill: "var(--ink)" }} />
        <path d="M5 9h11a2.5 2.5 0 1 0-2.5-2.5M5 13.5h15a2.5 2.5 0 1 1-2.5 2.5M5 18h8" style={{ stroke: "var(--surface)", fill: "none", strokeWidth: 1.8, strokeLinecap: "round" }} />
      </svg>
      Air Quality Dashboard
    </div>
  );
}

export default function Shell({ children }) {
  const path = usePathname();
  const app = useApp();
  const now = useNow();
  const { info, infoAt, devices, device, setDevice, theme, setTheme, auto, setAuto, cfg, cfgError } = app;
  const title = NAV.find((n) => (n.href === "/" ? path === "/" : path.startsWith(n.href)))?.label ?? "Pantau Udara";
  const age = info?.age_s != null && infoAt ? info.age_s + (now - infoAt) / 1000 : info?.age_s;
  const online = info?.online && (age == null || age <= 360);

  return (
    <div className="app">
      <aside className="side">
        <Brand />
        <nav className="nav" aria-label="Menu utama">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} aria-current={(n.href === "/" ? path === "/" : path.startsWith(n.href)) ? "page" : undefined}>
              <Icon name={n.icon} />
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="devcard">
          {info ? (
            <>
              <b>{info.device}</b>
              <span className="row small muted">
                <span className="pulse" style={online ? undefined : { background: "var(--lv3)", animation: "none" }} />
                {online ? "Online" : "Offline"} · {relTime(age)}
              </span>
            </>
          ) : (
            <span className="small muted">Belum ada perangkat</span>
          )}
        </div>
      </aside>

      <div className="main">
        <header className="top">
          <h1>{title}</h1>
          <span className="grow" />
          {devices.length > 1 ? (
            <select className="select" aria-label="Perangkat" value={device ?? ""} onChange={(e) => setDevice(e.target.value)}>
              {devices.map((d) => (
                <option key={d.device} value={d.device}>{d.device}</option>
              ))}
            </select>
          ) : info ? (
            <span className="muted">{info.device}</span>
          ) : null}
          <Switch checked={auto} onChange={setAuto}>
            {auto && <span className="pulse" />}
            Perbarui otomatis
          </Switch>
          <button className="btn icon" onClick={() => setTheme(THEME_NEXT[theme])} aria-label={THEME_LABEL[theme]} title={THEME_LABEL[theme]}>
            <Icon name={THEME_ICON[theme]} />
          </button>
        </header>
        <main className="page">
          {cfgError && !cfg ? (
            <Empty title="Tidak bisa terhubung ke backend">
              <p>
                Dashboard mencari API di <code>{API}</code>.
              </p>
              <p>
                Jalankan backend dengan <code>uvicorn main:app --host 0.0.0.0 --port 8000</code>, atau ubah{" "}
                <code>NEXT_PUBLIC_API_URL</code> di <code>frontend/.env.local</code>.
              </p>
            </Empty>
          ) : (
            children
          )}
        </main>
      </div>
    </div>
  );
}
