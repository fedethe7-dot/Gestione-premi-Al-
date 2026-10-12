import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { LuFileDown, LuHistory, LuInfo, LuSearch, LuX } from 'react-icons/lu';
import { Combobox, type Opzione } from '../components/Combobox.tsx';
import { Barra, FiltroPeriodo, Intestazione, Kpi, scaricaCsv, SelettoreCatalogo, Th, useOrdinamento, Vuoto, type Periodo } from '../components/comuni.tsx';
import { COLORE_RESO, COLORE_TRASF, GraficoMensile, Legenda } from '../components/Grafici.tsx';
import { colonneStatCatalogo, colonneStatPdv, colonneStatPremio } from '../lib/esportazioni.ts';
import { corrisponde, meseIt, normalizza, num, perc } from '../lib/format.ts';
import { vai } from '../lib/rotta.ts';
import {
  andamentoMensile, filtraValide, filtriVuoti, pdvDelPremio, perCatalogo, perCausale, premiDelPdv, statPerPdv, statPerPremio, totali,
  type FiltriStat, type StatCausale, type StatPdv, type StatPremio, type TipoFiltro,
} from '../lib/statistiche.ts';
import type { Operazione } from '../lib/types.ts';
import { useDati } from '../state/dati.tsx';
import { useUi } from '../state/ui.tsx';

type Scheda = 'generali' | 'pdv' | 'premi';

export function PaginaStatistiche() {
  const { dati, operazioni, cataloghiOrdinati, mappe } = useDati();
  const [f, setF] = useState<FiltriStat>(filtriVuoti);
  const [scheda, setScheda] = useState<Scheda>('generali');
  const set = <K extends keyof FiltriStat>(k: K, v: FiltriStat[K]) => setF((x) => ({ ...x, [k]: v }));

  const filtrate = useMemo(() => filtraValide(operazioni, f), [operazioni, f]);
  const anag = useMemo(() => new Map(dati!.pdv.map((p) => [p.id, { codice: p.codice, nome: p.nome }])), [dati]);
  const opzPdv = useMemo<Opzione[]>(() => dati!.pdv.map((p) => ({ id: p.id, codice: p.codice, testo: p.nome })), [dati]);
  const opzPremi = useMemo<Opzione[]>(() => dati!.premi.filter((p) => !f.catalogoId || p.catalogo_id === f.catalogoId)
    .map((p) => ({ id: p.id, codice: p.codice, testo: p.descrizione, dettaglio: mappe.cataloghi.get(p.catalogo_id)?.nome })), [dati, f.catalogoId, mappe]);
  const nFiltri = Object.entries(f).filter(([k, v]) => v && !(k === 'tipo' && v === 'entrambi')).length;

  return (
    <div className="space-y-4">
      <Intestazione titolo="Statistiche" sottotitolo="Calcolate sulle operazioni valide registrate; le operazioni annullate sono escluse." />

      <div className="card p-3">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
          <FiltroPeriodo idBase="st" periodo={{ da: f.da, a: f.a }} onChange={(p: Periodo) => setF((x) => ({ ...x, ...p }))} cataloghi={cataloghiOrdinati} />
          <div><label className="label" htmlFor="st-cat">Catalogo</label>
            <SelettoreCatalogo id="st-cat" valore={f.catalogoId} cataloghi={cataloghiOrdinati}
              onChange={(v) => setF((x) => ({ ...x, catalogoId: v, premioId: v && mappe.premi.get(x.premioId)?.catalogo_id !== v ? '' : x.premioId }))} /></div>
          <div><label className="label" htmlFor="st-tipo">Movimenti</label>
            <select id="st-tipo" className="input" value={f.tipo} onChange={(e) => set('tipo', e.target.value as TipoFiltro)}>
              <option value="entrambi">Trasferimenti e resi</option><option value="trasferimento">Solo trasferimenti</option><option value="reso">Solo resi</option>
            </select></div>
          <div><label className="label" htmlFor="st-pdv">Punto vendita</label><Combobox id="st-pdv" opzioni={opzPdv} valore={f.pdvId} onChange={(v) => set('pdvId', v)} segnaposto="Tutti" /></div>
          <div><label className="label" htmlFor="st-premio">Premio</label><Combobox id="st-premio" opzioni={opzPremi} valore={f.premioId} onChange={(v) => set('premioId', v)} segnaposto="Tutti" /></div>
        </div>
        {nFiltri > 0 && <button className="btn-testo mt-2 px-2 py-1 text-sm" onClick={() => setF(filtriVuoti)}><LuX /> Azzera filtri</button>}
      </div>

      <div className="flex gap-1 border-b border-slate-300" role="tablist">
        {([['generali', 'Generali'], ['pdv', 'Per punto vendita'], ['premi', 'Per premio']] as [Scheda, string][]).map(([k, t]) => (
          <button key={k} role="tab" aria-selected={scheda === k} onClick={() => setScheda(k)}
            className={`-mb-px rounded-t-md border px-4 py-2 font-medium ${scheda === k ? 'border-slate-300 border-b-slate-100 bg-slate-100 text-brand-700' : 'border-transparent text-slate-600 hover:text-slate-900'}`}>{t}</button>
        ))}
      </div>

      {scheda === 'generali' && <Generali ops={filtrate} f={f} tutte={operazioni} anag={anag} vaiA={(s) => setScheda(s)} />}
      {scheda === 'pdv' && <PerPdv ops={filtrate} f={f} anag={anag} />}
      {scheda === 'premi' && <PerPremio ops={filtrate} f={f} tutte={operazioni} anag={anag} />}
    </div>
  );
}

