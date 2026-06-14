import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import {
  authSignUp, authVerifyOtp, authSignIn, authSignOut, authResendOtp,
  db, isSupabaseReady, supabase,
  uploadFile, dataUrlToBlob, songFromDb, songToDb, subscribeToSongs,
  profileFromDb, subscribeToProfiles,
} from "./supabase.js";

// ─── THEME ────────────────────────────────────────────────────────────────────
const T = {
  blue:"#1A8FE3", orange:"#F97316", green:"#22C55E", red:"#EF4444", purple:"#9B5DE5",
  blueDim:"#1A8FE322", orangeDim:"#F9731622", greenDim:"#22C55E22", redDim:"#EF444422",
  blueBorder:"#1A8FE344", orangeBorder:"#F9731644", greenBorder:"#22C55E44", redBorder:"#EF444444",
  bg:"#070A10", bg1:"#0B0F1A", bg2:"#0F1420", card:"#0D1220",
  border:"#151D2E", border2:"#1C2840",
  text:"#FFFFFF", sub:"#6B7A99", mute:"#2A3550",
};

const GENRES = [
  {name:"Afrobeat",color:T.orange},{name:"Amapiano",color:"#FF6B00"},
  {name:"Hip-Hop",color:T.blue},{name:"Gospel",color:"#C8A951"},
  {name:"Dancehall",color:T.green},{name:"R&B",color:T.purple},
  {name:"Reggae",color:T.green},{name:"Bongo Flava",color:T.orange},
  {name:"Gengetone",color:T.blue},{name:"Highlife",color:"#40E0D0"},
  {name:"Makossa",color:"#FF4081"},{name:"Traditional",color:"#C8A951"},
  {name:"Pop",color:"#FF69B4"},{name:"Rock",color:"#888"},
  {name:"EDM",color:T.blue},{name:"House",color:T.purple},
  {name:"Jazz",color:"#C8A951"},{name:"Country",color:"#DEB887"},
  {name:"Blues",color:T.blue},{name:"Classical",color:"#C8A951"},
  {name:"Latin",color:T.orange},{name:"K-Pop",color:"#FF69B4"},
];

const UPLOAD_FEE = 1000;
const UPLOAD_FEE_LABEL = "MWK 1,000";
const fmtNum = n => n>=1000000?(n/1000000).toFixed(1)+"M":n>=1000?(n/1000).toFixed(0)+"K":String(n);
const fmtTime = s => { const m=Math.floor(s/60),sec=Math.floor(s%60); return `${m}:${sec.toString().padStart(2,"0")}`; };
const genId = () => Date.now().toString(36)+Math.random().toString(36).slice(2,6);

// Upload a track's audio file + cover image (data URL) to Supabase Storage.
// Returns public URLs (or nulls if Supabase isn't configured / no files given).
async function uploadTrackAssets(currentUser, audioFile, coverDataUrl, idHint){
  let audioUrl=null, coverUrl=null;
  if(!isSupabaseReady) return { audioUrl, coverUrl };
  if(audioFile){
    const ext=(audioFile.name.split(".").pop()||"mp3").toLowerCase();
    audioUrl=await uploadFile("audio",`${currentUser.id}/${idHint}.${ext}`,audioFile);
  }
  if(coverDataUrl){
    const blob=dataUrlToBlob(coverDataUrl);
    coverUrl=await uploadFile("covers",`${currentUser.id}/${idHint}.jpg`,blob);
  }
  return { audioUrl, coverUrl };
}

const LS = {
  get:(k,d)=>{ try{const v=localStorage.getItem("mwplay_"+k);return v?JSON.parse(v):d;}catch{return d;} },
  set:(k,v)=>{ try{localStorage.setItem("mwplay_"+k,JSON.stringify(v));}catch{} },
};

// ─── TOAST ────────────────────────────────────────────────────────────────────
function useToast(){
  const [toasts,setToasts]=useState([]);
  const show=useCallback((msg,type="info")=>{
    const id=genId();
    setToasts(t=>[...t,{id,msg,type}]);
    setTimeout(()=>setToasts(t=>t.filter(x=>x.id!==id)),3400);
  },[]);
  return {toasts,show};
}
function Toast({toasts}){
  return(
    <div style={{position:"fixed",top:16,right:16,zIndex:9999,display:"flex",flexDirection:"column",gap:8,pointerEvents:"none",maxWidth:300}}>
      {toasts.map(t=>(
        <div key={t.id} style={{background:t.type==="error"?T.orangeDim:t.type==="success"?T.greenDim:T.bg2,border:`1px solid ${t.type==="error"?T.orangeBorder:t.type==="success"?T.greenBorder:T.border2}`,color:t.type==="error"?T.orange:t.type==="success"?T.green:T.sub,padding:"10px 16px",borderRadius:10,fontSize:12,fontWeight:600,fontFamily:"'DM Sans',sans-serif",animation:"mwtoastin .25s ease",boxShadow:"0 8px 32px rgba(0,0,0,.5)"}}>
          {t.msg}
        </div>
      ))}
    </div>
  );
}

