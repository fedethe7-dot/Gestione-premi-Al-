import { useMemo, useState } from 'react';
import { LuFileDown, LuPencil, LuPlus, LuSearch, LuUpload } from 'react-icons/lu';
import { AttivoBadge, Campo, Intestazione, Paginazione, scaricaCsv, Th, usePagine, useOrdinamento, Vuoto } from '../components/comuni.tsx';
import { CAMPI_PREMI, ImportaCsv } from '../components/ImportaCsv.tsx';
import { Modale } from '../components/Modale.tsx';
import { messaggioErrore } from '../lib/api.ts';
import { leggiPref, salvaPref } from '../lib/config.ts';
import { colonnePremi } from '../lib/esportazioni.ts';
import { corrisponde, dataIt, normalizza } from '../lib/format.ts';
import type { Catalogo, Premio } from '../lib/types.ts';
import { useDati } from '../state/dati.tsx';
import { useUi } from '../state/ui.tsx';

export const chiavePremio = (r: { codice?: string; descrizione?: string }) =>
  (r.codice ?? '').trim() ? 'c:' + normalizza(r.codice ?? '') : 'd:' + normalizza(r.descrizione ?? '');

export function PaginaCataloghi() {
  const { dati, operazioni, cataloghiOrdinati, mappe, cfg, ricarica } = useDati();
  const { avvisa } = useUi();
  const [catId, setCatId] = useState(() => {
    const p = leggiPref('catalogo-elenco');
    return cataloghiOrdinati.some((c) => c.id === p) ? p : cataloghiOrdinati[cataloghiOrdinati.length - 1]?.id ?? '';
  });
  const [cerca, setCerca] = useState('');
  const [stato, setStato] = useState<'tutti' | 'SI' | 'NO'>('tutti');
  const [modPremio, setModPremio] = useState<Partial<Premio> | null>(null);
  const [modCat, setModCat] = useState<Partial<Catalogo> | null>(null);
  const [importa, setImporta] = useState(false);
  const cat = mappe.cataloghi.get(catId);
  const scegli = (id: string) => { setCatId(id); salvaPref('catalogo-elenco', id); };

  const movimenti = useMemo(() => {
    const m = new Map<string, number>();
    for (const o of operazioni) if (o.stato === 'valido') m.set(o.premioId, (m.get(o.premioId) ?? 0) + 1);
    return m;
  }, [operazioni]);

  const delCatalogo = useMemo(() => dati!.premi.filter((p) => p.catalogo_id === catId), [dati, catId]);
  const filtrati = useMemo(() => delCatalogo.filter((p) =>
    (stato === 'tutti' || p.attivo === stato) && corrisponde(`${p.codice} ${p.descrizione} ${p.categoria}`, cerca)), [delCatalogo, cerca, stato]);
  const { ordinate, ordine, cambia } = useOrdinamento(filtrati, { chiave: 'codice', dir: 'asc' }, {
    codice: (p) => p.codice, descrizione: (p) => p.descrizione, categoria: (p) => p.categoria, mov: (p) => movimenti.get(p.id) ?? 0,
  });
  const pag = usePagine(ordinate, 50);

  return (
    <div>
      <Intestazione titolo="Cataloghi premi" sottotitolo="Ogni stagione ha il suo catalogo: le operazioni usano solo i premi del catalogo scelto."
        azioni={<button className="btn-secondario" onClick={() => setModCat({ attivo: 'SI' })}><LuPlus /> Nuovo catalogo</button>} />

      <div className="mb-4 flex flex-wrap gap-2" role="tablist" aria-label="Cataloghi">
        {cataloghiOrdinati.map((c) => (
          <button key={c.id} role="tab" aria-selected={c.id === catId} onClick={() => scegli(c.id)}
            className={`rounded-lg border px-4 py-2 text-left ${c.id === catId ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-300 bg-white hover:bg-slate-50'}`}>
            <div className="font-semibold">{c.codice}</div>
            <div className={`text-xs ${c.id === catId ? 'text-brand-100' : 'text-slate-500'}`}>
              {dati!.premi.filter((p) => p.catalogo_id === c.id).length} premi{c.attivo === 'NO' ? ' · non attivo' : ''}
            </div>
          </button>
        ))}
      </div>

      {cat && (
        <div className="card">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-3">
            <div>
              <div className="flex items-center gap-2 text-lg font-semibold">{cat.nome} <AttivoBadge attivo={cat.attivo} />
                <button className="btn-testo px-1.5 py-1" onClick={() => setModCat(cat)} aria-label="Modifica catalogo"><LuPencil /></button></div>
              {(cat.data_inizio || cat.data_fine) && <div className="text-sm text-slate-500">Periodo: {dataIt(cat.data_inizio) || '…'} – {dataIt(cat.data_fine) || '…'}</div>}
            </div>
            <div className="flex flex-wrap gap-2">
              <button className="btn-secondario" onClick={() => setImporta(true)}><LuUpload /> Importa CSV in {cat.codice}</button>
              <button className="btn-secondario" disabled={!delCatalogo.length}
                onClick={() => { const n = scaricaCsv(`catalogo-${cat.codice.replace('/', '-')}`, ordinate, colonnePremi(mappe.cataloghi), cfg.separatore); avvisa('successo', `Esportati ${n} premi.`); }}><LuFileDown /> Esporta catalogo</button>
              <button className="btn-primario" onClick={() => setModPremio({ catalogo_id: cat.id, attivo: 'SI' })}><LuPlus /> Nuovo premio</button>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 p-3">
            <div className="relative min-w-64 flex-1">
              <LuSearch className="absolute top-2.5 left-2.5 text-slate-400" aria-hidden />
              <input className="input pl-8" placeholder="Cerca per codice o descrizione…" value={cerca} onChange={(e) => setCerca(e.target.value)} aria-label="Cerca premi" />
            </div>
            <select className="input w-44" value={stato} onChange={(e) => setStato(e.target.value as 'tutti')} aria-label="Filtra per stato">
              <option value="tutti">Tutti</option><option value="SI">Solo attivi</option><option value="NO">Solo non attivi</option>
            </select>
          </div>
          {delCatalogo.length === 0 ? (
            <Vuoto>Il catalogo {cat.codice} è vuoto. Importa i premi da un file CSV oppure aggiungili uno alla volta.</Vuoto>
          ) : (
            <div className="overflow-x-auto">
              <table className="tabella">
                <thead><tr>
                  <Th chiave="codice" ordine={ordine} cambia={cambia}>Codice</Th>
                  <Th chiave="descrizione" ordine={ordine} cambia={cambia}>Descrizione</Th>
                  <Th chiave="categoria" ordine={ordine} cambia={cambia}>Categoria</Th>
                  <th>Stato</th>
                  <Th chiave="mov" ordine={ordine} cambia={cambia} num>Operazioni</Th>
                  <th />
                </tr></thead>
                <tbody>
                  {pag.visibili.map((p) => (
                    <tr key={p.id} className={p.attivo === 'SI' ? '' : 'text-slate-400'}>
                      <td className="font-mono text-xs">{p.codice || <span className="text-slate-400">—</span>}</td>
                      <td>{p.descrizione}{p.note && <div className="text-xs text-slate-500">{p.note}</div>}</td>
                      <td>{p.categoria}</td>
                      <td><AttivoBadge attivo={p.attivo} /></td>
                      <td className="num">{movimenti.get(p.id) ?? 0}</td>
                      <td className="text-right"><button className="btn-testo px-2 py-1" onClick={() => setModPremio(p)} aria-label={`Modifica ${p.descrizione}`}><LuPencil /> Modifica</button></td>
                    </tr>
                  ))}
                  {pag.visibili.length === 0 && <tr><td colSpan={6}><Vuoto>Nessun premio corrisponde alla ricerca.</Vuoto></td></tr>}
                </tbody>
              </table>
            </div>
          )}
          <Paginazione {...pag} />
        </div>
      )}

      {modPremio && cat && <FormPremio iniziale={modPremio} catalogo={mappe.cataloghi.get(modPremio.catalogo_id ?? '') ?? cat} chiudi={() => setModPremio(null)} />}
      {modCat && <FormCatalogo iniziale={modCat} chiudi={(nuovo) => { setModCat(null); if (nuovo) scegli(nuovo); }} />}
      {importa && cat && (
        <ImportaCsv titolo={`Importa premi nel catalogo ${cat.codice}`} campi={CAMPI_PREMI} azione="importPremi" payloadExtra={{ catalogo_id: cat.id }}
          chiave={chiavePremio} esistenti={new Set(delCatalogo.map(chiavePremio))}
          chiudi={() => setImporta(false)} onCompletato={() => { void ricarica(true); }} />
      )}
    </div>
  );
}

