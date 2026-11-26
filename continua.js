// Muflone, la pagina principale dentro l'app: la sezione «Continua a guardare» (era la Cronologia: un posto solo, ultimi 15 titoli, mai i canali), «Come si usa» e l'avviso di versione nuova. Ciò che stavi guardando
// (il palco con «Riprendi») lo disegna index.html nella prima schermata (palcoH, leggiStoria).
// Si carica dopo la prima schermata (dopoPrimaSchermata) e solo se c'è window.Muflone: nel browser non si scarica.
// Script normale, non un modulo: usa per nome ciò che sta nella pagina ($, esc, mem, scade, M, osservaLoghi, leggiStoria, disegna,
// copertina, op). Ciò che arriva da Muflone è dato: entra nella pagina solo con esc() o come testo, e gli indirizzi
// solo se sono http(s).
// Ponte con Muflone (muflone/contratti/cronologia.md, «The row on Il Regno»): continua(), cronologia(), togliDaCronologia(pagina),
// svuotaCronologia(), versione(). Ogni chiamata può mancare o dare un errore: allora non si disegna nulla.
(()=>{
const B=window.Muflone; if(!B)return;
// telefono = schermo stretto, o basso (telefono in orizzontale); la TV è 960×540
const Q="(max-width:700px),(max-height:450px)", tel=()=>matchMedia(Q).matches;
const num=x=>typeof x==="number"&&isFinite(x);
const htt=u=>typeof u==="string"&&/^https?:\/\/[^\s/]+/i.test(u);
const lista=f=>{
  try{
    const l=JSON.parse(B[f]());
    return Array.isArray(l)?l.filter(e=>e&&htt(e.pagina)&&typeof e.titolo==="string"&&num(e.secondi)&&num(e.durata)&&num(e.quando)):[];
  }catch(e){return[]}
};

// ---------- stile (si aggiunge qui perché la prima schermata non lo paga) ----------
const css=document.createElement("style");
css.textContent=`
.ct{position:relative;min-width:0}.ct>.ch{width:100%}
.cv{position:relative;overflow:hidden}
.crsotto{font-size:13px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.visto-l{position:absolute;left:0;bottom:0;height:3px;background:var(--red)}
.cop{flex:0 0 auto;width:36px;height:54px;margin:0 11px;border-radius:4px;overflow:hidden;background:var(--plate)}
.cop img{display:block;width:36px;height:54px;object-fit:cover}
.cx{position:absolute;right:0;top:0;width:52px;height:64px;display:flex;align-items:center;justify-content:center;border:0;border-radius:28px;background:none;font-size:20px;color:var(--muted)}
#cron .gruppi{padding:0 32px}#cron .gruppo{margin-top:14px}#cron .gruppo h2{margin:0 0 10px;font-size:15px}#cron .gruppo h2 span{font-weight:400;color:var(--m3);margin-left:6px}
#cron .griglia{grid-template-columns:repeat(2,minmax(0,1fr))}
#cron .ch{height:88px;gap:14px;padding:0 56px 0 8px;content-visibility:visible}
#cron .cx{height:88px;width:56px;display:flex}
.th{position:relative;flex:none;width:128px;height:72px;border-radius:8px;overflow:hidden}
.th img,.th .targa{position:absolute;left:0;top:0;width:100%;height:100%;object-fit:cover}
.sopra{font-size:12px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#cron .info b{font-size:16px;font-weight:700;margin:2px 0 3px}
#cron .crsotto{display:flex;gap:6px;align-items:center}#cron .crsotto>span:last-child{min-width:0;overflow:hidden;text-overflow:ellipsis}
@media(max-width:700px){#cron .gruppi{padding:0 16px}#cron .griglia{grid-template-columns:1fr}#cron .ch{height:80px}#cron .cx{height:80px}.th{width:112px;height:63px}}
.ct .plate{margin-right:0}
.nuova{margin:12px var(--gut) 0;display:flex;align-items:center;gap:12px;padding:0 6px 0 18px;min-height:44px;border-radius:14px;border:1px solid rgba(255,48,72,.45);background:#160c10;font-size:16px;font-weight:600}
.nuova.chiudi{min-height:64px;padding:0 0 0 18px;line-height:1.3}
.nuova .cx{position:static;margin-left:auto;flex:none}
/* sulla TV l'avviso sta sopra la testata, accanto al marchio: arriva tardi e non deve spostare ciò che si preme */
.nuova:not(.chiudi){position:absolute;top:18px;left:166px;margin:0}
#cron{display:none}
body.cr #cron{display:block}
body.cr .top,body.cr #gruppi,body.cr #avviso,body.cr .nuova,body.cr .fondo:not(.crf){display:none}
.crtop{height:64px;display:flex;align-items:center;gap:6px;margin:8px 32px 0;padding:0 18px 0 6px;border-radius:32px;font-size:19px;font-weight:800}
@media(max-width:700px){.crtop{margin:8px 16px 0}}
.crtop span{font-size:30px;font-weight:400;margin-top:-4px}
@media(min-width:701px){#cron .crf{justify-content:flex-start}}
.cancella{height:64px;padding:0 26px;border-radius:999px;border:1px solid rgba(255,48,72,.5);background:#11131a;font-size:15px;font-weight:700;color:#ff6b7c}
#crconf,#uso{position:fixed;top:0;left:0;right:0;bottom:0;z-index:70;display:flex;align-items:center;justify-content:center;background:rgba(7,8,11,.9)}
#uso{z-index:60;background:var(--bg);overflow:auto}   /* pieno, non al 92% come sulla tavola: sotto non si deve leggere la pagina, e la chiavetta non la mescola */
.sc{display:flex;flex-wrap:wrap;justify-content:center;gap:16px;max-width:560px;padding:28px 32px;border-radius:20px;background:#11131a}
.sc p{width:100%;margin:0 0 4px;text-align:center;font-size:19px;font-weight:700}
.sc button{height:64px;min-width:160px;padding:0 28px;border-radius:999px;border:1px solid var(--line);background:#1b1e26;font-size:17px;font-weight:700;display:flex;align-items:center;justify-content:center}
.sc .rosso{background:var(--red);border-color:var(--red);color:#fff}
.gcol{display:flex;flex-direction:column;gap:6px;width:720px;max-width:100%;margin:auto}
.gcol .gt{margin:0 0 10px;font-size:19px;font-weight:800}
.gr{display:flex;align-items:center;gap:16px;min-height:48px;font-size:16px;line-height:1.3}
.gr .k{flex:none;width:96px;height:48px;border-radius:12px;background:var(--plate);border:1px solid rgba(255,255,255,.18);display:flex;align-items:center;justify-content:center;gap:4px;font-size:17px;font-weight:700;color:#fff}
.gr .k svg{width:24px;height:24px;fill:#fff}
.gl{font-size:22px;line-height:1;vertical-align:-3px}
.gok{margin-top:14px;height:64px;border-radius:999px;border:0;background:var(--red);color:#fff;font-size:17px;font-weight:700}
.tf .gcol{width:auto;gap:10px;margin:auto 24px;padding:24px 0}
.tf .gr{min-height:52px}.tf .gr .k{width:56px;height:56px;border-radius:50%}
@media(max-height:450px){.tf .gcol{gap:4px;padding:12px 0}.tf .gr{min-height:44px;gap:12px}.tf .gr .k{width:44px;height:44px}.tf .gok{margin-top:6px}}   /* telefono in orizzontale */
button.admin{border:0;background:none}
`;
document.head.appendChild(css);

// ---------- strati con la loro voce di cronologia (Cronologia, «Come si usa»): Indietro li chiude ----------
// Chiuso da un pulsante la voce si toglie; con `poi` (un indirizzo) si apre dopo averla tolta, così dal sito si torna a Il Regno senza
// un Indietro a vuoto (come la scelta del sito nella pagina).
let strato=null, mia=0, poi=null;
const vaPoi=()=>{if(poi){const u=poi;poi=null;location.href=u}};
function su(chiudi){history.pushState(null,""); strato=chiudi}
function giu(vai){
  if(!strato){if(vai)location.href=vai; return}
  const f=strato; strato=null; f(); mia++; poi=vai||null; history.back();
  if(vai)setTimeout(vaPoi,500);
}
addEventListener("popstate",()=>{
  if(mia){mia--; vaPoi(); return}
  if(strato){const f=strato; strato=null; f()}
});
document.addEventListener("keydown",e=>{if(e.key==="Escape"&&strato)giu()});

// ---------- siti: nome e sigla dall'indirizzo ----------
const SITI=[["streamingcommunity","StreamingCommunity","SC"],["onepace","One Pace","OP"],["animeworld","AnimeWorld","AW"],["animeunity","AnimeUnity","AU"],["pixeldrain","Pixeldrain","PD"]];
function sito(h){
  h=String(h||"").toLowerCase().replace(/^www\./,"");
  const k=h.replace(/[^a-z]/g,""), t=SITI.find(x=>k.includes(x[0]));
  if(t)return{nome:t[1],sg:t[2]};
  const n=h.split(".").slice(-2,-1)[0]||h;
  return{nome:n.charAt(0).toUpperCase()+n.slice(1),sg:n.slice(0,2).toUpperCase()};
}
const hostDi=u=>{try{return new URL(u).hostname}catch(e){return""}};
const placca=sg=>`<span class="plate ${sg.length<=2?"s1":"s"+Math.min(sg.length,5)}"><span class="sg">${esc(sg)}</span></span>`;
const hm=m=>m<60?String(m):Math.floor(m/60)+" h"+(m%60?" "+String(m%60).padStart(2,"0"):"");
const tempo=e=>{const p=Math.floor(e.secondi/60); return (p<60?p+" min":hm(p)+" min")+" di "+hm(Math.round(e.durata/60))};
// il titolo della pagina non dice la puntata: sta nell'indirizzo (?s=1&e=5)
function titolo(e){
  let t=e.titolo.trim()||sito(e.sito||hostDi(e.pagina)).nome;
  try{
    const q=new URL(e.pagina).searchParams, s=q.get("s"), p=q.get("e");
    if(/^\d{1,3}$/.test(s)&&/^\d{1,3}$/.test(p)&&!/\bS\d+\s*E\d+\b/i.test(t))t+=` · S${+s} E${+p}`;
  }catch(x){}
  return t;
}
// una scheda della sezione: immagine (copertina, o la targa del suo mondo, o l'icona di One Pace), in piccolo la serie o il
// mondo, in grande la puntata o il titolo (parti() di index.html, come il palco), sotto il minuto o «visto» e il sito,
// la linea rossa di quanto è visto; ✕ per toglierla, sulla TV e sul telefono.
// La voce si apre col solo gestore di questo file (data-v, non data-p che è del palco).
function voce(e,visto){
  const s=sito(e.sito||hostDi(e.pagina)), m=mondo(e), q=parti(e,m.dove,m.c), p=visto?100:Math.max(0,Math.min(100,e.secondi/(e.durata||1)*100));
  const sotto=(visto?"visto":tempo(e))+(sitiDi(m.c).length>1?" · "+s.nome:"");
  return `<div class="ct">`+
    `<button class="ch cv" data-v="${esc(e.pagina)}" aria-label="${esc((visto?"":"Riprendi ")+q.nome+", "+q.sopra+", "+sotto)}"><span class="th">${figura(e,m.c,"")}</span>`+
    `<span class="info"><span class="sopra">${esc(q.sopra+(q.ver?" · "+q.ver:""))}</span><b>${esc(q.nome)}</b><span class="crsotto"><span>${esc(sotto)}</span></span></span><i class="visto-l" style="width:${p.toFixed(1)}%"></i></button>`+
    `<button class="cx" data-x="${esc(e.pagina)}" aria-label="Togli ${esc(q.nome)}">✕</button></div>`;
}

// dopo un cambio della storia (voce tolta, cronologia svuotata) la pagina ridisegna il palco e la Cronologia
const rifai=()=>{leggiStoria(); disegna()};

// ---------- «Continua a guardare» ----------
// Gli ultimi 15 titoli (cronologia() li dà tutti, fino a 100): prima quelli a metà col loro minuto, poi quelli finiti.
// I canali non ci sono mai: la storia di Muflone ha solo video che finiscono (contratto C2).
const QUANTI=15;
function cronologia(){
  const l=lista("cronologia").sort((a,b)=>b.quando-a.quando).slice(0,QUANTI), corso=l.filter(e=>e.visto!==true), visti=l.filter(e=>e.visto===true);
  const gr=(t,x)=>x.length?`<section class="gruppo"><h2>${t}<span>${x.length}</span></h2><div class="griglia">${x.map(e=>voce(e,e.visto===true)).join("")}</div></section>`:"";
  COPS={};
  $("#crl").innerHTML=gr("A metà",corso)+gr("Già visti",visti);
  $("#crl").querySelectorAll("img[data-c]").forEach(i=>{const u=COPS[i.dataset.c]; i.removeAttribute("data-c"); if(u)i.src=u});   // loading=lazy: il WebView le chiede quando entrano in vista
  $(".crf").hidden=!l.length;
  return l.length;
}
function apriCron(){
  if(strato||!document.getElementById("cron"))return;
  const y=scrollY;
  if(!cronologia())return;
  su(()=>{document.body.classList.remove("cr"); $("#crconf").hidden=$("#scelta").hidden=true; $("#crl").innerHTML=""; scrollTo(0,y); rifai(); const c=$("#tutti")||$("#crlink"); if(c&&!c.hidden)c.focus({preventScroll:true})});   // prima della voce: il browser ricorda dov'eri; la lista chiusa si libera
  document.body.classList.add("cr"); scrollTo(0,0);
  const f=$("#crl button"); if(f)f.focus({preventScroll:true});   // le frecce partono dalla prima voce
}
document.body.insertAdjacentHTML("beforeend",
  `<section id="cron"><button class="crtop" id="crtorna"><span>‹</span> Continua a guardare</button><div class="gruppi" id="crl"></div>`+
  `<div class="fondo crf" style="padding-top:20px"><button class="cancella" id="crvuota">Cancella tutto</button></div></section>`+
  `<div id="crconf" hidden role="dialog" aria-label="Cancellare la cronologia"><div class="sc" id="scelta" hidden><p>Cancellare tutta la cronologia?</p><button class="rosso" id="crsi">Sì, cancella</button><button id="crno">No</button></div></div>`);
// la domanda si chiama #scelta perché le frecce di Muflone (pagina.js) restano dentro una #scelta aperta; si parte da «No»,
// e chiusa col «No» il fuoco torna su «Cancella tutto»
const conf=on=>{$("#crconf").hidden=$("#scelta").hidden=!on; $(on?"#crno":"#crvuota").focus()};

// ---------- «Come si usa» ----------
const IC={
  fr:'<svg viewBox="0 0 24 24"><path d="M12 2l4 5H8zM12 22l-4-5h8zM2 12l5-4v8zM22 12l-5 4V8z"/></svg>',
  ind:'<svg viewBox="0 0 24 24"><path d="M9 5 3 11l6 6v-4h6a4 4 0 0 1 0 8h-2v2h2a6 6 0 0 0 0-12H9z"/></svg>',
  pp:'<svg viewBox="0 0 24 24"><path d="M3 5l9 7-9 7zM14 5h3v14h-3zM19 5h3v14h-3z"/></svg>',
  rw:'<svg viewBox="0 0 24 24"><path d="M11 6v12L2 12zM21 6v12l-9-6z"/></svg>',
  ff:'<svg viewBox="0 0 24 24"><path d="M3 6v12l9-6zM13 6v12l9-6z"/></svg>',
  tocco:'<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="5"/><path d="M12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20zm0 2a8 8 0 1 0 0 16 8 8 0 0 0 0-16z" opacity=".45"/></svg>',
  indt:'<svg viewBox="0 0 24 24"><path d="M15.5 3 17 4.5 9.5 12l7.5 7.5-1.5 1.5-9-9z"/></svg>',
  casa:'<svg viewBox="0 0 24 24"><path d="M12 3 2 12h3v8h5v-6h4v6h5v-8h3z"/></svg>',
  pip:'<svg viewBox="0 0 24 24"><path d="M2 4h20v16H2zm2 2v12h16V6zm7 5h8v6h-8z"/></svg>'
};
const GL="⏪︎", GF="⏩︎";
// le righe dicono Muflone com'è con le frecce che saltano i riquadri su Il Regno e il puntatore negli altri siti (S9)
const USO_TV=[
  [IC.fr,"Frecce — qui saltano da un riquadro all'altro; negli altri siti muovono il puntatore"],
  ["OK","OK — apri"],
  [IC.ind,"Indietro — torna indietro; dalla pagina principale premilo due volte per uscire da Muflone"],
  ["☰","☰ — torna a questa pagina"],
  [IC.pp,"Play/Pausa — ferma il video e lo fa ripartire"],
  [IC.rw+IC.ff,`<span class="gl">${GL} ${GF}</span> — nel video, 10 secondi indietro o avanti`],
  [IC.rw+"×2",`<span class="gl">${GL}</span> due volte, fuori dai video — passa dalle frecce al puntatore e viceversa`]
];
const USO_TEL=[
  [IC.tocco,"Tocca per aprire"],
  [IC.indt,"Indietro — torna indietro"],
  [IC.casa,"La casetta in basso a destra — torna a questa pagina"],
  [IC.pip,"Se esci dall'app durante un video, il video continua in una finestrella"]
];
function apriUso(){
  if(strato||$("#uso"))return;
  const r=(tel()?USO_TEL:USO_TV).map(x=>`<div class="gr"><span class="k">${x[0]}</span><span>${x[1]}</span></div>`).join("");
  document.body.insertAdjacentHTML("beforeend",`<div id="uso" role="dialog" aria-label="Come si usa"><div class="gcol"><div class="gt">Come si usa</div>${r}<button class="gok" id="usoOk">Ho capito</button></div></div>`);
  $("#usoOk").focus();
  su(()=>{const u=$("#uso"); if(u)u.remove(); mem.set("ilregno.uso","1")});
}
// la prima volta; se la memoria del dispositivo non regge non si mostra a ogni apertura
function primaVolta(){
  if(mem.get("ilregno.uso")||typeof B.continua!=="function")return;
  mem.set("ilregno.prova","1"); if(mem.get("ilregno.prova")!=="1")return;
  if(M.classList.contains("open")||strato||!$("#ricerca").hidden)return;
  apriUso();
}
if(typeof B.continua==="function")$(".fondo").insertAdjacentHTML("beforeend",'<button class="admin" id="usoLink">Come si usa</button>');

// ---------- avviso di versione nuova ----------
const nv=v=>(String(v).match(/\d+/g)||[]).map(Number);
const piuNuova=(a,b)=>{const x=nv(a), y=nv(b); for(let i=0;i<Math.max(x.length,y.length);i++){const d=(x[i]||0)-(y[i]||0); if(d)return d>0} return false};
function avviso(ultimaV){
  let inst="";
  try{inst=String(B.versione()||"")}catch(e){}
  if(!nv(inst).length||!nv(ultimaV).length||!piuNuova(ultimaV,inst)||mem.get("ilregno.avviso")===ultimaV)return;
  const tf=tel(), a=document.getElementById("nuova");
  if(a)a.remove();
  $(".top").insertAdjacentHTML("afterend",tf?
    `<div class="nuova chiudi" id="nuova"><span>C'è Muflone ${esc(ultimaV)} · chiedila a chi te l'ha data</span><button class="cx" id="nuovaX" data-v="${esc(ultimaV)}" aria-label="Chiudi">✕</button></div>`:
    `<div class="nuova" id="nuova">C'è Muflone ${esc(ultimaV)}</div>`);
}

// ---------- comandi ----------
document.addEventListener("click",e=>{
  const b=e.target.closest("button"); if(!b)return;
  if(b.classList.contains("cv"))return giu0(b.dataset.v);
  if(b.dataset.x)return togli(b.dataset.x);
  switch(b.id){
    case "crlink": case "tutti": return apriCron();
    case "crtorna": return giu();
    case "crvuota": return conf(1);
    case "crno": return conf(0);
    case "crsi": try{B.svuotaCronologia()}catch(x){} return giu();
    case "usoOk": return giu();
    case "usoLink": return apriUso();
    case "nuovaX": mem.set("ilregno.avviso",b.dataset.v); $("#nuova").remove(); return;
  }
});
// un clic su una scheda riapre la pagina del film: il minuto lo ritrova Muflone (contratto K4); dalla Cronologia prima si toglie la sua voce
const giu0=u=>htt(u)&&(strato?giu(u):location.href=u);
function togli(x){
  const i=[...document.querySelectorAll("#crl .cv")].findIndex(b=>b.dataset.v===x);
  try{B.togliDaCronologia(x)}catch(e){}
  if(document.body.classList.contains("cr")){if(!cronologia())return giu(); const n=document.querySelectorAll("#crl .cv"), f=n[Math.min(Math.max(i,0),n.length-1)]||$("#crvuota"); if(f)f.focus({preventScroll:true})}
}

// ---------- avvio ----------
const tf=()=>document.body.classList.toggle("tf",tel());   // telefono: «Come si usa» e Cronologia a misura di dito
tf(); try{matchMedia(Q).addEventListener("change",tf)}catch(e){}
window.apriCron=apriCron;
if(crDopo){crDopo=0; apriCron()}   // «Cronologia» premuta prima che questo file arrivasse
else primaVolta();
if(typeof B.versione==="function"){
  fetch("versione.json",{signal:scade(8000)}).then(r=>{if(!r.ok)throw 0;return r.json()}).then(j=>{if(j&&typeof j.muflone==="string")avviso(j.muflone)}).catch(()=>{});
}
})();