// ─── SHARED UI ────────────────────────────────────────────────────────────────
function PageSlide({children,show}){
  return(
    <div style={{position:"absolute",inset:0,overflowY:"auto",overflowX:"hidden",transform:show?"translateX(0)":"translateX(100%)",opacity:show?1:0,transition:"transform 0.28s cubic-bezier(0.4,0,0.2,1),opacity 0.22s ease",background:T.bg,paddingBottom:140,willChange:"transform"}}>
      {children}
    </div>
  );
}
function Eq({active,size=14,color=T.blue}){
  return(
    <div style={{display:"flex",alignItems:"flex-end",gap:2,height:size,flexShrink:0}}>
      {[1,2,3,4].map(i=>(
        <div key={i} style={{width:2,borderRadius:1,background:color,height:active?undefined:Math.floor(size*0.35),animation:active?`mweq${i} ${0.55+i*0.1}s ease-in-out infinite alternate`:"none"}}/>
      ))}
      <style>{`@keyframes mweq1{0%{height:3px}100%{height:${size}px}}@keyframes mweq2{0%{height:${Math.floor(size*.7)}px}100%{height:3px}}@keyframes mweq3{0%{height:4px}100%{height:${Math.floor(size*.85)}px}}@keyframes mweq4{0%{height:${size}px}100%{height:4px}}`}</style>
    </div>
  );
}
const inp=(x={})=>({width:"100%",background:T.bg2,border:`1px solid ${T.border}`,borderRadius:8,padding:"10px 12px",color:T.text,fontSize:13,outline:"none",fontFamily:"'DM Sans',sans-serif",boxSizing:"border-box",transition:"border-color .15s",...x});
function Field({label,children,hint}){return(<div style={{marginBottom:15}}><label style={{display:"block",color:T.sub,fontSize:11,fontWeight:600,marginBottom:5,letterSpacing:.5}}>{label}</label>{children}{hint&&<p style={{color:T.mute,fontSize:10,marginTop:4}}>{hint}</p>}</div>);}
function Btn({children,onClick,full,flex,loading,color=T.blue,style:sx={},disabled}){return <button style={{background:color,color:"#fff",border:"none",borderRadius:8,padding:"10px 18px",fontSize:12,fontWeight:700,cursor:disabled||loading?"not-allowed":"pointer",fontFamily:"'DM Sans',sans-serif",whiteSpace:"nowrap",width:full?"100%":undefined,flex:flex||undefined,opacity:loading||disabled?.6:1,...sx}} onClick={onClick} disabled={loading||disabled}>{children}</button>;}
function BtnGhost({children,onClick,flex,style:sx={}}){return <button style={{background:T.bg2,color:T.sub,border:`1px solid ${T.border2}`,borderRadius:8,padding:"10px 18px",fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"'DM Sans',sans-serif",flex:flex||undefined,...sx}} onClick={onClick}>{children}</button>;}
function Modal({children,onClose,maxWidth=440,padding="28px 24px"}){
  useEffect(()=>{const h=e=>e.key==="Escape"&&onClose();window.addEventListener("keydown",h);return()=>window.removeEventListener("keydown",h);},[onClose]);
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.9)",zIndex:500,display:"flex",alignItems:"center",justifyContent:"center",backdropFilter:"blur(10px)",padding:14}} onClick={onClose}>
      <div style={{background:T.bg1,border:`1px solid ${T.border}`,borderRadius:18,padding,width:"100%",maxWidth,maxHeight:"92vh",overflowY:"auto"}} onClick={e=>e.stopPropagation()}>{children}</div>
    </div>
  );
}
function ModalHeader({title,sub,onClose}){return(<div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:20}}><div><h2 style={{color:T.text,fontFamily:"'Syne',sans-serif",fontSize:18}}>{title}</h2>{sub&&<p style={{color:T.sub,fontSize:12,marginTop:3}}>{sub}</p>}</div><button onClick={onClose} style={{background:"none",border:"none",color:T.mute,fontSize:20,cursor:"pointer",flexShrink:0}}>✕</button></div>);}
function EmptyState({title,sub,onCTA,ctaLabel,icon}){
  return(
    <div style={{textAlign:"center",padding:"52px 20px"}}>
      <div style={{width:56,height:56,borderRadius:"50%",border:`1px solid ${T.border}`,display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 18px",background:T.bg1}}>
        {icon||<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={T.border2} strokeWidth="1.2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>}
      </div>
      <p style={{color:T.sub,fontSize:14,fontWeight:600,marginBottom:7}}>{title}</p>
      <p style={{color:T.mute,fontSize:12,lineHeight:1.6,maxWidth:260,margin:"0 auto 20px"}}>{sub}</p>
      {onCTA&&<Btn onClick={onCTA}>{ctaLabel}</Btn>}
    </div>
  );
}
function Logo({size=18}){return(<div style={{display:"flex",alignItems:"center",gap:1}}><span style={{fontSize:size,fontWeight:900,fontFamily:"'Syne',sans-serif",color:T.blue,letterSpacing:-1}}>MW</span><span style={{fontSize:size,fontWeight:900,fontFamily:"'Syne',sans-serif",background:`linear-gradient(135deg,${T.orange},${T.green})`,WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",letterSpacing:2}}>PLAY</span></div>);}
function BackNav({label,onBack}){return(<nav style={{position:"sticky",top:0,zIndex:100,background:`rgba(7,10,16,.97)`,backdropFilter:"blur(20px)",borderBottom:`1px solid ${T.border}`,padding:"0 16px",height:52,display:"flex",alignItems:"center",gap:14}}><button style={{background:"none",border:"none",color:T.sub,cursor:"pointer",padding:4,display:"flex",alignItems:"center"}} onClick={onBack}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg></button><span style={{color:T.sub,fontSize:11,letterSpacing:.5}}>{label}</span></nav>);}


// ─── NOTIFICATIONS SYSTEM ─────────────────────────────────────────────────────
function useNotifications(currentUser) {
  const [notifs, setNotifs] = useState(() => LS.get("notifs_"+(currentUser?.id||""), []));
  const unread = notifs.filter(n => !n.read).length;

  const addNotif = useCallback((type, msg, data={}) => {
    const n = { id:genId(), type, msg, data, read:false, time:new Date().toISOString() };
    setNotifs(prev => {
      const updated = [n, ...prev].slice(0, 50);
      LS.set("notifs_"+(currentUser?.id||""), updated);
      return updated;
    });
  }, [currentUser]);

  const markRead = useCallback((id) => {
    setNotifs(prev => {
      const updated = id === "all" ? prev.map(n=>({...n,read:true})) : prev.map(n=>n.id===id?{...n,read:true}:n);
      LS.set("notifs_"+(currentUser?.id||""), updated);
      return updated;
    });
  }, [currentUser]);

  const clearAll = useCallback(() => {
    setNotifs([]); LS.set("notifs_"+(currentUser?.id||""), []);
  }, [currentUser]);

  return { notifs, unread, addNotif, markRead, clearAll };
}

function NotificationsPanel({ notifs, unread, markRead, clearAll, onClose, onNavigate }) {
  const ICONS = {
    like: "♥", comment: "💬", follow: "👤", upload: "🎵",
    approved: "✅", rejected: "❌", download: "⬇", playlist: "🎶",
    verify: "🏅", payment: "💳",
  };
  const timeAgo = iso => {
    const diff = (Date.now() - new Date(iso)) / 1000;
    if (diff < 60) return "just now";
    if (diff < 3600) return Math.floor(diff/60)+"m ago";
    if (diff < 86400) return Math.floor(diff/3600)+"h ago";
    return Math.floor(diff/86400)+"d ago";
  };
  return (
    <Modal onClose={onClose} maxWidth={400} padding="0">
      <div style={{padding:"18px 20px",borderBottom:`1px solid ${T.border}`,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <h2 style={{color:T.text,fontFamily:"'Syne',sans-serif",fontSize:17}}>Notifications</h2>
          {unread>0&&<span style={{background:T.red,color:"#fff",fontSize:10,fontWeight:700,padding:"1px 7px",borderRadius:20}}>{unread}</span>}
        </div>
        <div style={{display:"flex",gap:8}}>
          {unread>0&&<button style={{background:"none",border:"none",color:T.blue,fontSize:11,cursor:"pointer"}} onClick={()=>markRead("all")}>Mark all read</button>}
          {notifs.length>0&&<button style={{background:"none",border:"none",color:T.mute,fontSize:11,cursor:"pointer"}} onClick={clearAll}>Clear</button>}
          <button onClick={onClose} style={{background:"none",border:"none",color:T.mute,fontSize:18,cursor:"pointer"}}>✕</button>
        </div>
      </div>
      <div style={{maxHeight:"70vh",overflowY:"auto"}}>
        {notifs.length===0
          ? <div style={{padding:"40px 20px",textAlign:"center",color:T.mute,fontSize:13}}>No notifications yet</div>
          : notifs.map(n => (
            <div key={n.id} style={{display:"flex",gap:12,padding:"14px 20px",borderBottom:`1px solid ${T.border}`,background:n.read?"transparent":`${T.blue}08`,cursor:"pointer",transition:"background .15s"}}
              onClick={()=>{ markRead(n.id); n.data?.action&&onNavigate(n.data.action); onClose(); }}>
              <div style={{width:36,height:36,borderRadius:"50%",background:T.bg2,border:`1px solid ${T.border}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,flexShrink:0}}>{ICONS[n.type]||"🔔"}</div>
              <div style={{flex:1,minWidth:0}}>
                <p style={{color:n.read?T.sub:T.text,fontSize:12,lineHeight:1.5}}>{n.msg}</p>
                <p style={{color:T.mute,fontSize:10,marginTop:3}}>{timeAgo(n.time)}</p>
              </div>
              {!n.read&&<div style={{width:6,height:6,borderRadius:"50%",background:T.blue,flexShrink:0,marginTop:4}}/>}
            </div>
          ))}
      </div>
    </Modal>
  );
}

// ─── PAYMENT MODAL (Manual Mobile Money) ──────────────────────────────────────
const PAYMENT_NUMBER = "0884907615";

function PaymentModal({ amount, amountLabel, purpose, onSuccess, onClose }) {
  const [confirmed, setConfirmed] = useState(false);
  const [copiedNum, setCopiedNum] = useState(false);
  const [copiedRef, setCopiedRef] = useState(false);
  const [ref] = useState(() => "MW-" + genId().slice(-6).toUpperCase());

  const copy = (text, which) => {
    if (navigator.clipboard) navigator.clipboard.writeText(text).catch(()=>{});
    if (which === "num") { setCopiedNum(true); setTimeout(() => setCopiedNum(false), 1500); }
    else { setCopiedRef(true); setTimeout(() => setCopiedRef(false), 1500); }
  };

  if (confirmed) return (
    <Modal onClose={onClose} maxWidth={360}>
      <div style={{textAlign:"center",padding:"16px 0"}}>
        <div style={{width:64,height:64,borderRadius:"50%",background:T.greenDim,border:`1px solid ${T.greenBorder}`,display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 20px",fontSize:28}}>✅</div>
        <h3 style={{color:T.text,fontFamily:"'Syne',sans-serif",fontSize:20,marginBottom:8}}>Submitted!</h3>
        <p style={{color:T.sub,fontSize:13,lineHeight:1.7,marginBottom:6}}>Your track is now <strong style={{color:T.orange}}>pending review</strong>. Once we confirm receipt of <span style={{color:T.green,fontWeight:700}}>{amountLabel}</span>, we'll publish it — usually within a few hours.</p>
        <div style={{background:T.bg2,border:`1px solid ${T.border}`,borderRadius:8,padding:"10px 14px",margin:"16px 0 20px",textAlign:"left"}}>
          <div style={{color:T.mute,fontSize:10,letterSpacing:.5,marginBottom:3}}>YOUR REFERENCE</div>
          <div style={{color:T.sub,fontSize:13,fontFamily:"'DM Mono',monospace",fontWeight:700}}>{ref}</div>
        </div>
        <Btn full onClick={onClose}>Done</Btn>
      </div>
    </Modal>
  );

  return (
    <Modal onClose={onClose} maxWidth={400}>
      <ModalHeader title="Send Payment" sub={purpose} onClose={onClose}/>
      <div style={{textAlign:"center",padding:"14px 0",borderTop:`1px solid ${T.border}`,borderBottom:`1px solid ${T.border}`,marginBottom:18}}>
        <div style={{color:T.mute,fontSize:10,letterSpacing:1,marginBottom:4}}>AMOUNT TO SEND</div>
        <div style={{color:T.text,fontFamily:"'Syne',sans-serif",fontSize:32,fontWeight:700,letterSpacing:-1}}>{amountLabel}</div>
      </div>

      <p style={{color:T.sub,fontSize:12,lineHeight:1.6,marginBottom:12}}>Send the amount above via <strong style={{color:T.text}}>TNM Mpamba</strong> or <strong style={{color:T.text}}>Airtel Money</strong> to:</p>

      <div style={{display:"flex",alignItems:"center",gap:10,background:T.bg2,border:`1px solid ${T.border}`,borderRadius:10,padding:"14px 16px",marginBottom:14}}>
        <span style={{fontSize:24}}>📱</span>
        <div style={{flex:1,fontFamily:"'DM Mono',monospace",fontSize:18,fontWeight:700,color:T.text,letterSpacing:1}}>{PAYMENT_NUMBER}</div>
        <BtnGhost onClick={()=>copy(PAYMENT_NUMBER,"num")} style={{padding:"7px 14px",fontSize:11}}>{copiedNum?"Copied ✓":"Copy"}</BtnGhost>
      </div>

      <div style={{background:T.bg2,border:`1px solid ${T.blueBorder}`,borderRadius:8,padding:12,marginBottom:18}}>
        <div style={{color:T.mute,fontSize:10,letterSpacing:.5,marginBottom:4}}>YOUR REFERENCE — add as the note if possible</div>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <div style={{flex:1,color:T.blue,fontSize:15,fontWeight:700,fontFamily:"'DM Mono',monospace"}}>{ref}</div>
          <BtnGhost onClick={()=>copy(ref,"ref")} style={{padding:"6px 12px",fontSize:11}}>{copiedRef?"Copied ✓":"Copy"}</BtnGhost>
        </div>
      </div>

      <p style={{color:T.mute,fontSize:11,lineHeight:1.6,marginBottom:18}}>After sending, tap the button below. Your track will show as "Pending" until we receive your payment confirmation and approve it.</p>

      <Btn full color={T.green} onClick={()=>{setConfirmed(true);onSuccess(ref);}}>I've sent the payment ✓</Btn>
    </Modal>
  );
}


// ─── SHARE MODAL ──────────────────────────────────────────────────────────────
function ShareModal({ song, onClose, toast }) {
  const url = `${window.location.origin}${window.location.pathname}#song-${song.id}`;
  const [copied, setCopied] = useState(false);

  const copyLink = () => {
    navigator.clipboard?.writeText(url).then(() => { setCopied(true); setTimeout(()=>setCopied(false),2000); toast("Link copied!","success"); }).catch(()=>toast("Copy failed"));
  };
  const shareNative = () => {
    if (navigator.share) navigator.share({ title: song.title, text: `Listen to "${song.title}" by ${song.artist} on MW Play`, url }).catch(()=>{});
  };
  const shareWhatsApp = () => window.open(`https://wa.me/?text=${encodeURIComponent(`🎵 "${song.title}" by ${song.artist} — Listen on MW Play: ${url}`)}`,"_blank");
  const shareFacebook = () => window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`,"_blank");
  const shareTwitter = () => window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(`🎵 "${song.title}" by ${song.artist} on MW Play`)}&url=${encodeURIComponent(url)}`,"_blank");
  const shareTelegram = () => window.open(`https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(`🎵 "${song.title}" by ${song.artist}`)}`,"_blank");

  return (
    <Modal onClose={onClose} maxWidth={380}>
      <ModalHeader title="Share Track" onClose={onClose}/>
      <div style={{display:"flex",gap:12,alignItems:"center",background:T.bg2,border:`1px solid ${T.border}`,borderRadius:10,padding:"10px 12px",marginBottom:20}}>
        <img src={song.cover} alt="" style={{width:44,height:44,borderRadius:7,objectFit:"cover",flexShrink:0}}/>
        <div style={{minWidth:0}}><div style={{color:T.text,fontSize:13,fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{song.title}</div><div style={{color:T.sub,fontSize:11}}>{song.artist}</div></div>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,marginBottom:18}}>
        {[
          {label:"WhatsApp",bg:"#25D366",icon:"💬",action:shareWhatsApp},
          {label:"Facebook",bg:"#1877F2",icon:"📘",action:shareFacebook},
          {label:"Twitter",bg:"#1DA1F2",icon:"🐦",action:shareTwitter},
          {label:"Telegram",bg:"#0088CC",icon:"✈️",action:shareTelegram},
        ].map(s=>(
          <button key={s.label} style={{background:s.bg+"18",border:`1px solid ${s.bg}44`,borderRadius:10,padding:"12px 6px",cursor:"pointer",fontFamily:"'DM Sans',sans-serif",textAlign:"center"}} onClick={s.action}>
            <div style={{fontSize:20,marginBottom:4}}>{s.icon}</div>
            <div style={{color:T.sub,fontSize:9,fontWeight:600}}>{s.label}</div>
          </button>
        ))}
      </div>
      {navigator.share && <Btn full onClick={shareNative} style={{marginBottom:10}}>📤 Share via Phone</Btn>}
      <div style={{display:"flex",gap:8,alignItems:"center",background:T.bg2,border:`1px solid ${T.border}`,borderRadius:8,padding:"8px 12px"}}>
        <input readOnly value={url} style={{...inp(),border:"none",background:"none",padding:0,fontSize:11,color:T.mute,flex:1}}/>
        <button style={{background:copied?T.green:T.blue,color:"#fff",border:"none",borderRadius:6,padding:"5px 12px",fontSize:11,fontWeight:700,cursor:"pointer",flexShrink:0,fontFamily:"'DM Sans',sans-serif"}} onClick={copyLink}>{copied?"Copied!":"Copy"}</button>
      </div>
    </Modal>
  );
}

// ─── DOWNLOAD MODAL ───────────────────────────────────────────────────────────
const DOWNLOAD_FEE = 500;
const DOWNLOAD_FEE_LABEL = "MWK 500";

function DownloadModal({ song, currentUser, onClose, toast, addNotif }) {
  const [paid, setPaid] = useState(false);
  const [showPay, setShowPay] = useState(false);

  const doDownload = () => {
    if (song.audioUrl) {
      const a = document.createElement("a");
      a.href = song.audioUrl;
      a.download = `${song.artist} - ${song.title}.mp3`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      toast("Download started! 🎵","success");
      addNotif&&addNotif("download",`Downloaded "${song.title}"`);
    } else {
      toast("Audio file not available for download","error");
    }
    onClose();
  };

  if (showPay) return (
    <PaymentModal amount={DOWNLOAD_FEE} amountLabel={DOWNLOAD_FEE_LABEL} purpose={`Download "${song.title}"`}
      onSuccess={txnId=>{ setPaid(true); setShowPay(false); doDownload(); }}
      onClose={()=>setShowPay(false)}/>
  );

  return (
    <Modal onClose={onClose} maxWidth={360}>
      <ModalHeader title="Download Track" onClose={onClose}/>
      <div style={{display:"flex",gap:12,alignItems:"center",background:T.bg2,border:`1px solid ${T.border}`,borderRadius:10,padding:"10px 12px",marginBottom:20}}>
        <img src={song.cover} alt="" style={{width:44,height:44,borderRadius:7,objectFit:"cover",flexShrink:0}}/>
        <div style={{minWidth:0}}>
          <div style={{color:T.text,fontSize:13,fontWeight:600}}>{song.title}</div>
          <div style={{color:T.sub,fontSize:11}}>{song.artist} · {song.duration||"—"}</div>
        </div>
      </div>
      <div style={{background:T.bg2,border:`1px solid ${T.border}`,borderRadius:8,padding:"12px 14px",marginBottom:18}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
          <span style={{color:T.sub,fontSize:12}}>Download fee</span>
          <span style={{color:T.orange,fontSize:14,fontWeight:700}}>{DOWNLOAD_FEE_LABEL}</span>
        </div>
        <div style={{color:T.mute,fontSize:10,lineHeight:1.5}}>One-time fee supports the artist directly. Payment via TNM Mpamba or Airtel Money.</div>
      </div>
      {!currentUser
        ? <p style={{color:T.orange,fontSize:12,textAlign:"center",marginBottom:14}}>Sign in to download tracks</p>
        : <Btn full color={T.green} onClick={()=>setShowPay(true)}>Pay {DOWNLOAD_FEE_LABEL} & Download</Btn>}
    </Modal>
  );
}

// ─── PLAYLISTS ────────────────────────────────────────────────────────────────
function usePlaylists(userId) {
  const key = "playlists_" + (userId || "guest");
  const [playlists, setPlaylists] = useState(() => LS.get(key, []));

  const save = (updated) => { setPlaylists(updated); LS.set(key, updated); };

  const createPlaylist = (name, description="") => {
    const pl = { id:genId(), name, description, cover:null, songs:[], createdAt:new Date().toISOString() };
    save([...playlists, pl]);
    return pl;
  };
  const deletePlaylist = (id) => save(playlists.filter(p=>p.id!==id));
  const renamePlaylist = (id, name, description) => save(playlists.map(p=>p.id===id?{...p,name,description}:p));
  const addSong = (playlistId, songId) => {
    save(playlists.map(p => p.id===playlistId ? { ...p, songs: p.songs.includes(songId)?p.songs:[...p.songs,songId] } : p));
  };
  const removeSong = (playlistId, songId) => {
    save(playlists.map(p => p.id===playlistId ? {...p, songs:p.songs.filter(s=>s!==songId)} : p));
  };
  const reorderSong = (playlistId, fromIdx, toIdx) => {
    save(playlists.map(p => {
      if (p.id !== playlistId) return p;
      const songs = [...p.songs];
      const [moved] = songs.splice(fromIdx, 1);
      songs.splice(toIdx, 0, moved);
      return {...p, songs};
    }));
  };

  return { playlists, createPlaylist, deletePlaylist, renamePlaylist, addSong, removeSong, reorderSong };
}

function AddToPlaylistModal({ song, playlists, onAdd, onCreateAndAdd, onClose, toast }) {
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);

  const handleCreate = () => {
    if (!newName.trim()) return;
    onCreateAndAdd(newName.trim(), song.id);
    toast(`Added to "${newName.trim()}" ✅`, "success");
    onClose();
  };

  return (
    <Modal onClose={onClose} maxWidth={360}>
      <ModalHeader title="Add to Playlist" onClose={onClose}/>
      {playlists.length > 0 && <>
        <p style={{color:T.sub,fontSize:11,marginBottom:10,letterSpacing:.5}}>YOUR PLAYLISTS</p>
        <div style={{display:"flex",flexDirection:"column",gap:6,marginBottom:18}}>
          {playlists.map(pl => (
            <button key={pl.id} style={{display:"flex",gap:12,alignItems:"center",background:T.bg2,border:`1px solid ${T.border}`,borderRadius:8,padding:"10px 12px",cursor:"pointer",textAlign:"left",width:"100%"}} onClick={()=>{ onAdd(pl.id,song.id); toast(`Added to "${pl.name}" ✅`,"success"); onClose(); }}>
              <div style={{width:36,height:36,borderRadius:6,background:T.bg,flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16}}>🎶</div>
              <div><div style={{color:T.text,fontSize:12,fontWeight:600}}>{pl.name}</div><div style={{color:T.mute,fontSize:10}}>{pl.songs.length} tracks</div></div>
            </button>
          ))}
        </div>
      </>}
      <p style={{color:T.sub,fontSize:11,marginBottom:10,letterSpacing:.5}}>CREATE NEW</p>
      <div style={{display:"flex",gap:8}}>
        <input style={{...inp(),flex:1}} value={newName} onChange={e=>setNewName(e.target.value)} placeholder="Playlist name..." onKeyDown={e=>e.key==="Enter"&&handleCreate()}/>
        <Btn onClick={handleCreate} disabled={!newName.trim()}>Create</Btn>
      </div>
    </Modal>
  );
}

function PlaylistsPage({ playlists, songs, onPlay, isPlaying, currentSong, onCreatePlaylist, onDeletePlaylist, onRenamePlaylist, onRemoveSong, onOpen, toast }) {
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [openPlaylist, setOpenPlaylist] = useState(null);
  const [editPlaylist, setEditPlaylist] = useState(null);

  const allSongsById = useMemo(() => Object.fromEntries(songs.map(s=>[s.id,s])), [songs]);

  if (openPlaylist) {
    const pl = playlists.find(p=>p.id===openPlaylist);
    if (!pl) { setOpenPlaylist(null); return null; }
    const plSongs = pl.songs.map(id=>allSongsById[id]).filter(Boolean);
    return (
      <section style={{padding:"0 0 20px"}}>
        <BackNav label="PLAYLISTS" onBack={()=>setOpenPlaylist(null)}/>
        <div style={{padding:"24px 16px 16px"}}>
          <div style={{display:"flex",gap:16,alignItems:"flex-end",marginBottom:20}}>
            <div style={{width:100,height:100,borderRadius:12,background:`linear-gradient(135deg,${T.blue},${T.purple})`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:36,flexShrink:0}}>🎶</div>
            <div style={{flex:1}}>
              <h1 style={{color:T.text,fontFamily:"'Syne',sans-serif",fontSize:20,fontWeight:700,marginBottom:4}}>{pl.name}</h1>
              {pl.description&&<p style={{color:T.sub,fontSize:12,marginBottom:6}}>{pl.description}</p>}
              <p style={{color:T.mute,fontSize:11}}>{plSongs.length} tracks</p>
            </div>
          </div>
          {plSongs.length>0&&<Btn onClick={()=>plSongs[0]&&onPlay(plSongs[0])} style={{marginBottom:16}}>▶ Play All</Btn>}
        </div>
        {plSongs.length===0
          ?<EmptyState title="Empty playlist" sub="Add songs from any track page."/>
          :<div style={{padding:"0 16px",display:"flex",flexDirection:"column",gap:6}}>
            {plSongs.map((s,i)=>(
              <div key={s.id} style={{display:"flex",gap:12,alignItems:"center",background:T.card,border:`1px solid ${currentSong?.id===s.id?T.blueBorder:T.border}`,borderRadius:8,padding:"10px 12px",cursor:"pointer"}} onClick={()=>onPlay(s)}>
                <span style={{color:T.mute,fontSize:12,width:18,flexShrink:0,textAlign:"center"}}>{i+1}</span>
                <img src={s.cover} alt="" style={{width:40,height:40,borderRadius:6,objectFit:"cover",flexShrink:0}}/>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{color:T.text,fontSize:13,fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{s.title}</div>
                  <div style={{color:T.sub,fontSize:11}}>{s.artist}</div>
                </div>
                {currentSong?.id===s.id&&<Eq active={isPlaying} size={13} color={T.blue}/>}
                <button style={{background:"none",border:"none",color:T.mute,cursor:"pointer",fontSize:14,padding:"0 4px"}} onClick={e=>{e.stopPropagation();onRemoveSong(pl.id,s.id);toast("Removed from playlist");}}>✕</button>
              </div>
            ))}
          </div>}
      </section>
    );
  }

  return (
    <section style={{padding:"24px 16px"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
        <h2 style={{color:T.text,fontFamily:"'Syne',sans-serif",fontSize:17}}>Playlists</h2>
        <Btn onClick={()=>setShowCreate(true)} style={{padding:"7px 14px",fontSize:11}}>+ New</Btn>
      </div>

      {showCreate&&(
        <div style={{background:T.bg1,border:`1px solid ${T.border}`,borderRadius:12,padding:16,marginBottom:18}}>
          <Field label="Playlist name"><input style={inp()} value={newName} onChange={e=>setNewName(e.target.value)} placeholder="e.g. Chill Vibes" autoFocus/></Field>
          <Field label="Description (optional)"><input style={inp()} value={newDesc} onChange={e=>setNewDesc(e.target.value)} placeholder="What's this playlist about?"/></Field>
          <div style={{display:"flex",gap:8}}>
            <BtnGhost flex={1} onClick={()=>{setShowCreate(false);setNewName("");setNewDesc("");}}>Cancel</BtnGhost>
            <Btn flex={2} onClick={()=>{ if(!newName.trim())return; onCreatePlaylist(newName.trim(),newDesc.trim()); setShowCreate(false);setNewName("");setNewDesc(""); toast("Playlist created 🎶","success"); }} disabled={!newName.trim()}>Create Playlist</Btn>
          </div>
        </div>
      )}

      {playlists.length===0&&!showCreate
        ?<EmptyState title="No playlists yet" sub="Create a playlist to organise your favourite tracks." icon={<span style={{fontSize:24}}>🎶</span>} onCTA={()=>setShowCreate(true)} ctaLabel="Create First Playlist"/>
        :<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(145px,1fr))",gap:12}}>
          {playlists.map(pl=>{
            const cover=pl.songs.map(id=>allSongsById[id]).find(s=>s?.cover)?.cover;
            return(
              <div key={pl.id} className="mwcard" style={{background:T.card,borderRadius:10,overflow:"hidden",border:`1px solid ${T.border}`,cursor:"pointer"}} onClick={()=>setOpenPlaylist(pl.id)}>
                <div style={{width:"100%",aspectRatio:"1",background:cover?"none":`linear-gradient(135deg,${T.blue}44,${T.purple}44)`,display:"flex",alignItems:"center",justifyContent:"center",overflow:"hidden"}}>
                  {cover?<img src={cover} style={{width:"100%",height:"100%",objectFit:"cover"}} alt=""/>:<span style={{fontSize:36}}>🎶</span>}
                </div>
                <div style={{padding:"9px 8px 10px"}}>
                  <div style={{color:T.text,fontSize:12,fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{pl.name}</div>
                  <div style={{color:T.mute,fontSize:10,marginTop:2}}>{pl.songs.length} tracks</div>
                  <button style={{background:"none",border:"none",color:T.red,fontSize:10,cursor:"pointer",padding:"4px 0",display:"block"}} onClick={e=>{e.stopPropagation();onDeletePlaylist(pl.id);toast("Playlist deleted");}}>Delete</button>
                </div>
              </div>
            );
          })}
        </div>}
    </section>
  );
}


// ─── ALBUM UPLOADS ────────────────────────────────────────────────────────────
function AlbumUploadModal({ onClose, currentUser, onAlbumUpload, toast }) {
  const [step, setStep] = useState(1); // 1=info, 2=tracks, 3=payment
  const [albumInfo, setAlbumInfo] = useState({ title:"", genre:currentUser.genre||"Afrobeat", year:new Date().getFullYear().toString(), description:"" });
  const [cover, setCover] = useState(null);
  const [tracks, setTracks] = useState([{ id:genId(), title:"", file:null, duration:null, lyrics:"", isExplicit:false }]);
  const [showPay, setShowPay] = useState(false);
  const totalFee = tracks.length * UPLOAD_FEE;

  const upAlbum = k => v => setAlbumInfo(a=>({...a,[k]:v}));
  const upTrack = (id,k,v) => setTracks(ts=>ts.map(t=>t.id===id?{...t,[k]:v}:t));
  const addTrack = () => setTracks(ts=>[...ts,{id:genId(),title:"",file:null,duration:null,lyrics:"",isExplicit:false}]);
  const removeTrack = id => tracks.length>1&&setTracks(ts=>ts.filter(t=>t.id!==id));

  const handleTrackFile = (id, file) => {
    if (!file) return;
    upTrack(id,"file",file);
    const au = new Audio(URL.createObjectURL(file));
    au.onloadedmetadata = () => upTrack(id,"duration",au.duration);
  };

  const submit = async txnId => {
    const albumId = genId();
    toast(`Uploading "${albumInfo.title}"…`,"info");
    try{
      const newSongs=[];
      for(let i=0;i<tracks.length;i++){
        const t=tracks[i];
        const id=genId();
        const {audioUrl,coverUrl}=await uploadTrackAssets(currentUser,t.file,cover,`${albumId}-${id}`);
        const song={
          id, albumId, albumName: albumInfo.title,
          title: t.title||`Track ${i+1}`, artist: currentUser.name, artistId: currentUser.id,
          genre: albumInfo.genre, cover: coverUrl||`https://picsum.photos/seed/${albumId}/300/300`,
          audioUrl: audioUrl||null,
          duration: t.duration?fmtTime(t.duration):"—", durationSecs:t.duration?Math.round(t.duration):0,
          lyrics: t.lyrics, isExplicit: t.isExplicit,
          plays:0, likes:0, status:"Pending", trending:false,
          paymentRef:txnId, uploadedAt:new Date().toISOString(),
          release:new Date().toISOString().slice(0,10), trackNumber:i+1,
        };
        if(isSupabaseReady){
          const dbRow=songToDb(song);delete dbRow.id;
          const row=await db.insertSong(dbRow);
          newSongs.push(songFromDb(row));
        }else{
          newSongs.push(song);
        }
      }
      onAlbumUpload(newSongs);
      toast(`Album "${albumInfo.title}" submitted for review! 🎵`,"success");
    }catch(e){
      console.error("Album upload error:",e);
      toast("Upload failed: "+(e.message||"please try again"),"error");
    }
    onClose();
  };

  if (showPay) return (
    <PaymentModal amount={totalFee} amountLabel={`MWK ${totalFee.toLocaleString()}`}
      purpose={`Upload "${albumInfo.title}" (${tracks.length} tracks)`}
      onSuccess={submit} onClose={()=>setShowPay(false)}/>
  );

  return (
    <Modal onClose={onClose} maxWidth={520}>
      <ModalHeader title="Upload Album / EP" sub={`Step ${step} of 3`} onClose={onClose}/>
      <div style={{display:"flex",gap:3,marginBottom:22}}>
        {[1,2,3].map(s=><div key={s} style={{flex:1,height:3,borderRadius:2,background:step>=s?s===1?T.blue:s===2?T.orange:T.green:T.mute,transition:"background .3s"}}/>)}
      </div>

      {step===1&&<>
        <Field label="Album / EP title"><input style={inp()} value={albumInfo.title} onChange={e=>upAlbum("title")(e.target.value)} placeholder="Album name" autoFocus/></Field>
        <Field label="Genre"><select style={{...inp(),appearance:"none"}} value={albumInfo.genre} onChange={e=>upAlbum("genre")(e.target.value)}>{GENRES.map(g=><option key={g.name}>{g.name}</option>)}</select></Field>
        <Field label="Release year"><input style={inp()} value={albumInfo.year} onChange={e=>upAlbum("year")(e.target.value)} placeholder="2024"/></Field>
        <Field label="Description (optional)"><textarea style={{...inp(),height:70,resize:"none"}} value={albumInfo.description} onChange={e=>upAlbum("description")(e.target.value)} placeholder="About this album..."/></Field>
        <Field label="Album cover art">
          <label style={{border:`1px dashed ${T.border2}`,borderRadius:8,cursor:"pointer",overflow:"hidden",display:"block"}}>
            <input type="file" accept="image/*" style={{display:"none"}} onChange={e=>{const f=e.target.files[0];if(f){const r=new FileReader();r.onload=ev=>setCover(ev.target.result);r.readAsDataURL(f);}}}/>
            {cover?<img src={cover} style={{width:"100%",maxHeight:140,objectFit:"cover",display:"block"}} alt=""/>:<div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:8,padding:"24px",color:T.mute}}><span style={{fontSize:22}}>🖼</span><span style={{fontSize:12}}>Upload cover art</span></div>}
          </label>
        </Field>
        <Btn full onClick={()=>{if(!albumInfo.title.trim()){toast("Album title required","error");return;}setStep(2);}}>Continue →</Btn>
      </>}

      {step===2&&<>
        <p style={{color:T.sub,fontSize:12,marginBottom:14,lineHeight:1.5}}>Add tracks to your album. Each track costs {UPLOAD_FEE_LABEL}.</p>
        <div style={{display:"flex",flexDirection:"column",gap:10,marginBottom:14,maxHeight:340,overflowY:"auto"}}>
          {tracks.map((t,i)=>(
            <div key={t.id} style={{background:T.bg2,border:`1px solid ${T.border}`,borderRadius:10,padding:"12px"}}>
              <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:8}}>
                <span style={{color:T.mute,fontSize:12,width:20,flexShrink:0,textAlign:"center"}}>{i+1}</span>
                <input style={{...inp(),flex:1,fontSize:12}} value={t.title} onChange={e=>upTrack(t.id,"title",e.target.value)} placeholder={`Track ${i+1} title`}/>
                <button style={{background:"none",border:"none",color:T.red,cursor:"pointer",fontSize:16,padding:"0 4px"}} onClick={()=>removeTrack(t.id)}>✕</button>
              </div>
              <label style={{border:`1px dashed ${t.file?T.greenBorder:T.border}`,borderRadius:7,display:"block",cursor:"pointer",marginBottom:6}}>
                <input type="file" accept="audio/*" style={{display:"none"}} onChange={e=>handleTrackFile(t.id,e.target.files[0])}/>
                <div style={{padding:"8px 12px",display:"flex",alignItems:"center",gap:8}}>
                  <span style={{color:t.file?T.green:T.mute,fontSize:11}}>{t.file?`✓ ${t.file.name}`:"+ Add audio file"}</span>
                  {t.duration&&<span style={{color:T.mute,fontSize:10,marginLeft:"auto"}}>{fmtTime(t.duration)}</span>}
                </div>
              </label>
              <div style={{display:"flex",gap:8,alignItems:"center"}}>
                <input type="checkbox" checked={t.isExplicit} onChange={e=>upTrack(t.id,"isExplicit",e.target.checked)} style={{accentColor:T.orange}}/>
                <label style={{color:T.mute,fontSize:11}}>Explicit</label>
              </div>
            </div>
          ))}
        </div>
        <BtnGhost onClick={addTrack} style={{width:"100%",marginBottom:12}}>+ Add Track</BtnGhost>
        <div style={{background:T.bg2,border:`1px solid ${T.orangeBorder}`,borderRadius:8,padding:"10px 14px",marginBottom:14}}>
          <div style={{display:"flex",justifyContent:"space-between"}}><span style={{color:T.sub,fontSize:12}}>{tracks.length} tracks × {UPLOAD_FEE_LABEL}</span><span style={{color:T.orange,fontWeight:700,fontSize:13}}>MWK {totalFee.toLocaleString()}</span></div>
        </div>
        <div style={{display:"flex",gap:8}}><BtnGhost flex={1} onClick={()=>setStep(1)}>← Back</BtnGhost><Btn flex={2} onClick={()=>setStep(3)}>Continue →</Btn></div>
      </>}

      {step===3&&<>
        <div style={{background:T.bg2,border:`1px solid ${T.border}`,borderRadius:10,padding:"14px",marginBottom:18}}>
          {cover&&<img src={cover} style={{width:"100%",maxHeight:120,objectFit:"cover",borderRadius:7,marginBottom:12,display:"block"}} alt=""/>}
          <div style={{color:T.text,fontSize:15,fontWeight:700,marginBottom:2}}>{albumInfo.title}</div>
          <div style={{color:T.sub,fontSize:12}}>{albumInfo.genre} · {tracks.length} tracks</div>
          <div style={{color:T.mute,fontSize:11,marginTop:2}}>{currentUser.name}</div>
        </div>
        <div style={{textAlign:"center",padding:"14px 0",borderTop:`1px solid ${T.border}`,borderBottom:`1px solid ${T.border}`,marginBottom:18}}>
          <div style={{color:T.mute,fontSize:10,letterSpacing:1,marginBottom:4}}>TOTAL PAYMENT</div>
          <div style={{color:T.text,fontFamily:"'Syne',sans-serif",fontSize:28,fontWeight:700}}>MWK {totalFee.toLocaleString()}</div>
          <div style={{color:T.mute,fontSize:11,marginTop:3}}>{tracks.length} tracks × {UPLOAD_FEE_LABEL}</div>
        </div>
        <div style={{display:"flex",gap:8}}><BtnGhost flex={1} onClick={()=>setStep(2)}>← Back</BtnGhost><Btn flex={2} color={T.green} onClick={()=>setShowPay(true)}>Pay & Submit Album</Btn></div>
      </>}
    </Modal>
  );
}

// ─── ARTIST VERIFICATION ──────────────────────────────────────────────────────
function VerificationModal({ currentUser, onClose, onSubmit, toast }) {
  const [form, setForm] = useState({ fullName:"", nationalId:"", phone:"", socialLink:"", reason:"", hasLabel:false, labelName:"" });
  const [idDoc, setIdDoc] = useState(null);
  const [step, setStep] = useState(1);
  const [submitted, setSubmitted] = useState(false);
  const up = (k,v) => setForm(f=>({...f,[k]:v}));

  const submit = () => {
    const request = { ...form, idDoc: idDoc?.name||null, artistId: currentUser.id, status:"Pending", submittedAt: new Date().toISOString(), id: genId() };
    onSubmit(request);
    setSubmitted(true);
    toast("Verification request submitted! ✅","success");
  };

  if (submitted) return (
    <Modal onClose={onClose} maxWidth={360}>
      <div style={{textAlign:"center",padding:"20px 0"}}>
        <div style={{fontSize:48,marginBottom:16}}>🏅</div>
        <h3 style={{color:T.text,fontFamily:"'Syne',sans-serif",fontSize:20,marginBottom:8}}>Request submitted!</h3>
        <p style={{color:T.sub,fontSize:13,lineHeight:1.7,marginBottom:20}}>We'll review your verification request within <strong style={{color:T.text}}>3–5 business days</strong> and notify you by email.</p>
        <div style={{background:T.bg2,border:`1px solid ${T.border}`,borderRadius:8,padding:"10px 14px",marginBottom:20}}>
          <div style={{color:T.mute,fontSize:10,marginBottom:3}}>BENEFITS OF VERIFICATION</div>
          {["✅ Blue verified badge","🎵 Priority in search results","📊 Advanced analytics","💰 Monetization features"].map(b=><div key={b} style={{color:T.sub,fontSize:11,padding:"3px 0"}}>{b}</div>)}
        </div>
        <Btn full onClick={onClose}>Done</Btn>
      </div>
    </Modal>
  );

  return (
    <Modal onClose={onClose} maxWidth={460}>
      <ModalHeader title="Artist Verification" sub={`Step ${step} of 2`} onClose={onClose}/>
      <div style={{display:"flex",gap:3,marginBottom:22}}>
        {[1,2].map(s=><div key={s} style={{flex:1,height:3,borderRadius:2,background:step>=s?T.blue:T.mute,transition:"background .3s"}}/>)}
      </div>

      {step===1&&<>
        <div style={{background:`${T.blue}0E`,border:`1px solid ${T.blueBorder}`,borderRadius:8,padding:"10px 14px",marginBottom:18}}>
          <p style={{color:T.sub,fontSize:12,lineHeight:1.6}}>Verification confirms you are the real artist. You'll receive a <strong style={{color:T.blue}}>verified badge</strong> on your profile.</p>
        </div>
        <Field label="Full legal name"><input style={inp()} value={form.fullName} onChange={e=>up("fullName",e.target.value)} placeholder="As on your ID"/></Field>
        <Field label="Phone number"><input style={inp()} value={form.phone} onChange={e=>up("phone",e.target.value)} placeholder="+265 8XX XXX XXX" type="tel"/></Field>
        <Field label="National ID / Passport"><input style={inp()} value={form.nationalId} onChange={e=>up("nationalId",e.target.value)} placeholder="ID number"/></Field>
        <Field label="ID document (photo)" hint="Photo of your national ID, passport, or driver's licence">
          <label style={{border:`1px dashed ${idDoc?T.greenBorder:T.border2}`,borderRadius:8,cursor:"pointer",display:"block"}}>
            <input type="file" accept="image/*,.pdf" style={{display:"none"}} onChange={e=>setIdDoc(e.target.files[0])}/>
            <div style={{padding:"12px 14px",display:"flex",alignItems:"center",gap:8}}>
              <span style={{fontSize:16}}>{idDoc?"📄":"📎"}</span>
              <span style={{color:idDoc?T.green:T.mute,fontSize:12}}>{idDoc?idDoc.name:"Upload ID document"}</span>
            </div>
          </label>
        </Field>
        <Btn full onClick={()=>{if(!form.fullName||!form.phone||!form.nationalId){toast("Fill all required fields","error");return;}setStep(2);}}>Continue →</Btn>
      </>}

      {step===2&&<>
        <Field label="Social media link" hint="Your official Facebook, Instagram, or TikTok profile"><input style={inp()} value={form.socialLink} onChange={e=>up("socialLink",e.target.value)} placeholder="https://instagram.com/yourname"/></Field>
        <Field label="Why do you want verification?"><textarea style={{...inp(),height:80,resize:"none"}} value={form.reason} onChange={e=>up("reason",e.target.value)} placeholder="Tell us about yourself and your music career..."/></Field>
        <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:14}}>
          <input type="checkbox" checked={form.hasLabel} onChange={e=>up("hasLabel",e.target.checked)} style={{accentColor:T.blue}}/>
          <label style={{color:T.sub,fontSize:12}}>I'm signed to a record label</label>
        </div>
        {form.hasLabel&&<Field label="Label name"><input style={inp()} value={form.labelName} onChange={e=>up("labelName",e.target.value)} placeholder="Record label name"/></Field>}
        <div style={{display:"flex",gap:8}}>
          <BtnGhost flex={1} onClick={()=>setStep(1)}>← Back</BtnGhost>
          <Btn flex={2} color={T.blue} onClick={submit}>Submit for Verification</Btn>
        </div>
      </>}
    </Modal>
  );
}

// ─── RECOMMENDATIONS ──────────────────────────────────────────────────────────
function getRecommendations(currentUser, songs, currentSong, limit=8) {
  const approved = songs.filter(s=>s.status==="Approved");
  if (!currentUser && !currentSong) return [...approved].sort((a,b)=>b.plays-a.plays).slice(0,limit);

  const likedIds = new Set(currentUser?.liked||[]);
  const likedSongs = approved.filter(s=>likedIds.has(s.id));
  const likedGenres = [...new Set(likedSongs.map(s=>s.genre))];
  const likedArtists = [...new Set(likedSongs.map(s=>s.artistId))];

  const scored = approved
    .filter(s=>s.id!==currentSong?.id && !likedIds.has(s.id))
    .map(s=>{
      let score = s.plays * 0.1;
      if (likedGenres.includes(s.genre)) score += 40;
      if (likedArtists.includes(s.artistId)) score += 30;
      if (s.trending) score += 20;
      if (currentSong?.genre===s.genre) score += 25;
      if (currentSong?.artistId===s.artistId) score += 20;
      return {...s, score};
    })
    .sort((a,b)=>b.score-a.score);

  return scored.slice(0,limit);
}

function RecommendationsSection({ currentUser, songs, currentSong, onPlay, isPlaying, onOpen }) {
  const recs = useMemo(()=>getRecommendations(currentUser,songs,currentSong,8),[currentUser,songs,currentSong]);
  if (recs.length === 0) return null;
  return (
    <section style={{padding:"24px 16px 0"}}>
      <h2 style={{color:T.text,fontFamily:"'Syne',sans-serif",fontSize:16,fontWeight:700,marginBottom:4}}>
        ✨ {currentUser?.liked?.length>0?"Recommended For You":"Popular Right Now"}
      </h2>
      <p style={{color:T.mute,fontSize:11,marginBottom:14}}>
        {currentUser?.liked?.length>0?"Based on songs you've liked":"Trending across MW Play"}
      </p>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(148px,1fr))",gap:12}}>
        {recs.map(s=>(
          <div key={s.id} className="mwcard" style={{background:T.card,borderRadius:10,overflow:"hidden",border:`1px solid ${currentSong?.id===s.id?T.blueBorder:T.border}`,cursor:"pointer"}} onClick={()=>onPlay(s)}>
            <div style={{position:"relative"}}>
              <img src={s.cover} alt="" style={{width:"100%",aspectRatio:"1",objectFit:"cover",display:"block"}}/>
              <div className="mwoverlay" style={{position:"absolute",inset:0,background:"rgba(0,0,0,.55)",display:"flex",alignItems:"center",justifyContent:"center",opacity:0,transition:"opacity .18s"}}>
                <div style={{width:40,height:40,borderRadius:"50%",background:T.blue,display:"flex",alignItems:"center",justifyContent:"center"}}><svg width="13" height="13" viewBox="0 0 24 24" fill="#fff" style={{marginLeft:2}}><polygon points="5 3 19 12 5 21 5 3"/></svg></div>
              </div>
              {currentSong?.id===s.id&&<div style={{position:"absolute",top:7,right:7}}><Eq active={isPlaying} size={12} color={T.blue}/></div>}
            </div>
            <div style={{padding:"9px 8px 8px"}}>
              <div style={{color:T.text,fontSize:12,fontWeight:600,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",cursor:"pointer"}} onClick={e=>{e.stopPropagation();onOpen(s);}}>{s.title}</div>
              <div style={{color:T.sub,fontSize:11,marginTop:1}}>{s.artist}</div>
              <div style={{color:T.mute,fontSize:10,marginTop:3}}>{fmtNum(s.plays)} plays</div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}


// ─── AUTH (VERIFY EMAIL + LOGIN/SIGNUP) ───────────────────────────────────────
function VerifyEmailScreen({email,onVerified,onResend,onBack}){
  const [code,setCode]=useState(["","","","","","","",""]);
  const [error,setError]=useState("");
  const [verifying,setVerifying]=useState(false);
  const [countdown,setCountdown]=useState(0);
  const inputs=useRef([]);
  useEffect(()=>{if(countdown>0){const t=setTimeout(()=>setCountdown(c=>c-1),1000);return()=>clearTimeout(t);}},[countdown]);

  const submitCode=async(fullCode)=>{
    if(verifying)return;
    setVerifying(true);setError("");
    try{
      if(isSupabaseReady){
        await authVerifyOtp({email,token:fullCode});
        setTimeout(()=>onVerified(),300);
      }else{
        // Supabase not configured — show guidance
        setError("Supabase not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env");
      }
    }catch(e){
      setError(e.message||"Invalid code. Please check your email and try again.");
    }finally{setVerifying(false);}
  };

  const handleChange=(val,idx)=>{
    if(!/^\d?$/.test(val))return;
    const next=[...code];next[idx]=val;setCode(next);
    if(val&&idx<code.length-1)inputs.current[idx+1]?.focus();
    if(next.every(c=>c))submitCode(next.join(""));
  };
  const handleKey=(e,idx)=>{if(e.key==="Backspace"&&!code[idx]&&idx>0)inputs.current[idx-1]?.focus();};
  const handlePaste=(e,idx)=>{
    const text=e.clipboardData.getData("text").replace(/\D/g,"");
    if(!text)return;
    e.preventDefault();
    const next=[...code];
    for(let i=0;i<text.length&&idx+i<next.length;i++)next[idx+i]=text[i];
    setCode(next);
    const lastIdx=Math.min(idx+text.length,next.length)-1;
    inputs.current[lastIdx]?.focus();
    if(next.every(c=>c))submitCode(next.join(""));
  };
  return(
    <div style={{minHeight:"100vh",background:T.bg,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
      <div style={{width:"100%",maxWidth:380,background:T.bg1,border:`1px solid ${T.border}`,borderRadius:20,padding:"40px 20px"}}>
        <div style={{marginBottom:28,display:"flex",justifyContent:"center"}}><Logo/></div>
        <div style={{width:52,height:52,borderRadius:"50%",border:`1px solid ${T.blueBorder}`,display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 22px",background:T.blueDim,fontSize:22}}>📧</div>
        <h2 style={{color:T.text,fontFamily:"'Syne',sans-serif",fontSize:20,textAlign:"center",marginBottom:4}}>Verify your email</h2>
        <p style={{color:T.blue,fontSize:13,fontWeight:600,textAlign:"center",marginBottom:28}}>{email}</p>
        <div style={{display:"flex",gap:5,justifyContent:"center",marginBottom:20}}>
          {code.map((c,i)=>(
            <input key={i} ref={el=>inputs.current[i]=el} maxLength={1} value={c} inputMode="numeric"
              onChange={e=>handleChange(e.target.value,i)} onKeyDown={e=>handleKey(e,i)} onPaste={e=>handlePaste(e,i)}
              style={{width:34,height:48,textAlign:"center",background:T.bg2,border:`1px solid ${c?T.blue:T.border}`,borderRadius:10,color:T.text,fontSize:17,fontWeight:700,outline:"none",transition:"border-color .15s"}}/>
          ))}
        </div>
        {error&&<p style={{color:T.orange,fontSize:12,textAlign:"center",marginBottom:10}}>{error}</p>}
        {verifying&&<p style={{color:T.blue,fontSize:12,textAlign:"center",marginBottom:10}}>Verifying…</p>}
        <p style={{color:T.mute,fontSize:12,textAlign:"center",marginBottom:4}}>
          Didn't receive it?{" "}
          <button style={{background:"none",border:"none",color:countdown>0?T.mute:T.blue,cursor:countdown>0?"default":"pointer",fontSize:12,fontWeight:600}} onClick={countdown===0?()=>{setCountdown(60);onResend();}:undefined}>
            {countdown>0?`Resend in ${countdown}s`:"Resend"}
          </button>
        </p>
        {onBack&&<button style={{display:"block",margin:"12px auto 0",background:"none",border:"none",color:T.mute,fontSize:12,cursor:"pointer"}} onClick={onBack}>← Back</button>}
        <p style={{color:T.mute,fontSize:11,textAlign:"center",marginTop:10}}>Check your email — an 8-digit code was sent to <strong style={{color:T.sub}}>{email}</strong></p>
      </div>
    </div>
  );
}

function AuthModal({mode:initMode,onClose,onAuth,registeredUsers}){
  const [mode,setMode]=useState(initMode||"login");
  const [form,setForm]=useState({name:"",email:"",password:"",confirmPassword:"",role:"listener",genre:"Afrobeat",country:"",bio:""});
  const [error,setError]=useState("");
  const [loading,setLoading]=useState(false);
  const [awaitVerify,setAwaitVerify]=useState(false);
  const [showPw,setShowPw]=useState(false);
  const up=(k,v)=>setForm(f=>({...f,[k]:v}));

  const handleSubmit=async()=>{
    setError("");
    if(mode==="signup"){
      if(!form.name.trim())return setError("Name is required.");
      if(!form.email.includes("@"))return setError("Enter a valid email.");
      if(form.password.length<6)return setError("Password must be at least 6 characters.");
      if(form.password!==form.confirmPassword)return setError("Passwords don't match.");
      if(form.role==="artist"&&!form.country.trim())return setError("Country is required for artists.");
      setLoading(true);
      try{
        if(isSupabaseReady){
          const data=await authSignUp({
            email:form.email,password:form.password,
            name:form.name,role:form.role,genre:form.genre,
            country:form.country,bio:form.bio,
          });
          if(data.session&&data.user){
            // Email confirmation is OFF — account is active immediately
            const newUser={
              id:data.user.id,name:form.name,email:form.email,
              role:form.role,genre:form.genre,country:form.country,bio:form.bio,
              followers:0,following:[],liked:[],verified:false,
              joined:new Date().getFullYear().toString(),avatar:null,joinedDate:new Date().toISOString(),
              verificationStatus:null,
            };
            onAuth(newUser,true);onClose();
          }else{
            // Email confirmation required — show code-entry screen
            setAwaitVerify(true);
          }
        }else{
          // Supabase not configured — show error
          setError("Supabase not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env");
        }
      }catch(e){
        setError(e.message||"Sign up failed. Try again.");
      }finally{setLoading(false);}
    }else{
      if(!form.email||!form.password)return setError("Fill in all fields.");
      setLoading(true);
      try{
        if(isSupabaseReady){
          const {user,session}=await authSignIn({email:form.email,password:form.password});
          // Build a profile-shaped object for the app state
          const profile={
            id:user.id,
            name:user.user_metadata?.name||form.email.split("@")[0],
            email:user.email,
            role:user.user_metadata?.role||"listener",
            genre:user.user_metadata?.genre,
            country:user.user_metadata?.country,
            bio:user.user_metadata?.bio,
            followers:0,following:[],liked:[],verified:false,
            joined:new Date(user.created_at).getFullYear().toString(),
            avatar:null,joinedDate:user.created_at,
            verificationStatus:null,
          };
          onAuth(profile);onClose();
        }else{
          // Fallback: match against in-memory users (localStorage mode)
          const user=registeredUsers.find(u=>u.email===form.email&&u.password===form.password);
          if(!user)return setError("Invalid email or password.");
          onAuth(user);onClose();
        }
      }catch(e){
        setError(e.message||"Invalid email or password.");
      }finally{setLoading(false);}
    }
  };

  if(awaitVerify)return(
    <div style={{position:"fixed",inset:0,zIndex:600}}>
      <VerifyEmailScreen email={form.email}
        onVerified={async()=>{
          // After OTP confirmed, Supabase session is active — sign in to get session
          try{
            const {user}=await authSignIn({email:form.email,password:form.password});
            const newUser={
              id:user.id,name:form.name,email:form.email,
              role:form.role,genre:form.genre,country:form.country,bio:form.bio,
              followers:0,following:[],liked:[],verified:false,
              joined:new Date().getFullYear().toString(),avatar:null,joinedDate:new Date().toISOString(),
              verificationStatus:null,
            };
            onAuth(newUser,true);onClose();
          }catch(e){
            // If auto-signin fails, just create the user object from form data
            const newUser={
              id:genId(),name:form.name,email:form.email,
              role:form.role,genre:form.genre,country:form.country,bio:form.bio,
              followers:0,following:[],liked:[],verified:false,
              joined:new Date().getFullYear().toString(),avatar:null,joinedDate:new Date().toISOString(),
              verificationStatus:null,
            };
            onAuth(newUser,true);onClose();
          }
        }}
        onResend={async()=>{
          try{ await authResendOtp({email:form.email}); }catch(e){ console.warn("Resend failed",e); }
        }}
        onBack={()=>setAwaitVerify(false)}/>
    </div>
  );

  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.88)",zIndex:500,display:"flex",alignItems:"center",justifyContent:"center",backdropFilter:"blur(10px)",padding:16}} onClick={onClose}>
      <div style={{background:T.bg1,border:`1px solid ${T.border}`,borderRadius:20,padding:"32px 26px",width:"100%",maxWidth:400,maxHeight:"92vh",overflowY:"auto"}} onClick={e=>e.stopPropagation()}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:22}}>
          <div><Logo/><h2 style={{color:T.text,fontFamily:"'Syne',sans-serif",fontSize:19,marginTop:12}}>{mode==="login"?"Welcome back":"Create account"}</h2></div>
          <button onClick={onClose} style={{background:"none",border:"none",color:T.mute,fontSize:20,cursor:"pointer"}}>✕</button>
        </div>
        {mode==="signup"&&(
          <div style={{display:"flex",gap:4,background:T.bg2,padding:4,borderRadius:10,border:`1px solid ${T.border}`,marginBottom:16}}>
            {[["listener","🎧 Listener"],["artist","🎤 Artist"]].map(([v,l])=>(
              <button key={v} style={{flex:1,padding:"8px",borderRadius:7,border:"none",cursor:"pointer",fontSize:12,fontWeight:700,background:form.role===v?T.blue:"transparent",color:form.role===v?"#fff":T.sub,transition:"all .18s",fontFamily:"'DM Sans',sans-serif"}} onClick={()=>up("role",v)}>{l}</button>
            ))}
          </div>
        )}
        {mode==="signup"&&<Field label={form.role==="artist"?"Stage name":"Display name"}><input style={inp()} value={form.name} onChange={e=>up("name",e.target.value)} placeholder="Your name" autoFocus/></Field>}
        <Field label="Email"><input style={inp()} type="email" value={form.email} onChange={e=>up("email",e.target.value)} placeholder="you@example.com"/></Field>
        <Field label="Password">
          <div style={{position:"relative"}}>
            <input style={inp({paddingRight:38})} type={showPw?"text":"password"} value={form.password} onChange={e=>up("password",e.target.value)} placeholder="••••••••"/>
            <button style={{position:"absolute",right:10,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",color:T.mute,cursor:"pointer",fontSize:11}} onClick={()=>setShowPw(s=>!s)}>{showPw?"Hide":"Show"}</button>
          </div>
        </Field>
        {mode==="signup"&&<Field label="Confirm password"><input style={inp()} type="password" value={form.confirmPassword} onChange={e=>up("confirmPassword",e.target.value)} placeholder="••••••••"/></Field>}
        {mode==="signup"&&form.role==="artist"&&(<>
          <Field label="Primary genre"><select style={{...inp(),appearance:"none"}} value={form.genre} onChange={e=>up("genre",e.target.value)}>{GENRES.map(g=><option key={g.name}>{g.name}</option>)}</select></Field>
          <Field label="Country"><input style={inp()} value={form.country} onChange={e=>up("country",e.target.value)} placeholder="e.g. Malawi"/></Field>
          <Field label="Bio (optional)"><textarea style={{...inp(),height:66,resize:"none"}} value={form.bio} onChange={e=>up("bio",e.target.value)} placeholder="Tell us about yourself..."/></Field>
        </>)}
        {error&&<div style={{background:T.orangeDim,border:`1px solid ${T.orangeBorder}`,borderRadius:8,padding:"9px 12px",marginBottom:14,color:T.orange,fontSize:12}}>{error}</div>}
        <Btn full loading={loading} onClick={handleSubmit}>{loading?"Please wait...":mode==="login"?"Sign in":"Create account"}</Btn>
        <p style={{textAlign:"center",color:T.sub,fontSize:12,marginTop:16}}>
          {mode==="login"?"New here? ":"Have an account? "}
          <button style={{background:"none",border:"none",color:T.blue,cursor:"pointer",fontSize:12,fontWeight:600}} onClick={()=>{setMode(m=>m==="login"?"signup":"login");setError("");}}>
            {mode==="login"?"Create account":"Sign in"}
          </button>
        </p>
      </div>
    </div>
  );
}


// ─── UPLOAD MODAL (SINGLE TRACK) ─────────────────────────────────────────────
function UploadModal({onClose,currentUser,onUpload,toast}){
  const [step,setStep]=useState(1);
  const [form,setForm]=useState({title:"",genre:currentUser.genre||"Afrobeat",release:"",lyrics:"",albumName:"",isExplicit:false});
  const [cover,setCover]=useState(null);
  const [audio,setAudio]=useState(null);
  const [audioDuration,setAudioDuration]=useState(null);
  const [audioUrl,setAudioUrl]=useState(null);
  const [err,setErr]=useState("");
  const [showPay,setShowPay]=useState(false);
  const up=(k,v)=>{setForm(f=>({...f,[k]:v}));setErr("");};

  const handleAudioChange=file=>{
    if(!file)return;
    setAudio(file);
    const url=URL.createObjectURL(file);setAudioUrl(url);
    const au=new Audio(url);au.onloadedmetadata=()=>setAudioDuration(au.duration);
  };

  if(showPay)return(
    <PaymentModal amount={UPLOAD_FEE} amountLabel={UPLOAD_FEE_LABEL} purpose={`Upload "${form.title}"`}
      onSuccess={async txnId=>{
        const id=genId();
        toast("Uploading your track…","info");
        try{
          const {audioUrl,coverUrl}=await uploadTrackAssets(currentUser,audio,cover,id);
          const song={id,title:form.title,artist:currentUser.name,artistId:currentUser.id,
            genre:form.genre,plays:0,likes:0,albumName:form.albumName,isExplicit:form.isExplicit,
            cover:coverUrl||`https://picsum.photos/seed/${id}/300/300`,
            audioUrl:audioUrl||null,duration:audioDuration?fmtTime(audioDuration):"—",
            durationSecs:audioDuration?Math.round(audioDuration):0,trending:false,
            release:form.release||new Date().toISOString().slice(0,10),
            lyrics:form.lyrics,status:"Pending",paymentRef:txnId,
            uploadedAt:new Date().toISOString()};
          if(isSupabaseReady){
            const dbRow=songToDb(song);delete dbRow.id;
            const row=await db.insertSong(dbRow);
            onUpload(songFromDb(row));
          }else{
            onUpload(song);
          }
          toast("Track submitted for review! We publish within 24h ✅","success");
        }catch(e){
          console.error("Upload error:",e);
          toast("Upload failed: "+(e.message||"please try again"),"error");
        }
        onClose();
      }}
      onClose={()=>setShowPay(false)}/>
  );

  return(
    <Modal onClose={onClose} maxWidth={480}>
      <ModalHeader title="Upload Track" sub={`Step ${step} of 2`} onClose={onClose}/>
      <div style={{display:"flex",gap:3,marginBottom:22}}>
        {[1,2].map(s=><div key={s} style={{flex:1,height:3,borderRadius:2,background:step>=s?s===1?T.blue:T.green:T.mute,transition:"background .3s"}}/>)}
      </div>

      {step===1&&<>
        <Field label="Track title"><input style={inp()} value={form.title} onChange={e=>up("title",e.target.value)} placeholder="Enter track name" autoFocus/></Field>
        <Field label="Genre"><select style={{...inp(),appearance:"none"}} value={form.genre} onChange={e=>up("genre",e.target.value)}>{GENRES.map(g=><option key={g.name}>{g.name}</option>)}</select></Field>
        <Field label="Album / EP name (optional)"><input style={inp()} value={form.albumName} onChange={e=>up("albumName",e.target.value)} placeholder="e.g. Malawi Vibes Vol.1"/></Field>
        <Field label="Release date"><input style={inp()} type="date" value={form.release} onChange={e=>up("release",e.target.value)}/></Field>
        <Field label="Cover art">
          <label style={{border:`1px dashed ${cover?T.blueBorder:T.border2}`,borderRadius:8,cursor:"pointer",overflow:"hidden",display:"block"}}>
            <input type="file" accept="image/*" style={{display:"none"}} onChange={e=>{const f=e.target.files[0];if(f){const r=new FileReader();r.onload=ev=>setCover(ev.target.result);r.readAsDataURL(f);}}}/>
            {cover?<img src={cover} style={{width:"100%",maxHeight:150,objectFit:"cover",display:"block"}} alt="cover"/>
              :<div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:6,padding:"24px 0",color:T.mute}}><span style={{fontSize:24}}>🖼</span><span style={{fontSize:12}}>Upload cover art (recommended 500×500)</span></div>}
          </label>
        </Field>
        <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:14}}>
          <input type="checkbox" id="explicit" checked={form.isExplicit} onChange={e=>up("isExplicit",e.target.checked)} style={{accentColor:T.orange}}/>
          <label htmlFor="explicit" style={{color:T.sub,fontSize:12,cursor:"pointer"}}>Contains explicit content</label>
        </div>
        {err&&<p style={{color:T.orange,fontSize:12,marginBottom:10}}>{err}</p>}
        <Btn full onClick={()=>{if(!form.title.trim()){setErr("Title required");return;}setStep(2);}}>Continue →</Btn>
      </>}

      {step===2&&<>
        <Field label="Audio file" hint="MP3, WAV, FLAC, AAC · Max 50MB">
          <label style={{border:`1px dashed ${audio?T.greenBorder:T.border2}`,borderRadius:8,cursor:"pointer",display:"block",transition:"border-color .2s"}}>
            <input type="file" accept="audio/*" style={{display:"none"}} onChange={e=>handleAudioChange(e.target.files[0])}/>
            <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:6,padding:"22px 0"}}>
              {audio?<><span style={{fontSize:22}}>🎵</span><span style={{color:T.green,fontSize:12,fontWeight:600}}>{audio.name}</span>{audioDuration&&<span style={{color:T.mute,fontSize:11}}>{fmtTime(audioDuration)}</span>}</>
                :<><span style={{fontSize:22}}>🎵</span><span style={{color:T.mute,fontSize:12}}>Click to upload .mp3 / .wav / .flac</span></>}
            </div>
          </label>
        </Field>
        <Field label="Lyrics (optional)"><textarea style={{...inp(),height:88,resize:"none"}} value={form.lyrics} onChange={e=>up("lyrics",e.target.value)} placeholder="Paste song lyrics..."/></Field>
        <div style={{background:T.bg2,border:`1px solid ${T.orangeBorder}`,borderRadius:8,padding:12,marginBottom:16}}>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:2}}>
            <span style={{color:T.sub,fontSize:12}}>Upload fee</span>
            <span style={{color:T.orange,fontWeight:700}}>{UPLOAD_FEE_LABEL}</span>
          </div>
          <div style={{color:T.mute,fontSize:10}}>Pay via TNM Mpamba or Airtel Money</div>
        </div>
        <div style={{display:"flex",gap:8}}>
          <BtnGhost flex={1} onClick={()=>setStep(1)}>← Back</BtnGhost>
          <Btn flex={2} color={T.green} onClick={()=>setShowPay(true)}>Pay & Upload</Btn>
        </div>
      </>}
    </Modal>
  );
}

// ─── SONG CARD ────────────────────────────────────────────────────────────────
function SongCard({song,onPlay,isPlaying,isActive,onOpen,currentUser,onLike,onShare,onAddToPlaylist}){
  const isLiked=currentUser?.liked?.includes(song.id);
  return(
    <div className="mwcard" style={{background:T.card,borderRadius:10,overflow:"hidden",border:`1px solid ${isActive?T.blueBorder:T.border}`,cursor:"pointer",transition:"border-color .15s"}}>
      <div style={{position:"relative"}} onClick={()=>onPlay(song)}>
        <img src={song.cover} alt={song.title} style={{width:"100%",aspectRatio:"1",objectFit:"cover",display:"block"}}/>
        <div className="mwoverlay" style={{position:"absolute",inset:0,background:"rgba(0,0,0,.55)",display:"flex",alignItems:"center",justifyContent:"center",opacity:0,transition:"opacity .18s"}}>
          <div style={{width:40,height:40,borderRadius:"50%",background:T.blue,display:"flex",alignItems:"center",justifyContent:"center"}}>
            {isActive&&isPlaying?<svg width="13" height="13" viewBox="0 0 24 24" fill="#fff"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>:<svg width="13" height="13" viewBox="0 0 24 24" fill="#fff" style={{marginLeft:2}}><polygon points="5 3 19 12 5 21 5 3"/></svg>}
          </div>
        </div>
        {song.trending&&<div style={{position:"absolute",top:7,left:7,background:"rgba(0,0,0,.85)",color:T.orange,fontSize:9,fontWeight:700,padding:"2px 7px",borderRadius:20}}>🔥 Hot</div>}
        {song.isExplicit&&<div style={{position:"absolute",top:7,right:isActive?24:7,background:"rgba(0,0,0,.85)",color:T.orange,fontSize:9,fontWeight:700,padding:"2px 5px",borderRadius:3}}>E</div>}
        {isActive&&<div style={{position:"absolute",top:7,right:7}}><Eq active={isPlaying} size={12} color={T.blue}/></div>}
      </div>
      <div style={{padding:"9px 6px 6px"}}>
        <div style={{color:T.text,fontSize:12,fontWeight:600,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",cursor:"pointer"}} onClick={()=>onOpen(song)}>{song.title}</div>
        <div style={{color:T.sub,fontSize:11,marginTop:1}}>{song.artist}</div>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginTop:5}}>
          <div style={{display:"flex",gap:7,fontSize:11,color:T.mute}}>
            <span>{fmtNum(song.plays)}</span>
            <span style={{color:isLiked?T.orange:T.mute,cursor:"pointer",transition:"color .15s"}} onClick={e=>{e.stopPropagation();onLike&&onLike(song);}}>{isLiked?"♥":"♡"} {fmtNum(song.likes)}</span>
          </div>
          <div style={{display:"flex",gap:3}}>
            <button style={{background:"none",border:"none",color:T.mute,fontSize:11,cursor:"pointer",padding:"0 2px"}} onClick={e=>{e.stopPropagation();onShare&&onShare(song);}}>📤</button>
            <button style={{background:"none",border:"none",color:T.mute,fontSize:14,cursor:"pointer",padding:"0 2px",lineHeight:1}} onClick={e=>{e.stopPropagation();onOpen(song);}}>···</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── PLAYER ───────────────────────────────────────────────────────────────────
function Player({song,isPlaying,onPlayPause,onNext,onPrev,progress,duration,onSeek,volume,onVolume,onOpen,shuffle,onShuffle,repeat,onRepeat}){
  if(!song)return null;
  const secs=progress*(duration||222);
  return(
    <div style={{position:"fixed",bottom:60,left:0,right:0,height:68,background:`rgba(7,10,16,.97)`,backdropFilter:"blur(24px)",borderTop:`1px solid ${T.border}`,display:"flex",alignItems:"center",justifyContent:"space-between",padding:"0 14px",zIndex:200,gap:8}}>
      <div style={{display:"flex",alignItems:"center",gap:10,flex:1,minWidth:0}}>
        <img src={song.cover} alt="" style={{width:40,height:40,borderRadius:6,objectFit:"cover",flexShrink:0,cursor:"pointer"}} onClick={()=>onOpen(song)}/>
        <div style={{minWidth:0}}>
          <div style={{color:T.text,fontSize:12,fontWeight:600,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",maxWidth:100,cursor:"pointer"}} onClick={()=>onOpen(song)}>{song.title}</div>
          <div style={{color:T.sub,fontSize:10}}>{song.artist}</div>
        </div>
        <Eq active={isPlaying} size={11} color={T.blue}/>
      </div>
      <div style={{display:"flex",flexDirection:"column",alignItems:"center",flex:1.6,minWidth:0}}>
        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:4}}>
          <button style={{background:"none",border:"none",cursor:"pointer",padding:2,color:shuffle?T.blue:T.mute}} onClick={onShuffle} title="Shuffle"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/><polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/></svg></button>
          <button style={{background:"none",border:"none",cursor:"pointer",padding:2,display:"flex"}} onClick={onPrev}><svg width="13" height="13" viewBox="0 0 24 24" fill={T.mute}><polygon points="19 20 9 12 19 4 19 20"/><line x1="5" y1="19" x2="5" y2="5" stroke={T.mute} strokeWidth="2"/></svg></button>
          <button style={{width:32,height:32,borderRadius:"50%",background:T.blue,display:"flex",alignItems:"center",justifyContent:"center",border:"none",cursor:"pointer",flexShrink:0}} onClick={onPlayPause}>
            {isPlaying?<svg width="11" height="11" viewBox="0 0 24 24" fill="#fff"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>:<svg width="11" height="11" viewBox="0 0 24 24" fill="#fff" style={{marginLeft:1}}><polygon points="5 3 19 12 5 21 5 3"/></svg>}
          </button>
          <button style={{background:"none",border:"none",cursor:"pointer",padding:2,display:"flex"}} onClick={onNext}><svg width="13" height="13" viewBox="0 0 24 24" fill={T.mute}><polygon points="5 4 15 12 5 20 5 4"/><line x1="19" y1="5" x2="19" y2="19" stroke={T.mute} strokeWidth="2"/></svg></button>
          <button style={{background:"none",border:"none",cursor:"pointer",padding:2,color:repeat?T.blue:T.mute}} onClick={onRepeat} title="Repeat"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 014-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 01-4 4H3"/></svg></button>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:5,width:"100%"}}>
          <span style={{color:T.mute,fontSize:8,width:24,textAlign:"right",fontFamily:"'DM Mono',monospace",flexShrink:0}}>{fmtTime(secs)}</span>
          <div style={{flex:1,height:3,background:T.mute,borderRadius:2,cursor:"pointer"}} onClick={e=>{const r=e.currentTarget.getBoundingClientRect();onSeek((e.clientX-r.left)/r.width);}}>
            <div style={{height:"100%",background:`linear-gradient(90deg,${T.blue},${T.green})`,borderRadius:2,transition:"width .5s linear",width:`${progress*100}%`}}/>
          </div>
          <span style={{color:T.mute,fontSize:8,width:24,fontFamily:"'DM Mono',monospace",flexShrink:0}}>{song.duration||"—"}</span>
        </div>
      </div>
      <div style={{display:"flex",alignItems:"center",gap:5,flex:"0 0 auto"}}>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={T.mute} strokeWidth="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 010 14.14M15.54 8.46a5 5 0 010 7.07"/></svg>
        <input type="range" min={0} max={1} step={0.01} value={volume} onChange={e=>onVolume(parseFloat(e.target.value))} style={{width:48,accentColor:T.blue,cursor:"pointer"}}/>
      </div>
    </div>
  );
}

// ─── BOTTOM NAV ───────────────────────────────────────────────────────────────
function BottomNav({page,setPage,currentUser,setModal,notifCount}){
  const tabs=[
    {id:"home",label:"Home",icon:<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>},
    {id:"discover",label:"Discover",icon:<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>},
    {id:"upload",label:"Upload",action:true,icon:<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>},
    {id:"library",label:"Library",icon:<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M3 3h6v18H3z"/><path d="M15 3h6v18h-6z"/></svg>},
    {id:"profile",label:currentUser?"Profile":"Me",icon:<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>},
  ];
  return(
    <div style={{position:"fixed",bottom:0,left:0,right:0,height:60,background:`rgba(7,10,16,.98)`,backdropFilter:"blur(20px)",borderTop:`1px solid ${T.border}`,display:"flex",alignItems:"center",zIndex:300,padding:"0 4px"}}>
      {tabs.map(t=>{
        const isActive=page===t.id;
        return(
          <button key={t.id} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:3,background:"none",border:"none",cursor:"pointer",padding:"6px 0",color:isActive?(t.action?T.orange:T.blue):T.mute,transition:"color .15s",fontFamily:"'DM Sans',sans-serif",position:"relative"}}
            onClick={()=>{if(t.action){if(currentUser?.role==="artist")setModal("upload_choice");else setModal("signup");}else setPage(t.id);}}>
            {t.action
              ?<div style={{width:38,height:38,borderRadius:"50%",background:`linear-gradient(135deg,${T.orange},${T.green})`,display:"flex",alignItems:"center",justifyContent:"center",marginBottom:-2,color:"#fff",boxShadow:`0 4px 16px ${T.orange}44`}}>{t.icon}</div>
              :t.icon}
            <span style={{fontSize:9,fontWeight:600,letterSpacing:.3}}>{t.label}</span>
            {t.id==="profile"&&notifCount>0&&<div style={{position:"absolute",top:4,right:"50%",marginRight:-14,width:14,height:14,borderRadius:"50%",background:T.red,color:"#fff",fontSize:8,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center"}}>{notifCount>9?"9+":notifCount}</div>}
          </button>
        );
      })}
    </div>
  );
}


// ─── SONG PAGE ────────────────────────────────────────────────────────────────
function SongPage({song,onPlay,isPlaying,isActive,currentUser,onLike,allSongs,toast,onShare,onDownload,onAddToPlaylist,addNotif}){
  const [showLyrics,setShowLyrics]=useState(false);
  const [comment,setComment]=useState("");
  const [localComments,setLocalComments]=useState(()=>LS.get("comments_"+song.id,[]));
  const isLiked=currentUser?.liked?.includes(song.id);
  const related=allSongs.filter(s=>s.id!==song.id&&(s.genre===song.genre||s.artistId===song.artistId)&&s.status==="Approved").slice(0,4);

  const postComment=()=>{
    if(!comment.trim())return;
    const c={id:genId(),user:currentUser?.name||"Guest",text:comment,time:new Date().toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})};
    const updated=[c,...localComments];
    setLocalComments(updated);LS.set("comments_"+song.id,updated);setComment("");
    addNotif&&addNotif("comment",`${currentUser?.name} commented on "${song.title}"`);
  };

  return(
    <div style={{padding:"20px 16px",maxWidth:680,margin:"0 auto"}}>
      <div style={{display:"flex",gap:20,flexWrap:"wrap",marginBottom:24}}>
        <div style={{position:"relative",flexShrink:0}}>
          <img src={song.cover} alt="" style={{width:148,height:148,borderRadius:14,objectFit:"cover",boxShadow:`0 12px 48px ${T.blue}22`}}/>
          {isActive&&<div style={{position:"absolute",bottom:8,right:8}}><Eq active={isPlaying} size={16} color={T.blue}/></div>}
          {song.isExplicit&&<div style={{position:"absolute",top:8,left:8,background:"rgba(0,0,0,.8)",color:T.orange,fontSize:10,fontWeight:700,padding:"2px 6px",borderRadius:4}}>E</div>}
        </div>
        <div style={{flex:1,minWidth:180}}>
          <div style={{color:T.sub,fontSize:10,letterSpacing:1,marginBottom:4}}>{song.genre?.toUpperCase()}</div>
          <h1 style={{color:T.text,fontSize:22,fontFamily:"'Syne',sans-serif",fontWeight:700,marginBottom:4,lineHeight:1.2}}>{song.title}</h1>
          <div style={{color:T.blue,fontSize:13,fontWeight:600,marginBottom:song.albumName?4:12}}>{song.artist}</div>
          {song.albumName&&<div style={{color:T.mute,fontSize:11,marginBottom:12}}>📀 {song.albumName}</div>}
          <div style={{display:"flex",gap:16,marginBottom:16,flexWrap:"wrap"}}>
            {[["Plays",fmtNum(song.plays)],["Likes",fmtNum(song.likes)],["Comments",String(localComments.length)]].map(([l,v])=>(
              <div key={l}><div style={{color:T.text,fontSize:16,fontWeight:700}}>{v}</div><div style={{color:T.mute,fontSize:10,letterSpacing:.5}}>{l}</div></div>
            ))}
          </div>
          <div style={{display:"flex",gap:7,flexWrap:"wrap"}}>
            <Btn onClick={()=>onPlay(song)} style={{padding:"8px 16px"}}>{isActive&&isPlaying?"⏸ Pause":"▶ Play"}</Btn>
            <BtnGhost onClick={()=>onLike&&onLike(song)} style={{padding:"8px 12px",color:isLiked?T.orange:T.sub,borderColor:isLiked?T.orangeBorder:T.border2}}>{isLiked?"♥":"♡"}</BtnGhost>
            <BtnGhost onClick={()=>onShare&&onShare(song)} style={{padding:"8px 12px"}} title="Share">📤</BtnGhost>
            <BtnGhost onClick={()=>onDownload&&onDownload(song)} style={{padding:"8px 12px"}} title="Download">⬇</BtnGhost>
            <BtnGhost onClick={()=>onAddToPlaylist&&onAddToPlaylist(song)} style={{padding:"8px 12px"}} title="Add to playlist">🎶</BtnGhost>
          </div>
        </div>
      </div>

      {song.lyrics&&<div style={{marginBottom:22}}>
        <button style={{display:"flex",alignItems:"center",gap:6,background:"none",border:`1px solid ${T.border}`,borderRadius:8,padding:"8px 14px",color:showLyrics?T.blue:T.sub,fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"'DM Sans',sans-serif"}} onClick={()=>setShowLyrics(l=>!l)}>
          📝 {showLyrics?"Hide Lyrics":"View Lyrics"}
        </button>
        {showLyrics&&<div style={{background:T.bg1,border:`1px solid ${T.border}`,borderRadius:10,padding:18,marginTop:10}}>
          <pre style={{color:T.sub,fontSize:13,lineHeight:2,whiteSpace:"pre-wrap",fontFamily:"'DM Sans',sans-serif"}}>{song.lyrics}</pre>
        </div>}
      </div>}

      <h3 style={{color:T.sub,fontSize:10,fontWeight:700,letterSpacing:1,marginBottom:12}}>COMMENTS ({localComments.length})</h3>
      <div style={{display:"flex",gap:8,marginBottom:14}}>
        <input style={{...inp(),flex:1}} value={comment} onChange={e=>setComment(e.target.value)} placeholder={currentUser?"Leave a comment...":"Sign in to comment..."} disabled={!currentUser} onKeyDown={e=>e.key==="Enter"&&postComment()}/>
        <Btn onClick={postComment} disabled={!currentUser||!comment.trim()}>Post</Btn>
      </div>
      {localComments.map(c=>(
        <div key={c.id} style={{display:"flex",gap:10,padding:12,borderRadius:8,background:T.bg1,border:`1px solid ${T.border}`,marginBottom:7}}>
          <div style={{width:28,height:28,borderRadius:"50%",background:`${T.blue}18`,display:"flex",alignItems:"center",justifyContent:"center",color:T.blue,fontSize:11,fontWeight:700,flexShrink:0}}>{c.user[0].toUpperCase()}</div>
          <div><div style={{color:T.text,fontSize:12,fontWeight:600}}>{c.user} <span style={{color:T.mute,fontSize:10}}>{c.time}</span></div><div style={{color:T.sub,fontSize:12,marginTop:3,lineHeight:1.5}}>{c.text}</div></div>
        </div>
      ))}
      {localComments.length===0&&<p style={{color:T.mute,fontSize:13}}>Be the first to comment.</p>}

      {related.length>0&&<>
        <h3 style={{color:T.sub,fontSize:10,fontWeight:700,letterSpacing:1,margin:"24px 0 12px"}}>YOU MIGHT ALSO LIKE</h3>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(130px,1fr))",gap:10}}>
          {related.map(s=>(
            <div key={s.id} className="mwcard" style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:10,overflow:"hidden",cursor:"pointer"}} onClick={()=>onPlay(s)}>
              <img src={s.cover} alt="" style={{width:"100%",aspectRatio:"1",objectFit:"cover",display:"block"}}/>
              <div style={{padding:"8px 6px"}}>
                <div style={{color:T.text,fontSize:11,fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{s.title}</div>
                <div style={{color:T.sub,fontSize:10}}>{s.artist}</div>
              </div>
            </div>
          ))}
        </div>
      </>}
    </div>
  );
}

// ─── ARTIST PROFILE PAGE ──────────────────────────────────────────────────────
function ArtistProfilePage({artist,onPlay,songs,isPlaying,currentSong,currentUser,onFollowToggle,onShare,onDownload,toast}){
  const artistSongs=songs.filter(s=>s.artistId===artist.id&&s.status==="Approved");
  const isFollowing=currentUser?.following?.includes(artist.id);
  const totalPlays=artistSongs.reduce((a,s)=>a+s.plays,0);
  return(
    <div style={{padding:"20px 16px",maxWidth:680,margin:"0 auto"}}>
      <div style={{background:`linear-gradient(180deg,${T.blue}12 0%,${T.bg} 100%)`,borderRadius:16,padding:"24px 18px",marginBottom:22,border:`1px solid ${T.border}`}}>
        <div style={{display:"flex",gap:18,alignItems:"flex-end",flexWrap:"wrap"}}>
          <div style={{position:"relative"}}>
            {artist.avatar?<img src={artist.avatar} alt="" style={{width:80,height:80,borderRadius:"50%",objectFit:"cover",border:`2px solid ${T.blueBorder}`}}/>
              :<div style={{width:80,height:80,borderRadius:"50%",background:`${T.blue}18`,border:`2px solid ${T.blueBorder}`,display:"flex",alignItems:"center",justifyContent:"center",color:T.blue,fontSize:26,fontWeight:700,fontFamily:"'Syne',sans-serif"}}>{artist.name[0].toUpperCase()}</div>}
            {artist.verified&&<div style={{position:"absolute",bottom:2,right:2,width:22,height:22,borderRadius:"50%",background:T.green,display:"flex",alignItems:"center",justifyContent:"center",border:`2px solid ${T.bg}`,fontSize:10}}>✓</div>}
          </div>
          <div style={{flex:1}}>
            <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:2}}>
              <h1 style={{color:T.text,fontSize:20,fontFamily:"'Syne',sans-serif",fontWeight:700}}>{artist.name}</h1>
              {artist.verified&&<span style={{background:`${T.green}22`,color:T.green,fontSize:9,fontWeight:700,padding:"2px 7px",borderRadius:20,border:`1px solid ${T.greenBorder}`}}>VERIFIED</span>}
            </div>
            <div style={{color:T.sub,fontSize:11,marginBottom:10}}>{artist.genre} · {artist.country}</div>
            <div style={{display:"flex",gap:16,marginBottom:12}}>
              <div><span style={{color:T.text,fontWeight:700,fontSize:13}}>{artistSongs.length}</span><span style={{color:T.mute,fontSize:11,marginLeft:4}}>Tracks</span></div>
              <div><span style={{color:T.text,fontWeight:700,fontSize:13}}>{fmtNum((artist.followers||0)+(isFollowing?1:0))}</span><span style={{color:T.mute,fontSize:11,marginLeft:4}}>Followers</span></div>
              <div><span style={{color:T.text,fontWeight:700,fontSize:13}}>{fmtNum(totalPlays)}</span><span style={{color:T.mute,fontSize:11,marginLeft:4}}>Plays</span></div>
            </div>
            <button style={{padding:"8px 20px",borderRadius:8,border:`1px solid ${isFollowing?T.blue:T.border2}`,background:isFollowing?`${T.blue}18`:"transparent",color:isFollowing?T.blue:T.sub,fontSize:12,fontWeight:700,cursor:"pointer",transition:"all .15s",fontFamily:"'DM Sans',sans-serif"}} onClick={()=>onFollowToggle&&onFollowToggle(artist)}>
              {isFollowing?"Following ✓":"+ Follow"}
            </button>
          </div>
        </div>
        {artist.bio&&<p style={{color:T.sub,fontSize:12,lineHeight:1.7,marginTop:14,borderTop:`1px solid ${T.border}`,paddingTop:14}}>{artist.bio}</p>}
      </div>
      <h3 style={{color:T.sub,fontSize:10,fontWeight:700,letterSpacing:1,marginBottom:12}}>TRACKS ({artistSongs.length})</h3>
      {artistSongs.length===0?<EmptyState title="No tracks yet" sub="This artist hasn't published any tracks."/>
        :<div style={{display:"flex",flexDirection:"column",gap:6}}>
          {artistSongs.map(s=>(
            <div key={s.id} style={{display:"flex",gap:12,alignItems:"center",background:T.card,border:`1px solid ${currentSong?.id===s.id?T.blueBorder:T.border}`,borderRadius:8,padding:"10px 12px",cursor:"pointer"}} onClick={()=>onPlay(s)}>
              <img src={s.cover} alt="" style={{width:42,height:42,borderRadius:6,objectFit:"cover",flexShrink:0}}/>
              <div style={{flex:1,minWidth:0}}>
                <div style={{color:T.text,fontSize:13,fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{s.title}</div>
                <div style={{color:T.sub,fontSize:11}}>{s.genre} · {s.duration}</div>
              </div>
              {currentSong?.id===s.id&&<Eq active={isPlaying} size={13} color={T.blue}/>}
              <button style={{background:"none",border:"none",color:T.mute,fontSize:11,cursor:"pointer",padding:"0 4px"}} onClick={e=>{e.stopPropagation();onDownload&&onDownload(s);}}>⬇</button>
              <div style={{color:T.mute,fontSize:11,flexShrink:0}}>{fmtNum(s.plays)}</div>
            </div>
          ))}
        </div>}
    </div>
  );
}

// ─── ARTIST DASHBOARD ─────────────────────────────────────────────────────────
function ArtistDashboard({onClose,currentUser,songs,onUpdateUser,toast,onVerify,verificationStatus}){
  const [tab,setTab]=useState("overview");
  const [bio,setBio]=useState(currentUser.bio||"");
  const [avatar,setAvatar]=useState(currentUser.avatar);
  const artistSongs=songs.filter(s=>s.artistId===currentUser.id);
  const approved=artistSongs.filter(s=>s.status==="Approved");
  const pending=artistSongs.filter(s=>s.status==="Pending");
  const totalPlays=artistSongs.reduce((a,s)=>a+s.plays,0);
  const totalLikes=artistSongs.reduce((a,s)=>a+s.likes,0);
  const maxPlays=Math.max(...approved.map(s=>s.plays),1);
  const sColor={"Approved":T.green,"Pending":T.orange,"Rejected":T.red};

  return(
    <Modal onClose={onClose} maxWidth={680} padding="0">
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"18px 22px",borderBottom:`1px solid ${T.border}`}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <h2 style={{color:T.text,fontFamily:"'Syne',sans-serif",fontSize:17}}>Artist Dashboard</h2>
          {currentUser.verified&&<span style={{background:`${T.green}22`,color:T.green,fontSize:9,fontWeight:700,padding:"2px 8px",borderRadius:20,border:`1px solid ${T.greenBorder}`}}>✓ VERIFIED</span>}
        </div>
        <button onClick={onClose} style={{background:"none",border:"none",color:T.mute,fontSize:20,cursor:"pointer"}}>✕</button>
      </div>
      <div style={{display:"flex",borderBottom:`1px solid ${T.border}`,padding:"0 22px",overflowX:"auto"}}>
        {[["overview","Overview"],["uploads","Tracks"],["analytics","Analytics"],["editprofile","Profile"],["verify","Verify"]].map(([k,l])=>(
          <button key={k} style={{whiteSpace:"nowrap",padding:"13px 14px",border:"none",background:"none",cursor:"pointer",fontSize:12,fontWeight:600,color:tab===k?T.blue:T.sub,borderBottom:tab===k?`2px solid ${T.blue}`:"2px solid transparent",marginBottom:-1,fontFamily:"'DM Sans',sans-serif"}} onClick={()=>setTab(k)}>{l}</button>
        ))}
      </div>
      <div style={{padding:"20px 22px",maxHeight:"70vh",overflowY:"auto"}}>
        {tab==="overview"&&<>
          <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:10,marginBottom:18}}>
            {[[T.blue,"Total Plays",fmtNum(totalPlays)],[T.orange,"Total Likes",fmtNum(totalLikes)],[T.green,"Published",approved.length],[T.purple,"Followers",fmtNum(currentUser.followers||0)]].map(([col,lbl,val])=>(
              <div key={lbl} style={{background:T.bg2,border:`1px solid ${T.border}`,borderRadius:10,padding:"14px 12px",borderLeft:`3px solid ${col}`}}>
                <div style={{color:col,fontSize:24,fontWeight:700,fontFamily:"'Syne',sans-serif"}}>{val}</div>
                <div style={{color:T.sub,fontSize:11,marginTop:3}}>{lbl}</div>
              </div>
            ))}
          </div>
          {pending.length>0&&<div style={{background:T.orangeDim,border:`1px solid ${T.orangeBorder}`,borderRadius:10,padding:"12px 16px"}}>
            <p style={{color:T.orange,fontSize:12,fontWeight:600}}>{pending.length} track{pending.length>1?"s":""} pending review</p>
            <p style={{color:T.sub,fontSize:11,marginTop:2}}>Usually approved within 24 hours.</p>
          </div>}
          {artistSongs.length===0&&<EmptyState title="No tracks yet" sub="Upload your first track to see analytics."/>}
        </>}

        {tab==="uploads"&&(artistSongs.length===0
          ?<EmptyState title="No uploads yet" sub="Your tracks will appear here."/>
          :<div style={{display:"flex",flexDirection:"column",gap:6}}>
            {artistSongs.map(s=>(
              <div key={s.id} style={{display:"flex",gap:10,alignItems:"center",background:T.bg2,border:`1px solid ${T.border}`,borderRadius:8,padding:"9px 12px"}}>
                <img src={s.cover} alt="" style={{width:40,height:40,borderRadius:6,objectFit:"cover",flexShrink:0}}/>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{color:T.text,fontSize:12,fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{s.title}</div>
                  <div style={{color:T.sub,fontSize:11}}>{s.genre} · {new Date(s.uploadedAt||s.release||Date.now()).toLocaleDateString()}</div>
                </div>
                <div style={{textAlign:"right",flexShrink:0}}>
                  <div style={{color:T.mute,fontSize:11}}>{fmtNum(s.plays)} plays</div>
                  <span style={{padding:"2px 9px",borderRadius:20,fontSize:10,fontWeight:700,background:`${sColor[s.status]||T.mute}22`,color:sColor[s.status]||T.mute}}>{s.status}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {tab==="analytics"&&(approved.length===0
          ?<EmptyState title="No analytics yet" sub="Analytics appear once tracks are approved."/>
          :<>
            <h3 style={{color:T.sub,fontSize:10,fontWeight:700,letterSpacing:1,marginBottom:14}}>PLAYS PER TRACK</h3>
            <div style={{display:"flex",flexDirection:"column",gap:10,marginBottom:24}}>
              {[...approved].sort((a,b)=>b.plays-a.plays).map(s=>(
                <div key={s.id}>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                    <span style={{color:T.text,fontSize:11,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:200}}>{s.title}</span>
                    <span style={{color:T.mute,fontSize:11,flexShrink:0,marginLeft:8}}>{fmtNum(s.plays)}</span>
                  </div>
                  <div style={{height:6,background:T.border,borderRadius:3,overflow:"hidden"}}>
                    <div style={{height:"100%",background:`linear-gradient(90deg,${T.blue},${T.green})`,borderRadius:3,width:`${Math.max((s.plays/maxPlays)*100,2)}%`,transition:"width .6s ease"}}/>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {tab==="editprofile"&&<>
          <Field label="Profile photo">
            <label style={{display:"flex",gap:12,alignItems:"center",cursor:"pointer"}}>
              <input type="file" accept="image/*" style={{display:"none"}} onChange={e=>{const f=e.target.files[0];if(f){const r=new FileReader();r.onload=ev=>setAvatar(ev.target.result);r.readAsDataURL(f);}}}/>
              {avatar?<img src={avatar} style={{width:52,height:52,borderRadius:"50%",objectFit:"cover",border:`2px solid ${T.blueBorder}`}} alt=""/>
                :<div style={{width:52,height:52,borderRadius:"50%",background:`${T.blue}18`,border:`1px solid ${T.blueBorder}`,display:"flex",alignItems:"center",justifyContent:"center",color:T.blue,fontSize:18,fontWeight:700}}>{currentUser.name[0].toUpperCase()}</div>}
              <span style={{color:T.blue,fontSize:12,fontWeight:600}}>Change photo</span>
            </label>
          </Field>
          <Field label="Bio"><textarea style={{...inp(),height:88,resize:"none"}} value={bio} onChange={e=>setBio(e.target.value)} placeholder="Tell listeners about yourself..."/></Field>
          <Btn full onClick={()=>{onUpdateUser({...currentUser,bio,avatar});toast("Profile updated!","success");onClose();}}>Save Changes</Btn>
        </>}

        {tab==="verify"&&<>
          {currentUser.verified
            ?<div style={{textAlign:"center",padding:"30px 0"}}>
              <div style={{fontSize:48,marginBottom:12}}>🏅</div>
              <p style={{color:T.green,fontSize:16,fontWeight:700,marginBottom:6}}>You are verified!</p>
              <p style={{color:T.sub,fontSize:12}}>Your verified badge is showing on your profile.</p>
            </div>
            :verificationStatus==="Pending"
            ?<div style={{textAlign:"center",padding:"30px 0"}}>
              <div style={{fontSize:36,marginBottom:12}}>⏳</div>
              <p style={{color:T.orange,fontSize:14,fontWeight:600,marginBottom:6}}>Verification pending</p>
              <p style={{color:T.sub,fontSize:12,lineHeight:1.6}}>Your request is under review. We'll notify you within 3–5 business days.</p>
            </div>
            :<>
              <div style={{background:`${T.blue}0E`,border:`1px solid ${T.blueBorder}`,borderRadius:8,padding:"12px 14px",marginBottom:18}}>
                <p style={{color:T.sub,fontSize:12,lineHeight:1.7}}>Get a <strong style={{color:T.blue}}>verified badge</strong> ✓ to confirm you're the real artist. Increases trust and discoverability.</p>
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:18}}>
                {["Blue verified badge on your profile","Priority placement in search","Access to advanced analytics","Future monetization features"].map(b=>(
                  <div key={b} style={{display:"flex",gap:8,alignItems:"center"}}><span style={{color:T.green,fontSize:12}}>✓</span><span style={{color:T.sub,fontSize:12}}>{b}</span></div>
                ))}
              </div>
              <Btn full color={T.blue} onClick={()=>{onClose();setTimeout(()=>onVerify&&onVerify(),100);}}>Apply for Verification →</Btn>
            </>}
        </>}
      </div>
    </Modal>
  );
}

// ─── ADMIN PANEL ──────────────────────────────────────────────────────────────
function AdminPanel({onClose,songs,setSongs,artists,setRegisteredUsers,toast,currentUser}){
  const [checking,setChecking]=useState(true); const [allowed,setAllowed]=useState(false);
  const [tab,setTab]=useState("dashboard"); const [searchQ,setSearchQ]=useState("");
  const approve=id=>{
    setSongs(ss=>ss.map(s=>s.id===id?{...s,status:"Approved"}:s));toast("Approved ✅","success");
    if(isSupabaseReady)db.adminUpdateSong(id,{status:"Approved"}).catch(()=>toast("Failed to sync — try again","error"));
  };
  const reject=id=>{
    setSongs(ss=>ss.map(s=>s.id===id?{...s,status:"Rejected"}:s));toast("Rejected","info");
    if(isSupabaseReady)db.adminUpdateSong(id,{status:"Rejected"}).catch(()=>toast("Failed to sync — try again","error"));
  };
  const remove=id=>{
    setSongs(ss=>ss.filter(s=>s.id!==id));toast("Removed","info");
    if(isSupabaseReady)db.adminDeleteSong(id).catch(()=>toast("Failed to sync — try again","error"));
  };
  const toggleTrend=id=>{
    setSongs(ss=>{
      const cur=ss.find(x=>x.id===id);const next=!cur?.trending;
      if(isSupabaseReady)db.adminUpdateSong(id,{trending:next}).catch(()=>toast("Failed to sync — try again","error"));
      return ss.map(x=>x.id===id?{...x,trending:next}:x);
    });
  };
  const verifyArtist=id=>{
    setRegisteredUsers(uu=>uu.map(u=>u.id===id?{...u,verified:true,verificationStatus:"Approved"}:u));toast("Artist verified ✅","success");
    if(isSupabaseReady)db.adminUpdateProfile(id,{verified:true,verification_status:"Approved"}).catch(()=>toast("Failed to sync — try again","error"));
  };
  const sc={"Approved":T.green,"Pending":T.orange,"Rejected":T.red};

  useEffect(()=>{
    let active=true;
    (async()=>{
      if(!currentUser?.id){if(active){setAllowed(false);setChecking(false);}return;}
      try{
        const ok=await db.isAdmin(currentUser.id);
        if(active){setAllowed(ok);setChecking(false);}
      }catch(e){if(active){setAllowed(false);setChecking(false);}}
    })();
    return()=>{active=false;};
  },[currentUser?.id]);

  if(checking)return(
    <Modal onClose={onClose} maxWidth={320}>
      <div style={{textAlign:"center",padding:"30px 0",color:T.sub,fontSize:13}}>Checking access…</div>
    </Modal>
  );

  if(!allowed)return(
    <Modal onClose={onClose} maxWidth={320}>
      <div style={{textAlign:"center",padding:"8px 0"}}>
        <div style={{fontSize:36,marginBottom:14}}>🔒</div>
        <h2 style={{color:T.text,fontFamily:"'Syne',sans-serif",fontSize:17,marginBottom:5}}>Restricted</h2>
        <p style={{color:T.sub,fontSize:12}}>This area is only available to the platform administrator.</p>
      </div>
    </Modal>
  );

  const pending=songs.filter(s=>s.status==="Pending");
  const filtered=songs.filter(s=>!searchQ||s.title.toLowerCase().includes(searchQ.toLowerCase())||s.artist.toLowerCase().includes(searchQ.toLowerCase()));
  const pendingVerify=artists.filter(a=>a.verificationStatus==="Pending"&&!a.verified);

  return(
    <Modal onClose={onClose} maxWidth={720} padding="0">
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"18px 22px",borderBottom:`1px solid ${T.border}`}}>
        <h2 style={{color:T.text,fontFamily:"'Syne',sans-serif",fontSize:17}}>Platform Admin</h2>
        <button onClick={onClose} style={{background:"none",border:"none",color:T.mute,fontSize:20,cursor:"pointer"}}>✕</button>
      </div>
      <div style={{display:"flex",borderBottom:`1px solid ${T.border}`,padding:"0 22px",overflowX:"auto"}}>
        {[["dashboard","Dashboard"],["content","Tracks"],["pending",`Pending (${pending.length})`],["artists","Artists"],["verify",`Verify (${pendingVerify.length})`]].map(([k,l])=>(
          <button key={k} style={{whiteSpace:"nowrap",padding:"13px 14px",border:"none",background:"none",cursor:"pointer",fontSize:12,fontWeight:600,color:tab===k?T.blue:T.sub,borderBottom:tab===k?`2px solid ${T.blue}`:"2px solid transparent",marginBottom:-1,fontFamily:"'DM Sans',sans-serif"}} onClick={()=>setTab(k)}>{l}</button>
        ))}
      </div>
      <div style={{padding:"20px 22px",maxHeight:"72vh",overflowY:"auto"}}>
        {tab==="dashboard"&&<>
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10,marginBottom:18}}>
            {[[T.blue,"Tracks",songs.length],[T.green,"Artists",artists.filter(a=>a.role==="artist").length],[T.orange,"Pending",pending.length]].map(([col,lbl,val])=>(
              <div key={lbl} style={{background:T.bg2,border:`1px solid ${T.border}`,borderRadius:10,padding:"14px 12px",borderTop:`3px solid ${col}`,textAlign:"center"}}>
                <div style={{color:col,fontSize:24,fontWeight:700,fontFamily:"'Syne',sans-serif"}}>{val}</div>
                <div style={{color:T.sub,fontSize:11,marginTop:3}}>{lbl}</div>
              </div>
            ))}
          </div>
          {pending.length===0?<p style={{color:T.mute,fontSize:13}}>✅ No pending submissions.</p>
            :pending.slice(0,5).map(s=>(
              <div key={s.id} style={{display:"flex",gap:10,alignItems:"center",padding:"10px 0",borderBottom:`1px solid ${T.border}`}}>
                <img src={s.cover} alt="" style={{width:40,height:40,borderRadius:6,objectFit:"cover",flexShrink:0}}/>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{color:T.text,fontSize:12,fontWeight:600}}>{s.title}</div>
                  <div style={{color:T.sub,fontSize:11}}>{s.artist} · {s.genre}</div>
                </div>
                <div style={{display:"flex",gap:5,flexShrink:0}}>
                  <button style={{padding:"4px 10px",borderRadius:6,border:`1px solid ${T.greenBorder}`,background:T.greenDim,color:T.green,fontSize:11,fontWeight:600,cursor:"pointer"}} onClick={()=>approve(s.id)}>✓</button>
                  <button style={{padding:"4px 10px",borderRadius:6,border:`1px solid ${T.orangeBorder}`,background:T.orangeDim,color:T.orange,fontSize:11,fontWeight:600,cursor:"pointer"}} onClick={()=>reject(s.id)}>✗</button>
                </div>
              </div>
            ))}
        </>}

        {tab==="content"&&<>
          <input style={{...inp(),marginBottom:12}} value={searchQ} onChange={e=>setSearchQ(e.target.value)} placeholder="Search tracks..."/>
          {filtered.map(s=>(
            <div key={s.id} style={{display:"flex",gap:10,alignItems:"center",background:T.bg2,border:`1px solid ${T.border}`,borderRadius:8,padding:"8px 10px",marginBottom:5}}>
              <img src={s.cover} alt="" style={{width:34,height:34,borderRadius:5,objectFit:"cover",flexShrink:0}}/>
              <div style={{flex:1,minWidth:0}}>
                <div style={{color:T.text,fontSize:12,fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{s.title}</div>
                <div style={{color:T.sub,fontSize:10}}>{s.artist} · {fmtNum(s.plays)} plays</div>
              </div>
              <span style={{padding:"2px 7px",borderRadius:20,fontSize:10,fontWeight:700,background:`${sc[s.status]||T.mute}18`,color:sc[s.status]||T.mute,flexShrink:0}}>{s.status}</span>
              {s.status==="Approved"&&<button style={{padding:"2px 7px",borderRadius:5,border:`1px solid ${s.trending?T.orangeBorder:T.border2}`,background:s.trending?T.orangeDim:"transparent",color:s.trending?T.orange:T.mute,fontSize:10,cursor:"pointer",flexShrink:0}} onClick={()=>toggleTrend(s.id)}>{s.trending?"🔥":"Trend"}</button>}
              <button style={{padding:"2px 7px",borderRadius:5,border:`1px solid ${T.border2}`,color:T.red,background:"transparent",fontSize:10,cursor:"pointer",flexShrink:0}} onClick={()=>remove(s.id)}>Del</button>
            </div>
          ))}
        </>}

        {tab==="pending"&&(pending.length===0
          ?<EmptyState title="All clear!" sub="No pending submissions."/>
          :pending.map(s=>(
            <div key={s.id} style={{display:"flex",gap:10,alignItems:"center",background:T.bg2,border:`1px solid ${T.border}`,borderRadius:8,padding:"10px 12px",marginBottom:8}}>
              <img src={s.cover} alt="" style={{width:44,height:44,borderRadius:6,objectFit:"cover",flexShrink:0}}/>
              <div style={{flex:1,minWidth:0}}>
                <div style={{color:T.text,fontSize:13,fontWeight:600}}>{s.title}</div>
                <div style={{color:T.sub,fontSize:11}}>{s.artist} · {s.genre}</div>
                <div style={{color:T.mute,fontSize:10}}>Ref: {s.paymentRef}</div>
              </div>
              <div style={{display:"flex",gap:6}}>
                <button style={{padding:"6px 12px",borderRadius:7,border:`1px solid ${T.greenBorder}`,background:T.greenDim,color:T.green,fontSize:11,fontWeight:700,cursor:"pointer"}} onClick={()=>approve(s.id)}>Approve</button>
                <button style={{padding:"6px 12px",borderRadius:7,border:`1px solid ${T.orangeBorder}`,background:T.orangeDim,color:T.orange,fontSize:11,fontWeight:700,cursor:"pointer"}} onClick={()=>reject(s.id)}>Reject</button>
              </div>
            </div>
          ))
        )}

        {tab==="artists"&&(artists.filter(a=>a.role==="artist").length===0
          ?<EmptyState title="No artists" sub="No artist accounts yet."/>
          :artists.filter(a=>a.role==="artist").map(a=>(
            <div key={a.id} style={{display:"flex",gap:10,alignItems:"center",background:T.bg2,border:`1px solid ${T.border}`,borderRadius:8,padding:"10px 12px",marginBottom:5}}>
              {a.avatar?<img src={a.avatar} style={{width:36,height:36,borderRadius:"50%",objectFit:"cover",flexShrink:0}} alt=""/>:<div style={{width:36,height:36,borderRadius:"50%",background:`${T.blue}18`,display:"flex",alignItems:"center",justifyContent:"center",color:T.blue,fontWeight:700,fontSize:14,flexShrink:0}}>{a.name[0].toUpperCase()}</div>}
              <div style={{flex:1,minWidth:0}}>
                <div style={{display:"flex",alignItems:"center",gap:6}}><div style={{color:T.text,fontSize:12,fontWeight:600}}>{a.name}</div>{a.verified&&<span style={{color:T.green,fontSize:10}}>✓</span>}</div>
                <div style={{color:T.sub,fontSize:10}}>{a.email} · {a.genre}</div>
              </div>
              <div style={{color:T.mute,fontSize:10,flexShrink:0}}>{songs.filter(s=>s.artistId===a.id&&s.status==="Approved").length} tracks</div>
            </div>
          ))
        )}

        {tab==="verify"&&(pendingVerify.length===0
          ?<EmptyState title="No pending verifications" sub="All artist verification requests are resolved."/>
          :pendingVerify.map(a=>(
            <div key={a.id} style={{background:T.bg2,border:`1px solid ${T.border}`,borderRadius:10,padding:"14px 16px",marginBottom:10}}>
              <div style={{display:"flex",gap:10,alignItems:"center",marginBottom:12}}>
                {a.avatar?<img src={a.avatar} style={{width:40,height:40,borderRadius:"50%",objectFit:"cover"}} alt=""/>:<div style={{width:40,height:40,borderRadius:"50%",background:`${T.blue}18`,display:"flex",alignItems:"center",justifyContent:"center",color:T.blue,fontWeight:700,fontSize:16}}>{a.name[0]}</div>}
                <div><div style={{color:T.text,fontSize:13,fontWeight:600}}>{a.name}</div><div style={{color:T.sub,fontSize:11}}>{a.genre} · {a.country}</div></div>
              </div>
              <div style={{display:"flex",gap:8}}>
                <Btn flex={1} color={T.green} onClick={()=>verifyArtist(a.id)}>✓ Verify Artist</Btn>
                <BtnGhost flex={1} onClick={()=>{setRegisteredUsers(uu=>uu.map(u=>u.id===a.id?{...u,verificationStatus:"Rejected"}:u));toast("Verification rejected");}}>Reject</BtnGhost>
              </div>
            </div>
          ))
        )}
      </div>
    </Modal>
  );
}


// ─── LIBRARY PAGE ─────────────────────────────────────────────────────────────
function LibraryPage({songs,currentUser,playlists,onPlay,isPlaying,currentSong,onOpen,onCreatePlaylist,onDeletePlaylist,onRemoveSong,toast,setPage}){
  const [tab,setTab]=useState("liked");
  const liked=songs.filter(s=>currentUser?.liked?.includes(s.id)&&s.status==="Approved");
  const following=(currentUser?.following||[]);

  return(
    <section style={{padding:"0 0 20px"}}>
      <div style={{padding:"20px 16px 0"}}>
        <h2 style={{color:T.text,fontFamily:"'Syne',sans-serif",fontSize:17,marginBottom:16}}>Your Library</h2>
        <div style={{display:"flex",gap:0,background:T.bg2,borderRadius:10,border:`1px solid ${T.border}`,padding:3,marginBottom:20}}>
          {[["liked","♥ Liked"],["playlists","🎶 Playlists"],["following","👤 Following"]].map(([k,l])=>(
            <button key={k} style={{flex:1,padding:"8px 6px",borderRadius:7,border:"none",cursor:"pointer",fontSize:11,fontWeight:700,background:tab===k?T.blue:"transparent",color:tab===k?"#fff":T.sub,transition:"all .18s",fontFamily:"'DM Sans',sans-serif",whiteSpace:"nowrap"}} onClick={()=>setTab(k)}>{l}</button>
          ))}
        </div>
      </div>

      {tab==="liked"&&(
        liked.length===0
          ?<EmptyState title="No liked songs" sub="Tap the heart on any track." icon={<span style={{fontSize:24}}>♥</span>}/>
          :<div style={{padding:"0 16px",display:"flex",flexDirection:"column",gap:6}}>
            {liked.map(s=>(
              <div key={s.id} style={{display:"flex",gap:12,alignItems:"center",background:T.card,border:`1px solid ${currentSong?.id===s.id?T.blueBorder:T.border}`,borderRadius:8,padding:"10px 12px",cursor:"pointer"}} onClick={()=>onPlay(s)}>
                <img src={s.cover} alt="" style={{width:42,height:42,borderRadius:6,objectFit:"cover",flexShrink:0}}/>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{color:T.text,fontSize:13,fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{s.title}</div>
                  <div style={{color:T.sub,fontSize:11}}>{s.artist}</div>
                </div>
                {currentSong?.id===s.id&&<Eq active={isPlaying} size={13} color={T.blue}/>}
                <button style={{background:"none",border:"none",color:T.mute,fontSize:14,cursor:"pointer"}} onClick={e=>{e.stopPropagation();onOpen(s);}}>···</button>
              </div>
            ))}
          </div>
      )}

      {tab==="playlists"&&(
        <div style={{padding:"0 16px"}}>
          <PlaylistsPage playlists={playlists} songs={songs} onPlay={onPlay} isPlaying={isPlaying} currentSong={currentSong} onCreatePlaylist={onCreatePlaylist} onDeletePlaylist={onDeletePlaylist} onRenamePlaylist={()=>{}} onRemoveSong={onRemoveSong} onOpen={onOpen} toast={toast}/>
        </div>
      )}

      {tab==="following"&&(
        following.length===0
          ?<EmptyState title="Not following anyone" sub="Follow artists to see them here." icon={<span style={{fontSize:24}}>👤</span>} onCTA={()=>setPage("artists")} ctaLabel="Browse Artists"/>
          :<div style={{padding:"0 16px",display:"flex",flexDirection:"column",gap:6}}>
            {following.map(id=>{
              const artist=/* will fill from registeredUsers below */ ({id,name:"Artist"});
              return null;
            })}
          </div>
      )}
    </section>
  );
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
export default function MWPlay(){
  const [registeredUsers,setRegisteredUsers]=useState(()=>LS.get("users",[]));
  const [songs,setSongs]=useState(()=>LS.get("songs",[]));
  const [currentUser,setCurrentUser]=useState(()=>LS.get("currentUser",null));
  const [isAdmin,setIsAdmin]=useState(false);
  const [page,setPage]=useState("home");
  const [currentSong,setCurrentSong]=useState(null);
  const [isPlaying,setIsPlaying]=useState(false);
  const [progress,setProgress]=useState(0);
  const [volume,setVolume]=useState(()=>LS.get("volume",0.8));
  const [search,setSearch]=useState("");
  const [activeGenre,setActiveGenre]=useState(null);
  const [modal,setModal]=useState(null);
  const [openSong,setOpenSong]=useState(null);
  const [openArtist,setOpenArtist]=useState(null);
  const [shuffle,setShuffle]=useState(false);
  const [repeat,setRepeat]=useState(false);
  const [shareTarget,setShareTarget]=useState(null);
  const [downloadTarget,setDownloadTarget]=useState(null);
  const [addToPlaylistTarget,setAddToPlaylistTarget]=useState(null);
  const [showVerify,setShowVerify]=useState(false);
  const [showNotifs,setShowNotifs]=useState(false);
  const timerRef=useRef(null);
  const audioRef=useRef(null);
  const {toasts,show:toast}=useToast();
  const {notifs,unread,addNotif,markRead,clearAll}=useNotifications(currentUser);
  const {playlists,createPlaylist,deletePlaylist,renamePlaylist,addSong:addToPlaylist,removeSong:removeFromPlaylist}=usePlaylists(currentUser?.id);

  useEffect(()=>{LS.set("users",registeredUsers);},[registeredUsers]);
  useEffect(()=>{LS.set("songs",songs);},[songs]);
  useEffect(()=>{LS.set("currentUser",currentUser);},[currentUser]);

  // Check admin status against the secure `admins` table (db-enforced)
  useEffect(()=>{
    let active=true;
    if(!currentUser?.id){setIsAdmin(false);return;}
    db.isAdmin(currentUser.id).then(ok=>{if(active)setIsAdmin(ok);}).catch(()=>{if(active)setIsAdmin(false);});
    return()=>{active=false;};
  },[currentUser?.id]);
  // Load the shared song catalog from Supabase + keep it live via realtime
  useEffect(()=>{
    if(!isSupabaseReady)return;
    let active=true;
    db.getSongs().then(rows=>{if(active)setSongs(rows.map(songFromDb));}).catch(()=>{});
    const sub=subscribeToSongs(payload=>{
      setSongs(ss=>{
        if(payload.eventType==="INSERT"){
          const ns=songFromDb(payload.new);
          return ss.some(s=>s.id===ns.id)?ss.map(s=>s.id===ns.id?ns:s):[...ss,ns];
        }
        if(payload.eventType==="UPDATE"){
          const ns=songFromDb(payload.new);
          return ss.map(s=>s.id===ns.id?{...s,...ns}:s);
        }
        if(payload.eventType==="DELETE")return ss.filter(s=>s.id!==payload.old.id);
        return ss;
      });
    });
    return()=>{active=false;sub.unsubscribe();};
  },[]);

  // Load the shared artist/user directory from Supabase + keep it live via realtime
  useEffect(()=>{
    if(!isSupabaseReady)return;
    let active=true;
    db.getProfiles().then(rows=>{
      if(!active)return;
      setRegisteredUsers(prev=>rows.map(r=>{
        const np=profileFromDb(r);
        const existing=prev.find(p=>p.id===np.id);
        // Preserve local-only fields (liked/following) until they're re-synced
        return existing?{...np,liked:existing.liked||[],following:existing.following||[]}:np;
      }));
    }).catch(()=>{});
    const sub=subscribeToProfiles(payload=>{
      setRegisteredUsers(uu=>{
        if(payload.eventType==="INSERT"){
          const np=profileFromDb(payload.new);
          return uu.some(u=>u.id===np.id)?uu.map(u=>u.id===np.id?{...u,...np}:u):[...uu,np];
        }
        if(payload.eventType==="UPDATE"){
          const np=profileFromDb(payload.new);
          return uu.map(u=>u.id===np.id?{...u,...np,liked:u.liked,following:u.following}:u);
        }
        if(payload.eventType==="DELETE")return uu.filter(u=>u.id!==payload.old.id);
        return uu;
      });
      // Keep currentUser in sync too (e.g. admin verifies this user elsewhere)
      if(payload.eventType==="UPDATE"){
        const np=profileFromDb(payload.new);
        setCurrentUser(cu=>cu&&cu.id===np.id?{...cu,...np,liked:cu.liked,following:cu.following}:cu);
      }
    });
    return()=>{active=false;sub.unsubscribe();};
  },[]);

  // Sync this user's likes/following from Supabase on login
  useEffect(()=>{
    if(!currentUser?.id||!isSupabaseReady)return;
    let active=true;
    Promise.all([db.getLikes(currentUser.id),db.getFollowing(currentUser.id)]).then(([liked,following])=>{
      if(!active)return;
      setCurrentUser(u=>u&&u.id===currentUser.id?{...u,liked,following}:u);
    }).catch(()=>{});
    return()=>{active=false;};
  },[currentUser?.id]);

  useEffect(()=>{LS.set("volume",volume);},[volume]);

  // Real audio
  useEffect(()=>{
    if(!currentSong)return;
    if(currentSong.audioUrl){
      if(!audioRef.current)audioRef.current=new Audio();
      if(audioRef.current.src!==currentSong.audioUrl){audioRef.current.src=currentSong.audioUrl;audioRef.current.volume=volume;setProgress(0);}
      if(isPlaying)audioRef.current.play().catch(()=>{});
      else audioRef.current.pause();
    }
  },[currentSong,isPlaying]);
  useEffect(()=>{if(audioRef.current)audioRef.current.volume=volume;},[volume]);
  useEffect(()=>{
    if(audioRef.current&&currentSong?.audioUrl){
      const au=audioRef.current;
      const update=()=>{if(au.duration)setProgress(au.currentTime/au.duration);};
      const ended=()=>{if(repeat){au.currentTime=0;setIsPlaying(true);}else nextSong();};
      au.addEventListener("timeupdate",update);au.addEventListener("ended",ended);
      return()=>{au.removeEventListener("timeupdate",update);au.removeEventListener("ended",ended);};
    }
  },[currentSong,repeat]);
  useEffect(()=>{
    if(currentSong?.audioUrl)return;
    if(isPlaying){timerRef.current=setInterval(()=>setProgress(p=>{if(p>=1){setIsPlaying(false);return 0;}return p+1/222;}),1000);}
    else clearInterval(timerRef.current);
    return()=>clearInterval(timerRef.current);
  },[isPlaying,currentSong]);

  const approvedSongs=useMemo(()=>songs.filter(s=>s.status==="Approved"),[songs]);
  const artistUsers=useMemo(()=>registeredUsers.filter(u=>u.role==="artist"),[registeredUsers]);

  const playSong=useCallback(song=>{
    if(currentSong?.id===song.id){setIsPlaying(p=>!p);}
    else{setCurrentSong(song);setIsPlaying(true);setProgress(0);}
    setSongs(ss=>ss.map(s=>s.id===song.id?{...s,plays:s.plays+1}:s));
    if(isSupabaseReady)db.incrementPlays(song.id).catch(()=>{});
  },[currentSong]);

  const nextSong=useCallback(()=>{
    if(shuffle){const pool=approvedSongs.filter(s=>s.id!==currentSong?.id);if(pool.length>0){const s=pool[Math.floor(Math.random()*pool.length)];setCurrentSong(s);setProgress(0);setIsPlaying(true);return;}}
    const i=approvedSongs.findIndex(s=>s.id===currentSong?.id);
    const n=approvedSongs[(i+1)%approvedSongs.length];
    if(n){setCurrentSong(n);setProgress(0);setIsPlaying(true);}
  },[approvedSongs,currentSong,shuffle]);

  const prevSong=useCallback(()=>{
    if(progress>0.05){setProgress(0);if(audioRef.current)audioRef.current.currentTime=0;return;}
    const i=approvedSongs.findIndex(s=>s.id===currentSong?.id);
    const p=approvedSongs[(i-1+approvedSongs.length)%approvedSongs.length];
    if(p){setCurrentSong(p);setProgress(0);setIsPlaying(true);}
  },[approvedSongs,currentSong,progress]);

  const handleSeek=val=>{
    setProgress(val);
    if(audioRef.current&&currentSong?.audioUrl)audioRef.current.currentTime=val*audioRef.current.duration;
  };

  const handleAuth=(user,isNew=false)=>{
    if(isNew){setRegisteredUsers(u=>[...u,user]);addNotif("upload","Welcome to MW Play! 🎵 Start exploring.");}
    else toast("Welcome back, "+user.name+" 👋");
    setCurrentUser(user);
  };

  const handleLike=song=>{
    if(!currentUser){setModal("login");return;}
    const isLiked=currentUser.liked?.includes(song.id);
    const updated={...currentUser,liked:isLiked?(currentUser.liked||[]).filter(id=>id!==song.id):[...(currentUser.liked||[]),song.id]};
    setCurrentUser(updated);setRegisteredUsers(uu=>uu.map(u=>u.id===currentUser.id?updated:u));
    setSongs(ss=>ss.map(s=>s.id===song.id?{...s,likes:Math.max(0,s.likes+(isLiked?-1:1))}:s));
    if(isSupabaseReady)db.toggleLike(currentUser.id,song.id).catch(()=>{});
    if(!isLiked){toast("Added to Liked Songs ♥","success");addNotif("like",`You liked "${song.title}"`);}
  };

  const handleFollow=artist=>{
    if(!currentUser){setModal("login");return;}
    const isFollowing=currentUser.following?.includes(artist.id);
    const updated={...currentUser,following:isFollowing?(currentUser.following||[]).filter(id=>id!==artist.id):[...(currentUser.following||[]),artist.id]};
    setCurrentUser(updated);setRegisteredUsers(uu=>uu.map(u=>u.id===currentUser.id?updated:u));
    if(isSupabaseReady)db.toggleFollow(currentUser.id,artist.id).catch(()=>{});
    toast(isFollowing?"Unfollowed "+artist.name:"Following "+artist.name+" 🎤","success");
    if(!isFollowing)addNotif("follow","You are now following "+artist.name);
  };

  const handleUpdateUser=updated=>{setCurrentUser(updated);setRegisteredUsers(uu=>uu.map(u=>u.id===updated.id?updated:u));};

  const handleVerifySubmit=request=>{
    setRegisteredUsers(uu=>uu.map(u=>u.id===currentUser.id?{...u,verificationStatus:"Pending"}:u));
    setCurrentUser(u=>({...u,verificationStatus:"Pending"}));
    addNotif("verify","Your verification request has been submitted! We'll review within 3–5 days.");
  };

  const handleAlbumUpload=newSongs=>{
    setSongs(ss=>[...ss,...newSongs]);
    addNotif("upload",`Album "${newSongs[0]?.albumName||"Untitled"}" submitted for review (${newSongs.length} tracks)`);
  };

  const handleDownload=song=>{
    if(!currentUser){setModal("login");return;}
    setDownloadTarget(song);
  };

  const handleAddToPlaylistAction=(playlistId,songId)=>addToPlaylist(playlistId,songId);
  const handleCreateAndAddToPlaylist=(name,songId)=>{const pl=createPlaylist(name);addToPlaylist(pl.id,songId);};

  const trending=approvedSongs.filter(s=>s.trending);
  const newReleases=[...approvedSongs].sort((a,b)=>new Date(b.uploadedAt||b.release||0)-new Date(a.uploadedAt||a.release||0)).slice(0,8);
  const topPlayed=[...approvedSongs].sort((a,b)=>b.plays-a.plays).slice(0,6);
  const duration=currentSong?.durationSecs||(audioRef.current?.duration)||222;

  const showSongPage=!!openSong;
  const showArtistPage=!!openArtist&&!openSong;

  // Upload choice modal
  const UploadChoice=()=>(
    <Modal onClose={()=>setModal(null)} maxWidth={360}>
      <ModalHeader title="What to upload?" onClose={()=>setModal(null)}/>
      <div style={{display:"flex",flexDirection:"column",gap:10}}>
        <button style={{background:T.bg2,border:`1px solid ${T.border}`,borderRadius:12,padding:"18px 16px",cursor:"pointer",textAlign:"left",display:"flex",gap:14,alignItems:"center"}} onClick={()=>setModal("upload")}>
          <span style={{fontSize:28}}>🎵</span>
          <div><div style={{color:T.text,fontSize:14,fontWeight:700,fontFamily:"'Syne',sans-serif"}}>Single Track</div><div style={{color:T.sub,fontSize:11,marginTop:2}}>Upload one song · {UPLOAD_FEE_LABEL}</div></div>
        </button>
        <button style={{background:T.bg2,border:`1px solid ${T.border}`,borderRadius:12,padding:"18px 16px",cursor:"pointer",textAlign:"left",display:"flex",gap:14,alignItems:"center"}} onClick={()=>setModal("album_upload")}>
          <span style={{fontSize:28}}>💿</span>
          <div><div style={{color:T.text,fontSize:14,fontWeight:700,fontFamily:"'Syne',sans-serif"}}>Album / EP</div><div style={{color:T.sub,fontSize:11,marginTop:2}}>Multiple tracks · {UPLOAD_FEE_LABEL} per track</div></div>
        </button>
      </div>
    </Modal>
  );

  return(
    <div style={{fontFamily:"'DM Sans',sans-serif",background:T.bg,color:T.text,minHeight:"100vh",position:"relative",overflow:"hidden"}}>
      <style>{APP_CSS}</style>
      <Toast toasts={toasts}/>

      <div style={{position:"relative",height:"100vh",overflow:"hidden"}}>
        {/* ── MAIN PAGES ── */}
        <PageSlide show={!showSongPage&&!showArtistPage}>
          {/* TOP NAV */}
          <nav style={{position:"sticky",top:0,zIndex:100,background:`rgba(7,10,16,.97)`,backdropFilter:"blur(20px)",borderBottom:`1px solid ${T.border}`,padding:"0 16px",height:52,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
            <Logo size={17}/>
            <div style={{display:"flex",gap:8,alignItems:"center"}}>
              {currentUser&&<button style={{position:"relative",background:"none",border:"none",cursor:"pointer",padding:4,color:T.sub,display:"flex"}} onClick={()=>setShowNotifs(true)}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0"/></svg>
                {unread>0&&<div style={{position:"absolute",top:0,right:0,width:14,height:14,borderRadius:"50%",background:T.red,color:"#fff",fontSize:8,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center"}}>{unread>9?"9+":unread}</div>}
              </button>}
              {currentUser?.role==="artist"&&<Btn onClick={()=>setModal("upload_choice")} style={{padding:"5px 12px",fontSize:10}}>+ Upload</Btn>}
              {currentUser
                ?currentUser.avatar
                  ?<img src={currentUser.avatar} style={{width:30,height:30,borderRadius:"50%",objectFit:"cover",border:`1px solid ${T.blueBorder}`,cursor:"pointer"}} alt="" onClick={()=>setPage("profile")}/>
                  :<div style={{width:30,height:30,borderRadius:"50%",background:`${T.blue}18`,border:`1px solid ${T.blueBorder}`,display:"flex",alignItems:"center",justifyContent:"center",color:T.blue,fontWeight:700,fontSize:12,cursor:"pointer",fontFamily:"'Syne',sans-serif"}} onClick={()=>setPage("profile")}>{currentUser.name[0].toUpperCase()}</div>
                :<Btn onClick={()=>setModal("signup")} style={{padding:"6px 14px",fontSize:11}}>Join Free</Btn>}
            </div>
          </nav>

          {/* SEARCH */}
          <div style={{padding:"8px 14px",background:`rgba(7,10,16,.97)`,borderBottom:`1px solid ${T.border}`}}>
            <div style={{display:"flex",alignItems:"center",gap:8,background:T.bg1,border:`1px solid ${T.border}`,borderRadius:24,padding:"7px 14px",maxWidth:580,margin:"0 auto"}}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={T.mute} strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              <input style={{background:"none",border:"none",color:T.text,fontSize:13,outline:"none",fontFamily:"'DM Sans',sans-serif",width:"100%"}} placeholder="Search tracks, artists, genres..." value={search} onChange={e=>setSearch(e.target.value)}/>
              {search&&<button style={{background:"none",border:"none",color:T.mute,cursor:"pointer",fontSize:12}} onClick={()=>setSearch("")}>✕</button>}
            </div>
          </div>

          {/* PAGE CONTENT */}
          {search?(
            <section style={{padding:"20px 16px"}}>
              {(()=>{
                const q=search.toLowerCase();
                const tracks=approvedSongs.filter(s=>s.title.toLowerCase().includes(q)||s.artist.toLowerCase().includes(q)||s.genre.toLowerCase().includes(q));
                const arts=artistUsers.filter(a=>a.name.toLowerCase().includes(q));
                return tracks.length===0&&arts.length===0
                  ?<EmptyState title="No results" sub="Try a different search term."/>
                  :<>
                    {arts.length>0&&<><h3 style={{color:T.sub,fontSize:10,fontWeight:700,letterSpacing:1,marginBottom:10}}>ARTISTS</h3>
                      <div style={{display:"flex",gap:10,flexWrap:"wrap",marginBottom:20}}>
                        {arts.map(a=>(
                          <div key={a.id} style={{display:"flex",gap:10,alignItems:"center",background:T.card,border:`1px solid ${T.border}`,borderRadius:10,padding:"10px 14px",cursor:"pointer"}} onClick={()=>setOpenArtist(a)}>
                            {a.avatar?<img src={a.avatar} style={{width:36,height:36,borderRadius:"50%",objectFit:"cover"}} alt=""/>:<div style={{width:36,height:36,borderRadius:"50%",background:`${T.blue}18`,display:"flex",alignItems:"center",justifyContent:"center",color:T.blue,fontWeight:700}}>{a.name[0]}</div>}
                            <div><div style={{color:T.text,fontSize:12,fontWeight:600}}>{a.name}{a.verified&&<span style={{color:T.green,fontSize:10,marginLeft:4}}>✓</span>}</div><div style={{color:T.sub,fontSize:10}}>{a.genre}</div></div>
                          </div>
                        ))}
                      </div></>}
                    {tracks.length>0&&<><h3 style={{color:T.sub,fontSize:10,fontWeight:700,letterSpacing:1,marginBottom:12}}>TRACKS ({tracks.length})</h3>
                      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(148px,1fr))",gap:12}}>
                        {tracks.map(s=><SongCard key={s.id} song={s} onPlay={playSong} isPlaying={isPlaying} isActive={currentSong?.id===s.id} onOpen={setOpenSong} currentUser={currentUser} onLike={handleLike} onShare={setShareTarget} onAddToPlaylist={setAddToPlaylistTarget}/>)}
                      </div></>}
                  </>;
              })()}
            </section>
          ):page==="home"?(
            <>
              <div style={{position:"relative",overflow:"hidden",padding:"40px 20px 32px"}}>
                <div style={{position:"absolute",top:-80,left:-60,width:320,height:320,background:`radial-gradient(circle,${T.blue}0F 0%,transparent 70%)`,pointerEvents:"none"}}/>
                <div style={{position:"absolute",bottom:-80,right:-40,width:260,height:260,background:`radial-gradient(circle,${T.green}08 0%,transparent 70%)`,pointerEvents:"none"}}/>
                <div style={{position:"relative",zIndex:1,maxWidth:480}}>
                  <div style={{display:"inline-block",background:`${T.blue}14`,color:T.blue,fontSize:10,fontWeight:700,padding:"4px 12px",borderRadius:20,marginBottom:14,border:`1px solid ${T.blueBorder}`,letterSpacing:.5}}>🌍 Africa's Music Platform</div>
                  <h1 style={{fontSize:"clamp(24px,5vw,40px)",fontFamily:"'Syne',sans-serif",fontWeight:900,lineHeight:1.1,marginBottom:10,color:T.text}}>
                    Where Artists<br/>
                    <span style={{background:`linear-gradient(135deg,${T.orange},${T.green})`,WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>Get Heard</span>
                  </h1>
                  <p style={{color:T.sub,fontSize:13,lineHeight:1.7,maxWidth:340,marginBottom:20}}>Real music, real artists. Upload, stream, and connect with listeners across Africa.</p>
                  {!currentUser
                    ?<div style={{display:"flex",gap:10,flexWrap:"wrap"}}><Btn onClick={()=>setModal("signup")} style={{padding:"11px 22px"}}>Start as Artist</Btn><BtnGhost onClick={()=>setModal("login")} style={{padding:"11px 22px"}}>Sign in</BtnGhost></div>
                    :currentUser.role==="artist"
                      ?<Btn onClick={()=>setModal("upload_choice")} style={{padding:"11px 22px"}}>+ Upload Music</Btn>
                      :<p style={{color:T.sub,fontSize:13}}>Welcome back, {currentUser.name} 👋</p>}
                </div>
              </div>

              <div style={{display:"flex",borderTop:`1px solid ${T.border}`,borderBottom:`1px solid ${T.border}`,background:T.bg1}}>
                {[[approvedSongs.length,"Tracks"],[artistUsers.length,"Artists"],[approvedSongs.reduce((a,s)=>a+s.plays,0),"Plays"]].map(([v,l],i)=>(
                  <div key={l} style={{flex:1,textAlign:"center",padding:"12px 0",borderRight:i<2?`1px solid ${T.border}`:"none"}}>
                    <div style={{color:T.text,fontWeight:700,fontFamily:"'Syne',sans-serif",fontSize:16}}>{fmtNum(v)}</div>
                    <div style={{color:T.mute,fontSize:10,marginTop:1}}>{l}</div>
                  </div>
                ))}
              </div>

              {trending.length>0&&<section style={{padding:"24px 16px"}}>
                <h2 style={{color:T.text,fontFamily:"'Syne',sans-serif",fontSize:16,fontWeight:700,marginBottom:14}}>🔥 Trending Now</h2>
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(148px,1fr))",gap:12}}>
                  {trending.map(s=><SongCard key={s.id} song={s} onPlay={playSong} isPlaying={isPlaying} isActive={currentSong?.id===s.id} onOpen={setOpenSong} currentUser={currentUser} onLike={handleLike} onShare={setShareTarget} onAddToPlaylist={setAddToPlaylistTarget}/>)}
                </div>
              </section>}

              <RecommendationsSection currentUser={currentUser} songs={songs} currentSong={currentSong} onPlay={playSong} isPlaying={isPlaying} onOpen={setOpenSong}/>

              {newReleases.length>0&&<section style={{padding:"24px 16px",background:T.bg1}}>
                <h2 style={{color:T.text,fontFamily:"'Syne',sans-serif",fontSize:16,fontWeight:700,marginBottom:14}}>🆕 New Releases</h2>
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(148px,1fr))",gap:12}}>
                  {newReleases.map(s=><SongCard key={s.id} song={s} onPlay={playSong} isPlaying={isPlaying} isActive={currentSong?.id===s.id} onOpen={setOpenSong} currentUser={currentUser} onLike={handleLike} onShare={setShareTarget} onAddToPlaylist={setAddToPlaylistTarget}/>)}
                </div>
              </section>}

              {topPlayed.length>0&&<section style={{padding:"24px 16px"}}>
                <h2 style={{color:T.text,fontFamily:"'Syne',sans-serif",fontSize:16,fontWeight:700,marginBottom:14}}>📊 Most Played</h2>
                <div style={{display:"flex",flexDirection:"column",gap:6}}>
                  {topPlayed.map((s,i)=>(
                    <div key={s.id} style={{display:"flex",gap:12,alignItems:"center",background:T.card,border:`1px solid ${currentSong?.id===s.id?T.blueBorder:T.border}`,borderRadius:8,padding:"10px 12px",cursor:"pointer"}} onClick={()=>playSong(s)}>
                      <span style={{color:i<3?T.orange:T.mute,fontWeight:700,fontSize:13,width:20,flexShrink:0,textAlign:"center"}}>{i+1}</span>
                      <img src={s.cover} alt="" style={{width:40,height:40,borderRadius:6,objectFit:"cover",flexShrink:0}}/>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{color:T.text,fontSize:13,fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{s.title}</div>
                        <div style={{color:T.sub,fontSize:11}}>{s.artist}</div>
                      </div>
                      {currentSong?.id===s.id&&<Eq active={isPlaying} size={13} color={T.blue}/>}
                      <div style={{color:T.mute,fontSize:11,flexShrink:0}}>{fmtNum(s.plays)}</div>
                    </div>
                  ))}
                </div>
              </section>}

              {trending.length===0&&newReleases.length===0&&<EmptyState title="No music yet" sub="Be the first artist to upload!" onCTA={()=>setModal(currentUser?.role==="artist"?"upload_choice":"signup")} ctaLabel={currentUser?.role==="artist"?"Upload Now":"Join as Artist"}/>}

              <footer style={{background:T.bg,borderTop:`1px solid ${T.border}`,padding:"28px 16px",textAlign:"center"}}>
                <Logo size={15}/>
                <p style={{color:T.mute,fontSize:11,marginTop:6,marginBottom:12}}>Africa's premium music platform</p>
                <p style={{color:T.border2,fontSize:10}}>© {new Date().getFullYear()} MW Play · All rights reserved</p>
              </footer>
            </>
          ):page==="discover"?(
            <section style={{padding:"24px 16px"}}>
              <h2 style={{color:T.text,fontFamily:"'Syne',sans-serif",fontSize:17,marginBottom:18}}>Browse Genres</h2>
              <div style={{display:"flex",flexWrap:"wrap",gap:7,marginBottom:22}}>
                {GENRES.map(g=>(
                  <div key={g.name} style={{padding:"7px 15px",borderRadius:50,border:`1px solid ${activeGenre===g.name?g.color+"66":T.border}`,cursor:"pointer",background:activeGenre===g.name?`${g.color}18`:"transparent",color:activeGenre===g.name?g.color:T.sub,fontSize:12,fontWeight:500,transition:"all .15s"}} onClick={()=>setActiveGenre(activeGenre===g.name?null:g.name)}>{g.name}</div>
                ))}
              </div>
              {activeGenre
                ?<>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
                    <h3 style={{color:T.text,fontSize:14,fontWeight:700}}>{activeGenre}</h3>
                    <span style={{color:T.mute,fontSize:11}}>{approvedSongs.filter(s=>s.genre===activeGenre).length} tracks</span>
                  </div>
                  {approvedSongs.filter(s=>s.genre===activeGenre).length===0
                    ?<EmptyState title={`No ${activeGenre} tracks yet`} sub="Artists will upload in this genre soon."/>
                    :<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(148px,1fr))",gap:12}}>
                      {approvedSongs.filter(s=>s.genre===activeGenre).map(s=><SongCard key={s.id} song={s} onPlay={playSong} isPlaying={isPlaying} isActive={currentSong?.id===s.id} onOpen={setOpenSong} currentUser={currentUser} onLike={handleLike} onShare={setShareTarget} onAddToPlaylist={setAddToPlaylistTarget}/>)}
                    </div>}
                </>
                :<>
                  {approvedSongs.length>0
                    ?<><h3 style={{color:T.sub,fontSize:10,fontWeight:700,letterSpacing:1,marginBottom:14}}>ALL TRACKS</h3>
                      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(148px,1fr))",gap:12}}>
                        {approvedSongs.map(s=><SongCard key={s.id} song={s} onPlay={playSong} isPlaying={isPlaying} isActive={currentSong?.id===s.id} onOpen={setOpenSong} currentUser={currentUser} onLike={handleLike} onShare={setShareTarget} onAddToPlaylist={setAddToPlaylistTarget}/>)}
                      </div></>
                    :<EmptyState title="No tracks yet" sub="Artists will upload music soon."/>}
                </>}
            </section>
          ):page==="artists"?(
            <section style={{padding:"24px 16px"}}>
              <h2 style={{color:T.text,fontFamily:"'Syne',sans-serif",fontSize:17,marginBottom:18}}>Artists</h2>
              {artistUsers.length===0
                ?<EmptyState title="No artists yet" sub="When artists register, their profiles appear here." onCTA={()=>setModal("signup")} ctaLabel="Join as Artist"/>
                :<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(140px,1fr))",gap:12}}>
                  {artistUsers.map(a=>(
                    <div key={a.id} className="mwcard" style={{background:T.card,borderRadius:10,padding:"16px 12px",textAlign:"center",border:`1px solid ${T.border}`,cursor:"pointer"}} onClick={()=>setOpenArtist(a)}>
                      {a.avatar?<img src={a.avatar} alt={a.name} style={{width:60,height:60,borderRadius:"50%",objectFit:"cover",border:`1px solid ${T.border}`,marginBottom:8}}/>
                        :<div style={{width:60,height:60,borderRadius:"50%",background:`${T.blue}14`,border:`1px solid ${T.blueBorder}`,display:"flex",alignItems:"center",justifyContent:"center",color:T.blue,fontWeight:700,fontSize:20,fontFamily:"'Syne',sans-serif",margin:"0 auto 8px"}}>{a.name[0].toUpperCase()}</div>}
                      <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:4}}><div style={{color:T.text,fontSize:13,fontWeight:600}}>{a.name}</div>{a.verified&&<span style={{color:T.green,fontSize:11}}>✓</span>}</div>
                      <div style={{color:T.sub,fontSize:11,marginBottom:2}}>{a.genre}</div>
                      <div style={{color:T.mute,fontSize:10}}>{songs.filter(s=>s.artistId===a.id&&s.status==="Approved").length} tracks</div>
                    </div>
                  ))}
                </div>}
            </section>
          ):page==="library"?(
            <LibraryPage songs={songs} currentUser={currentUser} playlists={playlists} onPlay={playSong} isPlaying={isPlaying} currentSong={currentSong} onOpen={setOpenSong} onCreatePlaylist={createPlaylist} onDeletePlaylist={deletePlaylist} onRemoveSong={removeFromPlaylist} toast={toast} setPage={setPage}/>
          ):page==="profile"?(
            <section style={{padding:"24px 16px"}}>
              {currentUser?<>
                <div style={{background:T.bg1,border:`1px solid ${T.border}`,borderRadius:16,padding:"22px 18px",marginBottom:14}}>
                  <div style={{display:"flex",gap:14,alignItems:"center",marginBottom:14}}>
                    {currentUser.avatar?<img src={currentUser.avatar} style={{width:58,height:58,borderRadius:"50%",objectFit:"cover",border:`2px solid ${T.blueBorder}`,flexShrink:0}} alt=""/>
                      :<div style={{width:58,height:58,borderRadius:"50%",background:`${T.blue}18`,border:`1px solid ${T.blueBorder}`,display:"flex",alignItems:"center",justifyContent:"center",color:T.blue,fontSize:22,fontWeight:700,fontFamily:"'Syne',sans-serif",flexShrink:0}}>{currentUser.name[0].toUpperCase()}</div>}
                    <div style={{flex:1}}>
                      <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:2}}>
                        <h2 style={{color:T.text,fontFamily:"'Syne',sans-serif",fontSize:17,fontWeight:700}}>{currentUser.name}</h2>
                        {currentUser.verified&&<span style={{background:`${T.green}22`,color:T.green,fontSize:9,fontWeight:700,padding:"1px 6px",borderRadius:20}}>✓ VERIFIED</span>}
                      </div>
                      <p style={{color:T.sub,fontSize:12}}>{currentUser.role==="artist"?"🎤 Artist":"🎧 Listener"} · {currentUser.email}</p>
                      {currentUser.country&&<p style={{color:T.mute,fontSize:11,marginTop:1}}>{currentUser.country}</p>}
                    </div>
                  </div>
                  {currentUser.bio&&<p style={{color:T.sub,fontSize:12,lineHeight:1.6,marginBottom:12}}>{currentUser.bio}</p>}
                  <div style={{display:"flex",gap:18,paddingTop:12,borderTop:`1px solid ${T.border}`}}>
                    {currentUser.role==="artist"&&<div><span style={{color:T.text,fontWeight:700}}>{songs.filter(s=>s.artistId===currentUser.id&&s.status==="Approved").length}</span><span style={{color:T.mute,fontSize:11,marginLeft:4}}>tracks</span></div>}
                    <div><span style={{color:T.text,fontWeight:700}}>{(currentUser.liked||[]).length}</span><span style={{color:T.mute,fontSize:11,marginLeft:4}}>liked</span></div>
                    <div><span style={{color:T.text,fontWeight:700}}>{(currentUser.following||[]).length}</span><span style={{color:T.mute,fontSize:11,marginLeft:4}}>following</span></div>
                  </div>
                </div>
                <div style={{display:"flex",flexDirection:"column",gap:8}}>
                  {currentUser.role==="artist"&&<>
                    <Btn full onClick={()=>setModal("upload_choice")} style={{padding:12}}>+ Upload Music</Btn>
                    <BtnGhost onClick={()=>setModal("dashboard")} style={{padding:12}}>📊 Artist Dashboard</BtnGhost>
                  </>}
                  <BtnGhost onClick={()=>setPage("library")} style={{padding:12}}>🎶 My Library</BtnGhost>
                  <BtnGhost onClick={()=>setShowNotifs(true)} style={{padding:12,position:"relative"}}>
                    🔔 Notifications {unread>0&&<span style={{background:T.red,color:"#fff",fontSize:10,fontWeight:700,padding:"0 5px",borderRadius:20,marginLeft:6}}>{unread}</span>}
                  </BtnGhost>
                  {isAdmin&&<BtnGhost onClick={()=>setModal("admin")} style={{padding:10,fontSize:11,color:T.mute}}>⚙ Admin Panel</BtnGhost>}
                  <button style={{background:"none",border:`1px solid ${T.border}`,borderRadius:8,padding:"10px 18px",fontSize:12,fontWeight:600,cursor:"pointer",color:T.mute,fontFamily:"'DM Sans',sans-serif"}} onClick={async()=>{if(audioRef.current){audioRef.current.pause();audioRef.current.src="";}try{await authSignOut();}catch(e){}setCurrentUser(null);setPage("home");setCurrentSong(null);setIsPlaying(false);toast("Signed out");}}>Sign out</button>
                </div>
              </>:<EmptyState title="Not signed in" sub="Sign in or create an account." onCTA={()=>setModal("login")} ctaLabel="Sign in"/>}
            </section>
          ):null}
        </PageSlide>

        {/* SONG DETAIL PAGE */}
        <PageSlide show={showSongPage}>
          <BackNav label="TRACK" onBack={()=>setOpenSong(null)}/>
          {openSong&&<SongPage song={openSong} onPlay={playSong} isPlaying={isPlaying} isActive={currentSong?.id===openSong.id} currentUser={currentUser} onLike={handleLike} allSongs={approvedSongs} toast={toast} onShare={setShareTarget} onDownload={handleDownload} onAddToPlaylist={setAddToPlaylistTarget} addNotif={addNotif}/>}
        </PageSlide>

        {/* ARTIST PAGE */}
        <PageSlide show={showArtistPage}>
          <BackNav label="ARTIST" onBack={()=>setOpenArtist(null)}/>
          {openArtist&&<ArtistProfilePage artist={openArtist} onPlay={playSong} songs={songs} isPlaying={isPlaying} currentSong={currentSong} currentUser={currentUser} onFollowToggle={handleFollow} onShare={setShareTarget} onDownload={handleDownload} toast={toast}/>}
        </PageSlide>
      </div>

      <Player song={currentSong} isPlaying={isPlaying} onPlayPause={()=>setIsPlaying(p=>!p)} onNext={nextSong} onPrev={prevSong} progress={progress} duration={duration} onSeek={handleSeek} volume={volume} onVolume={setVolume} onOpen={setOpenSong} shuffle={shuffle} onShuffle={()=>setShuffle(s=>!s)} repeat={repeat} onRepeat={()=>setRepeat(r=>!r)}/>
      <BottomNav page={page} setPage={p=>setPage(p)} currentUser={currentUser} setModal={setModal} notifCount={unread}/>

      {/* MODALS */}
      {(modal==="login"||modal==="signup")&&<AuthModal mode={modal} onClose={()=>setModal(null)} onAuth={handleAuth} registeredUsers={registeredUsers}/>}
      {modal==="upload_choice"&&currentUser?.role==="artist"&&<UploadChoice/>}
      {modal==="upload"&&currentUser?.role==="artist"&&<UploadModal onClose={()=>setModal(null)} currentUser={currentUser} onUpload={s=>{setSongs(ss=>[...ss,s]);addNotif("upload",`"${s.title}" submitted for review`);}} toast={toast}/>}
      {modal==="album_upload"&&currentUser?.role==="artist"&&<AlbumUploadModal onClose={()=>setModal(null)} currentUser={currentUser} onAlbumUpload={handleAlbumUpload} toast={toast}/>}
      {modal==="dashboard"&&currentUser?.role==="artist"&&<ArtistDashboard onClose={()=>setModal(null)} currentUser={currentUser} songs={songs} onUpdateUser={handleUpdateUser} toast={toast} onVerify={()=>{setModal(null);setShowVerify(true);}} verificationStatus={currentUser.verificationStatus}/>}
      {modal==="admin"&&<AdminPanel onClose={()=>setModal(null)} songs={songs} setSongs={setSongs} artists={registeredUsers} setRegisteredUsers={setRegisteredUsers} toast={toast} currentUser={currentUser}/>}
      {shareTarget&&<ShareModal song={shareTarget} onClose={()=>setShareTarget(null)} toast={toast}/>}
      {downloadTarget&&<DownloadModal song={downloadTarget} currentUser={currentUser} onClose={()=>setDownloadTarget(null)} toast={toast} addNotif={addNotif}/>}
      {addToPlaylistTarget&&<AddToPlaylistModal song={addToPlaylistTarget} playlists={playlists} onAdd={handleAddToPlaylistAction} onCreateAndAdd={handleCreateAndAddToPlaylist} onClose={()=>setAddToPlaylistTarget(null)} toast={toast}/>}
      {showVerify&&currentUser?.role==="artist"&&<VerificationModal currentUser={currentUser} onClose={()=>setShowVerify(false)} onSubmit={handleVerifySubmit} toast={toast}/>}
      {showNotifs&&<NotificationsPanel notifs={notifs} unread={unread} markRead={markRead} clearAll={clearAll} onClose={()=>setShowNotifs(false)} onNavigate={()=>{}}/>}
    </div>
  );
}

// ─── CSS ──────────────────────────────────────────────────────────────────────
const APP_CSS=`
  @import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800;900&family=DM+Sans:wght@300;400;500;600;700&family=DM+Mono:wght@400;500&display=swap');
  *{box-sizing:border-box;margin:0;padding:0;}
  ::-webkit-scrollbar{width:3px}::-webkit-scrollbar-track{background:#070A10}::-webkit-scrollbar-thumb{background:#1C2840;border-radius:2px}
  input[type=range]{-webkit-appearance:none;height:2px;border-radius:1px;background:#1C2840}
  input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:10px;height:10px;border-radius:50%;background:#1A8FE3;cursor:pointer}
  input[type=date]::-webkit-calendar-picker-indicator{filter:invert(0.3)}
  select option{background:#0B0F1A;color:#fff}
  input:focus,textarea:focus,select:focus{border-color:#1A8FE344!important;outline:none}
  .mwcard{transition:transform .18s cubic-bezier(0.4,0,0.2,1),box-shadow .18s}
  .mwcard:hover{transform:translateY(-3px)!important;box-shadow:0 10px 30px rgba(0,0,0,.7)!important}
  .mwcard:hover .mwoverlay{opacity:1!important}
  @keyframes mwspin{to{transform:rotate(360deg)}}
  @keyframes mwpulse{0%,100%{opacity:.2}50%{opacity:1}}
  @keyframes mwtoastin{from{opacity:0;transform:translateX(20px)}to{opacity:1;transform:translateX(0)}}
`;
