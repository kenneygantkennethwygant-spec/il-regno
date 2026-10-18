// Controllo giornaliero di Il Regno: prova i flussi dei canali e i siti, costruisce la guida dei programmi.
// Node 20, nessuna dipendenza. Scrive stato.json e guida.json accanto a index.html (mai su Firebase).
//
//   IL_REGNO_DB=<url del database>  legge <db>/v2.json (sola lettura, pubblico)
//   IL_REGNO_V2=<file>              legge v2 da un file locale (prima del database; per prove prima della migrazione)
//
// Le funzioni pure in cima sono esportate per le prove di unità (prove/unita/controllo.test.mjs).

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

// ---------------------------------------------------------------------------------------------------------------
// Orari di Roma
// ---------------------------------------------------------------------------------------------------------------
const FMT_ROMA = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Rome', hourCycle: 'h23',
  year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
});
const p2 = (n) => String(n).padStart(2, '0');

/** Campi dell'orologio di Roma per un istante (ms). */
function campiRoma(ms) {
  const o = {};
  for (const { type, value } of FMT_ROMA.formatToParts(new Date(ms))) if (type !== 'literal') o[type] = Number(value);
  return o;
}
/** Scarto di Roma rispetto a UTC in minuti (120 d'estate, 60 d'inverno) all'istante ms. */
function scartoRoma(ms) {
  const c = campiRoma(ms);
  return Math.round((Date.UTC(c.year, c.month - 1, c.day, c.hour, c.minute, c.second) - Math.floor(ms / 1000) * 1000) / 60000);
}
/** Istante (ms) di un orario locale di Roma. */
function msDaRoma(y, mo, d, h = 0, mi = 0, s = 0) {
  const locale = Date.UTC(y, mo - 1, d, h, mi, s);
  let ms = locale - scartoRoma(locale) * 60000;
  ms = locale - scartoRoma(ms) * 60000;
  return ms;
}
/** ISO 8601 con secondi e lo scarto di Roma di quell'istante: 2026-10-17T21:20:00+02:00. */
export function isoRoma(ms) {
  const c = campiRoma(ms);
  const sc = scartoRoma(ms);
  const segno = sc < 0 ? '-' : '+';
  const a = Math.abs(sc);
  return `${c.year}-${p2(c.month)}-${p2(c.day)}T${p2(c.hour)}:${p2(c.minute)}:${p2(c.second)}${segno}${p2(Math.floor(a / 60))}:${p2(a % 60)}`;
}
const dataIso = (y, mo, d) => `${y}-${p2(mo)}-${p2(d)}`;
/** Aggiunge giorni a una data AAAA-MM-GG (aritmetica sul calendario, senza fusi). */
function sommaGiorni(aaaammgg, n) {
  const [y, m, d] = aaaammgg.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return dataIso(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

// ---------------------------------------------------------------------------------------------------------------
// Funzioni pure (esportate)
// ---------------------------------------------------------------------------------------------------------------
const perInizio = (a, b) => Date.parse(a.i) - Date.parse(b.i) || Date.parse(a.f) - Date.parse(b.f);

/** Le date dei file-giorno tivùsat da scaricare per coprire da `adesso` a fine domani (ora di Roma). */
export function giorniTivusat(adesso) {
  const c = campiRoma(adesso.getTime());
  const oggi = dataIso(c.year, c.month, c.day);
  const giorni = [oggi, sommaGiorni(oggi, 1)];
  // il «giorno» tivùsat va dalle 06:00 alle 06:00: prima delle 06:00 serve anche quello di ieri
  if (c.hour < 6) giorni.unshift(sommaGiorni(oggi, -1));
  return giorni;
}

/** Una risposta di tivùsat (/api/epg/channels/{id}/date/{AAAA-MM-GG}) in voci ordinate per inizio. */
export function leggiTivusat(risposta) {
  const voci = [];
  const orario = (s) => {
    const m = /^(\d\d)-(\d\d)-(\d{4}) (\d\d):(\d\d)$/.exec(String(s || '').trim());
    return m ? isoRoma(msDaRoma(+m[3], +m[2], +m[1], +m[4], +m[5])) : null;
  };
  for (const e of (risposta && risposta.events) || []) {
    const t = e && e.program && e.program.title;
    const i = orario(e && e.date_start), f = orario(e && e.date_end);
    if (t && i && f) voci.push({ t: String(t).trim(), i, f });
  }
  return voci.sort(perInizio);
}

const ENTITA = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
function decodificaXml(s) {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (tutto, e) => {
      if (e[0] === '#') {
        const cp = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        try { return String.fromCodePoint(cp); } catch { return tutto; }
      }
      return ENTITA[e] ?? tutto;
    });
}
/** «20261017190000 +0000» -> ms. Senza scarto vale UTC. */
function msXmltv(s) {
  const m = /^\s*(\d{4})(\d\d)(\d\d)(\d\d)(\d\d)(\d\d)?\s*(?:([+-])(\d\d):?(\d\d))?\s*$/.exec(s || '');
  if (!m) return NaN;
  const scarto = m[7] ? (m[7] === '-' ? -1 : 1) * (Number(m[8]) * 60 + Number(m[9])) : 0;
  return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0)) - scarto * 60000;
}

