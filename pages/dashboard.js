import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/router";
import Head from "next/head";

const REFRESH = 30;

// ── Formato ───────────────────────────────────────────────────
function fmtHR(hps) {
  if (!hps || hps <= 0) return "0 H/s";
  const u = ["H/s","KH/s","MH/s","GH/s","TH/s","PH/s"];
  let i = 0, v = hps;
  while (v >= 1000 && i < u.length - 1) { v /= 1000; i++; }
  return `${v.toFixed(2)} ${u[i]}`;
}
function timeAgo(mins) {
  if (!isFinite(mins) || mins == null) return "—";
  const m = Math.round(mins);
  if (m < 1) return "ahora mismo";
  if (m === 1) return "hace 1 min";
  if (m < 60) return `hace ${m} min`;
  return `hace ${Math.round(m/60)}h`;
}
function truncAddr(addr) {
  if (!addr) return "";
  return addr.slice(0, 10) + "…" + addr.slice(-6);
}
function pct(val, total) {
  if (!total) return "—";
  return ((val/total)*100).toFixed(1) + "%";
}

// ── Componentes base ──────────────────────────────────────────
function Dot({ status }) {
  const c = { ok:"#3fb950", warn:"#d29922", crit:"#f85149", off:"#4a5260" }[status] || "#4a5260";
  return <span style={{display:"inline-block",width:8,height:8,borderRadius:"50%",flexShrink:0,
    background:c,boxShadow:status!=="off"?`0 0 6px ${c}`:"none"}}/>;
}

function StatRow({ label, value, valueStyle, highlight }) {
  return (
    <div className={`row ${highlight?"hl":""}`}>
      <span className="lbl">{label}</span>
      <span className="val" style={valueStyle}>{value ?? "—"}</span>
      <style jsx>{`
        .row { display:flex; justify-content:space-between; align-items:center;
               padding:7px 0; border-bottom:1px solid var(--border); }
        .row:last-child { border-bottom:none; }
        .row.hl { background:var(--surface2); margin:0 -22px; padding:7px 22px; }
        .lbl { font-size:.78rem; color:var(--muted); }
        .val { font-size:.85rem; font-weight:500; font-variant-numeric:tabular-nums; text-align:right; }
      `}</style>
    </div>
  );
}

function Card({ children, style }) {
  return (
    <div className="card" style={style}>
      {children}
      <style jsx>{`
        .card { background:var(--surface); border:1px solid var(--border2);
                border-radius:var(--r); padding:20px 22px; }
      `}</style>
    </div>
  );
}

function SectionTitle({ children }) {
  return <h2 style={{fontSize:".68rem",fontWeight:600,letterSpacing:".12em",
    textTransform:"uppercase",color:"var(--dim)",marginBottom:14}}>{children}</h2>;
}

function Badge({ label, bg, fg }) {
  return <span style={{display:"inline-block",fontSize:".62rem",fontWeight:700,
    letterSpacing:".08em",textTransform:"uppercase",padding:"3px 9px",
    borderRadius:20,background:bg,color:fg,marginBottom:14}}>{label}</span>;
}

// ── Tab navigation ────────────────────────────────────────────
function Tabs({ active, onChange }) {
  const tabs = [
    { id:"resumen",  label:"⛏️ Resumen" },
    { id:"pool",     label:"🌊 Public Pool" },
    { id:"odds",     label:"🎰 Probabilidad" },
  ];
  return (
    <div className="tabs">
      {tabs.map(t => (
        <button key={t.id} className={`tab ${active===t.id?"on":""}`}
          onClick={() => onChange(t.id)}>{t.label}</button>
      ))}
      <style jsx>{`
        .tabs { display:flex; gap:4px; border-bottom:1px solid var(--border2);
                padding:0 24px; background:var(--surface); overflow-x:auto; }
        .tab { background:none; border:none; border-bottom:2px solid transparent;
               color:var(--muted); padding:14px 16px; font-size:.85rem; cursor:pointer;
               white-space:nowrap; transition:color .15s, border-color .15s; }
        .tab.on { color:var(--text); border-bottom-color:var(--green); font-weight:600; }
        .tab:hover:not(.on) { color:var(--text); }
      `}</style>
    </div>
  );
}

