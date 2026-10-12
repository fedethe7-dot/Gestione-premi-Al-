import { useMemo, useState } from 'react';
import { LuCircleAlert, LuCircleCheck, LuTriangleAlert, LuUpload } from 'react-icons/lu';
import { messaggioErrore } from '../lib/api.ts';
import { decodifica, leggiCsv } from '../lib/csv.ts';
import { isEmail, normalizza, num } from '../lib/format.ts';
import type { EsitoImport } from '../lib/types.ts';
import { useDati } from '../state/dati.tsx';
import { Modale } from './Modale.tsx';

export interface CampoImport { campo: string; etichetta: string; obbligatorio?: boolean; sinonimi: string[] }

export const CAMPI_PDV: CampoImport[] = [
  { campo: 'codice', etichetta: 'Codice PDV', obbligatorio: true, sinonimi: ['codice', 'cod', 'codice pdv', 'cod pdv', 'codice punto vendita', 'codice negozio', 'pdv', 'id'] },
  { campo: 'nome', etichetta: 'Nome', obbligatorio: true, sinonimi: ['nome', 'nome pdv', 'punto vendita', 'negozio', 'ragione sociale', 'denominazione', 'insegna'] },
  { campo: 'indirizzo', etichetta: 'Indirizzo', sinonimi: ['indirizzo', 'via', 'address'] },
  { campo: 'citta', etichetta: 'Città', sinonimi: ['citta', 'comune', 'localita', 'city'] },
  { campo: 'email', etichetta: 'E-mail principale', sinonimi: ['email', 'e-mail', 'mail', 'email principale', 'e-mail principale', 'indirizzo email'] },
  { campo: 'email2', etichetta: 'E-mail secondaria', sinonimi: ['email2', 'email 2', 'e-mail 2', 'mail 2', 'email secondaria', 'e-mail secondaria'] },
  { campo: 'note', etichetta: 'Note', sinonimi: ['note', 'nota', 'annotazioni'] },
  { campo: 'attivo', etichetta: 'Attivo (SI/NO)', sinonimi: ['attivo', 'attiva', 'stato'] },
];

export const CAMPI_PREMI: CampoImport[] = [
  { campo: 'codice', etichetta: 'Codice premio', sinonimi: ['codice', 'cod', 'codice premio', 'cod premio', 'codice articolo', 'articolo', 'sku', 'id'] },
  { campo: 'descrizione', etichetta: 'Descrizione', obbligatorio: true, sinonimi: ['descrizione', 'nome', 'premio', 'nome premio', 'descrizione premio', 'denominazione'] },
  { campo: 'categoria', etichetta: 'Categoria', sinonimi: ['categoria', 'tipologia', 'famiglia', 'reparto'] },
  { campo: 'note', etichetta: 'Note', sinonimi: ['note', 'nota'] },
  { campo: 'attivo', etichetta: 'Attivo (SI/NO)', sinonimi: ['attivo', 'attiva', 'stato'] },
];

const VALORI_BOOL = ['si', 'sì', 's', 'true', '1', 'x', 'attivo', 'yes', 'y', 'no', 'n', 'false', '0', 'non attivo', 'inattivo', 'disattivo', ''];

type Riga = Record<string, string> & { _riga: number };
interface Analisi { valide: Riga[]; nuove: number; esistenti: number; errori: { riga: number; motivo: string }[] }