function FormPremio({ iniziale, catalogo, chiudi }: { iniziale: Partial<Premio>; catalogo: Catalogo; chiudi: () => void }) {
  const { api, aggiorna } = useDati();
  const { avvisa } = useUi();
  const [f, setF] = useState<Partial<Premio>>(iniziale);
  const [errore, setErrore] = useState('');
  const [errDesc, setErrDesc] = useState('');
  const [inCorso, setInCorso] = useState(false);
  const set = (k: keyof Premio) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const salva = async () => {
    setErrore(''); setErrDesc('');
    if (!f.descrizione?.trim()) { setErrDesc('Obbligatoria.'); return; }
    setInCorso(true);
    try {
      const r = await api<Premio>('savePremio', { ...f, catalogo_id: catalogo.id, atteso_modificato_il: iniziale.modificato_il });
      aggiorna('premi', r);
      avvisa('successo', iniziale.id ? 'Premio aggiornato.' : `Premio aggiunto al catalogo ${catalogo.codice}.`);
      chiudi();
    } catch (e) { setErrore(messaggioErrore(e)); } finally { setInCorso(false); }
  };
  return (
    <Modale titolo={iniziale.id ? 'Modifica premio' : `Nuovo premio — catalogo ${catalogo.codice}`} chiudi={chiudi}>
      <form noValidate className="grid grid-cols-2 gap-4" onSubmit={(e) => { e.preventDefault(); void salva(); }}>
        <p className="col-span-2 rounded-md bg-brand-50 px-3 py-2 text-brand-700">Catalogo: <b>{catalogo.nome}</b></p>
        <Campo etichetta="Codice premio" per="premio-codice" aiuto="Facoltativo, ma consigliato. Deve essere unico nel catalogo.">
          <input id="premio-codice" className="input font-mono" value={f.codice ?? ''} onChange={set('codice')} maxLength={40} autoFocus />
        </Campo>
        <Campo etichetta="Categoria" per="premio-cat"><input id="premio-cat" className="input" value={f.categoria ?? ''} onChange={set('categoria')} maxLength={80} /></Campo>
        <Campo etichetta="Descrizione" per="premio-desc" obbligatorio errore={errDesc} className="col-span-2">
          <input id="premio-desc" className="input" value={f.descrizione ?? ''} onChange={set('descrizione')} maxLength={200} />
        </Campo>
        <Campo etichetta="Note" per="premio-note" className="col-span-2"><textarea id="premio-note" className="input" rows={2} value={f.note ?? ''} onChange={set('note')} maxLength={1000} /></Campo>
        <label className="col-span-2 inline-flex items-center gap-2">
          <input type="checkbox" checked={f.attivo !== 'NO'} onChange={(e) => setF({ ...f, attivo: e.target.checked ? 'SI' : 'NO' })} />
          Attivo (i premi non attivi restano nello storico ma non si possono scegliere per nuove operazioni)
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

function FormCatalogo({ iniziale, chiudi }: { iniziale: Partial<Catalogo>; chiudi: (nuovoId?: string) => void }) {
  const { api, aggiorna } = useDati();
  const { avvisa } = useUi();
  const [f, setF] = useState<Partial<Catalogo>>(iniziale);
  const [errore, setErrore] = useState('');
  const [inCorso, setInCorso] = useState(false);
  const set = (k: keyof Catalogo) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const salva = async () => {
    setInCorso(true); setErrore('');
    try {
      const r = await api<Catalogo>('saveCatalogo', f);
      aggiorna('cataloghi', r);
      avvisa('successo', 'Catalogo salvato.');
      chiudi(iniziale.id ? undefined : r.id);
    } catch (e) { setErrore(messaggioErrore(e)); } finally { setInCorso(false); }
  };
  return (
    <Modale titolo={iniziale.id ? `Modifica catalogo ${iniziale.codice}` : 'Nuovo catalogo (nuova stagione)'} chiudi={() => chiudi()} larghezza="max-w-lg">
      <form noValidate className="grid grid-cols-2 gap-4" onSubmit={(e) => { e.preventDefault(); void salva(); }}>
        <Campo etichetta="Stagione" per="cat-codice" obbligatorio aiuto="Es. 2027/2028">
          <input id="cat-codice" className="input" value={f.codice ?? ''} maxLength={20} autoFocus
            onChange={(e) => setF({ ...f, codice: e.target.value, nome: !iniziale.id && (!f.nome || f.nome === `Catalogo premi ${f.codice ?? ''}`) ? `Catalogo premi ${e.target.value}` : f.nome })} />
        </Campo>
        <Campo etichetta="Nome" per="cat-nome" obbligatorio><input id="cat-nome" className="input" value={f.nome ?? ''} onChange={set('nome')} maxLength={100} /></Campo>
        <Campo etichetta="Inizio stagione" per="cat-inizio" aiuto="Facoltativo: crea un filtro rapido nelle statistiche."><input id="cat-inizio" type="date" className="input" value={f.data_inizio ?? ''} onChange={set('data_inizio')} /></Campo>
        <Campo etichetta="Fine stagione" per="cat-fine"><input id="cat-fine" type="date" className="input" value={f.data_fine ?? ''} onChange={set('data_fine')} /></Campo>
        <label className="col-span-2 inline-flex items-center gap-2">
          <input type="checkbox" checked={f.attivo !== 'NO'} onChange={(e) => setF({ ...f, attivo: e.target.checked ? 'SI' : 'NO' })} />
          Attivo (selezionabile per nuove operazioni)
        </label>
        {errore && <p className="col-span-2 text-red-700">{errore}</p>}
        <div className="col-span-2 flex justify-end gap-2">
          <button type="button" className="btn-secondario" onClick={() => chiudi()}>Annulla</button>
          <button className="btn-primario" disabled={inCorso || !f.codice?.trim() || !f.nome?.trim()}>{inCorso ? 'Salvataggio…' : 'Salva'}</button>
        </div>
      </form>
    </Modale>
  );
}