function Sezione({ titolo, azioni, children, nota }: { titolo: string; azioni?: ReactNode; children: ReactNode; nota?: ReactNode }) {
  return (
    <section className="card">
      <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-4 py-2.5">
        <h2 className="font-semibold">{titolo}</h2>{azioni}
      </div>
      {children}
      {nota && <p className="border-t border-slate-100 px-4 py-2 text-xs text-slate-500">{nota}</p>}
    </section>
  );
}

function BottoneCsv({ onClick, testo = 'CSV' }: { onClick: () => void; testo?: string }) {
  return <button className="btn-secondario px-2 py-1 text-xs" onClick={onClick}><LuFileDown /> {testo}</button>;
}

const NOTA_TASSO = 'Rapporto resi/trasferiti = quantità resa ÷ quantità trasferita, entrambe nello stesso periodo e con gli stessi filtri. È un indicatore: i resi possono riguardare premi arrivati al PDV senza un trasferimento registrato o trasferiti in un periodo diverso, quindi valori sopra il 100% sono possibili e segnalati.';

function TassoCella({ t }: { t: number | null }) {
  if (t === null) return <span className="text-slate-400" title="Nessuna quantità trasferita: rapporto non calcolabile">n.d.</span>;
  return <span className={t > 1 ? 'font-semibold text-amber-700' : ''} title={t > 1 ? 'Resi superiori ai trasferimenti registrati: dato da verificare' : undefined}>{perc(t)}{t > 1 && ' ⚠'}</span>;
}

/* =========================================================== GENERALI */