// ── Tab: Resumen ──────────────────────────────────────────────
function TabResumen({ data }) {
  const { miners=[], publicPool, ckpool, netDiffFmt, odds } = data;
  const pp = publicPool?.online ? publicPool : null;

  return (
    <div className="wrap">
      {/* KPIs rápidos */}
      <div className="kpis">
        <div className="kpi">
          <div className="kpi-label">HASHRATE AHORA</div>
          <div className="kpi-val green">{pp ? pp.hashFmt10m : "—"}</div>
          <div className="kpi-sub">Último 10 min · public-pool</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">HASHRATE 1H</div>
          <div className="kpi-val">{pp ? pp.hashFmt1h : "—"}</div>
          <div className="kpi-sub">Promedio última hora</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">MEJOR SHARE</div>
          <div className="kpi-val gold">{pp ? pp.bestEverFmt : "—"}</div>
          <div className="kpi-sub">Histórico all-time</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">DIFICULTAD RED</div>
          <div className="kpi-val">{netDiffFmt || "—"}</div>
          <div className="kpi-sub">Bitcoin mainnet</div>
        </div>
      </div>

      {/* Hardware */}
      {miners.length > 0 && (
        <section>
          <SectionTitle>Equipos · Hardware</SectionTitle>
          <div className="grid g2">
            {miners.map((m,i) => <MinerCard key={i} m={m}/>)}
          </div>
        </section>
      )}

      {/* Pool resumen */}
      {pp && (
        <section>
          <SectionTitle>Pool · Actividad reciente</SectionTitle>
          <Card>
            <Badge label="public-pool.io" bg="var(--blue-bg)" fg="var(--blue)"/>
            <div className="grid g3">
              <StatRow label="Workers activos"     value={pp.workerCount}/>
              <StatRow label="Shares totales"      value={pp.shares?.toLocaleString("es-CO")}/>
              <StatRow label="Shares (10 min)"     value={pp.sharesLast10m}/>
              <StatRow label="Shares (1 hora)"     value={pp.sharesLastHour}/>
              <StatRow label="Última share"        value={timeAgo(pp.minsSinceShare)}
                valueStyle={pp.minsSinceShare>15?{color:"var(--red)"}:{color:"var(--green)"}}/>
              <StatRow label="Candidatos de bloque" value={pp.blockCandidates}/>
            </div>
          </Card>
        </section>
      )}

      {/* Odds resumen */}
      {odds && (
        <section>
          <SectionTitle>Probabilidad · Vista rápida</SectionTitle>
          <OddsCard odds={odds} netDiffFmt={netDiffFmt} compact/>
        </section>
      )}

      <style jsx>{`
        .wrap { display:flex; flex-direction:column; gap:28px; }
        .kpis { display:grid; grid-template-columns:repeat(auto-fill,minmax(180px,1fr)); gap:12px; }
        .kpi { background:var(--surface); border:1px solid var(--border2);
               border-radius:var(--r); padding:18px 20px; }
        .kpi-label { font-size:.62rem; font-weight:600; letter-spacing:.1em;
                     text-transform:uppercase; color:var(--dim); margin-bottom:6px; }
        .kpi-val { font-size:1.6rem; font-weight:800; letter-spacing:-.03em;
                   font-variant-numeric:tabular-nums; color:var(--text); }
        .kpi-val.green { color:var(--green); }
        .kpi-val.gold  { color:var(--gold); }
        .kpi-sub { font-size:.7rem; color:var(--dim); margin-top:4px; }
        section { display:flex; flex-direction:column; gap:0; }
        .grid { display:grid; gap:12px; }
        .g2 { grid-template-columns:repeat(auto-fill,minmax(290px,1fr)); }
        .g3 { grid-template-columns:1fr; }
      `}</style>
    </div>
  );
}