/** Un documento XMLTV in {epgId: voci[]}: solo i canali di `mappa` ({idXmltv: epgId}), ognuno ordinato per inizio. */
export function leggiXmltv(testo, mappa) {
  const out = {};
  testo = String(testo).replace(/^﻿/, '');
  const re = /<programme\b([^>]*)>([\s\S]*?)<\/programme>/g;
  let m;
  while ((m = re.exec(testo))) {
    const attr = {};
    for (const a of m[1].matchAll(/([\w:-]+)\s*=\s*"([^"]*)"/g)) attr[a[1]] = decodificaXml(a[2]);
    const epg = Object.hasOwn(mappa, attr.channel) ? mappa[attr.channel] : undefined;
    if (!epg) continue;
    const titolo = /<title\b[^>]*>([\s\S]*?)<\/title>/.exec(m[2]);
    const i = msXmltv(attr.start), f = msXmltv(attr.stop);
    if (!titolo || Number.isNaN(i) || Number.isNaN(f)) continue;
    const t = decodificaXml(titolo[1]).trim();
    if (!t) continue;
    (out[epg] ||= []).push({ t, i: isoRoma(i), f: isoRoma(f) });
  }
  for (const k of Object.keys(out)) out[k].sort(perInizio);
  return out;
}

/** Cosa va in onda e cosa viene dopo. Con programmi sovrapposti vale quello iniziato per ultimo. */
export function oraEDopo(voci, adesso) {
  const t = adesso.getTime();
  let ora = null, dopo = null;
  for (const v of voci) {
    const i = Date.parse(v.i), f = Date.parse(v.f);
    if (i <= t && t < f && (!ora || i >= Date.parse(ora.i))) ora = v;
    if (i > t && (!dopo || i < Date.parse(dopo.i))) dopo = v;
  }
  return { ora, dopo };
}

// «www.» davanti non fa un sito nuovo: animeworld.ac e www.animeworld.ac sono lo stesso posto.
const hostDi = (u) => new URL(u).hostname.toLowerCase().replace(/^www\./, '');

/**
 * Esito della prova di un sito: ok se risponde con stato < 400; `nuovo` se dopo i rimandi l'host è diverso. Un 403
 * dal server all'estero (siti che chiudono la porta ai server stranieri) vale null: non verificabile, mostrato come ok.
 */
export function classificaSito(prova) {
  if (!prova.errore && prova.stato === 403) return { ok: null };
  const ok = !prova.errore && typeof prova.stato === 'number' && prova.stato < 400;
  if (!ok) return { ok: false };
  const out = { ok: true };
  try {
    if (prova.finale && hostDi(prova.finale) !== hostDi(prova.url)) out.nuovo = prova.finale;
  } catch { /* indirizzo illeggibile: nessuna proposta */ }
  return out;
}

/** Il nome del sito: l'etichetta prima dell'estensione (www.fctv33hd.mom -> fctv33hd). '' per IP, host a una sola etichetta, indirizzo illeggibile. */
export function nomeSito(url) {
  let host;
  try { host = new URL(url).hostname.toLowerCase().replace(/\.$/, ''); } catch { return ''; }
  if (/^[\d.]+$/.test(host) || /[:[\]]/.test(host)) return '';
  const etichette = host.split('.');
  return etichette.length < 2 ? '' : etichette[etichette.length - 2];
}

