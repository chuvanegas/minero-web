import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/router";
import Head from "next/head";

const REFRESH       = 20;
const DEFAULT_KWH   = 0.12;
const DEFAULT_CAPEX = 0;   // costo de compra del equipo en USD

// ─── Formatos ─────────────────────────────────────────────────
function fmtHR(hps) {
  if (!hps||hps<=0) return { val:"0",unit:"H/s",full:"0 H/s" };
  const u=["H/s","KH/s","MH/s","GH/s","TH/s","PH/s"];
  let i=0,v=hps;
  while(v>=1000&&i<u.length-1){v/=1000;i++;}
  return { val:v.toFixed(2),unit:u[i],full:`${v.toFixed(2)} ${u[i]}` };
}
function ago(mins) {
  if(!isFinite(mins)||mins==null) return "—";
  const m=Math.round(mins);
  if(m<1) return "ahora";
  if(m<60) return `${m}m`;
  return `${Math.floor(m/60)}h ${m%60}m`;
}
function usd(n,dec=2) {
  if(n==null||isNaN(n)) return "—";
  return "$"+n.toFixed(dec);
}
function pctFmt(n,dec=4) {
  if(n==null) return "—";
  return n<0.0001?n.toExponential(2)+"%":n.toFixed(dec)+"%";
}
function truncAddr(a) { return a?a.slice(0,8)+"…"+a.slice(-6):""; }
function elec(w,p) {
  const kd=(w*24)/1000;
  return { kwhDay:kd.toFixed(3),kwhMonth:(kd*30).toFixed(1),
    costDay:(kd*p).toFixed(3),costMonth:(kd*30*p).toFixed(2),costYear:(kd*365*p).toFixed(0) };
}

// ─── Componentes base ─────────────────────────────────────────
function LiveDot({status}){
  const c={ok:"#00e676",warn:"#ffb300",crit:"#ff4d6a",off:"#3d4a60"}[status]||"#3d4a60";
  return(
    <span style={{position:"relative",display:"inline-flex",
      alignItems:"center",justifyContent:"center",width:12,height:12,flexShrink:0}}>
      {status!=="off"&&<span style={{position:"absolute",inset:0,borderRadius:"50%",
        background:c,opacity:.35,animation:"ping 1.8s ease-in-out infinite"}}/>}
      <span style={{width:8,height:8,borderRadius:"50%",background:c,
        boxShadow:status!=="off"?`0 0 8px ${c}`:undefined,position:"relative"}}/>
    </span>
  );
}

function Badge({label,color="dim",dot}){
  const m={
    green:{bg:"rgba(0,230,118,.1)",fg:"#00e676",bd:"rgba(0,230,118,.2)"},
    red:  {bg:"rgba(255,77,106,.1)",fg:"#ff4d6a",bd:"rgba(255,77,106,.2)"},
    yellow:{bg:"rgba(255,179,0,.1)",fg:"#ffb300",bd:"rgba(255,179,0,.2)"},
    blue: {bg:"rgba(79,195,247,.1)",fg:"#4fc3f7",bd:"rgba(79,195,247,.2)"},
    gold: {bg:"rgba(255,213,79,.1)",fg:"#ffd54f",bd:"rgba(255,213,79,.2)"},
    dim:  {bg:"rgba(255,255,255,.04)",fg:"#7a8499",bd:"rgba(255,255,255,.08)"},
  };
  const s=m[color]||m.dim;
  return(
    <span style={{display:"inline-flex",alignItems:"center",gap:5,fontSize:".65rem",
      fontWeight:700,letterSpacing:".06em",textTransform:"uppercase",
      padding:"3px 9px",borderRadius:99,background:s.bg,color:s.fg,
      border:`1px solid ${s.bd}`,whiteSpace:"nowrap"}}>
      {dot&&<LiveDot status={color==="green"?"ok":color==="red"?"crit":"warn"}/>}
      {label}
    </span>
  );
}

function Card({children,style,accent,flat}){
  const accentColor={green:"#00e676",blue:"#4fc3f7",gold:"#ffd54f",red:"#ff4d6a"};
  return(
    <div style={{background:"var(--surface)",border:"1px solid var(--border)",
      borderRadius:16,padding:"20px 22px",position:"relative",overflow:"hidden",...style}}>
      {accent&&accentColor[accent]&&(
        <div style={{position:"absolute",top:0,left:0,right:0,height:2,
          background:`linear-gradient(90deg,transparent,${accentColor[accent]}80,transparent)`}}/>
      )}
      {children}
    </div>
  );
}

function Num({val,unit,color="var(--text)",size="2.6rem",mono}){
  return(
    <div style={{display:"flex",alignItems:"baseline",gap:5,flexWrap:"wrap"}}>
      <span style={{fontSize:size,fontWeight:900,color,letterSpacing:"-.05em",
        fontVariantNumeric:"tabular-nums",lineHeight:1,
        fontFamily:mono?"'JetBrains Mono',monospace":undefined}}>{val}</span>
      {unit&&<span style={{fontSize:"1rem",fontWeight:600,color:"var(--dim)"}}>{unit}</span>}
    </div>
  );
}

function Label({children}){
  return <div style={{fontSize:".6rem",fontWeight:700,letterSpacing:".14em",
    textTransform:"uppercase",color:"var(--dim)",marginBottom:6}}>{children}</div>;
}

function Row({label,value,color,mono,borderless}){
  return(
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",
      padding:"8px 0",borderBottom:borderless?undefined:"1px solid var(--border)"}}>
      <span style={{fontSize:".77rem",color:"var(--muted)"}}>{label}</span>
      <span style={{fontSize:".83rem",fontWeight:500,fontVariantNumeric:"tabular-nums",
        color:color||"var(--text)",
        fontFamily:mono?"'JetBrains Mono',monospace":undefined}}>{value??"—"}</span>
    </div>
  );
}

function Bar({value,max,color="var(--green)",h=5,label,right,glow=true}){
  const pct=Math.min((value/max)*100,100);
  return(
    <div>
      {(label||right)&&(
        <div style={{display:"flex",justifyContent:"space-between",
          fontSize:".71rem",color:"var(--muted)",marginBottom:5}}>
          {label&&<span>{label}</span>}
          {right&&<span style={{color:"var(--text)",fontWeight:600}}>{right}</span>}
        </div>
      )}
      <div style={{height:h,background:"var(--surface2)",borderRadius:99,
        border:"1px solid var(--border)",overflow:"hidden"}}>
        <div style={{height:"100%",width:`${pct}%`,borderRadius:99,
          background:color,transition:"width .6s ease",
          boxShadow:glow?`0 0 6px ${color}60`:undefined,minWidth:pct>0?2:0}}/>
      </div>
    </div>
  );
}

