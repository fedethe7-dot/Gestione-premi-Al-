/**
 * Calcolo delle statistiche. Regole:
 *  - si usano solo le operazioni con stato "valido" (le annullate sono escluse);
 *  - ogni trasferimento è contato UNA volta nei totali generali; "in uscita" e "in entrata"
 *    hanno senso solo dal punto di vista di un singolo PDV e non vanno sommati tra loro;
 *  - i resi sono una tipologia distinta e non modificano i trasferimenti.
 */
import type { Catalogo, Operazione } from './types.ts';

export type TipoFiltro = 'entrambi' | 'trasferimento' | 'reso';

export interface FiltriStat {
  da: string; a: string; catalogoId: string; premioId: string; pdvId: string; tipo: TipoFiltro;
}

export const filtriVuoti: FiltriStat = { da: '', a: '', catalogoId: '', premioId: '', pdvId: '', tipo: 'entrambi' };

export function coinvolgePdv(o: Operazione, pdvId: string): boolean {
  return o.pdvOrigineId === pdvId || o.pdvDestId === pdvId || o.pdvResoId === pdvId;
}

export function filtraValide(ops: Operazione[], f: FiltriStat): Operazione[] {
  return ops.filter((o) =>
    o.stato === 'valido' &&
    (!f.da || o.data >= f.da) &&
    (!f.a || o.data <= f.a) &&
    (!f.catalogoId || o.catalogoId === f.catalogoId) &&
    (!f.premioId || o.premioId === f.premioId) &&
    (!f.pdvId || coinvolgePdv(o, f.pdvId)) &&
    (f.tipo === 'entrambi' || o.tipo === f.tipo));
}

export interface Totali {
  nTrasf: number; qTrasf: number; nResi: number; qResi: number;
  pdvMovimentati: number; premiMovimentati: number;
  /** Valorizzati solo quando l'analisi riguarda un singolo PDV. */
  perPdv: null | { nUscita: number; qUscita: number; nEntrata: number; qEntrata: number };
}

export function totali(ops: Operazione[], pdvId = ''): Totali {
  const t: Totali = { nTrasf: 0, qTrasf: 0, nResi: 0, qResi: 0, pdvMovimentati: 0, premiMovimentati: 0, perPdv: null };
  const pdv = new Set<string>();
  const premi = new Set<string>();
  const p = { nUscita: 0, qUscita: 0, nEntrata: 0, qEntrata: 0 };
  for (const o of ops) {
    premi.add(o.premioId);
    if (o.tipo === 'trasferimento') {
      t.nTrasf++; t.qTrasf += o.quantita;
      pdv.add(o.pdvOrigineId); pdv.add(o.pdvDestId);
      if (pdvId && o.pdvOrigineId === pdvId) { p.nUscita++; p.qUscita += o.quantita; }
      if (pdvId && o.pdvDestId === pdvId) { p.nEntrata++; p.qEntrata += o.quantita; }
    } else {
      t.nResi++; t.qResi += o.quantita; pdv.add(o.pdvResoId);
    }
  }
  t.pdvMovimentati = pdv.size;
  t.premiMovimentati = premi.size;
  if (pdvId) t.perPdv = p;
  return t;
}

export interface Anagrafica { codice: string; nome: string }

export interface StatPdv {
  pdvId: string; codice: string; nome: string;
  nUscita: number; qUscita: number; nEntrata: number; qEntrata: number; nResi: number; qResi: number;
}

/** Statistiche per punto vendita. `anagrafica` fornisce codice e nome attuali (altrimenti quelli storici). */
export function statPerPdv(ops: Operazione[], anagrafica: Map<string, Anagrafica> = new Map()): StatPdv[] {
  const m = new Map<string, StatPdv>();
  const get = (id: string, codice: string, nome: string) => {
    let s = m.get(id);
    if (!s) {
      const a = anagrafica.get(id);
      s = { pdvId: id, codice: a?.codice ?? codice, nome: a?.nome ?? nome, nUscita: 0, qUscita: 0, nEntrata: 0, qEntrata: 0, nResi: 0, qResi: 0 };
      m.set(id, s);
    }
    return s;
  };
  for (const o of ops) {
    if (o.tipo === 'trasferimento') {
      const u = get(o.pdvOrigineId, o.pdvOrigineCodice, o.pdvOrigineNome); u.nUscita++; u.qUscita += o.quantita;
      const e = get(o.pdvDestId, o.pdvDestCodice, o.pdvDestNome); e.nEntrata++; e.qEntrata += o.quantita;
    } else {
      const r = get(o.pdvResoId, o.pdvResoCodice, o.pdvResoNome); r.nResi++; r.qResi += o.quantita;
    }
  }
  return [...m.values()];
}

export interface StatPremio {
  premioId: string; catalogoId: string; codice: string; descrizione: string;
  nTrasf: number; qTrasf: number; nResi: number; qResi: number;
  /** quantità resa / quantità trasferita, nello stesso insieme filtrato. null se nulla è stato trasferito. */
  tassoReso: number | null;
  pdvCoinvolti: number;
  /** Solo con un PDV selezionato: quantità ricevute e inviate da quel PDV. */
  qEntrata: number; qUscita: number;
}

export function tassoReso(qResi: number, qTrasf: number): number | null {
  return qTrasf > 0 ? qResi / qTrasf : null;
}

