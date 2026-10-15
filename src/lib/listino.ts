/**
 * Listino premi: lettura dei fogli Excel del concorso, raggruppamento delle varianti dello stesso
 * premio (punteggio pieno / punti ridotti + contributo), controlli di qualità, confronto con
 * l'archivio e ricerca rapida.
 *
 * Regole di abbinamento (in ordine di affidabilità):
 *  1. la riga con contributo ha nella colonna «COD. PRECONFEZ.» il codice della versione senza
 *     contributo → abbinamento certo;
 *  2. lo stesso codice ricavato dall'EAN a 8 cifre (2 + 6 cifre del codice + controllo) → abbinamento
 *     certo, ma con avviso se il codice scritto nel file non coincide;
 *  3. solo il nome uguale senza «C/A» → abbinamento segnalato come da verificare.
 * I codici restano testo (zeri iniziali preservati), punti e contributi restano numeri separati.
 */
import type { FoglioExcel, ValoreCella } from './xlsx.ts';

export type Modalita = 'pieno' | 'contributo';

export interface RigaSorgente {
  foglio: string; riga: number; stagione: string;
  codice: string; codicePreconf: string; ean: string; descrizione: string;
  punti: number | null; contributo: number | null;
  /** Il codice era scritto come numero nel file (zeri iniziali persi e ricostruiti). */
  codiceRicostruito?: string;
  /** Solo per il file riorganizzato: premio e modalità già decisi (non si ricalcolano). */
  chiaveGruppo?: string; nomeGruppo?: string; modalita?: Modalita;
}

export interface Variante {
  codice: string; ean: string; codicePreconf: string; descrizione: string;
  punti: number | null; contributo: number; modalita: Modalita; foglio: string; riga: number;
}

export interface Verifica { livello: 'avviso' | 'info'; testo: string }

export interface Gruppo {
  /** Chiave stabile tra un'importazione e l'altra: stagione + codice della versione principale. */
  chiave: string;
  /** Identificativo assegnato dall'archivio (vuoto finché non è importato). */
  id?: string;
  stagione: string; nome: string; varianti: Variante[]; verifiche: Verifica[];
}

export interface FoglioRiconosciuto {
  nome: string; stagione: string; righe: RigaSorgente[];
  /** Messaggio se il foglio non sembra un elenco premi. */
  scarto?: string;
  formato: 'concorso' | 'riorganizzato';
  /** Colonne riconosciute: campo del programma → intestazione trovata nel file. */
  colonne?: { campo: string; intestazione: string }[];
}

const NOMI_CAMPI: Record<string, string> = {
  codice: 'Codice', preconf: 'Codice principale (preconf.)', ean: 'EAN', descrizione: 'Descrizione', punti: 'Punti', contributo: 'Contributo',
  stagione: 'Stagione', modalita: 'Modalità', principale: 'Codice principale', id: 'ID premio', premio: 'Premio',
};
function colonneTrovate(intestazioni: ValoreCella[], col: Record<string, number>) {
  return Object.entries(col).filter(([, i]) => i >= 0).map(([k, i]) => ({ campo: NOMI_CAMPI[k] ?? k, intestazione: String(intestazioni[i] ?? '').replace(/\s+/g, ' ').trim() }));
}

/* ------------------------------------------------------------------ utilità */

