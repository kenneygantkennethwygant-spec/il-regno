// Archivio di Mediaset (S2): «Ricomincia» e il tempo indietro sui canali Mediaset, che mandano solo 2 minuti di lista ma tengono
// per ore i pezzi vecchi. La pagina scrive da sola le righe dei pezzi più vecchi (il numero di un pezzo è il suo nome) e le dà a hls.js
// davanti alla lista vera, fino a 3 ore, dall'inizio del programma in onda meno 1 minuto. Misure e ragioni: tasks/2026-10-18-sera-mattia/tempo.md §2.
// Si carica dopo la prima schermata, insieme a hls.js: se manca, i Mediaset suonano come canali senza archivio. Usa dalla pagina:
// MS, CONFIG_HLS, hls, cur, V, programma(), aggiornaTempo(), mem, scade(). La pagina usa da qui solo `details.vero` (vedi spegni).
// Se qualcosa non torna l'archivio si SPEGNE da solo, in silenzio, per il giorno: il canale resta in diretta e continua a suonare.
(() => {
  const D = 3.84, TETTO = Math.floor(3 * 3600 / D), CH = "ilregno.archivio", oggi = () => new Date().toDateString();
  let st, classe;

  // La forma misurata: ogni riga 3,84 s, l'ora del primo pezzo, il nome del primo pezzo che finisce col numero di MEDIA-SEQUENCE.
  function forma(t) {
    const e = [...t.matchAll(/#EXTINF:([\d.]+)/g)], n = t.match(/#EXT-X-MEDIA-SEQUENCE:(\d+)/),
      o = t.match(/#EXT-X-PROGRAM-DATE-TIME:(\S+)/), m = t.match(/^([^#\n]+-)(\d+)(\.(?:ts|aac))$/m);
    return e.length && e.every(x => +x[1] === D) && n && o && m && +m[2] === +n[1] && !isNaN(Date.parse(o[1]))
      ? { n: +n[1], pdt: Date.parse(o[1]), tag: o[0], pre: m[1], suf: m[3] } : null;
  }
  // Primo pezzo voluto: dall'inizio del programma in onda meno 1 minuto (senza guida: 3 ore), mai oltre 3 ore e mai più indietro di prima;
  // il punto che si guarda resta dentro (la guida che arriva tardi accorcia la lista solo fin lì)
  function partenza(s, f) {
    const p = programma(cur), da = p ? Date.parse(p.i) - 6e4 : 0, v = s.h.playingDate;
    let ns = f.n - Math.min(TETTO, Math.max(0, Math.ceil((f.pdt - da) / 1e3 / D - 1e-6)));
    if (v) ns = Math.min(ns, f.n + Math.floor((v - f.pdt) / 1e3 / D) - 3);
    return Math.max(ns, s.ns || 0);
  }
  // La lista con i pezzi vecchi davanti. Le righe aggiunte si tengono da una volta all'altra: ogni ricarica ne aggiunge una sola.
  function allunga(s, t, f) {
    const k = f.n - s.ns;
    if (k <= 0) return t;
    const c = f.pre + f.suf;
    let m = s.memo[c];
    if (!m || m.ns !== s.ns || m.n > f.n) m = s.memo[c] = { ns: s.ns, n: s.ns, r: "" };
    for (; m.n < f.n; m.n++) m.r += (m.r ? "\n" : "") + "#EXTINF:3.84,\n" + f.pre + m.n + f.suf;
    return t.replace(/#EXT-X-MEDIA-SEQUENCE:\d+/, "#EXT-X-MEDIA-SEQUENCE:" + s.ns)
      .replace(f.tag, () => "#EXT-X-PROGRAM-DATE-TIME:" + new Date(f.pdt - k * D * 1e3).toISOString() + "\n" + m.r);
  }
  // Spento: il caricatore smette di aggiungere (alla ricarica dopo, ≤ 4 s, la lista torna quella vera, senza riaprire il canale);
  // la pagina smette subito di contare i pezzi aggiunti (details.vero = primo pezzo vero); se si guardava la parte aggiunta, in diretta.
  // Per il giorno (si ricorda in `mem`) solo se il server dice che i pezzi non ci sono (4xx); `breve` = solo per questa apertura.
  function spegni(s, motivo, breve) {
    if (s.spento) return;
    s.spento = 1; s.on = 0; clearTimeout(s.g4);
    console.warn("T01 archivio Mediaset spento", motivo);
    if (!breve) mem.set(CH, oggi());
    const h = s.h;
    h.levels.forEach(l => { if (l.details) l.details.vero = s.n0; });
    if (h !== hls) return;
    const l = h.levels[h.currentLevel >= 0 ? h.currentLevel : 0], f = l && l.details && l.details.fragments.find(x => x.sn === s.n0);
    if (f && V.currentTime < f.start && h.liveSyncPosition) { V.currentTime = h.liveSyncPosition; aggiornaTempo(); }
  }
  // Ogni apertura di un Mediaset riparte da zero (alla prima lista, quella principale, hls.js è già nella pagina come `hls`)
  function nuovo() {
    const h = hls, s = st = { h, memo: {}, on: 0, deciso: 0, audio: 0, attese: [] };
    // G3: un pezzo più vecchio della lista vera risponde 4xx
    h.on(Hls.Events.ERROR, (e, d) => {
      const r = d.response;
      if (!s.spento && d.details === "fragLoadError" && r && r.code >= 400 && r.code < 500 && d.frag && d.frag.sn < s.n0) spegni(s, "G3 " + r.code);
    });
    // G4: un salto dentro la parte aggiunta che non riparte entro 8 s: può essere solo la linea lenta, quindi spegne solo per questa apertura
    // (un 4xx su un pezzo aggiunto è G3, che spegne per il giorno)
    V.onseeking = () => {
      clearTimeout(s.g4);
      const l = h.levels[h.currentLevel >= 0 ? h.currentLevel : 0], f = s.on && l && l.details && l.details.fragments.find(x => x.sn === s.n0), t = V.currentTime;
      if (f && t < f.start) s.g4 = setTimeout(() => { if (!V.paused && V.currentTime - t < 2) spegni(s, "G4", 1); }, 8000);
    };
    h.on(Hls.Events.DESTROYING, () => { clearTimeout(s.g4); clearTimeout(s.t); if (V.onseeking && st === s) V.onseeking = null; });
    return s;
  }
  // Prima lista video e prima lista audio insieme: l'archivio si accende solo se tutte e due sono della forma misurata (G1);
  // G2: il pezzo più vecchio voluto risponde 200 (HEAD), senza far aspettare la partenza; un 4xx spegne per il giorno, lentezza (3 s), rete o 5xx solo per questa apertura.
  function decidi(s) {
    if (s.deciso) return;
    s.deciso = 1; clearTimeout(s.t);
    s.on = !!(s.audio && s.v && s.a);
    if (s.on) {
      s.n0 = s.v.n; s.ns = partenza(s, s.v);
      fetch(new URL(s.v.pre + s.ns + s.v.suf, s.u), { method: "HEAD", signal: scade(3000) })
        .then(r => { if (!r.ok) throw r.status; }).catch(x => spegni(s, "G2 " + x, !(x >= 400 && x < 500)));
    }
    s.attese.splice(0).forEach(f => f());
  }
  function lista(s, c, r, ok) {
    const f = forma(r.data);
    const fine = () => {
      if (s.on) {
        if (!f) spegni(s, "forma");
        else {
          if (c.type === "level") { s.n0 = f.n; s.ns = partenza(s, f); }
          r.data = allunga(s, r.data, f);
        }
      }
      ok();
    };
    if (s.deciso) return fine();
    if (c.type === "level") { if (s.v === undefined) { s.v = f; s.u = c.url; } }
    else if (s.a === undefined) s.a = f;
    s.attese.push(fine);
    if (s.v !== undefined && s.a !== undefined) decidi(s);
    else if (!s.t) s.t = setTimeout(() => decidi(s), 3000);
  }
  const crea = () => class extends Hls.DefaultConfig.loader {
    load(c, cfg, cb) {
      if (!MS.test(c.url)) return super.load(c, cfg, cb);
      const ok = cb.onSuccess, quando = c.type;
      if (quando === "manifest") {
        let s;
        try { s = nuovo(); } catch (e) { st = null; }
        return super.load(c, cfg, Object.assign({}, cb, { onSuccess: (r, ...a) => { if (s) s.audio = /TYPE=AUDIO[^\n]*URI=/.test(r.data); ok(r, ...a); } }));
      }
      const s = st;
      if ((quando !== "level" && quando !== "audioTrack") || !s || s.h !== hls || s.spento) return super.load(c, cfg, cb);
      super.load(c, cfg, Object.assign({}, cb, { onSuccess: (r, ...a) => {
        const dopo = () => { if (!this.morto) ok(r, ...a); };
        try { lista(s, c, r, dopo); } catch (e) { spegni(s, "errore " + e); dopo(); }
      } }));
    }
    abort() { this.morto = 1; super.abort(); }
    destroy() { this.morto = 1; super.destroy(); }
  };
  // I Mediaset passano da qui; spento per il giorno, o senza archivio.js, il caricatore è quello di hls.js
  Object.defineProperty(CONFIG_HLS, "pLoader", { enumerable: true, configurable: true, get: () => mem.get(CH) === oggi() ? undefined : (classe = classe || crea()) });
})();
