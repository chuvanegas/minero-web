import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/router";
import Head from "next/head";

const REFRESH = 20;
const DEFAULT_KWH_PRICE = 0.12; // USD por kWh — editable en el dashboard

// ── Consumo eléctrico ──────────────────────────────────────────
function calcElec(watts, pricePerKwh) {
  const w        = watts || 0;
  const kwhDay   = (w * 24) / 1000;
  const kwhMonth = kwhDay * 30;
  const kwhYear  = kwhDay * 365;
  return {
    watts:      w,
    kwhDay:     kwhDay.toFixed(3),
    kwhMonth:   kwhMonth.toFixed(1),
    kwhYear:    kwhYear.toFixed(0),
    costDay:    (kwhDay   * pricePerKwh).toFixed(3),
    costMonth:  (kwhMonth * pricePerKwh).toFixed(2),
    costYear:   (kwhYear  * pricePerKwh).toFixed(2),
  };
}

// ── Utilidades ─────────────────────────────────────────────────
function fmtHR(hps) {
  if (!hps || hps <= 0) return { val: "0", unit: "H/s", full: "0 H/s" };
  const u = ["H/s","KH/s","MH/s","GH/s","TH/s","PH/s"];
  let i = 0, v = hps;
  while (v >= 1000 && i < u.length - 1) { v /= 1000; i++; }
  return { val: v.toFixed(2), unit: u[i], full: `${v.toFixed(2)} ${u[i]}` };
}
function timeAgo(mins) {
  if (!isFinite(mins) || mins == null) return "—";
  const m = Math.round(mins);
  if (m < 1)  return "ahora";
  if (m < 60) return `${m}m atrás`;
  return `${Math.floor(m/60)}h ${m%60}m`;
}
function truncAddr(a) { return a ? a.slice(0,8)+"…"+a.slice(-6) : ""; }

