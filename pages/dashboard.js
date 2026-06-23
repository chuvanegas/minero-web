import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/router";
import Head from "next/head";

const REFRESH = 20;

// ── Formato ───────────────────────────────────────────────────
function fmtHR(hps) {
  if (!hps || hps <= 0) return "0 H/s";
  const u = ["H/s","KH/s","MH/s","GH/s","TH/s","PH/s"];
  let i=0, v=hps;
  while (v>=1000 && i<u.length-1){v/=1000;i++;}
  return `${v.toFixed(2)} ${u[i]}`;
}
function timeAgo(mins) {
  if (!isFinite(mins)||mins==null) return "—";
  const m=Math.round(mins);
  if (m<1) return "ahora";
  if (m<60) return `${m}m`;
  return `${Math.round(m/60)}h ${m%60}m`;
}
function truncAddr(a){return a?a.slice(0,10)+"…"+a.slice(-6):"";}

// ── Componentes base ──────────────────────────────────────────
function Dot({status,pulse}){
  const c={ok:"#3fb950",warn:"#d29922",crit:"#f85149",off:"#4a5260"}[status]||"#4a5260";
  return(<span style={{position:"relative",display:"inline-flex",alignItems:"center",
    justifyContent:"center",width:10,height:10,flexShrink:0}}>
    {pulse&&status==="ok"&&<span style={{position:"absolute",inset:0,borderRadius:"50%",
      background:c,opacity:.4,animation:"ping 1.5s ease-in-out infinite"}}/>}
    <span style={{width:8,height:8,borderRadius:"50%",background:c,
      boxShadow:status!=="off"?`0 0 5px ${c}`:"none",position:"relative"}}/>
  </span>);
}

function StatRow({label,value,valueStyle,sub}){
  return(<div className="r">
    <span className="l">{label}</span>
    <div style={{textAlign:"right"}}>
      <span className="v" style={valueStyle}>{value??"—"}</span>
      {sub&&<div style={{fontSize:".68rem",color:"var(--dim)"}}>{sub}</div>}
    </div>
    <style jsx>{`.r{display:flex;justify-content:space-between;align-items:center;
      padding:7px 0;border-bottom:1px solid var(--border);}
      .r:last-child{border-bottom:none;}
      .l{font-size:.78rem;color:var(--muted);}
      .v{font-size:.84rem;font-weight:500;font-variant-numeric:tabular-nums;}`}</style>
  </div>);
}

function Card({children,style,glow}){
  return(<div className={`c${glow?" glow":""}`} style={style}>{children}
    <style jsx>{`.c{background:var(--surface);border:1px solid var(--border2);
      border-radius:var(--r);padding:20px 22px;}
      .glow{border-color:rgba(63,185,80,.3);box-shadow:0 0 20px rgba(63,185,80,.06);}`}</style>
  </div>);
}

function SectionTitle({children}){
  return <h2 style={{fontSize:".67rem",fontWeight:600,letterSpacing:".12em",
    textTransform:"uppercase",color:"var(--dim)",marginBottom:14}}>{children}</h2>;
}

function Badge({label,bg,fg}){
  return <span style={{display:"inline-block",fontSize:".62rem",fontWeight:700,
    letterSpacing:".08em",textTransform:"uppercase",padding:"3px 9px",
    borderRadius:20,background:bg,color:fg,marginBottom:14}}>{label}</span>;
}

// ── Gauge de temperatura ──────────────────────────────────────
function TempGauge({temp,warn=68,crit=75}){
  const max=100, pct=Math.min(temp/max,1);
  const color=temp>=crit?"#f85149":temp>=warn?"#d29922":"#3fb950";
  const r=42, cx=54, cy=54;
  const arc=Math.PI*1.3;
  const startAngle=-Math.PI*0.15-Math.PI;
  const endAngle=startAngle+arc*pct;
  const x1=cx+r*Math.cos(startAngle-Math.PI/2+Math.PI);
  const y1=cy+r*Math.sin(startAngle-Math.PI/2+Math.PI);
  const x2=cx+r*Math.cos(endAngle-Math.PI/2+Math.PI);
  const y2=cy+r*Math.sin(endAngle-Math.PI/2+Math.PI);
  const large=arc*pct>Math.PI?1:0;

  // Simple CSS gauge instead
  const angle=temp>=crit?"-60deg":temp>=warn?"-20deg":"20deg";
  return(
    <div style={{textAlign:"center",padding:"4px 0 8px"}}>
      <div style={{position:"relative",display:"inline-block"}}>
        <svg width={108} height={70} viewBox="0 0 108 70">
          {/* Track */}
          <path d="M14 62 A40 40 0 0 1 94 62" fill="none" stroke="var(--border2)" strokeWidth={8} strokeLinecap="round"/>
          {/* Fill */}
          <path d={`M14 62 A40 40 0 ${temp>=50?1:0} 1 ${14+80*(temp/100)} ${62-Math.sin(Math.acos((14+80*(temp/100)-54)/40))*40}`}
            fill="none" stroke={color} strokeWidth={8} strokeLinecap="round"
            style={{filter:`drop-shadow(0 0 4px ${color})`}}/>
          {/* Needle approx */}
        </svg>
        <div style={{position:"absolute",bottom:0,left:"50%",transform:"translateX(-50%)",
          textAlign:"center",lineHeight:1}}>
          <div style={{fontSize:"1.7rem",fontWeight:800,color,
            fontVariantNumeric:"tabular-nums",letterSpacing:"-.03em"}}>{temp}°</div>
          <div style={{fontSize:".65rem",color:"var(--dim)",marginTop:2}}>ASIC temp</div>
        </div>
      </div>
    </div>
  );
}

