import { useEffect, useMemo, useRef, useState } from 'react';
import { LuArrowLeftRight, LuEraser, LuLink } from 'react-icons/lu';
import { ApiError, messaggioErrore } from '../lib/api.ts';
import { leggiPref, salvaPref } from '../lib/config.ts';
import { dataIt, num, oggiIso } from '../lib/format.ts';
import type { Reso, TipoOperazione, Trasferimento } from '../lib/types.ts';
import { useDati } from '../state/dati.tsx';
import { useUi } from '../state/ui.tsx';
import { Combobox, type Opzione } from './Combobox.tsx';
import { Campo } from './comuni.tsx';

interface Valori {
  catalogo_id: string; data: string; premio_id: string; quantita: string; causale: string; riferimento: string; note: string;
  pdv_origine_id: string; pdv_destinazione_id: string; pdv_id: string; trasferimento_id: string;
}

const vuoti = (catalogo: string): Valori => ({
  catalogo_id: catalogo, data: oggiIso(), premio_id: '', quantita: '', causale: '', riferimento: '', note: '',
  pdv_origine_id: '', pdv_destinazione_id: '', pdv_id: '', trasferimento_id: '',
});

function daEsistente(tipo: TipoOperazione, op: Trasferimento | Reso): Valori {
  const base = { ...vuoti(op.catalogo_id), data: op.data, premio_id: op.premio_id, quantita: op.quantita, causale: op.causale, riferimento: op.riferimento, note: op.note };
  if (tipo === 'trasferimento') {
    const t = op as Trasferimento;
    return { ...base, pdv_origine_id: t.pdv_origine_id, pdv_destinazione_id: t.pdv_destinazione_id };
  }
  const r = op as Reso;
  return { ...base, pdv_id: r.pdv_id, trasferimento_id: r.trasferimento_id };
}

/**
 * Modulo di inserimento/modifica di un trasferimento o di un reso.
 * Pensato per l'inserimento in serie: dopo il salvataggio restano catalogo, data, PDV e riferimento,
 * e il cursore torna sul premio. Ctrl+Invio salva da qualunque campo.
 */
