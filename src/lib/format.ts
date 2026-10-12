/** Formattazione e utilità per date, numeri e testi (italiano). */

export function oggiIso(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** 2026-10-12 → 12/10/2026 */
export function dataIt(iso: string): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return iso || '';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

/** Timestamp ISO (UTC) → data e ora locali "12/10/2026 18:05". */
export function dataOraIt(ts: string): string {
  if (!ts) return '';
  const d = new Date(ts);
  if (isNaN(d.getTime())) return ts;
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

const nf = new Intl.NumberFormat('it-IT');
export function num(n: number): string { return nf.format(n); }

export function perc(n: number | null, decimali = 1): string {
  if (n === null || !isFinite(n)) return '—';
  return new Intl.NumberFormat('it-IT', { minimumFractionDigits: decimali, maximumFractionDigits: decimali }).format(n * 100) + '%';
}

const MESI = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];
/** 2026-10 → "ott 2026" */
export function meseIt(ym: string): string {
  const [y, m] = ym.split('-');
  return `${MESI[Number(m) - 1]} ${y}`;
}

/** Normalizza un testo per la ricerca: minuscolo, senza accenti, spazi compattati. */
export function normalizza(s: string): string {
  return (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Vero se tutte le parole della ricerca compaiono nel testo. */
export function corrisponde(testo: string, ricerca: string): boolean {
  const t = normalizza(testo);
  return normalizza(ricerca).split(' ').every((w) => !w || t.includes(w));
}

export function isEmail(s: string): boolean {
  return /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]{2,}$/.test(s);
}

export function primoDelMese(d = new Date()): string { return oggiIso(new Date(d.getFullYear(), d.getMonth(), 1)); }

export function giorniFa(n: number, d = new Date()): string {
  const x = new Date(d); x.setDate(x.getDate() - n); return oggiIso(x);
}