// ── Tab: Public Pool ──────────────────────────────────────────
function TabPool({ data }) {
  const pp = data.publicPool;
  const addr = data.address;

  if (!pp?.online) return (
    <Card><p style={{color:"var(--muted)",padding:"12px 0"}}>Sin datos de public-pool todavía.<br/>
    <small style={{color:"var(--dim)"}}>{pp?.error}</small></p></Card>
  );

  const { hashFmt10m, hashFmt1h, workerCount, shares, sharesLast10m, sharesLastHour,
          bestEverFmt, minsSinceShare, blockCandidates, blockProgressPct, workers } = pp;

  return (
    <div className="wrap">
      <div className="grid g2">
        {/* Hashrate */}
        <Card>
          <Badge label="public-pool.io" bg="var(--blue-bg)" fg="var(--blue)"/>
          <div className="big-hr">{hashFmt10m}</div>
          <div className="big-sub">Hashrate últimos 10 min</div>
          <div style={{height:12}}/>
          <StatRow label="Hashrate 1 hora"    value={hashFmt1h}/>
          <StatRow label="Workers activos"    value={workerCount}/>
          <StatRow label="Candidatos bloque"  value={blockCandidates}/>
        </Card>

        {/* Shares */}
        <Card>
          <div className="sec-title">Actividad de shares</div>
          <StatRow label="Total histórico"     value={shares?.toLocaleString("es-CO")} highlight/>
          <StatRow label="Últimos 10 min"      value={sharesLast10m}/>
          <StatRow label="Última hora"         value={sharesLastHour}/>
          <StatRow label="Última share"
            value={timeAgo(minsSinceShare)}
            valueStyle={minsSinceShare>15?{color:"var(--red)"}:{color:"var(--green)"}}/>
          <StatRow label="Mejor share histórica" value={<span style={{color:"var(--gold)",fontWeight:700}}>{bestEverFmt}</span>}/>
          {blockProgressPct && <StatRow label="% hacia un bloque" value={blockProgressPct+"%"}/>}
        </Card>
      </div>

      {/* Workers */}
      {workers?.length > 0 && (
        <Card>
          <div className="sec-title">Workers conectados</div>
          <div className="workers-table">
            <div className="wh">Worker</div>
            <div className="wh">Hashrate</div>
            <div className="wh">Mejor share</div>
            <div className="wh">Última share</div>
            <div className="wh">Modo</div>
            {workers.map((w,i) => (
              <>
                <div key={`n${i}`} className="wc name">{w.name}</div>
                <div key={`h${i}`} className="wc green">{w.hashFmt}</div>
                <div key={`b${i}`} className="wc gold">{w.bestEverFmt}</div>
                <div key={`s${i}`} className="wc"
                  style={w.minsSinceShare>15?{color:"var(--red)"}:{}}>{timeAgo(w.minsSinceShare)}</div>
                <div key={`m${i}`} className="wc dim">{w.payoutMode}</div>
              </>
            ))}
          </div>
        </Card>
      )}

      {/* Link directo */}
      <Card>
        <div className="sec-title">Ver en public-pool.io</div>
        <p style={{fontSize:".82rem",color:"var(--muted)",marginBottom:14}}>
          Abre la interfaz completa de public-pool con tu dirección BTC.
        </p>
        <a href={`https://web.public-pool.io/#/app/${addr}`} target="_blank" rel="noreferrer"
          className="ext-btn">
          Abrir public-pool.io →
        </a>
      </Card>

      <style jsx>{`
        .wrap { display:flex; flex-direction:column; gap:16px; }
        .grid { display:grid; gap:14px; }
        .g2 { grid-template-columns:repeat(auto-fill,minmax(300px,1fr)); }
        .big-hr { font-size:2.2rem; font-weight:800; letter-spacing:-.04em;
                  color:var(--blue); font-variant-numeric:tabular-nums; margin-bottom:4px; }
        .big-sub { font-size:.72rem; color:var(--dim); margin-bottom:8px; }
        .sec-title { font-size:.68rem; font-weight:600; letter-spacing:.1em;
                     text-transform:uppercase; color:var(--dim); margin-bottom:14px; }
        .workers-table { display:grid; grid-template-columns:2fr 1fr 1fr 1fr 1fr; gap:0; }
        .wh { font-size:.65rem; font-weight:600; letter-spacing:.08em; text-transform:uppercase;
              color:var(--dim); padding:6px 8px 10px 0; border-bottom:1px solid var(--border2); }
        .wc { font-size:.82rem; padding:8px 8px 8px 0; border-bottom:1px solid var(--border);
              font-variant-numeric:tabular-nums; color:var(--text); }
        .wc:last-of-type { border-bottom:none; }
        .wc.green { color:var(--green); font-weight:600; }
        .wc.gold  { color:var(--gold); }
        .wc.dim   { color:var(--dim); font-size:.75rem; }
        .wc.name  { font-weight:600; }
        .ext-btn {
          display:inline-block; background:var(--blue-bg); color:var(--blue);
          border:1px solid var(--blue); padding:10px 20px; border-radius:var(--r-sm);
          font-size:.85rem; font-weight:600; text-decoration:none;
          transition:opacity .15s;
        }
        .ext-btn:hover { opacity:.8; text-decoration:none; }
      `}</style>
    </div>
  );
}

