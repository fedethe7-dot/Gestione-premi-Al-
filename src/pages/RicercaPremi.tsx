/**
 * Ricerca premi: trova un premio per nome o codice e mostra tutte le sue versioni
 * (punteggio pieno / punti ridotti + contributo). Include l'aggiornamento del listino da file Excel.
 */
import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  LuCheck, LuCircleAlert, LuCopy, LuFileSpreadsheet, LuHistory, LuInfo, LuRefreshCw, LuRotateCcw, LuSearch, LuTriangleAlert, LuUpload, LuX,
} from 'react-icons/lu';
import { Intestazione, Kpi, Rotella, Vuoto } from '../components/comuni.tsx';
import { messaggioErrore } from '../lib/api.ts';
import { dataOraIt } from '../lib/format.ts';
import {
  cerca, confronta, daVerificare, euroIt, perImportazione, puntiIt, raggruppa, riconosciFogli,
  type Confronto, type FoglioRiconosciuto, type Gruppo, type Importazione, type ListinoArchivio, type Variante,
} from '../lib/listino.ts';
import { ErroreExcel, leggiXlsx } from '../lib/xlsx.ts';
import { vai } from '../lib/rotta.ts';
import { useListino } from '../state/listino.ts';
import { useUi } from '../state/ui.tsx';
import { useDati } from '../state/dati.tsx';

type Vista = 'cerca' | 'aggiorna';

export function PaginaRicercaPremi({ params }: { params: URLSearchParams }) {
  const vista: Vista = params.get('vista') === 'aggiorna' ? 'aggiorna' : 'cerca';
  const l = useListino();

  let corpo: ReactNode;
  if (l.daAggiornare) corpo = <ScriptDaAggiornare />;
  else if (!l.archivio && l.caricamento) corpo = <div className="card p-6"><Rotella testo="Caricamento del listino premi…" /></div>;
  else if (!l.archivio) corpo = (
    <div className="card p-6">
      <p className="flex items-center gap-2 font-semibold text-red-800"><LuTriangleAlert /> Impossibile caricare il listino</p>
      <p className="mt-1 text-slate-700">{l.errore}</p>
      <button className="btn-primario mt-3" onClick={() => void l.ricarica()}><LuRefreshCw /> Riprova</button>
    </div>
  );
  else corpo = vista === 'cerca' ? <Ricerca /> : <AggiornaListino />;

  return (
    <div>
      <Intestazione titolo="Ricerca premi" sottotitolo="Cerca per nome o codice: vedi subito le versioni di ogni premio, con punti e contributo."
        azioni={l.archivio && (
          <button className="btn-secondario" onClick={() => void l.ricarica()} disabled={l.caricamento} title="Rileggi il listino dal database">
            <LuRefreshCw className={l.caricamento ? 'animate-spin' : ''} /> Aggiorna
          </button>
        )} />
      <div className="mb-4 flex gap-1 border-b border-slate-200" role="tablist" aria-label="Sezioni">
        {([['cerca', 'Cerca', LuSearch], ['aggiorna', 'Aggiorna listino', LuUpload]] as const).map(([v, t, Icona]) => (
          <button key={v} role="tab" aria-selected={vista === v} onClick={() => vai('ricerca', v === 'cerca' ? undefined : { vista: v })}
            className={`-mb-px flex items-center gap-1.5 border-b-2 px-4 py-2 font-medium ${vista === v ? 'border-brand-600 text-brand-700' : 'border-transparent text-slate-600 hover:text-slate-900'}`}>
            <Icona aria-hidden /> {t}
          </button>
        ))}
      </div>
      {corpo}
    </div>
  );
}

function ScriptDaAggiornare() {
  return (
    <div className="card max-w-2xl p-6">
      <p className="flex items-center gap-2 font-semibold text-amber-800"><LuTriangleAlert /> Serve aggiornare lo script del database</p>
      <p className="mt-2 text-slate-700">
        La ricerca premi richiede la nuova versione del file <b>Code.gs</b>. In Apps Script: sostituisci il contenuto di Code.gs, salva,
        poi <i>Distribuisci › Gestisci distribuzioni › ✏️ › Nuova versione › Distribuisci</i>. Le tabelle del listino si creano da sole.
      </p>
      <p className="mt-2 text-sm text-slate-500">Tutte le altre funzioni del gestionale continuano a funzionare normalmente.</p>
    </div>
  );
}

