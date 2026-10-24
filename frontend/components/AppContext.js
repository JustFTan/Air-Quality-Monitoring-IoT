"use client";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useApi } from "@/lib/api";

const Ctx = createContext(null);
export const useApp = () => useContext(Ctx);

export function useNow(ms = 15000) {
  const [n, setN] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setN(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return n;
}

// Jeda perbarui otomatis (detik). Di Vercel + Turso gratis disarankan 60 supaya kuota baca database awet.
const POLL_MS = Math.max(10, Number(process.env.NEXT_PUBLIC_REFRESH_S) || 30) * 1000;

function store(key, val) {
  try { localStorage.setItem(key, val); } catch {}
}

export default function AppProvider({ children }) {
  const [theme, setThemeState] = useState("system");
  const [device, setDeviceState] = useState(null);
  const [auto, setAutoState] = useState(true);

  useEffect(() => {
    try {
      setThemeState(localStorage.getItem("aq-theme") || "system");
      setDeviceState(localStorage.getItem("aq-device"));
      const a = localStorage.getItem("aq-auto");
      if (a !== null) setAutoState(a === "1");
    } catch {}
  }, []);

  useEffect(() => {
    const el = document.documentElement;
    if (theme === "system") el.removeAttribute("data-theme");
    else el.setAttribute("data-theme", theme);
  }, [theme]);

  const poll = auto ? POLL_MS : 0;
  const config = useApi("/api/config");
  const devs = useApi("/api/devices", {}, { interval: poll });
  const list = devs.data?.devices ?? [];
  const active = device && list.some((d) => d.device === device) ? device : list[0]?.device ?? null;
  const info = list.find((d) => d.device === active) || null;

  const value = useMemo(
    () => ({
      cfg: config.data,
      cfgError: config.error,
      devices: list,
      devicesLoading: devs.loading,
      device: active,
      info,
      infoAt: devs.at,
      theme,
      auto,
      poll,
      setDevice: (d) => { setDeviceState(d); store("aq-device", d); },
      setTheme: (t) => { setThemeState(t); store("aq-theme", t); },
      setAuto: (a) => { setAutoState(a); store("aq-auto", a ? "1" : "0"); },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [config.data, config.error, devs.data, devs.loading, devs.at, active, theme, auto]
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