/** Stesso sito sotto un'altra estensione: nome uguale, o uno comincia con l'altro e il più corto ha almeno 6 lettere. */
export function stessoNome(a, b) {
  const na = nomeSito(a), nb = nomeSito(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  const [corto, lungo] = na.length <= nb.length ? [na, nb] : [nb, na];
  return corto.length >= 6 && lungo.startsWith(corto);
}

/** Il nuovo indirizzo ricordato da ieri da riprovare oggi, o null: serve che i dati abbiano ancora l'indirizzo sostituito e che oggi non risponda. */
export function daRiprovare(url, oggi, prima) {
  if (!prima || prima.sostituisce !== url || !prima.nuovo) return null;
  return oggi && oggi.ok === true ? null : prima.nuovo;
}

/**
 * Cosa va in stato.siti[id]. Un rimando verso lo stesso sito (stessoNome) diventa una sostituzione legata
 * all'indirizzo esatto; ogni altro rimando resta una proposta per il pannello. Con `ricordo` ({url, esito}: la prova
 * del nuovo indirizzo di ieri) la sostituzione si porta avanti se risponde ancora, seguendo un suo rimando allo stesso sito.
 */
export function voceSito(url, esito, ricordo) {
  if (ricordo) {
    const raggiunto = ricordo.esito.nuovo || ricordo.url;
    return ricordo.esito.ok && stessoNome(url, raggiunto) ? { ok: true, nuovo: raggiunto, sostituisce: url } : { ok: false };
  }
  return esito.ok && esito.nuovo && stessoNome(url, esito.nuovo) ? { ...esito, sostituisce: url } : { ...esito };
}

/**
 * Esito della prova di un canale: ok con 200 e una playlist che comincia con #EXTM3U. Il controllo gira su un server
 * all'estero: un 403, o per la Rai un 200 senza playlist, non si distingue da un blocco per paese e vale null
 * (non verificabile), che la pagina mostra come ok.
 */
export function classificaCanale(prova, canale) {
  if (prova.errore) return { ok: false };
  if (prova.stato === 403) return { ok: null };
  if (prova.stato !== 200) return { ok: false };
  if (/^\s*#EXTM3U/.test(prova.corpo || '')) return { ok: true };
  return { ok: canale && canale.rai === true ? null : false };
}

const ESTERO = "non verificabile dall'estero";

/** L'indirizzo dell'API pubblica di Sky che dà il flusso di un canale (TV8 7, Cielo 2, Sky TG24 10). */
export const urlSky = (n) => `https://video.sky.it/api/v1/getLivestream?id=${encodeURIComponent(n)}&isMobile=false`;

/** L'indirizzo del flusso (con gettone di 5 minuti) in una risposta dell'API di Sky, o null se manca. */
export function leggiSky(risposta) {
  const u = risposta && risposta.streaming_url;
  return typeof u === 'string' && /^https?:\/\/\S+$/.test(u) ? u : null;
}

/** Guida di oggi con, per i canali la cui fonte oggi è vuota, quella di ieri. Non modifica gli argomenti. */
export function unisciGuida(ieri, oggi) {
  const canali = {};
  const idIeri = (ieri && ieri.canali) || {};
  const idOggi = (oggi && oggi.canali) || {};
  for (const id of new Set([...Object.keys(idIeri), ...Object.keys(idOggi)])) {
    const o = idOggi[id], i = idIeri[id];
    canali[id] = structuredClone(o && o.length ? o : (i && i.length ? i : (o || [])));
  }
  return { aggiornato: oggi.aggiornato, canali };
}

/** Le voci che finiscono dopo `adesso` e cominciano prima di 36 ore dopo: la guida copre fino al giro successivo, con margine. */
export function ritagliaGuida(voci, adesso) {
  const t = adesso.getTime(), fine = t + 36 * 3600 * 1000;
  return voci.filter((v) => Date.parse(v.f) > t && Date.parse(v.i) < fine);
}

// Le code di data che fanno tagliare i titoli sulle schede; vale la prima che si trova.
const CODE_TITOLO = [
  /\s*[-–—]\s*Puntata del \d{1,2}\/\d{1,2}\/\d{4}\s*$/i,
  /\s+del \d{1,2}\/\d{1,2}\/\d{4}\s*$/i,
  /\s*[-–—]\s*\d{1,2}\/\d{1,2}\/\d{4}\s*$/,
];
/** Il titolo di un programma senza la data in coda («- Puntata del 17/10/2026», « del 17/10/2026», «- 17/10/2026»). Se non resterebbe nulla, com'è. */
export function pulisciTitolo(t) {
  if (typeof t !== 'string') return t;
  for (const coda of CODE_TITOLO) {
    if (!coda.test(t)) continue;
    const pulito = t.replace(coda, '');
    return /^(Puntata)?$/i.test(pulito.trim()) ? t : pulito;
  }
  return t;
}

// ---------------------------------------------------------------------------------------------------------------
// Rete e programma principale
// ---------------------------------------------------------------------------------------------------------------
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const TIVUSAT = 'https://services.tivulaguida.it/api/epg';
const EPGSHARE = 'https://epgshare01.online/epgshare01/epg_ripper_IT1.xml.gz';
const TEMPO_CANALE = 10000, TEMPO_SITO = 15000, TEMPO_GUIDA = 20000, TEMPO_XMLTV = 60000;
const PARALLELI = 12;

// I canali che tivùsat chiama con un nome diverso dall'id di Il Regno, e i due con id doppio (HD e non HD):
// per Canale 5 e Italia 1 si usano 145 e 148, non 5 e 6 (IMPARATO).
const TIVUSAT_ALIAS = { rtl1025tv: 'rtl1025', hgtvitaly: 'hgtv' };
const TIVUSAT_ID_FISSO = { canale5: 145, italia1: 148 };
// I canali che tivùsat non ha e epgshare01 sì (id XMLTV -> id di Il Regno). Radio 105 e Radio TV Serie A: nessuna fonte.
const XMLTV_MAPPA = {
  'Sky.TG24.it': 'skytg24', 'SuperTennis.HD.it': 'supertennis', 'Sportitalia.HD.it': 'sportitalia',
  'R101tv.it': 'r101tv', 'Deejay.TV.it': 'deejaytv', 'Motor.Trend.it': 'motortrend', 'Gambero.Rosso.HD.it': 'gamberorosso',
};
const normalizza = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');

const dormi = (ms) => new Promise((r) => setTimeout(r, ms));
const msg = (e) => (e && (e.cause && e.cause.code ? `${e.message} (${e.cause.code})` : e.message)) || String(e);

/** Esegue `fn` su ogni elemento con al massimo `n` richieste insieme. */
async function inParallelo(elementi, n, fn) {
  const risultati = new Array(elementi.length);
  let prossimo = 0;
  await Promise.all(Array.from({ length: Math.min(n, elementi.length) }, async () => {
    while (prossimo < elementi.length) { const k = prossimo++; risultati[k] = await fn(elementi[k], k); }
  }));
  return risultati;
}

/** GET che segue i rimandi; legge al massimo `max` byte di corpo (le playlist sono piccole, le pagine dei siti no). */
async function prendi(url, tempo, max = 0) {
  const res = await fetch(url, { redirect: 'follow', headers: { 'User-Agent': UA, Accept: '*/*' }, signal: AbortSignal.timeout(tempo) });
  let corpo = '';
  if (max > 0 && res.body) {
    const lettore = res.body.getReader();
    const dec = new TextDecoder();
    let letti = 0;
    while (letti < max) {
      const { done, value } = await lettore.read();
      if (done) break;
      letti += value.length;
      corpo += dec.decode(value, { stream: true });
    }
    await lettore.cancel().catch(() => {});
  } else if (res.body) {
    await res.body.cancel().catch(() => {});
  }
  return { stato: res.status, finale: res.url, corpo };
}

/** Una prova di rete con un secondo tentativo se è fallita per errore di rete o 5xx (un guasto di un attimo non deve ingiallire un canale). */
async function conRiprova(fa) {
  let r;
  for (let n = 0; n < 2; n++) {
    try { r = await fa(); } catch (e) { r = { errore: msg(e) }; }
    if (!r.errore && r.stato < 500) return r;
    if (n === 0) await dormi(1500);
  }
  return r;
}

async function leggiV2() {
  if (process.env.IL_REGNO_V2) return JSON.parse(readFileSync(process.env.IL_REGNO_V2, 'utf8'));
  const db = (process.env.IL_REGNO_DB || '').replace(/\/+$/, '');
  if (!db) throw new Error('manca IL_REGNO_DB (indirizzo del database) e anche IL_REGNO_V2 (file locale)');
  const res = await fetch(`${db}/v2.json`, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`lettura di v2 fallita: HTTP ${res.status}`);
  return res.json();
}

/** Prima voce non commento di una playlist, resa assoluta rispetto all'indirizzo da cui è arrivata. */
function primaVoce(corpo, base) {
  const riga = corpo.split(/\r?\n/).map((l) => l.trim()).find((l) => l && !l.startsWith('#'));
  return riga ? new URL(riga, base).href : null;
}

/**
 * Una playlist che risponde non basta: alcuni flussi (DMAX e gli altri canali Discovery, 17/10) danno la playlist e
 * rifiutano i pezzi del video con 403. Si scende dalla playlist principale a quella di una qualità e si chiede il
 * primo pezzo; se non dà 200 il canale non funziona.
 */
async function provaPezzo(r) {
  let pl = r;
  if (/#EXT-X-STREAM-INF/.test(pl.corpo)) {
    const qualita = primaVoce(pl.corpo, pl.finale);
    if (!qualita) return null;
    pl = await conRiprova(() => prendi(qualita, TEMPO_CANALE, 65536));
    if (pl.errore || pl.stato !== 200) return `qualità ${pl.errore || 'HTTP ' + pl.stato}`;
  }
  const pezzo = primaVoce(pl.corpo, pl.finale);
  if (!pezzo) return null;
  const p = await conRiprova(() => prendi(pezzo, TEMPO_CANALE, 1024));
  return p.errore || p.stato !== 200 ? `pezzo del video ${p.errore || 'HTTP ' + p.stato}` : null;
}

/**
 * Un canale. Se ha "sky" l'indirizzo con gettone (5 minuti) si chiede prima all'API di Sky, come fa la pagina; poi
 * playlist e primo pezzo si provano con lo stesso User-Agent (il pezzo è legato a quello che ha chiesto la playlist).
 */
export async function controllaCanale(c) {
  let url = c.url;
  if (c.sky) {
    const a = await conRiprova(async () => {
      const r = await prendi(urlSky(c.sky), TEMPO_CANALE, 65536);
      let json = null;
      try { json = JSON.parse(r.corpo); } catch { /* non è JSON */ }
      return { ...r, json };
    });
    if (!a.errore && a.stato === 403) return { id: c.id, ok: null, dettaglio: ESTERO };
    url = a.stato === 200 ? leggiSky(a.json) : null;
    if (!url) return { id: c.id, ok: false, dettaglio: `API Sky ${a.errore || (a.stato === 200 ? 'senza streaming_url' : 'HTTP ' + a.stato)}` };
  }
  const r = await conRiprova(() => prendi(url, TEMPO_CANALE, 65536));
  const esito = classificaCanale(r, c);
  if (esito.ok === null) return { id: c.id, ok: null, dettaglio: ESTERO };
  if (!esito.ok) return { id: c.id, ...esito, dettaglio: r.errore || `HTTP ${r.stato}` };
  const guasto = await provaPezzo(r).catch((e) => `pezzo del video ${msg(e)}`);
  return { id: c.id, ok: !guasto, dettaglio: guasto || `HTTP ${r.stato}` };
}

const controllaCanali = (canali) => inParallelo(canali, PARALLELI, controllaCanale);

/** Prova un sito; se ieri era stato sostituito da sé e oggi il vecchio indirizzo non risponde, prova anche il nuovo ricordato. */
async function controllaSiti(siti, statoIeri) {
  const prova = async (url) => {
    const r = await conRiprova(() => prendi(url, TEMPO_SITO));
    return { esito: classificaSito({ url, finale: r.finale, stato: r.stato, errore: r.errore }), dettaglio: r.errore || `HTTP ${r.stato}` };
  };
  return inParallelo(siti, 4, async (s) => {
    const { esito, dettaglio } = await prova(s.url);
    const riprova = daRiprovare(s.url, esito, statoIeri.siti && statoIeri.siti[s.id]);
    const ricordo = riprova ? { url: riprova, esito: (await prova(riprova)).esito } : undefined;
    return { id: s.id, voce: voceSito(s.url, esito, ricordo), dettaglio };
  });
}

async function json(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: AbortSignal.timeout(TEMPO_GUIDA) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/** Guida da tivùsat: {epgId: voci[]} per i canali di Il Regno che tivùsat ha. */
async function guidaTivusat(canali, adesso, log) {
  const elenco = (await json(`${TIVUSAT}/channels`)).channels || [];
  const perNome = new Map();
  for (const t of elenco) {
    const n = normalizza(String(t.name).replace(/\s+HD$/i, ''));
    const chiave = TIVUSAT_ALIAS[n] || n;
    if (!perNome.has(chiave)) perNome.set(chiave, t.id); // a parità di nome vince il primo (la versione HD)
  }
  const idTivusat = {};
  for (const c of canali) {
    const epg = c.epg || c.id;
    const id = TIVUSAT_ID_FISSO[epg] ?? perNome.get(normalizza(epg));
    if (id !== undefined) idTivusat[epg] = id;
  }
  const giorni = giorniTivusat(adesso);
  const lavori = [];
  for (const [epg, id] of Object.entries(idTivusat)) for (const g of giorni) lavori.push({ epg, id, g });
  const risposte = await inParallelo(lavori, 8, async (l) => {
    try { return { ...l, voci: leggiTivusat(await json(`${TIVUSAT}/channels/${l.id}/date/${l.g}`)) }; }
    catch (e) { log(`  tivùsat ${l.epg} ${l.g}: ${msg(e)}`); return { ...l, voci: [] }; }
  });
  const out = {};
  for (const r of risposte) (out[r.epg] ||= []).push(...r.voci);
  for (const k of Object.keys(out)) {
    const visti = new Set();
    out[k] = out[k].filter((v) => { const x = `${v.i}|${v.f}|${v.t}`; return visti.has(x) ? false : visti.add(x); }).sort(perInizio);
  }
  return { guida: out, richiesti: Object.keys(idTivusat).length };
}

/** Guida da epgshare01 (XMLTV compresso) per i canali che tivùsat non ha. */
async function guidaXmltv(canali) {
  const epgDiRegno = new Set(canali.map((c) => c.epg || c.id));
  const mappa = Object.fromEntries(Object.entries(XMLTV_MAPPA).filter(([, epg]) => epgDiRegno.has(epg)));
  const res = await fetch(EPGSHARE, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(TEMPO_XMLTV) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  let buf = Buffer.from(await res.arrayBuffer());
  if (buf[0] === 0x1f && buf[1] === 0x8b) buf = gunzipSync(buf);
  return { guida: leggiXmltv(buf.toString('utf8'), mappa), richiesti: Object.keys(mappa).length };
}

async function main() {
  const t0 = Date.now();
  const log = (s) => console.log(s);
  const qui = dirname(fileURLToPath(import.meta.url));
  const cartella = join(qui, '..'); // sito/: ci stanno stato.json e guida.json
  const adesso = new Date();

  let statoIeri = {};
  try { statoIeri = JSON.parse(readFileSync(join(cartella, 'stato.json'), 'utf8')) || {}; } catch { /* manca o è illeggibile: come se fosse vuoto */ }

  const v2 = await leggiV2();
  if (!v2 || !Array.isArray(v2.canali) || !Array.isArray(v2.siti)) throw new Error('v2 non c\'è o non ha la forma attesa (canali e siti)');
  log(`Il Regno, controllo del ${isoRoma(adesso.getTime())}: ${v2.canali.length} canali, ${v2.siti.length} siti`);

  const [canali, siti, tiv, xml] = await Promise.all([
    controllaCanali(v2.canali),
    controllaSiti(v2.siti, statoIeri),
    guidaTivusat(v2.canali, adesso, log).catch((e) => { log(`tivùsat non risponde: ${msg(e)}`); return { guida: {}, richiesti: 0 }; }),
    guidaXmltv(v2.canali).catch((e) => { log(`epgshare01 non risponde: ${msg(e)}`); return { guida: {}, richiesti: 0 }; }),
  ]);

  // Se nulla risponde il guasto è del collegamento di chi esegue, non dei canali: non si scrive uno stato tutto giallo.
  if (!canali.some((c) => c.ok) && !siti.some((s) => s.voce.ok)) throw new Error('nessun canale e nessun sito risponde: collegamento assente? Non scrivo nulla.');

  const stato = { aggiornato: isoRoma(adesso.getTime()), canali: {}, siti: {} };
  for (const c of canali) stato.canali[c.id] = { ok: c.ok };
  for (const s of siti) stato.siti[s.id] = s.voce;

  // Guida: le prossime 36 ore dall'istante scritto in `aggiornato`. Una fonte vuota lascia quella di ieri.
  const generata = new Date(Date.parse(stato.aggiornato));
  const percorsoGuida = join(cartella, 'guida.json');
  let ieri = null;
  try { if (existsSync(percorsoGuida)) ieri = JSON.parse(readFileSync(percorsoGuida, 'utf8')); } catch (e) { log(`guida.json di ieri illeggibile: ${msg(e)}`); }
  const oggi = { aggiornato: stato.aggiornato, canali: { ...tiv.guida, ...xml.guida } };
  const unita = unisciGuida(ieri, oggi);
  const guida = { aggiornato: unita.aggiornato, canali: {} };
  const epgNoti = new Set(v2.canali.map((x) => x.epg || x.id));
  const tenutiDiIeri = [];
  for (const [id, voci] of Object.entries(unita.canali)) {
    if (!epgNoti.has(id)) continue; // un canale tolto dai dati non resta nella guida
    const dentro = ritagliaGuida(voci, generata);
    if (dentro.length) guida.canali[id] = dentro.map((v) => ({ ...v, t: pulisciTitolo(v.t) }));
    if (dentro.length && !(oggi.canali[id] && oggi.canali[id].length)) tenutiDiIeri.push(id);
  }

  writeFileSync(join(cartella, 'stato.json'), JSON.stringify(stato) + '\n');
  writeFileSync(percorsoGuida, JSON.stringify(guida) + '\n');

  // Riassunto
  const ko = canali.filter((x) => x.ok === false);
  const estero = canali.filter((x) => x.ok === null);
  log(`\nCanali: ${canali.length - ko.length - estero.length} ok, ${estero.length} non verificabili dall'estero, ${ko.length} non ok`);
  if (estero.length) log(`  non verificabili: ${estero.map((x) => x.id).join(', ')}`);
  for (const k of ko) log(`  non ok: ${k.id} (${k.dettaglio})`);
  log(`Siti:`);
  for (const s of siti) {
    const v = s.voce;
    log(`  ${s.id}: ${v.ok ? 'ok' : v.ok === null ? "non verificabile dall'estero" : 'NON ok'} (${s.dettaglio})${v.nuovo ? ` -> ${v.sostituisce ? 'sostituito da sé con' : 'nuovo indirizzo'} ${v.nuovo}` : ''}`);
  }
  const senza = v2.canali.filter((x) => !guida.canali[x.epg || x.id]).map((x) => x.id);
  log(`Guida: ${Object.keys(guida.canali).length} canali su ${v2.canali.length} con programmi (tivùsat ${Object.keys(tiv.guida).length}/${tiv.richiesti}, epgshare01 ${Object.keys(xml.guida).length}/${xml.richiesti})`);
  if (senza.length) log(`  senza guida: ${senza.join(', ')}`);
  if (tenutiDiIeri.length) log(`  tenuta la guida di ieri per: ${tenutiDiIeri.join(', ')}`);
  log(`Fatto in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(`Controllo fallito: ${msg(e)}`); process.exit(1); });
}