// ── Barra de progreso ─────────────────────────────────────────
function Bar({value,max,color="var(--green)",label,unit=""}){
  const pct=Math.min((value/max)*100,100);
  return(<div style={{marginBottom:10}}>
    <div style={{display:"flex",justifyContent:"space-between",
      fontSize:".72rem",color:"var(--muted)",marginBottom:4}}>
      <span>{label}</span><span style={{color:"var(--text)",fontWeight:600}}>{value}{unit}</span>
    </div>
    <div style={{height:5,background:"var(--border2)",borderRadius:3,overflow:"hidden"}}>
      <div style={{height:"100%",width:`${pct}%`,background:color,borderRadius:3,
        transition:"width .5s ease",boxShadow:`0 0 6px ${color}40`}}/>
    </div>
  </div>);
}

// ── Tabs ──────────────────────────────────────────────────────
function Tabs({active,onChange}){
  const T=[{id:"resumen",label:"⛏️ Resumen"},{id:"hardware",label:"🖥 Hardware"},
           {id:"pool",label:"🌊 Pool"},{id:"odds",label:"🎰 Probabilidad"}];
  return(<div className="tabs">
    {T.map(t=><button key={t.id} className={`tab${active===t.id?" on":""}`}
      onClick={()=>onChange(t.id)}>{t.label}</button>)}
    <style jsx>{`.tabs{display:flex;gap:2px;border-bottom:1px solid var(--border2);
      padding:0 24px;background:var(--surface);overflow-x:auto;scrollbar-width:none;}
      .tab{background:none;border:none;border-bottom:2px solid transparent;
        color:var(--muted);padding:13px 16px;font-size:.84rem;cursor:pointer;white-space:nowrap;
        transition:color .15s,border-color .15s;}
      .tab.on{color:var(--text);border-bottom-color:var(--green);font-weight:600;}
      .tab:hover:not(.on){color:var(--text);}`}</style>
  </div>);
}

// ── Tab Hardware ──────────────────────────────────────────────
function TabHardware({miners}){
  if(!miners?.length) return <Card><p style={{color:"var(--muted)",padding:12}}>
    No hay mineros configurados.</p></Card>;

  return(<div style={{display:"flex",flexDirection:"column",gap:20}}>
    {miners.map((m,i)=><MinerCardFull key={i} m={m}/>)}
  </div>);
}

