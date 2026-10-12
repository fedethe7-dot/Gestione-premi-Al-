/**
 * Impostazioni locali del browser (NON i dati del gestionale, che stanno nel Foglio Google).
 * Salvate in localStorage: indirizzo della web app, token, nome operatore, preferenze.
 */
import type { Separatore } from './csv.ts';

export interface Config {
  url: string;
  token: string;
  operatore: string;
  separatore: Separatore;
}

const KEY = 'gestionale-premi.config';
const PREF = 'gestionale-premi.pref.';

export function leggiConfig(): Config {
  const base: Config = { url: '', token: '', operatore: '', separatore: ';' };
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...base, ...JSON.parse(raw) };
  } catch { /* storage non disponibile */ }
  return base;
}

export function salvaConfig(c: Config): void {
  try { localStorage.setItem(KEY, JSON.stringify(c)); } catch { /* ignorato */ }
}

export function cancellaConfig(): void {
  try { localStorage.removeItem(KEY); } catch { /* ignorato */ }
}

export function leggiPref(nome: string, dflt = ''): string {
  try { return localStorage.getItem(PREF + nome) ?? dflt; } catch { return dflt; }
}

export function salvaPref(nome: string, valore: string): void {
  try { localStorage.setItem(PREF + nome, valore); } catch { /* ignorato */ }
}
