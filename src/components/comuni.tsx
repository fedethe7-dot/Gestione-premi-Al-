import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { LuArrowUpDown, LuChevronDown, LuChevronLeft, LuChevronRight, LuChevronUp, LuLoader } from 'react-icons/lu';
import { BOM, creaCsv, nomeFile, type Colonna, type Separatore } from '../lib/csv.ts';
import { giorniFa, num, oggiIso, primoDelMese } from '../lib/format.ts';
import type { Catalogo, Stato, TipoOperazione } from '../lib/types.ts';

export function Intestazione({ titolo, sottotitolo, azioni }: { titolo: string; sottotitolo?: ReactNode; azioni?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{titolo}</h1>
        {sottotitolo && <p className="mt-0.5 text-slate-600">{sottotitolo}</p>}
      </div>
      {azioni && <div className="flex flex-wrap gap-2">{azioni}</div>}
    </div>
  );
}

export function Campo({ etichetta, per, errore, aiuto, children, obbligatorio, className }: {
  etichetta: string; per?: string; errore?: string; aiuto?: ReactNode; children: ReactNode; obbligatorio?: boolean; className?: string;
}) {
  return (
    <div className={className}>
      <label className="label" htmlFor={per}>{etichetta}{obbligatorio && <span className="text-red-600"> *</span>}</label>
      {children}
      {errore ? <p className="mt-1 text-sm text-red-700">{errore}</p> : aiuto ? <p className="mt-1 text-xs text-slate-500">{aiuto}</p> : null}
    </div>
  );
}

export function Kpi({ titolo, valore, nota, colore }: { titolo: string; valore: ReactNode; nota?: ReactNode; colore?: string }) {
  return (
    <div className="card px-4 py-3">
      <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
        {colore && <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: colore }} aria-hidden />}
        {titolo}
      </div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{valore}</div>
      {nota && <div className="mt-0.5 text-xs text-slate-500">{nota}</div>}
    </div>
  );
}

export function Vuoto({ children }: { children: ReactNode }) {
  return <div className="px-4 py-10 text-center text-slate-500">{children}</div>;
}

export function Rotella({ testo = 'Caricamento…' }: { testo?: string }) {
  return <span className="inline-flex items-center gap-2 text-slate-500"><LuLoader className="animate-spin" /> {testo}</span>;
}

export function TipoBadge({ tipo }: { tipo: TipoOperazione }) {
  if (tipo === 'assegnazione') return <span className="badge bg-violet-100 text-violet-800">Assegnazione</span>;
  return tipo === 'trasferimento'
    ? <span className="badge bg-blue-100 text-blue-800">Trasferimento</span>
    : <span className="badge bg-orange-100 text-orange-800">Reso</span>;
}

export function StatoBadge({ stato }: { stato: Stato }) {
  return stato === 'valido'
    ? <span className="badge bg-emerald-50 text-emerald-700">Valido</span>
    : <span className="badge bg-slate-200 text-slate-700 line-through decoration-slate-400">Annullato</span>;
}

export function AttivoBadge({ attivo }: { attivo: string }) {
  return attivo === 'SI' ? <span className="badge bg-emerald-50 text-emerald-700">Attivo</span> : <span className="badge bg-slate-200 text-slate-600">Non attivo</span>;
}

/* ---------------------------------------------------------- ordinamento */

export type Direzione = 'asc' | 'desc';
export interface Ordine<K extends string> { chiave: K; dir: Direzione }