function Generali({ ops, f, tutte, anag, vaiA }: { ops: Operazione[]; f: FiltriStat; tutte: Operazione[]; anag: Map<string, { codice: string; nome: string }>; vaiA: (s: Scheda) => void }) {
  const { cataloghiOrdinati, mappe, cfg } = useDati();
  const [tabella, setTabella] = useState(false);
  const tot = totali(ops, f.pdvId);
  const mensile = useMemo(() => andamentoMensile(ops), [ops]);
  const pdv = useMemo(() => statPerPdv(ops, anag).sort((a, b) => (b.qUscita + b.qEntrata) - (a.qUscita + a.qEntrata) || b.qResi - a.qResi).slice(0, 10), [ops, anag]);
  const premi = useMemo(() => statPerPremio(ops, f.pdvId), [ops, f.pdvId]);
  const topVolume = [...premi].filter((p) => p.qTrasf > 0).sort((a, b) => b.qTrasf - a.qTrasf).slice(0, 10);
  const topResi = [...premi].filter((p) => p.qResi > 0).sort((a, b) => b.qResi - a.qResi).slice(0, 10);
  // Confronto tra stagioni: stessi filtri tranne il catalogo.
  const stagioni = useMemo(() => perCatalogo(filtraValide(tutte, { ...f, catalogoId: '' }), cataloghiOrdinati), [tutte, f, cataloghiOrdinati]);
  const causali = useMemo(() => perCausale(ops), [ops]);
  const maxU = Math.max(1, ...pdv.map((p) => p.qUscita + p.qEntrata));
  const maxV = Math.max(1, ...topVolume.map((p) => p.qTrasf));
  const maxR = Math.max(1, ...topResi.map((p) => p.qResi));
  const nomePdv = f.pdvId ? anag.get(f.pdvId)?.nome : '';

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Kpi titolo={f.pdvId ? 'Trasferimenti del PDV' : 'Trasferimenti'} valore={num(tot.nTrasf)} colore={COLORE_TRASF} />
        <Kpi titolo="Quantità trasferita" valore={num(tot.qTrasf)} nota="ogni trasferimento contato una volta" colore={COLORE_TRASF} />
        <Kpi titolo="Resi" valore={num(tot.nResi)} colore={COLORE_RESO} />
        <Kpi titolo="Quantità resa" valore={num(tot.qResi)} colore={COLORE_RESO} />
        <Kpi titolo="PDV movimentati" valore={num(tot.pdvMovimentati)} />
        <Kpi titolo="Premi movimentati" valore={num(tot.premiMovimentati)} />
        {tot.perPdv && (
          <>
            <Kpi titolo={`In uscita da ${nomePdv}`} valore={num(tot.perPdv.qUscita)} nota={`${num(tot.perPdv.nUscita)} trasferimenti`} />
            <Kpi titolo={`In entrata a ${nomePdv}`} valore={num(tot.perPdv.qEntrata)} nota={`${num(tot.perPdv.nEntrata)} trasferimenti`} />
          </>
        )}
      </div>

      <Sezione titolo="Andamento mensile" azioni={<div className="flex items-center gap-3"><Legenda />
        <button className="btn-testo px-2 py-1 text-xs" onClick={() => setTabella(!tabella)}>{tabella ? 'Mostra grafico' : 'Mostra tabella'}</button>
        <BottoneCsv onClick={() => scaricaCsv('andamento-mensile', mensile, [
          { titolo: 'Mese', valore: (m) => m.mese }, { titolo: 'N. trasferimenti', valore: (m) => m.nTrasf }, { titolo: 'Quantità trasferita', valore: (m) => m.qTrasf },
          { titolo: 'N. resi', valore: (m) => m.nResi }, { titolo: 'Quantità resa', valore: (m) => m.qResi }], cfg.separatore)} /></div>}>
        <div className="p-4">
          {tabella ? (
            <table className="tabella">
              <thead><tr><th>Mese</th><th className="num">N. trasferimenti</th><th className="num">Q.tà trasferita</th><th className="num">N. resi</th><th className="num">Q.tà resa</th></tr></thead>
              <tbody>{mensile.map((m) => <tr key={m.mese}><td>{meseIt(m.mese)}</td><td className="num">{num(m.nTrasf)}</td><td className="num">{num(m.qTrasf)}</td><td className="num">{num(m.nResi)}</td><td className="num">{num(m.qResi)}</td></tr>)}</tbody>
            </table>
          ) : <GraficoMensile dati={mensile} />}
        </div>
      </Sezione>

      <Sezione titolo="Classifica PDV per volume" azioni={<button className="btn-testo px-2 py-1 text-xs" onClick={() => vaiA('pdv')}>Tutti i PDV →</button>}
        nota="Quantità in pezzi. “Movimentata” = uscita + entrata dello stesso PDV: serve a ordinarli, ma la somma della colonna non è il totale trasferito, perché ogni trasferimento coinvolge due PDV.">
        {pdv.length === 0 ? <Vuoto>Nessun dato.</Vuoto> : (
          <table className="tabella">
            <thead><tr><th>#</th><th>Punto vendita</th><th className="num">In uscita</th><th className="num">In entrata</th><th className="num">Movimentata</th><th className="w-40" /><th className="num">Resi</th></tr></thead>
            <tbody>{pdv.map((p, i) => (
              <tr key={p.pdvId}><td className="text-slate-400">{i + 1}</td><td><span className="mr-1 font-mono text-xs text-slate-500">{p.codice}</span>{p.nome}</td>
                <td className="num">{num(p.qUscita)}</td><td className="num">{num(p.qEntrata)}</td><td className="num font-semibold">{num(p.qUscita + p.qEntrata)}</td>
                <td><Barra valore={p.qUscita + p.qEntrata} massimo={maxU} colore={COLORE_TRASF} /></td><td className="num">{num(p.qResi)}</td></tr>))}
            </tbody>
          </table>
        )}
      </Sezione>

      <div className="grid gap-5 xl:grid-cols-2">
        <Sezione titolo="Premi per quantità trasferita" azioni={<button className="btn-testo px-2 py-1 text-xs" onClick={() => vaiA('premi')}>Tutti i premi →</button>}>
          {topVolume.length === 0 ? <Vuoto>Nessun trasferimento.</Vuoto> : (
            <table className="tabella">
              <thead><tr><th>Premio</th><th>Cat.</th><th className="num">Trasferiti</th><th className="w-28" /></tr></thead>
              <tbody>{topVolume.map((p) => (
                <tr key={p.premioId}><td>{p.codice && <span className="mr-1 font-mono text-xs text-slate-500">{p.codice}</span>}{p.descrizione}</td>
                  <td>{mappe.cataloghi.get(p.catalogoId)?.codice}</td><td className="num font-semibold">{num(p.qTrasf)}</td>
                  <td><Barra valore={p.qTrasf} massimo={maxV} colore={COLORE_TRASF} /></td></tr>))}
              </tbody>
            </table>
          )}
        </Sezione>
        <Sezione titolo="Premi con più resi" nota={NOTA_TASSO}>
          {topResi.length === 0 ? <Vuoto>Nessun reso.</Vuoto> : (
            <table className="tabella">
              <thead><tr><th>Premio</th><th>Cat.</th><th className="num">Resi</th><th className="w-24" /><th className="num">Resi/trasf.</th></tr></thead>
              <tbody>{topResi.map((p) => (
                <tr key={p.premioId}><td>{p.codice && <span className="mr-1 font-mono text-xs text-slate-500">{p.codice}</span>}{p.descrizione}</td>
                  <td>{mappe.cataloghi.get(p.catalogoId)?.codice}</td><td className="num font-semibold">{num(p.qResi)}</td>
                  <td><Barra valore={p.qResi} massimo={maxR} colore={COLORE_RESO} /></td><td className="num"><TassoCella t={p.tassoReso} /></td></tr>))}
              </tbody>
            </table>
          )}
        </Sezione>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <Sezione titolo="Confronto tra stagioni" azioni={<BottoneCsv onClick={() => scaricaCsv('confronto-stagioni', stagioni, colonneStatCatalogo, cfg.separatore)} />}
          nota="Applica tutti i filtri tranne il catalogo.">
          <table className="tabella">
            <thead><tr><th>Catalogo</th><th className="num">Trasf.</th><th className="num">Q.tà trasf.</th><th className="num">Resi</th><th className="num">Q.tà resa</th><th className="num">Resi/trasf.</th><th className="num">Premi</th><th className="num">PDV</th></tr></thead>
            <tbody>{stagioni.map((s) => (
              <tr key={s.catalogoId}><td className="font-semibold">{s.codice}</td><td className="num">{num(s.nTrasf)}</td><td className="num">{num(s.qTrasf)}</td>
                <td className="num">{num(s.nResi)}</td><td className="num">{num(s.qResi)}</td><td className="num"><TassoCella t={s.tassoReso} /></td>
                <td className="num">{num(s.premiMovimentati)}</td><td className="num">{num(s.pdvMovimentati)}</td></tr>))}
            </tbody>
          </table>
        </Sezione>
        <Sezione titolo="Distribuzione per causale">
          <div className="grid gap-4 p-4 md:grid-cols-2">
            <TabellaCausali titolo="Trasferimenti" righe={causali.trasferimenti} colore={COLORE_TRASF} />
            <TabellaCausali titolo="Resi" righe={causali.resi} colore={COLORE_RESO} />
          </div>
        </Sezione>
      </div>
    </div>
  );
}

