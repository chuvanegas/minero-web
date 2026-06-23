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
  return `hace ${m} min`;
}
function truncAddr(addr) {
  if (!addr) return "";
  return addr.slice(0, 10) + "…" + addr.slice(-6);
}

// ── Átomo: fila de stat ───────────────────────────────────────
function StatRow({ label, value, valueStyle }) {
  return (
    <div className="stat-row">
      <span className="label">{label}</span>
      <span className="value" style={valueStyle}>{value}</span>
      <style jsx>{`
        .stat-row {
          display:flex; justify-content:space-between; align-items:center;
          padding:7px 0; border-bottom:1px solid var(--border);
        }
        .stat-row:last-child { border-bottom:none; }
        .label { font-size:.78rem; color:var(--muted); }
        .value { font-size:.85rem; font-weight:500; font-variant-numeric:tabular-nums; text-align:right; }
      `}</style>
    </div>
  );
}

// ── Átomo: punto de estado ────────────────────────────────────
function Dot({ status }) {
  const c = { ok:"#3fb950", warn:"#d29922", crit:"#f85149", off:"#4a5260" }[status] || "#4a5260";
  return (
    <span style={{
      display:"inline-block", width:8, height:8, borderRadius:"50%", flexShrink:0,
      background:c, boxShadow: status !== "off" ? `0 0 6px ${c}` : "none",
    }}/>
  );
}

// ── Átomo: título de sección ──────────────────────────────────
function SectionTitle({ children }) {
  return (
    <h2 className="t">
      {children}
      <style jsx>{`
        .t { font-size:.68rem; font-weight:600; letter-spacing:.12em;
             text-transform:uppercase; color:var(--dim); margin-bottom:14px; }
      `}</style>
    </h2>
  );
}

// ── Card: minero ──────────────────────────────────────────────
function MinerCard({ m }) {
  const status = !m.online ? "off"
    : m.temp >= 75 ? "crit"
    : m.temp >= 68 ? "warn" : "ok";
  const tempColor = { crit:"var(--red)", warn:"var(--yellow)" }[status] || "var(--text)";
  const shareRatio = m.online && (m.sharesAccepted + m.sharesRejected) > 0
    ? ((m.sharesAccepted / (m.sharesAccepted + m.sharesRejected)) * 100).toFixed(1) + "%"
    : null;

  return (
    <div className="card">
      <div className="head">
        <div className="name-row"><Dot status={status}/><span className="name">{m.name}</span></div>
        {m.online && <span className="model">{m.model}</span>}
      </div>
      {!m.online
        ? <p className="offline">Sin conexión · {m.error}</p>
        : <>
            <div className="hr">{m.hashFmt || fmtHR(m.hashHps)}</div>
            <StatRow label="Temp. chip"    value={`${m.temp}°C`}               valueStyle={{color:tempColor}}/>
            <StatRow label="Temp. VR"      value={`${m.vrTemp}°C`}/>
            <StatRow label="Potencia"      value={`${m.power?.toFixed(0)} W`}/>
            <StatRow label="Ventilador"    value={`${m.fanrpm?.toLocaleString()} rpm`}/>
            <StatRow label="Mejor share"   value={m.bestDiff}/>
            <StatRow label="Mejor sesión"  value={m.bestSessionDiff}/>
            {shareRatio && <StatRow label="Shares aceptadas" value={`${m.sharesAccepted?.toLocaleString()} (${shareRatio})`}/>}
            <StatRow label="Frecuencia"    value={`${m.frequency} MHz`}/>
            <StatRow label="Uptime"        value={m.uptimeFmt}/>
            <StatRow label="Stratum"       value={<span style={{fontSize:".7rem",color:"var(--dim)"}}>{m.stratumURL}</span>}/>
          </>
      }
      <style jsx>{`
        .card { background:var(--surface); border:1px solid var(--border2);
                border-radius:var(--r); padding:20px 22px; }
        .head { display:flex; justify-content:space-between; align-items:center; margin-bottom:14px; }
        .name-row { display:flex; align-items:center; gap:8px; }
        .name { font-size:.95rem; font-weight:600; }
        .model { font-size:.7rem; color:var(--dim); }
        .hr { font-size:2rem; font-weight:800; letter-spacing:-.04em; color:var(--green);
              margin-bottom:14px; font-variant-numeric:tabular-nums; }
        .offline { font-size:.82rem; color:var(--red); padding:6px 0; }
      `}</style>
    </div>
  );
}

