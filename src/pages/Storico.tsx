import { Fragment, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { LuBan, LuFileDown, LuFilter, LuPencil, LuRotateCcw, LuSearch, LuUndo2, LuX } from 'react-icons/lu';
import { Combobox, type Opzione } from '../components/Combobox.tsx';
import { Intestazione, Paginazione, Rotella, scaricaCsv, StatoBadge, TipoBadge, usePagine, Vuoto } from '../components/comuni.tsx';
import { FormOperazione } from '../components/FormOperazione.tsx';
import { Modale } from '../components/Modale.tsx';
import { messaggioErrore } from '../lib/api.ts';
import { colonneStorico } from '../lib/esportazioni.ts';
import { corrisponde, dataIt, dataOraIt, num } from '../lib/format.ts';
import { confrontaOp } from '../lib/operazioni.ts';
import { vai } from '../lib/rotta.ts';
import type { Operazione, VoceRegistro } from '../lib/types.ts';
import { useAzioniOperazione } from '../state/azioni.tsx';
import { useDati } from '../state/dati.tsx';
import { useUi } from '../state/ui.tsx';

interface Filtri {
  testo: string; tipo: '' | 'trasferimento' | 'reso'; stato: '' | 'valido' | 'annullato'; catalogo: string;
  da: string; a: string; origine: string; destinazione: string; pdv: string; premio: string; causale: string;
}
const VUOTI: Filtri = { testo: '', tipo: '', stato: '', catalogo: '', da: '', a: '', origine: '', destinazione: '', pdv: '', premio: '', causale: '' };

export function filtraStorico(ops: Operazione[], f: Filtri): Operazione[] {
  return ops.filter((o) =>
    (!f.tipo || o.tipo === f.tipo) && (!f.stato || o.stato === f.stato) && (!f.catalogo || o.catalogoId === f.catalogo) &&
    (!f.da || o.data >= f.da) && (!f.a || o.data <= f.a) &&
    (!f.origine || o.pdvOrigineId === f.origine) && (!f.destinazione || o.pdvDestId === f.destinazione) &&
    (!f.pdv || o.pdvOrigineId === f.pdv || o.pdvDestId === f.pdv || o.pdvResoId === f.pdv) &&
    (!f.premio || o.premioId === f.premio) && (!f.causale || o.causale === f.causale) &&
    (!f.testo || corrisponde([o.id, o.premioCodice, o.premioDescrizione, o.pdvOrigineCodice, o.pdvOrigineNome, o.pdvDestCodice, o.pdvDestNome,
      o.pdvResoCodice, o.pdvResoNome, o.riferimento, o.note, o.causale, o.trasferimentoId, o.creatoDa].join(' '), f.testo)));
}

export function PaginaStorico({ params }: { params: URLSearchParams }) {
  const { dati, operazioni, mappe, cataloghiOrdinati, cfg } = useDati();
  const { avvisa } = useUi();
  const [f, setF] = useState<Filtri>(() => {
    const x = { ...VUOTI };
    for (const k of Object.keys(VUOTI) as (keyof Filtri)[]) { const p = params.get(k); if (p) (x as Record<string, string>)[k] = p; }
    return x;
  });
  const [altri, setAltri] = useState(Boolean(f.origine || f.destinazione || f.pdv || f.premio || f.causale));
  const [dir, setDir] = useState<'desc' | 'asc'>('desc');
  const [dettaglio, setDettaglio] = useState<string | null>(params.get('id'));
  useEffect(() => { setDettaglio(params.get('id')); }, [params]);
  const set = <K extends keyof Filtri>(k: K, val: Filtri[K]) => setF((x) => ({ ...x, [k]: val }));

  const filtrate = useMemo(() => {
    const r = filtraStorico(operazioni, f).sort(confrontaOp);
    return dir === 'desc' ? r.reverse() : r;
  }, [operazioni, f, dir]);
  const pag = usePagine(filtrate, 50);
  useEffect(() => { pag.setPagina(1); /* nuova ricerca: si riparte dalla prima pagina */ }, [f]); // eslint-disable-line react-hooks/exhaustive-deps

  const opzPdv = useMemo<Opzione[]>(() => dati!.pdv.map((p) => ({ id: p.id, codice: p.codice, testo: p.nome })), [dati]);
  const opzPremi = useMemo<Opzione[]>(() => dati!.premi.filter((p) => !f.catalogo || p.catalogo_id === f.catalogo)
    .map((p) => ({ id: p.id, codice: p.codice, testo: p.descrizione, dettaglio: mappe.cataloghi.get(p.catalogo_id)?.nome })), [dati, f.catalogo, mappe]);
  const causali = useMemo(() => [...new Set(operazioni.map((o) => o.causale).filter(Boolean))].sort(), [operazioni]);
  const nFiltri = Object.entries(f).filter(([, v]) => v).length;
  const op = dettaglio ? operazioni.find((o) => o.id === dettaglio) : undefined;
  const totQ = (tipo: string) => filtrate.reduce((s, o) => s + (o.tipo === tipo && o.stato === 'valido' ? o.quantita : 0), 0);

  const esporta = () => {
    const n = scaricaCsv(nFiltri ? 'storico-filtrato' : 'storico-completo', filtrate, colonneStorico(mappe.cataloghi), cfg.separatore);
    avvisa('successo', `Esportate ${n} operazioni.`);
  };

  return (
    <div>
      <Intestazione titolo="Storico operazioni" sottotitolo="Trasferimenti e resi, compresi quelli annullati."
        azioni={<button className="btn-secondario" onClick={esporta} disabled={!filtrate.length}><LuFileDown /> Esporta risultati ({num(filtrate.length)})</button>} />

      <div className="card mb-4 p-3">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-[2fr_1fr_1fr_1.3fr_1fr_1fr]">
          <div className="col-span-2 md:col-span-4 xl:col-span-1">
            <label className="label" htmlFor="f-testo">Ricerca libera</label>
            <div className="relative">
              <LuSearch className="absolute top-2.5 left-2.5 text-slate-400" aria-hidden />
              <input id="f-testo" className="input pl-8" value={f.testo} onChange={(e) => set('testo', e.target.value)} placeholder="Numero, premio, PDV, riferimento, note…" />
            </div>
          </div>
          <div><label className="label" htmlFor="f-tipo">Tipo</label>
            <select id="f-tipo" className="input" value={f.tipo} onChange={(e) => set('tipo', e.target.value as Filtri['tipo'])}>
              <option value="">Tutti</option><option value="trasferimento">Trasferimenti</option><option value="reso">Resi</option>
            </select></div>
          <div><label className="label" htmlFor="f-stato">Stato</label>
            <select id="f-stato" className="input" value={f.stato} onChange={(e) => set('stato', e.target.value as Filtri['stato'])}>
              <option value="">Tutti</option><option value="valido">Solo validi</option><option value="annullato">Solo annullati</option>
            </select></div>
          <div><label className="label" htmlFor="f-cat">Catalogo</label>
            <select id="f-cat" className="input" value={f.catalogo} onChange={(e) => set('catalogo', e.target.value)}>
              <option value="">Tutti</option>{cataloghiOrdinati.map((c) => <option key={c.id} value={c.id}>{c.codice}</option>)}
            </select></div>
          <div><label className="label" htmlFor="f-da">Dal</label><input id="f-da" type="date" className="input" value={f.da} onChange={(e) => set('da', e.target.value)} /></div>
          <div><label className="label" htmlFor="f-a">Al</label><input id="f-a" type="date" className="input" value={f.a} onChange={(e) => set('a', e.target.value)} /></div>
        </div>
        {altri && (
          <div className="mt-3 grid grid-cols-2 gap-3 border-t border-slate-100 pt-3 md:grid-cols-3 xl:grid-cols-5">
            <div><label className="label" htmlFor="f-origine">PDV di origine</label><Combobox id="f-origine" opzioni={opzPdv} valore={f.origine} onChange={(v) => set('origine', v)} segnaposto="Qualsiasi" /></div>
            <div><label className="label" htmlFor="f-dest">PDV di destinazione</label><Combobox id="f-dest" opzioni={opzPdv} valore={f.destinazione} onChange={(v) => set('destinazione', v)} segnaposto="Qualsiasi" /></div>
            <div><label className="label" htmlFor="f-pdv">PDV coinvolto (qualsiasi ruolo)</label><Combobox id="f-pdv" opzioni={opzPdv} valore={f.pdv} onChange={(v) => set('pdv', v)} segnaposto="Qualsiasi" /></div>
            <div><label className="label" htmlFor="f-premio">Premio</label><Combobox id="f-premio" opzioni={opzPremi} valore={f.premio} onChange={(v) => set('premio', v)} segnaposto="Qualsiasi" /></div>
            <div><label className="label" htmlFor="f-causale">Causale</label>
              <select id="f-causale" className="input" value={f.causale} onChange={(e) => set('causale', e.target.value)}>
                <option value="">Tutte</option>{causali.map((c) => <option key={c}>{c}</option>)}
              </select></div>
          </div>
        )}
        <div className="mt-3 flex items-center gap-3 text-sm">
          <button className="btn-testo px-2 py-1" onClick={() => setAltri(!altri)}><LuFilter /> {altri ? 'Meno filtri' : 'Altri filtri (PDV, premio, causale)'}</button>
          {nFiltri > 0 && <button className="btn-testo px-2 py-1" onClick={() => { setF(VUOTI); vai('storico'); }}><LuX /> Azzera filtri ({nFiltri})</button>}
          <span className="ml-auto text-slate-600">
            {num(filtrate.length)} operazioni · valide: <b>{num(totQ('trasferimento'))}</b> pz trasferiti, <b>{num(totQ('reso'))}</b> pz resi
          </span>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="tabella">
            <thead><tr>
              <th aria-sort={dir === 'asc' ? 'ascending' : 'descending'}>
                <button className="uppercase hover:text-slate-900" onClick={() => setDir(dir === 'desc' ? 'asc' : 'desc')}>Data {dir === 'desc' ? '↓' : '↑'}</button>
              </th>
              <th>Tipo</th><th>Numero</th><th>Cat.</th><th>Premio</th><th>Da / PDV</th><th>A</th><th className="num">Q.tà</th><th>Causale</th><th>Rif.</th><th>Stato</th>
            </tr></thead>
            <tbody>
              {pag.visibili.map((o) => (
                <tr key={o.id} className={`cursor-pointer ${o.stato === 'annullato' ? 'text-slate-400 [&_td]:line-through [&_td]:decoration-slate-300' : ''}`}
                  onClick={() => setDettaglio(o.id)} tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') setDettaglio(o.id); }}>
                  <td className="whitespace-nowrap">{dataIt(o.data)}</td>
                  <td><TipoBadge tipo={o.tipo} /></td>
                  <td className="font-mono text-xs whitespace-nowrap">{o.id}</td>
                  <td className="whitespace-nowrap">{mappe.cataloghi.get(o.catalogoId)?.codice}</td>
                  <td>{o.premioCodice && <span className="mr-1 font-mono text-xs text-slate-500">{o.premioCodice}</span>}{o.premioDescrizione}</td>
                  <td>{o.tipo === 'trasferimento' ? o.pdvOrigineNome : o.pdvResoNome}</td>
                  <td>{o.pdvDestNome}</td>
                  <td className="num font-semibold">{num(o.quantita)}</td>
                  <td>{o.causale}</td>
                  <td className="max-w-32 truncate" title={o.riferimento}>{o.riferimento}</td>
                  <td className="!no-underline"><StatoBadge stato={o.stato} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filtrate.length === 0 && <Vuoto>{operazioni.length ? 'Nessuna operazione corrisponde ai filtri.' : 'Non è ancora stata registrata nessuna operazione.'}</Vuoto>}
        <Paginazione {...pag} />
      </div>

      {op && <DettaglioOperazione op={op} chiudi={() => { setDettaglio(null); if (params.get('id')) history.replaceState(null, '', '#/storico'); }} apri={setDettaglio} />}
    </div>
  );
}

const AZIONI: Record<string, string> = { crea: 'Creazione', modifica: 'Modifica', annulla: 'Annullamento', ripristina: 'Ripristino' };
const ETICHETTE: Record<string, string> = {
  data: 'Data', catalogo_id: 'Catalogo', premio_id: 'Premio', pdv_origine_id: 'PDV origine', pdv_destinazione_id: 'PDV destinazione', pdv_id: 'PDV',
  quantita: 'Quantità', causale: 'Causale', riferimento: 'Riferimento', note: 'Note', trasferimento_id: 'Trasferimento collegato', motivo: 'Motivo', motivo_precedente: 'Motivo precedente',
};

function DettaglioOperazione({ op, chiudi, apri }: { op: Operazione; chiudi: () => void; apri: (id: string) => void }) {
  const { api, mappe, operazioni } = useDati();
  const { annulla, ripristina } = useAzioniOperazione();
  const [registro, setRegistro] = useState<VoceRegistro[] | null>(null);
  const [errReg, setErrReg] = useState('');
  const [modifica, setModifica] = useState(false);
  const raw = op.tipo === 'trasferimento' ? mappe.trasferimenti.get(op.id) : mappe.resi.get(op.id);

  useEffect(() => {
    let vivo = true;
    setRegistro(null); setErrReg('');
    api<VoceRegistro[]>('getRegistro', { entita_id: op.id }).then((r) => { if (vivo) setRegistro(r); }).catch((e) => { if (vivo) setErrReg(messaggioErrore(e)); });
    return () => { vivo = false; };
  }, [op.id, op.modificatoIl, api]);

  const nome = (k: string, v: string) => {
    if (k.startsWith('pdv')) return mappe.pdv.get(v)?.nome ?? v;
    if (k === 'premio_id') return mappe.premi.get(v)?.descrizione ?? v;
    if (k === 'catalogo_id') return mappe.cataloghi.get(v)?.codice ?? v;
    if (k === 'data') return dataIt(v);
    return v || '(vuoto)';
  };
  const collegati = op.tipo === 'trasferimento' ? operazioni.filter((x) => x.trasferimentoId === op.id) : [];
  const righe: [string, ReactNode][] = [
    ['Data', dataIt(op.data)],
    ['Catalogo', mappe.cataloghi.get(op.catalogoId)?.nome ?? op.catalogoId],
    ['Premio', <>{op.premioCodice && <span className="mr-1 font-mono text-xs">{op.premioCodice}</span>}{op.premioDescrizione}</>],
    ...(op.tipo === 'trasferimento'
      ? [['PDV di origine', `${op.pdvOrigineCodice} — ${op.pdvOrigineNome}`], ['PDV di destinazione', `${op.pdvDestCodice} — ${op.pdvDestNome}`]] as [string, string][]
      : [['Punto vendita', `${op.pdvResoCodice} — ${op.pdvResoNome}`]] as [string, string][]),
    ['Quantità', <b>{num(op.quantita)}</b>],
    ['Causale', op.causale || '—'],
    [op.tipo === 'trasferimento' ? 'Riferimento' : 'Numero documento', op.riferimento || '—'],
    ...(op.tipo === 'reso' ? [['Trasferimento collegato', op.trasferimentoId
      ? <button className="font-mono text-brand-700 underline" onClick={() => apri(op.trasferimentoId)}>{op.trasferimentoId}</button> : 'Nessuno']] as [string, ReactNode][] : []),
    ['Note', op.note || '—'],
    ['Registrato', `${dataOraIt(op.creatoIl)} da ${op.creatoDa || '—'}`],
    ['Ultima modifica', `${dataOraIt(op.modificatoIl)} da ${op.modificatoDa || '—'}`],
    ...(op.stato === 'annullato' ? [['Annullato il', dataOraIt(op.annullatoIl)], ['Motivo annullamento', op.motivoAnnullamento || '—']] as [string, string][] : []),
  ];

  return (
    <Modale laterale larghezza="max-w-xl" chiudi={chiudi} titolo={<span className="flex items-center gap-2"><TipoBadge tipo={op.tipo} /> <span className="font-mono">{op.id}</span> <StatoBadge stato={op.stato} /></span>}>
      <div className="mb-4 flex flex-wrap gap-2">
        {op.stato === 'valido' ? (
          <>
            <button className="btn-secondario" onClick={() => setModifica(true)}><LuPencil /> Modifica</button>
            <button className="btn-secondario text-red-700" onClick={() => void annulla(op)}><LuBan /> Annulla operazione</button>
            {op.tipo === 'trasferimento' && <button className="btn-secondario" onClick={() => vai('reso', { trasferimento: op.id })}><LuUndo2 /> Registra reso collegato</button>}
          </>
        ) : <button className="btn-secondario" onClick={() => void ripristina(op)}><LuRotateCcw /> Ripristina</button>}
      </div>
      <dl className="grid grid-cols-[10rem_1fr] gap-x-3 gap-y-2">
        {righe.map(([k, v]) => <Fragment key={k}><dt className="text-slate-500">{k}</dt><dd>{v}</dd></Fragment>)}
      </dl>
      {collegati.length > 0 && (
        <div className="mt-5">
          <h3 className="mb-1 font-semibold">Resi collegati</h3>
          <ul className="divide-y divide-slate-100 rounded-md border border-slate-200">
            {collegati.map((r) => (
              <li key={r.id} className="flex items-center gap-2 px-3 py-1.5">
                <button className="font-mono text-xs text-brand-700 underline" onClick={() => apri(r.id)}>{r.id}</button>
                <span className="flex-1">{dataIt(r.data)} · {r.pdvResoNome} · {num(r.quantita)} pz</span>
                <StatoBadge stato={r.stato} />
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="mt-5">
        <h3 className="mb-1 font-semibold">Cronologia delle modifiche</h3>
        {errReg && <p className="text-red-700">{errReg}</p>}
        {!registro && !errReg && <Rotella />}
        {registro && registro.length === 0 && <p className="text-slate-500">Nessuna voce.</p>}
        {registro && (
          <ol className="space-y-2">
            {registro.map((r) => {
              let det: Record<string, unknown> = {};
              try { det = r.dettagli ? JSON.parse(r.dettagli) : {}; } catch { /* testo libero */ }
              return (
                <li key={r.id} className="rounded-md border border-slate-200 px-3 py-2">
                  <div className="flex justify-between text-sm"><b>{AZIONI[r.azione] ?? r.azione}</b><span className="text-slate-500">{dataOraIt(r.timestamp)} · {r.operatore}</span></div>
                  {Object.entries(det).map(([k, v]) => (
                    <div key={k} className="text-sm text-slate-700">
                      {ETICHETTE[k] ?? k}: {Array.isArray(v) ? <><span className="text-slate-500 line-through">{nome(k, String(v[0]))}</span> → {nome(k, String(v[1]))}</> : String(v) || '—'}
                    </div>
                  ))}
                </li>
              );
            })}
          </ol>
        )}
      </div>
      {modifica && raw && (
        <Modale titolo={`Modifica ${op.id}`} chiudi={() => setModifica(false)} larghezza="max-w-4xl">
          <FormOperazione tipo={op.tipo} esistente={raw} onSalvato={() => setModifica(false)} onAnnulla={() => setModifica(false)} />
        </Modale>
      )}
    </Modale>
  );
}