export function ImportaCsv({ titolo, campi, chiave, esistenti, azione, payloadExtra, chiudi, onCompletato }: {
  titolo: string;
  campi: CampoImport[];
  /** Chiave di unicità calcolata da una riga (es. codice normalizzato). */
  chiave: (r: Record<string, string>) => string;
  esistenti: Set<string>;
  azione: 'importPdv' | 'importPremi';
  payloadExtra?: Record<string, string>;
  chiudi: () => void;
  onCompletato: () => void;
}) {
  const { api } = useDati();
  const [file, setFile] = useState<{ nome: string; codifica: string; righe: string[][] } | null>(null);
  const [errFile, setErrFile] = useState('');
  const [mappa, setMappa] = useState<Record<string, number>>({});
  const [modalita, setModalita] = useState<'salta' | 'aggiorna'>('salta');
  const [inCorso, setInCorso] = useState(false);
  const [esito, setEsito] = useState<EsitoImport | null>(null);
  const [errServer, setErrServer] = useState('');

  const intestazioni = file?.righe[0] ?? [];
  const dati = file?.righe.slice(1) ?? [];

  const carica = async (f: File) => {
    setErrFile(''); setEsito(null);
    if (f.size > 10 * 1024 * 1024) { setErrFile('File troppo grande (massimo 10 MB).'); return; }
    const { testo, codifica } = decodifica(await f.arrayBuffer());
    const righe = leggiCsv(testo);
    if (righe.length < 2) { setErrFile('Il file non contiene righe di dati oltre all\'intestazione.'); return; }
    setFile({ nome: f.name, codifica, righe });
    const m: Record<string, number> = {};
    const hdr = righe[0].map((h) => normalizza(h).replace(/[_.]/g, ' '));
    for (const c of campi) {
      const i = hdr.findIndex((h, idx) => c.sinonimi.includes(h) && !Object.values(m).includes(idx));
      if (i >= 0) m[c.campo] = i;
    }
    setMappa(m);
  };

  const analisi: Analisi | null = useMemo(() => {
    if (!file) return null;
    const errori: Analisi['errori'] = [];
    const valide: Riga[] = [];
    const visti = new Map<string, number>();
    let nuove = 0, esist = 0;
    dati.forEach((cols, i) => {
      const riga: Riga = { _riga: i + 2 } as Riga;
      for (const [campo, idx] of Object.entries(mappa)) if (idx >= 0) riga[campo] = (cols[idx] ?? '').trim();
      const motivi: string[] = [];
      for (const c of campi) if (c.obbligatorio && !riga[c.campo]) motivi.push(`${c.etichetta} mancante.`);
      for (const c of ['email', 'email2']) if (riga[c] && !isEmail(riga[c])) motivi.push(`E-mail non valida (${riga[c]}).`);
      if (riga.attivo !== undefined && !VALORI_BOOL.includes(normalizza(riga.attivo))) motivi.push(`Valore "Attivo" non riconosciuto (${riga.attivo}): usa SI o NO.`);
      if (!motivi.length) {
        const k = chiave(riga);
        if (visti.has(k)) motivi.push(`Ripetuto nel file (già alla riga ${visti.get(k)}).`);
        else visti.set(k, riga._riga);
      }
      if (motivi.length) { errori.push({ riga: riga._riga, motivo: motivi.join(' ') }); return; }
      if (esistenti.has(chiave(riga))) esist++; else nuove++;
      valide.push(riga);
    });
    return { valide, nuove, esistenti: esist, errori };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file, mappa]);

  const mancanoObbligatori = campi.some((c) => c.obbligatorio && !(mappa[c.campo] >= 0));

  const importa = async () => {
    if (!analisi) return;
    setInCorso(true); setErrServer('');
    try {
      // I campi non associati non vengono inviati: in aggiornamento restano invariati.
      const r = await api<EsitoImport>(azione, { ...payloadExtra, modalita, righe: analisi.valide });
      setEsito({ ...r, errori: [...analisi.errori, ...r.errori].sort((a, b) => a.riga - b.riga) });
      onCompletato();
    } catch (e) { setErrServer(messaggioErrore(e)); } finally { setInCorso(false); }
  };

  return (
    <Modale titolo={titolo} chiudi={chiudi} larghezza="max-w-5xl">
      {esito ? (
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-lg font-semibold text-emerald-800"><LuCircleCheck /> Importazione completata</div>
          <div className="grid grid-cols-4 gap-3 text-center">
            {[['Inseriti', esito.inseriti], ['Aggiornati', esito.aggiornati], ['Già presenti, saltati', esito.saltati], ['Righe scartate', esito.errori.length]].map(([t, v]) => (
              <div key={t as string} className="card p-3"><div className="text-2xl font-semibold">{num(v as number)}</div><div className="text-xs text-slate-500">{t}</div></div>
            ))}
          </div>
          {esito.errori.length > 0 && <ElencoErrori errori={esito.errori} />}
          <div className="flex justify-end"><button className="btn-primario" onClick={chiudi}>Chiudi</button></div>
        </div>
      ) : !file ? (
        <div>
          <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-slate-300 px-6 py-12 text-center hover:border-brand-500 hover:bg-brand-50/40"
            onDragOver={(e: { preventDefault(): void }) => e.preventDefault()}
            onDrop={(e: { preventDefault(): void; dataTransfer: DataTransfer }) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) void carica(f); }}>
            <LuUpload size={28} className="text-slate-400" />
            <span className="font-medium">Scegli un file CSV o trascinalo qui</span>
            <span className="text-sm text-slate-500">Prima riga con le intestazioni. Separatore ; o , riconosciuto in automatico. Va bene anche il CSV salvato da Excel.</span>
            <input type="file" accept=".csv,.txt,text/csv" className="sr-only" aria-label="File CSV da importare"
              onChange={(e: { target: HTMLInputElement }) => { const f = e.target.files?.[0]; if (f) void carica(f); }} />
          </label>
          {errFile && <p className="mt-3 text-red-700">{errFile}</p>}
          <p className="mt-3 text-sm text-slate-500">Campi riconosciuti: {campi.map((c) => c.etichetta + (c.obbligatorio ? ' *' : '')).join(', ')}.</p>
        </div>
      ) : (
        <div className="space-y-5">
          <div className="text-sm text-slate-600">File <b>{file.nome}</b> · {num(dati.length)} righe di dati · codifica {file.codifica}
            <button className="ml-2 text-brand-600 underline" onClick={() => setFile(null)}>cambia file</button></div>

          <section>
            <h3 className="mb-2 font-semibold">1. Associa le colonne del file ai campi</h3>
            <div className="grid grid-cols-2 gap-x-6 gap-y-2 md:grid-cols-4">
              {campi.map((c) => (
                <div key={c.campo}>
                  <label className="label" htmlFor={'map-' + c.campo}>{c.etichetta}{c.obbligatorio && <span className="text-red-600"> *</span>}</label>
                  <select id={'map-' + c.campo} className={`input ${c.obbligatorio && !(mappa[c.campo] >= 0) ? 'input-errore' : ''}`}
                    value={mappa[c.campo] ?? -1} onChange={(e) => setMappa({ ...mappa, [c.campo]: Number(e.target.value) })}>
                    <option value={-1}>— non importare —</option>
                    {intestazioni.map((h, i) => <option key={i} value={i}>{h || `Colonna ${i + 1}`}</option>)}
                  </select>
                </div>
              ))}
            </div>
          </section>

          <section>
            <h3 className="mb-2 font-semibold">2. Anteprima (prime 8 righe)</h3>
            <div className="max-h-64 overflow-auto rounded-md border border-slate-200">
              <table className="tabella">
                <thead><tr><th>Riga</th>{campi.filter((c) => mappa[c.campo] >= 0).map((c) => <th key={c.campo}>{c.etichetta}</th>)}</tr></thead>
                <tbody>
                  {dati.slice(0, 8).map((r, i) => (
                    <tr key={i}><td className="text-slate-400">{i + 2}</td>{campi.filter((c) => mappa[c.campo] >= 0).map((c) => <td key={c.campo}>{r[mappa[c.campo]]}</td>)}</tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {analisi && !mancanoObbligatori && (
            <section>
              <h3 className="mb-2 font-semibold">3. Riepilogo prima di confermare</h3>
              <div className="grid grid-cols-3 gap-3">
                <div className="card p-3"><div className="text-2xl font-semibold text-emerald-700">{num(analisi.nuove)}</div><div className="text-xs text-slate-500">Nuovi da inserire</div></div>
                <div className="card p-3"><div className="text-2xl font-semibold text-amber-700">{num(analisi.esistenti)}</div><div className="text-xs text-slate-500">Già presenti nel gestionale</div></div>
                <div className="card p-3"><div className="text-2xl font-semibold text-red-700">{num(analisi.errori.length)}</div><div className="text-xs text-slate-500">Righe con errori (verranno scartate)</div></div>
              </div>
              {analisi.esistenti > 0 && (
                <fieldset className="mt-3 rounded-md border border-amber-300 bg-amber-50 p-3">
                  <legend className="px-1 text-sm font-semibold text-amber-900">Cosa fare con i {analisi.esistenti} già presenti?</legend>
                  <label className="mr-6 inline-flex items-center gap-2"><input type="radio" name="modalita" checked={modalita === 'salta'} onChange={() => setModalita('salta')} /> Lasciali invariati (consigliato)</label>
                  <label className="inline-flex items-center gap-2"><input type="radio" name="modalita" checked={modalita === 'aggiorna'} onChange={() => setModalita('aggiorna')} /> Aggiorna i loro dati con quelli del file</label>
                  {modalita === 'aggiorna' && <p className="mt-1 text-sm text-amber-900">Verranno sovrascritti solo i campi associati qui sopra; quelli non importati restano com'erano. Le operazioni già registrate mantengono i nomi storici.</p>}
                </fieldset>
              )}
              {analisi.errori.length > 0 && <div className="mt-3"><ElencoErrori errori={analisi.errori} /></div>}
            </section>
          )}
          {mancanoObbligatori && <p className="flex items-center gap-2 text-red-700"><LuTriangleAlert /> Associa tutti i campi obbligatori (*) per continuare.</p>}
          {errServer && <p className="flex items-center gap-2 text-red-700"><LuCircleAlert /> {errServer}</p>}

          <div className="flex justify-end gap-2 border-t border-slate-200 pt-4">
            <button className="btn-secondario" onClick={chiudi}>Annulla</button>
            <button className="btn-primario" disabled={inCorso || mancanoObbligatori || !analisi || (analisi.nuove === 0 && (modalita === 'salta' || analisi.esistenti === 0))}
              onClick={importa}>
              {inCorso ? 'Importazione in corso…' : `Conferma importazione (${num(analisi ? analisi.nuove + (modalita === 'aggiorna' ? analisi.esistenti : 0) : 0)} righe)`}
            </button>
          </div>
        </div>
      )}
    </Modale>
  );
}

function ElencoErrori({ errori }: { errori: { riga: number; motivo: string }[] }) {
  return (
    <div className="max-h-48 overflow-auto rounded-md border border-red-200 bg-red-50">
      <table className="tabella">
        <thead><tr><th className="!bg-red-100">Riga del file</th><th className="!bg-red-100">Problema</th></tr></thead>
        <tbody>{errori.map((e, i) => <tr key={i}><td className="w-28">{e.riga}</td><td>{e.motivo}</td></tr>)}</tbody>
      </table>
    </div>
  );
}
