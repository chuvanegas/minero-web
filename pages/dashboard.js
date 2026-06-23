import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/router";
import Head from "next/head";

const REFRESH = 30; // segundos entre actualizaciones

// ── Helpers de formato (client-side) ──────────────────────────
function fmtHR(hps) {
  if (!hps || hps <= 0) return "0 H/s";
  const u = ["H/s","KH/s","MH/s","GH/s","TH/s","PH/s"];
  let i = 0, v = hps;
  while (v >= 1000 && i < u.length - 1) { v /= 1000; i++; }
  return `${v.toFixed(2)} ${u[i]}`;
}
function timeAgo(mins) {
  if (!isFinite(mins)) return "—";
  const m = Math.round(mins);
  if (m < 1) return "ahora mismo";
  if (m === 1) return "hace 1 min";
  return `hace ${m} min`;
}
function truncAddr(addr) {
  if (!addr) return "";
  return addr.slice(0, 8) + "…" + addr.slice(-6);
}

// ── Sub-componentes ────────────────────────────────────────────

function Dot({ status }) {
  // status: "ok" | "warn" | "crit" | "off"
  const colors = { ok:"#3fb950", warn:"#d29922", crit:"#f85149", off:"#4a5260" };
  const c = colors[status] || colors.off;
  return (
    <span style={{
      display:"inline-block", width:9, height:9, borderRadius:"50%",
      background:c, boxShadow: status !== "off" ? `0 0 7px ${c}` : "none",
      flexShrink:0,
    }}/>
  );
}

function StatRow({ label, value, valueStyle }) {
  return (
    <div className="stat-row">
      <span className="label">{label}</span>
      <span className="value" style={valueStyle}>{value}</span>
      <style jsx>{`
        .stat-row {
          display:flex; justify-content:space-between; align-items:center;
          padding: 7px 0;
          border-bottom: 1px solid var(--border);
        }
        .stat-row:last-child { border-bottom: none; }
        .label { font-size:.78rem; color:var(--muted); }
        .value { font-size:.85rem; font-weight:500; font-variant-numeric:tabular-nums; }
      `}</style>
    </div>
  );
}

function SectionTitle({ children }) {
  return (
    <h2 className="sec-title">
      {children}
      <style jsx>{`
        .sec-title {
          font-size:.68rem; font-weight:600; letter-spacing:.12em;
          text-transform:uppercase; color:var(--dim); margin-bottom:14px;
        }
      `}</style>
    </h2>
  );
}

function MinerCard({ m, tempWarn = 68, tempCrit = 75 }) {
  const status = !m.online ? "off"
    : m.temp >= tempCrit ? "crit"
    : m.temp >= tempWarn ? "warn" : "ok";

  const tempColor = status === "crit" ? "var(--red)"
    : status === "warn" ? "var(--yellow)" : "var(--text)";

  const shareRatio = m.online && (m.sharesAccepted + m.sharesRejected) > 0
    ? ((m.sharesAccepted / (m.sharesAccepted + m.sharesRejected)) * 100).toFixed(1)
    : null;

  return (
    <div className="card">
      <div className="card-head">
        <div className="name-row">
          <Dot status={status} />
          <span className="name">{m.name}</span>
        </div>
        {m.online && <span className="model">{m.model}</span>}
      </div>

      {!m.online ? (
        <p className="offline">Sin conexión · {m.error}</p>
      ) : (
        <>
          <div className="hashrate">{m.hashFmt || fmtHR(m.hashHps)}</div>
          <StatRow label="Temperatura chip" value={`${m.temp}°C`} valueStyle={{ color: tempColor }} />
          <StatRow label="Temperatura VR"   value={`${m.vrTemp}°C`} />
          <StatRow label="Potencia"          value={`${m.power?.toFixed(0)} W`} />
          <StatRow label="Ventilador"        value={`${m.fanrpm?.toLocaleString()} rpm`} />
          <StatRow label="Mejor share"       value={m.bestDiff} />
          <StatRow label="Mejor (sesión)"    value={m.bestSessionDiff} />
          {shareRatio !== null && (
            <StatRow label="Shares aceptadas" value={`${m.sharesAccepted?.toLocaleString()} (${shareRatio}%)`} />
          )}
          <StatRow label="Frecuencia"        value={`${m.frequency} MHz`} />
          <StatRow label="Uptime"            value={m.uptimeFmt} />
        </>
      )}

      <style jsx>{`
        .card {
          background: var(--surface);
          border: 1px solid var(--border2);
          border-radius: var(--r);
          padding: 20px 22px;
        }
        .card-head {
          display:flex; justify-content:space-between; align-items:center;
          margin-bottom:14px;
        }
        .name-row { display:flex; align-items:center; gap:8px; }
        .name { font-size:.95rem; font-weight:600; }
        .model { font-size:.72rem; color:var(--dim); }
        .hashrate {
          font-size:1.9rem; font-weight:800; letter-spacing:-0.04em;
          color:var(--green); margin-bottom:14px;
          font-variant-numeric:tabular-nums;
        }
        .offline { font-size:.82rem; color:var(--red); padding:6px 0; }
      `}</style>
    </div>
  );
}