// ── Tab: Probabilidad ─────────────────────────────────────────
function TabOdds({ data }) {
  const { odds, netDiffFmt, publicPool } = data;
  if (!odds) return <Card><p style={{color:"var(--muted)",padding:"12px 0"}}>
    Sin datos suficientes para calcular probabilidades.</p></Card>;

  const { oneInDays, years, perDay } = odds;
  const hps = publicPool?.online ? (publicPool.hashHps10m || publicPool.hashHps1h) : 0;

  // Tabla de probabilidades acumuladas
  const periods = [
    { label:"1 día",    days:1 },
    { label:"1 semana", days:7 },
    { label:"1 mes",    days:30 },
    { label:"3 meses",  days:90 },
    { label:"6 meses",  days:180 },
    { label:"1 año",    days:365 },
    { label:"5 años",   days:1825 },
    { label:"10 años",  days:3650 },
  ].map(p => ({
    ...p,
    prob: (1 - Math.pow(1 - perDay, p.days)) * 100,
  }));

  return (
    <div className="wrap">
      {/* Número grande */}
      <Card>
        <div className="big-wrap">
          <div>
            <div className="odds-label">PROBABILIDAD POR DÍA</div>
            <div className="odds-num">1 / {oneInDays.toLocaleString("es-CO")}</div>
            <div className="odds-sub">Con {fmtHR(hps)} de hashrate</div>
          </div>
          <div className="years-box">
            <div className="years-num">~{Math.round(years).toLocaleString("es-CO")}</div>
            <div className="years-lbl">años promedio</div>
          </div>
        </div>
        <div className="disclaimer">
          ⚡ Esto es estadística pura — podrías ganar mañana o nunca.
          El premio actual es ~3.125 BTC por bloque.
        </div>
      </Card>

      {/* Tabla acumulada */}
      <Card>
        <div className="sec-title">Probabilidad acumulada por período</div>
        <div className="prob-table">
          <div className="ph">Período</div>
          <div className="ph">% de ganar</div>
          <div className="ph">1 en...</div>
          {periods.map((p,i) => {
            const pctVal = p.prob;
            const barW = Math.min(pctVal * 3, 100);
            const color = pctVal > 50 ? "var(--green)" : pctVal > 10 ? "var(--yellow)" : "var(--blue)";
            return (
              <>
                <div key={`l${i}`} className="pc">{p.label}</div>
                <div key={`p${i}`} className="pc">
                  <div className="bar-wrap">
                    <div className="bar" style={{width:`${barW}%`,background:color}}/>
                    <span style={{color}}>{pctVal < 0.01 ? pctVal.toExponential(2) : pctVal.toFixed(2)}%</span>
                  </div>
                </div>
                <div key={`o${i}`} className="pc dim">
                  1 en {Math.round(1/(p.prob/100)).toLocaleString("es-CO")}
                </div>
              </>
            );
          })}
        </div>
      </Card>

      {/* Info de contexto */}
      <Card>
        <div className="sec-title">Contexto de la red</div>
        <StatRow label="Dificultad de red"         value={netDiffFmt}/>
        <StatRow label="Hashrate usado para cálculo" value={fmtHR(hps)}/>
        <StatRow label="Mejor share histórica"      value={<span style={{color:"var(--gold)"}}>{publicPool?.bestEverFmt}</span>}/>
        <StatRow label="Premio por bloque"          value="~3.125 BTC"/>
        <StatRow label="% de la dificultad alcanzado"
          value={publicPool?.online && data.netDiff && publicPool.bestEver
            ? ((publicPool.bestEver / data.netDiff) * 100).toExponential(3) + "%"
            : "—"}/>
      </Card>

      <style jsx>{`
        .wrap { display:flex; flex-direction:column; gap:16px; }
        .big-wrap { display:flex; justify-content:space-between; align-items:center;
                    gap:20px; flex-wrap:wrap; margin-bottom:16px; }
        .odds-label { font-size:.62rem; font-weight:600; letter-spacing:.1em;
                      text-transform:uppercase; color:var(--dim); margin-bottom:6px; }
        .odds-num { font-size:2.4rem; font-weight:800; letter-spacing:-.04em;
                    color:var(--gold); font-variant-numeric:tabular-nums; }
        .odds-sub { font-size:.72rem; color:var(--dim); margin-top:4px; }
        .years-box { text-align:center; background:var(--surface2);
                     border:1px solid var(--border2); border-radius:var(--r);
                     padding:16px 24px; }
        .years-num { font-size:2rem; font-weight:800; color:var(--text);
                     font-variant-numeric:tabular-nums; }
        .years-lbl { font-size:.72rem; color:var(--dim); margin-top:2px; }
        .disclaimer { font-size:.75rem; color:var(--dim); line-height:1.6;
                      padding:12px 14px; background:var(--surface2); border-radius:var(--r-sm); }
        .sec-title { font-size:.68rem; font-weight:600; letter-spacing:.1em;
                     text-transform:uppercase; color:var(--dim); margin-bottom:14px; }
        .prob-table { display:grid; grid-template-columns:1fr 2fr 1fr; gap:0; }
        .ph { font-size:.65rem; font-weight:600; letter-spacing:.08em; text-transform:uppercase;
              color:var(--dim); padding:6px 8px 10px 0; border-bottom:1px solid var(--border2); }
        .pc { font-size:.82rem; padding:9px 8px 9px 0; border-bottom:1px solid var(--border);
              font-variant-numeric:tabular-nums; color:var(--text); display:flex; align-items:center; }
        .pc.dim { color:var(--muted); }
        .bar-wrap { display:flex; align-items:center; gap:8px; width:100%; }
        .bar { height:6px; border-radius:3px; min-width:2px; flex-shrink:0; }
      `}</style>
    </div>
  );
}