/* ====================================================================== ricerca */

async function copiaTesto(testo: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(testo);
    return true;
  } catch {
    // Dentro Apps Script (iframe) gli appunti moderni possono essere bloccati: metodo classico.
    const ta = document.createElement('textarea');
    ta.value = testo; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    ta.remove();
    return ok;
  }
}

function BottoneCopia({ codice }: { codice: string }) {
  const [fatto, setFatto] = useState(false);
  const { avvisa } = useUi();
  return (
    <button type="button" className={`btn px-2 py-1 text-xs ${fatto ? 'border-emerald-300 bg-emerald-50 text-emerald-800' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}`}
      onClick={async () => {
        if (await copiaTesto(codice)) { setFatto(true); setTimeout(() => setFatto(false), 1500); }
        else avvisa('errore', 'Impossibile copiare: seleziona il codice e usa Ctrl+C.');
      }}
      aria-label={`Copia il codice ${codice}`} title="Copia il codice">
      {fatto ? <><LuCheck aria-hidden /> Copiato</> : <><LuCopy aria-hidden /> Copia</>}
    </button>
  );
}

const STILE = {
  pieno: { box: 'border-blue-200 bg-blue-50/60', titolo: 'text-blue-800', anello: 'ring-blue-500' },
  contributo: { box: 'border-orange-200 bg-orange-50/60', titolo: 'text-orange-800', anello: 'ring-orange-500' },
};

function BoxVariante({ v, n, evidenziato }: { v: Variante; n: number; evidenziato: boolean }) {
  const s = STILE[v.modalita];
  return (
    <div className={`rounded-md border p-3 ${s.box} ${evidenziato ? `ring-2 ${s.anello}` : ''}`}>
      <div className="flex flex-wrap items-center justify-between gap-1">
        <div className={`text-xs font-bold uppercase tracking-wide ${s.titolo}`}>
          Opzione {n} — {v.modalita === 'pieno' ? 'senza contributo' : 'con contributo'}
        </div>
        {evidenziato && <span className="badge bg-slate-800 text-white">Codice cercato</span>}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span className="font-mono text-xl font-semibold tracking-wide select-all">{v.codice}</span>
        <BottoneCopia codice={v.codice} />
      </div>
      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-sm">
        <dt className="text-slate-500">Punti</dt>
        <dd className="text-right font-semibold tabular-nums">{puntiIt(v.punti)}</dd>
        <dt className="text-slate-500">Contributo</dt>
        <dd className="text-right font-semibold tabular-nums">{v.contributo > 0 ? euroIt(v.contributo) : 'nessuno'}</dd>
        <dt className="text-slate-500">Modalità</dt>
        <dd className="text-right">{v.modalita === 'pieno' ? 'Punteggio pieno' : 'Punti ridotti + contributo'}</dd>
      </dl>
      {(v.ean || v.descrizione) && (
        <div className="mt-2 border-t border-black/5 pt-1.5 text-xs text-slate-500">
          {v.ean && <>EAN <span className="font-mono">{v.ean}</span></>}
          {v.descrizione && <div className="truncate" title={v.descrizione}>{v.descrizione}</div>}
        </div>
      )}
    </div>
  );
}

function SchedaPremio({ g, evidenziati }: { g: Gruppo; evidenziati: string[] }) {
  const [note, setNote] = useState(false);
  const dubbio = daVerificare(g);
  return (
    <article className="card p-4">
      <header className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <h2 className="text-lg leading-snug font-semibold">{g.nome}</h2>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="badge bg-slate-100 text-slate-700">Stagione {g.stagione}</span>
          {dubbio && (
            <button type="button" className="badge bg-amber-100 text-amber-900 hover:bg-amber-200" onClick={() => setNote((x) => !x)} aria-expanded={note}>
              <LuTriangleAlert aria-hidden /> Da verificare
            </button>
          )}
        </div>
      </header>
      {note && (
        <ul className="mb-3 list-disc rounded-md bg-amber-50 py-2 pr-3 pl-7 text-sm text-amber-900">
          {g.verifiche.map((v, i) => <li key={i}>{v.testo}</li>)}
        </ul>
      )}
      <div className={`grid gap-3 ${g.varianti.length > 1 ? 'sm:grid-cols-2' : ''}`}>
        {g.varianti.map((v, i) => <BoxVariante key={v.codice + v.ean} v={v} n={i + 1} evidenziato={evidenziati.includes(v.codice)} />)}
      </div>
    </article>
  );
}