function TabellaCausali({ titolo, righe, colore }: { titolo: string; righe: StatCausale[]; colore: string }) {
  const tot = righe.reduce((s, r) => s + r.q, 0);
  return (
    <div>
      <h3 className="mb-1 text-sm font-semibold text-slate-600">{titolo}</h3>
      {righe.length === 0 ? <p className="text-sm text-slate-500">Nessun movimento.</p> : (
        <table className="tabella">
          <thead><tr><th>Causale</th><th className="num">Op.</th><th className="num">Q.tà</th><th className="num">%</th></tr></thead>
          <tbody>{righe.map((r) => (
            <tr key={r.causale}><td><div>{r.causale}</div><Barra valore={r.q} massimo={tot} colore={colore} /></td>
              <td className="num">{num(r.n)}</td><td className="num">{num(r.q)}</td><td className="num">{perc(tot ? r.q / tot : null, 0)}</td></tr>))}
          </tbody>
        </table>
      )}
    </div>
  );
}

/* =========================================================== PER PDV */

function PerPdv({ ops, f, anag }: { ops: Operazione[]; f: FiltriStat; anag: Map<string, { codice: string; nome: string }> }) {
  const { cfg } = useDati();
  const { avvisa } = useUi();
  const [cerca, setCerca] = useState('');
  const [sel, setSel] = useState<string>(f.pdvId);
  const tutte = useMemo(() => statPerPdv(ops, anag).filter((s) => !f.pdvId || s.pdvId === f.pdvId), [ops, anag, f.pdvId]);
  const righe = useMemo(() => tutte.filter((s) => corrisponde(`${s.codice} ${s.nome}`, cerca)), [tutte, cerca]);
  const { ordinate, ordine, cambia } = useOrdinamento<StatPdv, keyof StatPdv>(righe, { chiave: 'qUscita', dir: 'desc' }, {
    pdvId: (s) => s.pdvId, codice: (s) => s.codice, nome: (s) => s.nome, nUscita: (s) => s.nUscita, qUscita: (s) => s.qUscita,
    nEntrata: (s) => s.nEntrata, qEntrata: (s) => s.qEntrata, nResi: (s) => s.nResi, qResi: (s) => s.qResi,
  });
  const max = Math.max(1, ...righe.map((s) => Math.max(s.qUscita, s.qEntrata)));
  const scelto = sel ? tutte.find((s) => s.pdvId === sel) : undefined;

  return (
    <div className="space-y-5">
      <Sezione titolo={`Confronto tra punti vendita (${num(righe.length)})`}
        azioni={<div className="flex items-center gap-2">
          <div className="relative"><LuSearch className="absolute top-2 left-2 text-slate-400" aria-hidden />
            <input className="input w-56 py-1 pl-7" placeholder="Cerca PDV…" value={cerca} onChange={(e) => setCerca(e.target.value)} aria-label="Cerca PDV" /></div>
          <BottoneCsv testo="Esporta statistiche PDV" onClick={() => { const n = scaricaCsv('statistiche-pdv', ordinate, colonneStatPdv, cfg.separatore); avvisa('successo', `Esportate ${n} righe.`); }} />
        </div>}
        nota="Clicca su un punto vendita per vedere il dettaglio. Le colonne in uscita, in entrata e resi sono distinte e non vanno sommate per ottenere il totale trasferito.">
        {righe.length === 0 ? <Vuoto>Nessun movimento con i filtri selezionati.</Vuoto> : (
          <div className="max-h-[32rem] overflow-auto">
            <table className="tabella">
              <thead><tr>
                <Th chiave="codice" ordine={ordine} cambia={cambia}>Codice</Th>
                <Th chiave="nome" ordine={ordine} cambia={cambia}>Punto vendita</Th>
                <Th chiave="nUscita" ordine={ordine} cambia={cambia} num>N. uscita</Th>
                <Th chiave="qUscita" ordine={ordine} cambia={cambia} num>Q.tà uscita</Th>
                <th className="w-24" />
                <Th chiave="nEntrata" ordine={ordine} cambia={cambia} num>N. entrata</Th>
                <Th chiave="qEntrata" ordine={ordine} cambia={cambia} num>Q.tà entrata</Th>
                <th className="w-24" />
                <Th chiave="nResi" ordine={ordine} cambia={cambia} num>N. resi</Th>
                <Th chiave="qResi" ordine={ordine} cambia={cambia} num>Q.tà resa</Th>
              </tr></thead>
              <tbody>{ordinate.map((s) => (
                <tr key={s.pdvId} className={`cursor-pointer ${sel === s.pdvId ? '!bg-brand-50' : ''}`} onClick={() => setSel(s.pdvId)}>
                  <td className="font-mono text-xs">{s.codice}</td><td>{s.nome}</td>
                  <td className="num">{num(s.nUscita)}</td><td className="num font-semibold">{num(s.qUscita)}</td><td><Barra valore={s.qUscita} massimo={max} colore={COLORE_TRASF} /></td>
                  <td className="num">{num(s.nEntrata)}</td><td className="num font-semibold">{num(s.qEntrata)}</td><td><Barra valore={s.qEntrata} massimo={max} colore={COLORE_TRASF} /></td>
                  <td className="num">{num(s.nResi)}</td><td className="num font-semibold">{num(s.qResi)}</td>
                </tr>))}
              </tbody>
            </table>
          </div>
        )}
      </Sezione>
      {scelto && <DettaglioPdv s={scelto} ops={ops} f={f} />}
    </div>
  );
}