// ── Card: minero ──────────────────────────────────────────────
function MinerCard({ m }) {
  const status = !m.online ? "off" : m.temp >= 75 ? "crit" : m.temp >= 68 ? "warn" : "ok";
  const tempColor = { crit:"var(--red)", warn:"var(--yellow)" }[status] || "var(--text)";

  return (
    <div className="card">
      <div className="head">
        <div className="name-row"><Dot status={status}/><span className="name">{m.name}</span></div>
        {m.online && <span className="model">{m.model}</span>}
      </div>

      {!m.online ? (
        <div className="offline-box">
          <div className="offline-icon">📡</div>
          <div className="offline-title">Minero no alcanzable desde la nube</div>
          <div className="offline-text">
            La IP <code>{m.url || "192.168.11.48"}</code> es local. Para ver temperatura
            y hardware en tiempo real, instala <strong>Tailscale</strong> en tu router.
          </div>
          <div className="offline-text" style={{marginTop:6,color:"var(--green)"}}>
            ✅ Los datos del pool sí funcionan desde cualquier lugar.
          </div>
        </div>
      ) : (
        <>
          <div className="hashrate">{m.hashFmt}</div>
          <StatRow label="Temperatura chip" value={`${m.temp}°C`} valueStyle={{color:tempColor}}/>
          <StatRow label="Temperatura VR"   value={`${m.vrTemp}°C`}/>
          <StatRow label="Potencia"         value={`${m.power?.toFixed(0)} W`}/>
          <StatRow label="Ventilador"       value={`${m.fanrpm?.toLocaleString()} rpm`}/>
          <StatRow label="Mejor share"      value={m.bestDiff}/>
          <StatRow label="Shares aceptadas" value={m.sharesAccepted?.toLocaleString()}/>
          <StatRow label="Frecuencia"       value={`${m.frequency} MHz`}/>
          <StatRow label="Uptime"           value={m.uptimeFmt}/>
        </>
      )}
      <style jsx>{`
        .card { background:var(--surface); border:1px solid var(--border2);
                border-radius:var(--r); padding:20px 22px; }
        .head { display:flex; justify-content:space-between; align-items:center; margin-bottom:14px; }
        .name-row { display:flex; align-items:center; gap:8px; }
        .name { font-size:.95rem; font-weight:600; }
        .model { font-size:.7rem; color:var(--dim); }
        .hashrate { font-size:2rem; font-weight:800; letter-spacing:-.04em;
                    color:var(--green); margin-bottom:14px; font-variant-numeric:tabular-nums; }
        .offline-box { background:var(--surface2); border-radius:var(--r-sm);
                       padding:16px; border:1px solid var(--border2); }
        .offline-icon { font-size:1.6rem; margin-bottom:8px; }
        .offline-title { font-size:.85rem; font-weight:600; margin-bottom:6px; color:var(--muted); }
        .offline-text { font-size:.75rem; color:var(--dim); line-height:1.6; }
        code { background:var(--surface3); padding:1px 5px; border-radius:4px;
               font-size:.72rem; color:var(--text); }
      `}</style>
    </div>
  );
}

