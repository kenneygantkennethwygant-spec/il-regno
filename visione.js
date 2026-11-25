// Lettore di Il Regno: il flusso del canale aperto (nativo o hls.js), attese e codici, caduta e riconnessione, pausa, tracce audio,
// comandi del tempo. Si carica dopo la prima schermata (dopoPrimaSchermata, `carica`), come hls.js: la prima schermata non lo aspetta.
// Script normale, non un modulo: le sue variabili stanno nello stesso spazio di quelle della pagina, e archivio.js le usa per nome
// (MS, hls, V, aggiornaTempo() da qui; CONFIG_HLS, cur, programma(), mem, scade() dalla pagina). Restano nella pagina lo strato
// del lettore e ciò che serve al primo clic prima che questo file arrivi: guarda(), chiudiLettore(), la barra che sparisce, in onda.
const V=$("#video");
let tok=0, hls=null, tm=[], rai=null, nrai=0;
// cosa si sa del canale aperto (si azzera a ogni apertura, cambio e chiusura): avviato = ha mostrato la prima immagine,
// ricon = sta riconnettendosi, lunga = la pausa è durata 30 s
let avviato=false, ricon=false, lunga=false, trc=[], tp=0, vg=0;
// riconnessione: finiti = passati i 15 s dei tentativi, provv = istante del video da cui l'immagine va di nuovo (provvisorio finché non passano 10 s);
// vigilato e fermi = ultimo istante visto dal controllo di ogni secondo e quanti secondi di fila è uguale
let finiti=false, provv=null, vigilato=null, fermi=0;
// daHls = il canale suona con hls.js (Rai, o nativo non riuscito): i tentativi usano lo stesso lettore; traccia = audio scelto dallo spettatore
let daHls=false, traccia="";
// ultimi pezzi ricevuti: qualsiasi, e di video
let dato=0, pezzo=0;
// voluta = ultima cosa vista sul video è una pausa data da qualcuno (non un errore né la fine): gli errori durante la pausa non sono cadute
let voluta=false;
const entro=(f,ms)=>tm.push(setTimeout(f,ms));
// ferma il flusso (lo fa anche ogni tentativo di riconnessione)
function fermaFlusso(){
  tok++; tm.forEach(clearTimeout); tm=[]; rai=null;
  V.onerror=V.onplaying=null;
  if(hls){hls.destroy();hls=null}
  V.pause(); V.removeAttribute("src"); V.load();
  vigilato=ultimo=null; fermi=0;
  aggiornaAudio();
}
// ferma tutto del canale aperto: flusso, riconnessione, pausa
function ferma(){
  fermaFlusso();
  avviato=ricon=lunga=finiti=daHls=voluta=false; provv=null; traccia="";
  trc.forEach(clearTimeout); trc=[]; clearTimeout(tp); clearInterval(vg);
  $("#riconnessione").hidden=$("#diretta").hidden=$("#lenta").hidden=true; aggiornaPausa();
  clearInterval(tt); senzaTempo();
}
// V01 manca l'indirizzo o hls.js non parte, V02 8 s senza pezzi o errore del video, V03 indirizzo Rai non ottenuto,
// V04 indirizzo Sky non ottenuto, V05 partito ma caduto e tre riconnessioni riuscite a vuoto
function fallito(k,cod){
  if(k!==tok||ricon)return;   // durante la riconnessione il fallimento di un tentativo non si mostra
  ferma(); console.warn("lettore",cur.id,cod);
  $("#errmsg").textContent=cod==="V05"?`${cur.nome} non risponde`:`${cur.nome} non disponibile ora (codice ${cod})`;
  $("#errcod").textContent=cod==="V05"?`Ho riprovato 3 volte (codice ${cod})`:"";
  M.classList.add("errore"); $("#riprova").focus();
}
function riproduci(c){
  if(!M.classList.contains("open"))pos=scrollY;
  ferma(); cur=c;
  M.className="open"; document.body.classList.add("pl"); document.documentElement.classList.add("pl"); mostraBarra(true);
  $("#titolo").textContent=c.nome;
  inOnda(c); clearInterval(ti); ti=setInterval(()=>inOnda(c),60000);
  tt=setInterval(()=>{if(!M.classList.contains("nasc")||M.classList.contains("inpausa"))aggiornaTempo()},1000);   // la linea si ridisegna solo se si vede, o in pausa per «In diretta»
  aggiornaStella(); apriFlusso(c);
}
// chiede il flusso del canale e aspetta la prima immagine
function apriFlusso(c){
  const k=tok;
  V.onplaying=()=>{if(k===tok){V.onplaying=null;ricon?ripreso(k):partito(k)}};   // solo la prima partenza, non dopo ogni scatto
  if(c.sky)return chiediSky(c,k);
  if(!c.url)return fallito(k,"V01");
  if(c.rai)return chiediRai(c,k);
  aspettaDati(k);
  if(SEMPRE_HLS.includes(c.id)||MS.test(c.url))return suHls(c.url,k);
  suona(c.url,k);
}
// V02 dopo 8 s senza pezzi (40 in tutto), «Linea lenta…» dopo 10 s senza immagine
function aspettaDati(k){
  const t0=Date.now(); dato=0;
  (function giro(){
    const ora=Date.now(), n=ora-t0;
    if(ora-(dato||t0)>=8e3||n>=4e4)return fallito(k,"V02");
    $("#lenta").hidden=n<1e4||ricon;
    entro(giro,500);
  })();
}
// canale normale: prima il lettore nativo, se non sa leggere il flusso o non avanza si riprova una volta con hls.js
function suona(url,k){
  if(daHls)return suHls(url,k);   // una riapertura resta sul lettore che suonava: il nativo potrebbe non leggerlo
  let usato=false;
  const conHls=()=>{if(usato||k!==tok)return;usato=true;V.removeAttribute("src");V.load();suHls(url,k)};
  V.onerror=conHls;
  entro(conHls,6000);
  V.src=url; V.play().catch(()=>{});
}
// Sky: l'indirizzo ha un gettone di 5 minuti: lo si chiede all'API pubblica di Sky a ogni apertura e si suona come un canale normale
function chiediSky(c,k){
  fetch("https://video.sky.it/api/v1/getLivestream?id="+encodeURIComponent(c.sky)+"&isMobile=false",{signal:scade(15000)})
    .then(r=>{if(!r.ok)throw 0;return r.json()}).then(j=>{
      if(k!==tok)return;
      if(!(j&&typeof j.streaming_url==="string"&&j.streaming_url))throw 0;
      aspettaDati(k); suona(j.streaming_url,k);
    }).catch(()=>fallito(k,"V04"));
}
// il video è partito: si fermano i controlli di tempo dell'apertura
function partito(k){
  tm.forEach(clearTimeout); tm=[]; $("#lenta").hidden=true;
  avviato=true; V.onerror=()=>guasto(k); vigila(); aggiornaPausa(); aggiornaTempo();
}
// pausa: «In pausa» resta sullo schermo finché dura, chiunque l'abbia data (anche il tasto Play/Pausa di Muflone, che ferma il video);
// dopo 30 s compare «In diretta» e resta fino a che non si usa, si cambia canale o si chiude. Non è una pausa mentre il canale
// si apre, si cambia o si riconnette, né alla fine di un video.
function aggiornaPausa(){
  const p=avviato&&!ricon&&V.paused&&!V.ended&&!M.classList.contains("errore");
  if(p===M.classList.contains("inpausa"))return;
  M.classList.toggle("inpausa",p); $("#inpausa").hidden=!p;
  $("#pausa").setAttribute("aria-label",p?"Riprendi":"Pausa");
  clearTimeout(tp);
  if(p)tp=setTimeout(()=>{lunga=true; $("#diretta").hidden=false},30000);
}
["play","pause","playing","ended"].forEach(t=>V.addEventListener(t,aggiornaPausa));
V.addEventListener("play",()=>voluta=false);
V.addEventListener("pause",()=>voluta=!V.ended&&!V.error);
// Un canale dal vivo che smette di rispondere congela l'immagine senza errore. Dopo la prima immagine, ogni secondo si guarda se il
// video non in pausa avanza; fermo per 6 s è una caduta, come un errore del video o di hls.js.
function vigila(){
  clearInterval(vg);
  vg=setInterval(()=>{
    const t=V.currentTime, prima=vigilato;
    vigilato=t;
    // uno spostamento nel tempo non è una caduta, fino a 15 s
    if(V.paused||V.ended||prima===null||V.seeking&&Date.now()-salto<15000){fermi=0; return}
    if(t!==prima){fermi=0; if(ricon)provvisorio(t); return}
    if(++fermi>=6&&Date.now()-pezzo>3000){fermi=0; cade(tok)}
  },1000);
}
const guasto=k=>avviato?cade(k):fallito(k,"V02");
// caduta: «Riconnessione…» e il flusso riaperto da capo a 0, 5 e 10 s (per Rai un indirizzo nuovo ogni volta: il gettone scade).
// Una riapertura riuscita non basta: si conferma solo se il video avanza di 10 s senza fermarsi (un canale bloccato a monte rimette
// in onda per pochi secondi i pezzi che ha). Dopo 15 s, o appena si ferma di nuovo, senza conferma: pannello V05; in ogni caso entro 35 s.
// Una pausa voluta non è una caduta, nemmeno se hls.js dà errore mentre si è in pausa.
function cade(k){
  if(k!==tok||!avviato)return;
  if(ricon){
    provv=null;
    if(finiti)nonRisponde(); else $("#riconnessione").hidden=false;
    return;
  }
  if(voluta)return;
  ricon=true; finiti=false; provv=null; aggiornaPausa();
  $("#riconnessione").hidden=false;
  trc=[0,5000,10000].map(ms=>setTimeout(()=>{if(provv===null&&!(ms&&dato&&Date.now()-dato<8000)){fermaFlusso(); apriFlusso(cur)}},ms));   // non si riapre se l'immagine va già o arrivano pezzi
  trc.push(setTimeout(()=>{finiti=true; if(provv===null)nonRisponde()},15000), setTimeout(nonRisponde,35000));
}
const nonRisponde=()=>{ricon=false; fallito(tok,"V05")};
// l'immagine va di nuovo: «Riconnessione…» se ne va, la riuscita si conferma dopo 10 s di video
function provvisorio(t){
  if(provv===null){provv=t; $("#riconnessione").hidden=true}
  else if(t-provv>=10){trc.forEach(clearTimeout); trc=[]; ricon=false; provv=null; aggiornaPausa()}
}
// un tentativo ha dato di nuovo l'immagine
function ripreso(k){
  tm.forEach(clearTimeout); tm=[]; V.onerror=()=>guasto(k);
  provvisorio(V.currentTime);
}
function suHls(url,k){
  daHls=true;
  const pronto=()=>{
    if(k!==tok)return;
    if(!Hls.isSupported())return fallito(k,"V01");
    hls=new Hls(CONFIG_HLS);
    hls.on(Hls.Events.FRAG_LOADED,(e,d)=>{dato=Date.now(); if(d.frag.type=="main")pezzo=dato});
    hls.on(Hls.Events.ERROR,(e,d)=>{if(d.fatal)guasto(k)});
    hls.on(Hls.Events.AUDIO_TRACKS_UPDATED,riapplicaAudio);
    hls.on(Hls.Events.AUDIO_TRACK_SWITCHED,aggiornaAudio);
    V.onerror=()=>guasto(k);
    hls.attachMedia(V); hls.loadSource(url);
    V.play().catch(()=>{});
  };
  carica("hls.min.js").then(ok=>ok?MS.test(url)?carica("archivio.js").then(pronto):pronto():fallito(k,"V01"));
}
V.onprogress=()=>{if(!hls)dato=pezzo=Date.now()};
// tracce audio: se il flusso ne offre più d'una (Rai: Italiano, Lingua Originale, Audiodescrizione) «Audio: …» apre la scelta
function aggiornaAudio(){
  const t=hls?hls.audioTracks:[], vari=t.length>1;
  $("#audio").hidden=!vari;
  if(!vari)return void($("#audioScelte").hidden=true);
  const i=hls.audioTrack>=0?hls.audioTrack:Math.max(0,t.findIndex(a=>a.default));
  $("#audio").textContent="Audio: "+t[i].name;
  $("#audioScelte").innerHTML=t.map((a,n)=>`<button class="cmd" data-a="${n}" aria-pressed="${n===i}">${esc(a.name)}</button>`).join("");
}
// dopo una riconnessione l'istanza di hls.js riparte dalla traccia predefinita: si rimette quella scelta
function riapplicaAudio(){
  const n=hls.audioTracks.findIndex(a=>a.name===traccia);
  if(n>=0&&n!==hls.audioTrack)hls.audioTrack=n;
  aggiornaAudio();
}
function scegliAudio(n){
  if(hls){hls.audioTrack=n; traccia=hls.audioTracks[n].name}
  $("#audioScelte").hidden=true;
}
// Rai: l'indirizzo con gettone lo chiede Muflone al momento (risposta in ilRegnoRai); poi lo legge hls.js
function chiediRai(c,k){
  if(!(window.Muflone&&Muflone.risolviRai))return fallito(k,"V03");
  rai=u=>{rai=null;if(u){aspettaDati(k);suHls(u,k)}else fallito(k,"V03")};
  rai.id=String(++nrai);
  entro(()=>{if(rai)fallito(k,"V03")},15000);
  try{Muflone.risolviRai(rai.id,c.url)}catch(e){fallito(k,"V03")}
}
window.ilRegnoRai=(id,u)=>{if(rai&&rai.id===String(id))rai(u)};

