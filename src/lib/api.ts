/** Client per la web app Google Apps Script (il backend). */
import type { Config } from './config.ts';

export class ApiError extends Error {
  code: string;
  details: unknown;
  constructor(code: string, message: string, details?: unknown) {
    super(message);
    this.code = code;
    this.details = details;
  }
}

export async function chiama<T>(cfg: Pick<Config, 'url' | 'token' | 'operatore'>, action: string, payload: unknown = {}, timeoutMs = 90000): Promise<T> {
  if (!cfg.url || !cfg.token) throw new ApiError('CONFIG', 'Collegamento al database non configurato: apri le Impostazioni.');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(cfg.url, {
      method: 'POST',
      // text/plain evita la richiesta preliminare CORS che Apps Script non gestisce.
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ token: cfg.token, operatore: cfg.operatore, action, payload }),
      redirect: 'follow',
      signal: ctrl.signal,
    });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw new ApiError('RETE', 'Il server non ha risposto in tempo. Controlla la connessione e riprova: l\'operazione potrebbe essere stata comunque registrata, verifica nello storico prima di ripeterla.');
    throw new ApiError('RETE', 'Impossibile contattare il server. Controlla la connessione a Internet e l\'indirizzo della web app nelle Impostazioni.');
  } finally {
    clearTimeout(timer);
  }
  const testo = await res.text();
  let body: { ok: boolean; data?: T; error?: { code: string; message: string; details?: unknown } };
  try {
    body = JSON.parse(testo);
  } catch {
    throw new ApiError('RISPOSTA', 'Risposta non valida dal server. Verifica che l\'indirizzo sia quello della web app (termina con /exec) e che la distribuzione abbia accesso "Chiunque".');
  }
  if (!body.ok) throw new ApiError(body.error?.code || 'ERRORE', body.error?.message || 'Errore sconosciuto.', body.error?.details);
  return body.data as T;
}

export function messaggioErrore(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  if (e instanceof Error) return e.message;
  return String(e);
}