// ── Card: odds compacto ───────────────────────────────────────
function OddsCard({ odds, netDiffFmt, compact }) {
  if (!odds) return null;
  const { oneInDays, years, perDay } = odds;
  return (
    <Card>
      <div className="row">
        <div>
          <div className="lbl">POR DÍA</div>
          <div className="num">1 / {oneInDays.toLocaleString("es-CO")}</div>
        </div>
        <div style={{textAlign:"right"}}>
          <div className="lbl">PROMEDIO</div>
          <div className="num2">~{Math.round(years).toLocaleString("es-CO")} años</div>
        </div>
      </div>
      {!compact && <>
        <StatRow label="% de chance por día" value={`${(perDay*100).toExponential(2)}%`}/>
        <StatRow label="Premio estimado"      value={<span style={{color:"var(--gold)"}}>~3.125 BTC 🍀</span>}/>
        <StatRow label="Dificultad de red"    value={netDiffFmt}/>
      </>}
      <style jsx>{`
        .row { display:flex; justify-content:space-between; align-items:center; margin-bottom:14px; }
        .lbl { font-size:.62rem; font-weight:600; letter-spacing:.1em;
               text-transform:uppercase; color:var(--dim); margin-bottom:4px; }
        .num { font-size:1.8rem; font-weight:800; color:var(--gold);
               letter-spacing:-.03em; font-variant-numeric:tabular-nums; }
        .num2 { font-size:1.2rem; font-weight:700; color:var(--text);
                font-variant-numeric:tabular-nums; }
      `}</style>
    </Card>
  );
}