// ---------- tempo (V5): indietro e avanti nel programma in onda (misure e trappole in prova-tempo.md) ----------
// Solo con 60 s di spazio vero. Il nativo della chiavetta ignora gli spostamenti: La7, SuperTennis, Radio Italia e Mediaset
// suonano con hls.js. Inizio = primo pezzo + 3 pezzi (seekable parte da 0 e vicino all'inizio hls.js torna in diretta); ritardo da
// liveSyncPosition; ora da PROGRAM-DATE-TIME o, senza (SuperTennis), da adesso. Mai prima dell'inizio del programma che si guarda.
const SEMPRE_HLS=["la7","supertennis","radioitaliatv"], MS=/\.mediaset\.net\/live\//;
let tt=0, salto=0, tempo=null, ultimo=null;   // tempo = capi della linea, mentre i comandi ci sono; ultimo = dove si guardava prima di un salto
V.addEventListener("timeupdate",()=>{if(!V.seeking)ultimo=V.currentTime});
// Un salto che non viene dalla pagina (i tasti ±10 s di Muflone scrivono currentTime) non esce dal programma che si guardava
V.addEventListener("seeking",()=>{
  salto=Date.now(); fermi=0;
  const w=avviato&&!ricon&&ultimo!==null&&finestra(), rif=w&&w.ora(ultimo)+1000;   // +1 s: dopo un salto al limite l'ora cade un soffio prima
  if(w&&V.currentTime<limiti(w,rif).da-0.5)vaiA(-Infinity,0,rif);
});
function finestra(){
  const l=hls&&hls.levels&&hls.levels[hls.currentLevel>=0?hls.currentLevel:0], d=l&&l.details;
  if(!d||!d.live||!d.fragments.length)return null;
  const f=d.fragments.slice(d.vero-d.startSN||0), da=f[0].start, a=f[f.length-1].start+f[f.length-1].duration, g=f[0].programDateTime||0;
  return {f,da,a,min:da+3*d.targetduration,vivo:hls.liveSyncPosition||a-3*d.targetduration,
    ora:p=>g?g+(p-da)*1000:Date.now()-(a-p)*1000, pos:ms=>g?da+(ms-g)/1000:a-(Date.now()-ms)/1000};
}
function limiti(w,ora=w.ora(V.currentTime)){
  const p=programma(cur,ora);
  return {p,da:p?Math.max(w.min,w.pos(Date.parse(p.i))):w.min};
}
function vaiA(t,a,rif){
  const w=finestra(); if(!w)return;
  const da=limiti(w,rif).da, f=a&&w.f.find(x=>x.start+x.duration/2>t);
  t=f&&f.start>=da&&f.start<w.vivo?f.start+.1:Math.min(w.vivo,Math.max(da,t));
  if(Math.abs(t-V.currentTime)>.5)V.currentTime=t; aggiornaTempo();
}
function senzaTempo(){tempo=null; ["#tempo","#ricomincia","#indietro30","#avanti30"].forEach(x=>$(x).hidden=true)}
const oraMin=ms=>new Date(ms).toLocaleTimeString("it-IT",{hour:"2-digit",minute:"2-digit",timeZone:"Europe/Rome"});
const metti=(s,k,v)=>{const e=$(s).style; if(e[k]!==v)e[k]=v};
function aggiornaTempo(){
  const w=avviato&&!ricon&&finestra();
  if(!w||w.vivo-w.min<60){if(tempo){senzaTempo(); if(!lunga)$("#diretta").hidden=true} return}
  const l=limiti(w), t=V.currentTime, dietro=Math.max(0,w.vivo-t), indietro=dietro>=15, ora=w.ora(t), adesso=Date.now();
  // senza guida la linea va dal punto più vecchio alla diretta
  const i=l.p?Date.parse(l.p.i):w.ora(w.min), f=l.p?Date.parse(l.p.f):adesso;
  if(!tempo)mostraBarra();   // arrivano con l'immagine: si vedono 3 s anche dopo un'apertura lenta
  tempo={i,f,w};
  const x=ms=>Math.max(0,Math.min(1,(ms-i)/(f-i||1))), pc=v=>(v*100).toFixed(1)+"%", r=x(Math.max(i,w.ora(w.min))), v=x(adesso), q=x(ora);
  scrivi($("#lineaInizio"),l.p?l.p.i.slice(11,16):oraMin(i)); scrivi($("#lineaFine"),l.p?l.p.f.slice(11,16):oraMin(f));
  metti("#rivedibile","left",pc(r)); metti("#rivedibile","width",pc(v-r));
  metti("#visto","left",pc(r)); metti("#visto","width",pc(Math.max(0,q-r)));
  metti("#vivo","left",pc(v)); metti("#punto","left",pc(q));
  const rit=$("#ritardo");
  scrivi(rit,indietro?`${oraMin(ora)} \u2212${dietro>=60?Math.floor(dietro/60)+" min":Math.round(dietro)+" s"} dalla diretta`:"\u25CF in diretta");
  rit.classList.toggle("vivo",!indietro);
  $("#tempo").hidden=$("#indietro30").hidden=false;
  // la scritta segue il pomello ma non esce dalla linea
  const L=$("#linea").clientWidth, m=rit.offsetWidth/2;
  metti("#ritardo","left",Math.max(m,Math.min(L-m,q*L)).toFixed(1)+"px");
  $("#ricomincia").hidden=!(l.p&&w.pos(i)>=w.min);
  $("#avanti30").hidden=$("#diretta").hidden=!indietro;
}
$("#linea").addEventListener("click",e=>{
  if(!tempo)return;
  const r=$("#linea").getBoundingClientRect();
  vaiA(tempo.w.pos(tempo.i+(e.clientX-r.left)/r.width*(tempo.f-tempo.i)));
});