export function FormOperazione({ tipo, esistente, trasferimentoIniziale, onSalvato, onAnnulla }: {
  tipo: TipoOperazione;
  esistente?: Trasferimento | Reso;
  trasferimentoIniziale?: string;
  onSalvato?: (op: Trasferimento | Reso) => void;
  onAnnulla?: () => void;
}) {
  const { dati, api, aggiorna, cataloghiOrdinati, causali, mappe } = useDati();
  const { avvisa, conferma } = useUi();
  const modifica = Boolean(esistente);
  const cataloghiAttivi = cataloghiOrdinati.filter((c) => c.attivo === 'SI' || c.id === esistente?.catalogo_id);

  const catIniziale = () => {
    const p = leggiPref('catalogo-operazioni');
    return cataloghiAttivi.some((c) => c.id === p) ? p : cataloghiAttivi[cataloghiAttivi.length - 1]?.id ?? '';
  };
  const [v, setV] = useState<Valori>(() => (esistente ? daEsistente(tipo, esistente) : vuoti(catIniziale())));
  const [errori, setErrori] = useState<Partial<Record<keyof Valori, string>>>({});
  const [erroreGenerale, setErroreGenerale] = useState('');
  const [inCorso, setInCorso] = useState(false);
  const [mantieni, setMantieni] = useState(() => leggiPref('mantieni-pdv', '1') === '1');
  const premioRef = useRef<HTMLInputElement | null>(null);
  const primoRef = useRef<HTMLInputElement | null>(null);
  const formRef = useRef<HTMLFormElement | null>(null);

  const set = <K extends keyof Valori>(k: K, val: Valori[K]) => {
    setV((x) => ({ ...x, [k]: val }));
    setErrori((e) => ({ ...e, [k]: undefined }));
  };

  // Precompilazione da un trasferimento (es. "Registra reso collegato" dallo storico).
  useEffect(() => {
    if (!trasferimentoIniziale || esistente) return;
    const t = mappe.trasferimenti.get(trasferimentoIniziale);
    if (t && t.stato === 'valido') {
      setV((x) => ({ ...x, catalogo_id: t.catalogo_id, premio_id: t.premio_id, pdv_id: t.pdv_destinazione_id, trasferimento_id: t.id }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trasferimentoIniziale]);

  const opzioniPdv = useMemo<Opzione[]>(() => {
    const correnti = new Set([esistente && 'pdv_id' in esistente ? esistente.pdv_id : '', esistente && 'pdv_origine_id' in esistente ? esistente.pdv_origine_id : '',
      esistente && 'pdv_destinazione_id' in esistente ? esistente.pdv_destinazione_id : '']);
    return dati!.pdv.filter((p) => p.attivo === 'SI' || correnti.has(p.id))
      .sort((a, b) => a.codice.localeCompare(b.codice, 'it', { numeric: true }))
      .map((p) => ({ id: p.id, codice: p.codice, testo: p.nome + (p.attivo === 'SI' ? '' : ' (non attivo)'), dettaglio: p.citta || undefined }));
  }, [dati, esistente]);

  const opzioniPremi = useMemo<Opzione[]>(() => dati!.premi
    .filter((p) => p.catalogo_id === v.catalogo_id && (p.attivo === 'SI' || p.id === esistente?.premio_id))
    .sort((a, b) => (a.codice || a.descrizione).localeCompare(b.codice || b.descrizione, 'it', { numeric: true }))
    .map((p) => ({ id: p.id, codice: p.codice, testo: p.descrizione + (p.attivo === 'SI' ? '' : ' (non attivo)'), dettaglio: p.categoria || undefined })),
  [dati, v.catalogo_id, esistente]);

  const opzioniTrasferimenti = useMemo<Opzione[]>(() => {
    if (tipo !== 'reso') return [];
    return dati!.trasferimenti
      .filter((t) => (t.stato === 'valido' || t.id === v.trasferimento_id) && t.catalogo_id === v.catalogo_id && (!v.premio_id || t.premio_id === v.premio_id))
      .sort((a, b) => Number(b.pdv_destinazione_id === v.pdv_id) - Number(a.pdv_destinazione_id === v.pdv_id) || b.data.localeCompare(a.data) || b.id.localeCompare(a.id))
      .map((t) => ({ id: t.id, codice: t.id, testo: `${dataIt(t.data)} · ${t.pdv_origine_nome} → ${t.pdv_destinazione_nome} · ${num(Number(t.quantita))} pz`, dettaglio: `${t.premio_codice ? t.premio_codice + ' ' : ''}${t.premio_descrizione}` }));
  }, [tipo, dati, v.catalogo_id, v.premio_id, v.pdv_id, v.trasferimento_id]);

  const elencoCausali = causali(tipo).map((c) => c.descrizione);
  if (v.causale && !elencoCausali.includes(v.causale)) elencoCausali.push(v.causale);

  const cambiaCatalogo = (id: string) => {
    if (!modifica) salvaPref('catalogo-operazioni', id);
    setV((x) => ({ ...x, catalogo_id: id, premio_id: mappe.premi.get(x.premio_id)?.catalogo_id === id ? x.premio_id : '', trasferimento_id: '' }));
  };

  const scegliTrasferimento = (id: string) => {
    const t = mappe.trasferimenti.get(id);
    setV((x) => ({ ...x, trasferimento_id: id, premio_id: t ? t.premio_id : x.premio_id, pdv_id: t && !x.pdv_id ? t.pdv_destinazione_id : x.pdv_id }));
    setErrori((e) => ({ ...e, trasferimento_id: undefined, premio_id: undefined, pdv_id: undefined }));
  };

  const valida = (): boolean => {
    const e: Partial<Record<keyof Valori, string>> = {};
    if (!v.catalogo_id) e.catalogo_id = 'Scegli il catalogo.';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v.data)) e.data = 'Data non valida.';
    if (!v.premio_id) e.premio_id = 'Scegli il premio.';
    if (!/^\d+$/.test(v.quantita.trim()) || Number(v.quantita) < 1) e.quantita = 'Inserisci un numero intero maggiore di zero.';
    else if (Number(v.quantita) > 1000000) e.quantita = 'Quantità troppo elevata.';
    if (tipo === 'trasferimento') {
      if (!v.pdv_origine_id) e.pdv_origine_id = 'Scegli il PDV di origine.';
      if (!v.pdv_destinazione_id) e.pdv_destinazione_id = 'Scegli il PDV di destinazione.';
      if (v.pdv_origine_id && v.pdv_origine_id === v.pdv_destinazione_id) e.pdv_destinazione_id = 'Origine e destinazione non possono coincidere.';
    } else if (!v.pdv_id) e.pdv_id = 'Scegli il punto vendita.';
    setErrori(e);
    const primo = Object.keys(e)[0];
    if (primo) formRef.current?.querySelector<HTMLElement>(`#op-${primo}`)?.focus();
    return !primo;
  };

  /** Segnala un possibile doppione: stessa data, premio, PDV e quantità già registrati. */
  const doppione = () => {
    if (modifica) return null;
    if (tipo === 'trasferimento') {
      return dati!.trasferimenti.find((t) => t.stato === 'valido' && t.data === v.data && t.premio_id === v.premio_id &&
        t.pdv_origine_id === v.pdv_origine_id && t.pdv_destinazione_id === v.pdv_destinazione_id && t.quantita === String(Number(v.quantita)));
    }
    return dati!.resi.find((r) => r.stato === 'valido' && r.data === v.data && r.premio_id === v.premio_id && r.pdv_id === v.pdv_id && r.quantita === String(Number(v.quantita)));
  };

  const salva = async () => {
    if (inCorso) return;
    setErroreGenerale('');
    if (!valida()) return;
    const dop = doppione();
    if (dop) {
      const ok = await conferma({
        titolo: 'Possibile doppione',
        messaggio: <p>Esiste già {tipo === 'trasferimento' ? 'un trasferimento identico' : 'un reso identico'} (<b>{dop.id}</b>) con la stessa data, premio, punti vendita e quantità. Vuoi registrarlo comunque?</p>,
        etichetta: 'Registra comunque',
      });
      if (ok === null) return;
    }
    setInCorso(true);
    const payload = tipo === 'trasferimento'
      ? { catalogo_id: v.catalogo_id, data: v.data, premio_id: v.premio_id, quantita: v.quantita.trim(), causale: v.causale, riferimento: v.riferimento, note: v.note, pdv_origine_id: v.pdv_origine_id, pdv_destinazione_id: v.pdv_destinazione_id }
      : { catalogo_id: v.catalogo_id, data: v.data, premio_id: v.premio_id, quantita: v.quantita.trim(), causale: v.causale, riferimento: v.riferimento, note: v.note, pdv_id: v.pdv_id, trasferimento_id: v.trasferimento_id };
    try {
      const r = await api<Trasferimento | Reso>(tipo === 'trasferimento' ? 'saveTrasferimento' : 'saveReso',
        esistente ? { ...payload, id: esistente.id, atteso_modificato_il: esistente.modificato_il } : payload);
      aggiorna(tipo === 'trasferimento' ? 'trasferimenti' : 'resi', r);
      avvisa('successo', modifica ? `${r.id} aggiornato.` : `${tipo === 'trasferimento' ? 'Trasferimento' : 'Reso'} ${r.id} registrato.`);
      if (!modifica) {
        setV((x) => ({
          ...x, premio_id: '', quantita: '', note: '', trasferimento_id: '',
          ...(mantieni ? {} : { pdv_origine_id: '', pdv_destinazione_id: '', pdv_id: '', riferimento: '', causale: '' }),
        }));
        setErrori({});
        setTimeout(() => (mantieni ? premioRef.current : primoRef.current)?.focus(), 0);
      }
      onSalvato?.(r);
    } catch (e) {
      const campi = e instanceof ApiError ? (e.details as { campi?: Record<string, string> } | null)?.campi : undefined;
      if (campi) setErrori(campi as Partial<Record<keyof Valori, string>>);
      setErroreGenerale(messaggioErrore(e));
      if (!(e instanceof ApiError) || e.code === 'RETE') avvisa('errore', messaggioErrore(e));
    } finally {
      setInCorso(false);
    }
  };

  const svuota = () => { setV((x) => ({ ...vuoti(x.catalogo_id), data: x.data })); setErrori({}); setErroreGenerale(''); primoRef.current?.focus(); };

  const nessunPremio = dati!.premi.filter((p) => p.catalogo_id === v.catalogo_id).length === 0;

  return (
    <form ref={formRef} noValidate onSubmit={(e) => { e.preventDefault(); void salva(); }}
      onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); void salva(); } }}>
      <fieldset className="mb-4">
        <legend className="label">Catalogo</legend>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Catalogo">
          {cataloghiAttivi.map((c) => (
            <button type="button" key={c.id} role="radio" aria-checked={v.catalogo_id === c.id} id={v.catalogo_id === c.id ? 'op-catalogo_id' : undefined}
              onClick={() => cambiaCatalogo(c.id)}
              className={`rounded-md border px-4 py-1.5 font-semibold ${v.catalogo_id === c.id ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}`}>
              {c.codice}
            </button>
          ))}
        </div>
        {errori.catalogo_id && <p className="mt-1 text-sm text-red-700">{errori.catalogo_id}</p>}
      </fieldset>

      <div className="grid grid-cols-12 gap-x-4 gap-y-3">
        <Campo etichetta={tipo === 'trasferimento' ? 'Data trasferimento' : 'Data reso'} per="op-data" obbligatorio errore={errori.data} className="col-span-3">
          <input id="op-data" type="date" className={`input ${errori.data ? 'input-errore' : ''}`} value={v.data} onChange={(e) => set('data', e.target.value)} />
        </Campo>
        <Campo etichetta={tipo === 'trasferimento' ? 'Riferimento / documento' : 'Numero documento'} per="op-riferimento" className="col-span-3">
          <input id="op-riferimento" className="input" value={v.riferimento} maxLength={100} onChange={(e) => set('riferimento', e.target.value)} />
        </Campo>
        <Campo etichetta="Causale" per="op-causale" errore={errori.causale} className="col-span-6">
          <select id="op-causale" className="input" value={v.causale} onChange={(e) => set('causale', e.target.value)}>
            <option value="">— nessuna —</option>
            {elencoCausali.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </Campo>

        {tipo === 'trasferimento' ? (
          <>
            <Campo etichetta="PDV di origine" per="op-pdv_origine_id" obbligatorio errore={errori.pdv_origine_id} className="col-span-6 md:col-span-5">
              <Combobox id="op-pdv_origine_id" opzioni={opzioniPdv} valore={v.pdv_origine_id} onChange={(id) => set('pdv_origine_id', id)}
                errore={!!errori.pdv_origine_id} inputRef={primoRef} autoFocus={!modifica} vuoto="Nessun PDV attivo trovato" />
            </Campo>
            <div className="col-span-12 -my-2 flex items-end justify-center md:col-span-2 md:my-0 md:pb-0.5">
              <button type="button" className="btn-secondario" title="Inverti origine e destinazione" aria-label="Inverti origine e destinazione"
                onClick={() => setV((x) => ({ ...x, pdv_origine_id: x.pdv_destinazione_id, pdv_destinazione_id: x.pdv_origine_id }))}><LuArrowLeftRight /></button>
            </div>
            <Campo etichetta="PDV di destinazione" per="op-pdv_destinazione_id" obbligatorio errore={errori.pdv_destinazione_id} className="col-span-6 md:col-span-5">
              <Combobox id="op-pdv_destinazione_id" opzioni={opzioniPdv.filter((o) => o.id !== v.pdv_origine_id)} valore={v.pdv_destinazione_id}
                onChange={(id) => set('pdv_destinazione_id', id)} errore={!!errori.pdv_destinazione_id} vuoto="Nessun PDV attivo trovato" />
            </Campo>
          </>
        ) : (
          <Campo etichetta="Punto vendita che rende" per="op-pdv_id" obbligatorio errore={errori.pdv_id} className="col-span-12">
            <Combobox id="op-pdv_id" opzioni={opzioniPdv} valore={v.pdv_id} onChange={(id) => set('pdv_id', id)} errore={!!errori.pdv_id}
              inputRef={primoRef} autoFocus={!modifica && !trasferimentoIniziale} vuoto="Nessun PDV attivo trovato" />
          </Campo>
        )}

        <Campo etichetta="Premio" per="op-premio_id" obbligatorio errore={errori.premio_id} className="col-span-9"
          aiuto={nessunPremio ? <span className="text-amber-700">Il catalogo selezionato non contiene premi: aggiungili in Cataloghi premi.</span> : undefined}>
          <Combobox id="op-premio_id" opzioni={opzioniPremi} valore={v.premio_id} errore={!!errori.premio_id} inputRef={premioRef}
            onChange={(id) => { set('premio_id', id); if (v.trasferimento_id && mappe.trasferimenti.get(v.trasferimento_id)?.premio_id !== id) set('trasferimento_id', ''); }}
            vuoto="Nessun premio attivo in questo catalogo" />
        </Campo>
        <Campo etichetta="Quantità" per="op-quantita" obbligatorio errore={errori.quantita} className="col-span-3">
          <input id="op-quantita" className={`input text-right text-base font-semibold ${errori.quantita ? 'input-errore' : ''}`} inputMode="numeric" autoComplete="off"
            value={v.quantita} onChange={(e) => set('quantita', e.target.value.replace(/[^\d]/g, ''))} placeholder="0" />
        </Campo>

        {tipo === 'reso' && (
          <Campo etichetta="Collega a un trasferimento (facoltativo)" per="op-trasferimento_id" errore={errori.trasferimento_id} className="col-span-12"
            aiuto={<span className="inline-flex items-center gap-1"><LuLink size={12} /> Un reso può anche non essere collegato. Scegliendo un trasferimento, premio e PDV vengono compilati in automatico.</span>}>
            <Combobox id="op-trasferimento_id" opzioni={opzioniTrasferimenti} valore={v.trasferimento_id} onChange={scegliTrasferimento}
              segnaposto="Cerca per numero, data o PDV…" errore={!!errori.trasferimento_id} vuoto="Nessun trasferimento valido per questo catalogo e premio" />
          </Campo>
        )}

        <Campo etichetta="Note" per="op-note" className="col-span-12">
          <input id="op-note" className="input" value={v.note} maxLength={1000} onChange={(e) => set('note', e.target.value)} />
        </Campo>
      </div>

      {erroreGenerale && <p className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-red-800" role="alert">{erroreGenerale}</p>}

      <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-slate-200 pt-4">
        <button type="submit" className="btn-primario btn-grande" disabled={inCorso}>
          {inCorso ? 'Salvataggio…' : modifica ? 'Salva modifiche' : tipo === 'trasferimento' ? 'Registra trasferimento' : 'Registra reso'}
        </button>
        <span className="text-xs text-slate-500">oppure <kbd className="rounded border border-slate-300 bg-slate-50 px-1">Ctrl</kbd>+<kbd className="rounded border border-slate-300 bg-slate-50 px-1">Invio</kbd></span>
        {!modifica && (
          <>
            <label className="ml-auto inline-flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={mantieni} onChange={(e) => { setMantieni(e.target.checked); salvaPref('mantieni-pdv', e.target.checked ? '1' : '0'); }} />
              Dopo il salvataggio mantieni PDV, riferimento e causale
            </label>
            <button type="button" className="btn-testo" onClick={svuota}><LuEraser /> Svuota</button>
          </>
        )}
        {modifica && onAnnulla && <button type="button" className="btn-secondario" onClick={onAnnulla}>Annulla</button>}
      </div>
    </form>
  );
}
