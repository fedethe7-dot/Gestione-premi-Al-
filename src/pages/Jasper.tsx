import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  LuBell, LuCircleCheck, LuClock, LuCopy, LuDownload, LuFileSpreadsheet, LuFileUp, LuHeartHandshake, LuStore,
  LuTrendingDown, LuTrendingUp, LuTriangleAlert, LuTrophy, LuX,
} from 'react-icons/lu';
import { Barra, Intestazione, Kpi, Rotella, scaricaTesto } from '../components/comuni.tsx';
import { messaggioErrore } from '../lib/api.ts';
import { BOM, creaCsv, decodifica, leggiCsv, nomeFile, type Colonna } from '../lib/csv.ts';
import { dataOraIt, num } from '../lib/format.ts';
import {
  ORDINE_STATI, STATI_JASPER, analizzaJasper, aperteDaTroppo, chiavePdv, creaRiepilogo, etichettaMese, filtraJasper,
  giornoIso, giornoIt, leggiExportJasper, mesiTra, nomiPremi, tabellaMesi, verificaTotali,
  type ExportJasper, type FiltriJasper, type RiepilogoDati, type RigaJasper, type StatoJasper,
} from '../lib/jasper.ts';
import { leggiXlsx } from '../lib/xlsx.ts';
import { useDati } from '../state/dati.tsx';
import { useUi } from '../state/ui.tsx';

interface RiepilogoSalvato {
  id: string; caricato_il: string; operatore: string; file: string; data_report: string;
  righe: string; pezzi: string; contributo: string; dati: string;
}
interface StatoServer { riepiloghi: RiepilogoSalvato[]; promemoria: string }

/** L'ultimo export letto resta in memoria finché la pagina del gestionale è aperta. */
let caricato: { export: ExportJasper; file: string } | null = null;

const eur = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const uno = new Intl.NumberFormat('it-IT', { maximumFractionDigits: 1 });
const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) + '%' : '—');
const STATI_PREDEFINITI: StatoJasper[] = ['daetic', 'etic', 'chiusa', 'altro'];
const COLORE_BARRE = '#1f66bd';

/** Vero se il riepilogo salvato corrisponde a questo export (stesso file, data del report e numero di righe). */
function stessoExport(r: RiepilogoSalvato, e: ExportJasper, file: string): boolean {
  return r.file === file && r.data_report === (e.dataReport !== null ? giornoIso(e.dataReport) : '') && Number(r.righe) === e.righe.length;
}

function leggiDati(s: string): RiepilogoDati | null {
  try { const d = JSON.parse(s); return d && Array.isArray(d.premi) ? d : null; } catch { return null; }
}

