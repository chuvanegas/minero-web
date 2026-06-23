import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/router";
import Head from "next/head";

// ─── Config ───────────────────────────────────────────────────
const REFRESH       = 20;
const KWH_COP_DEF  = 750;   // COP/kWh (tarifa estrato Colombia)
const USD_COP_DEF  = 4150;  // tasa de cambio por defecto
const COP_KWH_TIPS = [
  { label:"Estrato 1–2",  v:550  },
  { label:"Estrato 3–4",  v:700  },
  { label:"Estrato 5–6",  v:850  },
  { label:"Comercial",    v:1100 },
];

// ─── Utils ────────────────────────────────────────────────────
function fmtH(hps) {
  if (!hps||hps<=0) return { v:"0", u:"H/s", full:"0 H/s" };
  const us=["H/s","KH/s","MH/s","GH/s","TH/s","PH/s"];
  let i=0,v=hps; while(v>=1000&&i<us.length-1){v/=1000;i++;}
  return { v:v.toFixed(2), u:us[i], full:`${v.toFixed(2)} ${us[i]}` };
}
function ago(mins) {
  if(!isFinite(mins)||mins==null) return "—";
  const m=Math.round(mins);
  if(m<1)  return "ahora";
  if(m<60) return `${m}m`;
  return `${Math.floor(m/60)}h ${m%60}m`;
}
function cop(n)   { return n==null?"—":"$"+Math.round(n).toLocaleString("es-CO")+" COP"; }
function usd(n,d=2){ return n==null?"—":"$"+n.toFixed(d)+" USD"; }
function truncAddr(a){ return a?a.slice(0,8)+"…"+a.slice(-6):""; }

function calcElec(watts, copKwh, usdCop) {
  const kd=(watts*24)/1000;
  const kM=kd*30; const kY=kd*365;
  const cD=kd*copKwh; const cM=kM*copKwh; const cY=kY*copKwh;
  return {
    kwhDay:kd.toFixed(3), kwhMonth:kM.toFixed(1), kwhYear:kY.toFixed(0),
    copDay:cD, copMonth:cM, copYear:cY,
    usdDay:cD/usdCop, usdMonth:cM/usdCop, usdYear:cY/usdCop,
  };
}

// ─── Paleta ───────────────────────────────────────────────────
const C = {
  bg:       "#030b17",
  surf:     "#071220",
  surf2:    "#0d1e35",
  surf3:    "#132540",
  border:   "rgba(255,255,255,.07)",
  border2:  "rgba(255,255,255,.12)",
  text:     "#e2ecf8",
  muted:    "#6b82a0",
  dim:      "#2d4060",
  green:    "#10f287",
  blue:     "#38bdf8",
  gold:     "#fbbf24",
  red:      "#f87171",
  purple:   "#a78bfa",
  coral:    "#fb923c",
};

// ─── Componentes UI ───────────────────────────────────────────
function Dot({s}) {
  const col={ok:C.green,warn:C.gold,crit:C.red,off:C.dim}[s]||C.dim;
  return (
    <span style={{position:"relative",display:"inline-flex",
      alignItems:"center",justifyContent:"center",width:12,height:12,flexShrink:0}}>
      {s!=="off"&&<span style={{position:"absolute",inset:0,borderRadius:"50%",
        background:col,opacity:.3,animation:"ping 2s ease-in-out infinite"}}/>}
      <span style={{width:8,height:8,borderRadius:"50%",background:col,
        boxShadow:s!=="off"?`0 0 8px ${col}`:undefined,position:"relative"}}/>
    </span>
  );
}

function Tag({label,color="dim",dot,onClick}) {
  const m={
    green:  {bg:"rgba(16,242,135,.1)", fg:C.green,  bd:"rgba(16,242,135,.2)"},
    blue:   {bg:"rgba(56,189,248,.1)", fg:C.blue,   bd:"rgba(56,189,248,.2)"},
    gold:   {bg:"rgba(251,191,36,.1)", fg:C.gold,   bd:"rgba(251,191,36,.2)"},
    red:    {bg:"rgba(248,113,113,.1)",fg:C.red,    bd:"rgba(248,113,113,.2)"},
    purple: {bg:"rgba(167,139,250,.1)",fg:C.purple, bd:"rgba(167,139,250,.2)"},
    coral:  {bg:"rgba(251,146,60,.1)", fg:C.coral,  bd:"rgba(251,146,60,.2)"},
    dim:    {bg:"rgba(255,255,255,.04)",fg:C.muted, bd:"rgba(255,255,255,.08)"},
  };
  const s=m[color]||m.dim;
  return (
    <span onClick={onClick} style={{display:"inline-flex",alignItems:"center",gap:5,
      fontSize:".63rem",fontWeight:700,letterSpacing:".07em",textTransform:"uppercase",
      padding:"3px 10px",borderRadius:99,background:s.bg,color:s.fg,
      border:`1px solid ${s.bd}`,whiteSpace:"nowrap",cursor:onClick?"pointer":undefined}}>
      {dot&&<Dot s={color==="green"?"ok":color==="red"?"crit":"warn"}/>}{label}
    </span>
  );
}

function Card({children,style}) {
  return (
    <div style={{background:C.surf,border:`1px solid ${C.border}`,
      borderRadius:18,padding:"20px 22px",position:"relative",
      overflow:"hidden",...style}}>
      {children}
    </div>
  );
}

function GlowCard({children,color,style}) {
  return (
    <div style={{background:C.surf,border:`1px solid ${color}25`,borderRadius:18,
      padding:"20px 22px",position:"relative",overflow:"hidden",
      boxShadow:`0 4px 24px ${color}12`,...style}}>
      <div style={{position:"absolute",top:0,left:0,right:0,height:2,
        background:`linear-gradient(90deg,transparent,${color}90,transparent)`}}/>
      {children}
    </div>
  );
}

function Label({children,color}) {
  return <div style={{fontSize:".58rem",fontWeight:700,letterSpacing:".13em",
    textTransform:"uppercase",color:color||C.muted,marginBottom:6}}>{children}</div>;
}

function BigNum({val,unit,color,size="2.4rem",mono}) {
  return (
    <div style={{display:"flex",alignItems:"baseline",gap:6,flexWrap:"wrap"}}>
      <span style={{fontSize:size,fontWeight:900,color:color||C.text,
        letterSpacing:"-.04em",fontVariantNumeric:"tabular-nums",lineHeight:1,
        fontFamily:mono?"'JetBrains Mono',monospace":undefined}}>{val}</span>
      {unit&&<span style={{fontSize:".9rem",fontWeight:600,color:C.muted}}>{unit}</span>}
    </div>
  );
}

function MiniStat({label,value,color,mono}) {
  return (
    <div style={{background:C.surf2,borderRadius:11,padding:"11px 14px",
      border:`1px solid ${C.border}`}}>
      <div style={{fontSize:".58rem",color:C.muted,fontWeight:600,
        letterSpacing:".1em",textTransform:"uppercase",marginBottom:5}}>{label}</div>
      <div style={{fontWeight:700,color:color||C.text,fontVariantNumeric:"tabular-nums",
        fontSize:".92rem",fontFamily:mono?"'JetBrains Mono',monospace":undefined,
        overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
        {value??<span style={{color:C.dim}}>—</span>}</div>
    </div>
  );
}

function Row({label,value,color,mono,last}) {
  return (
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",
      padding:"9px 0",borderBottom:last?"none":`1px solid ${C.border}`}}>
      <span style={{fontSize:".77rem",color:C.muted}}>{label}</span>
      <span style={{fontSize:".83rem",fontWeight:600,fontVariantNumeric:"tabular-nums",
        color:color||C.text,fontFamily:mono?"'JetBrains Mono',monospace":undefined}}>
        {value??<span style={{color:C.dim}}>—</span>}</span>
    </div>
  );
}

function ProgressBar({val,max,color,h=5,label,right}) {
  const pct=Math.min(((val||0)/max)*100,100);
  return (
    <div>
      {(label||right)&&(
        <div style={{display:"flex",justifyContent:"space-between",
          fontSize:".7rem",color:C.muted,marginBottom:5}}>
          {label&&<span>{label}</span>}
          {right&&<span style={{color:C.text,fontWeight:600}}>{right}</span>}
        </div>
      )}
      <div style={{height:h,background:C.surf3,borderRadius:99,overflow:"hidden",
        border:`1px solid ${C.border}`}}>
        <div style={{height:"100%",width:`${pct}%`,minWidth:pct>0?2:0,
          background:color||C.green,borderRadius:99,transition:"width .7s ease",
          boxShadow:`0 0 8px ${color||C.green}60`}}/>
      </div>
    </div>
  );
}

