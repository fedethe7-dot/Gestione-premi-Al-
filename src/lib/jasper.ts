/**
 * Export "Prenotazioni premi" di Jasper: lettura e statistiche.
 *
 * Il file di Jasper è un report impaginato per la stampa: intestazioni ripetute a ogni pagina,
 * righe "Report eseguito il…", subtotali per punto vendita e colonne vuote. Qui si tengono solo
 * le righe con un codice prenotazione e si calcolano le statistiche. Tutto avviene nel browser:
 * le righe (con i numeri di tessera) non vengono mai inviate al database.
 */
import type { ValoreCella } from './xlsx.ts';

export type StatoJasper = 'daetic' | 'etic' | 'chiusa' | 'stornata' | 'altro';

export const STATI_JASPER: Record<StatoJasper, { etichetta: string; colore: string }> = {
  daetic: { etichetta: 'Aperta · da etichettare', colore: '#e9a20d' },
  etic: { etichetta: 'Aperta · etichettata', colore: '#2a78d6' },
  chiusa: { etichetta: 'Chiusa', colore: '#0ca30c' },
  stornata: { etichetta: 'Stornata', colore: '#d03b3b' },
  altro: { etichetta: 'Altro stato', colore: '#94a3b8' },
};
export const ORDINE_STATI: StatoJasper[] = ['daetic', 'etic', 'chiusa', 'stornata', 'altro'];

export interface RigaJasper {
  codice: string;            // codice prenotazione
  apertura: number | null;   // giorni dal 1/1/1970 (UTC)
  chiusura: number | null;
  mese: number;              // aaaamm del giorno di apertura, 0 se manca
  pdv: string;
  articolo: string;
  premio: string;            // articolo senza " C/A"
  chiave: string;            // codice riordino (stesso premio, con o senza contributo)
  tessera: string;
  tipo: string;              // "Prenotazione" | "Online" | altro
  stato: StatoJasper;
  contributo: number;
  qta: number;
  donazione: boolean;
  conContributo: boolean;
}

export interface ExportJasper {
  righe: RigaJasper[];
  /** Totali scritti da Jasper in cima al report, per il controllo. */
  totali: { qta: number; contributo: number } | null;
  /** Data del report ("Report eseguito il"), in giorni dal 1/1/1970. */
  dataReport: number | null;
  doppioni: number;
}

export class ErroreJasper extends Error {}

const norm = (v: ValoreCella | undefined) => String(v ?? '').toLowerCase().replace(/\s+/g, ' ').trim();