export function PaginaJasper() {
  const { api, dati } = useDati();
  const { avvisa } = useUi();
  const [exp, setExp] = useState(caricato);
  const [lettura, setLettura] = useState('');
  const [errore, setErrore] = useState('');
  const [server, setServer] = useState<StatoServer | null>(null);
  const [serverErrore, setServerErrore] = useState('');
  const [salvato, setSalvato] = useState<'no' | 'si' | 'in_corso' | 'gia'>('no');
  const input = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    api<StatoServer>('getJasper').then(setServer).catch((e) => setServerErrore(messaggioErrore(e)));
  }, [api]);

  // Nomi dei punti vendita dall'archivio del gestionale (codice senza zeri iniziali).
  const nomiPdv = useMemo(() => new Map((dati?.pdv ?? []).map((p) => [chiavePdv(p.codice), p.nome])), [dati]);
  const nomePdv = (pdv: string) => { const n = nomiPdv.get(chiavePdv(pdv)); return n ? `${pdv} · ${n}` : `PDV ${pdv}`; };

  async function leggiFile(f: File | undefined) {
    if (!f) return;
    setErrore('');
    setLettura(f.name);
    await new Promise((r) => setTimeout(r, 30));
    try {
      const buf = await f.arrayBuffer();
      let righe;
      if (/\.xlsx$/i.test(f.name)) {
        const x = await leggiXlsx(buf);
        const foglio = x.fogli.find((s) => s.righe.slice(0, 80).some((r) => r?.some((c) => String(c ?? '').trim().toLowerCase() === 'codice prenotazione'))) ?? x.fogli[0];
        righe = foglio.righe;
      } else if (/\.xls$/i.test(f.name)) {
        throw new Error('Il formato .xls (vecchio Excel) non è supportato: esporta da Jasper in CSV oppure salva il file come .xlsx.');
      } else {
        righe = leggiCsv(decodifica(buf).testo);
      }
      const e = leggiExportJasper(righe);
      if (!e.righe.length) throw new Error('Il file non contiene prenotazioni leggibili.');
      caricato = { export: e, file: f.name };
      setExp(caricato);
      setSalvato('no');
      void salvaRiepilogo(e, f.name);
    } catch (e) {
      setErrore(messaggioErrore(e));
    } finally {
      setLettura('');
      if (input.current) input.current.value = '';
    }
  }

  async function salvaRiepilogo(e: ExportJasper, file: string) {
    const r = creaRiepilogo(e);
    const dataReport = e.dataReport !== null ? giornoIso(e.dataReport) : '';
    const gia = server?.riepiloghi.some((x) => stessoExport(x, e, file));
    if (gia) { setSalvato('gia'); return; }
    setSalvato('in_corso');
    try {
      const nuovo = await api<RiepilogoSalvato>('saveRiepilogoJasper', { file, data_report: dataReport, righe: r.righe, pezzi: r.pezzi, contributo: r.contributo, dati: JSON.stringify(r.dati) });
      setServer((s) => (s ? { ...s, riepiloghi: [nuovo, ...s.riepiloghi] } : s));
      setSalvato('si');
    } catch (err) {
      setSalvato('no');
      setServerErrore(messaggioErrore(err));
    }
  }

  const ultimoSalvato = server?.riepiloghi[0];
  const prossimo = server?.promemoria ? dataOraIt(server.promemoria) : '';

  return (
    <div className="space-y-5"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => { e.preventDefault(); void leggiFile(e.dataTransfer.files[0]); }}>
      <Intestazione titolo="Prenotazioni Jasper"
        sottotitolo={'Statistiche dall\'export "Prenotazioni premi": il file viene letto solo su questo PC, nel database finiscono soltanto i totali.'}
        azioni={<>
          <label className="btn-primario btn-grande cursor-pointer">
            <LuFileUp /> Carica export
            <input ref={input} type="file" accept=".csv,.txt,.xlsx,text/csv" className="sr-only" aria-label="Export di Jasper"
              onChange={(e) => void leggiFile(e.target.files?.[0])} />
          </label>
        </>} />

      {lettura && <div className="card p-4"><Rotella testo={`Sto leggendo ${lettura}… con file grandi può volerci qualche secondo.`} /></div>}
      {errore && (
        <div className="card flex items-start gap-2 border-red-300 bg-red-50 p-4 text-red-900">
          <LuTriangleAlert className="mt-0.5 shrink-0" />
          <div className="flex-1"><b>Non sono riuscito a leggere il file.</b> {errore}</div>
          <button className="opacity-60 hover:opacity-100" aria-label="Chiudi" onClick={() => setErrore('')}><LuX /></button>
        </div>
      )}

      {!exp && !lettura && (
        <div className="grid gap-5 xl:grid-cols-2">
          <section className="card p-5">
            <h2 className="mb-2 flex items-center gap-2 font-semibold"><LuFileSpreadsheet /> Come si usa</h2>
            <ol className="list-decimal space-y-1 pl-5 text-slate-700">
              <li>Su Jasper apri il report <b>Prenotazioni premi</b>, senza filtri sullo stato (aperte, chiuse e stornate).</li>
              <li>Esporta in <b>CSV</b> (più leggero) oppure in Excel .xlsx.</li>
              <li>Trascina il file in questa pagina o usa <b>Carica export</b>.</li>
            </ol>
            <p className="mt-3 text-sm text-slate-500">La pagina controlla da sola che pezzi e contributo tornino con la riga "Totali" del report.</p>
          </section>
          <StoricoCaricamenti server={server} errore={serverErrore} prossimo={prossimo} />
          {ultimoSalvato && <UltimoRiepilogo r={ultimoSalvato} nomePdv={nomePdv} />}
        </div>
      )}

      {exp && (
        <Analisi exp={exp.export} file={exp.file} nomePdv={nomePdv} salvato={salvato} serverErrore={serverErrore}
          precedente={server?.riepiloghi.find((r) => !stessoExport(r, exp.export, exp.file))}
          avvisa={avvisa} chiudi={() => { caricato = null; setExp(null); }} prossimo={prossimo} server={server} />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ senza file */

function StoricoCaricamenti({ server, errore, prossimo }: { server: StatoServer | null; errore: string; prossimo: string }) {
  return (
    <section className="card p-5">
      <h2 className="mb-2 flex items-center gap-2 font-semibold"><LuClock /> Export caricati</h2>
      {errore ? <p className="text-sm text-amber-800">{errore.includes('Azione sconosciuta')
        ? 'Per salvare lo storico dei caricamenti va aggiornato il file Code.gs su Apps Script. Le statistiche funzionano lo stesso.'
        : errore}</p>
        : !server ? <Rotella />
          : !server.riepiloghi.length ? <p className="text-slate-500">Nessun export caricato finora.</p>
            : (
              <ul className="divide-y divide-slate-100 text-sm">
                {server.riepiloghi.slice(0, 6).map((r) => (
                  <li key={r.id} className="flex flex-wrap items-baseline justify-between gap-2 py-1.5">
                    <span className="min-w-0 truncate" title={r.file}>{dataOraIt(r.caricato_il)} · {r.file}</span>
                    <span className="tabular-nums text-slate-600">{num(Number(r.pezzi))} pz</span>
                  </li>
                ))}
              </ul>
            )}
      <p className="mt-3 flex items-center gap-1.5 text-sm text-slate-500"><LuBell />
        {prossimo ? <>Prossimo controllo: <b className="text-slate-700">{prossimo}</b> · la mail arriva solo se l'ultimo export ha più di due settimane</> : 'Promemoria non attivo: si attiva dal menu "Gestionale premi" del Foglio.'}
      </p>
    </section>
  );
}

function UltimoRiepilogo({ r, nomePdv }: { r: RiepilogoSalvato; nomePdv: (p: string) => string }) {
  const d = leggiDati(r.dati);
  if (!d) return null;
  return (
    <section className="card p-5 xl:col-span-2">
      <h2 className="font-semibold">Ultimo export: {r.data_report ? giornoIt(Date.parse(r.data_report) / 864e5) : dataOraIt(r.caricato_il)}</h2>
      <p className="mb-3 text-sm text-slate-500">{num(Number(r.pezzi))} pezzi esclusi gli stornati · {eur.format(Number(r.contributo))} di contributo. Carica un export per vedere tutte le statistiche.</p>
      <div className="grid gap-5 md:grid-cols-2">
        <MiniClassifica titolo="Premi più richiesti" righe={d.premi.slice(0, 5).map(([, n, q]) => [n, q])} />
        <MiniClassifica titolo="Negozi che prenotano di più" righe={d.pdv.slice(0, 5).map(([p, q]) => [nomePdv(p), q])} />
      </div>
    </section>
  );
}

function MiniClassifica({ titolo, righe }: { titolo: string; righe: [string, number][] }) {
  const max = Math.max(1, ...righe.map((r) => r[1]));
  return (
    <div>
      <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{titolo}</h3>
      {righe.map(([n, q], i) => (
        <div key={n} className="py-1">
          <div className="flex justify-between gap-2 text-sm"><span className="truncate">{i + 1}. {n}</span><b className="tabular-nums">{num(q)}</b></div>
          <Barra valore={q} massimo={max} colore={COLORE_BARRE} />
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ con file */

function Analisi({ exp, file, nomePdv, salvato, serverErrore, precedente, avvisa, chiudi, prossimo, server }: {
  exp: ExportJasper; file: string; nomePdv: (p: string) => string; salvato: string; serverErrore: string;
  precedente?: RiepilogoSalvato; avvisa: (t: 'successo' | 'errore' | 'info', s: string) => void; chiudi: () => void;
  prossimo: string; server: StatoServer | null;
}) {
  const nomi = useMemo(() => nomiPremi(exp.righe), [exp]);
  const nomePremio = (k: string) => nomi.get(k) ?? k;
  const mesi = useMemo(() => {
    const m = exp.righe.map((r) => r.mese).filter(Boolean);
    return m.length ? mesiTra(Math.min(...m), Math.max(...m)) : [];
  }, [exp]);
  const pdvElenco = useMemo(() => [...new Set(exp.righe.map((r) => r.pdv).filter(Boolean))].sort(), [exp]);
  const tipi = useMemo(() => [...new Set(exp.righe.map((r) => r.tipo))].sort(), [exp]);
  const riferimento = useMemo(() => exp.dataReport ?? Math.max(...exp.righe.map((r) => Math.max(r.apertura ?? 0, r.chiusura ?? 0))), [exp]);
  const verifica = useMemo(() => verificaTotali(exp), [exp]);

  const iniziali = (): FiltriJasper => ({ da: mesi[0] ?? 0, a: mesi[mesi.length - 1] ?? 999999, pdv: '', tipo: '', testo: '', stati: new Set(STATI_PREDEFINITI) });
  const [f, setF] = useState<FiltriJasper>(iniziali);
  useEffect(() => { setF(iniziali()); }, [exp]); // eslint-disable-line react-hooks/exhaustive-deps
  const [testo, setTesto] = useState('');
  useEffect(() => { const t = setTimeout(() => setF((x) => ({ ...x, testo })), 200); return () => clearTimeout(t); }, [testo]);

  const filtrate = useMemo(() => filtraJasper(exp.righe, f), [exp, f]);
  const a = useMemo(() => analizzaJasper(filtrate), [filtrate]);
  const mesiVisibili = mesi.filter((m) => m >= f.da && m <= f.a);

  const cambia = (x: Partial<FiltriJasper>) => setF((v) => ({ ...v, ...x }));
  const azzera = () => { setTesto(''); setF(iniziali()); };
  const statiPresenti = ORDINE_STATI.filter((s) => s !== 'altro' || exp.righe.some((r) => r.stato === 'altro'));

  const csvPuliti = () => {
    const col: Colonna<RigaJasper>[] = [
      { titolo: 'Data apertura', valore: (r) => (r.apertura !== null ? giornoIt(r.apertura) : '') },
      { titolo: 'Mese', valore: (r) => (r.mese ? etichettaMese(r.mese) : '') },
      { titolo: 'Codice riordino', valore: (r) => r.chiave },
      { titolo: 'PDV', valore: (r) => r.pdv },
      { titolo: 'Punto vendita', valore: (r) => nomePdv(r.pdv) },
      { titolo: 'Articolo', valore: (r) => r.articolo },
      { titolo: 'Premio', valore: (r) => r.premio },
      { titolo: 'Codice prenotazione', valore: (r) => r.codice },
      { titolo: 'Tessera', valore: (r) => r.tessera },
      { titolo: 'Tipo', valore: (r) => r.tipo },
      { titolo: 'Stato', valore: (r) => STATI_JASPER[r.stato].etichetta },
      { titolo: 'Data chiusura', valore: (r) => (r.chiusura !== null ? giornoIt(r.chiusura) : '') },
      { titolo: 'Giorni a chiusura', valore: (r) => (r.stato === 'chiusa' && r.chiusura !== null && r.apertura !== null ? r.chiusura - r.apertura : '') },
      { titolo: 'Contributo', valore: (r) => r.contributo },
      { titolo: 'Qta', valore: (r) => r.qta },
      { titolo: 'Donazione', valore: (r) => (r.donazione ? 'SI' : 'NO') },
    ];
    scaricaTesto(BOM + creaCsv(filtrate, col, ';'), nomeFile('prenotazioni_jasper_pulite'));
  };

  return (
    <>
      <div className="card flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 text-sm">
        <span className="font-semibold">{file}</span>
        <span className="text-slate-500 tabular-nums">
          {num(exp.righe.length)} righe · {mesi.length ? `${etichettaMese(mesi[0])} – ${etichettaMese(mesi[mesi.length - 1])}` : ''}
          {exp.dataReport !== null && ` · report del ${giornoIt(exp.dataReport)}`}
        </span>
        {verifica === null
          ? <span className="badge bg-amber-100 text-amber-900">Riga "Totali" non trovata: controllo non disponibile</span>
          : verifica.ok
            ? <span className="badge bg-emerald-100 text-emerald-800"><LuCircleCheck /> Totali verificati con Jasper: {num(verifica.qta)} pz · {eur.format(verifica.contributo)}</span>
            : <span className="badge bg-red-100 text-red-800"><LuTriangleAlert /> Totali diversi: letti {num(verifica.qta)} pz e {eur.format(verifica.contributo)}, Jasper indica {num(exp.totali!.qta)} pz e {eur.format(exp.totali!.contributo)}</span>}
        {exp.doppioni > 0 && <span className="badge bg-amber-100 text-amber-900">{num(exp.doppioni)} codici prenotazione ripetuti</span>}
        <span className="text-slate-500">
          {salvato === 'si' ? 'Riepilogo salvato nel database' : salvato === 'gia' ? 'Export già registrato' : salvato === 'in_corso' ? 'Salvataggio del riepilogo…'
            : serverErrore ? 'Riepilogo non salvato (aggiorna Code.gs)' : ''}
        </span>
        <button className="btn-testo ml-auto px-2 py-1" onClick={chiudi}><LuX /> Chiudi file</button>
      </div>

      <div className="card flex flex-wrap items-end gap-3 p-3">
        <div><label className="label" htmlFor="j-da">Da</label>
          <select id="j-da" className="input" value={f.da} onChange={(e) => { const v = Number(e.target.value); cambia({ da: v, a: Math.max(v, f.a) }); }}>
            {mesi.map((m) => <option key={m} value={m}>{etichettaMese(m)}</option>)}
          </select></div>
        <div><label className="label" htmlFor="j-a">A</label>
          <select id="j-a" className="input" value={f.a} onChange={(e) => { const v = Number(e.target.value); cambia({ a: v, da: Math.min(v, f.da) }); }}>
            {mesi.map((m) => <option key={m} value={m}>{etichettaMese(m)}</option>)}
          </select></div>
        <div className="min-w-48"><label className="label" htmlFor="j-pdv">Punto vendita</label>
          <select id="j-pdv" className="input" value={f.pdv} onChange={(e) => cambia({ pdv: e.target.value })}>
            <option value="">Tutti</option>
            {pdvElenco.map((p) => <option key={p} value={p}>{nomePdv(p)}</option>)}
          </select></div>
        <div><label className="label" htmlFor="j-tipo">Canale</label>
          <select id="j-tipo" className="input" value={f.tipo} onChange={(e) => cambia({ tipo: e.target.value })}>
            <option value="">Tutti</option>
            {tipi.map((t) => <option key={t} value={t}>{t}</option>)}
          </select></div>
        <div className="w-52"><label className="label" htmlFor="j-q">Premio</label>
          <input id="j-q" className="input" type="search" placeholder="Es. padella" value={testo} onChange={(e) => setTesto(e.target.value)} /></div>
        <div>
          <span className="label">Stato</span>
          <div className="flex flex-wrap gap-1.5">
            {statiPresenti.map((s) => {
              const on = f.stati.has(s);
              return (
                <button key={s} type="button" aria-pressed={on}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${on ? 'border-slate-300 bg-white' : 'border-slate-200 bg-slate-50 text-slate-400 line-through'}`}
                  onClick={() => { const n = new Set(f.stati); if (on) { if (n.size > 1) n.delete(s); } else n.add(s); cambia({ stati: n }); }}>
                  <span className="h-2.5 w-2.5 rounded-sm" style={{ background: STATI_JASPER[s].colore }} />{STATI_JASPER[s].etichetta}
                </button>
              );
            })}
          </div>
        </div>
        <button className="btn-testo" onClick={azzera}>Azzera filtri</button>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Kpi titolo="Pezzi prenotati" valore={num(a.qta)} nota={`${a.pdv.length} negozi · ${a.premi.length} premi`} />
        <Kpi titolo="Contributo clienti" valore={eur.format(a.contributo)} nota="versioni con contributo" />
        <Kpi titolo="Online" valore={pct(a.online, a.qta)} nota={`${num(a.online)} pz`} />
        <Kpi titolo="Già chiuse" valore={pct(a.chiuse, a.qta)} nota={`${num(a.chiuse)} pz`} colore={STATI_JASPER.chiusa.colore} />
        <Kpi titolo="Da etichettare" valore={num(a.daEtichettare)} nota="pezzi aperti senza etichetta" colore={STATI_JASPER.daetic.colore} />
        <Kpi titolo="Tempo di chiusura" valore={a.nChiuse ? uno.format(a.giorniChiusura / a.nChiuse) + ' gg' : '—'} nota="media da apertura a chiusura" />
      </div>

      <section className="card p-4">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div><h2 className="font-semibold">Prenotazioni mese per mese</h2><p className="text-sm text-slate-500">Pezzi per mese di apertura, divisi per stato attuale</p></div>
          <div className="flex flex-wrap gap-3 text-xs text-slate-600">
            {ORDINE_STATI.filter((s) => f.stati.has(s) && a.mesi.some((m) => m[s] > 0)).map((s) => (
              <span key={s} className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: STATI_JASPER[s].colore }} />{STATI_JASPER[s].etichetta}</span>
            ))}
          </div>
        </div>
        <GraficoStati mesi={mesiVisibili} dati={a.mesi} stati={ORDINE_STATI.filter((s) => f.stati.has(s))} />
      </section>

      <div className="grid gap-5 xl:grid-cols-2">
        <Classifica titolo="Premi più richiesti" icona={<LuTrophy />} nota="Clic su un premio per filtrare la pagina"
          voci={a.premi.map((p) => ({
            chiave: p.chiave, nome: nomePremio(p.chiave), qta: p.qta, contributo: p.contributo,
            dettaglio: `${pct(p.conContributo, p.qta)} con contributo · ${p.pdv} negozi`,
          }))}
          onClick={(k) => { const n = nomePremio(k); setTesto(n); cambia({ testo: n }); }} />
        <Classifica titolo="Negozi che prenotano di più" icona={<LuStore />} nota="Clic su un negozio per filtrare la pagina"
          voci={a.pdv.map((p) => ({
            chiave: p.pdv, nome: nomePdv(p.pdv), qta: p.qta, contributo: p.contributo,
            dettaglio: `${num(p.tessere)} tessere · ${pct(p.online, p.qta)} online`,
          }))}
          onClick={(k) => cambia({ pdv: k })} />
      </div>

      {precedente && <Confronto exp={exp} precedente={precedente} nomePdv={nomePdv} />}

      <TabellaMesi righe={filtrate} mesi={mesiVisibili} nomePdv={nomePdv} nomePremio={nomePremio} avvisa={avvisa} />

      <div className="grid gap-5 xl:grid-cols-2">
        <AperteDaTroppo righe={filtrate} riferimento={riferimento} nomePdv={nomePdv} onClick={(p) => cambia({ pdv: p })} />
        <section className="card p-4">
          <h2 className="flex items-center gap-2 font-semibold"><LuClock /> Tempi di chiusura per negozio</h2>
          <p className="mb-2 text-sm text-slate-500">Giorni medi tra apertura e chiusura, negozi più lenti (almeno 5 chiuse)</p>
          <ListaBarre righe={a.pdv.filter((p) => p.chiuse >= 5).map((p) => ({ chiave: p.pdv, nome: nomePdv(p.pdv), valore: p.giorni / p.chiuse, testo: uno.format(p.giorni / p.chiuse) + ' gg', dettaglio: `${num(p.chiuse)} chiuse` }))
            .sort((x, y) => y.valore - x.valore).slice(0, 10)} onClick={(p) => cambia({ pdv: p })} />
        </section>
      </div>

      <div className="grid gap-5 xl:grid-cols-2 items-start">
        <section className="card p-4">
          <h2 className="flex items-center gap-2 font-semibold"><LuHeartHandshake /> Donazioni</h2>
          <p className="mb-2 text-sm text-slate-500">Tenute fuori dalle classifiche dei premi</p>
          <ListaBarre righe={a.donazioni.map((d) => ({ chiave: d.nome, nome: d.nome.replace(/^DONAZIONE\s*/i, '') || d.nome, valore: d.qta, testo: num(d.qta), dettaglio: '' }))} />
        </section>
        <section className="card p-4">
          <h2 className="font-semibold">Tessere con più prenotazioni</h2>
          <p className="mb-2 text-sm text-slate-500">Utile per notare casi insoliti</p>
          <ListaBarre mono righe={a.tessere.map((t) => ({ chiave: t.tessera, nome: t.tessera, valore: t.qta, testo: num(t.qta) + ' pz', dettaglio: t.pdv.length > 1 ? `${t.pdv.length} negozi diversi` : nomePdv(t.pdv[0] ?? '') }))} />
        </section>
      </div>

      <section className="card flex flex-wrap items-center justify-between gap-3 p-4">
        <div>
          <h2 className="font-semibold">Dati puliti</h2>
          <p className="text-sm text-slate-500">Le {num(filtrate.length)} prenotazioni filtrate, senza intestazioni e subtotali, per Excel o Google Sheets.</p>
        </div>
        <button className="btn-secondario" onClick={csvPuliti}><LuDownload /> Scarica CSV</button>
      </section>

      {server && (
        <p className="flex items-center gap-1.5 text-sm text-slate-500"><LuBell />
          {prossimo ? <>Prossimo controllo: <b className="text-slate-700">{prossimo}</b> · la mail arriva solo se l'ultimo export ha più di due settimane</> : 'Promemoria non attivo: si attiva dal menu "Gestionale premi" del Foglio.'}
        </p>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ componenti */

function scala(max: number): number[] {
  if (max <= 0) return [0, 1];
  const grezzo = max / 4;
  const pot = Math.pow(10, Math.floor(Math.log10(grezzo)));
  const passo = [1, 2, 2.5, 5, 10].map((m) => m * pot).find((p) => p >= grezzo) ?? grezzo;
  const t: number[] = [];
  for (let v = 0; v <= max + passo * 0.001; v += passo) t.push(Math.round(v));
  if (t[t.length - 1] < max) t.push(Math.round(t[t.length - 1] + passo));
  return t;
}

function GraficoStati({ mesi, dati, stati }: { mesi: number[]; dati: ReturnType<typeof analizzaJasper>['mesi']; stati: StatoJasper[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const ref = useRef<HTMLDivElement | null>(null);
  const [larghezza, setLarghezza] = useState(640);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setLarghezza(Math.max(320, el.clientWidth)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [mesi.length > 0]);
  const perMese = new Map(dati.map((d) => [d.mese, d]));
  if (!mesi.length || !dati.length) return <p className="py-8 text-center text-slate-500">Nessuna prenotazione con questi filtri.</p>;
  const pila: StatoJasper[] = ['chiusa', 'etic', 'daetic', 'stornata', 'altro'].filter((s) => stati.includes(s as StatoJasper)) as StatoJasper[];
  const H = 250, L = 48, R = 8, T = 10, B = 28;
  const W = Math.max(larghezza, mesi.length * 34 + L + R);
  const tacche = scala(Math.max(...mesi.map((m) => perMese.get(m)?.totale ?? 0)));
  const max = tacche[tacche.length - 1];
  const y = (v: number) => T + (H - T - B) * (1 - v / max);
  const slot = (W - L - R) / mesi.length;
  const bw = Math.min(36, slot * 0.7);
  const ogni = Math.ceil(mesi.length / 14);
  const h = hover !== null ? perMese.get(mesi[hover]) : undefined;
  return (
    <div className="relative overflow-x-auto" ref={ref}>
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="block" role="img" aria-label="Pezzi prenotati per mese e stato">
        {tacche.map((t) => (
          <g key={t}>
            <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke="#e2e8f0" strokeWidth={t === 0 ? 1.5 : 1} />
            <text x={L - 6} y={y(t) + 4} textAnchor="end" fontSize="11" fill="#64748b">{num(t)}</text>
          </g>
        ))}
        {mesi.map((m, i) => {
          const d = perMese.get(m);
          const x = L + slot * i + (slot - bw) / 2;
          let acc = 0;
          return (
            <g key={m} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <rect x={L + slot * i} y={T} width={slot} height={H - T - B} fill={hover === i ? '#f1f5f9' : 'transparent'} />
              {d && pila.map((s) => {
                const v = d[s];
                if (!v) return null;
                const y1 = y(acc + v), y0 = y(acc);
                acc += v;
                return <rect key={s} x={x} y={y1} width={bw} height={Math.max(0, y0 - y1 - 1)} fill={STATI_JASPER[s].colore} rx={1.5} />;
              })}
              {i % ogni === 0 && <text x={L + slot * i + slot / 2} y={H - 9} textAnchor="middle" fontSize="11" fill="#475569">{etichettaMese(m)}</text>}
            </g>
          );
        })}
      </svg>
      {hover !== null && (
        <div className="pointer-events-none absolute top-0 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm shadow-lg"
          style={{ left: Math.min(W - 130, Math.max(110, L + slot * (hover + 0.5))), transform: 'translateX(-50%)' }}>
          <div className="font-semibold">{etichettaMese(mesi[hover])}</div>
          {h ? <>
            {[...pila].reverse().map((s) => (
              <div key={s} className="flex items-center justify-between gap-4"><span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm" style={{ background: STATI_JASPER[s].colore }} />{STATI_JASPER[s].etichetta}</span><b className="tabular-nums">{num(h[s])}</b></div>
            ))}
            <div className="mt-1 flex justify-between gap-4 border-t border-slate-100 pt-1"><span>Totale</span><b className="tabular-nums">{num(h.totale)}</b></div>
          </> : <div className="text-slate-500">Nessuna prenotazione</div>}
        </div>
      )}
    </div>
  );
}

interface VoceClassifica { chiave: string; nome: string; qta: number; contributo: number; dettaglio: string }

function Classifica({ titolo, icona, nota, voci, onClick }: { titolo: string; icona: ReactNode; nota: string; voci: VoceClassifica[]; onClick: (k: string) => void }) {
  const [metrica, setMetrica] = useState<'qta' | 'contributo'>('qta');
  const [tutti, setTutti] = useState(false);
  const ord = voci.filter((v) => v[metrica] > 0).sort((a, b) => b[metrica] - a[metrica]);
  const vis = tutti ? ord : ord.slice(0, 10);
  const max = Math.max(1, ord[0]?.[metrica] ?? 1);
  return (
    <section className="card p-4">
      <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
        <div><h2 className="flex items-center gap-2 font-semibold">{icona} {titolo}</h2><p className="text-sm text-slate-500">{nota}</p></div>
        <div className="inline-flex overflow-hidden rounded-md border border-slate-300 text-sm" role="group" aria-label="Ordina per">
          {(['qta', 'contributo'] as const).map((m) => (
            <button key={m} type="button" aria-pressed={metrica === m} onClick={() => setMetrica(m)}
              className={`px-2.5 py-1 ${metrica === m ? 'bg-brand-600 font-semibold text-white' : 'bg-white text-slate-700 hover:bg-slate-50'}`}>{m === 'qta' ? 'Pezzi' : 'Contributo'}</button>
          ))}
        </div>
      </div>
      {!vis.length ? <p className="py-6 text-center text-slate-500">Nessun dato con questi filtri.</p> : (
        <ol>
          {vis.map((v, i) => (
            <li key={v.chiave}>
              <button type="button" className="grid w-full grid-cols-[2rem_1fr_auto] items-center gap-x-3 rounded-md px-1.5 py-1.5 text-left hover:bg-brand-50/60" onClick={() => onClick(v.chiave)}>
                <span className="text-right text-xs tabular-nums text-slate-400">{i + 1}</span>
                <span className="min-w-0">
                  <span className="block truncate font-medium" title={v.nome}>{v.nome}</span>
                  <span className="block text-xs text-slate-500">{metrica === 'qta' ? eur.format(v.contributo) : num(v.qta) + ' pz'} · {v.dettaglio}</span>
                </span>
                <b className="tabular-nums">{metrica === 'qta' ? num(v.qta) : eur.format(v.contributo)}</b>
                <span />
                <span className="col-span-2 mt-1"><Barra valore={v[metrica]} massimo={max} colore={COLORE_BARRE} /></span>
              </button>
            </li>
          ))}
        </ol>
      )}
      {ord.length > 10 && <button type="button" className="btn-testo mt-2 px-2 py-1 text-brand-700" onClick={() => setTutti((t) => !t)}>{tutti ? 'Mostra solo i primi 10' : `Mostra tutti (${ord.length})`}</button>}
    </section>
  );
}

function ListaBarre({ righe, onClick, mono }: { righe: { chiave: string; nome: string; valore: number; testo: string; dettaglio: string }[]; onClick?: (k: string) => void; mono?: boolean }) {
  if (!righe.length) return <p className="py-6 text-center text-slate-500">Nessun dato con questi filtri.</p>;
  const max = Math.max(1, ...righe.map((r) => r.valore));
  return (
    <ol>
      {righe.map((r, i) => {
        const corpo = (
          <>
            <span className="text-right text-xs tabular-nums text-slate-400">{i + 1}</span>
            <span className="min-w-0">
              <span className={`block truncate font-medium ${mono ? 'font-mono text-sm' : ''}`} title={r.nome}>{r.nome}</span>
              {r.dettaglio && <span className="block text-xs text-slate-500">{r.dettaglio}</span>}
            </span>
            <b className="tabular-nums">{r.testo}</b>
            <span />
            <span className="col-span-2 mt-1"><Barra valore={r.valore} massimo={max} colore={COLORE_BARRE} /></span>
          </>
        );
        const cls = 'grid w-full grid-cols-[2rem_1fr_auto] items-center gap-x-3 rounded-md px-1.5 py-1.5 text-left';
        return (
          <li key={r.chiave}>
            {onClick ? <button type="button" className={cls + ' hover:bg-brand-50/60'} onClick={() => onClick(r.chiave)}>{corpo}</button> : <div className={cls}>{corpo}</div>}
          </li>
        );
      })}
    </ol>
  );
}

function AperteDaTroppo({ righe, riferimento, nomePdv, onClick }: { righe: RigaJasper[]; riferimento: number; nomePdv: (p: string) => string; onClick: (p: string) => void }) {
  const [giorni, setGiorni] = useState(60);
  const r = useMemo(() => aperteDaTroppo(righe, riferimento, giorni), [righe, riferimento, giorni]);
  return (
    <section className="card p-4">
      <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 font-semibold"><LuTriangleAlert /> Aperte da troppo tempo</h2>
          <p className="text-sm text-slate-500">{num(r.totale)} pezzi aperti da più di {giorni} giorni al {giornoIt(riferimento)}</p>
        </div>
        <div className="inline-flex overflow-hidden rounded-md border border-slate-300 text-sm" role="group" aria-label="Giorni">
          {[30, 60, 90].map((g) => (
            <button key={g} type="button" aria-pressed={giorni === g} onClick={() => setGiorni(g)}
              className={`px-2.5 py-1 ${giorni === g ? 'bg-brand-600 font-semibold text-white' : 'bg-white text-slate-700 hover:bg-slate-50'}`}>{g} gg</button>
          ))}
        </div>
      </div>
      <ListaBarre righe={r.pdv.slice(0, 10).map((p) => ({ chiave: p.pdv, nome: nomePdv(p.pdv), valore: p.qta, testo: num(p.qta), dettaglio: `${num(p.daEtichettare)} da etichettare · la più vecchia ha ${p.piuVecchia} giorni` }))} onClick={onClick} />
    </section>
  );
}

function TabellaMesi({ righe, mesi, nomePdv, nomePremio, avvisa }: {
  righe: RigaJasper[]; mesi: number[]; nomePdv: (p: string) => string; nomePremio: (k: string) => string;
  avvisa: (t: 'successo' | 'errore' | 'info', s: string) => void;
}) {
  const [per, setPer] = useState<'pdv' | 'premio'>('pdv');
  const [tutte, setTutte] = useState(false);
  const tab = useMemo(() => tabellaMesi(righe, per), [righe, per]);
  const vis = tutte ? tab : tab.slice(0, 25);
  const nome = (k: string) => (per === 'pdv' ? nomePdv(k) : nomePremio(k));
  let max = 0;
  for (const r of vis) for (const m of mesi) max = Math.max(max, r.mesi.get(m) ?? 0);
  const totMese = (m: number) => tab.reduce((s, r) => s + (r.mesi.get(m) ?? 0), 0);
  const copia = async () => {
    const testo = [[per === 'pdv' ? 'Negozio' : 'Premio', ...mesi.map(etichettaMese), 'Totale'].join('\t'),
      ...tab.map((r) => [nome(r.chiave), ...mesi.map((m) => r.mesi.get(m) ?? 0), r.totale].join('\t'))].join('\n');
    try { await navigator.clipboard.writeText(testo); avvisa('successo', 'Tabella copiata: incollala in Excel o Google Sheets.'); }
    catch { avvisa('errore', 'Copia non riuscita: il browser non ha permesso l\'accesso agli appunti.'); }
  };
  return (
    <section className="card">
      <div className="flex flex-wrap items-start justify-between gap-2 p-4 pb-3">
        <div><h2 className="font-semibold">Dettaglio per mese</h2><p className="text-sm text-slate-500">Pezzi prenotati per mese di apertura</p></div>
        <div className="flex flex-wrap gap-2">
          <div className="inline-flex overflow-hidden rounded-md border border-slate-300 text-sm" role="group" aria-label="Righe">
            {(['pdv', 'premio'] as const).map((p) => (
              <button key={p} type="button" aria-pressed={per === p} onClick={() => { setPer(p); setTutte(false); }}
                className={`px-2.5 py-1 ${per === p ? 'bg-brand-600 font-semibold text-white' : 'bg-white text-slate-700 hover:bg-slate-50'}`}>{p === 'pdv' ? 'Per negozio' : 'Per premio'}</button>
            ))}
          </div>
          <button className="btn-secondario" onClick={() => void copia()}><LuCopy /> Copia tabella</button>
        </div>
      </div>
      {!vis.length ? <p className="pb-8 text-center text-slate-500">Nessun dato con questi filtri.</p> : (
        <div className="max-h-[32rem] overflow-auto border-t border-slate-200">
          <table className="tabella">
            <thead><tr>
              <th className="sticky left-0 z-[2]">{per === 'pdv' ? 'Negozio' : 'Premio'}</th>
              {mesi.map((m) => <th key={m} className="num whitespace-nowrap">{etichettaMese(m)}</th>)}
              <th className="num">Totale</th>
            </tr></thead>
            <tbody>
              {vis.map((r) => (
                <tr key={r.chiave}>
                  <td className="sticky left-0 max-w-64 truncate bg-white font-medium" title={nome(r.chiave)}>{nome(r.chiave)}</td>
                  {mesi.map((m) => {
                    const v = r.mesi.get(m) ?? 0;
                    return <td key={m} className="num" style={v ? { background: `rgba(31, 102, 189, ${(0.06 + 0.4 * v / Math.max(1, max)).toFixed(3)})` } : { color: '#cbd5e1' }}>{v ? num(v) : '·'}</td>;
                  })}
                  <td className="num font-semibold">{num(r.totale)}</td>
                </tr>
              ))}
              <tr>
                <td className="sticky left-0 bg-white font-semibold">Totale{tab.length > vis.length ? ' (tutte le righe)' : ''}</td>
                {mesi.map((m) => <td key={m} className="num font-semibold">{num(totMese(m))}</td>)}
                <td className="num font-semibold">{num(tab.reduce((s, r) => s + r.totale, 0))}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
      {tab.length > 25 && <div className="p-3"><button type="button" className="btn-testo px-2 py-1 text-brand-700" onClick={() => setTutte((t) => !t)}>{tutte ? 'Mostra solo le prime 25 righe' : `Mostra tutte le righe (${tab.length})`}</button></div>}
    </section>
  );
}

function Confronto({ exp, precedente, nomePdv }: { exp: ExportJasper; precedente: RiepilogoSalvato; nomePdv: (p: string) => string }) {
  const prima = leggiDati(precedente.dati);
  const ora = useMemo(() => creaRiepilogo(exp), [exp]);
  if (!prima) return null;
  const varia = <K extends string>(adesso: [K, number][], allora: [K, number][]) => {
    const p = new Map(allora);
    return adesso.map(([k, q]) => ({ k, d: q - (p.get(k) ?? 0) })).filter((x) => x.d !== 0).sort((a, b) => b.d - a.d);
  };
  const premi = varia(ora.dati.premi.map(([k, , q]) => [k, q] as [string, number]), prima.premi.map(([k, , q]) => [k, q] as [string, number]));
  const nomi = new Map(ora.dati.premi.map(([k, n]) => [k, n]));
  const pdv = varia(ora.dati.pdv, prima.pdv);
  const quando = precedente.data_report ? giornoIt(Date.parse(precedente.data_report) / 864e5) : dataOraIt(precedente.caricato_il).slice(0, 10);
  const lista = (v: { k: string; d: number }[], nome: (k: string) => string) => v.length ? (
    <ul className="space-y-1 text-sm">
      {v.slice(0, 6).map((x) => (
        <li key={x.k} className="flex justify-between gap-3"><span className="truncate">{nome(x.k)}</span>
          <b className={`inline-flex items-center gap-1 tabular-nums ${x.d > 0 ? 'text-emerald-700' : 'text-red-700'}`}>{x.d > 0 ? <LuTrendingUp /> : <LuTrendingDown />}{x.d > 0 ? '+' : ''}{num(x.d)}</b></li>
      ))}
    </ul>
  ) : <p className="text-sm text-slate-500">Nessuna differenza.</p>;
  return (
    <section className="card p-4">
      <h2 className="font-semibold">Rispetto all'export precedente</h2>
      <p className="mb-3 text-sm text-slate-500">
        Export del {quando}: {num(Number(precedente.pezzi))} pz → adesso {num(ora.pezzi)} pz
        ({ora.pezzi - Number(precedente.pezzi) >= 0 ? '+' : ''}{num(ora.pezzi - Number(precedente.pezzi))}). Stornati esclusi, su tutto il file.
      </p>
      <div className="grid gap-5 md:grid-cols-2">
        <div><h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Premi cresciuti di più</h3>{lista(premi, (k) => nomi.get(k) ?? k)}</div>
        <div><h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Negozi cresciuti di più</h3>{lista(pdv, nomePdv)}</div>
      </div>
    </section>
  );
}