// ── Dashboard principal ───────────────────────────────────────
export default function Dashboard() {
  const router = useRouter();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [countdown, setCountdown] = useState(REFRESH);
  const [tab, setTab] = useState("resumen");
  const timerRef = useRef(null);
  const cdRef    = useRef(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/status");
      if (res.status === 401) { router.replace("/"); return; }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData(await res.json());
      setError(null);
      setLastUpdate(new Date());
      setCountdown(REFRESH);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    fetchData();
    timerRef.current = setInterval(fetchData, REFRESH * 1000);
    return () => clearInterval(timerRef.current);
  }, [fetchData]);

  useEffect(() => {
    cdRef.current = setInterval(() => setCountdown(c => c<=1 ? REFRESH : c-1), 1000);
    return () => clearInterval(cdRef.current);
  }, []);

  async function logout() {
    await fetch("/api/logout", { method:"POST" });
    router.push("/");
  }

  const miners = data?.miners ?? [];
  const onlineMiners = miners.filter(m => m.online).length;
  const ppOnline = data?.publicPool?.online;
  const lastShareLate = ppOnline && data.publicPool.minsSinceShare > 15;

  return (
    <>
      <Head>
        <title>⛏️ Minero Dashboard</title>
        <meta name="viewport" content="width=device-width, initial-scale=1"/>
        <meta name="robots" content="noindex,nofollow"/>
      </Head>

      <div className="root">
        {/* Header */}
        <header>
          <div className="hl">
            <span className="logo">⛏️</span>
            <span className="title">Minero</span>
            {data?.address && <span className="addr">{truncAddr(data.address)}</span>}
            {ppOnline && (
              <span className={`pill ${lastShareLate?"red":"green"}`}>
                {lastShareLate ? "⚠ Sin share +15min" : "● Pool activo"}
              </span>
            )}
          </div>
          <div className="hr-hdr">
            {error && <span className="err-b">⚠ {error}</span>}
            {lastUpdate && !loading && (
              <span className="upd">{lastUpdate.toLocaleTimeString("es-CO")} · {countdown}s</span>
            )}
            <button className="btn-r" onClick={fetchData} title="Actualizar">↻</button>
            <button className="btn-out" onClick={logout}>Salir</button>
          </div>
        </header>

        <Tabs active={tab} onChange={setTab}/>

        <main>
          {loading ? (
            <Skeleton/>
          ) : (
            <>
              {tab === "resumen" && <TabResumen data={data}/>}
              {tab === "pool"    && <TabPool    data={data}/>}
              {tab === "odds"    && <TabOdds    data={data}/>}
            </>
          )}
        </main>
      </div>

      <style jsx>{`
        .root { min-height:100vh; display:flex; flex-direction:column; }
        header {
          position:sticky; top:0; z-index:20;
          background:var(--surface); border-bottom:1px solid var(--border2);
          padding:0 24px; height:54px;
          display:flex; align-items:center; justify-content:space-between; gap:12px;
        }
        .hl, .hr-hdr { display:flex; align-items:center; gap:10px; flex-wrap:wrap; }
        .logo  { font-size:1.1rem; }
        .title { font-size:.95rem; font-weight:700; letter-spacing:-.02em; }
        .addr  { font-size:.72rem; color:var(--muted); font-family:monospace;
                 background:var(--surface3); padding:3px 8px; border-radius:20px; }
        .pill  { font-size:.7rem; font-weight:600; padding:3px 10px; border-radius:20px; }
        .pill.green { background:var(--green-bg); color:var(--green); }
        .pill.red   { background:var(--red-bg);   color:var(--red); }
        .upd   { font-size:.72rem; color:var(--dim); white-space:nowrap; }
        .err-b { font-size:.72rem; color:var(--red); padding:3px 8px;
                 background:var(--red-bg); border-radius:6px; }
        .btn-r { background:none; border:1px solid var(--border2); color:var(--muted);
                 width:30px; height:30px; border-radius:var(--r-sm); cursor:pointer;
                 font-size:1rem; display:flex; align-items:center; justify-content:center;
                 transition:border-color .15s,color .15s; }
        .btn-r:hover { border-color:var(--text); color:var(--text); }
        .btn-out { background:none; border:1px solid var(--border2); color:var(--muted);
                   padding:5px 14px; border-radius:var(--r-sm); cursor:pointer; font-size:.78rem;
                   transition:border-color .15s,color .15s; }
        .btn-out:hover { border-color:var(--red); color:var(--red); }
        main { max-width:1200px; margin:0 auto; padding:24px 24px 48px; width:100%; }

        @media (max-width:600px) {
          header { padding:0 14px; height:auto; min-height:54px; padding:10px 14px; }
          main   { padding:16px 12px 40px; }
          .addr, .upd { display:none; }
        }
      `}</style>
    </>
  );
}

function Skeleton() {
  return (
    <div style={{display:"grid",gap:14,gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))"}}>
      {[1,2,3,4].map(i=>(
        <div key={i} style={{background:"var(--surface)",border:"1px solid var(--border2)",
          borderRadius:"var(--r)",padding:22}}>
          {[1,2,3].map(j=><div key={j} style={{height:14,background:"var(--surface3)",
            borderRadius:6,marginBottom:12,width:j===2?"55%":"100%",
            animation:"pulse 1.5s ease-in-out infinite"}}/>)}
        </div>
      ))}
      <style jsx global>{`@keyframes pulse{0%,100%{opacity:.3}50%{opacity:.7}}`}</style>
    </div>
  );
}