function MinerCardFull({m}){
  const status=!m.online?"off":m.temp>=75?"crit":m.temp>=68?"warn":"ok";
  const statusLabel={ok:"Activo",warn:"Temperatura alta",crit:"¡CRÍTICO!",off:"Sin conexión"}[status];
  const statusColor={ok:"var(--green)",warn:"var(--yellow)",crit:"var(--red)",off:"var(--dim)"}[status];
  const shareTotal=(m.sharesAccepted||0)+(m.sharesRejected||0);
  const acceptRate=shareTotal>0?(m.sharesAccepted/shareTotal*100).toFixed(1):null;

  if(!m.online) return(
    <Card>
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:16}}>
        <Dot status="off"/><span style={{fontWeight:700,fontSize:"1rem"}}>{m.name}</span>
        <span style={{fontSize:".75rem",color:"var(--red)",background:"var(--red-bg)",
          padding:"2px 8px",borderRadius:20}}>Sin conexión</span>
      </div>
      <div style={{background:"var(--surface2)",border:"1px solid var(--border2)",
        borderRadius:10,padding:20,textAlign:"center"}}>
        <div style={{fontSize:"2rem",marginBottom:12}}>📡</div>
        <div style={{fontWeight:600,color:"var(--muted)",marginBottom:8}}>
          Hardware no alcanzable desde la nube
        </div>
        <div style={{fontSize:".78rem",color:"var(--dim)",lineHeight:1.7,maxWidth:400,margin:"0 auto"}}>
          La IP <code style={{background:"var(--surface3)",padding:"1px 5px",
          borderRadius:4,fontSize:".72rem"}}>{m.url||"local"}</code> está en tu red
          local. Para ver temperatura, fan y estado en tiempo real desde cualquier lugar,
          necesitas configurar un <strong style={{color:"var(--text)"}}>tunnel de Cloudflare</strong>.
        </div>
        <div style={{marginTop:14,fontSize:".75rem",color:"var(--green)"}}>
          ✅ Los datos del pool funcionan sin problema
        </div>
      </div>
    </Card>
  );

  return(
    <Card glow={status==="ok"}>
      {/* Header */}
      <div style={{display:"flex",justifyContent:"space-between",
        alignItems:"center",marginBottom:20,flexWrap:"wrap",gap:8}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <Dot status={status} pulse/>
          <div>
            <div style={{fontWeight:700,fontSize:"1rem"}}>{m.name}</div>
            <div style={{fontSize:".72rem",color:"var(--dim)"}}>{m.model}</div>
          </div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <span style={{fontSize:".75rem",fontWeight:600,color:statusColor,
            background:`${statusColor}20`,padding:"4px 12px",borderRadius:20,
            border:`1px solid ${statusColor}40`}}>{statusLabel}</span>
          <span style={{fontSize:".72rem",color:"var(--dim)"}}>Up: {m.uptimeFmt}</span>
        </div>
      </div>

      {/* Grid principal */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(200px,1fr))",
        gap:16,marginBottom:20}}>

        {/* Hashrate */}
        <div style={{background:"var(--surface2)",border:"1px solid var(--border2)",
          borderRadius:10,padding:16}}>
          <div style={{fontSize:".62rem",fontWeight:600,letterSpacing:".1em",
            textTransform:"uppercase",color:"var(--dim)",marginBottom:8}}>Hashrate</div>
          <div style={{fontSize:"2rem",fontWeight:800,color:"var(--green)",
            letterSpacing:"-.04em",fontVariantNumeric:"tabular-nums"}}>{m.hashFmt}</div>
          <div style={{fontSize:".72rem",color:"var(--dim)",marginTop:4}}>
            Frecuencia: {m.frequency} MHz
          </div>
        </div>

        {/* Temperatura gauge */}
        <div style={{background:"var(--surface2)",border:"1px solid var(--border2)",
          borderRadius:10,padding:16}}>
          <div style={{fontSize:".62rem",fontWeight:600,letterSpacing:".1em",
            textTransform:"uppercase",color:"var(--dim)",marginBottom:4}}>Temperatura</div>
          <TempGauge temp={m.temp}/>
          <div style={{display:"flex",justifyContent:"space-between",
            fontSize:".72rem",color:"var(--dim)",marginTop:4}}>
            <span>VR: {m.vrTemp}°C</span>
            <span>Límite: 75°C</span>
          </div>
        </div>

        {/* Potencia y fan */}
        <div style={{background:"var(--surface2)",border:"1px solid var(--border2)",
          borderRadius:10,padding:16}}>
          <div style={{fontSize:".62rem",fontWeight:600,letterSpacing:".1em",
            textTransform:"uppercase",color:"var(--dim)",marginBottom:14}}>Potencia · Ventilador</div>
          <Bar value={m.power?.toFixed(0)||0} max={30} color="var(--blue)" label="Potencia" unit=" W"/>
          <Bar value={m.fanrpm||0} max={6000} color="var(--muted)" label="Ventilador" unit=" rpm"/>
          <div style={{fontSize:".72rem",color:"var(--dim)",marginTop:8}}>
            Eficiencia: {m.power&&m.hashHps
              ? ((m.power/(m.hashHps/1e12)).toFixed(1))+" J/TH" : "—"}
          </div>
        </div>
      </div>

      {/* Shares */}
      <div style={{background:"var(--surface2)",border:"1px solid var(--border2)",
        borderRadius:10,padding:16,marginBottom:16}}>
        <div style={{fontSize:".62rem",fontWeight:600,letterSpacing:".1em",
          textTransform:"uppercase",color:"var(--dim)",marginBottom:12}}>Shares</div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))",gap:12}}>
          <div>
            <div style={{fontSize:"1.5rem",fontWeight:800,color:"var(--green)",
              fontVariantNumeric:"tabular-nums"}}>{m.sharesAccepted?.toLocaleString()}</div>
            <div style={{fontSize:".72rem",color:"var(--dim)"}}>Aceptadas</div>
          </div>
          <div>
            <div style={{fontSize:"1.5rem",fontWeight:800,color:m.sharesRejected>0?"var(--red)":"var(--text)",
              fontVariantNumeric:"tabular-nums"}}>{m.sharesRejected?.toLocaleString()||0}</div>
            <div style={{fontSize:".72rem",color:"var(--dim)"}}>Rechazadas</div>
          </div>
          <div>
            <div style={{fontSize:"1.5rem",fontWeight:800,color:"var(--gold)",
              fontVariantNumeric:"tabular-nums"}}>{m.bestDiff}</div>
            <div style={{fontSize:".72rem",color:"var(--dim)"}}>Mejor share</div>
          </div>
          {acceptRate&&<div>
            <div style={{fontSize:"1.5rem",fontWeight:800,color:"var(--green)",
              fontVariantNumeric:"tabular-nums"}}>{acceptRate}%</div>
            <div style={{fontSize:".72rem",color:"var(--dim)"}}>Tasa aceptación</div>
          </div>}
        </div>
        {acceptRate&&<div style={{marginTop:12}}>
          <Bar value={parseFloat(acceptRate)} max={100} color="var(--green)" label="Aceptación"/>
        </div>}
      </div>

      {/* Stratum */}
      <div style={{fontSize:".72rem",color:"var(--dim)",display:"flex",
        alignItems:"center",gap:6}}>
        <span style={{color:"var(--green)"}}>●</span>
        Conectado a: <span style={{color:"var(--text)",fontFamily:"monospace"}}>{m.stratumURL}</span>
      </div>
    </Card>
  );
}