/** Numero da cella Excel o testo italiano ("1.234,50", "52.306", "12,00"). */
export function numeroIt(v: ValoreCella | undefined): number {
  if (v === null || v === undefined || v === '') return 0;
  if (typeof v === 'number') return v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  let s = v.trim().replace(/[€\s]/g, '');
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

/** Giorno (dal 1/1/1970) da data Excel (numero), "gg/mm/aaaa" o "aaaa-mm-gg". */
export function giornoDa(v: ValoreCella | undefined): number | null {
  if (v === null || v === undefined || v === '' || typeof v === 'boolean') return null;
  if (typeof v === 'number') return v > 20000 && v < 80000 ? Math.floor(v) - 25569 : null;
  const s = v.trim();
  let m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/.exec(s);
  if (m) { let y = Number(m[3]); if (y < 100) y += 2000; return Math.floor(Date.UTC(y, Number(m[2]) - 1, Number(m[1])) / 864e5); }
  m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return Math.floor(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / 864e5);
  const n = Number(s.replace(',', '.'));
  return Number.isFinite(n) && n > 20000 ? giornoDa(n) : null;
}

export function meseDi(g: number): number { const d = new Date(g * 864e5); return d.getUTCFullYear() * 100 + d.getUTCMonth() + 1; }
export function meseSuccessivo(m: number): number { return m % 100 === 12 ? (Math.floor(m / 100) + 1) * 100 + 1 : m + 1; }
const MESI = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];
export function etichettaMese(m: number): string { return `${MESI[(m % 100) - 1]} ${String(Math.floor(m / 100)).slice(2)}`; }
export function giornoIt(g: number): string {
  const d = new Date(g * 864e5);
  return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`;
}
export function giornoIso(g: number): string { return new Date(g * 864e5).toISOString().slice(0, 10); }

/** Legge le righe di un foglio (Excel o CSV) esportato da Jasper. */
export function leggiExportJasper(righe: ValoreCella[][]): ExportJasper {
  let h = -1;
  for (let i = 0; i < Math.min(righe.length, 80); i++) {
    if ((righe[i] ?? []).some((c) => norm(c) === 'codice prenotazione')) { h = i; break; }
  }
  if (h < 0) throw new ErroreJasper('Non trovo la colonna "Codice Prenotazione": controlla che sia l\'export "Prenotazioni premi" di Jasper.');
  const H = righe[h].map(norm);
  const trova = (...nomi: string[]) => {
    for (const n of nomi) { const i = H.findIndex((x) => x === n || x.startsWith(n)); if (i >= 0) return i; }
    return -1;
  };
  const C = {
    apertura: trova('data apertura'), riordino: trova('codice riordino'), pdv: trova('pdv', 'punto vendita'),
    articolo: trova('articolo', 'descrizione'), codice: trova('codice prenotazione'), tessera: trova('tessera'),
    tipo: trova('tipo'), stato: trova('stato'), etic: trova('etic'), chiusura: trova('chiusura'),
    contributo: trova('contributo'), qta: trova('qta', 'q.tà', 'quantit'),
  };
  // Le intestazioni unite di Excel possono spostare il valore nella colonna vuota accanto.
  const cella = (r: ValoreCella[], c: number): ValoreCella => {
    if (c < 0) return null;
    const v = r[c];
    if ((v === null || v === undefined || v === '') && H[c + 1] === '' && r[c + 1] !== null && r[c + 1] !== undefined && r[c + 1] !== '') return r[c + 1];
    return v ?? null;
  };

  let totali: ExportJasper['totali'] = null;
  for (let i = 0; i < h; i++) {
    const r = righe[i] ?? [];
    if (!r.some((c) => norm(c) === 'totali')) continue;
    const numeri = r.filter((c) => typeof c === 'number' || (typeof c === 'string' && /^[\d.,]+$/.test(c.trim()))).map(numeroIt);
    if (numeri.length >= 2) totali = { contributo: numeri[numeri.length - 2], qta: numeri[numeri.length - 1] };
  }

  const out: RigaJasper[] = [];
  const visti = new Set<string>();
  let doppioni = 0;
  let dataReport: number | null = null;
  for (let i = h + 1; i < righe.length; i++) {
    const r = righe[i];
    if (!r || !r.length) continue;
    if (dataReport === null) {
      const k = r.findIndex((c) => norm(c).startsWith('report eseguito'));
      if (k >= 0) for (let j = k + 1; j < r.length; j++) { const g = giornoDa(r[j]); if (g !== null) { dataReport = g; break; } }
    }
    const cod = cella(r, C.codice);
    if (cod === null) continue;
    const codice = typeof cod === 'number' ? String(Math.round(cod)) : String(cod).trim();
    if (!/^\d{8,}$/.test(codice)) continue;
    if (visti.has(codice)) doppioni++; else visti.add(codice);

    const articolo = String(cella(r, C.articolo) ?? '').trim();
    const premio = articolo.replace(/\s+C\/A?\s*$/i, '').trim();
    const apertura = giornoDa(cella(r, C.apertura));
    let pdv = String(cella(r, C.pdv) ?? '').trim();
    if (/^\d+$/.test(pdv)) pdv = pdv.padStart(3, '0');
    const t = cella(r, C.tessera);
    const tessera = t === null ? '' : typeof t === 'number' ? String(Math.round(t)).padStart(13, '0') : String(t).trim();
    const rio = cella(r, C.riordino);
    const riordino = rio === null ? '' : typeof rio === 'number' ? String(rio).padStart(7, '0') : String(rio).trim();
    const tipoGrezzo = String(cella(r, C.tipo) ?? '').trim();
    const tipo = /online/i.test(tipoGrezzo) ? 'Online' : /prenot/i.test(tipoGrezzo) ? 'Prenotazione' : (tipoGrezzo || '—');
    const st = norm(cella(r, C.stato)), et = norm(cella(r, C.etic));
    const etichettata = et.startsWith('s') || et === '1' || et === 'true';
    const stato: StatoJasper = st.includes('storn') ? 'stornata' : st.includes('chius') ? 'chiusa'
      : st.includes('apert') ? (etichettata ? 'etic' : 'daetic') : 'altro';
    const contributo = numeroIt(cella(r, C.contributo));
    out.push({
      codice, apertura, chiusura: giornoDa(cella(r, C.chiusura)), mese: apertura !== null ? meseDi(apertura) : 0,
      pdv, articolo, premio, chiave: riordino || premio, tessera, tipo, stato, contributo,
      qta: C.qta >= 0 ? numeroIt(cella(r, C.qta)) : 1,
      donazione: /^donazion/i.test(articolo), conContributo: contributo > 0 || premio !== articolo,
    });
  }
  return { righe: out, totali, dataReport, doppioni };
}

/** Controllo con la riga "Totali" del report: null se il report non la riporta. */
export function verificaTotali(e: ExportJasper): { ok: boolean; qta: number; contributo: number } | null {
  const qta = e.righe.reduce((s, r) => s + r.qta, 0);
  const contributo = e.righe.reduce((s, r) => s + r.contributo, 0);
  if (!e.totali) return null;
  return { ok: Math.abs(e.totali.qta - qta) < 0.5 && Math.abs(e.totali.contributo - contributo) < 0.5, qta, contributo };
}

/** Nome del premio per chiave: la versione senza contributo, se c'è. */
export function nomiPremi(righe: RigaJasper[]): Map<string, string> {
  const m = new Map<string, { nome: string; ca: boolean }>();
  for (const r of righe) {
    const x = m.get(r.chiave);
    if (!x || (x.ca && !r.conContributo)) m.set(r.chiave, { nome: r.premio, ca: r.conContributo });
  }
  return new Map([...m].map(([k, v]) => [k, v.nome]));
}

export interface FiltriJasper {
  da: number; a: number; pdv: string; tipo: string; testo: string; stati: Set<StatoJasper>;
}

export function filtraJasper(righe: RigaJasper[], f: FiltriJasper): RigaJasper[] {
  const q = f.testo.trim().toLowerCase();
  return righe.filter((r) => r.mese >= f.da && r.mese <= f.a && (!f.pdv || r.pdv === f.pdv) && (!f.tipo || r.tipo === f.tipo)
    && f.stati.has(r.stato) && (!q || r.premio.toLowerCase().includes(q)));
}

export interface StatPdvJasper { pdv: string; qta: number; contributo: number; online: number; tessere: number; giorni: number; chiuse: number }
export interface StatPremioJasper { chiave: string; qta: number; contributo: number; conContributo: number; pdv: number }
export type MeseJasper = Record<StatoJasper, number> & { mese: number; totale: number };

export interface AnalisiJasper {
  qta: number; contributo: number; online: number; chiuse: number; daEtichettare: number;
  giorniChiusura: number; nChiuse: number;
  pdv: StatPdvJasper[]; premi: StatPremioJasper[]; mesi: MeseJasper[];
  donazioni: { nome: string; qta: number }[];
  tessere: { tessera: string; qta: number; pdv: string[] }[];
}

/** Statistiche sulle righe filtrate. Le donazioni sono tenute a parte. */
export function analizzaJasper(righe: RigaJasper[]): AnalisiJasper {
  let qta = 0, contributo = 0, online = 0, chiuse = 0, daEtichettare = 0, giorniChiusura = 0, nChiuse = 0;
  const pdv = new Map<string, StatPdvJasper & { _t: Set<string> }>();
  const premi = new Map<string, StatPremioJasper & { _p: Set<string> }>();
  const mesi = new Map<number, MeseJasper>();
  const don = new Map<string, number>();
  const tess = new Map<string, { qta: number; pdv: Set<string> }>();
  for (const r of righe) {
    if (r.donazione) { don.set(r.premio, (don.get(r.premio) ?? 0) + r.qta); continue; }
    qta += r.qta; contributo += r.contributo;
    if (r.tipo === 'Online') online += r.qta;
    if (r.stato === 'chiusa') chiuse += r.qta;
    if (r.stato === 'daetic') daEtichettare += r.qta;
    const durata = r.stato === 'chiusa' && r.chiusura !== null && r.apertura !== null && r.chiusura >= r.apertura ? r.chiusura - r.apertura : null;
    if (durata !== null) { giorniChiusura += durata; nChiuse++; }

    let p = pdv.get(r.pdv);
    if (!p) { p = { pdv: r.pdv, qta: 0, contributo: 0, online: 0, tessere: 0, giorni: 0, chiuse: 0, _t: new Set() }; pdv.set(r.pdv, p); }
    p.qta += r.qta; p.contributo += r.contributo;
    if (r.tipo === 'Online') p.online += r.qta;
    if (r.tessera) p._t.add(r.tessera);
    if (durata !== null) { p.giorni += durata; p.chiuse++; }

    let q = premi.get(r.chiave);
    if (!q) { q = { chiave: r.chiave, qta: 0, contributo: 0, conContributo: 0, pdv: 0, _p: new Set() }; premi.set(r.chiave, q); }
    q.qta += r.qta; q.contributo += r.contributo;
    if (r.conContributo) q.conContributo += r.qta;
    q._p.add(r.pdv);

    let m = mesi.get(r.mese);
    if (!m) { m = { mese: r.mese, totale: 0, daetic: 0, etic: 0, chiusa: 0, stornata: 0, altro: 0 }; mesi.set(r.mese, m); }
    m[r.stato] += r.qta; m.totale += r.qta;

    if (r.tessera) {
      let t = tess.get(r.tessera);
      if (!t) { t = { qta: 0, pdv: new Set() }; tess.set(r.tessera, t); }
      t.qta += r.qta; t.pdv.add(r.pdv);
    }
  }
  return {
    qta, contributo, online, chiuse, daEtichettare, giorniChiusura, nChiuse,
    pdv: [...pdv.values()].map(({ _t, ...p }) => ({ ...p, tessere: _t.size })),
    premi: [...premi.values()].map(({ _p, ...p }) => ({ ...p, pdv: _p.size })),
    mesi: [...mesi.values()].sort((a, b) => a.mese - b.mese),
    donazioni: [...don].map(([nome, q]) => ({ nome, qta: q })).sort((a, b) => b.qta - a.qta),
    tessere: [...tess].map(([tessera, t]) => ({ tessera, qta: t.qta, pdv: [...t.pdv] })).sort((a, b) => b.qta - a.qta).slice(0, 10),
  };
}

/** Prenotazioni ancora aperte da almeno "giorni" giorni alla data di riferimento, per punto vendita. */
export function aperteDaTroppo(righe: RigaJasper[], riferimento: number, giorni: number) {
  const m = new Map<string, { pdv: string; qta: number; daEtichettare: number; piuVecchia: number }>();
  let totale = 0;
  for (const r of righe) {
    if (r.donazione || (r.stato !== 'daetic' && r.stato !== 'etic') || r.apertura === null) continue;
    const eta = riferimento - r.apertura;
    if (eta < giorni) continue;
    totale += r.qta;
    let x = m.get(r.pdv);
    if (!x) { x = { pdv: r.pdv, qta: 0, daEtichettare: 0, piuVecchia: 0 }; m.set(r.pdv, x); }
    x.qta += r.qta; if (r.stato === 'daetic') x.daEtichettare += r.qta; x.piuVecchia = Math.max(x.piuVecchia, eta);
  }
  return { totale, pdv: [...m.values()].sort((a, b) => b.qta - a.qta) };
}

/** Tabella mese × negozio (o premio), in pezzi. */
export function tabellaMesi(righe: RigaJasper[], per: 'pdv' | 'premio') {
  const m = new Map<string, { chiave: string; mesi: Map<number, number>; totale: number }>();
  for (const r of righe) {
    if (r.donazione) continue;
    const k = per === 'pdv' ? r.pdv : r.chiave;
    let x = m.get(k);
    if (!x) { x = { chiave: k, mesi: new Map(), totale: 0 }; m.set(k, x); }
    x.mesi.set(r.mese, (x.mesi.get(r.mese) ?? 0) + r.qta);
    x.totale += r.qta;
  }
  return [...m.values()].sort((a, b) => b.totale - a.totale);
}

/** Elenco dei mesi da "da" ad "a", senza buchi. */
export function mesiTra(da: number, a: number): number[] {
  const out: number[] = [];
  if (!da || !a) return out;
  for (let m = da; m <= a && out.length < 240; m = meseSuccessivo(m)) out.push(m);
  return out;
}

/** Riepilogo compatto salvato nel database a ogni caricamento (nessun dato dei clienti). */
export interface RiepilogoDati {
  premi: [string, string, number][];   // chiave, nome, pezzi
  pdv: [string, number][];             // pdv, pezzi
  stati: Partial<Record<StatoJasper, number>>;
}

export function creaRiepilogo(e: ExportJasper): { righe: number; pezzi: number; contributo: number; dati: RiepilogoDati } {
  const valide = e.righe.filter((r) => r.stato !== 'stornata');
  const a = analizzaJasper(valide);
  const nomi = nomiPremi(e.righe);
  const stati: Partial<Record<StatoJasper, number>> = {};
  for (const r of e.righe) if (!r.donazione) stati[r.stato] = (stati[r.stato] ?? 0) + r.qta;
  return {
    righe: e.righe.length, pezzi: a.qta, contributo: Math.round(a.contributo * 100) / 100,
    dati: {
      premi: a.premi.sort((x, y) => y.qta - x.qta).slice(0, 300).map((p) => [p.chiave, nomi.get(p.chiave) ?? p.chiave, p.qta]),
      pdv: a.pdv.sort((x, y) => y.qta - x.qta).map((p) => [p.pdv, p.qta]),
      stati,
    },
  };
}

/** Codice punto vendita per il confronto con l'archivio: senza zeri iniziali. */
export function chiavePdv(codice: string): string {
  const s = String(codice || '').trim();
  return /^\d+$/.test(s) ? String(Number(s)) : s.toUpperCase();
}
