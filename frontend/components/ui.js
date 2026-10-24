"use client";

// Bentuk berbeda per level, jadi status tidak pernah hanya dibedakan lewat warna.
export function StatusShape({ level, size = 12 }) {
  const s = { flex: "none", display: "inline-block" };
  const fill = level == null ? "none" : `var(--lv${level})`;
  const stroke = level == null ? "var(--muted)" : "none";
  const common = { style: { fill, stroke, strokeWidth: 1.5 } };
  let shape;
  switch (level) {
    case 0:
      shape = <circle cx="6" cy="6" r="5" {...common} />;
      break;
    case 1:
      shape = <polygon points="6,0.8 11.6,10.8 0.4,10.8" {...common} />;
      break;
    case 2:
      shape = <polygon points="6,0.4 11.6,6 6,11.6 0.4,6" {...common} />;
      break;
    case 3:
      shape = <rect x="1" y="1" width="10" height="10" rx="1" {...common} />;
      break;
    case 4:
      shape = <polygon points="3.5,0.8 8.5,0.8 11.4,6 8.5,11.2 3.5,11.2 0.6,6" {...common} />;
      break;
    default:
      shape = <circle cx="6" cy="6" r="4.5" {...common} />;
  }
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" style={s} aria-hidden="true">
      {shape}
    </svg>
  );
}

export function LevelChip({ level, label, large = false }) {
  return (
    <span className={`chip${large ? " lg" : ""}`} style={{ "--k": level == null ? "var(--muted)" : `var(--lv${level})` }}>
      <StatusShape level={level} size={large ? 13 : 11} />
      {label ?? "Tidak ada data"}
    </span>
  );
}

export function Segmented({ value, onChange, options, label }) {
  return (
    <div className="seg" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          title={o.title}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Switch({ checked, onChange, children }) {
  return (
    <button type="button" role="switch" aria-checked={checked} className="switch" onClick={() => onChange(!checked)}>
      <span className="track" />
      {children}
    </button>
  );
}

export function Empty({ title, children }) {
  return (
    <div className="empty">
      <h2>{title}</h2>
      <div>{children}</div>
    </div>
  );
}

export function Sparkline({ values, color }) {
  const pts = values.map((v, i) => ({ v, i }));
  const nums = values.filter((v) => v != null);
  if (nums.length < 2) return <div className="spark" />;
  const lo = Math.min(...nums), hi = Math.max(...nums);
  const span = hi - lo || 1;
  const x = (i) => (i / (values.length - 1)) * 100;
  const y = (v) => 30 - ((v - lo) / span) * 26;
  let d = "";
  let pen = false;
  pts.forEach(({ v, i }) => {
    if (v == null) { pen = false; return; }
    d += `${pen ? "L" : "M"}${x(i).toFixed(2)} ${y(v).toFixed(2)} `;
    pen = true;
  });
  const lastIdx = values.map((v) => v != null).lastIndexOf(true);
  return (
    <div style={{ position: "relative" }}>
      <svg className="spark" viewBox="0 0 100 34" preserveAspectRatio="none" aria-hidden="true">
        <path d={d} style={{ stroke: color, fill: "none", strokeWidth: 1.6, vectorEffect: "non-scaling-stroke" }} strokeLinejoin="round" strokeLinecap="round" />
      </svg>
      <span
        style={{
          position: "absolute", left: `${x(lastIdx)}%`, top: `${(y(values[lastIdx]) / 34) * 100}%`, width: 8, height: 8,
          marginLeft: -4, marginTop: -4, borderRadius: "50%", background: color, boxShadow: "0 0 0 2px var(--surface)",
        }}
      />
    </div>
  );
}