// ── Card: pool genérico ───────────────────────────────────────
function PoolCard({ pool, netDiffFmt, badge, accentColor }) {
  const color = accentColor || "var(--green)";

  if (!pool?.online) {
    return (
      <div className="card">
        <div className="pool-badge" style={{background:badge?.bg, color:badge?.fg}}>{badge?.label}</div>
        <div className="off">
          <p>Sin datos del pool todavía.</p>
          {pool?.error && <small>{pool.error}</small>}
        </div>
        <style jsx>{`
          .card { background:var(--surface); border:1px solid var(--border2);
                  border-radius:var(--r); padding:20px 22px; }
          .pool-badge { display:inline-block; font-size:.65rem; font-weight:700; letter-spacing:.08em;
                        text-transform:uppercase; padding:3px 9px; border-radius:20px; margin-bottom:14px; }
          .off { color:var(--muted); font-size:.85rem; padding:8px 0; }
          .off small { display:block; margin-top:4px; font-size:.72rem; color:var(--dim); }
        `}</style>
      </div>
    );
  }

  const {
    label, hashFmt5m, hashFmt10m, hashFmt1d, hashFmt1h,
    workerCount, shares, sharesLast10m, sharesLastHour,
    bestEverFmt, minsSinceShare, blockProgress, blockProgressPct, workers,
    blockCandidates,
  } = pool;

  const mainHrLabel = hashFmt10m ? "HASHRATE (10 min)" : "HASHRATE (5 min)";
  const mainHrVal   = hashFmt10m || hashFmt5m || "—";
  const secHrLabel  = hashFmt1h  ? "ÚLTIMA HORA"       : "ÚLTIMO DÍA";
  const secHrVal    = hashFmt1h  || hashFmt1d           || "—";

  const shareLate = isFinite(minsSinceShare) && minsSinceShare > 15;
  const pctBar = blockProgress != null ? Math.min(blockProgress * 1e8, 100) : 0;

  return (
    <div className="card">
      <div className="pool-badge" style={{background:badge?.bg, color:badge?.fg}}>{badge?.label || label}</div>

      <div className="pool-head">
        <div>
          <div className="sub-label">{mainHrLabel}</div>
          <div className="big-num" style={{color}}>{mainHrVal}</div>
        </div>
        <div style={{textAlign:"right"}}>
          <div className="sub-label">{secHrLabel}</div>
          <div className="sec-num">{secHrVal}</div>
        </div>
      </div>

      <StatRow label="Workers activos"  value={workerCount}/>
      <StatRow label="Shares totales"   value={shares?.toLocaleString("es-CO")}/>
      {sharesLast10m != null && <StatRow label="Shares (10 min)" value={sharesLast10m}/>}
      {sharesLastHour != null && <StatRow label="Shares (1 hora)" value={sharesLastHour}/>}
      <StatRow label="Mejor share histórica" value={<span style={{color:"var(--gold)"}}>{bestEverFmt}</span>}/>
      <StatRow
        label="Última share"
        value={timeAgo(minsSinceShare)}
        valueStyle={shareLate ? {color:"var(--red)"} : {}}
      />
      <StatRow label="Dificultad de red" value={netDiffFmt || "—"}/>
      {blockCandidates != null &&
        <StatRow label="Candidatos de bloque" value={blockCandidates}/>}

      {blockProgress != null && (
        <div className="prog-wrap">
          <div className="prog-labels">
            <span>Progreso al bloque</span><span>{blockProgressPct}%</span>
          </div>
          <div className="prog-track">
            <div className="prog-fill" style={{width:`${pctBar}%`, background:`linear-gradient(90deg, var(--blue), ${color})`}}/>
          </div>
        </div>
      )}

      {workers?.length > 0 && (
        <div className="workers">
          <div className="w-title">Workers</div>
          {workers.map((w, i) => (
            <div key={i} className="w-row">
              <span className="w-name">{w.name}</span>
              <span>{w.hashFmt}</span>
              <span className="w-ago">{timeAgo(w.minsSinceShare)}</span>
              {w.payoutMode && <span className="w-mode">{w.payoutMode}</span>}
            </div>
          ))}
        </div>
      )}

      <style jsx>{`
        .card { background:var(--surface); border:1px solid var(--border2);
                border-radius:var(--r); padding:20px 22px; }
        .pool-badge { display:inline-block; font-size:.65rem; font-weight:700; letter-spacing:.08em;
                      text-transform:uppercase; padding:3px 9px; border-radius:20px; margin-bottom:14px; }
        .pool-head { display:flex; justify-content:space-between; align-items:flex-end;
                     margin-bottom:16px; gap:12px; }
        .sub-label { font-size:.62rem; font-weight:600; letter-spacing:.1em;
                     text-transform:uppercase; color:var(--dim); margin-bottom:3px; }
        .big-num { font-size:2rem; font-weight:800; letter-spacing:-.04em;
                   font-variant-numeric:tabular-nums; }
        .sec-num { font-size:1.1rem; font-weight:700; font-variant-numeric:tabular-nums; }
        .prog-wrap { margin-top:14px; }
        .prog-labels { display:flex; justify-content:space-between;
                       font-size:.72rem; color:var(--muted); margin-bottom:5px; }
        .prog-track { height:5px; background:var(--border2); border-radius:3px; overflow:hidden; }
        .prog-fill  { height:100%; border-radius:3px; transition:width .5s ease; min-width:2px; }
        .workers { margin-top:14px; border-top:1px solid var(--border); padding-top:12px; }
        .w-title { font-size:.65rem; font-weight:600; letter-spacing:.1em;
                   text-transform:uppercase; color:var(--dim); margin-bottom:8px; }
        .w-row { display:grid; grid-template-columns:1fr auto auto auto; gap:10px;
                 font-size:.78rem; padding:4px 0; border-bottom:1px solid var(--border); }
        .w-row:last-child { border-bottom:none; }
        .w-name { font-weight:500; }
        .w-ago { color:var(--muted); }
        .w-mode { font-size:.68rem; color:var(--dim); background:var(--surface3);
                  padding:1px 6px; border-radius:10px; align-self:center; }
      `}</style>
    </div>
  );
}