// ── Tab Resumen ───────────────────────────────────────────────
function TabResumen({data}){
  const {miners=[],publicPool:pp,netDiffFmt,odds}=data;
  const onlineMiners=miners.filter(m=>m.online);

  return(<div style={{display:"flex",flexDirection:"column",gap:24}}>
    {/* KPIs */}
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(175px,1fr))",gap:12}}>
      {[
        {label:"HASHRATE AHORA",val:pp?.hashFmt10m||"—",sub:"Pool · 10 min",color:"var(--green)"},
        {label:"HASHRATE 1H",val:pp?.hashFmt1h||"—",sub:"Promedio hora",color:"var(--text)"},
        {label:"MEJOR SHARE",val:pp?.bestEverFmt||"—",sub:"All-time",color:"var(--gold)"},
        {label:"DIFICULTAD RED",val:netDiffFmt||"—",sub:"Bitcoin mainnet",color:"var(--text)"},
      ].map((k,i)=>(
        <div key={i} style={{background:"var(--surface)",border:"1px solid var(--border2)",
          borderRadius:"var(--r)",padding:"16px 20px"}}>
          <div style={{fontSize:".6rem",fontWeight:600,letterSpacing:".1em",
            textTransform:"uppercase",color:"var(--dim)",marginBottom:6}}>{k.label}</div>
          <div style={{fontSize:"1.5rem",fontWeight:800,letterSpacing:"-.03em",
            color:k.color,fontVariantNumeric:"tabular-nums"}}>{k.val}</div>
          <div style={{fontSize:".68rem",color:"var(--dim)",marginTop:3}}>{k.sub}</div>
        </div>
      ))}
    </div>

    {/* Estado mineros */}
    <section>
      <SectionTitle>Estado de equipos</SectionTitle>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(260px,1fr))",gap:12}}>
        {miners.map((m,i)=>(
          <Card key={i} glow={m.online}>
            <div style={{display:"flex",justifyContent:"space-between",
              alignItems:"center",marginBottom:m.online?14:10}}>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <Dot status={!m.online?"off":m.temp>=75?"crit":m.temp>=68?"warn":"ok"} pulse={m.online}/>
                <div>
                  <div style={{fontWeight:600}}>{m.name}</div>
                  {m.online&&<div style={{fontSize:".7rem",color:"var(--dim)"}}>{m.model}</div>}
                </div>
              </div>
              {m.online&&<div style={{fontSize:"1.3rem",fontWeight:800,color:"var(--green)",
                fontVariantNumeric:"tabular-nums"}}>{m.hashFmt}</div>}
            </div>
            {m.online?(
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
                {[
                  {l:"Temp",v:`${m.temp}°C`,c:m.temp>=75?"var(--red)":m.temp>=68?"var(--yellow)":"var(--green)"},
                  {l:"Potencia",v:`${m.power?.toFixed(0)}W`,c:"var(--text)"},
                  {l:"Fan",v:`${m.fanrpm?.toLocaleString()}`,c:"var(--text)"},
                ].map((s,j)=>(
                  <div key={j} style={{background:"var(--surface2)",borderRadius:8,padding:"8px 10px",textAlign:"center"}}>
                    <div style={{fontSize:".65rem",color:"var(--dim)",marginBottom:2}}>{s.l}</div>
                    <div style={{fontSize:".9rem",fontWeight:700,color:s.c,fontVariantNumeric:"tabular-nums"}}>{s.v}</div>
                  </div>
                ))}
              </div>
            ):(
              <div style={{fontSize:".78rem",color:"var(--red)"}}>
                Sin conexión — ver tab Hardware para detalles
              </div>
            )}
          </Card>
        ))}
      </div>
    </section>

    {/* Pool resumen */}
    {pp?.online&&(
      <section>
        <SectionTitle>Pool · Actividad</SectionTitle>
        <Card>
          <Badge label="public-pool.io" bg="var(--blue-bg)" fg="var(--blue)"/>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))",gap:0}}>
            <StatRow label="Workers activos"  value={pp.workerCount}/>
            <StatRow label="Shares totales"   value={pp.shares?.toLocaleString("es-CO")}/>
            <StatRow label="Shares (10 min)"  value={pp.sharesLast10m}/>
            <StatRow label="Shares (1 hora)"  value={pp.sharesLastHour}/>
            <StatRow label="Última share"     value={timeAgo(pp.minsSinceShare)}
              valueStyle={pp.minsSinceShare>15?{color:"var(--red)"}:{color:"var(--green)"}}/>
            <StatRow label="Candidatos bloque" value={pp.blockCandidates||0}/>
          </div>
        </Card>
      </section>
    )}

    {/* Odds rápido */}
    {odds&&(
      <section>
        <SectionTitle>Probabilidad de bloque</SectionTitle>
        <Card>
          <div style={{display:"flex",justifyContent:"space-between",
            alignItems:"center",flexWrap:"wrap",gap:16}}>
            <div>
              <div style={{fontSize:".6rem",fontWeight:600,letterSpacing:".1em",
                textTransform:"uppercase",color:"var(--dim)",marginBottom:4}}>POR DÍA</div>
              <div style={{fontSize:"2rem",fontWeight:800,color:"var(--gold)",
                letterSpacing:"-.03em",fontVariantNumeric:"tabular-nums"}}>
                1 / {odds.oneInDays.toLocaleString("es-CO")}</div>
            </div>
            <div style={{textAlign:"right"}}>
              <div style={{fontSize:".6rem",fontWeight:600,letterSpacing:".1em",
                textTransform:"uppercase",color:"var(--dim)",marginBottom:4}}>PROMEDIO EST.</div>
              <div style={{fontSize:"1.4rem",fontWeight:700,fontVariantNumeric:"tabular-nums"}}>
                ~{Math.round(odds.years).toLocaleString("es-CO")} años</div>
            </div>
            <a href="#" onClick={e=>{e.preventDefault();}} style={{fontSize:".8rem",color:"var(--blue)"}}>
              Ver análisis completo →
            </a>
          </div>
        </Card>
      </section>
    )}
  </div>);
}