export function statPerPremio(ops: Operazione[], pdvId = ''): StatPremio[] {
  const m = new Map<string, StatPremio & { _pdv: Set<string> }>();
  for (const o of ops) {
    let s = m.get(o.premioId);
    if (!s) {
      s = { premioId: o.premioId, catalogoId: o.catalogoId, codice: o.premioCodice, descrizione: o.premioDescrizione,
        nTrasf: 0, qTrasf: 0, nResi: 0, qResi: 0, tassoReso: null, pdvCoinvolti: 0, qEntrata: 0, qUscita: 0, _pdv: new Set() };
      m.set(o.premioId, s);
    }
    if (o.tipo === 'trasferimento') {
      s.nTrasf++; s.qTrasf += o.quantita; s._pdv.add(o.pdvOrigineId); s._pdv.add(o.pdvDestId);
      if (pdvId && o.pdvDestId === pdvId) s.qEntrata += o.quantita;
      if (pdvId && o.pdvOrigineId === pdvId) s.qUscita += o.quantita;
    } else {
      s.nResi++; s.qResi += o.quantita; s._pdv.add(o.pdvResoId);
    }
  }
  return [...m.values()].map(({ _pdv, ...s }) => ({ ...s, tassoReso: tassoReso(s.qResi, s.qTrasf), pdvCoinvolti: _pdv.size }));
}

export interface PuntoMensile { mese: string; nTrasf: number; qTrasf: number; nResi: number; qResi: number }

export function andamentoMensile(ops: Operazione[]): PuntoMensile[] {
  if (!ops.length) return [];
  const m = new Map<string, PuntoMensile>();
  let min = '9999-12', max = '0000-01';
  for (const o of ops) {
    const k = o.data.slice(0, 7);
    if (k < min) min = k;
    if (k > max) max = k;
    let p = m.get(k);
    if (!p) { p = { mese: k, nTrasf: 0, qTrasf: 0, nResi: 0, qResi: 0 }; m.set(k, p); }
    if (o.tipo === 'trasferimento') { p.nTrasf++; p.qTrasf += o.quantita; } else { p.nResi++; p.qResi += o.quantita; }
  }
  // Mesi senza movimenti inclusi con valore zero (massimo 10 anni).
  const out: PuntoMensile[] = [];
  let [y, mo] = min.split('-').map(Number);
  for (let i = 0; i < 120; i++) {
    const k = `${y}-${String(mo).padStart(2, '0')}`;
    out.push(m.get(k) ?? { mese: k, nTrasf: 0, qTrasf: 0, nResi: 0, qResi: 0 });
    if (k >= max) break;
    mo++; if (mo > 12) { mo = 1; y++; }
  }
  return out;
}

export interface StatCausale { causale: string; n: number; q: number }

export function perCausale(ops: Operazione[]): { trasferimenti: StatCausale[]; resi: StatCausale[] } {
  const agg = (tipo: string) => {
    const m = new Map<string, StatCausale>();
    for (const o of ops) {
      if (o.tipo !== tipo) continue;
      const k = o.causale || 'Non indicata';
      const s = m.get(k) ?? { causale: k, n: 0, q: 0 };
      s.n++; s.q += o.quantita; m.set(k, s);
    }
    return [...m.values()].sort((a, b) => b.q - a.q || a.causale.localeCompare(b.causale));
  };
  return { trasferimenti: agg('trasferimento'), resi: agg('reso') };
}

export interface StatCatalogo {
  catalogoId: string; codice: string; nome: string;
  nTrasf: number; qTrasf: number; nResi: number; qResi: number; premiMovimentati: number; pdvMovimentati: number;
  tassoReso: number | null;
}

export function perCatalogo(ops: Operazione[], cataloghi: Catalogo[]): StatCatalogo[] {
  return cataloghi.map((c) => {
    const t = totali(ops.filter((o) => o.catalogoId === c.id));
    return { catalogoId: c.id, codice: c.codice, nome: c.nome, nTrasf: t.nTrasf, qTrasf: t.qTrasf, nResi: t.nResi, qResi: t.qResi,
      premiMovimentati: t.premiMovimentati, pdvMovimentati: t.pdvMovimentati, tassoReso: tassoReso(t.qResi, t.qTrasf) };
  });
}

export interface MovimentoPdvPremio { id: string; codice: string; nome: string; qUscita: number; qEntrata: number; qResi: number }

/** Per un PDV: quali premi ha inviato, ricevuto e reso. */
export function premiDelPdv(ops: Operazione[], pdvId: string): MovimentoPdvPremio[] {
  const m = new Map<string, MovimentoPdvPremio>();
  for (const o of ops) {
    if (!coinvolgePdv(o, pdvId)) continue;
    const s = m.get(o.premioId) ?? { id: o.premioId, codice: o.premioCodice, nome: o.premioDescrizione, qUscita: 0, qEntrata: 0, qResi: 0 };
    if (o.tipo === 'trasferimento') {
      if (o.pdvOrigineId === pdvId) s.qUscita += o.quantita;
      if (o.pdvDestId === pdvId) s.qEntrata += o.quantita;
    } else s.qResi += o.quantita;
    m.set(o.premioId, s);
  }
  return [...m.values()].sort((a, b) => (b.qUscita + b.qEntrata + b.qResi) - (a.qUscita + a.qEntrata + a.qResi));
}

/** Per un premio: quali PDV lo hanno inviato, ricevuto e reso. */
export function pdvDelPremio(ops: Operazione[], premioId: string, anagrafica: Map<string, Anagrafica> = new Map()): MovimentoPdvPremio[] {
  return statPerPdv(ops.filter((o) => o.premioId === premioId), anagrafica)
    .map((s) => ({ id: s.pdvId, codice: s.codice, nome: s.nome, qUscita: s.qUscita, qEntrata: s.qEntrata, qResi: s.qResi }))
    .sort((a, b) => (b.qUscita + b.qEntrata + b.qResi) - (a.qUscita + a.qEntrata + a.qResi));
}