function DettaglioPdv({ s, ops, f }: { s: StatPdv; ops: Operazione[]; f: FiltriStat }) {
  const { mappe, cfg } = useDati();
  const premi = useMemo(() => premiDelPdv(ops, s.pdvId), [ops, s.pdvId]);
  const mensile = useMemo(() => andamentoMensile(ops.filter((o) => o.pdvOrigineId === s.pdvId || o.pdvDestId === s.pdvId || o.pdvResoId === s.pdvId)), [ops, s.pdvId]);
  return (
    <Sezione titolo={`Dettaglio: ${s.codice} — ${s.nome}`}
      azioni={<div className="flex gap-2">
        <BottoneCsv testo="Premi del PDV" onClick={() => scaricaCsv(`statistiche-pdv-${s.codice}`, premi, [
          { titolo: 'Codice premio', valore: (p) => p.codice }, { titolo: 'Premio', valore: (p) => p.nome },
          { titolo: 'Catalogo', valore: (p) => mappe.cataloghi.get(mappe.premi.get(p.id)?.catalogo_id ?? '')?.codice },
          { titolo: 'Quantità in uscita', valore: (p) => p.qUscita }, { titolo: 'Quantità in entrata', valore: (p) => p.qEntrata }, { titolo: 'Quantità resa', valore: (p) => p.qResi }], cfg.separatore)} />
        <button className="btn-secondario px-2 py-1 text-xs" onClick={() => vai('storico', { pdv: s.pdvId, da: f.da, a: f.a, catalogo: f.catalogoId, stato: 'valido' })}><LuHistory /> Operazioni nello storico</button>
      </div>}>
      <div className="grid gap-5 p-4 xl:grid-cols-2">
        <div>
          <h3 className="mb-1 text-sm font-semibold text-slate-600">Premi movimentati</h3>
          <div className="max-h-80 overflow-auto">
            <table className="tabella">
              <thead><tr><th>Premio</th><th>Cat.</th><th className="num">Uscita</th><th className="num">Entrata</th><th className="num">Resi</th></tr></thead>
              <tbody>{premi.map((p) => (
                <tr key={p.id}><td>{p.codice && <span className="mr-1 font-mono text-xs text-slate-500">{p.codice}</span>}{p.nome}</td>
                  <td>{mappe.cataloghi.get(mappe.premi.get(p.id)?.catalogo_id ?? '')?.codice}</td>
                  <td className="num">{num(p.qUscita)}</td><td className="num">{num(p.qEntrata)}</td><td className="num">{num(p.qResi)}</td></tr>))}
              </tbody>
            </table>
          </div>
        </div>
        <div>
          <div className="mb-1 flex items-center justify-between"><h3 className="text-sm font-semibold text-slate-600">Andamento nel tempo</h3><Legenda /></div>
          <GraficoMensile dati={mensile} />
          <p className="mt-1 text-xs text-slate-500">Per questo PDV la quantità trasferita include sia le uscite sia le entrate.</p>
        </div>
      </div>
    </Sezione>
  );
}

