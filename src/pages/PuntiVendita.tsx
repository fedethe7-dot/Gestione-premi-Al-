import { useMemo, useState } from 'react';
import { LuFileDown, LuPencil, LuPlus, LuSearch, LuTriangleAlert, LuUpload } from 'react-icons/lu';
import { AttivoBadge, Campo, Intestazione, Paginazione, scaricaCsv, Th, usePagine, useOrdinamento, Vuoto } from '../components/comuni.tsx';
import { CAMPI_PDV, ImportaCsv } from '../components/ImportaCsv.tsx';
import { Modale } from '../components/Modale.tsx';
import { messaggioErrore } from '../lib/api.ts';
import { colonnePdv } from '../lib/esportazioni.ts';
import { corrisponde, isEmail, normalizza } from '../lib/format.ts';
import type { Pdv } from '../lib/types.ts';
import { useDati } from '../state/dati.tsx';
import { useUi } from '../state/ui.tsx';

export function PaginaPdv() {
  const { dati, operazioni, cfg, ricarica } = useDati();
  const { avvisa } = useUi();
  const [cerca, setCerca] = useState('');
  const [stato, setStato] = useState<'tutti' | 'SI' | 'NO'>('tutti');
  const [modifica, setModifica] = useState<Partial<Pdv> | null>(null);
  const [importa, setImporta] = useState(false);
  const pdv = dati!.pdv;

  const conteggio = useMemo(() => {
    const m = new Map<string, number>();
    for (const o of operazioni) for (const id of [o.pdvOrigineId, o.pdvDestId, o.pdvResoId]) if (id) m.set(id, (m.get(id) ?? 0) + 1);
    return m;
  }, [operazioni]);

  const filtrati = useMemo(() => pdv.filter((p) =>
    (stato === 'tutti' || p.attivo === stato) && corrisponde(`${p.codice} ${p.nome} ${p.citta} ${p.email} ${p.email2}`, cerca)), [pdv, cerca, stato]);
  const { ordinate, ordine, cambia } = useOrdinamento(filtrati, { chiave: 'codice', dir: 'asc' }, {
    codice: (p) => p.codice, nome: (p) => p.nome, citta: (p) => p.citta, email: (p) => p.email, op: (p) => conteggio.get(p.id) ?? 0,
  });
  const pag = usePagine(ordinate, 50);
  const senzaEmail = pdv.filter((p) => p.attivo === 'SI' && !p.email).length;

  return (
    <div>
      <Intestazione titolo="Punti vendita" sottotitolo={pdv.length === 1 ? '1 punto vendita in archivio' : `${pdv.length} punti vendita in archivio`}
        azioni={<>
          <button className="btn-secondario" onClick={() => setImporta(true)}><LuUpload /> Importa CSV</button>
          <button className="btn-secondario" disabled={!pdv.length} onClick={() => { const n = scaricaCsv('punti-vendita', ordinate, colonnePdv, cfg.separatore); avvisa('successo', `Esportati ${n} punti vendita.`); }}><LuFileDown /> Esporta CSV</button>
          <button className="btn-primario" onClick={() => setModifica({ attivo: 'SI' })}><LuPlus /> Nuovo PDV</button>
        </>} />

      {senzaEmail > 0 && (
        <p className="mb-3 flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900">
          <LuTriangleAlert /> {senzaEmail} punti vendita attivi senza e-mail principale: servirà per la futura funzione di invio e-mail.
        </p>
      )}

      <div className="card">
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 p-3">
          <div className="relative min-w-64 flex-1">
            <LuSearch className="absolute top-2.5 left-2.5 text-slate-400" aria-hidden />
            <input className="input pl-8" placeholder="Cerca per codice, nome, città o e-mail…" value={cerca} onChange={(e) => setCerca(e.target.value)} aria-label="Cerca punti vendita" />
          </div>
          <select className="input w-44" value={stato} onChange={(e) => setStato(e.target.value as 'tutti')} aria-label="Filtra per stato">
            <option value="tutti">Tutti</option><option value="SI">Solo attivi</option><option value="NO">Solo non attivi</option>
          </select>
        </div>
        {pdv.length === 0 ? (
          <Vuoto>L'archivio è vuoto. Importa l'elenco dei punti vendita da un file CSV oppure aggiungili uno alla volta.</Vuoto>
        ) : (
          <div className="overflow-x-auto">
            <table className="tabella">
              <thead><tr>
                <Th chiave="codice" ordine={ordine} cambia={cambia}>Codice</Th>
                <Th chiave="nome" ordine={ordine} cambia={cambia}>Nome</Th>
                <Th chiave="citta" ordine={ordine} cambia={cambia}>Città</Th>
                <Th chiave="email" ordine={ordine} cambia={cambia}>E-mail</Th>
                <th>Stato</th>
                <Th chiave="op" ordine={ordine} cambia={cambia} num>Operazioni</Th>
                <th />
              </tr></thead>
              <tbody>
                {pag.visibili.map((p) => (
                  <tr key={p.id} className={p.attivo === 'SI' ? '' : 'text-slate-400'}>
                    <td className="font-mono text-xs">{p.codice}</td>
                    <td>{p.nome}{p.indirizzo && <div className="text-xs text-slate-500">{p.indirizzo}</div>}</td>
                    <td>{p.citta}</td>
                    <td>{p.email || <span className="text-amber-700">mancante</span>}{p.email2 && <div className="text-xs text-slate-500">{p.email2}</div>}</td>
                    <td><AttivoBadge attivo={p.attivo} /></td>
                    <td className="num">{conteggio.get(p.id) ?? 0}</td>
                    <td className="text-right"><button className="btn-testo px-2 py-1" onClick={() => setModifica(p)} aria-label={`Modifica ${p.nome}`}><LuPencil /> Modifica</button></td>
                  </tr>
                ))}
                {pag.visibili.length === 0 && <tr><td colSpan={7}><Vuoto>Nessun punto vendita corrisponde alla ricerca.</Vuoto></td></tr>}
              </tbody>
            </table>
          </div>
        )}
        <Paginazione {...pag} />
      </div>

      {modifica && <FormPdv iniziale={modifica} chiudi={() => setModifica(null)} />}
      {importa && (
        <ImportaCsv titolo="Importa punti vendita da CSV" campi={CAMPI_PDV} azione="importPdv"
          chiave={(r) => normalizza(r.codice ?? '')} esistenti={new Set(pdv.map((p) => normalizza(p.codice)))}
          chiudi={() => setImporta(false)} onCompletato={() => { void ricarica(true); }} />
      )}
    </div>
  );
}