// ── Clock en tiempo real ───────────────────────────────────────
function LiveClock() {
  const [t, setT] = useState("");
  useEffect(() => {
    const tick = () => setT(new Date().toLocaleTimeString("es-CO",{hour:"2-digit",minute:"2-digit",second:"2-digit"}));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
  return <span style={{fontFamily:"'JetBrains Mono',monospace",fontSize:".78rem",
    color:"var(--muted)",letterSpacing:".05em"}}>{t}</span>;
}

// ── LiveDot ────────────────────────────────────────────────────
function LiveDot({ status }) {
  const c = {ok:"var(--green)",warn:"var(--yellow)",crit:"var(--red)",off:"var(--dim)"}[status]||"var(--dim)";
  return (
    <span style={{position:"relative",display:"inline-flex",alignItems:"center",
      justifyContent:"center",width:12,height:12,flexShrink:0}}>
      {status!=="off"&&<span style={{position:"absolute",inset:0,borderRadius:"50%",
        background:c,opacity:.35,animation:"ping 1.8s ease-in-out infinite"}}/>}
      <span style={{width:8,height:8,borderRadius:"50%",background:c,
        boxShadow:status!=="off"?`0 0 8px ${c}`:undefined,position:"relative"}}/>
    </span>
  );
}

// ── Chip ───────────────────────────────────────────────────────
function Chip({ label, color="dim", dot }) {
  const map = {
    green:  {bg:"var(--green-bg)", fg:"var(--green)",  bd:"rgba(0,230,118,.2)"},
    red:    {bg:"var(--red-bg)",   fg:"var(--red)",    bd:"rgba(255,77,106,.2)"},
    yellow: {bg:"var(--yellow-bg)",fg:"var(--yellow)", bd:"rgba(255,179,0,.2)"},
    blue:   {bg:"var(--blue-bg)",  fg:"var(--blue)",   bd:"rgba(79,195,247,.2)"},
    gold:   {bg:"var(--gold-bg)",  fg:"var(--gold)",   bd:"rgba(255,213,79,.2)"},
    dim:    {bg:"var(--surface3)", fg:"var(--muted)",  bd:"var(--border2)"},
  };
  const s = map[color]||map.dim;
  return (
    <span style={{display:"inline-flex",alignItems:"center",gap:5,fontSize:".67rem",
      fontWeight:700,letterSpacing:".06em",textTransform:"uppercase",
      padding:"4px 10px",borderRadius:99,background:s.bg,color:s.fg,
      border:`1px solid ${s.bd}`,whiteSpace:"nowrap"}}>
      {dot&&<LiveDot status={color==="green"?"ok":color==="red"?"crit":"warn"}/>}
      {label}
    </span>
  );
}

// ── BigNumber ──────────────────────────────────────────────────
function BigNumber({ val, unit, color="var(--text)", size="2.8rem" }) {
  return (
    <div style={{animation:"fade-up .35s ease"}}>
      <span style={{fontSize:size,fontWeight:900,color,letterSpacing:"-.05em",
        fontVariantNumeric:"tabular-nums",lineHeight:1}}>{val}</span>
      {unit&&<span style={{fontSize:"1rem",fontWeight:600,color:"var(--muted)",
        marginLeft:5,letterSpacing:"-.02em"}}>{unit}</span>}
    </div>
  );
}

// ── ProgressBar ────────────────────────────────────────────────
function ProgressBar({ value, max, color="var(--green)", height=5, label, right }) {
  const pct = Math.min((value/max)*100,100);
  return (
    <div>
      {(label||right)&&(
        <div style={{display:"flex",justifyContent:"space-between",
          fontSize:".72rem",color:"var(--muted)",marginBottom:5}}>
          {label&&<span>{label}</span>}
          {right&&<span style={{color:"var(--text)",fontWeight:600}}>{right}</span>}
        </div>
      )}
      <div style={{height,background:"var(--surface3)",borderRadius:99,overflow:"hidden",
        border:"1px solid var(--border)"}}>
        <div style={{height:"100%",width:`${pct}%`,borderRadius:99,
          background:`linear-gradient(90deg,${color},${color}bb)`,
          transition:"width .6s cubic-bezier(.4,0,.2,1)",
          boxShadow:`0 0 8px ${color}50`,minWidth:pct>0?3:0}}/>
      </div>
    </div>
  );
}

// ── Card ───────────────────────────────────────────────────────
function Card({ children, style, accent }) {
  const [hov, setHov] = useState(false);
  const accentLine = {green:"var(--green)",blue:"var(--blue)",gold:"var(--gold)",red:"var(--red)"};
  return (
    <div onMouseEnter={()=>setHov(true)} onMouseLeave={()=>setHov(false)}
      style={{
        background:"var(--surface)",
        border:`1px solid ${hov?"var(--border2)":"var(--border)"}`,
        borderRadius:"var(--r)",padding:"22px 24px",
        transition:"border-color .2s,box-shadow .2s,transform .2s",
        boxShadow:hov?"0 8px 32px rgba(0,0,0,.45)":"none",
        transform:hov?"translateY(-1px)":"none",
        position:"relative",overflow:"hidden",...style}}>
      {accent&&accentLine[accent]&&(
        <div style={{position:"absolute",top:0,left:0,right:0,height:2,
          background:`linear-gradient(90deg,transparent 0%,${accentLine[accent]}60 50%,transparent 100%)`}}/>
      )}
      {children}
    </div>
  );
}

// ── KPICard ────────────────────────────────────────────────────
function KPICard({ label, val, unit, sub, color="var(--text)", accent, icon }) {
  return (
    <Card accent={accent} style={{display:"flex",flexDirection:"column",gap:8}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <span style={{fontSize:".6rem",fontWeight:700,letterSpacing:".12em",
          textTransform:"uppercase",color:"var(--dim)"}}>{label}</span>
        {icon&&<span style={{fontSize:"1rem",opacity:.5}}>{icon}</span>}
      </div>
      <BigNumber val={val} unit={unit} color={color}/>
      {sub&&<div style={{fontSize:".7rem",color:"var(--dim)",marginTop:2}}>{sub}</div>}
    </Card>
  );
}

// ── Section ────────────────────────────────────────────────────
function Section({ title, children, action }) {
  return (
    <div style={{display:"flex",flexDirection:"column",gap:12}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <h2 style={{fontSize:".63rem",fontWeight:700,letterSpacing:".14em",
          textTransform:"uppercase",color:"var(--dim)",
          display:"flex",alignItems:"center",gap:8}}>
          <span style={{width:2,height:12,background:"var(--green)",
            borderRadius:1,display:"inline-block"}}/>
          {title}
        </h2>
        {action}
      </div>
      {children}
    </div>
  );
}

// ── StatRow ────────────────────────────────────────────────────
function StatRow({ label, value, valueStyle, mono }) {
  return (
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",
      padding:"8px 0",borderBottom:"1px solid var(--border)"}}>
      <span style={{fontSize:".78rem",color:"var(--muted)"}}>{label}</span>
      <span style={{fontSize:".84rem",fontWeight:500,fontVariantNumeric:"tabular-nums",
        fontFamily:mono?"'JetBrains Mono',monospace":undefined,...valueStyle}}>
        {value??<span style={{color:"var(--dim)"}}>—</span>}
      </span>
    </div>
  );
}

// ── NavTabs ────────────────────────────────────────────────────
function NavTabs({ active, onChange }) {
  const T = [
    {id:"resumen", icon:"◈", label:"Resumen"},
    {id:"hardware",icon:"⬡", label:"Hardware"},
    {id:"pool",    icon:"◉", label:"Pool"},
    {id:"odds",    icon:"◎", label:"Probabilidad"},
  ];
  return (
    <nav style={{display:"flex",gap:2,padding:"0 28px",background:"var(--surface)",
      borderBottom:"1px solid var(--border)",overflowX:"auto",scrollbarWidth:"none"}}>
      {T.map(t=>(
        <button key={t.id} onClick={()=>onChange(t.id)}
          style={{display:"flex",alignItems:"center",gap:6,background:"none",border:"none",
            borderBottom:`2px solid ${active===t.id?"var(--green)":"transparent"}`,
            color:active===t.id?"var(--text)":"var(--muted)",
            padding:"14px 18px",fontSize:".84rem",cursor:"pointer",whiteSpace:"nowrap",
            fontWeight:active===t.id?700:400,transition:"color .15s,border-color .15s",
            letterSpacing:"-.01em"}}>
          <span style={{fontSize:".65rem",opacity:.6}}>{t.icon}</span>
          {t.label}
        </button>
      ))}
    </nav>
  );
}

// ── TempGauge SVG ──────────────────────────────────────────────
function TempGauge({ temp }) {
  if (!temp && temp !== 0) return null;
  const pct   = Math.min(temp/100, 1);
  const color = temp>=75?"var(--red)":temp>=68?"var(--yellow)":"var(--green)";
  const label = temp>=75?"CRÍTICO":temp>=68?"ALTO":"OK";
  const R=36,cx=50,cy=52;
  const startA=Math.PI*.75, span=Math.PI*1.5;
  const toXY=(a)=>[cx+R*Math.cos(a),cy+R*Math.sin(a)];
  const [sx,sy]=toXY(startA);
  const endA=startA+span*pct;
  const [ex,ey]=toXY(endA);
  const large=span*pct>Math.PI?1:0;
  const [ex2,ey2]=toXY(startA+span);

  return (
    <div style={{textAlign:"center"}}>
      <svg width={100} height={76} viewBox="0 0 100 76">
        <path d={`M ${sx} ${sy} A ${R} ${R} 0 1 1 ${ex2} ${ey2}`}
          fill="none" stroke="var(--surface3)" strokeWidth={7} strokeLinecap="round"/>
        {pct>0&&<path d={`M ${sx} ${sy} A ${R} ${R} 0 ${large} 1 ${ex} ${ey}`}
          fill="none" stroke={color} strokeWidth={7} strokeLinecap="round"
          style={{filter:`drop-shadow(0 0 5px ${color})`}}/>}
        <text x={50} y={54} textAnchor="middle" fontSize={17} fontWeight={800}
          fill={color} fontFamily="'JetBrains Mono',monospace">{temp}°</text>
        <text x={50} y={67} textAnchor="middle" fontSize={6.5} fontWeight={700}
          fill={color} letterSpacing={1.5}>{label}</text>
      </svg>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// TABS
// ─────────────────────────────────────────────────────────────

function TabResumen({ data, kwh=DEFAULT_KWH_PRICE }) {
  const {miners=[],publicPool:pp,netDiffFmt,odds}=data;
  const hr=pp?.online?fmtHR(pp.hashHps10m):null;

  return (
    <div style={{display:"flex",flexDirection:"column",gap:28,animation:"fade-up .3s ease"}}>
      {/* KPIs */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(190px,1fr))",gap:12}}>
        <KPICard label="Hashrate ahora" val={hr?.val||"—"} unit={hr?.unit}
          color="var(--green)" sub="Últimos 10 min · public-pool" accent="green" icon="⚡"/>
        <KPICard label="Hashrate 1h" val={pp?.online?fmtHR(pp.hashHps1h).val:"—"}
          unit={pp?.online?fmtHR(pp.hashHps1h).unit:""} sub="Promedio hora" icon="📊"/>
        <KPICard label="Mejor share" val={pp?.bestEverFmt||"—"}
          color="var(--gold)" sub="All-time histórico" accent="gold" icon="🏆"/>
        <KPICard label="Dificultad red" val={netDiffFmt||"—"}
          sub="Bitcoin mainnet" icon="🌐"/>
      </div>

      {/* Hardware */}
      <Section title="Equipos · Estado">
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))",gap:12}}>
          {miners.map((m,i)=>{
            const st=!m.online?"off":m.temp>=75?"crit":m.temp>=68?"warn":"ok";
            const sc={ok:"var(--green)",warn:"var(--yellow)",crit:"var(--red)",off:"var(--dim)"}[st];
            return(
              <Card key={i} accent={m.online&&st==="ok"?"green":m.online&&st==="crit"?"red":undefined}>
                <div style={{display:"flex",justifyContent:"space-between",
                  alignItems:"center",marginBottom:14}}>
                  <div style={{display:"flex",alignItems:"center",gap:10}}>
                    <LiveDot status={st}/>
                    <div>
                      <div style={{fontWeight:700,fontSize:".95rem"}}>{m.name}</div>
                      {m.online&&<div style={{fontSize:".7rem",color:"var(--dim)"}}>{m.model}</div>}
                    </div>
                  </div>
                  <Chip label={m.online?st==="crit"?"¡Crítico!":st==="warn"?"Temp alta":"Activo":"Offline"}
                    color={m.online?st==="ok"?"green":st==="crit"?"red":"yellow":"dim"} dot={m.online}/>
                </div>
                {m.online?(
                  <>
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:12}}>
                      {[
                        {l:"Hashrate",v:fmtHR(m.hashHps).full,c:"var(--green)"},
                        {l:"Temp",v:`${m.temp}°C`,c:sc},
                        {l:"Potencia",v:`${m.power?.toFixed(0)}W`,c:"var(--text)"},
                      ].map((s,j)=>(
                        <div key={j} style={{background:"var(--surface2)",border:"1px solid var(--border)",
                          borderRadius:10,padding:"10px 12px",textAlign:"center"}}>
                          <div style={{fontSize:".6rem",color:"var(--dim)",marginBottom:3}}>{s.l}</div>
                          <div style={{fontSize:".88rem",fontWeight:700,color:s.c,
                            fontVariantNumeric:"tabular-nums"}}>{s.v}</div>
                        </div>
                      ))}
                    </div>
                    <ProgressBar value={m.temp} max={85} color={sc}
                      label="Temperatura chip" right={`${m.temp}°C / 85°C`}/>
                  {m.power>0&&(
                    <div style={{marginTop:10,display:"flex",justifyContent:"space-between",
                      fontSize:".72rem",color:"var(--dim)",paddingTop:10,
                      borderTop:"1px solid var(--border)"}}>
                      <span>💡 Costo/mes</span>
                      <span style={{color:"var(--yellow)",fontWeight:700}}>
                        ${calcElec(m.power,kwh).costMonth} USD</span>
                    </div>
                  )}
                  </>
                ):(
                  <div style={{fontSize:".78rem",color:"var(--muted)",padding:"10px 14px",
                    background:"var(--surface2)",borderRadius:9,border:"1px solid var(--border)"}}>
                    No alcanzable desde la nube — ver tab Hardware
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      </Section>

      {/* Pool */}
      {pp?.online&&(
        <Section title="Pool · Actividad">
          <Card accent="blue">
            <div style={{display:"flex",justifyContent:"space-between",
              alignItems:"flex-start",flexWrap:"wrap",gap:16,marginBottom:18}}>
              <div>
                <Chip label="public-pool.io" color="blue" dot/>
                <div style={{marginTop:12}}>
                  <BigNumber val={fmtHR(pp.hashHps10m).val}
                    unit={fmtHR(pp.hashHps10m).unit} color="var(--blue)" size="2.2rem"/>
                  <div style={{fontSize:".7rem",color:"var(--dim)",marginTop:3}}>hashrate · 10 min</div>
                </div>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                {[
                  {l:"Shares",v:pp.shares?.toLocaleString("es-CO")},
                  {l:"Workers",v:pp.workerCount},
                  {l:"Mejor",v:<span style={{color:"var(--gold)"}}>{pp.bestEverFmt}</span>},
                  {l:"Última share",v:<span style={{
                    color:pp.minsSinceShare>15?"var(--red)":"var(--green)"}}>
                    {timeAgo(pp.minsSinceShare)}</span>},
                ].map((s,i)=>(
                  <div key={i} style={{background:"var(--surface2)",border:"1px solid var(--border)",
                    borderRadius:9,padding:"10px 14px",minWidth:110}}>
                    <div style={{fontSize:".6rem",color:"var(--dim)",marginBottom:2}}>{s.l}</div>
                    <div style={{fontSize:".86rem",fontWeight:600,fontVariantNumeric:"tabular-nums"}}>{s.v}</div>
                  </div>
                ))}
              </div>
            </div>
            {pp.minsSinceShare>15&&(
              <div style={{display:"flex",alignItems:"center",gap:8,padding:"10px 14px",
                background:"var(--red-bg)",border:"1px solid rgba(255,77,106,.2)",
                borderRadius:9,fontSize:".78rem",color:"var(--red)"}}>
                ⚠ Sin share hace {Math.round(pp.minsSinceShare)} minutos — revisa tu minero
              </div>
            )}
          </Card>
        </Section>
      )}

      {/* Odds */}
      {odds&&(
        <Section title="Probabilidad de bloque">
          <Card accent="gold">
            <div style={{display:"flex",justifyContent:"space-between",
              alignItems:"center",flexWrap:"wrap",gap:20}}>
              <div>
                <div style={{fontSize:".6rem",fontWeight:700,letterSpacing:".12em",
                  textTransform:"uppercase",color:"var(--dim)",marginBottom:8}}>Chance por día</div>
                <BigNumber val={`1 / ${odds.oneInDays.toLocaleString("es-CO")}`}
                  color="var(--gold)" size="1.9rem"/>
              </div>
              <div style={{background:"var(--surface2)",border:"1px solid var(--border)",
                borderRadius:12,padding:"14px 22px",textAlign:"center"}}>
                <div style={{fontSize:"2rem",fontWeight:900,fontVariantNumeric:"tabular-nums"}}>
                  ~{Math.round(odds.years).toLocaleString("es-CO")}</div>
                <div style={{fontSize:".7rem",color:"var(--dim)",marginTop:2}}>años en promedio</div>
              </div>
              <div style={{background:"var(--surface2)",border:"1px solid var(--border)",
                borderRadius:12,padding:"14px 18px",fontSize:".78rem",color:"var(--muted)",lineHeight:2}}>
                📅 1 mes: {((1-Math.pow(1-odds.perDay,30))*100).toFixed(3)}%<br/>
                📅 1 año: {((1-Math.pow(1-odds.perDay,365))*100).toFixed(2)}%<br/>
                🍀 Premio: ~3.125 BTC
              </div>
            </div>
          </Card>
        </Section>
      )}
    </div>
  );
}

// ── Hardware tab ───────────────────────────────────────────────
function TabHardware({ miners, kwh, onKwh }) {
  if(!miners?.length) return <Card><p style={{color:"var(--muted)",padding:12}}>Sin mineros configurados.</p></Card>;
  const totalW = miners.filter(m=>m.online).reduce((a,m)=>a+(m.power||0),0);
  const elec   = calcElec(totalW, kwh);
  return(
    <div style={{display:"flex",flexDirection:"column",gap:20,animation:"fade-up .3s ease"}}>
      {/* Precio de electricidad editable */}
      <Card>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",
          flexWrap:"wrap",gap:12}}>
          <div>
            <div style={{fontSize:".63rem",fontWeight:700,letterSpacing:".12em",
              textTransform:"uppercase",color:"var(--dim)",marginBottom:4}}>
              💡 Precio electricidad
            </div>
            <div style={{fontSize:".78rem",color:"var(--muted)"}}>
              Ajusta según tu tarifa local para ver el costo real
            </div>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <span style={{fontSize:".82rem",color:"var(--muted)"}}>USD /kWh</span>
            <input type="number" min="0.01" max="2" step="0.01" value={kwh}
              onChange={e=>onKwh(parseFloat(e.target.value)||0.12)}
              style={{width:80,background:"var(--surface2)",border:"1px solid var(--border2)",
                color:"var(--text)",padding:"7px 12px",borderRadius:"var(--r-sm)",
                fontSize:".88rem",fontWeight:600,textAlign:"center",outline:"none",
                fontFamily:"'JetBrains Mono',monospace"}}/>
          </div>
        </div>
        {totalW > 0 && (
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(130px,1fr))",
            gap:10,marginTop:16}}>
            {[
              {l:"Consumo total",v:`${totalW.toFixed(1)} W`,c:"var(--blue)"},
              {l:"kWh / día",    v:elec.kwhDay,            c:"var(--text)"},
              {l:"kWh / mes",   v:elec.kwhMonth,           c:"var(--text)"},
              {l:"Costo / día",  v:`$${elec.costDay}`,     c:"var(--yellow)"},
              {l:"Costo / mes",  v:`$${elec.costMonth}`,   c:"var(--yellow)"},
              {l:"Costo / año",  v:`$${elec.costYear}`,    c:"var(--red)"},
            ].map((s,i)=>(
              <div key={i} style={{background:"var(--surface2)",border:"1px solid var(--border)",
                borderRadius:9,padding:"10px 14px"}}>
                <div style={{fontSize:".6rem",color:"var(--dim)",marginBottom:3}}>{s.l}</div>
                <div style={{fontSize:"1rem",fontWeight:700,color:s.c,
                  fontVariantNumeric:"tabular-nums"}}>{s.v}</div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {miners.map((m,i)=><MinerDetail key={i} m={m} kwh={kwh}/>)}
    </div>
  );
}

function MinerDetail({ m, kwh=DEFAULT_KWH_PRICE }) {
  const st=!m.online?"off":m.temp>=75?"crit":m.temp>=68?"warn":"ok";
  const sc={ok:"var(--green)",warn:"var(--yellow)",crit:"var(--red)",off:"var(--dim)"}[st];
  const total=(m.sharesAccepted||0)+(m.sharesRejected||0);
  const rate=total>0?((m.sharesAccepted/total)*100).toFixed(1):0;

  if(!m.online) return(
    <Card>
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:20}}>
        <LiveDot status="off"/>
        <span style={{fontWeight:700,fontSize:"1.05rem"}}>{m.name}</span>
        <Chip label="Sin conexión" color="dim"/>
      </div>
      <div style={{background:"var(--surface2)",border:"1px solid var(--border)",
        borderRadius:14,padding:28,textAlign:"center"}}>
        <div style={{fontSize:"2.5rem",marginBottom:14,opacity:.3}}>📡</div>
        <div style={{fontWeight:700,fontSize:"1rem",color:"var(--muted)",marginBottom:10}}>
          Hardware no alcanzable desde la nube
        </div>
        <div style={{fontSize:".8rem",color:"var(--dim)",lineHeight:1.9,
          maxWidth:420,margin:"0 auto",marginBottom:14}}>
          <code style={{background:"var(--surface3)",padding:"2px 8px",borderRadius:6,
            fontFamily:"'JetBrains Mono',monospace",fontSize:".75rem"}}>{m.url}</code>
          {" "}es una IP local. Necesita un relay en la misma red para enviar datos a la nube.
        </div>
        <div style={{display:"inline-flex",alignItems:"center",gap:6,
          fontSize:".78rem",color:"var(--green)"}}>
          <LiveDot status="ok"/>Los datos del pool funcionan sin problema
        </div>
      </div>
    </Card>
  );

  return(
    <Card accent={st==="crit"?"red":st==="warn"?"green":"green"}>
      {/* Header */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",
        marginBottom:24,flexWrap:"wrap",gap:10}}>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <LiveDot status={st}/>
          <div>
            <div style={{fontWeight:800,fontSize:"1.1rem",letterSpacing:"-.02em"}}>{m.name}</div>
            <div style={{fontSize:".7rem",color:"var(--dim)",marginTop:1,
              fontFamily:"'JetBrains Mono',monospace"}}>{m.model} · {m.stratumURL}</div>
          </div>
        </div>
        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
          <Chip label={st==="ok"?"Activo":st==="crit"?"¡Crítico!":"Temp alta"}
            color={st==="ok"?"green":st==="crit"?"red":"yellow"} dot/>
          <Chip label={`Up: ${m.uptimeFmt}`} color="dim"/>
        </div>
      </div>

      {/* Grid métricas */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))",
        gap:14,marginBottom:20}}>

        {/* Hashrate */}
        <div style={{background:"var(--surface2)",border:"1px solid var(--border)",
          borderRadius:14,padding:18}}>
          <div style={{fontSize:".58rem",fontWeight:700,letterSpacing:".12em",
            textTransform:"uppercase",color:"var(--dim)",marginBottom:10}}>⚡ Hashrate</div>
          <BigNumber val={fmtHR(m.hashHps).val} unit={fmtHR(m.hashHps).unit}
            color="var(--green)" size="1.8rem"/>
          <div style={{marginTop:12}}>
            <ProgressBar value={m.frequency||0} max={600} color="var(--green)"
              label="Frecuencia" right={`${m.frequency} MHz`}/>
          </div>
        </div>

        {/* Temperatura */}
        <div style={{background:"var(--surface2)",border:"1px solid var(--border)",
          borderRadius:14,padding:18}}>
          <div style={{fontSize:".58rem",fontWeight:700,letterSpacing:".12em",
            textTransform:"uppercase",color:"var(--dim)",marginBottom:2}}>🌡️ Temperatura</div>
          <TempGauge temp={m.temp}/>
          <div style={{display:"flex",justifyContent:"center",gap:20,fontSize:".72rem",
            color:"var(--dim)"}}>
            <span>VR: <b style={{color:"var(--text)"}}>{m.vrTemp}°C</b></span>
            <span>Lím: <b style={{color:"var(--red)"}}>75°C</b></span>
          </div>
        </div>

        {/* Potencia + Fan */}
        <div style={{background:"var(--surface2)",border:"1px solid var(--border)",
          borderRadius:14,padding:18,display:"flex",flexDirection:"column",gap:16}}>
          <div style={{fontSize:".58rem",fontWeight:700,letterSpacing:".12em",
            textTransform:"uppercase",color:"var(--dim)"}}>⚙️ Potencia · Fan</div>
          <ProgressBar value={m.power||0} max={30} color="var(--blue)"
            label="Potencia" right={`${m.power?.toFixed(1)} W`}/>
          <ProgressBar value={m.fanrpm||0} max={6000} color="var(--purple,#b39ddb)"
            label="Ventilador" right={`${(m.fanrpm||0).toLocaleString()} rpm`}/>
          {m.power&&m.hashHps>0&&(
            <div style={{textAlign:"center",background:"var(--surface3)",
              borderRadius:9,padding:"7px",fontSize:".74rem",color:"var(--muted)"}}>
              Eficiencia: <b style={{color:"var(--text)"}}>{(m.power/(m.hashHps/1e12)).toFixed(1)} J/TH</b>
            </div>
          )}
        </div>
      </div>

      {/* Shares */}
      <div style={{background:"var(--surface2)",border:"1px solid var(--border)",
        borderRadius:14,padding:18,marginBottom:14}}>
        <div style={{fontSize:".58rem",fontWeight:700,letterSpacing:".12em",
          textTransform:"uppercase",color:"var(--dim)",marginBottom:16}}>📋 Shares</div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(110px,1fr))",
          gap:10,marginBottom:14}}>
          {[
            {l:"Aceptadas",v:m.sharesAccepted?.toLocaleString(),c:"var(--green)"},
            {l:"Rechazadas",v:(m.sharesRejected||0).toLocaleString(),
              c:m.sharesRejected>0?"var(--red)":"var(--muted)"},
            {l:"Mejor share",v:m.bestDiff,c:"var(--gold)"},
            {l:"Tasa",v:`${rate}%`,
              c:rate>98?"var(--green)":rate>90?"var(--yellow)":"var(--red)"},
          ].map((s,i)=>(
            <div key={i} style={{background:"var(--surface3)",border:"1px solid var(--border)",
              borderRadius:10,padding:"12px 14px"}}>
              <div style={{fontSize:".6rem",color:"var(--dim)",marginBottom:4}}>{s.l}</div>
              <div style={{fontSize:"1.05rem",fontWeight:700,color:s.c,
                fontVariantNumeric:"tabular-nums"}}>{s.v}</div>
            </div>
          ))}
        </div>
        <ProgressBar value={parseFloat(rate)||0} max={100} color="var(--green)"
          label="Tasa de aceptación" right={`${rate}%`}/>
      </div>

      {/* Consumo eléctrico */}
      {(() => {
        const e = calcElec(m.power, kwh);
        const eff = m.power && m.hashHps > 0 ? (m.power / (m.hashHps / 1e12)).toFixed(1) : null;
        return (
          <div style={{background:"var(--surface2)",border:"1px solid var(--border)",
            borderRadius:14,padding:18,marginBottom:14}}>
            <div style={{fontSize:".58rem",fontWeight:700,letterSpacing:".12em",
              textTransform:"uppercase",color:"var(--dim)",marginBottom:14}}>
              💡 Consumo eléctrico · {m.power?.toFixed(1)} W</div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(110px,1fr))",gap:10}}>
              {[
                {l:"kWh / día",   v:e.kwhDay,          c:"var(--text)"},
                {l:"kWh / mes",  v:e.kwhMonth,         c:"var(--text)"},
                {l:"Costo / día", v:`$${e.costDay}`,   c:"var(--yellow)"},
                {l:"Costo / mes", v:`$${e.costMonth}`, c:"var(--yellow)"},
                {l:"Costo / año", v:`$${e.costYear}`,  c:"var(--red)"},
                {l:"Eficiencia",  v:eff?`${eff} J/TH`:"—", c:"var(--blue)"},
              ].map((s,i)=>(
                <div key={i} style={{background:"var(--surface3)",border:"1px solid var(--border)",
                  borderRadius:10,padding:"12px 14px"}}>
                  <div style={{fontSize:".6rem",color:"var(--dim)",marginBottom:4}}>{s.l}</div>
                  <div style={{fontSize:"1rem",fontWeight:700,color:s.c,
                    fontVariantNumeric:"tabular-nums"}}>{s.v}</div>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {/* Footer */}
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",
        fontSize:".72rem",color:"var(--dim)",padding:"10px 14px",
        background:"var(--surface2)",border:"1px solid var(--border)",borderRadius:9,flexWrap:"wrap",gap:8}}>
        <span>Mejor sesión: <b style={{color:"var(--gold)"}}>{m.bestSessionDiff}</b></span>
        <span style={{display:"flex",alignItems:"center",gap:5}}>
          <LiveDot status="ok"/>
          <span style={{color:"var(--green)"}}>Minando</span>
        </span>
      </div>
    </Card>
  );
}

// ── Pool tab ───────────────────────────────────────────────────
function TabPool({ data }) {
  const {publicPool:pp,ckpool,netDiffFmt,address}=data;
  return(
    <div style={{display:"flex",flexDirection:"column",gap:16,animation:"fade-up .3s ease"}}>
      {pp?.online?(
        <>
          <Card accent="blue">
            <div style={{display:"flex",justifyContent:"space-between",
              alignItems:"flex-start",flexWrap:"wrap",gap:16,marginBottom:20}}>
              <div>
                <Chip label="public-pool.io" color="blue" dot/>
                <div style={{marginTop:12}}>
                  <BigNumber val={fmtHR(pp.hashHps10m).val} unit={fmtHR(pp.hashHps10m).unit}
                    color="var(--blue)" size="2.4rem"/>
                  <div style={{fontSize:".72rem",color:"var(--dim)",marginTop:3}}>10 min</div>
                </div>
              </div>
              <div>
                <div style={{fontSize:".6rem",color:"var(--dim)",marginBottom:4}}>1 HORA</div>
                <BigNumber val={fmtHR(pp.hashHps1h).val} unit={fmtHR(pp.hashHps1h).unit} size="1.4rem"/>
              </div>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(135px,1fr))",gap:10}}>
              {[
                {l:"Workers",      v:pp.workerCount},
                {l:"Shares totales",v:pp.shares?.toLocaleString("es-CO")},
                {l:"Shares 10 min",v:pp.sharesLast10m},
                {l:"Shares 1h",    v:pp.sharesLastHour},
                {l:"Mejor share",  v:pp.bestEverFmt,c:"var(--gold)"},
                {l:"Candidatos",   v:pp.blockCandidates||0},
                {l:"Última share", v:timeAgo(pp.minsSinceShare),
                  c:pp.minsSinceShare>15?"var(--red)":"var(--green)"},
                {l:"Dificultad red",v:netDiffFmt},
              ].map((s,i)=>(
                <div key={i} style={{background:"var(--surface2)",border:"1px solid var(--border)",
                  borderRadius:9,padding:"10px 14px"}}>
                  <div style={{fontSize:".6rem",color:"var(--dim)",marginBottom:3}}>{s.l}</div>
                  <div style={{fontSize:".86rem",fontWeight:600,color:s.c||"var(--text)",
                    fontVariantNumeric:"tabular-nums"}}>{s.v??<span style={{color:"var(--dim)"}}>—</span>}</div>
                </div>
              ))}
            </div>
          </Card>

          {pp.workers?.length>0&&(
            <Card>
              <div style={{fontSize:".63rem",fontWeight:700,letterSpacing:".12em",
                textTransform:"uppercase",color:"var(--dim)",marginBottom:16}}>Workers</div>
              <div style={{overflowX:"auto"}}>
                {pp.workers.map((w,i)=>(
                  <div key={i} style={{display:"grid",
                    gridTemplateColumns:"minmax(140px,1fr) 120px 120px 100px 80px",
                    gap:12,padding:"12px 0",borderBottom:"1px solid var(--border)",
                    alignItems:"center",minWidth:580}}>
                    <div style={{display:"flex",alignItems:"center",gap:8}}>
                      <LiveDot status="ok"/>
                      <span style={{fontWeight:600,fontSize:".8rem",
                        fontFamily:"'JetBrains Mono',monospace"}}>{w.name}</span>
                    </div>
                    <span style={{color:"var(--green)",fontWeight:700,
                      fontSize:".84rem",fontVariantNumeric:"tabular-nums"}}>{w.hashFmt}</span>
                    <span style={{color:"var(--gold)",fontVariantNumeric:"tabular-nums",
                      fontSize:".84rem"}}>{w.bestEverFmt}</span>
                    <span style={{fontSize:".78rem",
                      color:w.minsSinceShare>15?"var(--red)":"var(--muted)"}}>
                      {timeAgo(w.minsSinceShare)}</span>
                    <Chip label={w.payoutMode||"—"} color="dim"/>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </>
      ):(
        <Card><p style={{color:"var(--muted)",padding:12}}>Sin datos de public-pool.<br/>
          <small style={{color:"var(--dim)"}}>{pp?.error}</small></p></Card>
      )}

      <Card>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",
          marginBottom:12,flexWrap:"wrap",gap:10}}>
          <Chip label="solo.ckpool.org" color={ckpool?.online?"green":"dim"} dot={ckpool?.online}/>
          {!ckpool?.online&&<span style={{fontSize:".74rem",color:"var(--dim)"}}>
            Sin actividad — ¿apuntando a public-pool?</span>}
        </div>
        {ckpool?.online?(
          <>
            <StatRow label="Hashrate 5m"  value={ckpool.hashFmt5m}/>
            <StatRow label="Hashrate 1d"  value={ckpool.hashFmt1d}/>
            <StatRow label="Workers"      value={ckpool.workerCount}/>
            <StatRow label="Mejor share"  value={<span style={{color:"var(--gold)"}}>{ckpool.bestEverFmt}</span>}/>
            <StatRow label="Última share" value={timeAgo(ckpool.minsSinceShare)}/>
          </>
        ):(
          <div style={{fontSize:".8rem",color:"var(--dim)",fontStyle:"italic",padding:"4px 0"}}>
            No hay registros para esta dirección en ckpool.
          </div>
        )}
      </Card>

      <Card>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",
          flexWrap:"wrap",gap:12}}>
          <div>
            <div style={{fontWeight:600,marginBottom:3}}>Ver en public-pool.io</div>
            <div style={{fontSize:".74rem",color:"var(--muted)"}}>Interfaz completa del pool</div>
          </div>
          <a href={`https://web.public-pool.io/#/app/${address}`}
            target="_blank" rel="noreferrer"
            style={{display:"inline-flex",alignItems:"center",gap:6,
              background:"var(--blue-bg)",color:"var(--blue)",
              border:"1px solid rgba(79,195,247,.25)",padding:"9px 18px",
              borderRadius:"var(--r-sm)",fontSize:".84rem",fontWeight:600,textDecoration:"none"}}>
            Abrir ↗
          </a>
        </div>
      </Card>
    </div>
  );
}

// ── Probabilidad tab ───────────────────────────────────────────
function TabOdds({ data }) {
  const {odds,netDiffFmt,publicPool:pp,netDiff}=data;
  if(!odds) return <Card><p style={{color:"var(--muted)",padding:12}}>Sin datos.</p></Card>;
  const {oneInDays,years,perDay}=odds;
  const hps=pp?.online?(pp.hashHps10m||pp.hashHps1h):0;

  const rows=[
    {l:"1 día",d:1},{l:"1 semana",d:7},{l:"1 mes",d:30},
    {l:"3 meses",d:90},{l:"6 meses",d:180},{l:"1 año",d:365},
    {l:"5 años",d:1825},{l:"10 años",d:3650},
  ].map(p=>({...p,prob:(1-Math.pow(1-perDay,p.d))*100}));

  return(
    <div style={{display:"flex",flexDirection:"column",gap:16,animation:"fade-up .3s ease"}}>
      <Card accent="gold">
        <div style={{display:"flex",justifyContent:"space-between",
          alignItems:"center",flexWrap:"wrap",gap:20,marginBottom:20}}>
          <div>
            <div style={{fontSize:".6rem",fontWeight:700,letterSpacing:".12em",
              textTransform:"uppercase",color:"var(--dim)",marginBottom:8}}>Probabilidad por día</div>
            <BigNumber val={`1 / ${oneInDays.toLocaleString("es-CO")}`}
              color="var(--gold)" size="2rem"/>
            <div style={{fontSize:".73rem",color:"var(--dim)",marginTop:6}}>
              Con {hps?fmtHR(hps).full:"el hashrate del pool"}
            </div>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            <div style={{background:"var(--surface2)",border:"1px solid var(--border)",
              borderRadius:12,padding:"14px 20px",textAlign:"center"}}>
              <div style={{fontSize:"2rem",fontWeight:900,fontVariantNumeric:"tabular-nums"}}>
                ~{Math.round(years).toLocaleString("es-CO")}</div>
              <div style={{fontSize:".68rem",color:"var(--dim)",marginTop:2}}>años promedio</div>
            </div>
            <div style={{background:"var(--gold-bg)",border:"1px solid rgba(255,213,79,.2)",
              borderRadius:12,padding:"14px 20px",textAlign:"center"}}>
              <div style={{fontSize:"1.8rem",fontWeight:900}}>🍀</div>
              <div style={{fontSize:".72rem",color:"var(--muted)",marginTop:4}}>~3.125 BTC</div>
            </div>
          </div>
        </div>
        <div style={{padding:"10px 14px",background:"rgba(255,213,79,.05)",
          border:"1px solid rgba(255,213,79,.1)",borderRadius:9,
          fontSize:".74rem",color:"var(--dim)",lineHeight:1.7}}>
          ⚡ Estadística pura — sin garantías. Podrías ganar mañana o en décadas.
        </div>
      </Card>

      <Card>
        <div style={{fontSize:".63rem",fontWeight:700,letterSpacing:".12em",
          textTransform:"uppercase",color:"var(--dim)",marginBottom:16}}>Probabilidad acumulada</div>
        {rows.map((r,i)=>{
          const c=r.prob>50?"var(--green)":r.prob>10?"var(--yellow)":"var(--blue)";
          return(
            <div key={i} style={{display:"grid",gridTemplateColumns:"90px 1fr 100px",
              gap:14,alignItems:"center",padding:"10px 0",
              borderBottom:i<rows.length-1?"1px solid var(--border)":"none"}}>
              <span style={{fontSize:".82rem",color:"var(--muted)"}}>{r.l}</span>
              <div style={{display:"flex",alignItems:"center",gap:10}}>
                <div style={{flex:1,height:4,background:"var(--surface3)",borderRadius:99}}>
                  <div style={{height:"100%",borderRadius:99,
                    width:`${Math.min(r.prob*2,100)}%`,background:c,
                    minWidth:r.prob>0?2:0,boxShadow:`0 0 5px ${c}60`,
                    transition:"width .5s ease"}}/>
                </div>
                <span style={{fontSize:".78rem",color:c,fontWeight:700,
                  minWidth:55,textAlign:"right",fontVariantNumeric:"tabular-nums"}}>
                  {r.prob<0.01?r.prob.toExponential(2):r.prob.toFixed(2)}%
                </span>
              </div>
              <div style={{fontSize:".7rem",color:"var(--dim)",textAlign:"right",
                fontVariantNumeric:"tabular-nums",fontFamily:"'JetBrains Mono',monospace"}}>
                1:{(1/(r.prob/100)).toLocaleString("es-CO",{maximumFractionDigits:0})}
              </div>
            </div>
          );
        })}
      </Card>

      <Card>
        <div style={{fontSize:".63rem",fontWeight:700,letterSpacing:".12em",
          textTransform:"uppercase",color:"var(--dim)",marginBottom:14}}>Contexto de red</div>
        <StatRow label="Dificultad de red"          value={netDiffFmt} mono/>
        <StatRow label="Mejor share histórica"       value={<span style={{color:"var(--gold)"}}>{pp?.bestEverFmt}</span>}/>
        <StatRow label="% de dificultad alcanzado"   value={netDiff&&pp?.bestEver
          ?((pp.bestEver/netDiff)*100).toExponential(3)+"%":"—"} mono/>
        <StatRow label="Premio por bloque"           value="~3.125 BTC 🍀"/>
      </Card>
    </div>
  );
}

// ── Dashboard ──────────────────────────────────────────────────
export default function Dashboard() {
  const router=useRouter();
  const [data,setData]=useState(null);
  const [error,setError]=useState(null);
  const [loading,setLoading]=useState(true);
  const [lastUpdate,setLastUpdate]=useState(null);
  const [countdown,setCountdown]=useState(REFRESH);
  const [tab,setTab]=useState("resumen");
  const [kwh,setKwh]=useState(DEFAULT_KWH_PRICE);

  const fetchData=useCallback(async()=>{
    try{
      const res=await fetch("/api/status");
      if(res.status===401){router.replace("/");return;}
      if(!res.ok) throw new Error(`HTTP ${res.status}`);
      setData(await res.json());
      setError(null);
      setLastUpdate(new Date());
      setCountdown(REFRESH);
    }catch(e){setError(e.message);}
    finally{setLoading(false);}
  },[router]);

  useEffect(()=>{
    fetchData();
    const t=setInterval(fetchData,REFRESH*1000);
    return()=>clearInterval(t);
  },[fetchData]);

  useEffect(()=>{
    const t=setInterval(()=>setCountdown(c=>c<=1?REFRESH:c-1),1000);
    return()=>clearInterval(t);
  },[]);

  async function logout(){
    await fetch("/api/logout",{method:"POST"});
    router.push("/");
  }

  const miners=data?.miners??[];
  const ppOnline=data?.publicPool?.online;
  const shareLate=ppOnline&&data.publicPool.minsSinceShare>15;

  return(<>
    <Head>
      <title>⛏️ Minero</title>
      <meta name="viewport" content="width=device-width, initial-scale=1"/>
      <meta name="robots" content="noindex,nofollow"/>
      <link rel="preconnect" href="https://fonts.googleapis.com"/>
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin=""/>
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;700&display=swap" rel="stylesheet"/>
    </Head>

    <div style={{minHeight:"100vh",display:"flex",flexDirection:"column"}}>
      {/* Header */}
      <header style={{
        position:"sticky",top:0,zIndex:50,
        background:"rgba(5,7,10,.88)",backdropFilter:"blur(20px) saturate(1.5)",
        WebkitBackdropFilter:"blur(20px) saturate(1.5)",
        borderBottom:"1px solid var(--border)",
        padding:"0 28px",height:58,
        display:"flex",alignItems:"center",justifyContent:"space-between",gap:12}}>
        <div style={{display:"flex",alignItems:"center",gap:14,flexWrap:"wrap"}}>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <span style={{fontSize:"1.2rem"}}>⛏️</span>
            <span style={{fontSize:"1rem",fontWeight:800,letterSpacing:"-.03em",
              background:"linear-gradient(90deg,var(--green),var(--blue))",
              WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>Minero</span>
          </div>
          {data?.address&&(
            <span style={{fontSize:".7rem",color:"var(--muted)",fontFamily:"'JetBrains Mono',monospace",
              background:"var(--surface2)",padding:"3px 10px",
              borderRadius:99,border:"1px solid var(--border)"}}>
              {truncAddr(data.address)}
            </span>
          )}
          {ppOnline&&<Chip label={shareLate?"Sin share +15min":"Pool activo"}
            color={shareLate?"red":"green"} dot/>}
        </div>

        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <LiveClock/>
          {error&&<span style={{fontSize:".72rem",color:"var(--red)",padding:"3px 10px",
            background:"var(--red-bg)",borderRadius:6}}>⚠ {error}</span>}
          {lastUpdate&&!loading&&(
            <span style={{fontSize:".68rem",color:"var(--dim)",
              display:"flex",alignItems:"center",gap:5}}>
              <span style={{width:5,height:5,borderRadius:"50%",background:"var(--green)",
                animation:"pulse-glow 2s ease-in-out infinite",display:"inline-block"}}/>
              {countdown}s
            </span>
          )}
          <button onClick={fetchData}
            style={{background:"none",border:"1px solid var(--border2)",color:"var(--muted)",
              width:32,height:32,borderRadius:"var(--r-sm)",cursor:"pointer",fontSize:".9rem",
              display:"flex",alignItems:"center",justifyContent:"center",transition:"all .15s",
              fontFamily:"inherit"}}>↻</button>
          <button onClick={logout}
            style={{background:"none",border:"1px solid var(--border2)",color:"var(--muted)",
              padding:"6px 14px",borderRadius:"var(--r-sm)",cursor:"pointer",fontSize:".78rem",
              transition:"all .15s",fontFamily:"inherit"}}>Salir</button>
        </div>
      </header>

      <NavTabs active={tab} onChange={setTab}/>

      <main style={{maxWidth:1200,margin:"0 auto",padding:"28px 24px 64px",
        width:"100%",flex:1}}>
        {loading?<Skeleton/>:<>
          {tab==="resumen"  &&<TabResumen  data={data} kwh={kwh}/>}
          {tab==="hardware" &&<TabHardware miners={miners} kwh={kwh} onKwh={setKwh}/>}
          {tab==="pool"     &&<TabPool     data={data}/>}
          {tab==="odds"     &&<TabOdds     data={data}/>}
        </>}
      </main>
    </div>

    <style jsx global>{`
      @keyframes ping{0%{transform:scale(1);opacity:.6}70%{transform:scale(2.3);opacity:0}100%{transform:scale(2.3);opacity:0}}
      @keyframes pulse-glow{0%,100%{opacity:1}50%{opacity:.3}}
      @keyframes fade-up{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
      @keyframes shimmer{0%{background-position:-200% 0}100%{background-position:200% 0}}
      @keyframes count-up{from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:translateY(0)}}
    `}</style>
  </>);
}

function Skeleton() {
  return(
    <div style={{display:"grid",gap:14,
      gridTemplateColumns:"repeat(auto-fill,minmax(220px,1fr))"}}>
      {[180,180,180,180,280,280].map((h,i)=>(
        <div key={i} style={{background:"var(--surface)",border:"1px solid var(--border)",
          borderRadius:"var(--r)",height:h,
          backgroundImage:"linear-gradient(90deg,var(--surface) 0%,var(--surface2) 50%,var(--surface) 100%)",
          backgroundSize:"200% 100%",animation:"shimmer 1.5s ease-in-out infinite"}}/>
      ))}
    </div>
  );
}