function PoolCard({ pool, netDiff, netDiffFmt }) {
  if (!pool?.online) {
    return (
      <div className="card">
        <div className="pool-off">
          <span style={{fontSize:"1.5rem"}}>🌊</span>
          <p>Sin datos del pool todavía.</p>
          <small>Puede tardar unos minutos tras la primera share.</small>
        </div>
        <style jsx>{`
          .card { background:var(--surface); border:1px solid var(--border2);
                  border-radius:var(--r); padding:24px; }
          .pool-off { text-align:center; color:var(--muted); padding:16px 0; }
          .pool-off p { margin:10px 0 4px; font-size:.9rem; }
          .pool-off small { font-size:.75rem; color:var(--dim); }
        `}</style>
      </div>
    );
  }

  const { hashFmt5m, hashFmt1d, workerCount, shares, bestEverFmt,
          minsSinceShare, blockProgress, blockProgressPct, workers } = pool;

  const shareLate = isFinite(minsSinceShare) && minsSinceShare > 15;
  const pctBar = blockProgress != null ? Math.min(blockProgress * 1e8, 100) : 0;

  return (
    <div className="card">
      <div className="pool-head">
        <div>
          <div className="pool-label">HASHRATE (5 min)</div>
          <div className="pool-big">{hashFmt5m}</div>
        </div>
        <div className="pool-1d">
          <div className="pool-label">ÚLTIMO DÍA</div>
          <div className="pool-1d-val">{hashFmt1d}</div>
        </div>
      </div>

      <StatRow label="Workers activos" value={workerCount} />
      <StatRow label="Shares enviadas" value={shares?.toLocaleString("es-CO")} />
      <StatRow label="Mejor share histórica" value={<span style={{color:"var(--gold)"}}>{bestEverFmt}</span>} />
      <StatRow
        label="Última share"
        value={timeAgo(minsSinceShare)}
        valueStyle={shareLate ? { color:"var(--red)" } : {}}
      />
      <StatRow label="Dificultad de red" value={netDiffFmt || "—"} />

      {blockProgress != null && (
        <div className="progress-wrap">
          <div className="progress-labels">
            <span>Progreso al bloque</span>
            <span>{blockProgressPct}%</span>
          </div>
          <div className="progress-track">
            <div className="progress-fill" style={{ width: `${pctBar}%` }} />
          </div>
        </div>
      )}

      {workers?.length > 0 && (
        <div className="workers">
          <div className="workers-title">Workers</div>
          {workers.map((w, i) => (
            <div key={i} className="worker-row">
              <span className="worker-name">{w.name}</span>
              <span>{w.hashFmt}</span>
              <span className="worker-share">{timeAgo(w.minsSinceShare)}</span>
            </div>
          ))}
        </div>
      )}

      <style jsx>{`
        .card {
          background: var(--surface);
          border: 1px solid var(--border2);
          border-radius: var(--r);
          padding: 20px 22px;
        }
        .pool-head {
          display:flex; justify-content:space-between; align-items:flex-end;
          margin-bottom:18px; gap:16px;
        }
        .pool-label { font-size:.65rem; font-weight:600; letter-spacing:.1em;
                      text-transform:uppercase; color:var(--dim); margin-bottom:4px; }
        .pool-big { font-size:2rem; font-weight:800; letter-spacing:-0.04em;
                    color:var(--green); font-variant-numeric:tabular-nums; }
        .pool-1d { text-align:right; }
        .pool-1d-val { font-size:1.1rem; font-weight:700; color:var(--text);
                       font-variant-numeric:tabular-nums; }
        .progress-wrap { margin-top:14px; }
        .progress-labels { display:flex; justify-content:space-between;
                           font-size:.72rem; color:var(--muted); margin-bottom:6px; }
        .progress-track { height:5px; background:var(--border2); border-radius:3px; overflow:hidden; }
        .progress-fill { height:100%; border-radius:3px;
                         background:linear-gradient(90deg, var(--blue), var(--green));
                         transition: width 0.5s ease; min-width: 2px; }
        .workers { margin-top:16px; border-top:1px solid var(--border); padding-top:14px; }
        .workers-title { font-size:.68rem; font-weight:600; letter-spacing:.1em;
                         text-transform:uppercase; color:var(--dim); margin-bottom:8px; }
        .worker-row { display:flex; gap:12px; font-size:.78rem; padding:4px 0;
                      border-bottom:1px solid var(--border); }
        .worker-row:last-child { border-bottom:none; }
        .worker-name { flex:1; color:var(--text); font-weight:500; }
        .worker-share { color:var(--muted); }
      `}</style>
    </div>
  );
}

