import { useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { LuChevronDown, LuX } from 'react-icons/lu';
import { corrisponde, normalizza } from '../lib/format.ts';

export interface Opzione {
  id: string;
  codice: string;
  testo: string;
  /** Riga secondaria facoltativa nell'elenco. */
  dettaglio?: string;
}

const MAX = 60;

/**
 * Selezione con ricerca immediata per codice o nome, utilizzabile da tastiera:
 * ↑/↓ per scorrere, Invio o Tab per scegliere, Esc per chiudere.
 */
export function Combobox({ id, opzioni, valore, onChange, segnaposto, errore, autoFocus, disabilitato, inputRef, vuoto }: {
  id: string;
  opzioni: Opzione[];
  valore: string;
  onChange: (id: string) => void;
  segnaposto?: string;
  errore?: boolean;
  autoFocus?: boolean;
  disabilitato?: boolean;
  inputRef?: { current: HTMLInputElement | null };
  vuoto?: string;
}) {
  const [query, setQuery] = useState<string | null>(null);
  const [aperto, setAperto] = useState(false);
  const [attivo, setAttivo] = useState(0);
  const ref = useRef<HTMLInputElement | null>(null);
  const listaRef = useRef<HTMLUListElement | null>(null);
  const selezionata = opzioni.find((o) => o.id === valore);
  const etichetta = selezionata ? `${selezionata.codice ? selezionata.codice + ' — ' : ''}${selezionata.testo}` : '';

  const filtrate = useMemo(() => {
    const q = (query ?? '').trim();
    if (!q) return opzioni.slice(0, MAX);
    const nq = normalizza(q);
    const punteggio = (o: Opzione) => {
      const c = normalizza(o.codice);
      if (c === nq) return 0;
      if (c.startsWith(nq)) return 1;
      if (normalizza(o.testo).startsWith(nq)) return 2;
      return 3;
    };
    return opzioni
      .filter((o) => corrisponde(`${o.codice} ${o.testo} ${o.dettaglio ?? ''}`, q))
      .sort((a, b) => punteggio(a) - punteggio(b))
      .slice(0, MAX);
  }, [opzioni, query]);

  useEffect(() => { setAttivo(0); }, [query]);
  useEffect(() => {
    const el = listaRef.current?.children[attivo] as HTMLElement | undefined;
    el?.scrollIntoView?.({ block: 'nearest' });
  }, [attivo, aperto]);

  const scegli = (o: Opzione | undefined) => {
    if (o) onChange(o.id);
    setQuery(null);
    setAperto(false);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); if (!aperto) setAperto(true); else setAttivo((a) => Math.min(a + 1, filtrate.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setAttivo((a) => Math.max(a - 1, 0)); }
    else if (e.key === 'Enter') {
      if (aperto && filtrate.length && !e.ctrlKey && !e.metaKey) { e.preventDefault(); scegli(filtrate[attivo]); }
      // Testo digitato senza corrispondenze: Invio non deve inviare il modulo con un valore diverso da quello cercato.
      else if (query !== null && query.trim() !== '') e.preventDefault();
    } else if (e.key === 'Tab') {
      if (aperto && query && filtrate.length) scegli(filtrate[attivo]);
      else { setAperto(false); setQuery(null); }
    } else if (e.key === 'Escape') {
      if (aperto || query !== null) { e.preventDefault(); setAperto(false); setQuery(null); }
    }
  };

  const setRef = (el: HTMLInputElement | null) => { ref.current = el; if (inputRef) inputRef.current = el; };

  return (
    <div className="relative">
      <input
        id={id}
        ref={setRef}
        className={`input pr-14 ${errore ? 'input-errore' : ''}`}
        role="combobox"
        aria-expanded={aperto}
        aria-controls={id + '-lista'}
        aria-autocomplete="list"
        autoComplete="off"
        autoFocus={autoFocus}
        disabled={disabilitato}
        placeholder={segnaposto ?? 'Cerca per codice o nome…'}
        value={query ?? etichetta}
        onChange={(e) => { setQuery(e.target.value); setAperto(true); }}
        onFocus={(e) => e.target.select()}
        onMouseDown={() => setAperto(true)}
        onKeyDown={onKeyDown}
        onBlur={() => {
          // Codice digitato per intero: viene accettato anche senza scegliere dall'elenco.
          const q = normalizza(query ?? '');
          if (q) { const esatta = opzioni.find((o) => normalizza(o.codice) === q); if (esatta) onChange(esatta.id); }
          setAperto(false); setQuery(null);
        }}
      />
      <div className="absolute inset-y-0 right-1 flex items-center gap-0.5 text-slate-400">
        {valore && !disabilitato && (
          <button type="button" tabIndex={-1} className="rounded p-1 hover:bg-slate-100 hover:text-slate-700" aria-label="Svuota"
            onMouseDown={(e) => e.preventDefault()} onClick={() => { onChange(''); ref.current?.focus(); }}><LuX /></button>
        )}
        <LuChevronDown className="mr-1" aria-hidden />
      </div>
      {aperto && !disabilitato && (
        <ul id={id + '-lista'} ref={listaRef} role="listbox"
          className="absolute z-30 mt-1 max-h-72 w-full overflow-y-auto rounded-md border border-slate-200 bg-white py-1 shadow-lg">
          {filtrate.length === 0 && <li className="px-3 py-2 text-slate-500">{vuoto ?? 'Nessun risultato'}</li>}
          {filtrate.map((o, i) => (
            <li key={o.id} role="option" aria-selected={i === attivo}
              className={`cursor-pointer px-3 py-1.5 ${i === attivo ? 'bg-brand-50' : ''} ${o.id === valore ? 'font-semibold' : ''}`}
              onMouseDown={(e) => { e.preventDefault(); scegli(o); }}
              onMouseEnter={() => setAttivo(i)}>
              <div className="flex gap-2">
                {o.codice && <span className="shrink-0 font-mono text-xs leading-5 text-slate-500">{o.codice}</span>}
                <span>{o.testo}</span>
              </div>
              {o.dettaglio && <div className="text-xs text-slate-500">{o.dettaglio}</div>}
            </li>
          ))}
          {filtrate.length === MAX && <li className="px-3 py-1 text-xs text-slate-400">Mostrati i primi {MAX}: continua a digitare per restringere.</li>}
        </ul>
      )}
    </div>
  );
}
