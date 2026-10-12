import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { LuCircleAlert, LuCircleCheck, LuInfo, LuX } from 'react-icons/lu';
import { Modale } from '../components/Modale.tsx';

type TipoAvviso = 'successo' | 'errore' | 'info';
interface Avviso { id: number; tipo: TipoAvviso; testo: string }

export interface OpzioniConferma {
  titolo: string;
  messaggio: ReactNode;
  etichetta?: string;
  pericolo?: boolean;
  /** Se presente, mostra un campo di testo (es. motivo dell'annullamento). */
  campoTesto?: { etichetta: string; obbligatorio?: boolean; segnaposto?: string };
  /** Se presente, l'utente deve digitare esattamente questa parola per confermare. */
  parolaChiave?: string;
}

interface UiCtx {
  avvisa: (tipo: TipoAvviso, testo: string) => void;
  /** Restituisce il testo inserito (o '' se non richiesto) oppure null se annullato. */
  conferma: (o: OpzioniConferma) => Promise<string | null>;
}

const Ctx = createContext<UiCtx | null>(null);
export function useUi(): UiCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('useUi fuori dal provider');
  return c;
}

export function ProviderUi({ children }: { children: ReactNode }) {
  const [avvisi, setAvvisi] = useState<Avviso[]>([]);
  const [dialogo, setDialogo] = useState<(OpzioniConferma & { risolvi: (v: string | null) => void }) | null>(null);
  const seq = useRef(0);

  const avvisa = useCallback((tipo: TipoAvviso, testo: string) => {
    const id = ++seq.current;
    setAvvisi((a) => [...a.slice(-3), { id, tipo, testo }]);
    setTimeout(() => setAvvisi((a) => a.filter((x) => x.id !== id)), tipo === 'errore' ? 9000 : 4500);
  }, []);

  const conferma = useCallback((o: OpzioniConferma) => new Promise<string | null>((risolvi) => setDialogo({ ...o, risolvi })), []);

  return (
    <Ctx.Provider value={{ avvisa, conferma }}>
      {children}
      <div className="pointer-events-none fixed right-4 bottom-4 z-50 flex w-96 max-w-[calc(100vw-2rem)] flex-col gap-2" aria-live="polite">
        {avvisi.map((a) => (
          <div key={a.id} role={a.tipo === 'errore' ? 'alert' : 'status'}
            className={`pointer-events-auto flex items-start gap-2 rounded-lg border px-3 py-2.5 shadow-lg ${
              a.tipo === 'successo' ? 'border-emerald-300 bg-emerald-50 text-emerald-900'
                : a.tipo === 'errore' ? 'border-red-300 bg-red-50 text-red-900' : 'border-slate-300 bg-white text-slate-800'}`}>
            {a.tipo === 'successo' ? <LuCircleCheck className="mt-0.5 shrink-0" /> : a.tipo === 'errore' ? <LuCircleAlert className="mt-0.5 shrink-0" /> : <LuInfo className="mt-0.5 shrink-0" />}
            <span className="flex-1">{a.testo}</span>
            <button className="opacity-60 hover:opacity-100" aria-label="Chiudi" onClick={() => setAvvisi((x) => x.filter((y) => y.id !== a.id))}><LuX /></button>
          </div>
        ))}
      </div>
      {dialogo && <DialogoConferma o={dialogo} chiudi={(v) => { dialogo.risolvi(v); setDialogo(null); }} />}
    </Ctx.Provider>
  );
}

function DialogoConferma({ o, chiudi }: { o: OpzioniConferma; chiudi: (v: string | null) => void }) {
  const [testo, setTesto] = useState('');
  const ref = useRef<HTMLInputElement | null>(null);
  useEffect(() => { ref.current?.focus(); }, []);
  const valido = (!o.campoTesto?.obbligatorio || testo.trim() !== '') && (!o.parolaChiave || testo.trim() === o.parolaChiave);
  return (
    <Modale titolo={o.titolo} chiudi={() => chiudi(null)} larghezza="max-w-md">
      <form noValidate onSubmit={(e) => { e.preventDefault(); if (valido) chiudi(testo.trim()); }}>
        <div className="space-y-3 text-slate-700">{o.messaggio}</div>
        {(o.campoTesto || o.parolaChiave) && (
          <div className="mt-4">
            <label className="label" htmlFor="conferma-testo">{o.campoTesto?.etichetta ?? `Digita ${o.parolaChiave} per confermare`}</label>
            <input id="conferma-testo" ref={ref} className="input" value={testo} placeholder={o.campoTesto?.segnaposto}
              onChange={(e) => setTesto(e.target.value)} autoComplete="off" />
          </div>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className="btn-secondario" onClick={() => chiudi(null)}>Annulla</button>
          <button type="submit" autoFocus={!o.campoTesto && !o.parolaChiave} disabled={!valido}
            className={o.pericolo ? 'btn-pericolo' : 'btn-primario'}>{o.etichetta ?? 'Conferma'}</button>
        </div>
      </form>
    </Modale>
  );
}