function OddsCard({ odds, netDiffFmt }) {
  if (!odds) return null;
  const { oneInDays, years, perDay } = odds;
  const pctDay = (perDay * 100).toExponential(2);
  const yearsRounded = Math.round(years).toLocaleString("es-CO");

  return (
    <div className="card">
      <div className="odds-head">
        <span className="dice">🎰</span>
        <div>
          <div className="odds-label">PROBABILIDAD POR DÍA</div>
          <div className="odds-num">1 / {oneInDays.toLocaleString("es-CO")}</div>
        </div>
      </div>
      <StatRow label="Promedio estadístico" value={`~${yearsRounded} años`} />
      <StatRow label="% de chance por día"  value={`${pctDay}%`} />
      <StatRow label="Premio estimado"      value={<span style={{color:"var(--gold)"}}>~3.125 BTC 🍀</span>} />
      <StatRow label="Dificultad de red"    value={netDiffFmt || "—"} />
      <p className="note">
        Es lotería pura. El hashrate no garantiza ganar, solo define la probabilidad.
        Podrías pegar mañana o en décadas.
      </p>
      <style jsx>{`
        .card {
          background: var(--surface);
          border: 1px solid var(--border2);
          border-radius: var(--r);
          padding: 20px 22px;
        }
        .odds-head { display:flex; align-items:center; gap:16px; margin-bottom:18px; }
        .dice { font-size:2rem; }
        .odds-label { font-size:.65rem; font-weight:600; letter-spacing:.1em;
                      text-transform:uppercase; color:var(--dim); margin-bottom:4px; }
        .odds-num { font-size:1.7rem; font-weight:800; letter-spacing:-0.03em;
                    color:var(--gold); font-variant-numeric:tabular-nums; }
        .note { margin-top:14px; font-size:.72rem; color:var(--dim); line-height:1.6;
                padding-top:12px; border-top:1px solid var(--border); }
      `}</style>
    </div>
  );
}

function Skeleton() {
  return (
    <div className="sk-wrap">
      {[1,2,3].map(i => <div key={i} className="sk-card"><div className="sk-line"/><div className="sk-line short"/><div className="sk-line"/><div className="sk-line short"/></div>)}
      <style jsx>{`
        .sk-wrap { display:grid; gap:14px; grid-template-columns:repeat(auto-fill,minmax(280px,1fr)); }
        .sk-card { background:var(--surface); border:1px solid var(--border2);
                   border-radius:var(--r); padding:22px; }
        .sk-line { height:14px; background:var(--surface3); border-radius:6px; margin-bottom:12px;
                   animation:pulse 1.5s ease-in-out infinite; }
        .sk-line.short { width:60%; }
        @keyframes pulse { 0%,100%{opacity:.4} 50%{opacity:.8} }
      `}</style>
    </div>
  );
}

