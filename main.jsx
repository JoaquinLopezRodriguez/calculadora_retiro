import { useState, useCallback, useRef, useEffect } from "react";

// ─── MATH ENGINE ─────────────────────────────────────────────────────────────

function toRealMonthly(nominalAnnual, inflationAnnual) {
  const nom = Math.pow(1 + nominalAnnual / 100, 1 / 12) - 1;
  const inf = Math.pow(1 + inflationAnnual / 100, 1 / 12) - 1;
  return (1 + nom) / (1 + inf) - 1;
}

function futureValue(capital, contrib, r, months) {
  if (Math.abs(r) < 1e-10) return capital + contrib * months;
  return capital * Math.pow(1 + r, months) + contrib * (Math.pow(1 + r, months) - 1) / r;
}

function rentaFromCapital(cap, rfReal, n, herencia) {
  if (n <= 0) return 0;
  if (Math.abs(rfReal) < 1e-10) return (cap - herencia) / n;
  const pvH = herencia / Math.pow(1 + rfReal, n);
  const factor = (1 - Math.pow(1 + rfReal, -n)) / rfReal;
  return (cap - pvH) / factor;
}

function capitalNeeded(renta, rfReal, n, herencia) {
  if (n <= 0) return herencia;
  if (Math.abs(rfReal) < 1e-10) return renta * n + herencia;
  const pvH = herencia / Math.pow(1 + rfReal, n);
  const factor = (1 - Math.pow(1 + rfReal, -n)) / rfReal;
  return renta * factor + pvH;
}

function monthlyContribNeeded(capObj, capitalActual, r, months) {
  if (months <= 0) return 0;
  const fvCap = capitalActual * Math.pow(1 + r, months);
  const faltante = capObj - fvCap;
  if (Math.abs(r) < 1e-10) return faltante / months;
  const factor = (Math.pow(1 + r, months) - 1) / r;
  return faltante / factor;
}

function buildResult(params, mode, value) {
  const { edadActual, edadRetiro, vidaEsperada, herencia, tasaPortfolio, tasaRf, inflacion, capitalActual } = params;
  const rReal = toRealMonthly(tasaPortfolio, inflacion);
  const rfReal = toRealMonthly(tasaRf, inflacion);
  const mesesAcum = (edadRetiro - edadActual) * 12;
  const mesesDesacum = (vidaEsperada - edadRetiro) * 12;

  let ahorroMensual, rentaMensual;
  if (mode === "renta") {
    ahorroMensual = value;
    const cap = futureValue(capitalActual, ahorroMensual, rReal, mesesAcum);
    rentaMensual = rentaFromCapital(cap, rfReal, mesesDesacum, herencia);
  } else {
    rentaMensual = value;
    const capObj = capitalNeeded(rentaMensual, rfReal, mesesDesacum, herencia);
    ahorroMensual = monthlyContribNeeded(capObj, capitalActual, rReal, mesesAcum);
  }

  const capRetiro = futureValue(capitalActual, ahorroMensual, rReal, mesesAcum);

  // Descomposición al retiro — tres partes mutuamente excluyentes que suman capRetiro
  const aportesBruto = ahorroMensual * mesesAcum;                      // nominal aportado
  const totalRendimientos = capRetiro - capitalActual - aportesBruto;  // ganancia pura

  // internos (no se usan en desglose pero sí en compatibilidad)
  const capitalFV = capitalActual * Math.pow(1 + rReal, mesesAcum);
  const aportesFV = Math.abs(rReal) < 1e-10 ? aportesBruto : ahorroMensual * (Math.pow(1 + rReal, mesesAcum) - 1) / rReal;

  // Curva
  const STEPS = 120;
  const points = [];
  for (let i = 0; i <= STEPS; i++) {
    const m = Math.round((mesesAcum / STEPS) * i);
    points.push({ edad: +(edadActual + m / 12).toFixed(3), valor: +futureValue(capitalActual, ahorroMensual, rReal, m).toFixed(0), fase: "acum" });
  }
  for (let i = 0; i <= STEPS; i++) {
    const m = Math.round((mesesDesacum / STEPS) * i);
    const v = capRetiro * Math.pow(1 + rfReal, m) -
      (Math.abs(rfReal) < 1e-10 ? rentaMensual * m : rentaMensual * (Math.pow(1 + rfReal, m) - 1) / rfReal);
    points.push({ edad: +(edadRetiro + m / 12).toFixed(3), valor: +Math.max(0, v).toFixed(0), fase: "desacum" });
  }

  return { points, ahorroMensual, rentaMensual, capRetiro, desglose: { capitalActual, capitalFV, aportesBruto, aportesFV, totalRendimientos } };
}

