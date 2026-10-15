/**
 * Lettore minimo di file Excel (.xlsx) senza librerie esterne.
 *
 * Un .xlsx è un archivio ZIP di file XML: qui si leggono l'indice dello ZIP, si decomprimono i file
 * con DecompressionStream (presente nei browser moderni e in Node 18+) e si estraggono i valori
 * delle celle. Per le celle con formula si usa il valore già calcolato salvato nel file.
 * Restituisce i fogli come tabelle di valori: testo, numero, booleano o null.
 */

export type ValoreCella = string | number | boolean | null;
export interface FoglioExcel { nome: string; righe: ValoreCella[][] }
export interface FileExcel { fogli: FoglioExcel[] }

export class ErroreExcel extends Error {}

interface VoceZip { nome: string; metodo: number; dimCompressa: number; offsetLocale: number }

function u16(b: Uint8Array, o: number) { return b[o] | (b[o + 1] << 8); }
function u32(b: Uint8Array, o: number) { return (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0; }

function indiceZip(b: Uint8Array): Map<string, VoceZip> {
  // Fine della "central directory": firma 0x06054b50, cercata partendo dal fondo del file.
  let eocd = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 65557); i--) {
    if (u32(b, i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new ErroreExcel('Il file non è un Excel .xlsx valido (archivio non riconosciuto). Se è un .xls vecchio, salvalo come .xlsx.');
  const n = u16(b, eocd + 10);
  let p = u32(b, eocd + 16);
  const td = new TextDecoder();
  const voci = new Map<string, VoceZip>();
  for (let k = 0; k < n; k++) {
    if (u32(b, p) !== 0x02014b50) throw new ErroreExcel('Archivio Excel danneggiato.');
    const metodo = u16(b, p + 10);
    const dimCompressa = u32(b, p + 20);
    const lNome = u16(b, p + 28), lExtra = u16(b, p + 30), lCommento = u16(b, p + 32);
    const offsetLocale = u32(b, p + 42);
    const nome = td.decode(b.subarray(p + 46, p + 46 + lNome));
    voci.set(nome, { nome, metodo, dimCompressa, offsetLocale });
    p += 46 + lNome + lExtra + lCommento;
  }
  return voci;
}

async function estrai(b: Uint8Array, v: VoceZip): Promise<string> {
  const o = v.offsetLocale;
  if (u32(b, o) !== 0x04034b50) throw new ErroreExcel('Archivio Excel danneggiato.');
  const inizio = o + 30 + u16(b, o + 26) + u16(b, o + 28);
  const dati = b.subarray(inizio, inizio + v.dimCompressa);
  if (v.metodo === 0) return new TextDecoder().decode(dati);
  if (v.metodo !== 8) throw new ErroreExcel('Formato di compressione non supportato nel file Excel.');
  const flusso = new Blob([dati.slice() as Uint8Array<ArrayBuffer>]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Response(flusso).text();
}

const ENTITA: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
function decodificaXml(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') return String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
    return ENTITA[e] ?? m;
  });
}

function attributo(attrs: string, nome: string): string | null {
  const m = new RegExp('(?:^|\\s)' + nome + '="([^"]*)"').exec(attrs);
  return m ? decodificaXml(m[1]) : null;
}

/** Testo di un nodo con eventuali "run" di formattazione (<r><t>…</t></r>), escluse le letture fonetiche. */
function testoRicco(xml: string): string {
  const pulito = xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, '');
  let out = '';
  for (const m of pulito.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>|<t(?:\s[^>]*)?\/>/g)) out += m[1] ? decodificaXml(m[1]) : '';
  return out;
}

function indiceColonna(rif: string): number {
  let n = 0;
  for (const ch of rif) { const c = ch.charCodeAt(0); if (c < 65 || c > 90) break; n = n * 26 + (c - 64); }
  return n - 1;
}

