import { useEffect, useRef, useState } from 'react';
import { LuCheck, LuCopy, LuExternalLink, LuMail, LuX } from 'react-icons/lu';

/** Copia negli appunti; se il browser lo blocca, seleziona il testo e usa il comando classico. */
export async function copiaTesto(testo: string, area?: HTMLTextAreaElement | null): Promise<boolean> {
  try { await navigator.clipboard.writeText(testo); return true; } catch { /* si prova sotto */ }
  const el = area ?? Object.assign(document.createElement('textarea'), { value: testo });
  const temporaneo = !area;
  if (temporaneo) { el.style.position = 'fixed'; el.style.opacity = '0'; document.body.appendChild(el); }
  try { el.focus(); el.select(); return document.execCommand('copy'); } catch { return false; }
  finally { if (temporaneo) el.remove(); }
}

/**
 * Riquadro mostrato dopo aver registrato un trasferimento o un'assegnazione: testo della mail per il PDV,
 * da copiare e incollare in Gmail (oppure da aprire direttamente in Gmail già compilato).
 */
export function MailOperazione({ id, testo, oggetto, pdv, destinatari, onChiudi }: {
  id: string; testo: string; oggetto: string; pdv: string; destinatari: string[]; onChiudi: () => void;
}) {
  const area = useRef<HTMLTextAreaElement | null>(null);
  const [copiato, setCopiato] = useState<'' | 'testo' | 'indirizzo'>('');
  useEffect(() => { setCopiato(''); }, [id]);
  const copia = async (cosa: 'testo' | 'indirizzo') => {
    const ok = await copiaTesto(cosa === 'testo' ? testo : destinatari.join(', '), cosa === 'testo' ? area.current : null);
    setCopiato(ok ? cosa : '');
    if (ok) setTimeout(() => setCopiato((c) => (c === cosa ? '' : c)), 2500);
  };
  const gmail = 'https://mail.google.com/mail/?view=cm&fs=1'
    + (destinatari.length ? '&to=' + encodeURIComponent(destinatari.join(',')) : '')
    + '&su=' + encodeURIComponent(oggetto) + '&body=' + encodeURIComponent(testo);

  return (
    <section className="mt-5 rounded-lg border border-brand-100 bg-brand-50/60 p-4" aria-label="Mail per il punto vendita">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 font-semibold"><LuMail /> Mail per {pdv}</h2>
          <p className="text-sm text-slate-600">
            <span className="font-mono">{id}</span>
            {destinatari.length
              ? <> · a: <b className="select-all">{destinatari.join(', ')}</b></>
              : <> · nessuna e-mail salvata per questo punto vendita (si aggiunge in Punti vendita)</>}
          </p>
        </div>
        <button type="button" className="btn-testo px-1.5 py-1" aria-label="Chiudi" onClick={onChiudi}><LuX /></button>
      </div>
      <textarea ref={area} id="mail-operazione" readOnly rows={testo.split("\n").length + 2} value={testo}
        className="input resize-y bg-white leading-relaxed" onFocus={(e) => e.currentTarget.select()} />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button type="button" className="btn-primario" onClick={() => void copia('testo')}>
          {copiato === 'testo' ? <><LuCheck /> Copiato!</> : <><LuCopy /> Copia testo</>}
        </button>
        {destinatari.length > 0 && (
          <button type="button" className="btn-secondario" onClick={() => void copia('indirizzo')}>
            {copiato === 'indirizzo' ? <><LuCheck /> Copiato!</> : <><LuCopy /> Copia indirizzo</>}
          </button>
        )}
        <a className="btn-secondario" href={gmail} target="_blank" rel="noopener noreferrer"><LuExternalLink /> Apri in Gmail già compilata</a>
      </div>
    </section>
  );
}