// ── Card: probabilidades ──────────────────────────────────────
function OddsCard({ odds, netDiffFmt }) {
  if (!odds) return null;
  const { oneInDays, years, perDay } = odds;
  return (
    <div className="card">
      <div className="head">
        <span className="dice">🎰</span>
        <div>
          <div className="lbl">PROBABILIDAD POR DÍA</div>
          <div className="num">1 / {oneInDays.toLocaleString("es-CO")}</div>
        </div>
      </div>
      <StatRow label="Promedio estadístico" value={`~${Math.round(years).toLocaleString("es-CO")} años`}/>
      <StatRow label="% de chance por día"  value={`${(perDay*100).toExponential(2)}%`}/>
      <StatRow label="Premio estimado"      value={<span style={{color:"var(--gold)"}}>~3.125 BTC 🍀</span>}/>
      <StatRow label="Dificultad de red"    value={netDiffFmt || "—"}/>
      <p className="note">
        Es lotería pura — el hashrate solo define la probabilidad. Podrías pegar mañana o en décadas.
      </p>
      <style jsx>{`
        .card { background:var(--surface); border:1px solid var(--border2);
                border-radius:var(--r); padding:20px 22px; }
        .head { display:flex; align-items:center; gap:14px; margin-bottom:16px; }
        .dice { font-size:2rem; }
        .lbl { font-size:.62rem; font-weight:600; letter-spacing:.1em;
               text-transform:uppercase; color:var(--dim); margin-bottom:3px; }
        .num { font-size:1.7rem; font-weight:800; letter-spacing:-.03em;
               color:var(--gold); font-variant-numeric:tabular-nums; }
        .note { margin-top:14px; font-size:.72rem; color:var(--dim); line-height:1.6;
                padding-top:12px; border-top:1px solid var(--border); }
      `}</style>
    </div>
  );
}