// ─── Gráfica SVG dinámica ─────────────────────────────────────
function SparkLine({data,color,h=80}) {
  if(!data?.length||data.length<2) return (
    <div style={{height:h,display:"flex",alignItems:"center",
      justifyContent:"center",flexDirection:"column",gap:4}}>
      <div style={{fontSize:"1.5rem",opacity:.15}}>📈</div>
      <div style={{fontSize:".7rem",color:C.muted}}>
        Acumulando datos… (1 punto / 5 min)</div>
    </div>
  );
  const W=600,H=h;
  const vs=data.map(d=>d.h);
  const mn=Math.min(...vs)*.95, mx=Math.max(...vs)*1.05||1;
  const rng=mx-mn||1;
  const pts=data.map((d,i)=>[
    Math.round((i/(data.length-1))*W),
    Math.round(H-((d.h-mn)/rng)*(H-8)+4)
  ]);
  const line=pts.map((p,i)=>(i===0?"M":"L")+p.join(",")).join(" ");
  const area=`${line} L${W},${H} L0,${H} Z`;
  const last=pts[pts.length-1];
  const id=`g${color.replace(/[^a-z0-9]/gi,"").slice(0,8)}`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={h}
      style={{overflow:"visible",display:"block"}}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor={color} stopOpacity={.22}/>
          <stop offset="100%" stopColor={color} stopOpacity={.01}/>
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${id})`}/>
      <path d={line} fill="none" stroke={color} strokeWidth={2.5}
        strokeLinecap="round" strokeLinejoin="round"
        style={{filter:`drop-shadow(0 0 4px ${color})`}}/>
      {last&&(
        <>
          <circle cx={last[0]} cy={last[1]} r={5} fill={color}
            style={{filter:`drop-shadow(0 0 6px ${color})`}}/>
          <rect x={last[0]-30} y={last[1]-24} width={70} height={18}
            rx={5} fill={color} fillOpacity={.15}/>
          <text x={last[0]-25} y={last[1]-10} fill={color}
            fontSize={11} fontWeight={700} fontFamily="'JetBrains Mono',monospace">
            {fmtH(data[data.length-1]?.h).full}
          </text>
        </>
      )}
    </svg>
  );
}

// ─── Gauge temperatura ────────────────────────────────────────
function TempGauge({temp,max=90}) {
  if(temp==null) return null;
  const c=temp>=75?C.red:temp>=65?C.gold:C.green;
  const label=temp>=75?"CRÍTICO":temp>=65?"PRECAUCIÓN":"NORMAL";
  const R=42,cx=55,cy=55;
  const startA=Math.PI*.75, span=Math.PI*1.5;
  const xy=a=>[cx+R*Math.cos(a),cy+R*Math.sin(a)];
  const [sx,sy]=xy(startA);
  const [ex,ey]=xy(startA+span);
  const endA=startA+span*Math.min(temp/max,1);
  const [ax,ay]=xy(endA);
  const large=span*Math.min(temp/max,1)>Math.PI?1:0;
  return (
    <svg width={110} height={90} viewBox="0 0 110 90">
      <path d={`M${sx},${sy} A${R},${R} 0 1,1 ${ex},${ey}`}
        fill="none" stroke={C.surf3} strokeWidth={9} strokeLinecap="round"/>
      {temp>0&&<path d={`M${sx},${sy} A${R},${R} 0 ${large},1 ${ax},${ay}`}
        fill="none" stroke={c} strokeWidth={9} strokeLinecap="round"
        style={{filter:`drop-shadow(0 0 6px ${c})`}}/>}
      <text x={55} y={60} textAnchor="middle" fontSize={22} fontWeight={900}
        fill={c} fontFamily="'JetBrains Mono',monospace">{temp}°</text>
      <text x={55} y={75} textAnchor="middle" fontSize={7} fontWeight={700}
        fill={c} letterSpacing={2}>{label}</text>
    </svg>
  );
}

function FanGauge({rpm,max=6000}) {
  const pct=Math.min((rpm||0)/max,1);
  const c=pct>.85?C.red:pct>.6?C.gold:C.blue;
  const R=28,cx=33,cy=33;
  const startA=Math.PI*.75,span=Math.PI*1.5;
  const xy=a=>[cx+R*Math.cos(a),cy+R*Math.sin(a)];
  const [sx,sy]=xy(startA);
  const [ex,ey]=xy(startA+span);
  const endA=startA+span*pct;
  const [ax,ay]=xy(endA);
  return (
    <svg width={66} height={55} viewBox="0 0 66 55">
      <path d={`M${sx},${sy} A${R},${R} 0 1,1 ${ex},${ey}`}
        fill="none" stroke={C.surf3} strokeWidth={7} strokeLinecap="round"/>
      {rpm>0&&<path d={`M${sx},${sy} A${R},${R} 0 ${span*pct>Math.PI?1:0},1 ${ax},${ay}`}
        fill="none" stroke={c} strokeWidth={7} strokeLinecap="round"
        style={{filter:`drop-shadow(0 0 5px ${c})`}}/>}
      <text x={33} y={38} textAnchor="middle" fontSize={9.5} fontWeight={800}
        fill={c} fontFamily="'JetBrains Mono',monospace">
        {rpm?(rpm/1000).toFixed(1)+"K":"—"}</text>
    </svg>
  );
}

// ─── Sidebar ──────────────────────────────────────────────────
const NAV=[
  {id:"inicio",    emoji:"⚡", label:"Inicio"},
  {id:"analisis",  emoji:"📈", label:"Análisis"},
  {id:"finanzas",  emoji:"💰", label:"Finanzas"},
  {id:"hardware",  emoji:"⚙️",  label:"Hardware"},
  {id:"pool",      emoji:"🌐", label:"Pool"},
  {id:"mineria",   emoji:"🎲", label:"Probabilidad"},
];

function Sidebar({active,onChange,data,copKwh}) {
  const fleet=data?.fleet;
  const hr=fleet?.totalHps?fmtH(fleet.totalHps):null;
  const e=fleet?.totalPower>0?calcElec(fleet.totalPower,copKwh,USD_COP_DEF):null;
  return (
    <aside style={{width:230,flexShrink:0,background:C.surf,
      borderRight:`1px solid ${C.border}`,display:"flex",
      flexDirection:"column",position:"sticky",top:0,height:"100vh",overflowY:"auto"}}>
      <div style={{padding:"20px 18px 14px",borderBottom:`1px solid ${C.border}`}}>
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:14}}>
          <span style={{fontSize:"1.4rem"}}>⛏️</span>
          <div>
            <div style={{fontWeight:900,fontSize:"1.15rem",letterSpacing:"-.04em",
              background:`linear-gradient(90deg,${C.green},${C.blue})`,
              WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>Minero</div>
            <div style={{fontSize:".6rem",color:C.muted,letterSpacing:".1em",
              textTransform:"uppercase",marginTop:1}}>Dashboard Pro</div>
          </div>
        </div>
        {fleet&&(
          <div style={{background:C.surf2,borderRadius:12,padding:"12px 14px",
            border:`1px solid ${C.green}20`}}>
            <div style={{display:"flex",justifyContent:"space-between",
              alignItems:"flex-start",marginBottom:8}}>
              <div>
                <div style={{fontSize:".55rem",color:C.muted,fontWeight:700,
                  letterSpacing:".1em",textTransform:"uppercase",marginBottom:3}}>
                  Total Flota</div>
                <div style={{fontSize:"1.25rem",fontWeight:900,color:C.green,
                  fontVariantNumeric:"tabular-nums",letterSpacing:"-.04em",lineHeight:1}}>
                  {hr?.full||"—"}</div>
              </div>
              <Tag label={`${fleet.onlineCount}/${fleet.totalCount} activos`}
                color={fleet.onlineCount===fleet.totalCount?"green":"gold"}/>
            </div>
            {fleet.totalPower>0&&(
              <div style={{fontSize:".71rem",color:C.muted,display:"flex",
                flexDirection:"column",gap:2}}>
                <span>⚡ {fleet.totalPower.toFixed(1)} W totales</span>
                {e&&<span style={{color:C.coral}}>
                  {cop(e.copMonth)}/mes electricidad</span>}
              </div>
            )}
          </div>
        )}
      </div>
      <nav style={{padding:"10px 10px",flex:1}}>
        {NAV.map(n=>(
          <button key={n.id} onClick={()=>onChange(n.id)}
            style={{display:"flex",alignItems:"center",gap:10,width:"100%",
              background:active===n.id?`${C.green}12`:"transparent",
              border:active===n.id?`1px solid ${C.green}22`:"1px solid transparent",
              color:active===n.id?C.green:C.muted,
              borderRadius:11,padding:"11px 13px",cursor:"pointer",
              fontSize:".86rem",fontWeight:active===n.id?700:400,
              transition:"all .15s",textAlign:"left",marginBottom:2,fontFamily:"inherit"}}>
            <span style={{fontSize:".9rem",flexShrink:0}}>{n.emoji}</span>
            {n.label}
            {active===n.id&&<span style={{marginLeft:"auto",width:4,height:4,
              borderRadius:"50%",background:C.green,boxShadow:`0 0 6px ${C.green}`}}/>}
          </button>
        ))}
      </nav>
      <div style={{padding:"12px 18px",borderTop:`1px solid ${C.border}`,
        fontSize:".65rem",color:C.dim,lineHeight:2}}>
        <div>🔄 Actualiza cada {REFRESH}s</div>
        <div>📡 Redis · public-pool.io</div>
        <div style={{color:C.muted}}>🇨🇴 Colombia</div>
      </div>
    </aside>
  );
}

// ════════════════════════════════════════════════════════════════
// SECCIONES
// ════════════════════════════════════════════════════════════════

function SecInicio({data,copKwh,usdCop}) {
  const {miners=[],publicPool:pp,btcPrice,hrHistory=[],fleet,netDiffFmt}=data;
  const hr=pp?.online?fmtH(pp.hashHps10m):fmtH(fleet?.totalHps||0);
  const e=fleet?.totalPower>0?calcElec(fleet.totalPower,copKwh,usdCop):null;

  return (
    <div style={{display:"flex",flexDirection:"column",gap:20}}>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))",gap:14}}>
        <GlowCard color={C.green}>
          <Label>Hashrate Total</Label>
          <BigNum val={hr.v} unit={hr.u} color={C.green}/>
          <div style={{fontSize:".7rem",color:C.muted,marginTop:6}}>
            {pp?.online?"10 minutos · pool activo":"Sin datos de pool"}
          </div>
        </GlowCard>
        <GlowCard color={C.blue}>
          <Label>Potencia Total</Label>
          <BigNum val={fleet?.totalPower?.toFixed(1)||"—"} unit="W" color={C.blue}/>
          {e&&<div style={{fontSize:".7rem",color:C.coral,marginTop:6,fontWeight:600}}>
            {cop(e.copMonth)}/mes electricidad
          </div>}
        </GlowCard>
        <GlowCard color={C.gold}>
          <Label>Precio Bitcoin</Label>
          <BigNum val={btcPrice?`$${btcPrice.toLocaleString("en-US")}`:"-"} unit="USD" color={C.gold}/>
          {btcPrice&&usdCop&&<div style={{fontSize:".7rem",color:C.muted,marginTop:6}}>
            ≈ ${Math.round(btcPrice*usdCop).toLocaleString("es-CO")} COP
          </div>}
        </GlowCard>
        <GlowCard color={C.purple}>
          <Label>Dificultad Red</Label>
          <BigNum val={netDiffFmt||"—"} color={C.purple}/>
          <div style={{fontSize:".7rem",color:C.muted,marginTop:6}}>Bitcoin mainnet</div>
        </GlowCard>
      </div>

      <GlowCard color={C.green}>
        <div style={{display:"flex",justifyContent:"space-between",
          alignItems:"center",marginBottom:16,flexWrap:"wrap",gap:10}}>
          <div>
            <Label>Hashrate · Últimas 24 horas</Label>
            <div style={{display:"flex",alignItems:"center",gap:14,flexWrap:"wrap"}}>
              <BigNum val={hr.v} unit={hr.u} color={C.green} size="1.9rem"/>
              {pp?.online&&(
                <div style={{textAlign:"left"}}>
                  <div style={{fontSize:".58rem",color:C.muted,fontWeight:700,
                    letterSpacing:".1em",textTransform:"uppercase"}}>1 hora</div>
                  <div style={{fontWeight:700,color:C.text,fontSize:".9rem"}}>
                    {fmtH(pp.hashHps1h).full}</div>
                </div>
              )}
            </div>
          </div>
          {hrHistory.length>1&&(()=>{
            const vs=hrHistory.map(d=>d.h);
            const avg=vs.reduce((a,b)=>a+b,0)/vs.length;
            return (
              <div style={{display:"flex",gap:14}}>
                {[
                  {l:"Promedio",v:fmtH(avg).full,c:C.text},
                  {l:"Máximo",  v:fmtH(Math.max(...vs)).full,c:C.green},
                  {l:"Mínimo",  v:fmtH(Math.min(...vs)).full,c:C.red},
                ].map((s,i)=>(
                  <div key={i} style={{textAlign:"right"}}>
                    <div style={{fontSize:".58rem",color:C.muted,fontWeight:700,
                      letterSpacing:".1em",textTransform:"uppercase"}}>{s.l}</div>
                    <div style={{fontWeight:700,color:s.c,fontSize:".85rem",
                      fontVariantNumeric:"tabular-nums"}}>{s.v}</div>
                  </div>
                ))}
              </div>
            );
          })()}
        </div>
        <SparkLine data={hrHistory} color={C.green} h={100}/>
      </GlowCard>

      {/* Tabla flota */}
      <Card>
        <div style={{display:"flex",justifyContent:"space-between",
          alignItems:"center",marginBottom:14,flexWrap:"wrap",gap:8}}>
          <Label>Equipos · Flota Completa</Label>
          <Tag label={`${fleet?.onlineCount||0} en línea`}
            color={fleet?.onlineCount>0?"green":"red"} dot/>
        </div>
        <div style={{overflowX:"auto"}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:".82rem"}}>
            <thead>
              <tr style={{color:C.muted,fontSize:".6rem",fontWeight:700,
                letterSpacing:".1em",textTransform:"uppercase"}}>
                {["","Equipo","Modelo","Hashrate","Temperatura","VR Temp","Potencia","Ventilador","Frecuencia","Shares","Uptime"].map((h,i)=>(
                  <th key={i} style={{padding:"8px 12px 12px",textAlign:"left",
                    borderBottom:`1px solid ${C.border}`,whiteSpace:"nowrap"}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {miners.map((m,i)=>{
                const st=!m.online?"off":m.temp>=75?"crit":m.temp>=65?"warn":"ok";
                const tc={ok:C.green,warn:C.gold,crit:C.red,off:C.dim}[st];
                const tot=(m.sharesAccepted||0)+(m.sharesRejected||0);
                const acc=tot>0?((m.sharesAccepted/tot)*100).toFixed(1):null;
                return (
                  <tr key={i} style={{borderBottom:`1px solid ${C.border}`,transition:"background .15s"}}
                    onMouseEnter={e=>e.currentTarget.style.background=C.surf2}
                    onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                    <td style={{padding:"13px 12px"}}><Dot s={st}/></td>
                    <td style={{padding:"13px 12px",fontWeight:700}}>{m.name}</td>
                    <td style={{padding:"13px 12px",color:C.muted,
                      fontFamily:"'JetBrains Mono',monospace",fontSize:".75rem"}}>
                      {m.online?m.model:"—"}</td>
                    <td style={{padding:"13px 12px",color:C.green,fontWeight:700,
                      fontVariantNumeric:"tabular-nums"}}>
                      {m.online?fmtH(m.hashHps).full:"—"}</td>
                    <td style={{padding:"13px 12px",color:tc,fontWeight:700,
                      fontVariantNumeric:"tabular-nums"}}>
                      {m.online?`${m.temp}°C`:"—"}</td>
                    <td style={{padding:"13px 12px",color:C.muted,
                      fontVariantNumeric:"tabular-nums"}}>
                      {m.online?`${m.vrTemp}°C`:"—"}</td>
                    <td style={{padding:"13px 12px",fontVariantNumeric:"tabular-nums"}}>
                      {m.online?`${m.power?.toFixed(1)}W`:"—"}</td>
                    <td style={{padding:"13px 12px",color:C.muted,
                      fontVariantNumeric:"tabular-nums"}}>
                      {m.online?`${(m.fanrpm||0).toLocaleString()} rpm`:"—"}</td>
                    <td style={{padding:"13px 12px",color:C.muted,
                      fontVariantNumeric:"tabular-nums"}}>
                      {m.online?`${m.frequency} MHz`:"—"}</td>
                    <td style={{padding:"13px 12px",fontVariantNumeric:"tabular-nums"}}>
                      {m.online?(
                        <span>
                          <span style={{color:C.green}}>{m.sharesAccepted?.toLocaleString()}</span>
                          {acc&&<span style={{color:C.muted,fontSize:".75rem"}}> ({acc}%)</span>}
                          {m.sharesRejected>0&&<span style={{color:C.red}}> -{m.sharesRejected}</span>}
                        </span>
                      ):"—"}</td>
                    <td style={{padding:"13px 12px",color:C.muted}}>{m.online?m.uptimeFmt:"—"}</td>
                  </tr>
                );
              })}
              {miners.length===0&&(
                <tr><td colSpan={11} style={{padding:"24px 12px",color:C.muted,
                  textAlign:"center",fontSize:".82rem"}}>Sin equipos configurados</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {pp?.online&&(
        <GlowCard color={C.blue}>
          <div style={{display:"flex",justifyContent:"space-between",
            alignItems:"center",flexWrap:"wrap",gap:12,marginBottom:14}}>
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              <Dot s="ok"/>
              <Tag label="public-pool.io" color="blue"/>
            </div>
            {pp.minsSinceShare>15&&(
              <Tag label={`Sin share ${Math.round(pp.minsSinceShare)}m`} color="red"/>
            )}
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(120px,1fr))",gap:10}}>
            {[
              {l:"Shares totales",v:pp.shares?.toLocaleString("es-CO")},
              {l:"Workers",       v:pp.workerCount},
              {l:"Shares 10 min", v:pp.sharesLast10m},
              {l:"Shares 1 hora", v:pp.sharesLastHour},
              {l:"Mejor share",   v:pp.bestEverFmt,c:C.gold},
              {l:"Última share",  v:ago(pp.minsSinceShare),
                c:pp.minsSinceShare>15?C.red:C.green},
            ].map((s,i)=><MiniStat key={i} label={s.l} value={s.v} color={s.c}/>)}
          </div>
        </GlowCard>
      )}
    </div>
  );
}

function SecAnalisis({data}) {
  const {miners=[],hrHistory=[]}=data;
  const onlineMiners=miners.filter(m=>m.online);
  return (
    <div style={{display:"flex",flexDirection:"column",gap:20}}>
      <GlowCard color={C.green}>
        <Label>Hashrate Histórico · 24 horas ({hrHistory.length} puntos)</Label>
        <SparkLine data={hrHistory} color={C.green} h={140}/>
        {hrHistory.length>1&&(()=>{
          const vs=hrHistory.map(d=>d.h);
          const avg=vs.reduce((a,b)=>a+b,0)/vs.length;
          const max=Math.max(...vs),min=Math.min(...vs);
          const stab=((1-(max-min)/avg)*100).toFixed(1);
          return (
            <div style={{display:"grid",
              gridTemplateColumns:"repeat(auto-fill,minmax(140px,1fr))",
              gap:10,marginTop:16}}>
              {[
                {l:"Promedio 24h",v:fmtH(avg).full,c:C.text},
                {l:"Máximo",     v:fmtH(max).full, c:C.green},
                {l:"Mínimo",     v:fmtH(min).full, c:C.red},
                {l:"Estabilidad",v:`${stab}%`,c:parseFloat(stab)>80?C.green:C.gold},
                {l:"Horas datos",v:`${(hrHistory.length*5/60).toFixed(1)}h`,c:C.muted},
              ].map((s,i)=><MiniStat key={i} label={s.l} value={s.v} color={s.c}/>)}
            </div>
          );
        })()}
      </GlowCard>

      {onlineMiners.length>0?(
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(320px,1fr))",gap:16}}>
          {onlineMiners.map((m,i)=>{
            const st=m.temp>=75?"crit":m.temp>=65?"warn":"ok";
            const tc={ok:C.green,warn:C.gold,crit:C.red}[st];
            const tot=(m.sharesAccepted||0)+(m.sharesRejected||0);
            const acc=tot>0?((m.sharesAccepted/tot)*100).toFixed(2):0;
            const eff=m.power&&m.hashHps>0?(m.power/(m.hashHps/1e12)).toFixed(2):null;
            return (
              <GlowCard key={i} color={tc}>
                <div style={{display:"flex",justifyContent:"space-between",
                  alignItems:"center",marginBottom:16}}>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    <Dot s={st}/>
                    <div>
                      <div style={{fontWeight:800,fontSize:"1.05rem"}}>{m.name}</div>
                      <div style={{fontSize:".68rem",color:C.muted,
                        fontFamily:"'JetBrains Mono',monospace"}}>{m.model}</div>
                    </div>
                  </div>
                  <Tag label={st==="ok"?"Activo":st==="crit"?"Crítico":"Temp alta"}
                    color={st==="ok"?"green":st==="crit"?"red":"gold"} dot/>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:14}}>
                  {[
                    {l:"Hashrate",   v:fmtH(m.hashHps).full,      c:C.green},
                    {l:"Potencia",   v:`${m.power?.toFixed(1)} W`, c:C.blue},
                    {l:"Eficiencia", v:eff?`${eff} J/TH`:"—",     c:C.purple},
                    {l:"Frecuencia", v:`${m.frequency} MHz`,       c:C.muted},
                    {l:"Shares OK",  v:m.sharesAccepted?.toLocaleString(),c:C.green},
                    {l:"Rechazadas", v:(m.sharesRejected||0).toString(),
                      c:m.sharesRejected>0?C.red:C.muted},
                  ].map((s,j)=><MiniStat key={j} label={s.l} value={s.v} color={s.c}/>)}
                </div>
                <div style={{display:"flex",flexDirection:"column",gap:10}}>
                  <ProgressBar val={m.temp} max={85} color={tc}
                    label="🌡️ Temperatura" right={`${m.temp}°C / 85°C`}/>
                  <ProgressBar val={m.fanrpm||0} max={6000} color={C.blue}
                    label="🌀 Ventilador" right={`${(m.fanrpm||0).toLocaleString()} rpm`}/>
                  <ProgressBar val={parseFloat(acc)} max={100} color={C.green}
                    label="✅ Tasa aceptación" right={`${acc}%`}/>
                  <ProgressBar val={m.power||0} max={30} color={C.coral}
                    label="⚡ Potencia" right={`${m.power?.toFixed(1)} W`}/>
                </div>
              </GlowCard>
            );
          })}
        </div>
      ):(
        <Card>
          <div style={{textAlign:"center",padding:"32px 16px"}}>
            <div style={{fontSize:"2.5rem",marginBottom:10,opacity:.2}}>📡</div>
            <div style={{fontWeight:700,color:C.muted,marginBottom:8}}>
              El relay en tu Mac necesita estar corriendo para ver datos de hardware</div>
            <code style={{fontSize:".75rem",color:C.blue,background:C.surf2,
              padding:"8px 16px",borderRadius:9,fontFamily:"'JetBrains Mono',monospace",
              display:"inline-block"}}>
              nohup python3 relay/push.py &amp;
            </code>
          </div>
        </Card>
      )}
    </div>
  );
}

function SecFinanzas({data,copKwh,onCopKwh,usdCop,onUsdCop,capex,onCapex,manualW,onManualW}) {
  const {btcPrice,financials,fleet,odds}=data;
  const hwW=fleet?.totalPower||0;
  // Si el hardware está offline, usar potencia manual ingresada por el usuario
  const totalW=hwW>0?hwW:manualW;
  const e=totalW>0?calcElec(totalW,copKwh,usdCop):null;
  const fin=financials;
  const revDayCOP   = fin&&usdCop?fin.revenuePerDayUSD*usdCop:null;
  const revMonCOP   = fin&&usdCop?fin.revenuePerMonthUSD*usdCop:null;
  const revYearCOP  = fin&&usdCop?fin.revenuePerYearUSD*usdCop:null;
  const profDayCOP  = (revDayCOP!=null&&e)  ?revDayCOP  -e.copDay  :null;
  const profMonCOP  = (revMonCOP!=null&&e)  ?revMonCOP  -e.copMonth:null;
  const profYearCOP = (revYearCOP!=null&&e) ?revYearCOP -e.copYear :null;
  const roi_mes     = (capex>0&&profMonCOP&&profMonCOP>0)
    ?(capex*usdCop/profMonCOP).toFixed(1):null;

  return (
    <div style={{display:"flex",flexDirection:"column",gap:20}}>
      <Card>
        <Label>⚙️ Parámetros · Colombia 🇨🇴</Label>
        <div style={{display:"grid",
          gridTemplateColumns:"repeat(auto-fill,minmax(210px,1fr))",gap:14,marginTop:10}}>
          <div>
            <div style={{fontSize:".72rem",color:C.muted,marginBottom:6,fontWeight:600}}>
              Tarifa energía (COP/kWh)</div>
            <input type="number" min="100" max="2000" step="10" value={copKwh}
              onChange={e=>onCopKwh(parseFloat(e.target.value)||KWH_COP_DEF)}
              style={{width:"100%",background:C.surf2,border:`1px solid ${C.border2}`,
                color:C.text,padding:"10px 14px",borderRadius:10,
                fontSize:"1rem",fontWeight:700,outline:"none",
                fontFamily:"'JetBrains Mono',monospace"}}/>
            <div style={{display:"flex",gap:5,flexWrap:"wrap",marginTop:7}}>
              {COP_KWH_TIPS.map((t,i)=>(
                <button key={i} onClick={()=>onCopKwh(t.v)}
                  style={{fontSize:".62rem",
                    background:copKwh===t.v?`${C.green}20`:C.surf2,
                    border:`1px solid ${copKwh===t.v?C.green:C.border}`,
                    color:copKwh===t.v?C.green:C.muted,
                    padding:"4px 8px",borderRadius:99,cursor:"pointer",
                    fontFamily:"inherit",fontWeight:600}}>
                  {t.label} ${t.v}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div style={{fontSize:".72rem",color:C.muted,marginBottom:6,fontWeight:600}}>
              TRM (COP por 1 USD)</div>
            <input type="number" min="3000" max="6000" step="10" value={usdCop}
              onChange={e=>onUsdCop(parseFloat(e.target.value)||USD_COP_DEF)}
              style={{width:"100%",background:C.surf2,border:`1px solid ${C.border2}`,
                color:C.text,padding:"10px 14px",borderRadius:10,
                fontSize:"1rem",fontWeight:700,outline:"none",
                fontFamily:"'JetBrains Mono',monospace"}}/>
            <div style={{fontSize:".65rem",color:C.dim,marginTop:5}}>
              TRM aproximada hoy ≈ $4.150 COP</div>
          </div>
          <div>
            <div style={{fontSize:".72rem",color:C.muted,marginBottom:6,fontWeight:600}}>
              Precio BTC actual</div>
            <div style={{background:C.surf2,border:`1px solid ${C.gold}25`,
              padding:"10px 14px",borderRadius:10}}>
              <div style={{fontSize:"1rem",fontWeight:700,color:C.gold,
                fontFamily:"'JetBrains Mono',monospace"}}>
                {btcPrice?`$${btcPrice.toLocaleString("en-US")} USD`:"Cargando…"}</div>
              {btcPrice&&<div style={{fontSize:".75rem",color:C.muted,marginTop:3}}>
                ≈ ${Math.round(btcPrice*usdCop).toLocaleString("es-CO")} COP
              </div>}
            </div>
          </div>
          <div>
            <div style={{fontSize:".72rem",color:C.muted,marginBottom:6,fontWeight:600}}>
              Costo equipos (USD) — para ROI</div>
            <input type="number" min="0" step="10" value={capex}
              onChange={e=>onCapex(parseFloat(e.target.value)||0)}
              placeholder="Ej: 350"
              style={{width:"100%",background:C.surf2,border:`1px solid ${C.border2}`,
                color:C.text,padding:"10px 14px",borderRadius:10,
                fontSize:"1rem",fontWeight:700,outline:"none",
                fontFamily:"'JetBrains Mono',monospace"}}/>
            <div style={{fontSize:".65rem",color:C.dim,marginTop:5}}>
              Bitaxe Gamma ≈ $200–400 USD</div>
          </div>
          {hwW===0&&(
            <div>
              <div style={{fontSize:".72rem",color:C.coral,marginBottom:6,fontWeight:600}}>
                ⚡ Potencia manual (W) — hardware offline</div>
              <input type="number" min="1" max="5000" step="1" value={manualW}
                onChange={e=>onManualW(parseFloat(e.target.value)||0)}
                placeholder="Ej: 19"
                style={{width:"100%",background:C.surf2,border:`1px solid ${C.coral}40`,
                  color:C.text,padding:"10px 14px",borderRadius:10,
                  fontSize:"1rem",fontWeight:700,outline:"none",
                  fontFamily:"'JetBrains Mono',monospace"}}/>
              <div style={{fontSize:".65rem",color:C.dim,marginTop:5}}>
                Bitaxe Gamma ≈ 15–22 W · ingresa el consumo real de tus equipos</div>
            </div>
          )}
        </div>
      </Card>
      {/* Aviso explicativo */}
      <div style={{background:`${C.blue}08`,border:`1px solid ${C.blue}18`,
        borderRadius:12,padding:"14px 18px",fontSize:".78rem",color:C.muted,lineHeight:1.8}}>
        <div style={{fontWeight:700,color:C.blue,marginBottom:6}}>ℹ️ ¿Qué significa cada número?</div>
        <div>• <b style={{color:C.gold}}>Ingresos estimados</b> — lo que ganarías <i>en promedio estadístico</i> si minaras muchos bloques durante ese período. En la práctica, el Bitaxe minará 0 bloques casi siempre (o el premio completo de 3.125 BTC en rarísima ocasión).</div>
        <div style={{marginTop:4}}>• <b style={{color:C.coral}}>Electricidad</b> — costo real y constante que pagas cada mes.</div>
        <div style={{marginTop:4}}>• <b style={{color:profMonCOP!=null?(profMonCOP>0?C.green:C.red):C.muted}}>Utilidad neta</b> — la diferencia. Con 1 TH/s en solo mining generalmente <b>gastas más en luz de lo que recibes</b> estadísticamente. El valor del Bitaxe es el <i>ticket de lotería</i> de ganar 3.125 BTC.</div>
      </div>

      {fin?(
        <GlowCard color={C.gold}>
          <Label color={C.gold}>💰 Ingresos Estimados (estadístico)</Label>
          <div style={{display:"grid",
            gridTemplateColumns:"repeat(auto-fill,minmax(175px,1fr))",gap:12,marginTop:12}}>
            {[
              {l:"Por día",  cop:revDayCOP,  usd:fin.revenuePerDayUSD,   btc:fin.revenuePerDayBTC},
              {l:"Por mes",  cop:revMonCOP,  usd:fin.revenuePerMonthUSD},
              {l:"Por año",  cop:revYearCOP, usd:fin.revenuePerYearUSD},
            ].map((s,i)=>(
              <div key={i} style={{background:C.surf2,borderRadius:12,
                padding:"14px 16px",border:`1px solid ${C.gold}18`}}>
                <div style={{fontSize:".6rem",color:C.muted,fontWeight:700,
                  letterSpacing:".1em",textTransform:"uppercase",marginBottom:6}}>
                  Ingresos {s.l}</div>
                <div style={{fontWeight:900,color:C.gold,fontVariantNumeric:"tabular-nums",
                  fontSize:"1.25rem",fontFamily:"'JetBrains Mono',monospace"}}>
                  {cop(s.cop)}</div>
                <div style={{fontSize:".73rem",color:C.muted,marginTop:4}}>{usd(s.usd,4)}</div>
                {s.btc&&<div style={{fontSize:".68rem",color:C.dim,marginTop:2}}>
                  {s.btc.toExponential(4)} BTC</div>}
              </div>
            ))}
          </div>
        </GlowCard>
      ):(
        <Card>
          <p style={{color:C.muted,padding:8,fontSize:".84rem"}}>
            Esperando precio BTC y datos de hashrate para calcular ingresos estimados…</p>
        </Card>
      )}

      {e&&(
        <GlowCard color={C.coral}>
          <Label color={C.coral}>⚡ Costo Electricidad · {totalW.toFixed(1)} W · Tarifa: ${copKwh.toLocaleString("es-CO")} COP/kWh</Label>
          <div style={{display:"grid",
            gridTemplateColumns:"repeat(auto-fill,minmax(155px,1fr))",gap:12,marginTop:12}}>
            {[
              {l:"kWh / día",    v:`${e.kwhDay} kWh`,   c:C.text},
              {l:"kWh / mes",   v:`${e.kwhMonth} kWh`,  c:C.text},
              {l:"Costo / día",  v:cop(e.copDay),        c:C.coral},
              {l:"Costo / mes",  v:cop(e.copMonth),      c:C.coral},
              {l:"Costo / año",  v:cop(e.copYear),       c:C.red},
              {l:"En USD/mes",  v:usd(e.usdMonth),       c:C.muted},
            ].map((s,i)=>(
              <div key={i} style={{background:C.surf2,borderRadius:10,
                padding:"12px 14px",border:`1px solid ${C.border}`}}>
                <div style={{fontSize:".58rem",color:C.muted,fontWeight:700,
                  letterSpacing:".1em",textTransform:"uppercase",marginBottom:4}}>{s.l}</div>
                <div style={{fontWeight:700,color:s.c,fontVariantNumeric:"tabular-nums",
                  fontSize:".9rem",fontFamily:"'JetBrains Mono',monospace"}}>{s.v}</div>
              </div>
            ))}
          </div>
        </GlowCard>
      )}

      {fin&&e&&(
        <GlowCard color={profMonCOP>0?C.green:C.red}>
          <Label color={profMonCOP>0?C.green:C.red}>
            {profMonCOP>0?"✅ Ganancia Neta":"❌ Pérdida Neta"} (Ingresos − Electricidad)
          </Label>
          <div style={{display:"grid",
            gridTemplateColumns:"repeat(auto-fill,minmax(175px,1fr))",gap:12,marginTop:12}}>
            {[
              {l:"Por día",  v:cop(profDayCOP),  c:profDayCOP>0?C.green:C.red},
              {l:"Por mes",  v:cop(profMonCOP),  c:profMonCOP>0?C.green:C.red},
              {l:"Por año",  v:cop(profYearCOP), c:profYearCOP>0?C.green:C.red},
              ...(roi_mes?[{l:"ROI estimado",v:`${roi_mes} meses`,c:C.gold}]:[]),
            ].map((s,i)=>(
              <div key={i} style={{background:C.surf2,borderRadius:12,
                padding:"16px 18px",border:`1px solid ${s.c}20`}}>
                <div style={{fontSize:".6rem",color:C.muted,fontWeight:700,
                  letterSpacing:".1em",textTransform:"uppercase",marginBottom:6}}>
                  Utilidad {s.l}</div>
                <div style={{fontWeight:900,color:s.c,fontVariantNumeric:"tabular-nums",
                  fontSize:"1.25rem",fontFamily:"'JetBrains Mono',monospace"}}>{s.v}</div>
              </div>
            ))}
          </div>
          <div style={{marginTop:14,padding:"10px 14px",
            background:`${profMonCOP>0?C.green:C.red}08`,
            border:`1px solid ${profMonCOP>0?C.green:C.red}18`,
            borderRadius:10,fontSize:".73rem",color:C.muted,lineHeight:1.8}}>
            ⚠ Estimado estadístico — mining solo es muy variable.
            Tiempo esperado para minar un bloque: ~{odds?.years?.toFixed(0)||"muchos"} años.
          </div>
        </GlowCard>
      )}
    </div>
  );
}

function SecHardware({miners,copKwh,onCopKwh,usdCop}) {
  return (
    <div style={{display:"flex",flexDirection:"column",gap:16}}>
      <Card>
        <div style={{display:"flex",alignItems:"center",
          justifyContent:"space-between",flexWrap:"wrap",gap:14}}>
          <div>
            <Label>⚡ Tarifa Electricidad · Colombia 🇨🇴</Label>
            <div style={{display:"flex",gap:6,flexWrap:"wrap",marginTop:7}}>
              {COP_KWH_TIPS.map((t,i)=>(
                <button key={i} onClick={()=>onCopKwh(t.v)}
                  style={{fontSize:".65rem",
                    background:copKwh===t.v?`${C.green}20`:C.surf2,
                    border:`1px solid ${copKwh===t.v?C.green:C.border}`,
                    color:copKwh===t.v?C.green:C.muted,
                    padding:"5px 10px",borderRadius:99,cursor:"pointer",
                    fontFamily:"inherit",fontWeight:600,transition:"all .15s"}}>
                  {t.label}: ${t.v}/kWh
                </button>
              ))}
            </div>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <span style={{fontSize:".78rem",color:C.muted}}>COP/kWh</span>
            <input type="number" min="100" max="2000" step="10" value={copKwh}
              onChange={e=>onCopKwh(parseFloat(e.target.value)||KWH_COP_DEF)}
              style={{width:90,background:C.surf2,border:`1px solid ${C.border2}`,
                color:C.text,padding:"9px 12px",borderRadius:10,
                fontSize:".95rem",fontWeight:700,outline:"none",
                textAlign:"center",fontFamily:"'JetBrains Mono',monospace"}}/>
          </div>
        </div>
      </Card>
      {miners.length===0&&(
        <Card><p style={{color:C.muted,padding:12}}>Sin equipos configurados.</p></Card>
      )}
      {miners.map((m,i)=>(
        <MinerDetailCard key={i} m={m} copKwh={copKwh} usdCop={usdCop}/>
      ))}
    </div>
  );
}

function MinerDetailCard({m,copKwh,usdCop}) {
  const st=!m.online?"off":m.temp>=75?"crit":m.temp>=65?"warn":"ok";
  const tc={ok:C.green,warn:C.gold,crit:C.red,off:C.dim}[st];
  const tot=(m.sharesAccepted||0)+(m.sharesRejected||0);
  const acc=tot>0?((m.sharesAccepted/tot)*100).toFixed(2):0;
  const eff=m.power&&m.hashHps>0?(m.power/(m.hashHps/1e12)).toFixed(2):null;
  const e=m.online&&m.power>0?calcElec(m.power,copKwh,usdCop):null;

  if(!m.online) return (
    <Card>
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14}}>
        <Dot s="off"/>
        <span style={{fontWeight:700,fontSize:"1rem"}}>{m.name}</span>
        <Tag label="Sin conexión" color="dim"/>
      </div>
      <div style={{background:C.surf2,borderRadius:14,padding:28,
        textAlign:"center",border:`1px solid ${C.border}`}}>
        <div style={{fontSize:"2rem",marginBottom:10,opacity:.2}}>📡</div>
        <div style={{fontSize:".85rem",color:C.muted,marginBottom:8,fontWeight:600}}>
          Hardware no alcanzable — el relay necesita correr en tu Mac</div>
        <code style={{fontSize:".72rem",color:C.blue,background:C.surf3,
          padding:"6px 14px",borderRadius:8,fontFamily:"'JetBrains Mono',monospace",
          display:"inline-block"}}>nohup python3 relay/push.py &amp;</code>
        <div style={{fontSize:".7rem",color:C.dim,marginTop:8}}>IP local: {m.url}</div>
      </div>
    </Card>
  );

  return (
    <GlowCard color={tc}>
      {/* Header */}
      <div style={{display:"flex",justifyContent:"space-between",
        alignItems:"flex-start",marginBottom:22,flexWrap:"wrap",gap:12}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <Dot s={st}/>
          <div>
            <div style={{fontWeight:900,fontSize:"1.1rem"}}>{m.name}</div>
            <div style={{fontSize:".7rem",color:C.muted,marginTop:2,
              fontFamily:"'JetBrains Mono',monospace"}}>
              {m.model} · {m.frequency} MHz · {m.url}</div>
          </div>
        </div>
        <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
          <Tag label={st==="ok"?"Activo":st==="crit"?"¡Crítico!":"Temp alta"}
            color={st==="ok"?"green":st==="crit"?"red":"gold"} dot/>
          <Tag label={`Uptime: ${m.uptimeFmt}`} color="dim"/>
          <Tag label={m.stratumURL?.split(":")[0]||"pool"} color="blue"/>
        </div>
      </div>

      {/* Gauges */}
      <div style={{display:"grid",
        gridTemplateColumns:"repeat(auto-fill,minmax(230px,1fr))",
        gap:16,marginBottom:18}}>
        <div style={{background:C.surf2,borderRadius:14,padding:18,
          border:`1px solid ${C.green}20`}}>
          <Label color={C.green}>⚡ Hashrate</Label>
          <BigNum val={fmtH(m.hashHps).v} unit={fmtH(m.hashHps).u}
            color={C.green} size="2rem"/>
          <div style={{marginTop:14,display:"flex",flexDirection:"column",gap:8}}>
            <ProgressBar val={m.frequency||0} max={600} color={C.green}
              label="Frecuencia" right={`${m.frequency} MHz`}/>
            {eff&&<div style={{display:"flex",justifyContent:"space-between",
              fontSize:".73rem",marginTop:4}}>
              <span style={{color:C.muted}}>Eficiencia</span>
              <span style={{color:C.purple,fontWeight:700}}>{eff} J/TH</span>
            </div>}
          </div>
        </div>

        <div style={{background:C.surf2,borderRadius:14,padding:18,
          border:`1px solid ${tc}20`,display:"flex",flexDirection:"column",alignItems:"center"}}>
          <Label color={tc}>🌡️ Temperatura ASIC</Label>
          <TempGauge temp={m.temp}/>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",
            gap:8,width:"100%",marginTop:8}}>
            <div style={{background:C.surf3,borderRadius:8,padding:"8px 10px",
              textAlign:"center"}}>
              <div style={{fontSize:".58rem",color:C.muted,marginBottom:2}}>VR Temp</div>
              <div style={{fontWeight:700,
                color:m.vrTemp>80?C.red:m.vrTemp>70?C.gold:C.muted,
                fontSize:".9rem"}}>{m.vrTemp}°C</div>
            </div>
            <div style={{background:C.surf3,borderRadius:8,padding:"8px 10px",
              textAlign:"center"}}>
              <div style={{fontSize:".58rem",color:C.muted,marginBottom:2}}>Límite</div>
              <div style={{fontWeight:700,color:C.red,fontSize:".9rem"}}>85°C</div>
            </div>
          </div>
        </div>

        <div style={{background:C.surf2,borderRadius:14,padding:18,
          border:`1px solid ${C.blue}20`}}>
          <Label color={C.blue}>⚙️ Potencia · Ventilador</Label>
          <div style={{display:"flex",alignItems:"center",gap:16,marginBottom:14}}>
            <div>
              <div style={{fontSize:".6rem",color:C.muted,marginBottom:2}}>POTENCIA</div>
              <BigNum val={m.power?.toFixed(1)||"—"} unit="W" color={C.blue} size="1.6rem"/>
            </div>
            <FanGauge rpm={m.fanrpm||0}/>
            <div>
              <div style={{fontSize:".6rem",color:C.muted,marginBottom:2}}>FAN</div>
              <div style={{fontWeight:700,color:C.blue,fontSize:"1rem",
                fontVariantNumeric:"tabular-nums"}}>
                {(m.fanrpm||0).toLocaleString()}</div>
              <div style={{fontSize:".65rem",color:C.muted}}>rpm</div>
            </div>
          </div>
          <ProgressBar val={m.power||0} max={30} color={C.coral}
            label="Uso potencia" right={`${((m.power/30)*100||0).toFixed(0)}%`}/>
          <div style={{marginTop:10}}>
            <ProgressBar val={m.fanrpm||0} max={6000} color={C.blue}
              label="Velocidad fan" right={`${(((m.fanrpm||0)/6000)*100).toFixed(0)}%`}/>
          </div>
        </div>
      </div>

      {/* Shares */}
      <div style={{background:C.surf2,borderRadius:14,padding:16,
        marginBottom:14,border:`1px solid ${C.border}`}}>
        <Label>📊 Shares · Sesión Actual</Label>
        <div style={{display:"grid",
          gridTemplateColumns:"repeat(auto-fill,minmax(120px,1fr))",
          gap:10,marginBottom:14,marginTop:8}}>
          {[
            {l:"Aceptadas",    v:m.sharesAccepted?.toLocaleString(),c:C.green},
            {l:"Rechazadas",   v:(m.sharesRejected||0).toString(),
              c:m.sharesRejected>0?C.red:C.muted},
            {l:"Tasa",         v:`${acc}%`,
              c:parseFloat(acc)>=99?C.green:parseFloat(acc)>=95?C.gold:C.red},
            {l:"Mejor ever",   v:m.bestDiff,        c:C.gold},
            {l:"Mejor sesión", v:m.bestSessionDiff, c:C.purple},
            {l:"Pool",         v:m.stratumURL?.split(":")[0],c:C.muted},
          ].map((s,i)=><MiniStat key={i} label={s.l} value={s.v} color={s.c}/>)}
        </div>
        <ProgressBar val={parseFloat(acc)||0} max={100} color={C.green}
          label="Tasa de aceptación" right={`${acc}%`}/>
      </div>

      {e&&(
        <div style={{background:C.surf2,borderRadius:14,padding:16,
          border:`1px solid ${C.coral}20`}}>
          <Label color={C.coral}>⚡ Consumo Eléctrico · Colombia 🇨🇴 · {m.power?.toFixed(1)} W</Label>
          <div style={{display:"grid",
            gridTemplateColumns:"repeat(auto-fill,minmax(130px,1fr))",
            gap:10,marginTop:8}}>
            {[
              {l:"kWh / día",    v:`${e.kwhDay} kWh`,   c:C.text},
              {l:"kWh / mes",   v:`${e.kwhMonth} kWh`,  c:C.text},
              {l:"Costo / día",  v:cop(e.copDay),        c:C.coral},
              {l:"Costo / mes",  v:cop(e.copMonth),      c:C.coral},
              {l:"Costo / año",  v:cop(e.copYear),       c:C.red},
              {l:"En USD/mes",  v:usd(e.usdMonth),       c:C.muted},
              {l:"Eficiencia",   v:eff?`${eff} J/TH`:"—",c:C.purple},
              {l:"Tarifa",       v:`${copKwh} COP/kWh`, c:C.dim},
            ].map((s,i)=><MiniStat key={i} label={s.l} value={s.v} color={s.c}/>)}
          </div>
        </div>
      )}
    </GlowCard>
  );
}

function SecPool({data}) {
  const {publicPool:pp,ckpool,netDiffFmt,address}=data;
  return (
    <div style={{display:"flex",flexDirection:"column",gap:16}}>
      {pp?.online?(
        <>
          <GlowCard color={C.blue}>
            <div style={{display:"flex",justifyContent:"space-between",
              alignItems:"flex-start",flexWrap:"wrap",gap:14,marginBottom:18}}>
              <div>
                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
                  <Dot s="ok"/>
                  <Tag label="public-pool.io · Activo" color="blue"/>
                </div>
                <BigNum val={fmtH(pp.hashHps10m).v} unit={fmtH(pp.hashHps10m).u}
                  color={C.blue} size="2.5rem"/>
                <div style={{fontSize:".7rem",color:C.muted,marginTop:4}}>Promedio 10 minutos</div>
              </div>
              <div>
                <div style={{fontSize:".6rem",color:C.muted,fontWeight:700,
                  letterSpacing:".1em",textTransform:"uppercase",marginBottom:4}}>1 HORA</div>
                <BigNum val={fmtH(pp.hashHps1h).v} unit={fmtH(pp.hashHps1h).u} size="1.5rem"/>
              </div>
            </div>
            <div style={{display:"grid",
              gridTemplateColumns:"repeat(auto-fill,minmax(130px,1fr))",gap:10,marginBottom:14}}>
              {[
                {l:"Workers activos",   v:pp.workerCount},
                {l:"Shares totales",    v:pp.shares?.toLocaleString("es-CO")},
                {l:"Shares 10 min",     v:pp.sharesLast10m},
                {l:"Shares 1 hora",     v:pp.sharesLastHour},
                {l:"Mejor share",       v:pp.bestEverFmt,c:C.gold},
                {l:"Candidatos bloque", v:pp.blockCandidates||0},
                {l:"Dificultad red",    v:netDiffFmt},
                {l:"Última share",      v:ago(pp.minsSinceShare),
                  c:pp.minsSinceShare>15?C.red:C.green},
              ].map((s,i)=><MiniStat key={i} label={s.l} value={s.v} color={s.c}/>)}
            </div>
            {pp.minsSinceShare>15&&(
              <div style={{padding:"12px 16px",background:`${C.red}10`,
                border:`1px solid ${C.red}25`,borderRadius:10,
                fontSize:".8rem",color:C.red,display:"flex",alignItems:"center",gap:8}}>
                ⚠️ Sin share hace {Math.round(pp.minsSinceShare)} min — revisa tu minero
              </div>
            )}
          </GlowCard>

          {pp.workers?.length>0&&(
            <Card>
              <Label>👷 Workers</Label>
              <div style={{overflowX:"auto",marginTop:10}}>
                <table style={{width:"100%",borderCollapse:"collapse",fontSize:".82rem"}}>
                  <thead>
                    <tr style={{color:C.muted,fontSize:".6rem",fontWeight:700,
                      letterSpacing:".1em",textTransform:"uppercase"}}>
                      {["","Worker","Hashrate","Mejor Share","Última Share","Modo"].map((h,i)=>(
                        <th key={i} style={{padding:"8px 12px 12px",textAlign:"left",
                          borderBottom:`1px solid ${C.border}`,whiteSpace:"nowrap"}}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {pp.workers.map((w,i)=>(
                      <tr key={i} style={{borderBottom:`1px solid ${C.border}`}}
                        onMouseEnter={e=>e.currentTarget.style.background=C.surf2}
                        onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                        <td style={{padding:"11px 12px"}}><Dot s="ok"/></td>
                        <td style={{padding:"11px 12px",fontWeight:600,
                          fontFamily:"'JetBrains Mono',monospace",fontSize:".78rem"}}>
                          {w.name}</td>
                        <td style={{padding:"11px 12px",color:C.green,fontWeight:700,
                          fontVariantNumeric:"tabular-nums"}}>{w.hashFmt}</td>
                        <td style={{padding:"11px 12px",color:C.gold,
                          fontVariantNumeric:"tabular-nums"}}>{w.bestEverFmt}</td>
                        <td style={{padding:"11px 12px",
                          color:w.minsSinceShare>15?C.red:C.muted}}>
                          {ago(w.minsSinceShare)}</td>
                        <td style={{padding:"11px 12px"}}>
                          <Tag label={w.payoutMode||"—"} color="blue"/></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          <a href={`https://web.public-pool.io/#/app/${address}`}
            target="_blank" rel="noreferrer"
            style={{display:"flex",alignItems:"center",justifyContent:"space-between",
              background:C.surf,border:`1px solid ${C.blue}25`,
              borderRadius:14,padding:"16px 22px",textDecoration:"none",color:C.text}}>
            <div>
              <div style={{fontWeight:700,marginBottom:2}}>Ver en public-pool.io</div>
              <div style={{fontSize:".75rem",color:C.muted}}>Interfaz completa · modo SOLO</div>
            </div>
            <span style={{color:C.blue,fontSize:"1.3rem"}}>↗</span>
          </a>
        </>
      ):(
        <Card>
          <p style={{color:C.muted,padding:12}}>Sin datos de pool.<br/>
            <small style={{color:C.dim}}>{pp?.error}</small></p>
        </Card>
      )}

      <Card>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",
          marginBottom:ckpool?.online?14:8}}>
          <Tag label="solo.ckpool.org" color={ckpool?.online?"green":"dim"}
            dot={ckpool?.online}/>
          {!ckpool?.online&&(
            <span style={{fontSize:".75rem",color:C.dim}}>Sin actividad</span>
          )}
        </div>
        {ckpool?.online?(
          <>
            <Row label="Hashrate 5m"  value={ckpool.hashFmt5m}/>
            <Row label="Hashrate 1d"  value={ckpool.hashFmt1d}/>
            <Row label="Workers"       value={ckpool.workerCount}/>
            <Row label="Mejor share"   value={ckpool.bestEverFmt} color={C.gold}/>
            <Row label="Última share"  value={ago(ckpool.minsSinceShare)} last/>
          </>
        ):(
          <p style={{fontSize:".79rem",color:C.dim,fontStyle:"italic",marginTop:4}}>
            No hay registros para esta dirección en ckpool.</p>
        )}
      </Card>
    </div>
  );
}