export function normalizzaTesto(s: string): string {
  return (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[’'`´]/g, '').replace(/[^a-z0-9/]+/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Nome leggibile: spazi compattati, maiuscolo come nel file. */
export function pulisciNome(s: string): string { return (s || '').replace(/\s+/g, ' ').trim(); }

const RE_CA = /\s*\bC\s*\/\s*A\.?\s*$/i;
/** Toglie il suffisso «C/A» (con acconto/contributo) dal nome di una variante. */
export function senzaCA(s: string): string { return pulisciNome((s || '').replace(RE_CA, '')); }

export function codiceDaValore(v: ValoreCella): { codice: string; ricostruito?: string } {
  if (v === null || v === undefined || v === '') return { codice: '' };
  if (typeof v === 'number') {
    const s = String(Math.round(v));
    return { codice: s.padStart(7, '0'), ricostruito: s.length < 7 ? s : undefined };
  }
  const s = String(v).replace(/\s+/g, '').replace(/^'/, '');
  if (/^\d+$/.test(s) && s.length < 7) return { codice: s.padStart(7, '0'), ricostruito: s };
  return { codice: s };
}

export function eanDaValore(v: ValoreCella): string {
  if (v === null || v === undefined || v === '') return '';
  if (typeof v === 'number') return String(Math.round(v));
  return String(v).replace(/\s+/g, '');
}

/** EAN interno a 8 cifre «2 + 6 cifre + controllo» → codice Alì a 7 cifre. */
export function codiceDaEan(ean: string): string {
  return /^2\d{7}$/.test(ean) ? '0' + ean.slice(1, 7) : '';
}

/** Numero da cella: accetta numeri, «1.234», «49,00 €», «-» (= nessun valore). */
export function numeroDaValore(v: ValoreCella): number | null {
  if (v === null || v === undefined || v === '' || typeof v === 'boolean') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  let s = String(v).replace(/[€\s]/g, '').replace(/^-+$/, '');
  if (!s) return null;
  if (/,\d{1,2}$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

const arrot2 = (n: number) => Math.round(n * 100) / 100;

/** «2027-2026» o «CONCORSO 2026-2027» → «2026/2027». */
export function stagioneDa(...testi: (string | null | undefined)[]): string {
  for (const t of testi) {
    const anni = [...String(t ?? '').matchAll(/(20\d{2})/g)].map((m) => Number(m[1]));
    const unici = [...new Set(anni)].sort();
    if (unici.length >= 2) return `${unici[0]}/${unici[1]}`;
  }
  return '';
}

/* ------------------------------------------------------------------ riconoscimento dei fogli */

const COLONNE = {
  codice: /^cod(ice)?\s*ali/,
  preconf: /preconf/,
  ean: /ean/,
  descrizione: /descriz/,
  punti: /^punti/,
  contributo: /contrib/,
};

function cercaIntestazione(righe: ValoreCella[][]): { riga: number; col: Record<keyof typeof COLONNE, number> } | null {
  for (let r = 0; r < Math.min(righe.length, 15); r++) {
    const celle = (righe[r] ?? []).map((v) => normalizzaTesto(String(v ?? '')));
    const col = {} as Record<keyof typeof COLONNE, number>;
    for (const [k, re] of Object.entries(COLONNE) as [keyof typeof COLONNE, RegExp][]) col[k] = celle.findIndex((c) => re.test(c));
    if (col.codice >= 0 && col.descrizione >= 0 && col.punti >= 0) return { riga: r, col };
  }
  return null;
}

/** Il formato del file riorganizzato prodotto da questo programma (foglio «Varianti»). */
function cercaFormatoRiorganizzato(f: FoglioExcel): FoglioRiconosciuto | null {
  for (let r = 0; r < Math.min(f.righe.length, 10); r++) {
    const celle = (f.righe[r] ?? []).map((v) => normalizzaTesto(String(v ?? '')));
    const i = (re: RegExp) => celle.findIndex((c) => re.test(c));
    const c = { stagione: i(/^stagione$/), codice: i(/^codice$/), preconf: i(/preconf/), ean: i(/^ean/), descrizione: i(/^descrizione originale/),
      punti: i(/^punti$/), contributo: i(/^contributo/), modalita: i(/^modalita/), principale: i(/^codice principale/), id: i(/^id premio$/), premio: i(/^premio$/) };
    if (c.stagione < 0 || c.codice < 0 || c.punti < 0 || c.modalita < 0) continue;
    const righe: RigaSorgente[] = [];
    for (let k = r + 1; k < f.righe.length; k++) {
      const x = f.righe[k] ?? [];
      const { codice, ricostruito } = codiceDaValore(x[c.codice] ?? null);
      if (!codice) continue;
      const modalita = normalizzaTesto(String(x[c.modalita] ?? ''));
      const principale = c.principale >= 0 ? codiceDaValore(x[c.principale] ?? null).codice : '';
      righe.push({
        foglio: f.nome, riga: k + 1, stagione: String(x[c.stagione] ?? '').trim(),
        codice, codiceRicostruito: ricostruito,
        chiaveGruppo: c.id >= 0 ? String(x[c.id] ?? '').trim() || undefined : undefined,
        nomeGruppo: c.premio >= 0 ? pulisciNome(String(x[c.premio] ?? '')) || undefined : undefined,
        modalita: modalita.startsWith('punti ridotti') || modalita.includes('contributo') ? 'contributo' : 'pieno',
        codicePreconf: modalita.startsWith('punti ridotti') || modalita.includes('contributo') ? (principale || codiceDaValore(x[c.preconf] ?? null).codice) : '',
        ean: eanDaValore(x[c.ean] ?? null), descrizione: pulisciNome(String(x[c.descrizione] ?? '')),
        punti: numeroDaValore(x[c.punti] ?? null), contributo: numeroDaValore(x[c.contributo] ?? null),
      });
    }
    const stagioni = [...new Set(righe.map((x) => x.stagione))];
    return { nome: f.nome, stagione: stagioni.length === 1 ? stagioni[0] : stagioni.join(', '), righe, formato: 'riorganizzato', colonne: colonneTrovate(f.righe[r] ?? [], c) };
  }
  return null;
}

/** Riconosce i fogli di un file: quelli del concorso (una stagione per foglio) o il foglio «Varianti» del file riorganizzato. */
export function riconosciFogli(fogli: FoglioExcel[]): FoglioRiconosciuto[] {
  const riorganizzato = fogli.map(cercaFormatoRiorganizzato).find(Boolean);
  if (riorganizzato) return [riorganizzato];
  return fogli.map((f) => {
    const titolo = (f.righe[0] ?? []).map((v) => String(v ?? '')).join(' ');
    const stagione = stagioneDa(f.nome, titolo);
    const h = cercaIntestazione(f.righe);
    if (!h) return { nome: f.nome, stagione, righe: [], formato: 'concorso' as const, scarto: 'Intestazioni non trovate (servono almeno codice, descrizione e punti).' };
    const righe: RigaSorgente[] = [];
    const cella = (r: number, c: number): ValoreCella => (c >= 0 ? (f.righe[r] ?? [])[c] ?? null : null);
    for (let r = h.riga + 1; r < f.righe.length; r++) {
      const { codice, ricostruito } = codiceDaValore(cella(r, h.col.codice));
      const descrizione = pulisciNome(String(cella(r, h.col.descrizione) ?? ''));
      if (!codice && !descrizione) continue;
      let pre = cella(r, h.col.preconf);
      // Formula non calcolata (es. «=A345»): si legge la cella indicata.
      const formula = typeof pre === 'string' ? /^=\$?([A-Z]+)\$?(\d+)$/i.exec(pre.trim()) : null;
      if (formula) {
        let col = 0; for (const ch of formula[1].toUpperCase()) col = col * 26 + ch.charCodeAt(0) - 64;
        pre = cella(Number(formula[2]) - 1, col - 1);
      }
      righe.push({
        foglio: f.nome, riga: r + 1, stagione, codice, codiceRicostruito: ricostruito,
        codicePreconf: codiceDaValore(pre).codice, ean: eanDaValore(cella(r, h.col.ean)), descrizione,
        punti: numeroDaValore(cella(r, h.col.punti)), contributo: numeroDaValore(cella(r, h.col.contributo)),
      });
    }
    return { nome: f.nome, stagione, righe, formato: 'concorso' as const, scarto: righe.length ? undefined : 'Nessuna riga di premi trovata.',
      colonne: colonneTrovate(f.righe[h.riga] ?? [], h.col) };
  });
}

/* ------------------------------------------------------------------ raggruppamento */

export interface EsitoRaggruppamento {
  gruppi: Gruppo[];
  /** Controlli complessivi per il riepilogo. */
  conteggi: { righe: number; gruppi: number; varianti: number; conContributo: number; daVerificare: number; codiciUnici: number };
}

function variante(r: RigaSorgente, modalita: Modalita): Variante {
  return {
    codice: r.codice, ean: r.ean, codicePreconf: r.codicePreconf, descrizione: r.descrizione,
    punti: r.punti, contributo: modalita === 'contributo' ? arrot2(r.contributo ?? 0) : 0, modalita, foglio: r.foglio, riga: r.riga,
  };
}

/** File riorganizzato: i premi sono già decisi (colonna «ID premio»), si ricostruiscono così come sono. */
function gruppiDaChiavi(righe: RigaSorgente[], stagione: string): Gruppo[] {
  const mappa = new Map<string, Gruppo>();
  const conteggioCodici = new Map<string, number>();
  for (const r of righe) conteggioCodici.set(r.codice, (conteggioCodici.get(r.codice) ?? 0) + 1);
  for (const r of righe) {
    const k = r.chiaveGruppo!;
    let g = mappa.get(k);
    if (!g) { g = { chiave: k, stagione, nome: r.nomeGruppo || senzaCA(r.descrizione) || r.codice, varianti: [], verifiche: [] }; mappa.set(k, g); }
    const etichetta = `${r.foglio} riga ${r.riga}`;
    if (r.punti === null) g.verifiche.push({ livello: 'avviso', testo: `${etichetta}: punti mancanti.` });
    const daEan = codiceDaEan(r.ean);
    if (daEan && daEan !== r.codice) g.verifiche.push({ livello: 'avviso', testo: `${etichetta}: il codice ${r.codice} non corrisponde all'EAN ${r.ean} (che indica ${daEan}).` });
    if ((conteggioCodici.get(r.codice) ?? 0) > 1) g.verifiche.push({ livello: 'avviso', testo: `${etichetta}: il codice ${r.codice} compare più volte nella stagione ${stagione}.` });
    if (r.modalita === 'contributo' && !(r.contributo && r.contributo > 0)) g.verifiche.push({ livello: 'avviso', testo: `${etichetta}: ${r.codice} è una versione con contributo senza importo in euro.` });
    g.varianti.push(variante(r, r.modalita ?? 'pieno'));
  }
  const gruppi = [...mappa.values()];
  for (const g of gruppi) g.varianti.sort((a, b) => (a.modalita === b.modalita ? a.contributo - b.contributo : a.modalita === 'pieno' ? -1 : 1));
  return gruppi;
}

/** Raggruppa le righe di UNA stagione. */
function raggruppaStagione(righe: RigaSorgente[], stagione: string): Gruppo[] {
  if (righe.length && righe.every((r) => r.chiaveGruppo)) return gruppiDaChiavi(righe, stagione);
  const conteggioCodici = new Map<string, number>();
  for (const r of righe) if (r.codice) conteggioCodici.set(r.codice, (conteggioCodici.get(r.codice) ?? 0) + 1);

  const eVariante = (r: RigaSorgente) => Boolean(r.codicePreconf) || (r.contributo ?? 0) > 0;
  const basi = righe.filter((r) => !eVariante(r));
  const gruppi: Gruppo[] = [];
  const perCodice = new Map<string, Gruppo>();
  const perCodiceEan = new Map<string, Gruppo>();
  const perNome = new Map<string, Gruppo[]>();
  const chiaviUsate = new Set<string>();

  const controlliRiga = (r: RigaSorgente, v: Verifica[]) => {
    const etichetta = `${r.foglio} riga ${r.riga}`;
    if (!r.codice) v.push({ livello: 'avviso', testo: `${etichetta}: codice mancante.` });
    if (r.punti === null) v.push({ livello: 'avviso', testo: `${etichetta}: punti mancanti.` });
    if (r.codiceRicostruito) v.push({ livello: 'info', testo: `${etichetta}: il codice era scritto come numero (${r.codiceRicostruito}); ricostruito con gli zeri iniziali in ${r.codice}${codiceDaEan(r.ean) === r.codice ? ', confermato dall\'EAN' : ''}.` });
    const daEan = codiceDaEan(r.ean);
    if (r.codice && daEan && daEan !== r.codice) v.push({ livello: 'avviso', testo: `${etichetta}: il codice ${r.codice} non corrisponde all'EAN ${r.ean} (che indica ${daEan}).` });
    if ((conteggioCodici.get(r.codice) ?? 0) > 1) v.push({ livello: 'avviso', testo: `${etichetta}: il codice ${r.codice} compare più volte nella stagione ${stagione}.` });
  };

  for (const r of basi) {
    const verifiche: Verifica[] = [];
    controlliRiga(r, verifiche);
    // Chiave stabile: il codice; se è duplicato vale quello confermato dall'EAN, poi il numero di riga.
    const daEanBase = codiceDaEan(r.ean);
    const candidati = [
      ...(r.codice && ((conteggioCodici.get(r.codice) ?? 0) <= 1 || daEanBase === r.codice) ? [r.codice] : []),
      ...(daEanBase ? [daEanBase] : []),
      `${r.codice || 'riga'}-${r.riga}`,
    ].map((c) => `${stagione}#${c}`);
    const chiave = candidati.find((c) => !chiaviUsate.has(c)) ?? `${stagione}#riga-${r.foglio}-${r.riga}`;
    chiaviUsate.add(chiave);
    const g: Gruppo = { chiave, stagione, nome: senzaCA(r.descrizione) || r.descrizione || r.codice, varianti: [variante(r, 'pieno')], verifiche };
    gruppi.push(g);
    if (r.codice && !perCodice.has(r.codice)) perCodice.set(r.codice, g);
    const daEan = codiceDaEan(r.ean);
    if (daEan && !perCodiceEan.has(daEan)) perCodiceEan.set(daEan, g);
    const n = normalizzaTesto(g.nome);
    perNome.set(n, [...(perNome.get(n) ?? []), g]);
  }

  for (const r of righe.filter(eVariante)) {
    const verifiche: Verifica[] = [];
    controlliRiga(r, verifiche);
    const etichetta = `${r.foglio} riga ${r.riga}`;
    let g: Gruppo | undefined;
    if (r.codicePreconf) {
      const diretto = perCodice.get(r.codicePreconf);
      const viaEan = perCodiceEan.get(r.codicePreconf);
      // Se il codice principale è duplicato nel file, conta l'EAN (che identifica la riga giusta).
      if (diretto && (conteggioCodici.get(r.codicePreconf) ?? 0) <= 1) g = diretto;
      else if (viaEan) {
        g = viaEan;
        const base = g.varianti[0];
        if (base.codice !== r.codicePreconf) {
          g.verifiche.push({ livello: 'avviso', testo: `${etichetta}: la versione con contributo ${r.codice} indica come principale ${r.codicePreconf}, che nel file è scritto ${base.codice} (riga ${base.riga}); abbinata grazie all'EAN ${base.ean}. Verificare il codice corretto della versione senza contributo.` });
        }
      } else if (diretto) g = diretto;
      if (!g) verifiche.push({ livello: 'avviso', testo: `${etichetta}: «${r.descrizione}» rimanda al codice ${r.codicePreconf}, che non esiste nella stagione ${stagione}.` });
    }
    if (!g) {
      const candidati = perNome.get(normalizzaTesto(senzaCA(r.descrizione))) ?? [];
      if (candidati.length === 1) {
        g = candidati[0];
        g.verifiche.push({ livello: 'avviso', testo: `${etichetta}: ${r.codice} abbinato a «${g.nome}» solo per nome (manca il codice principale): verificare.` });
      }
    }
    if (!g) {
      // Variante orfana: resta un premio a sé, da verificare.
      g = { chiave: `${stagione}#${r.codice || 'riga-' + r.riga}`, stagione, nome: senzaCA(r.descrizione) || r.codice, varianti: [], verifiche: [] };
      if (chiaviUsate.has(g.chiave)) g.chiave += `-${r.riga}`;
      chiaviUsate.add(g.chiave);
      verifiche.push({ livello: 'avviso', testo: `${etichetta}: versione con contributo senza premio principale abbinabile.` });
      gruppi.push(g);
    }
    if (!r.contributo || r.contributo <= 0) verifiche.push({ livello: 'avviso', testo: `${etichetta}: ${r.codice} ha un codice principale ma nessun contributo in euro.` });
    const base = g.varianti.find((x) => x.modalita === 'pieno');
    if (base) {
      if (normalizzaTesto(senzaCA(r.descrizione)) !== normalizzaTesto(g.nome)) {
        verifiche.push({ livello: 'avviso', testo: `${etichetta}: descrizione «${r.descrizione}» diversa dal premio principale «${g.nome}».` });
      }
      if (r.punti !== null && base.punti !== null && r.punti >= base.punti) {
        verifiche.push({ livello: 'avviso', testo: `${etichetta}: la versione con contributo (${r.punti} punti) non costa meno punti di quella piena (${base.punti}).` });
      }
    }
    g.varianti.push(variante(r, 'contributo'));
    g.verifiche.push(...verifiche);
  }

  for (const g of gruppi) {
    g.varianti.sort((a, b) => (a.modalita === b.modalita ? a.contributo - b.contributo || (b.punti ?? 0) - (a.punti ?? 0) : a.modalita === 'pieno' ? -1 : 1));
    const visti = new Set<string>();
    g.verifiche = g.verifiche.filter((v) => (visti.has(v.testo) ? false : (visti.add(v.testo), true)));
  }
  return gruppi;
}

/** Raggruppa le righe di uno o più fogli (ogni stagione separatamente). */
export function raggruppa(righe: RigaSorgente[]): EsitoRaggruppamento {
  const perStagione = new Map<string, RigaSorgente[]>();
  for (const r of righe) perStagione.set(r.stagione, [...(perStagione.get(r.stagione) ?? []), r]);
  const gruppi = [...perStagione].flatMap(([s, rr]) => raggruppaStagione(rr, s));
  const varianti = gruppi.flatMap((g) => g.varianti);
  return {
    gruppi,
    conteggi: {
      righe: righe.length, gruppi: gruppi.length, varianti: varianti.length,
      conContributo: varianti.filter((v) => v.modalita === 'contributo').length,
      daVerificare: gruppi.filter((g) => g.verifiche.some((v) => v.livello === 'avviso')).length,
      codiciUnici: new Set(righe.map((r) => `${r.stagione}#${r.codice}`)).size,
    },
  };
}

export const daVerificare = (g: Gruppo) => g.verifiche.some((v) => v.livello === 'avviso');

/* ------------------------------------------------------------------ confronto con l'archivio */

export type EsitoVariante = 'nuova' | 'modificata' | 'invariata';
export interface Modifica { campo: 'punti' | 'contributo' | 'descrizione' | 'ean' | 'premio' | 'modalita'; prima: string; dopo: string }
export interface ConfrontoGruppo {
  gruppo: Gruppo; esito: 'nuovo' | 'aggiornato' | 'invariato';
  varianti: { variante: Variante; esito: EsitoVariante; modifiche: Modifica[] }[];
  nomePrima?: string;
}
export interface Confronto {
  gruppi: ConfrontoGruppo[];
  /** Codici già presenti nell'archivio sotto un altro premio. */
  conflitti: { codice: string; stagione: string; nuovo: string; esistente: string }[];
  /** Varianti in archivio (stesse stagioni) assenti nel file: non vengono cancellate. */
  assenti: { stagione: string; codice: string; nome: string }[];
  totali: { nuovi: number; aggiornati: number; invariati: number; daVerificare: number; variantiNuove: number; variantiModificate: number };
}

const chiaveVariante = (stagione: string, v: Pick<Variante, 'codice' | 'ean'>) => `${stagione}#${v.codice}#${v.ean}`;
const fmt = (n: number | null) => (n === null ? '' : String(n));

/** Confronta i gruppi letti dal file con quelli già in archivio (solo per le stagioni del file). */
export function confronta(archivio: Gruppo[], nuovi: Gruppo[]): Confronto {
  const stagioni = new Set(nuovi.map((g) => g.stagione));
  const esistenti = archivio.filter((g) => stagioni.has(g.stagione));
  const gruppoPerChiave = new Map(esistenti.map((g) => [g.chiave, g]));
  const variantePrima = new Map<string, { v: Variante; g: Gruppo }>();
  const gruppiPerCodice = new Map<string, Gruppo[]>();
  for (const g of esistenti) for (const v of g.varianti) {
    variantePrima.set(chiaveVariante(g.stagione, v), { v, g });
    const k = `${g.stagione}#${v.codice}`;
    gruppiPerCodice.set(k, [...(gruppiPerCodice.get(k) ?? []), g]);
  }

  const viste = new Set<string>();
  const conflitti: Confronto['conflitti'] = [];
  const out: ConfrontoGruppo[] = nuovi.map((g) => {
    const prima = gruppoPerChiave.get(g.chiave);
    const varianti = g.varianti.map((v) => {
      const k = chiaveVariante(g.stagione, v);
      viste.add(k);
      const p = variantePrima.get(k);
      const conCodice = gruppiPerCodice.get(`${g.stagione}#${v.codice}`) ?? [];
      const altro = conCodice.find((x) => x.chiave !== g.chiave);
      if (altro && !conCodice.some((x) => x.chiave === g.chiave) && !conflitti.some((c) => c.codice === v.codice && c.stagione === g.stagione)) {
        conflitti.push({ codice: v.codice, stagione: g.stagione, nuovo: g.nome, esistente: altro.nome });
      }
      if (!p) return { variante: v, esito: 'nuova' as const, modifiche: [] };
      const modifiche: Modifica[] = [];
      if (fmt(p.v.punti) !== fmt(v.punti)) modifiche.push({ campo: 'punti', prima: fmt(p.v.punti), dopo: fmt(v.punti) });
      if (arrot2(p.v.contributo) !== arrot2(v.contributo)) modifiche.push({ campo: 'contributo', prima: String(p.v.contributo), dopo: String(v.contributo) });
      if (p.v.descrizione !== v.descrizione) modifiche.push({ campo: 'descrizione', prima: p.v.descrizione, dopo: v.descrizione });
      if (p.v.modalita !== v.modalita) modifiche.push({ campo: 'modalita', prima: p.v.modalita, dopo: v.modalita });
      if (p.g.chiave !== g.chiave) modifiche.push({ campo: 'premio', prima: p.g.nome, dopo: g.nome });
      return { variante: v, esito: modifiche.length ? ('modificata' as const) : ('invariata' as const), modifiche };
    });
    const tolte = prima ? prima.varianti.filter((v) => !g.varianti.some((x) => chiaveVariante(g.stagione, x) === chiaveVariante(prima.stagione, v))).length : 0;
    const esito = !prima ? 'nuovo' : varianti.some((x) => x.esito !== 'invariata') || prima.nome !== g.nome || tolte ? 'aggiornato' : 'invariato';
    return { gruppo: g, esito, varianti, nomePrima: prima && prima.nome !== g.nome ? prima.nome : undefined };
  });
  const assenti: Confronto['assenti'] = [];
  for (const [k, { v, g }] of variantePrima) if (!viste.has(k)) assenti.push({ stagione: g.stagione, codice: v.codice, nome: g.nome });
  const vv = out.flatMap((g) => g.varianti);
  return {
    gruppi: out, conflitti, assenti,
    totali: {
      nuovi: out.filter((g) => g.esito === 'nuovo').length,
      aggiornati: out.filter((g) => g.esito === 'aggiornato').length,
      invariati: out.filter((g) => g.esito === 'invariato').length,
      daVerificare: out.filter((g) => daVerificare(g.gruppo)).length,
      variantiNuove: vv.filter((v) => v.esito === 'nuova').length,
      variantiModificate: vv.filter((v) => v.esito === 'modificata').length,
    },
  };
}

/* ------------------------------------------------------------------ ricerca */

export interface VoceIndice { gruppo: Gruppo; nome: string; testo: string; parole: string[]; codici: string[] }
export interface Risultato { gruppo: Gruppo; evidenziati: string[]; punteggio: number; simile?: boolean }

export function creaIndice(gruppi: Gruppo[]): VoceIndice[] {
  return gruppi.map((g) => {
    const nome = normalizzaTesto(g.nome);
    const testo = normalizzaTesto([g.nome, ...g.varianti.map((v) => v.descrizione)].join(' '));
    const codici = g.varianti.flatMap((v) => [v.codice, v.ean]).filter(Boolean);
    return { gruppo: g, nome, testo, parole: [...new Set(testo.split(' '))], codici };
  });
}

function distanzaAlMassimoUno(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0, j = 0, diff = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++diff > 1) return false;
    if (a.length > b.length) i++; else if (b.length > a.length) j++; else { i++; j++; }
  }
  return diff + (a.length - i) + (b.length - j) <= 1;
}

/**
 * Cerca nel listino. Le parole vanno tutte trovate (in qualunque ordine); i numeri cercano anche nei
 * codici e negli EAN (anche parziali, con o senza zero iniziale). Se non trova nulla riprova
 * tollerando un carattere sbagliato per parola.
 */
export function cerca(indice: VoceIndice[], domanda: string, limite = 60): { risultati: Risultato[]; totale: number; simili: boolean } {
  const q = normalizzaTesto(domanda);
  if (!q) return { risultati: [], totale: 0, simili: false };
  const compatta = q.replace(/\s+/g, '');
  const soloNumero = /^\d{3,}$/.test(compatta);
  const parole = soloNumero ? [compatta] : q.split(' ');

  const valuta = (voce: VoceIndice, tollerante: boolean): Risultato | null => {
    const evidenziati: string[] = [];
    let punteggio = 0;
    for (const p of parole) {
      if (/^\d+$/.test(p)) {
        const pp = p.replace(/^0+/, '') || p;
        const codiciTrovati = voce.gruppo.varianti.filter((v) => v.codice.includes(p) || v.codice.replace(/^0+/, '').includes(pp) || v.ean.includes(p)).map((v) => v.codice);
        if (codiciTrovati.length) {
          evidenziati.push(...codiciTrovati);
          const esatto = voce.gruppo.varianti.some((v) => v.codice === p || v.codice.replace(/^0+/, '') === pp || v.ean === p);
          punteggio += esatto ? 1000 : 300;
          continue;
        }
        if (voce.testo.includes(p)) { punteggio += 50; continue; }
        return null;
      }
      if (voce.testo.includes(p)) {
        punteggio += voce.parole.some((w) => w.startsWith(p)) ? 60 : 30;
        continue;
      }
      if (tollerante && p.length >= 4 && voce.parole.some((w) => w.length >= 3 && (distanzaAlMassimoUno(w, p) || (w.length > p.length && distanzaAlMassimoUno(w.slice(0, p.length), p))))) { punteggio += 10; continue; }
      return null;
    }
    if (!soloNumero) {
      if (voce.nome === q) punteggio += 500;
      else if (voce.nome.startsWith(q)) punteggio += 250;
      else if (voce.nome.includes(q)) punteggio += 120;
    }
    return { gruppo: voce.gruppo, evidenziati: [...new Set(evidenziati)], punteggio };
  };

  let trovati = indice.map((v) => valuta(v, false)).filter((r): r is Risultato => r !== null);
  let simili = false;
  if (!trovati.length) {
    trovati = indice.map((v) => valuta(v, true)).filter((r): r is Risultato => r !== null).map((r) => ({ ...r, simile: true }));
    simili = trovati.length > 0;
  }
  trovati.sort((a, b) => b.punteggio - a.punteggio || b.gruppo.stagione.localeCompare(a.gruppo.stagione) || a.gruppo.nome.localeCompare(b.gruppo.nome, 'it'));
  return { risultati: trovati.slice(0, limite), totale: trovati.length, simili };
}

/* ------------------------------------------------------------------ formattazione */

const fPunti = new Intl.NumberFormat('it-IT', { maximumFractionDigits: 0 });
const fEuro = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' });
export const puntiIt = (n: number | null) => (n === null ? '—' : fPunti.format(n));
export const euroIt = (n: number) => fEuro.format(n);

/* ------------------------------------------------------------------ archivio (backend) */

export interface GruppoArchivio { id: string; chiave: string; stagione: string; nome: string; verifica: string; note_verifica: string; attivo: string; importazione_id: string; creato_il: string; modificato_il: string }
export interface VarianteArchivio { id: string; gruppo_id: string; stagione: string; codice: string; ean: string; codice_preconf: string; descrizione: string; modalita: string; punti: string; contributo: string; foglio: string; riga: string; attivo: string; importazione_id: string; creato_il: string; modificato_il: string }
export interface Importazione {
  id: string; timestamp: string; operatore: string; tipo: 'importazione' | 'ripristino' | string; file: string; stagioni: string;
  premi_nuovi: string; premi_aggiornati: string; premi_invariati: string; premi_da_verificare: string;
  varianti_nuove: string; varianti_aggiornate: string; non_presenti: string; disattivati: string; note: string; ripristinabile?: 'SI' | 'NO';
}
export interface ListinoArchivio { gruppi: GruppoArchivio[]; varianti: VarianteArchivio[]; importazioni: Importazione[]; ora: string }

const SEP_NOTE = ' | ';

/** Premi dell'archivio nel formato usato dalla ricerca (solo le versioni attive, pieno prima). */
export function daArchivio(l: Pick<ListinoArchivio, 'gruppi' | 'varianti'>, soloAttivi = true): Gruppo[] {
  const perGruppo = new Map<string, Variante[]>();
  for (const v of l.varianti) {
    if (soloAttivi && v.attivo !== 'SI') continue;
    const n = (s: string) => (s === '' ? null : Number(s));
    const lista = perGruppo.get(v.gruppo_id) ?? [];
    lista.push({ codice: v.codice, ean: v.ean, codicePreconf: v.codice_preconf, descrizione: v.descrizione,
      punti: n(v.punti), contributo: n(v.contributo) ?? 0, modalita: v.modalita === 'contributo' ? 'contributo' : 'pieno', foglio: v.foglio, riga: Number(v.riga) || 0 });
    perGruppo.set(v.gruppo_id, lista);
  }
  const out: Gruppo[] = [];
  for (const g of l.gruppi) {
    if (soloAttivi && g.attivo !== 'SI') continue;
    const varianti = (perGruppo.get(g.id) ?? []).sort((a, b) => (a.modalita === b.modalita ? (b.punti ?? 0) - (a.punti ?? 0) : a.modalita === 'pieno' ? -1 : 1));
    if (!varianti.length) continue;
    const verifiche: Verifica[] = g.verifica === 'da verificare'
      ? (g.note_verifica ? g.note_verifica.split(SEP_NOTE) : ['Da verificare']).map((testo) => ({ livello: 'avviso' as const, testo }))
      : [];
    out.push({ chiave: g.chiave, id: g.id, stagione: g.stagione, nome: g.nome, varianti, verifiche });
  }
  return out;
}

/** Dati da inviare al backend per l'importazione. */
export function perImportazione(gruppi: Gruppo[]) {
  return gruppi.map((g) => ({
    chiave: g.chiave, stagione: g.stagione, nome: g.nome,
    verifica: daVerificare(g) ? 'da verificare' : 'ok',
    note_verifica: g.verifiche.filter((v) => v.livello === 'avviso').map((v) => v.testo).join(SEP_NOTE),
    varianti: g.varianti.map((v) => ({ codice: v.codice, ean: v.ean, codice_preconf: v.codicePreconf, descrizione: v.descrizione,
      modalita: v.modalita, punti: v.punti ?? '', contributo: v.contributo, foglio: v.foglio, riga: v.riga })),
  }));
}