export function useOrdinamento<T, K extends string>(righe: T[], iniziale: Ordine<NoInfer<K>>, valori: Record<K, (r: T) => string | number>) {
  const [ordine, setOrdine] = useState<Ordine<K>>(iniziale);
  const ordinate = useMemo(() => {
    const f = valori[ordine.chiave];
    const m = ordine.dir === 'asc' ? 1 : -1;
    return [...righe].sort((a, b) => {
      const x = f(a), y = f(b);
      return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'it', { numeric: true })) * m;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [righe, ordine]);
  const cambia = (chiave: K) => setOrdine((o) => {
    if (o.chiave === chiave) return { chiave, dir: o.dir === 'desc' ? 'asc' : 'desc' };
    const numerica = righe.length > 0 && typeof valori[chiave](righe[0]) === 'number';
    return { chiave, dir: numerica ? 'desc' : 'asc' };
  });
  return { ordinate, ordine, cambia };
}

export function Th<K extends string>({ chiave, ordine, cambia, children, num: numerica, title }: {
  chiave: K; ordine: Ordine<K>; cambia: (k: K) => void; children: ReactNode; num?: boolean; title?: string;
}) {
  const att = ordine.chiave === chiave;
  return (
    <th className={numerica ? 'num' : ''} aria-sort={att ? (ordine.dir === 'asc' ? 'ascending' : 'descending') : 'none'} title={title}>
      <button type="button" className={`inline-flex items-center gap-1 uppercase hover:text-slate-900 ${numerica ? 'flex-row-reverse' : ''}`} onClick={() => cambia(chiave)}>
        {children}
        {att ? (ordine.dir === 'asc' ? <LuChevronUp /> : <LuChevronDown />) : <LuArrowUpDown className="opacity-40" />}
      </button>
    </th>
  );
}

/* ---------------------------------------------------------- paginazione */

export function usePagine<T>(righe: T[], perPagina = 50) {
  const [pagina, setPagina] = useState(1);
  const totPagine = Math.max(1, Math.ceil(righe.length / perPagina));
  const p = Math.min(pagina, totPagine);
  return { visibili: righe.slice((p - 1) * perPagina, p * perPagina), pagina: p, totPagine, setPagina, perPagina, totale: righe.length };
}

export function Paginazione({ pagina, totPagine, setPagina, totale, perPagina }: { pagina: number; totPagine: number; setPagina: (n: number) => void; totale: number; perPagina: number }) {
  if (totale === 0) return null;
  const da = (pagina - 1) * perPagina + 1;
  const a = Math.min(pagina * perPagina, totale);
  return (
    <div className="flex items-center justify-between border-t border-slate-200 px-3 py-2 text-sm text-slate-600">
      <span>{num(da)}–{num(a)} di {num(totale)}</span>
      {totPagine > 1 && (
        <div className="flex items-center gap-1">
          <button className="btn-secondario px-2" disabled={pagina <= 1} onClick={() => setPagina(pagina - 1)} aria-label="Pagina precedente"><LuChevronLeft /></button>
          <span className="px-2">Pagina {pagina} di {totPagine}</span>
          <button className="btn-secondario px-2" disabled={pagina >= totPagine} onClick={() => setPagina(pagina + 1)} aria-label="Pagina successiva"><LuChevronRight /></button>
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------- barra di confronto in tabella */

export function Barra({ valore, massimo, colore }: { valore: number; massimo: number; colore: string }) {
  const w = massimo > 0 ? Math.max(valore > 0 ? 2 : 0, (valore / massimo) * 100) : 0;
  return (
    <div className="h-2 w-full min-w-16 rounded-full bg-slate-100" aria-hidden>
      <div className="h-2 rounded-full" style={{ width: `${w}%`, background: colore }} />
    </div>
  );
}

/* ---------------------------------------------------------- download CSV */

export function scaricaTesto(contenuto: string, nome: string, tipo = 'text/csv;charset=utf-8') {
  const blob = new Blob([contenuto], { type: tipo });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = nome;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function scaricaCsv<T>(tipo: string, righe: T[], colonne: Colonna<T>[], sep: Separatore): number {
  scaricaTesto(BOM + creaCsv(righe, colonne, sep), nomeFile(tipo));
  return righe.length;
}

/* ---------------------------------------------------------- filtro periodo */

export interface Periodo { da: string; a: string }

export function presetPeriodi(cataloghi: Catalogo[]): { etichetta: string; periodo: Periodo }[] {
  const oggi = new Date();
  const out = [
    { etichetta: 'Mese corrente', periodo: { da: primoDelMese(oggi), a: oggiIso(oggi) } },
    { etichetta: 'Ultimi 30 giorni', periodo: { da: giorniFa(29, oggi), a: oggiIso(oggi) } },
    { etichetta: 'Anno corrente', periodo: { da: `${oggi.getFullYear()}-01-01`, a: oggiIso(oggi) } },
    { etichetta: 'Tutto', periodo: { da: '', a: '' } },
  ];
  for (const c of cataloghi) if (c.data_inizio || c.data_fine) out.push({ etichetta: `Stagione ${c.codice}`, periodo: { da: c.data_inizio, a: c.data_fine } });
  return out;
}

export function FiltroPeriodo({ periodo, onChange, cataloghi, idBase }: { periodo: Periodo; onChange: (p: Periodo) => void; cataloghi: Catalogo[]; idBase: string }) {
  const preset = presetPeriodi(cataloghi);
  const sel = preset.findIndex((p) => p.periodo.da === periodo.da && p.periodo.a === periodo.a);
  return (
    <>
      <div>
        <label className="label" htmlFor={idBase + '-preset'}>Periodo</label>
        <select id={idBase + '-preset'} className="input" value={sel >= 0 ? String(sel) : 'x'}
          onChange={(e) => { const p = preset[Number(e.target.value)]; if (p) onChange(p.periodo); }}>
          {preset.map((p, i) => <option key={i} value={String(i)}>{p.etichetta}</option>)}
          {sel < 0 && <option value="x">Personalizzato</option>}
        </select>
      </div>
      <div>
        <label className="label" htmlFor={idBase + '-da'}>Dal</label>
        <input id={idBase + '-da'} type="date" className="input" value={periodo.da} onChange={(e) => onChange({ ...periodo, da: e.target.value })} />
      </div>
      <div>
        <label className="label" htmlFor={idBase + '-a'}>Al</label>
        <input id={idBase + '-a'} type="date" className="input" value={periodo.a} onChange={(e) => onChange({ ...periodo, a: e.target.value })} />
      </div>
    </>
  );
}

export function SelettoreCatalogo({ id, valore, onChange, cataloghi, tutti = true }: { id: string; valore: string; onChange: (v: string) => void; cataloghi: Catalogo[]; tutti?: boolean }) {
  return (
    <select id={id} className="input" value={valore} onChange={(e) => onChange(e.target.value)}>
      {tutti && <option value="">Tutti i cataloghi</option>}
      {cataloghi.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
    </select>
  );
}