/* =========================================================== PER PREMIO */

function PerPremio({ ops, f, tutte, anag }: { ops: Operazione[]; f: FiltriStat; tutte: Operazione[]; anag: Map<string, { codice: string; nome: string }> }) {
  const { mappe, cfg } = useDati();
  const { avvisa } = useUi();
  const [cerca, setCerca] = useState('');
  const [sel, setSel] = useState<string>(f.premioId);
  const tutti = useMemo(() => statPerPremio(ops, f.pdvId), [ops, f.pdvId]);
  const righe = useMemo(() => tutti.filter((s) => corrisponde(`${s.codice} ${s.descrizione}`, cerca)), [tutti, cerca]);
  const { ordinate, ordine, cambia } = useOrdinamento<StatPremio, string>(righe, { chiave: 'qTrasf', dir: 'desc' }, {
    cat: (s) => mappe.cataloghi.get(s.catalogoId)?.codice ?? '', codice: (s) => s.codice, descrizione: (s) => s.descrizione,
    nTrasf: (s) => s.nTrasf, qTrasf: (s) => s.qTrasf, qEntrata: (s) => s.qEntrata, qUscita: (s) => s.qUscita,
    nResi: (s) => s.nResi, qResi: (s) => s.qResi, tasso: (s) => s.tassoReso ?? -1, pdv: (s) => s.pdvCoinvolti,
  });
  const scelto = sel ? tutti.find((s) => s.premioId === sel) : undefined;
  const conPdv = Boolean(f.pdvId);

  return (
    <div className="space-y-5">
      <Sezione titolo={`Premi movimentati (${num(righe.length)})`} nota={<><LuInfo className="mr-1 inline" />{NOTA_TASSO} {conPdv ? 'Le colonne entrata/uscita si riferiscono al PDV selezionato nei filtri.' : 'Seleziona un PDV nei filtri per vedere le quantità in entrata e in uscita da quel PDV.'}</>}
        azioni={<div className="flex items-center gap-2">
          <div className="relative"><LuSearch className="absolute top-2 left-2 text-slate-400" aria-hidden />
            <input className="input w-56 py-1 pl-7" placeholder="Cerca premio…" value={cerca} onChange={(e) => setCerca(e.target.value)} aria-label="Cerca premio" /></div>
          <BottoneCsv testo="Esporta statistiche premi" onClick={() => { const n = scaricaCsv('statistiche-premi', ordinate, colonneStatPremio(mappe.cataloghi, conPdv), cfg.separatore); avvisa('successo', `Esportate ${n} righe.`); }} />
        </div>}>
        {righe.length === 0 ? <Vuoto>Nessun movimento con i filtri selezionati.</Vuoto> : (
          <div className="max-h-[32rem] overflow-auto">
            <table className="tabella">
              <thead><tr>
                <Th chiave="cat" ordine={ordine} cambia={cambia}>Cat.</Th>
                <Th chiave="codice" ordine={ordine} cambia={cambia}>Codice</Th>
                <Th chiave="descrizione" ordine={ordine} cambia={cambia}>Premio</Th>
                <Th chiave="nTrasf" ordine={ordine} cambia={cambia} num>N. trasf.</Th>
                <Th chiave="qTrasf" ordine={ordine} cambia={cambia} num>Q.tà trasf.</Th>
                {conPdv && <Th chiave="qEntrata" ordine={ordine} cambia={cambia} num>Entrata PDV</Th>}
                {conPdv && <Th chiave="qUscita" ordine={ordine} cambia={cambia} num>Uscita PDV</Th>}
                <Th chiave="nResi" ordine={ordine} cambia={cambia} num>N. resi</Th>
                <Th chiave="qResi" ordine={ordine} cambia={cambia} num>Q.tà resa</Th>
                <Th chiave="tasso" ordine={ordine} cambia={cambia} num title="Quantità resa ÷ quantità trasferita">Resi/trasf.</Th>
                <Th chiave="pdv" ordine={ordine} cambia={cambia} num>PDV coinvolti</Th>
              </tr></thead>
              <tbody>{ordinate.map((s) => (
                <tr key={s.premioId} className={`cursor-pointer ${sel === s.premioId ? '!bg-brand-50' : ''}`} onClick={() => setSel(s.premioId)}>
                  <td>{mappe.cataloghi.get(s.catalogoId)?.codice}</td><td className="font-mono text-xs">{s.codice}</td><td>{s.descrizione}</td>
                  <td className="num">{num(s.nTrasf)}</td><td className="num font-semibold">{num(s.qTrasf)}</td>
                  {conPdv && <td className="num">{num(s.qEntrata)}</td>}{conPdv && <td className="num">{num(s.qUscita)}</td>}
                  <td className="num">{num(s.nResi)}</td><td className="num font-semibold">{num(s.qResi)}</td>
                  <td className="num"><TassoCella t={s.tassoReso} /></td><td className="num">{num(s.pdvCoinvolti)}</td>
                </tr>))}
              </tbody>
            </table>
          </div>
        )}
      </Sezione>
      {scelto && <DettaglioPremio s={scelto} ops={ops} f={f} tutte={tutte} anag={anag} />}
    </div>
  );
}