function SecMineria({data}) {
  const {odds,netDiffFmt,publicPool:pp,btcPrice,netDiff}=data;
  if(!odds) return <Card><p style={{color:C.muted,padding:12}}>Calculando…</p></Card>;
  const {oneInDays,years,perDay}=odds;
  const hps=pp?.online?pp.hashHps10m:0;
  const rewardBTC=3.125;
  const rewardCOP=btcPrice?(rewardBTC*btcPrice*USD_COP_DEF):null;

  const periodos=[
    {l:"1 día",d:1},{l:"1 semana",d:7},{l:"1 mes",d:30},
    {l:"3 meses",d:90},{l:"6 meses",d:180},{l:"1 año",d:365},
    {l:"5 años",d:1825},{l:"10 años",d:3650},{l:"20 años",d:7300},
  ].map(p=>({...p,prob:(1-Math.pow(1-perDay,p.d))*100}));

  return (
    <div style={{display:"flex",flexDirection:"column",gap:16}}>
      <GlowCard color={C.gold}>
        <div style={{display:"flex",justifyContent:"space-between",
          alignItems:"flex-start",flexWrap:"wrap",gap:20,marginBottom:18}}>
          <div>
            <Label color={C.gold}>🎲 Probabilidad de Minar un Bloque · Por día</Label>
            <BigNum val={`1 en ${oneInDays.toLocaleString("es-CO")}`}
              color={C.gold} size="1.8rem"/>
            <div style={{fontSize:".73rem",color:C.muted,marginTop:6}}>
              Con {hps?fmtH(hps).full:"el hashrate del pool"}
            </div>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
            <div style={{background:C.surf2,borderRadius:12,padding:"14px 18px",
              textAlign:"center",border:`1px solid ${C.border}`}}>
              <div style={{fontSize:"1.8rem",fontWeight:900,
                fontVariantNumeric:"tabular-nums"}}>
                ~{Math.round(years).toLocaleString("es-CO")}</div>
              <div style={{fontSize:".68rem",color:C.muted,marginTop:2}}>años promedio</div>
            </div>
            <div style={{background:`${C.gold}10`,borderRadius:12,
              padding:"14px 18px",textAlign:"center",
              border:`1px solid ${C.gold}25`}}>
              <div style={{fontSize:"1.1rem",fontWeight:800,color:C.gold}}>3.125 BTC</div>
              {rewardCOP&&<div style={{fontSize:".72rem",color:C.muted,marginTop:2}}>
                ≈ {cop(rewardCOP)}</div>}
              {btcPrice&&<div style={{fontSize:".68rem",color:C.dim,marginTop:1}}>
                ≈ ${Math.round(btcPrice*3.125).toLocaleString("en-US")} USD</div>}
            </div>
          </div>
        </div>
        <div style={{padding:"10px 14px",background:`${C.gold}08`,
          border:`1px solid ${C.gold}15`,borderRadius:10,
          fontSize:".74rem",color:C.muted,lineHeight:1.7}}>
          ⚡ Mining solo = lotería estadística. Cada share es un intento independiente.
        </div>
      </GlowCard>

      <Card>
        <Label>📊 Probabilidad Acumulada</Label>
        <div style={{marginTop:10}}>
          {periodos.map((r,i)=>{
            const c=r.prob>50?C.green:r.prob>10?C.gold:r.prob>1?C.blue:C.purple;
            return (
              <div key={i} style={{display:"grid",
                gridTemplateColumns:"110px 1fr 110px 120px",
                gap:12,alignItems:"center",padding:"11px 0",
                borderBottom:i<periodos.length-1?`1px solid ${C.border}`:"none"}}>
                <span style={{fontSize:".82rem",color:C.muted}}>{r.l}</span>
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <div style={{flex:1,height:5,background:C.surf3,borderRadius:99,
                    overflow:"hidden",border:`1px solid ${C.border}`}}>
                    <div style={{height:"100%",borderRadius:99,background:c,
                      width:`${Math.min(r.prob*1.5,100)}%`,
                      minWidth:r.prob>0?2:0,boxShadow:`0 0 6px ${c}60`,
                      transition:"width .5s ease"}}/>
                  </div>
                  <span style={{fontSize:".78rem",color:c,fontWeight:700,
                    minWidth:56,textAlign:"right",fontVariantNumeric:"tabular-nums"}}>
                    {r.prob<0.01?r.prob.toExponential(2):r.prob.toFixed(3)}%
                  </span>
                </div>
                <div style={{fontSize:".72rem",color:C.dim,textAlign:"right",
                  fontFamily:"'JetBrains Mono',monospace",fontVariantNumeric:"tabular-nums"}}>
                  1:{(1/(r.prob/100)).toLocaleString("es-CO",{maximumFractionDigits:0})}
                </div>
                {rewardCOP&&r.prob>0.001&&(
                  <div style={{fontSize:".65rem",color:C.muted,textAlign:"right"}}>
                    E: {cop(rewardCOP*(r.prob/100))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Card>

      <Card>
        <Label>🌐 Contexto Red Bitcoin</Label>
        <Row label="Dificultad de red"       value={netDiffFmt} mono/>
        <Row label="Mejor share histórica"    value={pp?.bestEverFmt} color={C.gold}/>
        <Row label="% dificultad alcanzado"   value={netDiff&&pp?.bestEver
          ?((pp.bestEver/netDiff)*100).toExponential(3)+"%":"—"} mono/>
        <Row label="Premio por bloque"        value="3.125 BTC (halving 2024)"/>
        <Row label="Hashrate de la red"       value={odds.netHashFmt||"—"} last/>
      </Card>
    </div>
  );
}

function Reloj() {
  const [t,setT]=useState("");
  useEffect(()=>{
    const tick=()=>setT(new Date().toLocaleTimeString("es-CO",
      {hour:"2-digit",minute:"2-digit",second:"2-digit"}));
    tick(); const id=setInterval(tick,1000); return()=>clearInterval(id);
  },[]);
  return <span style={{fontFamily:"'JetBrains Mono',monospace",
    fontSize:".8rem",color:C.muted,letterSpacing:".05em"}}>{t}</span>;
}

// ════════════════════════════════════════════════════════════════
// DASHBOARD PRINCIPAL
// ════════════════════════════════════════════════════════════════
export default function Dashboard() {
  const router=useRouter();
  const [data,setData]=useState(null);
  const [err,setErr]=useState(null);
  const [loading,setLoading]=useState(true);
  const [lastUp,setLastUp]=useState(null);
  const [cd,setCd]=useState(REFRESH);
  const [tab,setTab]=useState("inicio");
  const [copKwh,setCopKwh]=useState(KWH_COP_DEF);
  const [usdCop,setUsdCop]=useState(USD_COP_DEF);
  const [capex,setCapex]=useState(0);
  const [manualW,setManualW]=useState(19); // 19W = consumo típico Bitaxe Gamma
  const [sideOpen,setSideOpen]=useState(false);

  const fetchData=useCallback(async()=>{
    try {
      const res=await fetch("/api/status");
      if(res.status===401){router.replace("/");return;}
      if(!res.ok) throw new Error(`HTTP ${res.status}`);
      setData(await res.json()); setErr(null);
      setLastUp(new Date()); setCd(REFRESH);
    } catch(e){setErr(e.message);}
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

  return (<>
    <Head>
      <title>⛏️ Minero · Dashboard</title>
      <meta name="viewport" content="width=device-width,initial-scale=1"/>
      <meta name="robots" content="noindex,nofollow"/>
      <link rel="preconnect" href="https://fonts.googleapis.com"/>
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin=""/>
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;700&display=swap" rel="stylesheet"/>
    </Head>

    <div style={{display:"flex",minHeight:"100vh",background:C.bg,color:C.text,
      fontFamily:"'Inter',-apple-system,BlinkMacSystemFont,sans-serif"}}>

      <div className="sd">
        <Sidebar active={tab} onChange={setTab} data={data} copKwh={copKwh}/>
      </div>

      {sideOpen&&(
        <div style={{position:"fixed",inset:0,zIndex:100,display:"flex"}}>
          <div style={{position:"absolute",inset:0,background:"rgba(0,0,0,.75)"}}
            onClick={()=>setSideOpen(false)}/>
          <div style={{position:"relative",zIndex:1,width:250}}>
            <Sidebar active={tab}
              onChange={t=>{setTab(t);setSideOpen(false);}}
              data={data} copKwh={copKwh}/>
          </div>
        </div>
      )}

      <div style={{flex:1,display:"flex",flexDirection:"column",minWidth:0}}>
        <header style={{position:"sticky",top:0,zIndex:40,
          background:`${C.bg}ee`,backdropFilter:"blur(20px)",
          WebkitBackdropFilter:"blur(20px)",
          borderBottom:`1px solid ${C.border}`,
          padding:"0 20px",height:52,
          display:"flex",alignItems:"center",
          justifyContent:"space-between",gap:12}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <button className="mb" onClick={()=>setSideOpen(s=>!s)}
              style={{background:"none",border:`1px solid ${C.border}`,
                color:C.muted,width:32,height:32,borderRadius:8,cursor:"pointer",
                fontSize:"1rem",fontFamily:"inherit",display:"flex",
                alignItems:"center",justifyContent:"center"}}>☰</button>
            <span style={{fontWeight:900,fontSize:".95rem",letterSpacing:"-.03em",
              background:`linear-gradient(90deg,${C.green},${C.blue})`,
              WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>
              Minero</span>
            {data?.address&&(
              <span style={{fontSize:".67rem",color:C.muted,
                fontFamily:"'JetBrains Mono',monospace",
                background:C.surf2,padding:"3px 9px",
                borderRadius:99,border:`1px solid ${C.border}`}}>
                {truncAddr(data.address)}</span>
            )}
            {ppOnline&&<Tag label={shareLate?"Sin share +15m":"Pool OK"}
              color={shareLate?"red":"green"} dot/>}
            {err&&<Tag label="Error API" color="red"/>}
          </div>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <Reloj/>
            {lastUp&&!loading&&(
              <span style={{fontSize:".67rem",color:C.dim,
                display:"flex",alignItems:"center",gap:5}}>
                <span style={{width:5,height:5,borderRadius:"50%",background:C.green,
                  animation:"pulse 2s ease-in-out infinite",display:"inline-block"}}/>
                {cd}s
              </span>
            )}
            <button onClick={fetchData} title="Actualizar ahora"
              style={{background:"none",border:`1px solid ${C.border}`,
                color:C.muted,width:30,height:30,borderRadius:8,cursor:"pointer",
                fontSize:".9rem",display:"flex",alignItems:"center",
                justifyContent:"center",fontFamily:"inherit"}}>↻</button>
            <button onClick={logout}
              style={{background:"none",border:`1px solid ${C.border}`,
                color:C.muted,padding:"5px 14px",borderRadius:8,cursor:"pointer",
                fontSize:".75rem",fontFamily:"inherit"}}>Salir</button>
          </div>
        </header>

        <main style={{flex:1,padding:"22px 20px 60px",overflowY:"auto"}}>
          {loading?(
            <div style={{display:"grid",gap:14,
              gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))"}}>
              {[200,200,200,200,350,350].map((h,i)=>(
                <div key={i} style={{background:C.surf,borderRadius:16,height:h,
                  border:`1px solid ${C.border}`,
                  backgroundImage:`linear-gradient(90deg,${C.surf} 0%,${C.surf2} 50%,${C.surf} 100%)`,
                  backgroundSize:"200% 100%",animation:"shimmer 1.5s ease-in-out infinite"}}/>
              ))}
            </div>
          ):data&&(<>
            {tab==="inicio"   &&<SecInicio   data={data} copKwh={copKwh} usdCop={usdCop}/>}
            {tab==="analisis" &&<SecAnalisis  data={data}/>}
            {tab==="finanzas" &&<SecFinanzas  data={data} copKwh={copKwh} onCopKwh={setCopKwh}
                                  usdCop={usdCop} onUsdCop={setUsdCop}
                                  capex={capex} onCapex={setCapex}
                                  manualW={manualW} onManualW={setManualW}/>}
            {tab==="hardware" &&<SecHardware  miners={miners} copKwh={copKwh}
                                  onCopKwh={setCopKwh} usdCop={usdCop}/>}
            {tab==="pool"     &&<SecPool      data={data}/>}
            {tab==="mineria"  &&<SecMineria   data={data}/>}
          </>)}
        </main>
      </div>
    </div>

    <style jsx global>{`
      @keyframes ping    {0%{transform:scale(1);opacity:.5}70%{transform:scale(2.2);opacity:0}100%{transform:scale(2.2);opacity:0}}
      @keyframes pulse   {0%,100%{opacity:1}50%{opacity:.2}}
      @keyframes shimmer {0%{background-position:-200% 0}100%{background-position:200% 0}}
      *, *::before, *::after { box-sizing:border-box; margin:0; padding:0; }
      body { background:#030b17; color:#e2ecf8; -webkit-font-smoothing:antialiased;
        font-family:'Inter',-apple-system,sans-serif; }
      input,button,select { font-family:inherit; }
      ::-webkit-scrollbar { width:4px; height:4px; }
      ::-webkit-scrollbar-track { background:transparent; }
      ::-webkit-scrollbar-thumb { background:rgba(255,255,255,.1); border-radius:99px; }
      @media(min-width:768px){ .sd{display:flex!important;} .mb{display:none!important;} }
      @media(max-width:767px){ .sd{display:none;} }
    `}</style>
  </>);
}