// comandi del lettore (la X, «Chiudi» e «Riprova» li gestisce la pagina, che li ha già prima di questo file)
document.addEventListener("click",e=>{
  const b=e.target.closest("button"); if(!b)return;
  if(b.dataset.a)return scegliAudio(+b.dataset.a);
  switch(b.id){
    // «In diretta»: sui canali col tempo (V5) ci si sposta al vivo; sugli altri si riapre da capo, come Riprova
    case "diretta": if(tempo){vaiA(Infinity); if(V.paused)V.play().catch(()=>{}); return} return riproduci(cur);
    case "ricomincia": return vaiA(-Infinity);
    case "indietro30": return vaiA(V.currentTime-30,1);
    case "avanti30": return vaiA(V.currentTime+30,1);
    case "pausa": if(avviato)V.paused?V.play().catch(()=>{}):V.pause(); return;
    case "audio": $("#audioScelte").hidden=!$("#audioScelte").hidden; return;
  }
});

// ---------- preferiti: la stella nella fila dei comandi ----------
// Vuota o piena (rossa) secondo il canale aperto; un tocco mette o toglie il canale da «ilregno.preferiti» e per 2 s dice cosa è successo.
// Dietro al lettore non si ridisegna nulla (fermerebbe hls.js): il gruppo «Preferiti» in cima si ridisegna alla chiusura.
(()=>{
  const st=document.createElement("button"), pa=document.createElement("div");
  st.id="stella"; st.className="cmd"; pa.id="avvisoPref"; pa.hidden=true;
  st.style.cssText="width:64px;padding:0;display:flex;align-items:center;justify-content:center";
  pa.style.cssText="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);padding:10px 24px;border-radius:999px;background:rgba(0,0,0,.6);font-size:16px;font-weight:600;white-space:nowrap;pointer-events:none";
  st.innerHTML='<svg viewBox="0 0 24 24" width="26" height="26"><path d="M12 2.8l2.75 5.9 6.45.75-4.8 4.4 1.3 6.35L12 17l-5.7 3.2 1.3-6.35-4.8-4.4 6.45-.75z" stroke-width="1.8" stroke-linejoin="round"/></svg>';
  $(".riga").insertBefore(st,$("#diretta")); M.appendChild(pa);
  const st2=document.createElement("style");
  st2.textContent="#modal.errore #stella,#modal.errore #avvisoPref{display:none}";
  document.head.appendChild(st2);
  let tpa=0, sporco=false;
  const piena=()=>!!cur&&jx("ilregno.preferiti",[]).includes(cur.id);
  window.aggiornaStella=()=>{
    const p=piena(), v=st.firstElementChild;
    v.style.fill=p?"#ff3048":"none"; v.style.stroke=p?"#ff3048":"#fff";
    st.setAttribute("aria-label",p?"Togli dai preferiti":"Aggiungi ai preferiti"); st.setAttribute("aria-pressed",p);
  };
  st.addEventListener("click",()=>{
    if(!cur)return;
    const l=jx("ilregno.preferiti",[]), p=l.includes(cur.id);
    const j=JSON.stringify(p?l.filter(x=>x!==cur.id):[...l,cur.id]);
    mem.set("ilregno.preferiti",j);
    const ok=mem.get("ilregno.preferiti")===j;   // mem.set tace sugli errori: si conferma solo ciò che si rilegge
    if(ok)sporco=true;
    aggiornaStella();
    pa.textContent=ok?p?"Tolto dai preferiti":"Aggiunto ai preferiti":"Non riesco a salvarlo"; pa.hidden=false;
    clearTimeout(tpa); tpa=setTimeout(()=>pa.hidden=true,2000);
  });
  const chiudi0=chiudiLettore;
  chiudiLettore=function(){
    chiudi0(); pa.hidden=true; clearTimeout(tpa);
    if(!sporco)return;
    sporco=false;
    const g=$("#gruppi"), h=g.offsetHeight; disegna(); scrollBy(0,g.offsetHeight-h);   // il gruppo in cima non sposta ciò che si guardava
  };
})();