// ── Tab Pool ──────────────────────────────────────────────────
function TabPool({data}){
  const {publicPool:pp,ckpool,netDiffFmt,address}=data;
  return(<div style={{display:"flex",flexDirection:"column",gap:16}}>
    {/* Public pool */}
    {pp?.online?(
      <>
        <Card>
          <Badge label="public-pool.io" bg="var(--blue-bg)" fg="var(--blue)"/>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(260px,1fr))",gap:16,marginBottom:16}}>
            <div>
              <div style={{fontSize:".6rem",fontWeight:600,letterSpacing:".1em",
                textTransform:"uppercase",color:"var(--dim)",marginBottom:6}}>HASHRATE 10 MIN</div>
              <div style={{fontSize:"2.2rem",fontWeight:800,color:"var(--blue)",
                letterSpacing:"-.04em",fontVariantNumeric:"tabular-nums"}}>{pp.hashFmt10m}</div>
            </div>
            <div>
              <div style={{fontSize:".6rem",fontWeight:600,letterSpacing:".1em",
                textTransform:"uppercase",color:"var(--dim)",marginBottom:6}}>HASHRATE 1 HORA</div>
              <div style={{fontSize:"2.2rem",fontWeight:800,color:"var(--text)",
                letterSpacing:"-.04em",fontVariantNumeric:"tabular-nums"}}>{pp.hashFmt1h}</div>
            </div>
          </div>
          <StatRow label="Workers activos"      value={pp.workerCount}/>
          <StatRow label="Shares totales"       value={pp.shares?.toLocaleString("es-CO")}/>
          <StatRow label="Shares (10 min)"      value={pp.sharesLast10m}/>
          <StatRow label="Shares (1 hora)"      value={pp.sharesLastHour}/>
          <StatRow label="Mejor share histórica" value={<span style={{color:"var(--gold)",fontWeight:700}}>{pp.bestEverFmt}</span>}/>
          <StatRow label="Última share"          value={timeAgo(pp.minsSinceShare)}
            valueStyle={pp.minsSinceShare>15?{color:"var(--red)"}:{color:"var(--green)"}}/>
          <StatRow label="Candidatos de bloque"  value={pp.blockCandidates||0}/>
          <StatRow label="Dificultad de red"     value={netDiffFmt||"—"}/>
          {pp.blockProgressPct&&<StatRow label="% hacia un bloque" value={pp.blockProgressPct+"%"}/>}
        </Card>

        {/* Workers */}
        {pp.workers?.length>0&&(
          <Card>
            <div style={{fontSize:".67rem",fontWeight:600,letterSpacing:".1em",
              textTransform:"uppercase",color:"var(--dim)",marginBottom:14}}>Workers</div>
            {pp.workers.map((w,i)=>(
              <div key={i} style={{display:"grid",
                gridTemplateColumns:"2fr 1fr 1fr 1fr 80px",gap:8,
                padding:"10px 0",borderBottom:"1px solid var(--border)",
                fontSize:".82rem",alignItems:"center"}}>
                <div style={{fontWeight:600,display:"flex",alignItems:"center",gap:6}}>
                  <Dot status="ok" pulse/>{w.name}
                </div>
                <div style={{color:"var(--green)",fontWeight:600,
                  fontVariantNumeric:"tabular-nums"}}>{w.hashFmt}</div>
                <div style={{color:"var(--gold)",fontVariantNumeric:"tabular-nums"}}>{w.bestEverFmt}</div>
                <div style={{color:w.minsSinceShare>15?"var(--red)":"var(--muted)"}}>
                  {timeAgo(w.minsSinceShare)}</div>
                <div style={{fontSize:".7rem",color:"var(--dim)",background:"var(--surface2)",
                  padding:"2px 7px",borderRadius:10,textAlign:"center"}}>{w.payoutMode}</div>
              </div>
            ))}
          </Card>
        )}
      </>
    ):(
      <Card><p style={{color:"var(--muted)",padding:12}}>Sin datos de public-pool todavía.<br/>
        <small style={{color:"var(--dim)"}}>{pp?.error}</small></p></Card>
    )}

    {/* ckpool */}
    <Card>
      <Badge label="solo.ckpool.org" bg="var(--green-bg)" fg="var(--green)"/>
      {ckpool?.online?(
        <>
          <StatRow label="Hashrate 5m"    value={ckpool.hashFmt5m}/>
          <StatRow label="Hashrate 1d"    value={ckpool.hashFmt1d}/>
          <StatRow label="Workers"        value={ckpool.workerCount}/>
          <StatRow label="Mejor share"    value={<span style={{color:"var(--gold)"}}>{ckpool.bestEverFmt}</span>}/>
          <StatRow label="Última share"   value={timeAgo(ckpool.minsSinceShare)}/>
        </>
      ):(
        <p style={{color:"var(--muted)",fontSize:".82rem"}}>
          Sin actividad en este pool — ¿tu minero está apuntando a public-pool.io?
        </p>
      )}
    </Card>

    {/* Link */}
    <Card>
      <div style={{display:"flex",justifyContent:"space-between",
        alignItems:"center",flexWrap:"wrap",gap:12}}>
        <div>
          <div style={{fontWeight:600,marginBottom:4}}>Ver en public-pool.io</div>
          <div style={{fontSize:".78rem",color:"var(--muted)"}}>Interfaz completa del pool</div>
        </div>
        <a href={`https://web.public-pool.io/#/app/${address}`}
          target="_blank" rel="noreferrer"
          style={{background:"var(--blue-bg)",color:"var(--blue)",border:"1px solid var(--blue)",
            padding:"9px 18px",borderRadius:"var(--r-sm)",fontSize:".84rem",
            fontWeight:600,textDecoration:"none"}}>
          Abrir →
        </a>
      </div>
    </Card>
  </div>);
}

