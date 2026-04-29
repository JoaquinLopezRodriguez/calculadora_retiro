import React, { useState, useCallback, useRef, useEffect } from "react";

// --- MATH ENGINE ---
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

  const capitalFV = capitalActual * Math.pow(1 + rReal, mesesAcum);
  const aportesBruto = ahorroMensual * mesesAcum;
  const aportesFV = Math.abs(rReal) < 1e-10 ? aportesBruto : ahorroMensual * (Math.pow(1 + rReal, mesesAcum) - 1) / rReal;
  const rendimientoCapital = capitalFV - capitalActual;
  const rendimientoAportes = aportesFV - aportesBruto;
  const totalRendimientos = rendimientoCapital + rendimientoAportes;

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

// --- FORMAT ---
const fmtShort = (n) => {
  if (n === null || isNaN(n) || !isFinite(n)) return "—";
  if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (Math.abs(n) >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
};
const fmtFull = (n) => {
  if (n == null || isNaN(n) || !isFinite(n)) return "—";
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
};

// --- CHART COMPONENT ---
function Chart({ points, edadRetiro, triggerKey }) {
  const [progress, setProgress] = useState(0);
  const rafRef = useRef(null);

  useEffect(() => {
    cancelAnimationFrame(rafRef.current);
    setProgress(0);
    const start = performance.now();
    const dur = 1000;
    const tick = (now) => {
      const t = Math.min((now - start) / dur, 1);
      setProgress(t);
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [triggerKey]);

  if (!points || points.length === 0) return null;

  const W = 600, H = 250;
  const PAD = { t: 20, r: 20, b: 30, l: 60 };
  const cw = W - PAD.l - PAD.r, ch = H - PAD.t - PAD.b;

  const maxVal = Math.max(...points.map(p => p.valor));
  const minAge = points[0].edad, maxAge = points[points.length - 1].edad;
  const toX = a => PAD.l + ((a - minAge) / (maxAge - minAge)) * cw;
  const toY = v => PAD.t + ch - (v / maxVal) * ch;

  const line = (pts) => pts.length < 2 ? "" : pts.map((p, i) =>
    `${i === 0 ? "M" : "L"}${toX(p.edad)},${toY(p.valor)}`).join(" ");

  const visiblePoints = points.slice(0, Math.floor(progress * points.length));

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto" }}>
      <line x1={PAD.l} x2={W - PAD.r} y1={PAD.t + ch} y2={PAD.t + ch} stroke="#e5e5ea" />
      <path d={line(visiblePoints)} fill="none" stroke="#0071e3" strokeWidth="3" strokeLinejoin="round" />
      <line x1={toX(edadRetiro)} x2={toX(edadRetiro)} y1={PAD.t} y2={PAD.t + ch} stroke="#ff3b30" strokeDasharray="4" />
      <text x={toX(edadRetiro)} y={PAD.t - 5} textAnchor="middle" fontSize="10" fill="#ff3b30" fontWeight="bold">RETIRO</text>
    </svg>
  );
}

// --- MAIN APP ---
export default function ActuarialApp() {
  const [params, setParams] = useState({ 
    edadActual: 30, edadRetiro: 65, vidaEsperada: 85, herencia: 50000, 
    tasaPortfolio: 8, tasaRf: 4, inflacion: 3, capitalActual: 10000 
  });
  const [mode, setMode] = useState("renta");
  const [modeVal, setModeVal] = useState(500);
  const [result, setResult] = useState(null);
  const [triggerKey, setTriggerKey] = useState(0);

  const calculate = () => {
    setResult(buildResult(params, mode, modeVal));
    setTriggerKey(prev => prev + 1);
  };

  return (
    <div style={{ maxWidth: "900px", margin: "2rem auto", padding: "1.5rem", fontFamily: "sans-serif", backgroundColor: "#fff", borderRadius: "16px", boxShadow: "0 10px 30px rgba(0,0,0,0.1)" }}>
      <header style={{ textAlign: "center", marginBottom: "2rem" }}>
        <h1 style={{ margin: 0, color: "#1d1d1f" }}>Calculadora Actuarial</h1>
        <p style={{ color: "#86868b" }}>Proyección de retiro en dólares reales</p>
      </header>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "2rem" }}>
        {/* Panel de Control */}
        <section style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div style={{ padding: "1rem", backgroundColor: "#f5f5f7", borderRadius: "12px" }}>
            <h3 style={{ fontSize: "0.9rem", marginBottom: "1rem" }}>Parámetros</h3>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
              <Input label="Edad Actual" value={params.edadActual} onChange={v => setParams({...params, edadActual: v})} />
              <Input label="Edad Retiro" value={params.edadRetiro} onChange={v => setParams({...params, edadRetiro: v})} />
              <Input label="Rendimiento %" value={params.tasaPortfolio} onChange={v => setParams({...params, tasaPortfolio: v})} />
              <Input label="Inflación %" value={params.inflacion} onChange={v => setParams({...params, inflacion: v})} />
            </div>
            <Input label="Capital Inicial (USD)" value={params.capitalActual} onChange={v => setParams({...params, capitalActual: v})} />
          </div>

          <div style={{ padding: "1rem", backgroundColor: "#eef6ff", borderRadius: "12px", border: "1px solid #0071e3" }}>
            <select value={mode} onChange={e => setMode(e.target.value)} style={{ width: "100%", padding: "8px", borderRadius: "6px", marginBottom: "10px" }}>
              <option value="renta">Quiero aportar (USD/mes)</option>
              <option value="ahorro">Quiero cobrar (USD/mes)</option>
            </select>
            <input type="number" value={modeVal} onChange={e => setModeVal(Number(e.target.value))} style={{ width: "100%", padding: "12px", boxSizing: "border-box", borderRadius: "8px", border: "1px solid #ccc" }} />
          </div>

          <button onClick={calculate} style={{ padding: "15px", backgroundColor: "#0071e3", color: "white", border: "none", borderRadius: "10px", fontWeight: "bold", cursor: "pointer" }}>Calcular Proyección</button>
        </section>

        {/* Resultados */}
        <section>
          {result ? (
            <div style={{ animation: "fadeIn 0.5s" }}>
              <div style={{ marginBottom: "1rem" }}>
                <span style={{ fontSize: "0.8rem", color: "#86868b" }}>{mode === "renta" ? "RENTA MENSUAL ESTIMADA" : "AHORRO MENSUAL NECESARIO"}</span>
                <div style={{ fontSize: "2.5rem", fontWeight: "bold", color: "#0071e3" }}>{fmtFull(mode === "renta" ? result.rentaMensual : result.ahorroMensual)}</div>
              </div>
              <div style={{ display: "flex", gap: "20px", marginBottom: "1rem" }}>
                <div>
                  <span style={{ fontSize: "0.7rem", color: "#86868b" }}>CAPITAL AL RETIRO</span>
                  <div style={{ fontWeight: "bold" }}>{fmtFull(result.capRetiro)}</div>
                </div>
              </div>
              <Chart points={result.points} edadRetiro={params.edadRetiro} triggerKey={triggerKey} />
            </div>
          ) : (
            <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "#c7c7cc", border: "2px dashed #e5e5ea", borderRadius: "12px" }}>
              Presiona calcular para ver los resultados
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function Input({ label, value, onChange }) {
  return (
    <div style={{ marginBottom: "8px" }}>
      <label style={{ fontSize: "0.7rem", display: "block", color: "#86868b" }}>{label}</label>
      <input type="number" value={value} onChange={e => onChange(Number(e.target.value))} style={{ width: "100%", padding: "8px", boxSizing: "border-box", borderRadius: "6px", border: "1px solid #d2d2d7" }} />
    </div>
  );
}