// ── Página principal ───────────────────────────────────────────
export default function Dashboard() {
  const router = useRouter();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [countdown, setCountdown] = useState(REFRESH);
  const timerRef = useRef(null);
  const cdRef = useRef(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/status");
      if (res.status === 401) { router.replace("/"); return; }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setData(json);
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

  // Countdown visual
  useEffect(() => {
    cdRef.current = setInterval(() => {
      setCountdown((c) => (c <= 1 ? REFRESH : c - 1));
    }, 1000);
    return () => clearInterval(cdRef.current);
  }, []);

  async function logout() {
    await fetch("/api/logout", { method: "POST" });
    router.push("/");
  }

  function manualRefresh() {
    setCountdown(REFRESH);
    fetchData();
  }

  const miners = data?.miners ?? [];
  const pool = data?.pool;
  const odds = data?.odds;
  const netDiffFmt = data?.netDiffFmt;
  const address = data?.address;

  // Resumen rápido para el header
  const onlineMiners = miners.filter((m) => m.online).length;
  const allUp = miners.length > 0 && onlineMiners === miners.length;
  const anyDown = miners.length > 0 && onlineMiners < miners.length;

  return (
    <>
      <Head>
        <title>⛏️ Minero Dashboard</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="robots" content="noindex,nofollow" />
      </Head>

      <div className="root">
        {/* ── Header ── */}
        <header>
          <div className="hdr-left">
            <span className="logo">⛏️</span>
            <span className="title">Minero</span>
            {address && <span className="addr">{truncAddr(address)}</span>}
            {miners.length > 0 && (
              <span className={`pill ${allUp ? "green" : anyDown ? "red" : ""}`}>
                {onlineMiners}/{miners.length} mineros
              </span>
            )}
          </div>
          <div className="hdr-right">
            {error && <span className="err-badge">⚠ {error}</span>}
            {lastUpdate && !loading && (
              <span className="upd-time">
                Actualizado {lastUpdate.toLocaleTimeString("es-CO")} · {countdown}s
              </span>
            )}
            <button className="btn-refresh" onClick={manualRefresh} title="Actualizar ahora">
              ↻
            </button>
            <button className="btn-logout" onClick={logout}>
              Salir
            </button>
          </div>
        </header>

        {/* ── Contenido ── */}
        <main>
          {loading ? (
            <div className="loading-wrap">
              <Skeleton />
            </div>
          ) : (
            <>
              {/* Mineros */}
              {miners.length > 0 && (
                <section>
                  <SectionTitle>Equipos · Hardware</SectionTitle>
                  <div className="grid miners-grid">
                    {miners.map((m, i) => <MinerCard key={i} m={m} />)}
                  </div>
                </section>
              )}

              {/* Pool + Odds */}
              <section>
                <SectionTitle>Pool · solo.ckpool.org</SectionTitle>
                <div className="grid pool-grid">
                  <PoolCard pool={pool} netDiff={data?.netDiff} netDiffFmt={netDiffFmt} />
                  <OddsCard odds={odds} netDiffFmt={netDiffFmt} />
                </div>
              </section>
            </>
          )}
        </main>
      </div>

      <style jsx>{`
        .root { min-height:100vh; display:flex; flex-direction:column; }

        /* Header */
        header {
          position:sticky; top:0; z-index:20;
          background:var(--surface);
          border-bottom:1px solid var(--border2);
          padding:0 24px;
          height:56px;
          display:flex; align-items:center; justify-content:space-between;
          gap:12px;
        }
        .hdr-left, .hdr-right { display:flex; align-items:center; gap:10px; flex-wrap:wrap; }
        .logo { font-size:1.2rem; }
        .title { font-size:1rem; font-weight:700; letter-spacing:-0.02em; }
        .addr {
          font-size:.72rem; color:var(--muted); font-family:monospace;
          background:var(--surface3); padding:3px 8px; border-radius:20px;
        }
        .pill {
          font-size:.7rem; font-weight:600; padding:3px 9px; border-radius:20px;
          background:var(--surface3); color:var(--muted);
        }
        .pill.green { background:var(--green-bg); color:var(--green); }
        .pill.red   { background:var(--red-bg);   color:var(--red); }
        .upd-time { font-size:.72rem; color:var(--dim); white-space:nowrap; }
        .err-badge { font-size:.72rem; color:var(--red); padding:3px 8px;
                     background:var(--red-bg); border-radius:6px; }
        .btn-refresh {
          background:none; border:1px solid var(--border2); color:var(--muted);
          width:30px; height:30px; border-radius:var(--r-sm); cursor:pointer;
          font-size:1rem; display:flex; align-items:center; justify-content:center;
          transition:border-color .15s, color .15s;
        }
        .btn-refresh:hover { border-color:var(--text); color:var(--text); }
        .btn-logout {
          background:none; border:1px solid var(--border2); color:var(--muted);
          padding:5px 14px; border-radius:var(--r-sm); cursor:pointer; font-size:.78rem;
          transition:border-color .15s, color .15s;
        }
        .btn-logout:hover { border-color:var(--red); color:var(--red); }

        /* Main */
        main { max-width:1200px; margin:0 auto; padding:28px 24px 48px; width:100%; }
        section { margin-bottom:32px; }

        /* Grids */
        .grid { display:grid; gap:14px; }
        .miners-grid { grid-template-columns:repeat(auto-fill, minmax(290px,1fr)); }
        .pool-grid   { grid-template-columns:repeat(auto-fill, minmax(320px,1fr)); }

        .loading-wrap { padding-top:8px; }

        @media (max-width: 600px) {
          header { padding:0 16px; height:auto; min-height:56px; padding:10px 16px; }
          main { padding:20px 14px 40px; }
          .addr { display:none; }
          .upd-time { display:none; }
        }
      `}</style>
    </>
  );
}