function DettaglioPremio({ s, ops, f, tutte, anag }: { s: StatPremio; ops: Operazione[]; f: FiltriStat; tutte: Operazione[]; anag: Map<string, { codice: string; nome: string }> }) {
  const { mappe, dati, cataloghiOrdinati, cfg } = useDati();
  const delPremio = useMemo(() => ops.filter((o) => o.premioId === s.premioId), [ops, s.premioId]);
  const pdv = useMemo(() => pdvDelPremio(ops, s.premioId, anag), [ops, s.premioId, anag]);
  const causali = useMemo(() => perCausale(delPremio).resi, [delPremio]);
  const mensile = useMemo(() => andamentoMensile(delPremio), [delPremio]);
  // Confronto tra cataloghi: stesso codice premio (o stessa descrizione se senza codice) nelle altre stagioni.
  const confronto = useMemo(() => {
    const chiave = (c: string, d: string) => (c ? 'c:' + normalizza(c) : 'd:' + normalizza(d));
    const k = chiave(s.codice, s.descrizione);
    const ids = new Set(dati!.premi.filter((p) => chiave(p.codice, p.descrizione) === k).map((p) => p.id));
    const base = filtraValide(tutte, { ...f, catalogoId: '', premioId: '' }).filter((o) => ids.has(o.premioId));
    return perCatalogo(base, cataloghiOrdinati).filter((c) => dati!.premi.some((p) => ids.has(p.id) && p.catalogo_id === c.catalogoId));
  }, [s, dati, tutte, f, cataloghiOrdinati]);

  return (
    <Sezione titolo={`Dettaglio: ${s.codice ? s.codice + ' — ' : ''}${s.descrizione} (${mappe.cataloghi.get(s.catalogoId)?.codice})`}
      azioni={<div className="flex gap-2">
        <BottoneCsv testo="PDV del premio" onClick={() => scaricaCsv(`statistiche-premio-${s.codice || s.premioId}`, pdv, [
          { titolo: 'Codice PDV', valore: (p) => p.codice }, { titolo: 'PDV', valore: (p) => p.nome },
          { titolo: 'Quantità in uscita', valore: (p) => p.qUscita }, { titolo: 'Quantità in entrata', valore: (p) => p.qEntrata }, { titolo: 'Quantità resa', valore: (p) => p.qResi }], cfg.separatore)} />
        <button className="btn-secondario px-2 py-1 text-xs" onClick={() => vai('storico', { premio: s.premioId, da: f.da, a: f.a, pdv: f.pdvId, stato: 'valido' })}><LuHistory /> Operazioni nello storico</button>
      </div>}>
      <div className="grid gap-5 p-4 xl:grid-cols-2">
        <div className="space-y-5">
          <div className="grid grid-cols-3 gap-3">
            <Kpi titolo="Trasferito" valore={num(s.qTrasf)} nota={`${s.nTrasf} operazioni`} colore={COLORE_TRASF} />
            <Kpi titolo="Reso" valore={num(s.qResi)} nota={`${s.nResi} resi`} colore={COLORE_RESO} />
            <Kpi titolo="Resi/trasferiti" valore={<TassoCella t={s.tassoReso} />} nota="indicativo" />
          </div>
          <div>
            <h3 className="mb-1 text-sm font-semibold text-slate-600">PDV coinvolti ({pdv.length})</h3>
            <div className="max-h-64 overflow-auto">
              <table className="tabella">
                <thead><tr><th>PDV</th><th className="num">Uscita</th><th className="num">Entrata</th><th className="num">Resi</th></tr></thead>
                <tbody>{pdv.map((p) => <tr key={p.id}><td><span className="mr-1 font-mono text-xs text-slate-500">{p.codice}</span>{p.nome}</td><td className="num">{num(p.qUscita)}</td><td className="num">{num(p.qEntrata)}</td><td className="num">{num(p.qResi)}</td></tr>)}</tbody>
              </table>
            </div>
          </div>
          <TabellaCausali titolo="Causali di reso più frequenti" righe={causali} colore={COLORE_RESO} />
        </div>
        <div className="space-y-5">
          <div>
            <div className="mb-1 flex items-center justify-between"><h3 className="text-sm font-semibold text-slate-600">Andamento nel tempo</h3><Legenda /></div>
            <GraficoMensile dati={mensile} />
          </div>
          <div>
            <h3 className="mb-1 text-sm font-semibold text-slate-600">Confronto tra cataloghi</h3>
            {confronto.length < 2 && <p className="mb-1 text-sm text-slate-500">Il premio è presente in un solo catalogo{s.codice ? ' (confronto per codice)' : ' (confronto per descrizione)'}.</p>}
            <table className="tabella">
              <thead><tr><th>Catalogo</th><th className="num">Q.tà trasf.</th><th className="num">Q.tà resa</th><th className="num">Resi/trasf.</th></tr></thead>
              <tbody>{confronto.map((c) => <tr key={c.catalogoId}><td>{c.codice}</td><td className="num">{num(c.qTrasf)}</td><td className="num">{num(c.qResi)}</td><td className="num"><TassoCella t={c.tassoReso} /></td></tr>)}</tbody>
            </table>
          </div>
        </div>
      </div>
    </Sezione>
  );
}
