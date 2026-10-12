/** Generazione e lettura di file CSV compatibili con Excel in italiano. */

export type Separatore = ';' | ',';

export interface Colonna<T> {
  titolo: string;
  valore: (r: T) => string | number | null | undefined;
}

/** Valori che Excel interpreterebbe come formula vengono preceduti da un apostrofo. */
function proteggi(s: string): string {
  if (/^[=+@\t\r]/.test(s) || (/^-/.test(s) && !/^-\d+([.,]\d+)?$/.test(s))) return "'" + s;
  return s;
}

function cella(v: string | number | null | undefined, sep: Separatore): string {
  if (v === null || v === undefined) return '';
  let s: string;
  if (typeof v === 'number') {
    if (!isFinite(v)) return '';
    s = Number.isInteger(v) ? String(v) : String(Math.round(v * 10000) / 10000);
    if (sep === ';') s = s.replace('.', ','); // Excel italiano: virgola decimale
    return s;
  }
  s = proteggi(String(v));
  if (s.includes(sep) || s.includes('"') || s.includes('\n') || s.includes('\r') || /^\s|\s$/.test(s)) {
    s = '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

/** Restituisce il testo CSV (senza BOM). Righe separate da CRLF come si aspetta Excel. */
export function creaCsv<T>(righe: T[], colonne: Colonna<T>[], sep: Separatore): string {
  const out = [colonne.map((c) => cella(c.titolo, sep)).join(sep)];
  for (const r of righe) out.push(colonne.map((c) => cella(c.valore(r), sep)).join(sep));
  return out.join('\r\n') + '\r\n';
}

export const BOM = '﻿';

export function nomeFile(tipo: string, d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${tipo}_${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}.csv`;
}

/* ------------------------------------------------------------------ lettura */

/** Decodifica un file: UTF-8 se valido, altrimenti Windows-1252 (CSV salvati da Excel "ANSI"). */
export function decodifica(buf: ArrayBuffer): { testo: string; codifica: string } {
  try {
    const t = new TextDecoder('utf-8', { fatal: true }).decode(buf);
    return { testo: t.replace(/^﻿/, ''), codifica: 'UTF-8' };
  } catch {
    return { testo: new TextDecoder('windows-1252').decode(buf), codifica: 'Windows-1252' };
  }
}

/** Individua il separatore più probabile osservando la prima riga (fuori dalle virgolette). */
export function rilevaSeparatore(testo: string): string {
  const conta: Record<string, number> = { ';': 0, ',': 0, '\t': 0 };
  let inQ = false;
  for (const ch of testo) {
    if (ch === '"') inQ = !inQ;
    else if (!inQ && (ch === '\n' || ch === '\r')) break;
    else if (!inQ && ch in conta) conta[ch]++;
  }
  const [migliore, n] = Object.entries(conta).sort((a, b) => b[1] - a[1])[0];
  return n > 0 ? migliore : ';';
}

/** Parser CSV RFC 4180 (virgolette, separatori e a capo dentro i campi). */
export function leggiCsv(testo: string, sep?: string): string[][] {
  const s = sep || rilevaSeparatore(testo);
  const righe: string[][] = [];
  let riga: string[] = [];
  let campo = '';
  let inQ = false;
  for (let i = 0; i < testo.length; i++) {
    const ch = testo[i];
    if (inQ) {
      if (ch === '"') {
        if (testo[i + 1] === '"') { campo += '"'; i++; } else inQ = false;
      } else campo += ch;
    } else if (ch === '"' && campo === '') inQ = true;
    else if (ch === s) { riga.push(campo); campo = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && testo[i + 1] === '\n') i++;
      riga.push(campo); righe.push(riga); riga = []; campo = '';
    } else campo += ch;
  }
  if (campo !== '' || riga.length) { riga.push(campo); righe.push(riga); }
  return righe.filter((r) => r.some((c) => c.trim() !== ''));
}