// ── Tab Probabilidad ──────────────────────────────────────────
function TabOdds({data}){
  const {odds,netDiffFmt,publicPool:pp,netDiff}=data;
  if(!odds) return <Card><p style={{color:"var(--muted)",padding:12}}>Sin datos suficientes.</p></Card>;
  const {oneInDays,years,perDay}=odds;
  const hps=pp?.online?(pp.hashHps10m||pp.hashHps1h):0;

  const periods=[
    {l:"1 día",d:1},{l:"1 semana",d:7},{l:"1 mes",d:30},
    {l:"3 meses",d:90},{l:"6 meses",d:180},{l:"1 año",d:365},
    {l:"5 años",d:1825},{l:"10 años",d:3650},
  ].map(p=>({...p,prob:(1-Math.pow(1-perDay,p.d))*100}));

  return(<div style={{display:"flex",flexDirection:"column",gap:16}}>
    <Card>
      <div style={{display:"flex",justifyContent:"space-between",
        alignItems:"center",flexWrap:"wrap",gap:20,marginBottom:16}}>
        <div>
          <div style={{fontSize:".6rem",fontWeight:600,letterSpacing:".1em",
            textTransform:"uppercase",color:"var(--dim)",marginBottom:6}}>PROBABILIDAD POR DÍA</div>
          <div style={{fontSize:"2.6rem",fontWeight:800,color:"var(--gold)",
            letterSpacing:"-.04em",fontVariantNumeric:"tabular-nums"}}>
            1 / {oneInDays.toLocaleString("es-CO")}</div>
          <div style={{fontSize:".75rem",color:"var(--dim)",marginTop:4}}>
            Con {fmtHR(hps)} de hashrate</div>
        </div>
        <div style={{background:"var(--surface2)",border:"1px solid var(--border2)",
          borderRadius:10,padding:"16px 24px",textAlign:"center"}}>
          <div style={{fontSize:"2.2rem",fontWeight:800,fontVariantNumeric:"tabular-nums"}}>
            ~{Math.round(years).toLocaleString("es-CO")}</div>
          <div style={{fontSize:".72rem",color:"var(--dim)",marginTop:2}}>años promedio</div>
        </div>
      </div>
      <div style={{background:"var(--surface2)",borderRadius:8,padding:"12px 14px",
        fontSize:".75rem",color:"var(--dim)",lineHeight:1.7}}>
        ⚡ Esto es estadística pura — podrías ganar mañana o en décadas. Premio: ~3.125 BTC.
      </div>
    </Card>

    <Card>
      <div style={{fontSize:".67rem",fontWeight:600,letterSpacing:".1em",
        textTransform:"uppercase",color:"var(--dim)",marginBottom:14}}>
        Probabilidad acumulada</div>
      {periods.map((p,i)=>{
        const c=p.prob>50?"var(--green)":p.prob>10?"var(--yellow)":"var(--blue)";
        return(<div key={i} style={{display:"grid",gridTemplateColumns:"100px 1fr 100px",
          gap:12,alignItems:"center",padding:"8px 0",
          borderBottom:"1px solid var(--border)"}}>
          <div style={{fontSize:".82rem"}}>{p.l}</div>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <div style={{flex:1,height:5,background:"var(--border2)",borderRadius:3}}>
              <div style={{height:"100%",width:`${Math.min(p.prob*2,100)}%`,
                background:c,borderRadius:3,minWidth:2}}/>
            </div>
            <span style={{fontSize:".78rem",color:c,fontWeight:600,minWidth:50}}>
              {p.prob<0.01?p.prob.toExponential(2):p.prob.toFixed(2)}%</span>
          </div>
          <div style={{fontSize:".75rem",color:"var(--muted)",textAlign:"right",
            fontVariantNumeric:"tabular-nums"}}>
            1:{Math.round(1/(p.prob/100)).toLocaleString("es-CO")}</div>
        </div>);
      })}
    </Card>

    <Card>
      <div style={{fontSize:".67rem",fontWeight:600,letterSpacing:".1em",
        textTransform:"uppercase",color:"var(--dim)",marginBottom:14}}>Contexto de red</div>
      <StatRow label="Dificultad de red"           value={netDiffFmt}/>
      <StatRow label="Mejor share histórica"        value={<span style={{color:"var(--gold)"}}>{pp?.bestEverFmt}</span>}/>
      <StatRow label="% de dificultad alcanzado"    value={netDiff&&pp?.bestEver
        ?((pp.bestEver/netDiff)*100).toExponential(3)+"%":"—"}/>
      <StatRow label="Premio por bloque"            value="~3.125 BTC 🍀"/>
    </Card>
  </div>);
}

