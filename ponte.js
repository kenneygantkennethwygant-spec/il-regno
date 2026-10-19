// Ponte con Muflone 0.6: si carica dopo la prima schermata, e solo se Muflone ha provaLink (telefono, PC e Muflone 0.5 non lo scaricano).
// Il pallino vuol dire «funziona da qui, adesso»: il giro di Muflone (ultimaProva, poi ilRegnoProva) vale 6 ore dalla sua ora e
// prevale su stato.json voce per voce. Tutto ciò che arriva da Muflone è dato: non entra mai nella pagina come HTML.
(()=>{
  let PR=null, inProva=false, timer=0;
  const host=u=>{try{return new URL(u).hostname}catch(e){return""}};
  const https=u=>typeof u==="string"&&u.startsWith("https://");
  const fresco=()=>{const a=PR?Date.now()-Date.parse(PR.quando):NaN; return a<216e5&&a>-6e4};   // NaN: false
  const oggetto=t=>{try{const o=JSON.parse(t); return o&&typeof o==="object"?o:null}catch(e){return null}};
  // STATO = ciò che la pagina usa per colori e indirizzi: la voce del giro se è dell'indirizzo che c'è nei dati e non è «non verificabile», altrimenti quella di stato.json
  window.unisci=()=>{
    if(!D)return;
    if(!fresco()){STATO=ST; return}
    const voce=(tipo,x)=>{
      const s=(ST[tipo]||{})[x.id], e=(PR[tipo]||{})[x.id];
      if(!e||!x.url||e.url!==x.url||typeof e.ok!=="boolean")return s;
      if(e.nuovo&&e.sostituisce===x.url&&https(e.nuovo))return{ok:true,nuovo:e.nuovo,sostituisce:x.url};   // rimando o sostituto trovato da qui: è ciò che apre il clic
      if(e.ok)return{ok:true};
      // l'indirizzo non va e da qui non c'è sostituto: vale quello di stato.json, salvo che da qui sia già stato provato e sia fallito
      const n=s&&s.nuovo&&s.sostituisce===x.url&&https(s.nuovo)&&!(Array.isArray(e.falliti)&&e.falliti.includes(host(s.nuovo)));
      return n?{ok:false,nuovo:s.nuovo,sostituisce:x.url}:{ok:false};
    };
    const S={siti:{},canali:{}};
    D.siti.forEach(x=>S.siti[x.id]=voce("siti",x));
    D.canali.forEach(x=>S.canali[x.id]=voce("canali",x));
    STATO=S;
  };
  // Muflone chiama ilRegnoProva(testo) quando un giro finisce; un testo che non è JSON si ignora
  window.ilRegnoProva=t=>{
    inProva=false;
    const o=oggetto(t); if(!o)return;
    PR=o; aggiorna();
    document.querySelectorAll("#scLista .sito").forEach(b=>{b.firstElementChild.className="stato "+(((STATO.siti||{})[b.dataset.i]||{}).ok===false?"ko":"ok")});
  };
  // il giro lo chiede la pagina una volta sola, qualche secondo dopo le schede; mai due insieme
  const chiedi=()=>{
    if(timer)return;
    timer=setTimeout(()=>{
      timer=0;
      if(!D||inProva)return;
      inProva=true;
      try{Muflone.provaLink(JSON.stringify({siti:D.siti.map(x=>({id:x.id,url:x.url})),canali:D.canali.map(x=>({id:x.id,url:x.url,sky:x.sky,rai:x.rai}))}))}catch(e){inProva=false}
    },3000);
  };
  addEventListener("pageshow",e=>{if(e.persisted&&!inProva&&!fresco())chiedi()});   // ritorno dalla cache: se il giro è vecchio, si richiede
  try{PR=oggetto(Muflone.ultimaProva())}catch(e){}
  chiedi();
})();