// ── Skeleton de carga ─────────────────────────────────────────
function Skeleton() {
  return (
    <div className="sk">
      {[1,2,3].map(i=>(
        <div key={i} className="sk-card">
          <div className="ln"/><div className="ln s"/><div className="ln"/><div className="ln s"/>
        </div>
      ))}
      <style jsx>{`
        .sk { display:grid; gap:14px; grid-template-columns:repeat(auto-fill,minmax(280px,1fr)); }
        .sk-card { background:var(--surface); border:1px solid var(--border2);
                   border-radius:var(--r); padding:22px; }
        .ln { height:14px; background:var(--surface3); border-radius:6px; margin-bottom:12px;
              animation:pulse 1.5s ease-in-out infinite; }
        .ln.s { width:55%; }
        @keyframes pulse { 0%,100%{opacity:.3} 50%{opacity:.7} }
      `}</style>
    </div>
  );
}

// ── Dashboard ─────────────────────────────────────────────────
export default function Dashboard() {
  const router = useRouter();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [countdown, setCountdown] = useState(REFRESH);
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
    cdRef.current = setInterval(() => setCountdown(c => c <= 1 ? REFRESH : c - 1), 1000);
    return () => clearInterval(cdRef.current);
  }, []);

  async function logout() {
    await fetch("/api/logout", { method:"POST" });
    router.push("/");
  }

  const miners     = data?.miners ?? [];
  const ckpool     = data?.ckpool;
  const publicPool = data?.publicPool;
  const odds       = data?.odds;
  const netDiffFmt = data?.netDiffFmt;
  const address    = data?.address;

  const onlineMiners = miners.filter(m => m.online).length;
  const allUp  = miners.length > 0 && onlineMiners === miners.length;
  const anyDown = miners.length > 0 && onlineMiners < miners.length;

  return (
    <>
      <Head>
        <title>⛏️ Minero Dashboard</title>
        <meta name="viewport" content="width=device-width, initial-scale=1"/>
        <meta name="robots" content="noindex,nofollow"/>
      </Head>

      <div className="root">
        {/* ── Header ── */}
        <header>
          <div className="hl">
            <span className="logo">⛏️</span>
            <span className="title">Minero</span>
            {address && <span className="addr">{truncAddr(address)}</span>}
            {miners.length > 0 && (
              <span className={`pill ${allUp?"green":anyDown?"red":""}`}>
                {onlineMiners}/{miners.length} mineros
              </span>
            )}
          </div>
          <div className="hr-hdr">
            {error && <span className="err-b">⚠ {error}</span>}
            {lastUpdate && !loading && (
              <span className="upd">{lastUpdate.toLocaleTimeString("es-CO")} · ↻ {countdown}s</span>
            )}
            <button className="btn-r" onClick={fetchData} title="Actualizar">↻</button>
            <button className="btn-out" onClick={logout}>Salir</button>
          </div>
        </header>

        <main>
          {loading
            ? <Skeleton/>
            : <>
                {/* Equipos */}
                {miners.length > 0 && (
                  <section>
                    <SectionTitle>Equipos · Hardware</SectionTitle>
                    <div className="grid g-miners">
                      {miners.map((m,i) => <MinerCard key={i} m={m}/>)}
                    </div>
                  </section>
                )}

                {/* Pools */}
                <section>
                  <SectionTitle>Pools de minería</SectionTitle>
                  <div className="grid g-pools">
                    <PoolCard
                      pool={publicPool}
                      netDiffFmt={netDiffFmt}
                      accentColor="var(--blue)"
                      badge={{label:"public-pool.io", bg:"var(--blue-bg)", fg:"var(--blue)"}}
                    />
                    <PoolCard
                      pool={ckpool}
                      netDiffFmt={netDiffFmt}
                      accentColor="var(--green)"
                      badge={{label:"solo.ckpool.org", bg:"var(--green-bg)", fg:"var(--green)"}}
                    />
                  </div>
                </section>

                {/* Probabilidad */}
                <section>
                  <SectionTitle>Probabilidad · Lotería Bitcoin</SectionTitle>
                  <div className="grid g-odds">
                    <OddsCard odds={odds} netDiffFmt={netDiffFmt}/>
                  </div>
                </section>
              </>
          }
        </main>
      </div>

      <style jsx>{`
        .root { min-height:100vh; display:flex; flex-direction:column; }

        header {
          position:sticky; top:0; z-index:20;
          background:var(--surface); border-bottom:1px solid var(--border2);
          padding:0 24px; height:56px;
          display:flex; align-items:center; justify-content:space-between; gap:12px;
        }
        .hl, .hr-hdr { display:flex; align-items:center; gap:10px; flex-wrap:wrap; }
        .logo  { font-size:1.2rem; }
        .title { font-size:1rem; font-weight:700; letter-spacing:-.02em; }
        .addr  { font-size:.72rem; color:var(--muted); font-family:monospace;
                 background:var(--surface3); padding:3px 8px; border-radius:20px; }
        .pill  { font-size:.7rem; font-weight:600; padding:3px 9px; border-radius:20px;
                 background:var(--surface3); color:var(--muted); }
        .pill.green { background:var(--green-bg); color:var(--green); }
        .pill.red   { background:var(--red-bg);   color:var(--red); }
        .upd   { font-size:.72rem; color:var(--dim); white-space:nowrap; }
        .err-b { font-size:.72rem; color:var(--red); padding:3px 8px;
                 background:var(--red-bg); border-radius:6px; }
        .btn-r {
          background:none; border:1px solid var(--border2); color:var(--muted);
          width:30px; height:30px; border-radius:var(--r-sm); cursor:pointer; font-size:1rem;
          display:flex; align-items:center; justify-content:center;
          transition:border-color .15s, color .15s;
        }
        .btn-r:hover { border-color:var(--text); color:var(--text); }
        .btn-out {
          background:none; border:1px solid var(--border2); color:var(--muted);
          padding:5px 14px; border-radius:var(--r-sm); cursor:pointer; font-size:.78rem;
          transition:border-color .15s, color .15s;
        }
        .btn-out:hover { border-color:var(--red); color:var(--red); }

        main { max-width:1200px; margin:0 auto; padding:28px 24px 48px; width:100%; }
        section { margin-bottom:32px; }
        .grid  { display:grid; gap:14px; }
        .g-miners { grid-template-columns:repeat(auto-fill,minmax(290px,1fr)); }
        .g-pools  { grid-template-columns:repeat(auto-fill,minmax(320px,1fr)); }
        .g-odds   { grid-template-columns:repeat(auto-fill,minmax(320px,1fr)); }

        @media (max-width:600px) {
          header { padding:0 14px; height:auto; min-height:56px; padding:10px 14px; }
          main   { padding:18px 12px 40px; }
          .addr, .upd { display:none; }
        }
      `}</style>
    </>
  );
}