// ── Dashboard ─────────────────────────────────────────────────
export default function Dashboard(){
  const router=useRouter();
  const [data,setData]=useState(null);
  const [error,setError]=useState(null);
  const [loading,setLoading]=useState(true);
  const [lastUpdate,setLastUpdate]=useState(null);
  const [countdown,setCountdown]=useState(REFRESH);
  const [tab,setTab]=useState("resumen");
  const timerRef=useRef(null);
  const cdRef=useRef(null);

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
    timerRef.current=setInterval(fetchData,REFRESH*1000);
    return()=>clearInterval(timerRef.current);
  },[fetchData]);

  useEffect(()=>{
    cdRef.current=setInterval(()=>setCountdown(c=>c<=1?REFRESH:c-1),1000);
    return()=>clearInterval(cdRef.current);
  },[]);

  async function logout(){
    await fetch("/api/logout",{method:"POST"});
    router.push("/");
  }

  const miners=data?.miners??[];
  const ppOnline=data?.publicPool?.online;
  const shareLate=ppOnline&&data.publicPool.minsSinceShare>15;
  const anyMinerOnline=miners.some(m=>m.online);

  return(<>
    <Head>
      <title>⛏️ Minero Dashboard</title>
      <meta name="viewport" content="width=device-width, initial-scale=1"/>
      <meta name="robots" content="noindex,nofollow"/>
    </Head>

    <div className="root">
      <header>
        <div className="hl">
          <span style={{fontSize:"1.1rem"}}>⛏️</span>
          <span style={{fontSize:".95rem",fontWeight:700,letterSpacing:"-.02em"}}>Minero</span>
          {data?.address&&<span className="addr">{truncAddr(data.address)}</span>}
          {ppOnline&&<span className={`pill ${shareLate?"red":"green"}`}>
            {shareLate?"⚠ Sin share +15min":"● Pool activo"}</span>}
          {anyMinerOnline&&<span className="pill green">● Hardware online</span>}
        </div>
        <div className="hr-hdr">
          {error&&<span className="err-b">⚠ {error}</span>}
          {lastUpdate&&!loading&&(
            <span className="upd">{lastUpdate.toLocaleTimeString("es-CO")} · {countdown}s</span>
          )}
          <button className="btn-r" onClick={fetchData}>↻</button>
          <button className="btn-out" onClick={logout}>Salir</button>
        </div>
      </header>

      <Tabs active={tab} onChange={setTab}/>

      <main>
        {loading?<Skeleton/>:<>
          {tab==="resumen"  &&<TabResumen  data={data}/>}
          {tab==="hardware" &&<TabHardware miners={miners}/>}
          {tab==="pool"     &&<TabPool     data={data}/>}
          {tab==="odds"     &&<TabOdds     data={data}/>}
        </>}
      </main>
    </div>

    <style jsx global>{`
      @keyframes ping{0%{transform:scale(1);opacity:.6}70%{transform:scale(2.2);opacity:0}100%{transform:scale(2.2);opacity:0}}
    `}</style>

    <style jsx>{`
      .root{min-height:100vh;display:flex;flex-direction:column;}
      header{position:sticky;top:0;z-index:20;background:var(--surface);
        border-bottom:1px solid var(--border2);padding:0 24px;height:54px;
        display:flex;align-items:center;justify-content:space-between;gap:12px;}
      .hl,.hr-hdr{display:flex;align-items:center;gap:10px;flex-wrap:wrap;}
      .addr{font-size:.72rem;color:var(--muted);font-family:monospace;
        background:var(--surface3);padding:3px 8px;border-radius:20px;}
      .pill{font-size:.7rem;font-weight:600;padding:3px 10px;border-radius:20px;}
      .pill.green{background:var(--green-bg);color:var(--green);}
      .pill.red{background:var(--red-bg);color:var(--red);}
      .upd{font-size:.72rem;color:var(--dim);white-space:nowrap;}
      .err-b{font-size:.72rem;color:var(--red);padding:3px 8px;
        background:var(--red-bg);border-radius:6px;}
      .btn-r{background:none;border:1px solid var(--border2);color:var(--muted);
        width:30px;height:30px;border-radius:var(--r-sm);cursor:pointer;font-size:1rem;
        display:flex;align-items:center;justify-content:center;
        transition:border-color .15s,color .15s;}
      .btn-r:hover{border-color:var(--text);color:var(--text);}
      .btn-out{background:none;border:1px solid var(--border2);color:var(--muted);
        padding:5px 14px;border-radius:var(--r-sm);cursor:pointer;font-size:.78rem;
        transition:border-color .15s,color .15s;}
      .btn-out:hover{border-color:var(--red);color:var(--red);}
      main{max-width:1200px;margin:0 auto;padding:24px 24px 48px;width:100%;}
      @media(max-width:600px){
        header{padding:0 14px;height:auto;min-height:54px;padding:10px 14px;}
        main{padding:16px 12px 40px;}
        .addr,.upd{display:none;}
      }
    `}</style>
  </>);
}

function Skeleton(){
  return(<div style={{display:"grid",gap:14,
    gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))"}}>
    {[1,2,3,4].map(i=>(
      <div key={i} style={{background:"var(--surface)",border:"1px solid var(--border2)",
        borderRadius:"var(--r)",padding:22}}>
        {[1,2,3].map(j=><div key={j} style={{height:14,background:"var(--surface3)",
          borderRadius:6,marginBottom:12,width:j===2?"55%":"100%",
          animation:"pulse 1.5s ease-in-out infinite"}}/>)}
      </div>
    ))}
    <style jsx global>{`@keyframes pulse{0%,100%{opacity:.3}50%{opacity:.7}}`}</style>
  </div>);
}