function FormPdv({ iniziale, chiudi }: { iniziale: Partial<Pdv>; chiudi: () => void }) {
  const { api, aggiorna } = useDati();
  const { avvisa } = useUi();
  const [f, setF] = useState<Partial<Pdv>>(iniziale);
  const [errori, setErrori] = useState<Record<string, string>>({});
  const [errore, setErrore] = useState('');
  const [inCorso, setInCorso] = useState(false);
  const set = (k: keyof Pdv) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  const salva = async () => {
    const e: Record<string, string> = {};
    if (!f.codice?.trim()) e.codice = 'Obbligatorio.';
    if (!f.nome?.trim()) e.nome = 'Obbligatorio.';
    if (f.email && !isEmail(f.email.trim())) e.email = 'Formato non valido.';
    if (f.email2 && !isEmail(f.email2.trim())) e.email2 = 'Formato non valido.';
    setErrori(e); setErrore('');
    if (Object.keys(e).length) return;
    setInCorso(true);
    try {
      const r = await api<Pdv>('savePdv', { ...f, atteso_modificato_il: iniziale.modificato_il });
      aggiorna('pdv', r);
      avvisa('successo', iniziale.id ? 'Punto vendita aggiornato.' : `Punto vendita ${r.codice} creato.`);
      chiudi();
    } catch (err) { setErrore(messaggioErrore(err)); } finally { setInCorso(false); }
  };

  return (
    <Modale titolo={iniziale.id ? `Modifica punto vendita ${iniziale.codice}` : 'Nuovo punto vendita'} chiudi={chiudi}>
      <form noValidate className="grid grid-cols-2 gap-4" onSubmit={(e) => { e.preventDefault(); void salva(); }}>
        <Campo etichetta="Codice PDV" per="pdv-codice" obbligatorio errore={errori.codice}>
          <input id="pdv-codice" className="input font-mono" value={f.codice ?? ''} onChange={set('codice')} maxLength={40} autoFocus />
        </Campo>
        <Campo etichetta="Nome" per="pdv-nome" obbligatorio errore={errori.nome}>
          <input id="pdv-nome" className="input" value={f.nome ?? ''} onChange={set('nome')} maxLength={150} />
        </Campo>
        <Campo etichetta="Indirizzo" per="pdv-indirizzo"><input id="pdv-indirizzo" className="input" value={f.indirizzo ?? ''} onChange={set('indirizzo')} maxLength={200} /></Campo>
        <Campo etichetta="Città" per="pdv-citta"><input id="pdv-citta" className="input" value={f.citta ?? ''} onChange={set('citta')} maxLength={100} /></Campo>
        <Campo etichetta="E-mail principale" per="pdv-email" errore={errori.email}><input id="pdv-email" type="email" className="input" value={f.email ?? ''} onChange={set('email')} maxLength={150} /></Campo>
        <Campo etichetta="E-mail secondaria" per="pdv-email2" errore={errori.email2}><input id="pdv-email2" type="email" className="input" value={f.email2 ?? ''} onChange={set('email2')} maxLength={150} /></Campo>
        <Campo etichetta="Note" per="pdv-note" className="col-span-2"><textarea id="pdv-note" className="input" rows={2} value={f.note ?? ''} onChange={set('note')} maxLength={1000} /></Campo>
        <label className="col-span-2 inline-flex items-center gap-2">
          <input type="checkbox" checked={f.attivo !== 'NO'} onChange={(e) => setF({ ...f, attivo: e.target.checked ? 'SI' : 'NO' })} />
          Attivo (i PDV non attivi restano nello storico ma non si possono scegliere per nuove operazioni)
        </label>
        {errore && <p className="col-span-2 text-red-700">{errore}</p>}
        <div className="col-span-2 flex justify-end gap-2">
          <button type="button" className="btn-secondario" onClick={chiudi}>Annulla</button>
          <button className="btn-primario" disabled={inCorso}>{inCorso ? 'Salvataggio…' : 'Salva'}</button>
        </div>
      </form>
    </Modale>
  );
}