// ─── Gráfica de área SVG ──────────────────────────────────────
function AreaChart({data,color="#00e676",height=80}){
  if(!data?.length||data.length<2) return(
    <div style={{height,display:"flex",alignItems:"center",justifyContent:"center"}}>
      <span style={{fontSize:".72rem",color:"var(--dim)"}}>
        Acumulando datos… (1 punto cada 5 min)</span>
    </div>
  );
  const W=600,H=height;
  const vals=data.map(d=>d.h);
  const mn=Math.min(...vals)*.97, mx=Math.max(...vals)*1.03;
  const range=mx-mn||1;
  const pts=data.map((d,i)=>[
    (i/(data.length-1))*W,
    H-((d.h-mn)/range)*(H-4)+2
  ]);
  const line=pts.map((p,i)=>(i===0?"M":"L")+p.join(" ")).join(" ");
  const area=`${line} L${W} ${H} L0 ${H} Z`;
  const last=pts[pts.length-1];
  const id=`g${color.replace(/[^a-z0-9]/gi,"")}`;
  return(
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={height}
      style={{overflow:"visible",display:"block"}}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor={color} stopOpacity={.25}/>
          <stop offset="100%" stopColor={color} stopOpacity={.01}/>
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${id})`}/>
      <path d={line} fill="none" stroke={color} strokeWidth={2}
        strokeLinecap="round" strokeLinejoin="round"
        style={{filter:`drop-shadow(0 0 3px ${color})`}}/>
      <circle cx={last[0]} cy={last[1]} r={5} fill={color}
        style={{filter:`drop-shadow(0 0 6px ${color})`}}/>
    </svg>
  );
}

// ─── Gauge temperatura SVG ────────────────────────────────────
function TempGauge({temp}){
  if(temp==null) return null;
  const color=temp>=75?"#ff4d6a":temp>=68?"#ffb300":"#00e676";
  const label=temp>=75?"CRÍTICO":temp>=68?"ALTO":"OK";
  const R=36,cx=50,cy=52;
  const s=Math.PI*.75,span=Math.PI*1.5;
  const xy=a=>[cx+R*Math.cos(a),cy+R*Math.sin(a)];
  const [sx,sy]=xy(s);
  const ea=s+span*Math.min(temp/100,1);
  const [ex,ey]=xy(ea);
  const [x2,y2]=xy(s+span);
  return(
    <svg width={100} height={76} viewBox="0 0 100 76">
      <path d={`M${sx} ${sy} A${R} ${R} 0 1 1 ${x2} ${y2}`}
        fill="none" stroke="var(--surface2)" strokeWidth={7} strokeLinecap="round"/>
      {temp>0&&<path d={`M${sx} ${sy} A${R} ${R} 0 ${span*Math.min(temp/100,1)>Math.PI?1:0} 1 ${ex} ${ey}`}
        fill="none" stroke={color} strokeWidth={7} strokeLinecap="round"
        style={{filter:`drop-shadow(0 0 5px ${color})`}}/>}
      <text x={50} y={54} textAnchor="middle" fontSize={17} fontWeight={800}
        fill={color} fontFamily="'JetBrains Mono',monospace">{temp}°</text>
      <text x={50} y={67} textAnchor="middle" fontSize={6.5} fontWeight={700}
        fill={color} letterSpacing={1.5}>{label}</text>
    </svg>
  );
}

// ─── Sidebar ──────────────────────────────────────────────────
const NAV=[
  {id:"fleet",     icon:"▣",  label:"Fleet"},
  {id:"analytics", icon:"◈",  label:"Analytics"},
  {id:"finance",   icon:"$",  label:"Financiero"},
  {id:"hardware",  icon:"⬡",  label:"Hardware"},
  {id:"pool",      icon:"◉",  label:"Pool"},
  {id:"odds",      icon:"◎",  label:"Probabilidad"},
];

function Sidebar({active,onChange,data}){
  const fleet=data?.fleet;
  return(
    <aside style={{width:220,flexShrink:0,background:"var(--surface)",
      borderRight:"1px solid var(--border)",display:"flex",flexDirection:"column",
      position:"sticky",top:0,height:"100vh",overflowY:"auto"}}>
      {/* Logo */}
      <div style={{padding:"22px 20px 16px",borderBottom:"1px solid var(--border)"}}>
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:16}}>
          <span style={{fontSize:"1.3rem"}}>⛏️</span>
          <span style={{fontWeight:800,fontSize:"1.05rem",letterSpacing:"-.03em",
            background:"linear-gradient(90deg,#00e676,#4fc3f7)",
            WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>Minero</span>
        </div>
        {fleet&&(
          <div style={{background:"var(--surface2)",borderRadius:10,padding:"10px 12px",
            border:"1px solid var(--border)"}}>
            <div style={{fontSize:".6rem",color:"var(--dim)",marginBottom:4}}>FLEET TOTAL</div>
            <div style={{fontSize:"1.3rem",fontWeight:800,color:"#00e676",
              fontVariantNumeric:"tabular-nums",letterSpacing:"-.03em"}}>
              {fmtHR(fleet.totalHps).full}</div>
            <div style={{display:"flex",gap:8,marginTop:6,flexWrap:"wrap"}}>
              <Badge label={`${fleet.onlineCount}/${fleet.totalCount} online`}
                color={fleet.onlineCount===fleet.totalCount?"green":"yellow"}/>
              <Badge label={`${fleet.totalPower?.toFixed(0)}W`} color="dim"/>
            </div>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav style={{padding:"10px 8px",flex:1}}>
        {NAV.map(n=>(
          <button key={n.id} onClick={()=>onChange(n.id)}
            style={{display:"flex",alignItems:"center",gap:10,width:"100%",
              background:active===n.id?"rgba(0,230,118,.08)":"none",
              border:active===n.id?"1px solid rgba(0,230,118,.15)":"1px solid transparent",
              color:active===n.id?"#00e676":"var(--muted)",
              borderRadius:10,padding:"10px 12px",cursor:"pointer",
              fontSize:".84rem",fontWeight:active===n.id?700:400,
              transition:"all .15s",textAlign:"left",marginBottom:2,fontFamily:"inherit"}}>
            <span style={{fontSize:".72rem",opacity:.7,width:14,textAlign:"center"}}>{n.icon}</span>
            {n.label}
          </button>
        ))}
      </nav>

      {/* Footer */}
      <div style={{padding:"12px 16px",borderTop:"1px solid var(--border)",
        fontSize:".65rem",color:"var(--dim)",lineHeight:1.8}}>
        <div>Actualiza cada {REFRESH}s</div>
        <div style={{color:"var(--dim)"}}>Redis · public-pool.io</div>
      </div>
    </aside>
  );
}

// ─── SECCIÓN: FLEET ───────────────────────────────────────────
function SectionFleet({data,kwh}){
  const {miners=[],publicPool:pp,netDiffFmt,btcPrice,hrHistory=[],fleet,financials}=data;
  const hr=pp?.online?fmtHR(pp.hashHps10m):null;
  const totalCost=fleet?.totalPower>0?elec(fleet.totalPower,kwh):null;

  return(
    <div style={{display:"flex",flexDirection:"column",gap:24}}>

      {/* KPI bar */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(180px,1fr))",gap:12}}>
        {[
          {l:"HASHRATE TOTAL",  v:hr?.val||"—",  u:hr?.unit, c:"#00e676",  accent:"green", i:"⚡"},
          {l:"POTENCIA TOTAL",  v:fleet?.totalPower?.toFixed(1)||"—", u:"W", c:"#4fc3f7", i:"💡"},
          {l:"PRECIO BTC",      v:btcPrice?`$${btcPrice.toLocaleString("en-US")}`:null,u:"USD",c:"#ffd54f",accent:"gold",i:"₿"},
          {l:"DIFICULTAD RED",  v:netDiffFmt||"—", u:"",  c:"var(--text)", i:"🌐"},
        ].map((k,i)=>(
          <Card key={i} accent={k.accent} style={{padding:"18px 20px"}}>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}>
              <Label>{k.l}</Label>
              <span style={{fontSize:"1rem",opacity:.5}}>{k.i}</span>
            </div>
            <Num val={k.v||"—"} unit={k.u} color={k.c} size="2rem"/>
          </Card>
        ))}
      </div>

      {/* Gráfica hashrate */}
      <Card accent="green">
        <div style={{display:"flex",justifyContent:"space-between",
          alignItems:"center",marginBottom:16,flexWrap:"wrap",gap:8}}>
          <div>
            <Label>HASHRATE · ÚLTIMAS 24H</Label>
            <div style={{display:"flex",alignItems:"baseline",gap:8}}>
              <Num val={hr?.val||"—"} unit={hr?.unit} color="#00e676" size="1.8rem"/>
              {pp?.online&&<span style={{fontSize:".72rem",color:"var(--dim)"}}>10 min</span>}
            </div>
          </div>
          {pp?.online&&(
            <div style={{textAlign:"right"}}>
              <div style={{fontSize:".6rem",color:"var(--dim)",marginBottom:2}}>1 HORA</div>
              <Num val={fmtHR(pp.hashHps1h).val} unit={fmtHR(pp.hashHps1h).unit} size="1.1rem"/>
            </div>
          )}
        </div>
        <AreaChart data={hrHistory} color="#00e676" height={90}/>
      </Card>

      {/* Tabla flota */}
      <Card>
        <Label>EQUIPOS · FLOTA COMPLETA</Label>
        <div style={{overflowX:"auto"}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:".82rem"}}>
            <thead>
              <tr style={{color:"var(--dim)",fontSize:".62rem",fontWeight:700,
                letterSpacing:".08em",textTransform:"uppercase"}}>
                {["Estado","Equipo","Modelo","Hashrate","Temp","Potencia","Fan","Shares","Uptime"].map((h,i)=>(
                  <th key={i} style={{padding:"8px 12px 12px",textAlign:"left",
                    borderBottom:"1px solid var(--border)",whiteSpace:"nowrap"}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {miners.map((m,i)=>{
                const st=!m.online?"off":m.temp>=75?"crit":m.temp>=68?"warn":"ok";
                const tc={ok:"#00e676",warn:"#ffb300",crit:"#ff4d6a",off:"var(--dim)"}[st];
                return(
                  <tr key={i} style={{borderBottom:"1px solid var(--border)",
                    transition:"background .1s"}}
                    onMouseEnter={e=>e.currentTarget.style.background="var(--surface2)"}
                    onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                    <td style={{padding:"12px"}}>
                      <LiveDot status={st}/>
                    </td>
                    <td style={{padding:"12px",fontWeight:700}}>{m.name}</td>
                    <td style={{padding:"12px",color:"var(--muted)",
                      fontFamily:"'JetBrains Mono',monospace",fontSize:".76rem"}}>
                      {m.online?m.model:"—"}</td>
                    <td style={{padding:"12px",color:"#00e676",fontWeight:700,
                      fontVariantNumeric:"tabular-nums"}}>
                      {m.online?fmtHR(m.hashHps).full:"—"}</td>
                    <td style={{padding:"12px",color:tc,fontWeight:600,
                      fontVariantNumeric:"tabular-nums"}}>
                      {m.online?`${m.temp}°C`:"—"}</td>
                    <td style={{padding:"12px",fontVariantNumeric:"tabular-nums"}}>
                      {m.online?`${m.power?.toFixed(1)}W`:"—"}</td>
                    <td style={{padding:"12px",color:"var(--muted)",
                      fontVariantNumeric:"tabular-nums"}}>
                      {m.online?`${m.fanrpm?.toLocaleString()} rpm`:"—"}</td>
                    <td style={{padding:"12px",fontVariantNumeric:"tabular-nums"}}>
                      {m.online?(
                        <span>
                          <span style={{color:"#00e676"}}>{m.sharesAccepted?.toLocaleString()}</span>
                          {m.sharesRejected>0&&<span style={{color:"#ff4d6a",marginLeft:4}}>
                            -{m.sharesRejected}</span>}
                        </span>
                      ):"—"}</td>
                    <td style={{padding:"12px",color:"var(--muted)"}}>
                      {m.online?m.uptimeFmt:"—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {miners.length===0&&(
          <p style={{color:"var(--muted)",padding:"16px 0",fontSize:".82rem"}}>
            Sin mineros configurados.</p>
        )}
      </Card>

      {/* Pool + costo rápido */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))",gap:12}}>
        {pp?.online&&(
          <Card accent="blue">
            <Badge label="public-pool.io" color="blue" dot/>
            <div style={{marginTop:12,marginBottom:14}}>
              <Num val={fmtHR(pp.hashHps10m).val} unit={fmtHR(pp.hashHps10m).unit}
                color="#4fc3f7" size="1.8rem"/>
            </div>
            <Row label="Shares totales"  value={pp.shares?.toLocaleString("es-CO")}/>
            <Row label="Workers"         value={pp.workerCount}/>
            <Row label="Última share"    value={ago(pp.minsSinceShare)}
              color={pp.minsSinceShare>15?"#ff4d6a":"#00e676"}/>
            <Row label="Mejor share"     value={pp.bestEverFmt} color="#ffd54f" borderless/>
            {pp.minsSinceShare>15&&(
              <div style={{marginTop:12,padding:"8px 12px",background:"rgba(255,77,106,.08)",
                border:"1px solid rgba(255,77,106,.2)",borderRadius:8,
                fontSize:".75rem",color:"#ff4d6a"}}>
                ⚠ Sin share hace {Math.round(pp.minsSinceShare)} min
              </div>
            )}
          </Card>
        )}
        {totalCost&&(
          <Card>
            <Label>ELECTRICIDAD · MES</Label>
            <Num val={`$${totalCost.costMonth}`} color="#ffb300" size="1.8rem"/>
            <div style={{marginTop:14}}>
              <Row label="kWh / mes"    value={totalCost.kwhMonth}/>
              <Row label="Potencia total" value={`${fleet.totalPower?.toFixed(1)} W`}/>
              <Row label="Costo / día"  value={`$${totalCost.costDay}`} borderless/>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}

// ─── SECCIÓN: ANALYTICS ───────────────────────────────────────
function SectionAnalytics({data}){
  const {miners=[],publicPool:pp,hrHistory=[],fleet}=data;
  const onlineMiners=miners.filter(m=>m.online);

  return(
    <div style={{display:"flex",flexDirection:"column",gap:20}}>

      {/* Hashrate histórico grande */}
      <Card accent="green">
        <div style={{display:"flex",justifyContent:"space-between",
          alignItems:"center",marginBottom:16,flexWrap:"wrap",gap:8}}>
          <div>
            <Label>HASHRATE HISTÓRICO</Label>
            <div style={{fontSize:".72rem",color:"var(--dim)"}}>
              {hrHistory.length} puntos · 1 por cada 5 min
            </div>
          </div>
          {hrHistory.length>1&&(()=>{
            const vals=hrHistory.map(d=>d.h);
            const avg=vals.reduce((a,b)=>a+b,0)/vals.length;
            const max=Math.max(...vals);
            const min=Math.min(...vals);
            return(
              <div style={{display:"flex",gap:12,flexWrap:"wrap"}}>
                {[["Prom.",fmtHR(avg).full,"var(--text)"],
                  ["Máx.", fmtHR(max).full,"#00e676"],
                  ["Mín.", fmtHR(min).full,"#ff4d6a"]].map(([l,v,c],i)=>(
                  <div key={i} style={{textAlign:"right"}}>
                    <div style={{fontSize:".6rem",color:"var(--dim)"}}>{l}</div>
                    <div style={{fontWeight:700,color:c,fontVariantNumeric:"tabular-nums",
                      fontSize:".84rem"}}>{v}</div>
                  </div>
                ))}
              </div>
            );
          })()}
        </div>
        <AreaChart data={hrHistory} color="#00e676" height={120}/>
      </Card>

      {/* Métricas por equipo */}
      {onlineMiners.length>0&&(
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(300px,1fr))",gap:14}}>
          {onlineMiners.map((m,i)=>{
            const st=m.temp>=75?"crit":m.temp>=68?"warn":"ok";
            const tc={ok:"#00e676",warn:"#ffb300",crit:"#ff4d6a"}[st];
            const eff=m.power&&m.hashHps>0?(m.power/(m.hashHps/1e12)).toFixed(2):null;
            const total=(m.sharesAccepted||0)+(m.sharesRejected||0);
            const rate=total>0?((m.sharesAccepted/total)*100).toFixed(2):null;
            return(
              <Card key={i}>
                <div style={{display:"flex",justifyContent:"space-between",
                  alignItems:"center",marginBottom:16}}>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    <LiveDot status={st}/>
                    <div>
                      <div style={{fontWeight:700}}>{m.name}</div>
                      <div style={{fontSize:".68rem",color:"var(--dim)",
                        fontFamily:"'JetBrains Mono',monospace"}}>{m.model}</div>
                    </div>
                  </div>
                  <Badge label={st==="ok"?"Activo":st==="crit"?"Crítico":"Temp alta"}
                    color={st==="ok"?"green":st==="crit"?"red":"yellow"} dot/>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:16}}>
                  {[
                    {l:"Hashrate",v:fmtHR(m.hashHps).full,c:"#00e676"},
                    {l:"Temperatura",v:`${m.temp}°C`,c:tc},
                    {l:"Potencia",v:`${m.power?.toFixed(1)} W`,c:"#4fc3f7"},
                    {l:"Fan",v:`${m.fanrpm?.toLocaleString()} rpm`,c:"var(--muted)"},
                    {l:"Eficiencia",v:eff?`${eff} J/TH`:"—",c:"#b39ddb"},
                    {l:"Tasa accept.",v:rate?`${rate}%`:"—",
                      c:rate>=99?"#00e676":rate>=95?"#ffb300":"#ff4d6a"},
                  ].map((s,j)=>(
                    <div key={j} style={{background:"var(--surface2)",borderRadius:9,
                      padding:"10px 12px",border:"1px solid var(--border)"}}>
                      <div style={{fontSize:".6rem",color:"var(--dim)",marginBottom:3}}>{s.l}</div>
                      <div style={{fontWeight:700,color:s.c,fontVariantNumeric:"tabular-nums",
                        fontSize:".88rem"}}>{s.v}</div>
                    </div>
                  ))}
                </div>
                <Bar value={m.temp} max={85} color={tc}
                  label="Temperatura" right={`${m.temp}°C`}/>
                <div style={{marginTop:10}}>
                  <Bar value={parseFloat(rate)||0} max={100} color="#00e676"
                    label="Tasa aceptación" right={`${rate||0}%`}/>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {onlineMiners.length===0&&(
        <Card>
          <div style={{textAlign:"center",padding:32,color:"var(--muted)"}}>
            <div style={{fontSize:"2rem",marginBottom:8,opacity:.3}}>📡</div>
            Hardware no alcanzable — el relay en tu Mac necesita estar corriendo
          </div>
        </Card>
      )}
    </div>
  );
}

// ─── SECCIÓN: FINANCIERO ──────────────────────────────────────
function SectionFinance({data,kwh,onKwh,capex,onCapex}){
  const {miners=[],publicPool:pp,btcPrice,financials,fleet,odds}=data;
  const totalPower=fleet?.totalPower||0;
  const e=totalPower>0?elec(totalPower,kwh):null;
  const fin=financials;

  const profit_day  = fin?(fin.revenuePerDayUSD  - parseFloat(e?.costDay||0)):null;
  const profit_month= fin?(fin.revenuePerMonthUSD - parseFloat(e?.costMonth||0)):null;
  const profit_year = fin?(fin.revenuePerYearUSD  - parseFloat(e?.costYear||0)):null;
  const roi_months  = (capex>0&&profit_month&&profit_month>0)
    ? (capex/profit_month).toFixed(1) : null;

  return(
    <div style={{display:"flex",flexDirection:"column",gap:20}}>

      {/* Config */}
      <Card>
        <Label>PARÁMETROS</Label>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))",gap:12,marginTop:8}}>
          <div>
            <div style={{fontSize:".72rem",color:"var(--muted)",marginBottom:6}}>
              Precio electricidad (USD/kWh)</div>
            <input type="number" min="0.01" max="2" step="0.01" value={kwh}
              onChange={e=>onKwh(parseFloat(e.target.value)||DEFAULT_KWH)}
              style={{width:"100%",background:"var(--surface2)",border:"1px solid var(--border)",
                color:"var(--text)",padding:"9px 14px",borderRadius:9,
                fontSize:".9rem",fontWeight:600,outline:"none",
                fontFamily:"'JetBrains Mono',monospace"}}/>
            <div style={{fontSize:".65rem",color:"var(--dim)",marginTop:4}}>
              Colombia ≈ $0.08 · USA ≈ $0.12–0.18
            </div>
          </div>
          <div>
            <div style={{fontSize:".72rem",color:"var(--muted)",marginBottom:6}}>
              Costo de equipos (USD) — para calcular ROI</div>
            <input type="number" min="0" step="1" value={capex}
              onChange={e=>onCapex(parseFloat(e.target.value)||0)}
              placeholder="Ej: 400"
              style={{width:"100%",background:"var(--surface2)",border:"1px solid var(--border)",
                color:"var(--text)",padding:"9px 14px",borderRadius:9,
                fontSize:".9rem",fontWeight:600,outline:"none",
                fontFamily:"'JetBrains Mono',monospace"}}/>
            <div style={{fontSize:".65rem",color:"var(--dim)",marginTop:4}}>
              Bitaxe Gamma ≈ $200–400 USD
            </div>
          </div>
          <div>
            <div style={{fontSize:".72rem",color:"var(--muted)",marginBottom:6}}>Precio BTC actual</div>
            <div style={{background:"var(--surface2)",border:"1px solid var(--border)",
              padding:"9px 14px",borderRadius:9,fontSize:".9rem",fontWeight:700,
              color:"#ffd54f",fontFamily:"'JetBrains Mono',monospace"}}>
              {btcPrice?`$${btcPrice.toLocaleString("en-US")} USD`:"Cargando…"}
            </div>
          </div>
        </div>
      </Card>

      {/* P&L diario */}
      {fin&&(
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))",gap:12}}>
          {[
            {l:"INGRESOS / DÍA",  v:usd(fin.revenuePerDayUSD,4), c:"#00e676", accent:"green"},
            {l:"INGRESOS / MES",  v:usd(fin.revenuePerMonthUSD,2),c:"#00e676", accent:"green"},
            {l:"INGRESOS / AÑO",  v:usd(fin.revenuePerYearUSD,2), c:"#00e676"},
            {l:"BTC / DÍA",       v:fin.revenuePerDayBTC?.toExponential(4)+" BTC", c:"#ffd54f", accent:"gold"},
          ].map((k,i)=>(
            <Card key={i} accent={k.accent} style={{padding:"18px 20px"}}>
              <Label>{k.l}</Label>
              <Num val={k.v} color={k.c} size="1.6rem" mono/>
              <div style={{fontSize:".65rem",color:"var(--dim)",marginTop:6}}>
                Estimado — basado en probabilidad estadística
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Costos */}
      {e&&(
        <Card>
          <Label>ELECTRICIDAD · DESGLOSE</Label>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))",
            gap:10,marginTop:10}}>
            {[
              {l:"kWh / día",   v:e.kwhDay,         c:"var(--text)"},
              {l:"kWh / mes",  v:e.kwhMonth,        c:"var(--text)"},
              {l:"Costo / día", v:`$${e.costDay}`,  c:"#ffb300"},
              {l:"Costo / mes", v:`$${e.costMonth}`,c:"#ffb300"},
              {l:"Costo / año", v:`$${e.costYear}`, c:"#ff4d6a"},
              {l:"Potencia",    v:`${totalPower.toFixed(1)} W`, c:"#4fc3f7"},
            ].map((s,i)=>(
              <div key={i} style={{background:"var(--surface2)",borderRadius:9,
                padding:"12px 14px",border:"1px solid var(--border)"}}>
                <div style={{fontSize:".6rem",color:"var(--dim)",marginBottom:3}}>{s.l}</div>
                <div style={{fontWeight:700,color:s.c,fontVariantNumeric:"tabular-nums",
                  fontSize:".95rem",fontFamily:"'JetBrains Mono',monospace"}}>{s.v}</div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Utilidad neta */}
      {fin&&e&&(
        <Card accent={profit_month>0?"green":"red"}>
          <Label>UTILIDAD NETA (ingresos − electricidad)</Label>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(180px,1fr))",
            gap:12,marginTop:10}}>
            {[
              {l:"Por día",   v:usd(profit_day,4),  c:profit_day>0?"#00e676":"#ff4d6a"},
              {l:"Por mes",   v:usd(profit_month),   c:profit_month>0?"#00e676":"#ff4d6a"},
              {l:"Por año",   v:usd(profit_year),    c:profit_year>0?"#00e676":"#ff4d6a"},
              roi_months&&{l:"ROI estimado",v:`${roi_months} meses`,c:"#ffd54f"},
            ].filter(Boolean).map((s,i)=>(
              <div key={i} style={{background:"var(--surface2)",borderRadius:9,
                padding:"14px 16px",border:"1px solid var(--border)"}}>
                <div style={{fontSize:".6rem",color:"var(--dim)",marginBottom:4}}>{s.l}</div>
                <div style={{fontWeight:800,color:s.c,fontVariantNumeric:"tabular-nums",
                  fontSize:"1.2rem",fontFamily:"'JetBrains Mono',monospace"}}>{s.v}</div>
              </div>
            ))}
          </div>
          <div style={{marginTop:14,fontSize:".72rem",color:"var(--dim)",lineHeight:1.7,
            padding:"10px 12px",background:"rgba(255,255,255,.03)",borderRadius:8}}>
            ⚠ Estimado estadístico — mining solo es altamente variable.
            No garantiza ingresos regulares. El 99%+ del tiempo no se mina ningún bloque.
          </div>
        </Card>
      )}

      {!fin&&(
        <Card>
          <p style={{color:"var(--muted)",padding:12,fontSize:".84rem"}}>
            Esperando precio BTC y datos de hashrate para calcular ingresos…</p>
        </Card>
      )}
    </div>
  );
}

// ─── SECCIÓN: HARDWARE ────────────────────────────────────────
function SectionHardware({miners,kwh,onKwh}){
  const online=miners.filter(m=>m.online);
  const totalW=online.reduce((a,m)=>a+(m.power||0),0);
  const totE=totalW>0?elec(totalW,kwh):null;

  return(
    <div style={{display:"flex",flexDirection:"column",gap:16}}>
      {/* Control kWh */}
      <Card>
        <div style={{display:"flex",alignItems:"center",
          justifyContent:"space-between",flexWrap:"wrap",gap:12}}>
          <div>
            <Label>💡 PRECIO ELECTRICIDAD</Label>
            <div style={{fontSize:".75rem",color:"var(--muted)"}}>
              Ajusta para calcular costos exactos</div>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <span style={{fontSize:".8rem",color:"var(--muted)"}}>USD/kWh</span>
            <input type="number" min="0.01" max="2" step="0.01" value={kwh}
              onChange={e=>onKwh(parseFloat(e.target.value)||DEFAULT_KWH)}
              style={{width:90,background:"var(--surface2)",border:"1px solid var(--border)",
                color:"var(--text)",padding:"8px 12px",borderRadius:9,
                fontSize:".9rem",fontWeight:700,outline:"none",textAlign:"center",
                fontFamily:"'JetBrains Mono',monospace"}}/>
          </div>
        </div>
        {totE&&(
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(120px,1fr))",
            gap:10,marginTop:14}}>
            {[
              {l:"Total W",     v:`${totalW.toFixed(1)} W`,c:"#4fc3f7"},
              {l:"kWh / día",   v:totE.kwhDay,             c:"var(--text)"},
              {l:"kWh / mes",  v:totE.kwhMonth,            c:"var(--text)"},
              {l:"Costo / día", v:`$${totE.costDay}`,      c:"#ffb300"},
              {l:"Costo / mes", v:`$${totE.costMonth}`,    c:"#ffb300"},
              {l:"Costo / año", v:`$${totE.costYear}`,     c:"#ff4d6a"},
            ].map((s,i)=>(
              <div key={i} style={{background:"var(--surface2)",borderRadius:9,
                padding:"10px 12px",border:"1px solid var(--border)"}}>
                <div style={{fontSize:".58rem",color:"var(--dim)",marginBottom:3}}>{s.l}</div>
                <div style={{fontWeight:700,color:s.c,fontVariantNumeric:"tabular-nums",
                  fontSize:".9rem"}}>{s.v}</div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {miners.map((m,i)=><MinerCard key={i} m={m} kwh={kwh}/>)}
    </div>
  );
}

function MinerCard({m,kwh}){
  const st=!m.online?"off":m.temp>=75?"crit":m.temp>=68?"warn":"ok";
  const sc={ok:"#00e676",warn:"#ffb300",crit:"#ff4d6a",off:"var(--dim)"}[st];
  const total=(m.sharesAccepted||0)+(m.sharesRejected||0);
  const rate=total>0?((m.sharesAccepted/total)*100).toFixed(2):0;
  const eff=m.power&&m.hashHps>0?(m.power/(m.hashHps/1e12)).toFixed(2):null;
  const e=m.online&&m.power>0?elec(m.power,kwh):null;

  if(!m.online) return(
    <Card>
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:16}}>
        <LiveDot status="off"/>
        <span style={{fontWeight:700,fontSize:"1rem"}}>{m.name}</span>
        <Badge label="Offline" color="dim"/>
      </div>
      <div style={{background:"var(--surface2)",borderRadius:12,padding:24,
        textAlign:"center",border:"1px solid var(--border)"}}>
        <div style={{fontSize:"2rem",marginBottom:10,opacity:.25}}>📡</div>
        <div style={{fontSize:".85rem",color:"var(--muted)",marginBottom:6,fontWeight:600}}>
          No alcanzable desde la nube</div>
        <code style={{fontSize:".72rem",color:"var(--dim)",background:"var(--surface3)",
          padding:"2px 8px",borderRadius:5,fontFamily:"'JetBrains Mono',monospace"}}>
          {m.url}</code>
      </div>
    </Card>
  );

  return(
    <Card accent={st==="crit"?"red":"green"}>
      {/* Header */}
      <div style={{display:"flex",justifyContent:"space-between",
        alignItems:"center",marginBottom:22,flexWrap:"wrap",gap:10}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <LiveDot status={st}/>
          <div>
            <div style={{fontWeight:800,fontSize:"1.05rem"}}>{m.name}</div>
            <div style={{fontSize:".68rem",color:"var(--dim)",marginTop:1,
              fontFamily:"'JetBrains Mono',monospace"}}>{m.model} · {m.frequency} MHz</div>
          </div>
        </div>
        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
          <Badge label={st==="ok"?"Activo":st==="crit"?"¡Crítico!":"Temp alta"}
            color={st==="ok"?"green":st==="crit"?"red":"yellow"} dot/>
          <Badge label={`Up: ${m.uptimeFmt}`} color="dim"/>
        </div>
      </div>

      {/* Métricas */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(190px,1fr))",
        gap:14,marginBottom:18}}>
        {/* Hashrate */}
        <div style={{background:"var(--surface2)",borderRadius:12,padding:16,
          border:"1px solid var(--border)"}}>
          <Label>⚡ HASHRATE</Label>
          <Num val={fmtHR(m.hashHps).val} unit={fmtHR(m.hashHps).unit}
            color="#00e676" size="1.7rem"/>
          <div style={{marginTop:12}}>
            <Bar value={m.frequency||0} max={600} color="#00e676"
              label="Frecuencia" right={`${m.frequency} MHz`}/>
          </div>
        </div>
        {/* Temp */}
        <div style={{background:"var(--surface2)",borderRadius:12,padding:16,
          border:"1px solid var(--border)"}}>
          <Label>🌡️ TEMPERATURA</Label>
          <TempGauge temp={m.temp}/>
          <div style={{display:"flex",justifyContent:"center",gap:16,
            fontSize:".71rem",color:"var(--dim)"}}>
            <span>VR: <b style={{color:"var(--text)"}}>{m.vrTemp}°C</b></span>
            <span>Límite: <b style={{color:"#ff4d6a"}}>75°C</b></span>
          </div>
        </div>
        {/* Potencia */}
        <div style={{background:"var(--surface2)",borderRadius:12,padding:16,
          border:"1px solid var(--border)",display:"flex",flexDirection:"column",gap:14}}>
          <Label>⚙️ POTENCIA · FAN</Label>
          <Bar value={m.power||0} max={30} color="#4fc3f7"
            label="Potencia" right={`${m.power?.toFixed(1)} W`}/>
          <Bar value={m.fanrpm||0} max={6000} color="#b39ddb"
            label="Ventilador" right={`${(m.fanrpm||0).toLocaleString()} rpm`}/>
          {eff&&<div style={{textAlign:"center",background:"var(--surface3)",
            borderRadius:8,padding:"7px",fontSize:".74rem",color:"var(--muted)"}}>
            Eficiencia: <b style={{color:"var(--text)"}}>{eff} J/TH</b>
          </div>}
        </div>
      </div>

      {/* Shares */}
      <div style={{background:"var(--surface2)",borderRadius:12,padding:16,
        marginBottom:14,border:"1px solid var(--border)"}}>
        <Label>📋 SHARES</Label>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(105px,1fr))",
          gap:10,marginBottom:14}}>
          {[
            {l:"Aceptadas",v:m.sharesAccepted?.toLocaleString(),c:"#00e676"},
            {l:"Rechazadas",v:(m.sharesRejected||0).toLocaleString(),
              c:m.sharesRejected>0?"#ff4d6a":"var(--muted)"},
            {l:"Mejor share", v:m.bestDiff,          c:"#ffd54f"},
            {l:"Mejor sesión",v:m.bestSessionDiff,   c:"#ffd54f"},
            {l:"Tasa",        v:`${rate}%`,
              c:rate>=99?"#00e676":rate>=95?"#ffb300":"#ff4d6a"},
            {l:"Pool",        v:m.stratumURL?.split(".")[0],c:"var(--muted)"},
          ].map((s,i)=>(
            <div key={i} style={{background:"var(--surface3)",borderRadius:9,
              padding:"11px 13px",border:"1px solid var(--border)"}}>
              <div style={{fontSize:".58rem",color:"var(--dim)",marginBottom:3}}>{s.l}</div>
              <div style={{fontWeight:700,color:s.c,fontVariantNumeric:"tabular-nums",
                fontSize:".9rem",overflow:"hidden",textOverflow:"ellipsis",
                whiteSpace:"nowrap"}}>{s.v}</div>
            </div>
          ))}
        </div>
        <Bar value={parseFloat(rate)||0} max={100} color="#00e676"
          label="Tasa aceptación" right={`${rate}%`}/>
      </div>

      {/* Electricidad */}
      {e&&(
        <div style={{background:"var(--surface2)",borderRadius:12,padding:16,
          border:"1px solid var(--border)"}}>
          <Label>💡 CONSUMO ELÉCTRICO · {m.power?.toFixed(1)} W</Label>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(105px,1fr))",
            gap:10}}>
            {[
              {l:"kWh / día",   v:e.kwhDay,         c:"var(--text)"},
              {l:"kWh / mes",  v:e.kwhMonth,        c:"var(--text)"},
              {l:"Costo / día", v:`$${e.costDay}`,  c:"#ffb300"},
              {l:"Costo / mes", v:`$${e.costMonth}`,c:"#ffb300"},
              {l:"Costo / año", v:`$${e.costYear}`, c:"#ff4d6a"},
              eff&&{l:"Eficiencia",v:`${eff} J/TH`, c:"#b39ddb"},
            ].filter(Boolean).map((s,i)=>(
              <div key={i} style={{background:"var(--surface3)",borderRadius:9,
                padding:"11px 13px",border:"1px solid var(--border)"}}>
                <div style={{fontSize:".58rem",color:"var(--dim)",marginBottom:3}}>{s.l}</div>
                <div style={{fontWeight:700,color:s.c,fontVariantNumeric:"tabular-nums",
                  fontSize:".9rem"}}>{s.v}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}

// ─── SECCIÓN: POOL ────────────────────────────────────────────
function SectionPool({data}){
  const {publicPool:pp,ckpool,netDiffFmt,address}=data;
  return(
    <div style={{display:"flex",flexDirection:"column",gap:16}}>
      {pp?.online?(
        <>
          <Card accent="blue">
            <div style={{display:"flex",justifyContent:"space-between",
              alignItems:"flex-start",flexWrap:"wrap",gap:16,marginBottom:20}}>
              <div>
                <Badge label="public-pool.io" color="blue" dot/>
                <div style={{marginTop:12}}>
                  <Num val={fmtHR(pp.hashHps10m).val} unit={fmtHR(pp.hashHps10m).unit}
                    color="#4fc3f7" size="2.2rem"/>
                  <div style={{fontSize:".7rem",color:"var(--dim)",marginTop:3}}>10 min</div>
                </div>
              </div>
              <div>
                <div style={{fontSize:".6rem",color:"var(--dim)",marginBottom:4}}>1 HORA</div>
                <Num val={fmtHR(pp.hashHps1h).val} unit={fmtHR(pp.hashHps1h).unit} size="1.3rem"/>
              </div>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(130px,1fr))",gap:10}}>
              {[
                {l:"Workers",       v:pp.workerCount},
                {l:"Shares totales",v:pp.shares?.toLocaleString("es-CO")},
                {l:"10 min",        v:pp.sharesLast10m},
                {l:"1 hora",        v:pp.sharesLastHour},
                {l:"Mejor share",   v:pp.bestEverFmt,c:"#ffd54f"},
                {l:"Candidatos",    v:pp.blockCandidates||0},
                {l:"Última share",  v:ago(pp.minsSinceShare),
                  c:pp.minsSinceShare>15?"#ff4d6a":"#00e676"},
                {l:"Dificultad red",v:netDiffFmt},
              ].map((s,i)=>(
                <div key={i} style={{background:"var(--surface2)",borderRadius:9,
                  padding:"10px 14px",border:"1px solid var(--border)"}}>
                  <div style={{fontSize:".58rem",color:"var(--dim)",marginBottom:3}}>{s.l}</div>
                  <div style={{fontWeight:600,color:s.c||"var(--text)",
                    fontVariantNumeric:"tabular-nums",fontSize:".85rem"}}>
                    {s.v??<span style={{color:"var(--dim)"}}>—</span>}</div>
                </div>
              ))}
            </div>
            {pp.minsSinceShare>15&&(
              <div style={{marginTop:14,padding:"10px 14px",
                background:"rgba(255,77,106,.08)",border:"1px solid rgba(255,77,106,.2)",
                borderRadius:9,fontSize:".78rem",color:"#ff4d6a",display:"flex",
                alignItems:"center",gap:8}}>
                ⚠ Sin share hace {Math.round(pp.minsSinceShare)} minutos — revisa tu minero
              </div>
            )}
          </Card>
          {pp.workers?.length>0&&(
            <Card>
              <Label>WORKERS</Label>
              <div style={{overflowX:"auto"}}>
                <table style={{width:"100%",borderCollapse:"collapse",fontSize:".82rem"}}>
                  <thead>
                    <tr style={{color:"var(--dim)",fontSize:".6rem",fontWeight:700,
                      letterSpacing:".08em",textTransform:"uppercase"}}>
                      {["Worker","Hashrate","Mejor share","Última share","Modo"].map((h,i)=>(
                        <th key={i} style={{padding:"8px 12px 10px",textAlign:"left",
                          borderBottom:"1px solid var(--border)",whiteSpace:"nowrap"}}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {pp.workers.map((w,i)=>(
                      <tr key={i} style={{borderBottom:"1px solid var(--border)"}}>
                        <td style={{padding:"11px 12px",fontWeight:600,
                          fontFamily:"'JetBrains Mono',monospace",fontSize:".78rem"}}>
                          <div style={{display:"flex",alignItems:"center",gap:6}}>
                            <LiveDot status="ok"/>{w.name}</div></td>
                        <td style={{padding:"11px 12px",color:"#00e676",fontWeight:700,
                          fontVariantNumeric:"tabular-nums"}}>{w.hashFmt}</td>
                        <td style={{padding:"11px 12px",color:"#ffd54f",
                          fontVariantNumeric:"tabular-nums"}}>{w.bestEverFmt}</td>
                        <td style={{padding:"11px 12px",
                          color:w.minsSinceShare>15?"#ff4d6a":"var(--muted)"}}>
                          {ago(w.minsSinceShare)}</td>
                        <td style={{padding:"11px 12px"}}>
                          <Badge label={w.payoutMode||"—"} color="dim"/></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
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
          marginBottom:14,flexWrap:"wrap",gap:10}}>
          <Badge label="solo.ckpool.org" color={ckpool?.online?"green":"dim"}
            dot={ckpool?.online}/>
          {!ckpool?.online&&<span style={{fontSize:".73rem",color:"var(--dim)"}}>
            Sin actividad en este pool</span>}
        </div>
        {ckpool?.online?(
          <>
            <Row label="Hashrate 5m"  value={ckpool.hashFmt5m}/>
            <Row label="Hashrate 1d"  value={ckpool.hashFmt1d}/>
            <Row label="Workers"      value={ckpool.workerCount}/>
            <Row label="Mejor share"  value={ckpool.bestEverFmt} color="#ffd54f"/>
            <Row label="Última share" value={ago(ckpool.minsSinceShare)} borderless/>
          </>
        ):(
          <div style={{fontSize:".8rem",color:"var(--dim)",fontStyle:"italic"}}>
            No hay registros para esta dirección en ckpool.</div>
        )}
      </Card>
      <Card>
        <div style={{display:"flex",alignItems:"center",
          justifyContent:"space-between",flexWrap:"wrap",gap:12}}>
          <div>
            <div style={{fontWeight:600,marginBottom:3}}>Ver en public-pool.io</div>
            <div style={{fontSize:".73rem",color:"var(--muted)"}}>Interfaz completa del pool</div>
          </div>
          <a href={`https://web.public-pool.io/#/app/${address}`}
            target="_blank" rel="noreferrer"
            style={{background:"rgba(79,195,247,.1)",color:"#4fc3f7",
              border:"1px solid rgba(79,195,247,.25)",padding:"9px 18px",
              borderRadius:9,fontSize:".84rem",fontWeight:600,textDecoration:"none"}}>
            Abrir ↗</a>
        </div>
      </Card>
    </div>
  );
}