function percorso(base: string, target: string): string {
  if (target.startsWith('/')) return target.slice(1);
  const parti = base.split('/').slice(0, -1);
  for (const p of target.split('/')) { if (p === '..') parti.pop(); else if (p !== '.') parti.push(p); }
  return parti.join('/');
}

function leggiFoglio(xml: string, condivise: string[]): ValoreCella[][] {
  const righe: ValoreCella[][] = [];
  const dati = /<sheetData\b[^>]*>([\s\S]*?)<\/sheetData>/.exec(xml)?.[1] ?? '';
  let rigaProg = 0;
  for (const mr of dati.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const r = attributo(mr[1], 'r');
    const idx = r ? parseInt(r, 10) - 1 : rigaProg;
    rigaProg = idx + 1;
    const riga: ValoreCella[] = [];
    let colProg = 0;
    for (const mc of (mr[2] ?? '').matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const rif = attributo(mc[1], 'r');
      const col = rif ? indiceColonna(rif) : colProg;
      colProg = col + 1;
      const tipo = attributo(mc[1], 't');
      const corpo = mc[2] ?? '';
      const v = /<v>([\s\S]*?)<\/v>/.exec(corpo)?.[1];
      let valore: ValoreCella = null;
      if (tipo === 's') valore = v !== undefined ? condivise[parseInt(v, 10)] ?? '' : null;
      else if (tipo === 'inlineStr') valore = testoRicco(/<is>([\s\S]*?)<\/is>/.exec(corpo)?.[1] ?? '');
      else if (tipo === 'str') valore = v !== undefined ? decodificaXml(v) : null;
      else if (tipo === 'b') valore = v === '1';
      else if (tipo === 'e') valore = null;
      else if (v !== undefined && v !== '') { const n = Number(v); valore = Number.isFinite(n) ? n : decodificaXml(v); }
      if (valore !== null && valore !== '') { while (riga.length < col) riga.push(null); riga[col] = valore; }
    }
    while (righe.length < idx) righe.push([]);
    righe[idx] = riga;
  }
  return righe;
}

/** Legge un file .xlsx (contenuto binario) e restituisce tutti i fogli nell'ordine del file. */
export async function leggiXlsx(contenuto: ArrayBuffer | Uint8Array): Promise<FileExcel> {
  const b = contenuto instanceof Uint8Array ? contenuto : new Uint8Array(contenuto);
  const zip = indiceZip(b);
  const leggi = async (nome: string) => { const v = zip.get(nome); return v ? estrai(b, v) : null; };
  const workbook = await leggi('xl/workbook.xml');
  if (!workbook) throw new ErroreExcel('Il file non contiene una cartella di lavoro Excel.');
  const rels = (await leggi('xl/_rels/workbook.xml.rels')) ?? '';
  const destinazioni = new Map<string, string>();
  for (const m of rels.matchAll(/<Relationship\b([^>]*?)\/?>/g)) {
    const id = attributo(m[1], 'Id'), target = attributo(m[1], 'Target');
    if (id && target) destinazioni.set(id, percorso('xl/workbook.xml', target));
  }
  const condivise: string[] = [];
  const ss = await leggi('xl/sharedStrings.xml');
  if (ss) for (const m of ss.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>|<si\s*\/>/g)) condivise.push(m[1] ? testoRicco(m[1]) : '');
  const fogli: FoglioExcel[] = [];
  for (const m of workbook.matchAll(/<sheet\b([^>]*?)\/?>/g)) {
    const nome = attributo(m[1], 'name') ?? `Foglio${fogli.length + 1}`;
    const rid = attributo(m[1], 'r:id');
    const file = rid ? destinazioni.get(rid) : undefined;
    const xml = file ? await leggi(file) : null;
    if (xml === null) continue;
    fogli.push({ nome, righe: leggiFoglio(xml, condivise) });
  }
  if (!fogli.length) throw new ErroreExcel('Nessun foglio leggibile nel file Excel.');
  return { fogli };
}