// ─── FORMAT ──────────────────────────────────────────────────────────────────

const fmtShort = (n) => {
  if (n === null || isNaN(n) || !isFinite(n)) return "—";
  if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (Math.abs(n) >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
};
const fmtFull = (n) => {
  if (n == null || isNaN(n) || !isFinite(n)) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
};

// ─── ANIMATED CHART ──────────────────────────────────────────────────────────

function Chart({ points, edadRetiro, triggerKey }) {
  const [progress, setProgress] = useState(0);
  const rafRef = useRef(null);

  useEffect(() => {
    cancelAnimationFrame(rafRef.current);
    setProgress(0);
    const start = performance.now();
    const dur = 1400;
    const tick = (now) => {
      const t = Math.min((now - start) / dur, 1);
      const ease = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
      setProgress(ease);
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [triggerKey]);

  if (!points || points.length === 0) {
    return (
      <div style={{ height: "280px", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <p style={{ color: "#d2d2d7", fontSize: "0.95rem" }}>El gráfico aparecerá aquí</p>
      </div>
    );
  }

  const W = 680, H = 280;
  const PAD = { t: 16, r: 20, b: 40, l: 68 };
  const cw = W - PAD.l - PAD.r, ch = H - PAD.t - PAD.b;

  const maxVal = Math.max(...points.map(p => p.valor));
  const minAge = points[0].edad, maxAge = points[points.length - 1].edad;
  const toX = a => PAD.l + ((a - minAge) / (maxAge - minAge)) * cw;
  const toY = v => PAD.t + ch - (v / maxVal) * ch;

  const acum = points.filter(p => p.fase === "acum");
  const desacum = points.filter(p => p.fase === "desacum");
  const totalPts = points.length;
  const visible = Math.floor(progress * totalPts);
  const visAcum = acum.slice(0, Math.min(visible, acum.length));
  const visDesacum = visible > acum.length ? desacum.slice(0, visible - acum.length) : [];

  const line = (pts) => pts.length < 2 ? "" : pts.map((p, i) =>
    `${i === 0 ? "M" : "L"}${toX(p.edad).toFixed(2)},${toY(p.valor).toFixed(2)}`).join(" ");
  const area = (pts, floor) => pts.length < 2 ? "" : `${line(pts)} L${toX(pts[pts.length - 1].edad).toFixed(2)},${floor} L${toX(pts[0].edad).toFixed(2)},${floor} Z`;

  const floor = PAD.t + ch;
  const retiroX = toX(edadRetiro);

  // Y ticks
  const mag = Math.pow(10, Math.floor(Math.log10(maxVal || 1)));
  const step = mag >= 1e6 ? 500000 : mag >= 1e5 ? 100000 : mag >= 1e4 ? 25000 : 5000;
  const yTicks = [];
  for (let v = 0; v <= maxVal * 1.08; v += step) yTicks.push(v);

  // X ticks
  const ageSpan = maxAge - minAge;
  const xStep = ageSpan > 50 ? 10 : ageSpan > 30 ? 5 : 5;
  const xTicks = [];
  for (let a = Math.ceil(minAge / xStep) * xStep; a <= maxAge; a += xStep) xTicks.push(a);

  const apexAcum = acum[acum.length - 1];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", display: "block" }}>
      <defs>
        <linearGradient id="gA" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#0071e3" stopOpacity="0.15" />
          <stop offset="100%" stopColor="#0071e3" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="gD" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ff6b35" stopOpacity="0.12" />
          <stop offset="100%" stopColor="#ff6b35" stopOpacity="0" />
        </linearGradient>
        <filter id="lineglow" x="-10%" y="-50%" width="120%" height="200%">
          <feGaussianBlur stdDeviation="2.5" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>

      {/* Y gridlines */}
      {yTicks.map(v => {
        const y = toY(v);
        if (y < PAD.t - 2 || y > floor + 2) return null;
        return (
          <g key={v}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y} y2={y} stroke="#f0f0f5" strokeWidth="1" />
            <text x={PAD.l - 8} y={y + 4} textAnchor="end" fill="#c7c7cc" fontSize="10"
              fontFamily="-apple-system, Helvetica, sans-serif">
              {v >= 1e6 ? `$${(v / 1e6).toFixed(v % 500000 === 0 ? 1 : 2)}M` : v >= 1e3 ? `$${(v / 1e3).toFixed(0)}K` : `$${v}`}
            </text>
          </g>
        );
      })}

      {/* X ticks */}
      {xTicks.map(a => (
        <text key={a} x={toX(a)} y={H - PAD.b + 16} textAnchor="middle" fill="#c7c7cc" fontSize="10"
          fontFamily="-apple-system, Helvetica, sans-serif">{a}</text>
      ))}

      {/* Retiro line */}
      <line x1={retiroX} x2={retiroX} y1={PAD.t} y2={floor} stroke="#0071e3" strokeWidth="1" strokeDasharray="3,4" opacity="0.35" />
      <rect x={retiroX - 20} y={PAD.t} width={40} height={14} rx={7} fill="#0071e3" opacity="0.1" />
      <text x={retiroX} y={PAD.t + 10} textAnchor="middle" fill="#0071e3" fontSize="8.5"
        fontFamily="-apple-system, Helvetica, sans-serif" fontWeight="600" letterSpacing="0.04em">RETIRO</text>

      {/* Areas */}
      {visAcum.length > 1 && <path d={area(visAcum, floor)} fill="url(#gA)" />}
      {visDesacum.length > 1 && <path d={area(visDesacum, floor)} fill="url(#gD)" />}

      {/* Lines */}
      {visAcum.length > 1 && (
        <path d={line(visAcum)} fill="none" stroke="#0071e3" strokeWidth="2.5"
          strokeLinecap="round" strokeLinejoin="round" filter="url(#lineglow)" />
      )}
      {visDesacum.length > 1 && (
        <path d={line(visDesacum)} fill="none" stroke="#ff6b35" strokeWidth="2.5"
          strokeLinecap="round" strokeLinejoin="round" filter="url(#lineglow)" />
      )}

      {/* Apex dot */}
      {progress > 0.48 && apexAcum && (
        <>
          <circle cx={retiroX} cy={toY(apexAcum.valor)} r={6} fill="white" stroke="#0071e3" strokeWidth="2.5" />
          <text x={retiroX + 10} y={toY(apexAcum.valor) - 8} fill="#0071e3" fontSize="10.5"
            fontFamily="-apple-system, Helvetica, sans-serif" fontWeight="600">
            {fmtShort(apexAcum.valor)}
          </text>
        </>
      )}
    </svg>
  );
}

// ─── STACKED BAR ─────────────────────────────────────────────────────────────

function StackedBar({ desglose }) {
  const { capitalActual, aportesBruto, totalRendimientos } = desglose;
  const total = capitalActual + aportesBruto + totalRendimientos; // == capRetiro
  const segments = [
    { label: "Capital inicial", value: capitalActual, color: "#0071e3", desc: "Lo que ya tenías hoy" },
    { label: "Aportes nominales", value: aportesBruto, color: "#34c759", desc: "Total aportado sin rendimiento" },
    { label: "Rendimientos totales", value: totalRendimientos, color: "#ff9500", desc: "Lo que trabajó tu dinero" },
  ];
  const pct = v => total > 0 ? Math.max(0, (v / total) * 100) : 0;

  return (
    <div>
      {/* Bar */}
      <div style={{ display: "flex", height: "8px", borderRadius: "100px", overflow: "hidden", background: "#f5f5f7", marginBottom: "1.4rem" }}>
        {segments.map(s => (
          <div key={s.label} style={{
            width: `${pct(s.value)}%`, background: s.color,
            transition: "width 0.9s cubic-bezier(.4,0,.2,1)",
            borderRight: pct(s.value) > 0 ? "2px solid white" : "none"
          }} />
        ))}
      </div>

      {/* Cards row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "1px", background: "#f0f0f5", borderRadius: "16px", overflow: "hidden" }}>
        {segments.map((s, i) => (
          <div key={s.label} style={{
            background: "white", padding: "1.1rem 1rem",
            borderRadius: i === 0 ? "16px 0 0 16px" : i === 2 ? "0 16px 16px 0" : "0"
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: "7px", marginBottom: "0.55rem" }}>
              <div style={{ width: 9, height: 9, borderRadius: "50%", background: s.color }} />
              <span style={{ fontSize: "0.7rem", color: "#86868b", fontFamily: "-apple-system, Helvetica, sans-serif" }}>{s.label}</span>
            </div>
            <div style={{ fontSize: "1.3rem", fontWeight: 700, color: "#1d1d1f", letterSpacing: "-0.03em", fontFamily: "-apple-system, Helvetica, sans-serif" }}>
              {fmtShort(s.value)}
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "4px" }}>
              <span style={{ fontSize: "0.68rem", color: "#c7c7cc", fontFamily: "-apple-system, Helvetica, sans-serif" }}>{s.desc}</span>
              <span style={{ fontSize: "0.7rem", color: s.color, fontWeight: 600, fontFamily: "-apple-system, Helvetica, sans-serif" }}>{pct(s.value).toFixed(1)}%</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── FIELD ───────────────────────────────────────────────────────────────────

function Field({ label, value, onChange, unit, min, max, step = "any", note }) {
  const [focused, setFocused] = useState(false);
  const [raw, setRaw] = useState(String(value));

  // Sync raw when value changes externally (e.g. mode switch)
  useEffect(() => {
    if (!focused) setRaw(String(value));
  }, [value, focused]);

  const handleChange = (e) => {
    const str = e.target.value;
    setRaw(str);
    const num = parseFloat(str);
    if (!isNaN(num)) onChange(num);
  };

  const handleBlur = () => {
    setFocused(false);
    // Normalize: remove leading zeros, fallback to min or 0
    const num = parseFloat(raw);
    const final = isNaN(num) ? (min ?? 0) : num;
    setRaw(String(final));
    onChange(final);
  };

  return (
    <div style={{ marginBottom: "0.65rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
        <label style={{ fontSize: "0.74rem", color: "#86868b", fontFamily: "-apple-system, Helvetica, sans-serif" }}>{label}</label>
        {note && <span style={{ fontSize: "0.65rem", color: "#c7c7cc", fontFamily: "-apple-system, Helvetica, sans-serif" }}>{note}</span>}
      </div>
      <div style={{
        display: "flex", alignItems: "center",
        background: focused ? "white" : "#f9f9fb",
        border: `1.5px solid ${focused ? "#0071e3" : "#e5e5ea"}`,
        borderRadius: "10px", overflow: "hidden",
        transition: "border-color 0.15s, box-shadow 0.15s",
        boxShadow: focused ? "0 0 0 3px rgba(0,113,227,0.13)" : "none",
      }}>
        <input
          type="text"
          inputMode="decimal"
          value={focused ? raw : String(value)}
          onChange={handleChange}
          onFocus={() => { setFocused(true); setRaw(String(value)); }}
          onBlur={handleBlur}
          style={{
            flex: 1, padding: "0.58rem 0.75rem", border: "none", background: "transparent",
            fontSize: "0.92rem", color: "#1d1d1f", outline: "none",
            fontFamily: "-apple-system, Helvetica, sans-serif",
          }} />
        {unit && <span style={{ padding: "0 0.75rem 0 0", fontSize: "0.78rem", color: "#86868b", whiteSpace: "nowrap", fontFamily: "-apple-system, Helvetica, sans-serif" }}>{unit}</span>}
      </div>
    </div>
  );
}

// ─── APP ─────────────────────────────────────────────────────────────────────

const DEFAULT = { edadActual: 30, edadRetiro: 65, vidaEsperada: 85, herencia: 100000, tasaPortfolio: 8, tasaRf: 4, inflacion: 3, capitalActual: 0 };

export default function App() {
  const [mode, setMode] = useState("renta");
  const [params, setParams] = useState(DEFAULT);
  const [modeVal, setModeVal] = useState(2000);
  const [result, setResult] = useState(null);
  const [triggerKey, setTriggerKey] = useState(0);

  const set = k => v => setParams(p => ({ ...p, [k]: v }));
  const handleMode = m => { setMode(m); setModeVal(m === "renta" ? 2000 : 5000); setResult(null); };

  const calculate = useCallback(() => {
    const { edadActual, edadRetiro, vidaEsperada } = params;
    if (edadRetiro <= edadActual || vidaEsperada <= edadRetiro) return;
    setResult(buildResult(params, mode, modeVal));
    setTriggerKey(k => k + 1);
  }, [params, mode, modeVal]);

  const rReal = toRealMonthly(params.tasaPortfolio, params.inflacion);
  const rfReal = toRealMonthly(params.tasaRf, params.inflacion);

  return (
    <>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        html { -webkit-font-smoothing: antialiased; }
        body { background: #f5f5f7; }
        input[type=number] { -moz-appearance: textfield; }
        input[type=number]::-webkit-outer-spin-button,
        input[type=number]::-webkit-inner-spin-button { -webkit-appearance: none; }
        .pill-btn { transition: all 0.18s !important; }
        .pill-btn:hover { opacity: 0.85; }
        .calc-btn { transition: background 0.15s, transform 0.1s !important; }
        .calc-btn:hover { background: #0077ed !important; }
        .calc-btn:active { transform: scale(0.98) !important; }
        @keyframes fadeUp { from { opacity:0; transform:translateY(14px) } to { opacity:1; transform:none } }
        @keyframes fadeIn { from { opacity:0 } to { opacity:1 } }
      `}</style>

      <div style={{ minHeight: "100vh", background: "#f5f5f7", padding: "3.5rem 1.5rem 5rem", fontFamily: "-apple-system, Helvetica, sans-serif" }}>

        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: "3rem" }}>
          <div style={{ fontSize: "0.75rem", fontWeight: 600, color: "#0071e3", letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: "0.65rem" }}>
            Planificación financiera personal
          </div>
          <h1 style={{ fontSize: "clamp(2.4rem, 5vw, 3.8rem)", fontWeight: 700, color: "#1d1d1f", letterSpacing: "-0.045em", lineHeight: 1.04, marginBottom: "0.8rem" }}>
            Calculadora Actuarial
          </h1>
          <p style={{ color: "#86868b", fontSize: "1.05rem", maxWidth: "380px", margin: "0 auto", lineHeight: 1.55 }}>
            Proyectá tu retiro en dólares reales.<br />Sin inflación, sin ilusiones.
          </p>
        </div>

        {/* Mode toggle */}
        <div style={{ display: "flex", justifyContent: "center", marginBottom: "2.8rem" }}>
          <div style={{ display: "inline-flex", background: "white", borderRadius: "100px", padding: "4px", boxShadow: "0 2px 16px rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.04)" }}>
            {[{ k: "renta", label: "¿Cuánto voy a cobrar?" }, { k: "ahorro", label: "¿Cuánto necesito ahorrar?" }].map(({ k, label }) => (
              <button key={k} className="pill-btn" onClick={() => handleMode(k)} style={{
                padding: "0.55rem 1.5rem", border: "none", borderRadius: "100px",
                background: mode === k ? "#1d1d1f" : "transparent",
                color: mode === k ? "white" : "#86868b",
                fontSize: "0.85rem", fontWeight: mode === k ? 600 : 400, cursor: "pointer",
              }}>{label}</button>
            ))}
          </div>
        </div>

        {/* Layout */}
        <div style={{ maxWidth: "1120px", margin: "0 auto", display: "grid", gridTemplateColumns: "300px 1fr", gap: "1.25rem", alignItems: "start" }}>

          {/* ── LEFT ── */}
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>

            <div style={{ background: "white", borderRadius: "20px", padding: "1.4rem", boxShadow: "0 2px 20px rgba(0,0,0,0.05), 0 0 0 1px rgba(0,0,0,0.03)" }}>
              <SectionLabel>Datos personales</SectionLabel>
              <Field label="Edad actual" value={params.edadActual} onChange={set("edadActual")} unit="años" min={18} max={80} step={1} />
              <Field label="Edad de retiro" value={params.edadRetiro} onChange={set("edadRetiro")} unit="años" min={30} max={90} step={1} />
              <Field label="Expectativa de vida" value={params.vidaEsperada} onChange={set("vidaEsperada")} unit="años" min={50} max={110} step={1} />
              <Field label="Herencia pretendida" value={params.herencia} onChange={set("herencia")} unit="USD" min={0} note="valor real" />
            </div>

            <div style={{ background: "white", borderRadius: "20px", padding: "1.4rem", boxShadow: "0 2px 20px rgba(0,0,0,0.05), 0 0 0 1px rgba(0,0,0,0.03)" }}>
              <SectionLabel>Parámetros financieros</SectionLabel>
              <Field label="Rendimiento del portfolio" value={params.tasaPortfolio} onChange={set("tasaPortfolio")} unit="% a.a." min={0} max={30} step={0.1} note="nominal" />
              <Field label="Tasa risk-free" value={params.tasaRf} onChange={set("tasaRf")} unit="% a.a." min={0} max={20} step={0.1} note="nominal" />
              <Field label="Inflación proyectada" value={params.inflacion} onChange={set("inflacion")} unit="% a.a." min={0} max={30} step={0.1} />
              <Field label="Capital actual" value={params.capitalActual} onChange={set("capitalActual")} unit="USD" min={0} />

              <div style={{ marginTop: "0.9rem", background: "#f9f9fb", borderRadius: "12px", padding: "0.85rem 1rem" }}>
                <div style={{ fontSize: "0.65rem", fontWeight: 600, color: "#c7c7cc", letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: "0.5rem" }}>Tasas reales implícitas</div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  {[["Portfolio", rReal], ["Risk-free", rfReal]].map(([l, v]) => (
                    <div key={l}>
                      <div style={{ fontSize: "0.68rem", color: "#86868b" }}>{l}</div>
                      <div style={{ fontSize: "0.88rem", fontWeight: 600, color: "#1d1d1f" }}>{(v * 100).toFixed(3)}% /mes</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div style={{ background: mode === "renta" ? "#f0f6ff" : "#f0fff5", borderRadius: "20px", padding: "1.4rem", boxShadow: "0 2px 20px rgba(0,0,0,0.04), 0 0 0 1px rgba(0,0,0,0.03)", border: `1px solid ${mode === "renta" ? "#c5d8f5" : "#b8ead0"}` }}>
              <SectionLabel color={mode === "renta" ? "#0071e3" : "#34c759"}>
                {mode === "renta" ? "Tu aporte mensual" : "Tu renta objetivo"}
              </SectionLabel>
              <Field
                label={mode === "renta" ? "Ahorro mensual" : "Renta deseada"}
                value={modeVal} onChange={setModeVal} unit="USD/mes" min={0} note="USD reales de hoy"
              />
              <button className="calc-btn" onClick={calculate} style={{
                width: "100%", padding: "0.85rem", marginTop: "0.35rem",
                background: "#0071e3", border: "none", borderRadius: "12px",
                color: "white", fontSize: "0.95rem", fontWeight: 600, cursor: "pointer",
                letterSpacing: "-0.01em",
              }}>Calcular</button>
            </div>
          </div>

          {/* ── RIGHT ── */}
          <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>

            {/* CHART CARD — siempre visible, protagonista */}
            <div style={{ background: "white", borderRadius: "24px", padding: "2rem 1.75rem 1.6rem", boxShadow: "0 4px 32px rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.04)" }}>

              {/* KPIs */}
              <div style={{ display: "flex", gap: "0", marginBottom: "2rem", flexWrap: "wrap", borderBottom: "1px solid #f0f0f5", paddingBottom: "1.5rem" }}>
                {result ? (
                  <>
                    <KPI
                      label={mode === "renta" ? "Renta mensual al retiro" : "Ahorro mensual necesario"}
                      value={fmtFull(mode === "renta" ? result.rentaMensual : result.ahorroMensual)}
                      sub="USD reales · mensual"
                      accent
                    />
                    <div style={{ width: "1px", background: "#f0f0f5", margin: "0 2rem", alignSelf: "stretch" }} />
                    <KPI label="Capital al retiro" value={fmtShort(result.capRetiro)} sub={`a los ${params.edadRetiro} años`} />
                    <div style={{ width: "1px", background: "#f0f0f5", margin: "0 2rem", alignSelf: "stretch" }} />
                    <KPI label="Herencia target" value={fmtShort(params.herencia)} sub={`a los ${params.vidaEsperada} años`} />
                  </>
                ) : (
                  <div style={{ display: "flex", alignItems: "center", height: "64px" }}>
                    <p style={{ color: "#d2d2d7", fontSize: "0.95rem" }}>Completá los parámetros y presioná Calcular →</p>
                  </div>
                )}
              </div>

              {/* Legend */}
              <div style={{ display: "flex", gap: "1.5rem", marginBottom: "0.6rem" }}>
                {[{ color: "#0071e3", label: `Acumulación · ${params.edadActual}–${params.edadRetiro} años` },
                  { color: "#ff6b35", label: `Desacumulación · ${params.edadRetiro}–${params.vidaEsperada} años` }].map(({ color, label }) => (
                  <div key={label} style={{ display: "flex", alignItems: "center", gap: "7px" }}>
                    <div style={{ width: "22px", height: "2.5px", background: color, borderRadius: "2px" }} />
                    <span style={{ fontSize: "0.72rem", color: "#86868b" }}>{label}</span>
                  </div>
                ))}
              </div>

              <Chart points={result?.points} edadRetiro={params.edadRetiro} triggerKey={triggerKey} />
            </div>

            {/* BREAKDOWN */}
            {result && (
              <div style={{ background: "white", borderRadius: "20px", padding: "1.6rem", boxShadow: "0 2px 20px rgba(0,0,0,0.05), 0 0 0 1px rgba(0,0,0,0.03)", animation: "fadeUp 0.45s cubic-bezier(.4,0,.2,1)" }}>
                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: "1.2rem" }}>
                  <div style={{ fontSize: "0.72rem", fontWeight: 600, color: "#86868b", letterSpacing: "0.07em", textTransform: "uppercase" }}>
                    Composición del capital al retiro
                  </div>
                  <div style={{ fontSize: "0.8rem", color: "#86868b" }}>
                    Total: <strong style={{ color: "#1d1d1f" }}>{fmtFull(result.capRetiro)}</strong>
                  </div>
                </div>
                <StackedBar desglose={result.desglose} />
              </div>
            )}

            <p style={{ fontSize: "0.68rem", color: "#c7c7cc", textAlign: "center", lineHeight: 1.7, padding: "0 1rem" }}>
              Supuestos: tasa real mensual durante acumulación · cartera 100% a risk-free al retiro · renta constante en términos reales · herencia conformada al fallecimiento por rendimientos residuales
            </p>
          </div>
        </div>
      </div>
    </>
  );
}

function SectionLabel({ children, color = "#86868b" }) {
  return (
    <div style={{ fontSize: "0.7rem", fontWeight: 600, color, letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: "0.9rem" }}>
      {children}
    </div>
  );
}

function KPI({ label, value, sub, accent }) {
  return (
    <div style={{ flex: accent ? "1.2" : "1", minWidth: 0 }}>
      <div style={{ fontSize: "0.72rem", color: "#86868b", marginBottom: "5px" }}>{label}</div>
      <div style={{ fontSize: accent ? "2rem" : "1.65rem", fontWeight: 700, color: accent ? "#0071e3" : "#1d1d1f", letterSpacing: "-0.045em", lineHeight: 1, whiteSpace: "nowrap" }}>
        {value}
      </div>
      <div style={{ fontSize: "0.72rem", color: "#86868b", marginTop: "4px" }}>{sub}</div>
    </div>
  );
}