function Ricerca() {
  const l = useListino();
  const [testo, setTesto] = useState(() => sessionStorage.getItem('ricerca-premi') ?? '');
  const [stagione, setStagione] = useState('');
  const input = useRef<HTMLInputElement | null>(null);
  const domanda = useDeferredValue(testo);

  useEffect(() => { input.current?.focus(); input.current?.select(); }, []);
  useEffect(() => { try { sessionStorage.setItem('ricerca-premi', testo); } catch { /* non indispensabile */ } }, [testo]);

  const indice = useMemo(() => (stagione ? l.indice.filter((x) => x.gruppo.stagione === stagione) : l.indice), [l.indice, stagione]);
  const esito = useMemo(() => cerca(indice, domanda), [indice, domanda]);
  const vuoto = !l.gruppi.length;

  return (
    <div>
      <div className="card mb-4 p-3">
        <div className="relative">
          <LuSearch className="absolute top-3.5 left-3 text-slate-400" size={18} aria-hidden />
          <input ref={input} type="text" inputMode="search" enterKeyHint="search" className="input py-2.5 pr-10 pl-10 text-base" value={testo} onChange={(e) => setTesto(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Escape') setTesto(''); }}
            placeholder="Nome del premio o codice (es. decespugliatore, 0406455)" aria-label="Cerca premio per nome o codice"
            autoComplete="off" spellCheck={false} disabled={vuoto} />
          {testo && (
            <button className="btn-testo absolute top-1.5 right-1.5 px-2 py-1.5" onClick={() => { setTesto(''); input.current?.focus(); }} aria-label="Cancella la ricerca"><LuX /></button>
          )}
        </div>
        {l.stagioni.length > 1 && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-sm" role="group" aria-label="Stagione">
            <span className="text-slate-500">Stagione:</span>
            {['', ...l.stagioni].map((s) => (
              <button key={s || 'tutte'} onClick={() => setStagione(s)} aria-pressed={stagione === s}
                className={`rounded-full border px-3 py-0.5 ${stagione === s ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-300 bg-white hover:bg-slate-50'}`}>
                {s || 'Tutte'}
              </button>
            ))}
          </div>
        )}
      </div>

      {vuoto ? (
        <div className="card"><Vuoto>
          Il listino è vuoto. Carica il file Excel dei premi da <a className="text-brand-600 underline" href="#/ricerca?vista=aggiorna">Aggiorna listino</a>.
        </Vuoto></div>
      ) : !domanda.trim() ? (
        <p className="px-1 text-slate-500">
          {l.gruppi.length.toLocaleString('it-IT')} premi in archivio ({l.stagioni.join(', ')}). Scrivi una parte del nome o del codice: i risultati compaiono mentre digiti.
        </p>
      ) : !esito.risultati.length ? (
        <div className="card"><Vuoto>Nessun premio trovato per «{domanda.trim()}»{stagione ? ` nella stagione ${stagione}` : ''}. Prova con meno lettere o con un'altra parola.</Vuoto></div>
      ) : (
        <>
          <p className="mb-2 px-1 text-sm text-slate-600" aria-live="polite">
            {esito.simili && <span className="mr-1 font-medium text-amber-800">Nessuna corrispondenza esatta: risultati simili.</span>}
            {esito.totale === 1 ? '1 premio trovato' : `${esito.totale} premi trovati`}
            {esito.totale > esito.risultati.length && ` — mostrati i primi ${esito.risultati.length}, aggiungi parole per restringere`}
          </p>
          <div className="grid gap-3 xl:grid-cols-2">
            {esito.risultati.map((r) => <SchedaPremio key={r.gruppo.chiave} g={r.gruppo} evidenziati={r.evidenziati} />)}
          </div>
        </>
      )}
    </div>
  );
}

/* ====================================================================== aggiornamento del listino */

interface FoglioScelto extends FoglioRiconosciuto { scelto: boolean; stagioneScelta: string }

interface Anteprima { file: string; gruppi: Gruppo[]; confronto: Confronto; righe: number }

function AggiornaListino() {
  const l = useListino();
  const { api } = useDati();
  const { avvisa, conferma } = useUi();
  const [file, setFile] = useState('');
  const [fogli, setFogli] = useState<FoglioScelto[] | null>(null);
  const [lettura, setLettura] = useState(false);
  const [errore, setErrore] = useState('');
  const [disattiva, setDisattiva] = useState(false);
  const [invio, setInvio] = useState(false);
  const [esito, setEsito] = useState<Importazione | null>(null);
  const [trascina, setTrascina] = useState(false);

  const apri = async (f: File | undefined) => {
    if (!f) return;
    setErrore(''); setEsito(null); setFogli(null); setLettura(true); setFile(f.name); setDisattiva(false);
    try {
      if (!/\.xlsx$/i.test(f.name)) throw new ErroreExcel('Serve un file Excel .xlsx. Se il file è .xls (vecchio formato), aprilo in Excel e salvalo come .xlsx.');
      const letti = riconosciFogli((await leggiXlsx(await f.arrayBuffer())).fogli);
      setFogli(letti.map((x) => ({ ...x, scelto: !x.scarto && Boolean(x.stagione), stagioneScelta: x.stagione })));
    } catch (e) {
      setErrore(e instanceof ErroreExcel ? e.message : 'Impossibile leggere il file: ' + messaggioErrore(e));
    } finally {
      setLettura(false);
    }
  };

  const anteprima: Anteprima | null = useMemo(() => {
    if (!fogli) return null;
    const righe = fogli.filter((f) => f.scelto && f.stagioneScelta).flatMap((f) =>
      f.formato === 'riorganizzato' ? f.righe : f.righe.map((r) => ({ ...r, stagione: f.stagioneScelta })));
    if (!righe.length) return null;
    const { gruppi } = raggruppa(righe);
    return { file, gruppi, confronto: confronta(l.gruppi, gruppi), righe: righe.length };
  }, [fogli, file, l.gruppi]);

  const annulla = () => { setFogli(null); setFile(''); setErrore(''); };

  const importa = async () => {
    if (!anteprima) return;
    const c = anteprima.confronto;
    const ok = await conferma({
      titolo: 'Confermi l\'aggiornamento del listino?',
      messaggio: (
        <div className="space-y-1">
          <p>{c.totali.nuovi} premi nuovi, {c.totali.aggiornati} aggiornati, {c.totali.invariati} invariati.</p>
          {c.conflitti.length > 0 && <p className="text-red-800">Attenzione: {c.conflitti.length} codici risultano già associati a un altro premio.</p>}
          {disattiva && c.assenti.length > 0 && <p className="text-amber-800">{c.assenti.length} versioni non presenti nel file saranno disattivate (non cancellate).</p>}
          <p className="text-sm text-slate-500">Prima di scrivere viene salvata una copia del listino attuale: potrai tornare indietro dallo storico.</p>
        </div>
      ),
      etichetta: 'Importa',
    });
    if (ok === null) return;
    setInvio(true);
    try {
      const r = await api<{ importazione: Importazione; listino: ListinoArchivio }>('importaListino',
        { file: anteprima.file, gruppi: perImportazione(anteprima.gruppi), disattiva_assenti: disattiva });
      l.imposta(r.listino);
      setEsito(r.importazione);
      setFogli(null);
      avvisa('successo', 'Listino aggiornato.');
    } catch (e) {
      avvisa('errore', messaggioErrore(e));
    } finally {
      setInvio(false);
    }
  };

  const ripristina = async (imp: Importazione) => {
    const ok = await conferma({
      titolo: 'Ripristinare il listino?',
      messaggio: <p>Il listino tornerà com'era <b>prima</b> dell'operazione {imp.id} del {dataOraIt(imp.timestamp)}{imp.file ? ` (${imp.file})` : ''}.
        Anche questo ripristino si potrà annullare.</p>,
      etichetta: 'Ripristina', pericolo: true,
    });
    if (ok === null) return;
    try {
      const r = await api<{ importazione: Importazione; listino: ListinoArchivio }>('ripristinaListino', { importazione_id: imp.id });
      l.imposta(r.listino);
      setEsito(null);
      avvisa('successo', 'Listino ripristinato.');
    } catch (e) {
      avvisa('errore', messaggioErrore(e));
    }
  };

  return (
    <div className="space-y-4">
      {esito && <Resoconto imp={esito} chiudi={() => setEsito(null)} />}

      {!fogli && (
        <div className="card p-4">
          <h2 className="font-semibold">Carica il file Excel dei premi</h2>
          <p className="mt-1 text-sm text-slate-600">
            Va bene il file del concorso (un foglio per stagione) o il file riorganizzato. Il file resta sul tuo computer:
            il programma lo legge, ti mostra cosa cambia e scrive solo dopo la tua conferma. I premi già in archivio non vengono mai cancellati.
          </p>
          <label onDragOver={(e) => { e.preventDefault(); setTrascina(true); }} onDragLeave={() => setTrascina(false)}
            onDrop={(e) => { e.preventDefault(); setTrascina(false); void apri(e.dataTransfer.files[0]); }}
            className={`mt-3 flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed px-4 py-8 text-center ${trascina ? 'border-brand-500 bg-brand-50' : 'border-slate-300 hover:bg-slate-50'}`}>
            <LuFileSpreadsheet size={32} className="text-emerald-700" aria-hidden />
            {lettura ? <Rotella testo={`Lettura di ${file}…`} /> : <>
              <span className="font-medium">Trascina qui il file .xlsx oppure <span className="text-brand-600 underline">sceglilo</span></span>
              <span className="text-xs text-slate-500">Nessun dato viene inviato finché non confermi.</span>
            </>}
            <input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="sr-only"
              onChange={(e) => { void apri(e.target.files?.[0]); e.target.value = ''; }} />
          </label>
          {errore && <p className="mt-3 flex items-start gap-2 rounded-md bg-red-50 p-3 text-red-800"><LuCircleAlert className="mt-0.5 shrink-0" /> {errore}</p>}
        </div>
      )}

      {fogli && (
        <div className="card p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 font-semibold"><LuFileSpreadsheet className="text-emerald-700" /> {file}</h2>
            <button className="btn-secondario" onClick={annulla}><LuX /> Annulla</button>
          </div>
          <h3 className="mt-3 label">Fogli trovati</h3>
          <div className="overflow-x-auto">
            <table className="tabella">
              <thead><tr><th>Usa</th><th>Foglio</th><th>Stagione</th><th className="num">Righe</th><th>Colonne riconosciute</th></tr></thead>
              <tbody>
                {fogli.map((f, i) => (
                  <tr key={f.nome}>
                    <td><input type="checkbox" checked={f.scelto} disabled={Boolean(f.scarto)} aria-label={`Usa il foglio ${f.nome}`}
                      onChange={(e) => setFogli(fogli.map((x, j) => (j === i ? { ...x, scelto: e.target.checked } : x)))} /></td>
                    <td className="font-medium">{f.nome}{f.formato === 'riorganizzato' && <span className="badge ml-1 bg-emerald-100 text-emerald-800">file riorganizzato</span>}</td>
                    <td>
                      {f.formato === 'riorganizzato' ? f.stagione : (
                        <input className={`input w-28 py-0.5 ${f.scelto && !/^\d{4}\/\d{4}$/.test(f.stagioneScelta) ? 'input-errore' : ''}`} value={f.stagioneScelta}
                          placeholder="2026/2027" aria-label={`Stagione del foglio ${f.nome}`} disabled={Boolean(f.scarto)}
                          onChange={(e) => setFogli(fogli.map((x, j) => (j === i ? { ...x, stagioneScelta: e.target.value.trim() } : x)))} />
                      )}
                    </td>
                    <td className="num">{f.righe.length}</td>
                    <td className="text-xs text-slate-600">
                      {f.scarto ? <span className="text-amber-800">{f.scarto}</span>
                        : f.colonne?.map((c) => <span key={c.campo} className="mr-2 inline-block" title={`Intestazione nel file: ${c.intestazione}`}><b>{c.campo}</b>: {c.intestazione}</span>)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {fogli && !anteprima && <div className="card"><Vuoto>Seleziona almeno un foglio con la stagione indicata (es. 2026/2027).</Vuoto></div>}
      {fogli && anteprima && (
        <AnteprimaImport a={anteprima} disattiva={disattiva} setDisattiva={setDisattiva} invio={invio} importa={importa} />
      )}

      <Storico importazioni={l.archivio?.importazioni ?? []} ripristina={ripristina} />
    </div>
  );
}

const NOMI_CAMPI_MOD: Record<string, string> = { punti: 'Punti', contributo: 'Contributo', descrizione: 'Descrizione', modalita: 'Modalità', premio: 'Premio', ean: 'EAN' };
const valoreMod = (campo: string, s: string) =>
  campo === 'contributo' ? euroIt(Number(s) || 0) : campo === 'punti' ? (s === '' ? '—' : puntiIt(Number(s))) : campo === 'modalita' ? (s === 'pieno' ? 'pieno' : 'con contributo') : s || '—';

function Sezione({ titolo, n, colore, aperta = false, children }: { titolo: string; n: number; colore: string; aperta?: boolean; children: ReactNode }) {
  if (!n) return null;
  return (
    <details className="card" open={aperta}>
      <summary className="flex cursor-pointer items-center gap-2 px-4 py-3 font-semibold select-none">
        <span className={`inline-block h-2.5 w-2.5 rounded-sm ${colore}`} aria-hidden /> {titolo} <span className="badge bg-slate-100 text-slate-700">{n}</span>
      </summary>
      <div className="max-h-[28rem] overflow-auto border-t border-slate-200">{children}</div>
    </details>
  );
}

function AnteprimaImport({ a, disattiva, setDisattiva, invio, importa }: {
  a: Anteprima; disattiva: boolean; setDisattiva: (b: boolean) => void; invio: boolean; importa: () => void;
}) {
  const c = a.confronto;
  const nuovi = c.gruppi.filter((g) => g.esito === 'nuovo');
  const aggiornati = c.gruppi.filter((g) => g.esito === 'aggiornato');
  const dubbi = c.gruppi.filter((g) => daVerificare(g.gruppo));
  const nienteDaFare = !nuovi.length && !aggiornati.length && !(disattiva && c.assenti.length);
  return (
    <>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Kpi titolo="Premi nel file" valore={a.gruppi.length.toLocaleString('it-IT')} nota={`${a.righe} codici`} />
        <Kpi titolo="Nuovi" valore={c.totali.nuovi} colore="#059669" nota={`${c.totali.variantiNuove} codici nuovi`} />
        <Kpi titolo="Aggiornati" valore={c.totali.aggiornati} colore="#2a78d6" nota={`${c.totali.variantiModificate} codici cambiati`} />
        <Kpi titolo="Invariati" valore={c.totali.invariati} colore="#94a3b8" />
        <Kpi titolo="Da verificare" valore={c.totali.daVerificare} colore="#d97706" />
        <Kpi titolo="Non nel file" valore={c.assenti.length} colore="#64748b" nota="restano in archivio" />
      </div>

      {c.conflitti.length > 0 && (
        <div className="card border-red-300 bg-red-50 p-4 text-red-900">
          <p className="flex items-center gap-2 font-semibold"><LuCircleAlert /> Codici già associati a un altro premio</p>
          <ul className="mt-1 list-disc pl-6 text-sm">
            {c.conflitti.map((x) => <li key={x.stagione + x.codice}><b>{x.codice}</b> ({x.stagione}): nel file è «{x.nuovo}», in archivio «{x.esistente}».</li>)}
          </ul>
          <p className="mt-1 text-sm">Se confermi, il codice passa al premio indicato nel file. Controlla prima che sia corretto.</p>
        </div>
      )}

      <Sezione titolo="Premi aggiornati" n={aggiornati.length} colore="bg-blue-500" aperta>
        <table className="tabella">
          <thead><tr><th>Premio</th><th>Stagione</th><th>Codice</th><th>Cosa cambia</th></tr></thead>
          <tbody>
            {aggiornati.flatMap((g) => {
              const righe = g.varianti.filter((v) => v.esito !== 'invariata');
              if (!righe.length) return [<tr key={g.gruppo.chiave}><td>{g.gruppo.nome}</td><td>{g.gruppo.stagione}</td><td>—</td><td>{g.nomePrima ? `Nome: ${g.nomePrima} → ${g.gruppo.nome}` : 'Versioni riorganizzate'}</td></tr>];
              return righe.map((v) => (
                <tr key={g.gruppo.chiave + v.variante.codice + v.variante.ean}>
                  <td>{g.gruppo.nome}</td><td>{g.gruppo.stagione}</td><td className="font-mono">{v.variante.codice}</td>
                  <td>{v.esito === 'nuova' ? <span className="text-emerald-700">Nuova versione: {puntiIt(v.variante.punti)} punti{v.variante.contributo ? ` + ${euroIt(v.variante.contributo)}` : ''}</span>
                    : v.modifiche.map((m) => <div key={m.campo}>{NOMI_CAMPI_MOD[m.campo]}: <s className="text-slate-500">{valoreMod(m.campo, m.prima)}</s> → <b>{valoreMod(m.campo, m.dopo)}</b></div>)}</td>
                </tr>
              ));
            })}
          </tbody>
        </table>
      </Sezione>

      <Sezione titolo="Premi nuovi" n={nuovi.length} colore="bg-emerald-600" aperta={nuovi.length <= 30}>
        <table className="tabella">
          <thead><tr><th>Premio</th><th>Stagione</th><th>Senza contributo</th><th>Con contributo</th></tr></thead>
          <tbody>
            {nuovi.slice(0, 500).map(({ gruppo: g }) => {
              const p = g.varianti.filter((v) => v.modalita === 'pieno');
              const ca = g.varianti.filter((v) => v.modalita === 'contributo');
              return (
                <tr key={g.chiave}>
                  <td>{g.nome}</td><td>{g.stagione}</td>
                  <td>{p.map((v) => <div key={v.codice + v.ean}><span className="font-mono">{v.codice}</span> · {puntiIt(v.punti)} pt</div>)}</td>
                  <td>{ca.map((v) => <div key={v.codice + v.ean}><span className="font-mono">{v.codice}</span> · {puntiIt(v.punti)} pt + {euroIt(v.contributo)}</div>)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {nuovi.length > 500 && <p className="p-3 text-sm text-slate-500">…e altri {nuovi.length - 500}.</p>}
      </Sezione>

      <Sezione titolo="Da verificare" n={dubbi.length} colore="bg-amber-500" aperta={dubbi.length <= 10}>
        <table className="tabella">
          <thead><tr><th>Premio</th><th>Stagione</th><th>Motivo</th></tr></thead>
          <tbody>
            {dubbi.map(({ gruppo: g }) => (
              <tr key={g.chiave}><td>{g.nome}</td><td>{g.stagione}</td>
                <td>{g.verifiche.filter((v) => v.livello === 'avviso').map((v, i) => <div key={i}>{v.testo}</div>)}</td></tr>
            ))}
          </tbody>
        </table>
        <p className="p-3 text-sm text-slate-500">Questi premi vengono importati comunque, con il segnale «Da verificare» nella ricerca.</p>
      </Sezione>

      <Sezione titolo="In archivio ma non nel file" n={c.assenti.length} colore="bg-slate-500">
        <table className="tabella">
          <thead><tr><th>Premio</th><th>Stagione</th><th>Codice</th></tr></thead>
          <tbody>{c.assenti.map((x) => <tr key={x.stagione + x.codice}><td>{x.nome}</td><td>{x.stagione}</td><td className="font-mono">{x.codice}</td></tr>)}</tbody>
        </table>
      </Sezione>

      <div className="card flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="space-y-1">
          {c.assenti.length > 0 && (
            <label className="flex items-start gap-2">
              <input type="checkbox" className="mt-1" checked={disattiva} onChange={(e) => setDisattiva(e.target.checked)} />
              <span>Disattiva i {c.assenti.length} codici non presenti nel file<br />
                <span className="text-xs text-slate-500">Non spariscono dall'archivio e si possono ripristinare. Lascia vuoto se il file contiene solo una parte dei premi.</span></span>
            </label>
          )}
          {nienteDaFare && <p className="flex items-center gap-2 text-slate-600"><LuInfo /> Il listino è già aggiornato: nessuna modifica da applicare.</p>}
        </div>
        <button className="btn-primario btn-grande" onClick={importa} disabled={invio || nienteDaFare}>
          {invio ? <Rotella testo="Importazione…" /> : <><LuUpload /> Conferma importazione</>}
        </button>
      </div>
    </>
  );
}

function Resoconto({ imp, chiudi }: { imp: Importazione; chiudi: () => void }) {
  const n = (s: string) => Number(s) || 0;
  return (
    <div className="card border-emerald-300 bg-emerald-50 p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="flex items-center gap-2 font-semibold text-emerald-900"><LuCheck /> Importazione completata ({imp.id})</p>
        <button className="btn-testo px-1.5 py-1" onClick={chiudi} aria-label="Chiudi"><LuX /></button>
      </div>
      <ul className="mt-2 grid gap-x-6 gap-y-0.5 text-sm text-emerald-950 sm:grid-cols-2 lg:grid-cols-4">
        <li>Aggiunti: <b>{n(imp.premi_nuovi)}</b> premi ({n(imp.varianti_nuove)} codici)</li>
        <li>Aggiornati: <b>{n(imp.premi_aggiornati)}</b> premi ({n(imp.varianti_aggiornate)} codici)</li>
        <li>Invariati: <b>{n(imp.premi_invariati)}</b></li>
        <li>Da verificare: <b>{n(imp.premi_da_verificare)}</b></li>
        <li>Non presenti nel file: <b>{n(imp.non_presenti)}</b>{n(imp.disattivati) ? ` (${n(imp.disattivati)} disattivati)` : ' (lasciati attivi)'}</li>
      </ul>
      <button className="btn-secondario mt-3" onClick={() => vai('ricerca')}><LuSearch /> Vai alla ricerca</button>
    </div>
  );
}

function Storico({ importazioni, ripristina }: { importazioni: Importazione[]; ripristina: (i: Importazione) => void }) {
  return (
    <div className="card">
      <h2 className="flex items-center gap-2 border-b border-slate-200 px-4 py-3 font-semibold"><LuHistory /> Storico aggiornamenti del listino</h2>
      {!importazioni.length ? <Vuoto>Nessuna importazione ancora.</Vuoto> : (
        <div className="overflow-x-auto">
          <table className="tabella">
            <thead><tr><th>Data</th><th>Operazione</th><th>File</th><th>Stagioni</th><th className="num">Nuovi</th><th className="num">Aggiornati</th><th className="num">Invariati</th><th className="num">Da verif.</th><th className="num">Non nel file</th><th>Operatore</th><th></th></tr></thead>
            <tbody>
              {importazioni.map((i) => (
                <tr key={i.id}>
                  <td className="whitespace-nowrap">{dataOraIt(i.timestamp)}</td>
                  <td>{i.tipo === 'ripristino' ? <span className="badge bg-violet-100 text-violet-800" title={i.note}>Ripristino</span> : <span className="badge bg-blue-100 text-blue-800">Importazione</span>} <span className="text-xs text-slate-400">{i.id}</span></td>
                  <td className="max-w-56 truncate" title={i.file || i.note}>{i.file || i.note}</td>
                  <td>{i.stagioni}</td>
                  <td className="num">{i.premi_nuovi}</td><td className="num">{i.premi_aggiornati}</td><td className="num">{i.premi_invariati}</td>
                  <td className="num">{i.premi_da_verificare}</td>
                  <td className="num">{i.non_presenti}{Number(i.disattivati) ? ` (${i.disattivati} disatt.)` : ''}</td>
                  <td>{i.operatore}</td>
                  <td>{i.ripristinabile === 'SI' && (
                    <button className="btn-testo px-2 py-1 text-xs" onClick={() => ripristina(i)} title="Riporta il listino com'era prima di questa operazione">
                      <LuRotateCcw /> Annulla
                    </button>
                  )}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="border-t border-slate-200 px-4 py-2 text-xs text-slate-500">
        Prima di ogni importazione o ripristino viene salvata una copia del listino (si conservano le ultime 10): «Annulla» riporta il listino com'era prima di quell'operazione.
      </p>
    </div>
  );
}