// ─── SECCIÓN: PROBABILIDAD ────────────────────────────────────
function SectionOdds({data}){
  const {odds,netDiffFmt,publicPool:pp,netDiff,btcPrice}=data;
  if(!odds) return <Card><p style={{color:"var(--muted)",padding:12}}>Sin datos.</p></Card>;
  const {oneInDays,years,perDay}=odds;
  const hps=pp?.online?(pp.hashHps10m||pp.hashHps1h):0;

  const rows=[
    {l:"1 día",d:1},{l:"1 semana",d:7},{l:"1 mes",d:30},
    {l:"3 meses",d:90},{l:"6 meses",d:180},{l:"1 año",d:365},
    {l:"5 años",d:1825},{l:"10 años",d:3650},
  ].map(p=>({...p,prob:(1-Math.pow(1-perDay,p.d))*100}));

  const rewardBTC=3.125;
  const rewardUSD=btcPrice?rewardBTC*btcPrice:null;

  return(
    <div style={{display:"flex",flexDirection:"column",gap:16}}>
      <Card accent="gold">
        <div style={{display:"flex",justifyContent:"space-between",
          alignItems:"center",flexWrap:"wrap",gap:20,marginBottom:20}}>
          <div>
            <Label>PROBABILIDAD POR DÍA</Label>
            <Num val={`1 / ${oneInDays.toLocaleString("es-CO")}`}
              color="#ffd54f" size="2rem"/>
            <div style={{fontSize:".72rem",color:"var(--dim)",marginTop:6}}>
              Con {hps?fmtHR(hps).full:"el hashrate del pool"}</div>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            <div style={{background:"var(--surface2)",borderRadius:12,
              padding:"14px 20px",textAlign:"center",border:"1px solid var(--border)"}}>
              <div style={{fontSize:"1.9rem",fontWeight:900,
                fontVariantNumeric:"tabular-nums"}}>
                ~{Math.round(years).toLocaleString("es-CO")}</div>
              <div style={{fontSize:".68rem",color:"var(--dim)",marginTop:2}}>años promedio</div>
            </div>
            <div style={{background:"rgba(255,213,79,.08)",borderRadius:12,
              padding:"14px 20px",textAlign:"center",
              border:"1px solid rgba(255,213,79,.2)"}}>
              <div style={{fontSize:"1.5rem",fontWeight:800,color:"#ffd54f"}}>
                {rewardUSD?`$${Math.round(rewardUSD).toLocaleString("en-US")}`:"🍀"}</div>
              <div style={{fontSize:".68rem",color:"var(--dim)",marginTop:2}}>
                premio · 3.125 BTC</div>
            </div>
          </div>
        </div>
        <div style={{padding:"10px 14px",background:"rgba(255,213,79,.05)",
          border:"1px solid rgba(255,213,79,.1)",borderRadius:9,
          fontSize:".74rem",color:"var(--dim)",lineHeight:1.7}}>
          ⚡ Solo mining = apuesta estadística. Sin garantías de ingresos regulares.
        </div>
      </Card>

      <Card>
        <Label>PROBABILIDAD ACUMULADA</Label>
        <div style={{marginTop:8}}>
          {rows.map((r,i)=>{
            const c=r.prob>50?"#00e676":r.prob>10?"#ffb300":"#4fc3f7";
            return(
              <div key={i} style={{display:"grid",
                gridTemplateColumns:"100px 1fr 110px",
                gap:14,alignItems:"center",padding:"10px 0",
                borderBottom:i<rows.length-1?"1px solid var(--border)":"none"}}>
                <span style={{fontSize:".82rem",color:"var(--muted)"}}>{r.l}</span>
                <div style={{display:"flex",alignItems:"center",gap:10}}>
                  <div style={{flex:1,height:4,background:"var(--surface2)",borderRadius:99}}>
                    <div style={{height:"100%",borderRadius:99,
                      width:`${Math.min(r.prob*2,100)}%`,background:c,
                      minWidth:r.prob>0?2:0,boxShadow:`0 0 5px ${c}60`,
                      transition:"width .5s ease"}}/>
                  </div>
                  <span style={{fontSize:".78rem",color:c,fontWeight:700,minWidth:56,
                    textAlign:"right",fontVariantNumeric:"tabular-nums"}}>
                    {r.prob<0.01?r.prob.toExponential(2):r.prob.toFixed(2)}%</span>
                </div>
                <div style={{fontSize:".7rem",color:"var(--dim)",textAlign:"right",
                  fontVariantNumeric:"tabular-nums",fontFamily:"'JetBrains Mono',monospace"}}>
                  1:{(1/(r.prob/100)).toLocaleString("es-CO",{maximumFractionDigits:0})}
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <Card>
        <Label>CONTEXTO DE RED</Label>
        <Row label="Dificultad de red"        value={netDiffFmt} mono/>
        <Row label="Mejor share histórica"     value={pp?.bestEverFmt} color="#ffd54f"/>
        <Row label="% de dificultad alcanzado" value={netDiff&&pp?.bestEver
          ?((pp.bestEver/netDiff)*100).toExponential(3)+"%":"—"} mono/>
        <Row label="Premio por bloque"         value={rewardUSD
          ?`3.125 BTC ≈ $${Math.round(rewardUSD).toLocaleString("en-US")}`:"3.125 BTC 🍀"} borderless/>
      </Card>
    </div>
  );
}

// ─── CLOCK ────────────────────────────────────────────────────
function LiveClock(){
  const [t,setT]=useState("");
  useEffect(()=>{
    const tick=()=>setT(new Date().toLocaleTimeString("es-CO",
      {hour:"2-digit",minute:"2-digit",second:"2-digit"}));
    tick(); const id=setInterval(tick,1000); return()=>clearInterval(id);
  },[]);
  return <span style={{fontFamily:"'JetBrains Mono',monospace",
    fontSize:".78rem",color:"var(--muted)",letterSpacing:".04em"}}>{t}</span>;
}

// ─── DASHBOARD PRINCIPAL ──────────────────────────────────────
export default function Dashboard(){
  const router=useRouter();
  const [data,setData]=useState(null);
  const [err,setErr]=useState(null);
  const [loading,setLoading]=useState(true);
  const [lastUp,setLastUp]=useState(null);
  const [cd,setCd]=useState(REFRESH);
  const [tab,setTab]=useState("fleet");
  const [kwh,setKwh]=useState(DEFAULT_KWH);
  const [capex,setCapex]=useState(DEFAULT_CAPEX);
  const [sideOpen,setSideOpen]=useState(false);

  const fetchData=useCallback(async()=>{
    try{
      const res=await fetch("/api/status");
      if(res.status===401){router.replace("/");return;}
      if(!res.ok) throw new Error(`HTTP ${res.status}`);
      setData(await res.json()); setErr(null);
      setLastUp(new Date()); setCd(REFRESH);
    }catch(e){setErr(e.message);}
    finally{setLoading(false);}
  },[router]);

  useEffect(()=>{
    fetchData();
    const t=setInterval(fetchData,REFRESH*1000);
    return()=>clearInterval(t);
  },[fetchData]);

  useEffect(()=>{
    const t=setInterval(()=>setCd(c=>c<=1?REFRESH:c-1),1000);
    return()=>clearInterval(t);
  },[]);

  async function logout(){
    await fetch("/api/logout",{method:"POST"});
    router.push("/");
  }

  const ppOnline=data?.publicPool?.online;
  const shareLate=ppOnline&&data.publicPool.minsSinceShare>15;
  const miners=data?.miners??[];

  return(<>
    <Head>
      <title>⛏️ Minero Dashboard</title>
      <meta name="viewport" content="width=device-width, initial-scale=1"/>
      <meta name="robots" content="noindex,nofollow"/>
      <link rel="preconnect" href="https://fonts.googleapis.com"/>
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin=""/>
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;700&display=swap" rel="stylesheet"/>
    </Head>

    <div style={{display:"flex",minHeight:"100vh",background:"var(--bg)"}}>

      {/* Sidebar desktop */}
      <div style={{display:"none"}} className="sidebar-desktop">
        <Sidebar active={tab} onChange={setTab} data={data}/>
      </div>

      {/* Sidebar mobile overlay */}
      {sideOpen&&(
        <div style={{position:"fixed",inset:0,zIndex:100,display:"flex"}}>
          <div style={{position:"absolute",inset:0,background:"rgba(0,0,0,.6)"}}
            onClick={()=>setSideOpen(false)}/>
          <div style={{position:"relative",zIndex:1,width:240}}>
            <Sidebar active={tab} onChange={t=>{setTab(t);setSideOpen(false);}} data={data}/>
          </div>
        </div>
      )}

      {/* Main */}
      <div style={{flex:1,display:"flex",flexDirection:"column",minWidth:0}}>

        {/* Header */}
        <header style={{
          position:"sticky",top:0,zIndex:40,
          background:"rgba(5,7,10,.92)",backdropFilter:"blur(20px)",
          WebkitBackdropFilter:"blur(20px)",
          borderBottom:"1px solid var(--border)",
          padding:"0 20px",height:54,
          display:"flex",alignItems:"center",
          justifyContent:"space-between",gap:12}}>
          <div style={{display:"flex",alignItems:"center",gap:12}}>
            <button onClick={()=>setSideOpen(s=>!s)}
              className="menu-btn"
              style={{background:"none",border:"1px solid var(--border)",
                color:"var(--muted)",width:32,height:32,borderRadius:8,
                cursor:"pointer",fontSize:"1rem",fontFamily:"inherit",
                display:"flex",alignItems:"center",justifyContent:"center"}}>☰</button>
            <span style={{fontWeight:800,fontSize:".95rem",letterSpacing:"-.02em",
              background:"linear-gradient(90deg,#00e676,#4fc3f7)",
              WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>
              Minero</span>
            {data?.address&&(
              <span style={{fontSize:".68rem",color:"var(--muted)",
                fontFamily:"'JetBrains Mono',monospace",
                background:"var(--surface2)",padding:"3px 9px",
                borderRadius:99,border:"1px solid var(--border)"}}>
                {truncAddr(data.address)}</span>
            )}
            {ppOnline&&<Badge label={shareLate?"Sin share +15min":"Pool activo"}
              color={shareLate?"red":"green"} dot/>}
          </div>

          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <LiveClock/>
            {err&&<Badge label={`Error: ${err}`} color="red"/>}
            {lastUp&&!loading&&(
              <span style={{fontSize:".67rem",color:"var(--dim)",
                display:"flex",alignItems:"center",gap:5}}>
                <span style={{width:5,height:5,borderRadius:"50%",background:"#00e676",
                  animation:"pulse-glow 2s ease-in-out infinite",display:"inline-block"}}/>
                {cd}s
              </span>
            )}
            <button onClick={fetchData}
              style={{background:"none",border:"1px solid var(--border)",
                color:"var(--muted)",width:30,height:30,borderRadius:8,cursor:"pointer",
                fontSize:".9rem",display:"flex",alignItems:"center",justifyContent:"center",
                fontFamily:"inherit"}}>↻</button>
            <button onClick={logout}
              style={{background:"none",border:"1px solid var(--border)",
                color:"var(--muted)",padding:"5px 12px",borderRadius:8,
                cursor:"pointer",fontSize:".76rem",fontFamily:"inherit"}}>Salir</button>
          </div>
        </header>

        {/* Content */}
        <main style={{flex:1,padding:"24px 20px 60px",overflowY:"auto"}}>
          {loading?<Skeleton/>:data&&(<>
            {tab==="fleet"     &&<SectionFleet    data={data} kwh={kwh}/>}
            {tab==="analytics" &&<SectionAnalytics data={data}/>}
            {tab==="finance"   &&<SectionFinance   data={data} kwh={kwh} onKwh={setKwh}
                                   capex={capex} onCapex={setCapex}/>}
            {tab==="hardware"  &&<SectionHardware  miners={miners} kwh={kwh} onKwh={setKwh}/>}
            {tab==="pool"      &&<SectionPool      data={data}/>}
            {tab==="odds"      &&<SectionOdds      data={data}/>}
          </>)}
        </main>
      </div>
    </div>

    <style jsx global>{`
      @keyframes ping{0%{transform:scale(1);opacity:.6}70%{transform:scale(2.3);opacity:0}100%{transform:scale(2.3);opacity:0}}
      @keyframes pulse-glow{0%,100%{opacity:1}50%{opacity:.2}}
      @keyframes fade-up{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
      @keyframes shimmer{0%{background-position:-200% 0}100%{background-position:200% 0}}
      :root {
        --bg:#05070a; --surface:#0b0e14; --surface2:#111520; --surface3:#181d2a;
        --border:rgba(255,255,255,.07); --dim:#3d4a60; --muted:#7a8499; --text:#e8edf5;
        --green:#00e676; --r:14px;
      }
      *, *::before, *::after { box-sizing:border-box; margin:0; padding:0; }
      html { font-size:16px; }
      body {
        background:var(--bg); color:var(--text);
        font-family:'Inter',-apple-system,BlinkMacSystemFont,system-ui,sans-serif;
        -webkit-font-smoothing:antialiased;
      }
      input,button,select { font-family:inherit; }
      a { color:#4fc3f7; text-decoration:none; }
      ::-webkit-scrollbar { width:4px; height:4px; }
      ::-webkit-scrollbar-track { background:transparent; }
      ::-webkit-scrollbar-thumb { background:rgba(255,255,255,.1); border-radius:99px; }

      /* Sidebar visible en desktop */
      @media(min-width:768px){
        .sidebar-desktop { display:flex !important; }
        .menu-btn { display:none !important; }
      }
    `}</style>
  </>);
}

function Skeleton(){
  return(
    <div style={{display:"grid",gap:14,
      gridTemplateColumns:"repeat(auto-fill,minmax(220px,1fr))"}}>
      {[180,180,180,180,300,300,200,200].map((h,i)=>(
        <div key={i} style={{background:"var(--surface)",border:"1px solid var(--border)",
          borderRadius:14,height:h,
          backgroundImage:"linear-gradient(90deg,var(--surface) 0%,var(--surface2) 50%,var(--surface) 100%)",
          backgroundSize:"200% 100%",animation:"shimmer 1.5s ease-in-out infinite"}}/>
      ))}
    </div>
  );
}
