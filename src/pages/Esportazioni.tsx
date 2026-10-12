import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { LuCloudUpload, LuDatabaseBackup, LuDownload, LuExternalLink, LuFileDown, LuRotateCcw, LuTriangleAlert } from 'react-icons/lu';
import { FiltroPeriodo, Intestazione, scaricaCsv, scaricaTesto, SelettoreCatalogo, type Periodo } from '../components/comuni.tsx';
import { messaggioErrore } from '../lib/api.ts';
import { colonnePdv, colonnePremi, colonneResi, colonneStatPdv, colonneStatPremio, colonneStorico, colonneTrasferimenti } from '../lib/esportazioni.ts';
import { dataOraIt, num } from '../lib/format.ts';
import { confrontaOp } from '../lib/operazioni.ts';
import { filtraValide, statPerPdv, statPerPremio } from '../lib/statistiche.ts';
import { useDati } from '../state/dati.tsx';
import { useUi } from '../state/ui.tsx';

interface Backup { formato: string; schema: number; creato_il: string; nome_database: string; fogli: Record<string, { intestazioni: string[]; righe: string[][] }> }

export function PaginaEsportazioni() {
  const { dati, operazioni, cataloghiOrdinati, mappe, cfg, api, ricarica } = useDati();
  const { avvisa, conferma } = useUi();
  const [periodo, setPeriodo] = useState<Periodo>({ da: '', a: '' });
  const [catalogo, setCatalogo] = useState('');
  const [annullate, setAnnullate] = useState(true);
  const [catPremi, setCatPremi] = useState('');
  const [inCorso, setInCorso] = useState('');
  const [ultimaCopia, setUltimaCopia] = useState<{ nome: string; url: string } | null>(null);

  const ops = useMemo(() => operazioni.filter((o) =>
    (annullate || o.stato === 'valido') && (!periodo.da || o.data >= periodo.da) && (!periodo.a || o.data <= periodo.a) && (!catalogo || o.catalogoId === catalogo))
    .sort(confrontaOp), [operazioni, periodo, catalogo, annullate]);
  const valide = useMemo(() => filtraValide(operazioni, { ...periodo, catalogoId: catalogo, premioId: '', pdvId: '', tipo: 'entrambi' }), [operazioni, periodo, catalogo]);
  const anag = useMemo(() => new Map(dati!.pdv.map((p) => [p.id, { codice: p.codice, nome: p.nome }])), [dati]);
  const trasf = ops.filter((o) => o.tipo === 'trasferimento');
  const resi = ops.filter((o) => o.tipo === 'reso');
  const premi = dati!.premi.filter((p) => !catPremi || p.catalogo_id === catPremi)
    .sort((a, b) => a.catalogo_id.localeCompare(b.catalogo_id) || (a.codice || a.descrizione).localeCompare(b.codice || b.descrizione, 'it', { numeric: true }));
  const statPdv = useMemo(() => statPerPdv(valide, anag).sort((a, b) => a.codice.localeCompare(b.codice, 'it', { numeric: true })), [valide, anag]);
  const statPremi = useMemo(() => statPerPremio(valide).sort((a, b) => b.qTrasf - a.qTrasf), [valide]);

  const esporta = (n: number) => avvisa('successo', `File CSV creato con ${num(n)} righe.`);
  const sep = cfg.separatore;

  const copiaDrive = async () => {
    setInCorso('drive');
    try {
      const r = await api<{ nome: string; url: string }>('backupDrive');
      setUltimaCopia(r);
      avvisa('successo', 'Copia di sicurezza creata su Google Drive.');
    } catch (e) { avvisa('errore', messaggioErrore(e)); } finally { setInCorso(''); }
  };

  const scaricaBackup = async () => {
    setInCorso('json');
    try {
      const b = await api<Backup>('exportBackup');
      const n = Object.values(b.fogli).reduce((s, f) => s + f.righe.length, 0);
      const stamp = b.creato_il.slice(0, 16).replace(/[:T]/g, '-');
      scaricaTesto(JSON.stringify(b), `backup-gestionale-premi_${stamp}.json`, 'application/json');
      avvisa('successo', `Backup scaricato (${num(n)} righe in ${Object.keys(b.fogli).length} tabelle).`);
    } catch (e) { avvisa('errore', messaggioErrore(e)); } finally { setInCorso(''); }
  };

  const ripristina = async (file: File) => {
    let b: Backup;
    try {
      b = JSON.parse(await file.text());
      if (b.formato !== 'gestionale-premi-backup' || !b.fogli) throw new Error();
    } catch { avvisa('errore', 'Il file scelto non è un backup valido di questo gestionale.'); return; }
    const conteggio = (n: string) => b.fogli[n]?.righe.length ?? 0;
    const ok = await conferma({
      titolo: 'Ripristinare il backup?',
      pericolo: true,
      etichetta: 'Ripristina',
      parolaChiave: 'RIPRISTINA',
      messaggio: (
        <>
          <p>Backup del <b>{dataOraIt(b.creato_il)}</b> ({b.nome_database}):</p>
          <ul className="list-disc pl-5 text-sm">
            <li>{num(conteggio('PDV'))} punti vendita, {num(conteggio('Premi'))} premi, {num(conteggio('Cataloghi'))} cataloghi</li>
            <li>{num(conteggio('Trasferimenti'))} trasferimenti, {num(conteggio('Resi'))} resi</li>
          </ul>
          <p className="flex gap-2 rounded-md bg-red-50 p-2 text-red-900"><LuTriangleAlert className="mt-0.5 shrink-0" />
            Tutti i dati attuali verranno sostituiti da quelli del backup. Prima del ripristino viene creata in automatico una copia di sicurezza dello stato attuale su Google Drive.</p>
        </>
      ),
    });
    if (ok === null) return;
    setInCorso('ripristino');
    try {
      const r = await api<{ conteggi: Record<string, number>; copia_sicurezza: { nome: string; url: string } }>('restoreBackup', { backup: b, conferma: 'RIPRISTINA' });
      setUltimaCopia(r.copia_sicurezza);
      await ricarica();
      avvisa('successo', `Backup ripristinato: ${num(r.conteggi.Trasferimenti ?? 0)} trasferimenti e ${num(r.conteggi.Resi ?? 0)} resi.`);
    } catch (e) { avvisa('errore', messaggioErrore(e)); } finally { setInCorso(''); }
  };

  return (
    <div className="max-w-5xl space-y-5">
      <Intestazione titolo="Esportazioni e backup" />

      <section className="card p-5">
        <h2 className="text-lg font-semibold">Esportazione CSV</h2>
        <p className="mb-3 text-slate-600">File in UTF-8 per Excel, separatore «{sep}» (modificabile in Impostazioni). Per esportare i risultati di una ricerca usa il pulsante nello Storico o nelle Statistiche.</p>
        <div className="mb-4 grid grid-cols-2 gap-3 rounded-md bg-slate-50 p-3 md:grid-cols-4">
          <FiltroPeriodo idBase="exp" periodo={periodo} onChange={setPeriodo} cataloghi={cataloghiOrdinati} />
          <div><label className="label" htmlFor="exp-cat">Catalogo</label><SelettoreCatalogo id="exp-cat" valore={catalogo} onChange={setCatalogo} cataloghi={cataloghiOrdinati} /></div>
          <label className="col-span-2 inline-flex items-center gap-2 text-sm md:col-span-4">
            <input type="checkbox" checked={annullate} onChange={(e) => setAnnullate(e.target.checked)} />
            Includi le operazioni annullate negli elenchi (colonna «Stato»). Le statistiche escludono sempre le annullate.
          </label>
        </div>
        <div className="grid gap-2 md:grid-cols-2">
          <RigaExport titolo="Trasferimenti" n={trasf.length} onClick={() => esporta(scaricaCsv('trasferimenti', trasf, colonneTrasferimenti(mappe.cataloghi), sep))} />
          <RigaExport titolo="Resi" n={resi.length} onClick={() => esporta(scaricaCsv('resi', resi, colonneResi(mappe.cataloghi), sep))} />
          <RigaExport titolo="Storico completo (trasferimenti e resi)" n={ops.length} onClick={() => esporta(scaricaCsv('storico', ops, colonneStorico(mappe.cataloghi), sep))} />
          <RigaExport titolo="Statistiche per PDV" n={statPdv.length} nota="aggregate, solo operazioni valide" onClick={() => esporta(scaricaCsv('statistiche-pdv', statPdv, colonneStatPdv, sep))} />
          <RigaExport titolo="Statistiche per premio" n={statPremi.length} nota="aggregate, solo operazioni valide" onClick={() => esporta(scaricaCsv('statistiche-premi', statPremi, colonneStatPremio(mappe.cataloghi, false), sep))} />
          <RigaExport titolo="Punti vendita" n={dati!.pdv.length} nota="intero archivio" onClick={() => esporta(scaricaCsv('punti-vendita', [...dati!.pdv].sort((a, b) => a.codice.localeCompare(b.codice, 'it', { numeric: true })), colonnePdv, sep))} />
          <RigaExport titolo="Catalogo premi" n={premi.length}
            extra={<select className="input w-44 py-1" aria-label="Catalogo da esportare" value={catPremi} onChange={(e) => setCatPremi(e.target.value)}>
              <option value="">Tutti i cataloghi</option>{cataloghiOrdinati.map((c) => <option key={c.id} value={c.id}>{c.codice}</option>)}</select>}
            onClick={() => esporta(scaricaCsv(catPremi ? `catalogo-${mappe.cataloghi.get(catPremi)?.codice.replace('/', '-')}` : 'cataloghi-premi', premi, colonnePremi(mappe.cataloghi), sep))} />
        </div>
      </section>

      <section className="card p-5">
        <h2 className="text-lg font-semibold">Backup e ripristino</h2>
        <p className="mb-4 text-slate-600">Il backup comprende <b>tutte</b> le tabelle: cataloghi, premi, PDV, causali, trasferimenti, resi, registro delle modifiche e contatori.</p>
        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-md border border-slate-200 p-4">
            <h3 className="flex items-center gap-2 font-semibold"><LuCloudUpload /> Copia su Google Drive</h3>
            <p className="my-2 text-sm text-slate-600">Duplica l'intero Foglio Google nella cartella «Backup Gestionale Premi» del tuo Drive.</p>
            <button className="btn-primario" disabled={!!inCorso} onClick={copiaDrive}>{inCorso === 'drive' ? 'Copia in corso…' : 'Crea copia ora'}</button>
          </div>
          <div className="rounded-md border border-slate-200 p-4">
            <h3 className="flex items-center gap-2 font-semibold"><LuDatabaseBackup /> Scarica backup</h3>
            <p className="my-2 text-sm text-slate-600">Un file .json con tutti i dati, da conservare (ad esempio sul PC o in una cartella di rete).</p>
            <button className="btn-secondario" disabled={!!inCorso} onClick={scaricaBackup}><LuDownload /> {inCorso === 'json' ? 'Preparazione…' : 'Scarica backup .json'}</button>
          </div>
          <div className="rounded-md border border-red-200 p-4">
            <h3 className="flex items-center gap-2 font-semibold text-red-900"><LuRotateCcw /> Ripristina</h3>
            <p className="my-2 text-sm text-slate-600">Sostituisce i dati attuali con quelli di un backup .json. Prima crea una copia di sicurezza.</p>
            <label className={`btn-secondario cursor-pointer ${inCorso ? 'pointer-events-none opacity-50' : ''}`}>
              {inCorso === 'ripristino' ? 'Ripristino in corso…' : 'Scegli file di backup…'}
              <input type="file" accept=".json,application/json" className="sr-only" aria-label="File di backup da ripristinare"
                onChange={(e: { target: HTMLInputElement }) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void ripristina(f); }} />
            </label>
          </div>
        </div>
        {ultimaCopia && (
          <p className="mt-3 rounded-md bg-emerald-50 px-3 py-2 text-emerald-900">Ultima copia: {ultimaCopia.nome} —{' '}
            <a className="underline" href={ultimaCopia.url} target="_blank" rel="noreferrer">apri su Drive <LuExternalLink className="inline" /></a></p>
        )}
        <details className="mt-4 text-sm text-slate-600">
          <summary className="cursor-pointer font-medium text-slate-700">Altri modi per recuperare i dati</summary>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Nel Foglio Google: <b>File › Cronologia delle versioni</b> permette di tornare a qualsiasi versione precedente.</li>
            <li>Da una copia su Drive: apri la copia, poi Estensioni › Apps Script, e distribuisci lo script come nuova web app; oppure copia i fogli nel database originale.</li>
            <li>Per i backup automatici ogni notte, esegui una volta la funzione <code>installaBackupGiornaliero</code> nell'editor Apps Script.</li>
          </ul>
        </details>
      </section>
    </div>
  );
}

function RigaExport({ titolo, n, nota, onClick, extra }: { titolo: string; n: number; nota?: string; onClick: () => void; extra?: ReactNode }) {
  return (
    <div className="flex items-center gap-3 rounded-md border border-slate-200 px-3 py-2">
      <div className="flex-1">
        <div className="font-medium">{titolo}</div>
        <div className="text-xs text-slate-500">{num(n)} righe{nota ? ` · ${nota}` : ''}</div>
      </div>
      {extra}
      <button className="btn-secondario" onClick={onClick} disabled={n === 0}><LuFileDown /> CSV</button>
    </div>
  );
}
