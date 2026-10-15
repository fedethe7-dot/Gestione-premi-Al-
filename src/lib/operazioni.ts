import type { Assegnazione, Operazione, Reso, TipoOperazione, Trasferimento } from './types.ts';

/** Da dove partono le assegnazioni (valore predefinito se il server non lo indica). */
export const MAGAZZINO = 'Magazzino via Svezia 04';

export function daTrasferimento(t: Trasferimento): Operazione {
  return {
    tipo: 'trasferimento', id: t.id, data: t.data, catalogoId: t.catalogo_id,
    premioId: t.premio_id, premioCodice: t.premio_codice, premioDescrizione: t.premio_descrizione,
    pdvOrigineId: t.pdv_origine_id, pdvOrigineCodice: t.pdv_origine_codice, pdvOrigineNome: t.pdv_origine_nome,
    pdvDestId: t.pdv_destinazione_id, pdvDestCodice: t.pdv_destinazione_codice, pdvDestNome: t.pdv_destinazione_nome,
    pdvResoId: '', pdvResoCodice: '', pdvResoNome: '',
    quantita: parseInt(t.quantita, 10) || 0, causale: t.causale, riferimento: t.riferimento, note: t.note,
    stato: t.stato, trasferimentoId: '', prenotazione: '',
    creatoIl: t.creato_il, creatoDa: t.creato_da, modificatoIl: t.modificato_il, modificatoDa: t.modificato_da,
    annullatoIl: t.annullato_il, motivoAnnullamento: t.motivo_annullamento,
  };
}

export function daReso(r: Reso): Operazione {
  return {
    tipo: 'reso', id: r.id, data: r.data, catalogoId: r.catalogo_id,
    premioId: r.premio_id, premioCodice: r.premio_codice, premioDescrizione: r.premio_descrizione,
    pdvOrigineId: '', pdvOrigineCodice: '', pdvOrigineNome: '',
    pdvDestId: '', pdvDestCodice: '', pdvDestNome: '',
    pdvResoId: r.pdv_id, pdvResoCodice: r.pdv_codice, pdvResoNome: r.pdv_nome,
    quantita: parseInt(r.quantita, 10) || 0, causale: r.causale, riferimento: r.riferimento, note: r.note,
    stato: r.stato, trasferimentoId: r.trasferimento_id, prenotazione: '',
    creatoIl: r.creato_il, creatoDa: r.creato_da, modificatoIl: r.modificato_il, modificatoDa: r.modificato_da,
    annullatoIl: r.annullato_il, motivoAnnullamento: r.motivo_annullamento,
  };
}

export function daAssegnazione(a: Assegnazione, magazzino = MAGAZZINO): Operazione {
  return {
    tipo: 'assegnazione', id: a.id, data: a.data, catalogoId: a.catalogo_id,
    premioId: a.premio_id, premioCodice: a.premio_codice, premioDescrizione: a.premio_descrizione,
    pdvOrigineId: '', pdvOrigineCodice: '', pdvOrigineNome: magazzino,
    pdvDestId: a.pdv_id, pdvDestCodice: a.pdv_codice, pdvDestNome: a.pdv_nome,
    pdvResoId: '', pdvResoCodice: '', pdvResoNome: '',
    quantita: parseInt(a.quantita, 10) || 0, causale: a.causale, riferimento: a.riferimento, note: a.note,
    stato: a.stato, trasferimentoId: '', prenotazione: a.prenotazione ?? '',
    creatoIl: a.creato_il, creatoDa: a.creato_da, modificatoIl: a.modificato_il, modificatoDa: a.modificato_da,
    annullatoIl: a.annullato_il, motivoAnnullamento: a.motivo_annullamento,
  };
}

export function unisci(trasferimenti: Trasferimento[], resi: Reso[], assegnazioni: Assegnazione[] = [], magazzino = MAGAZZINO): Operazione[] {
  return [...trasferimenti.map(daTrasferimento), ...resi.map(daReso), ...assegnazioni.map((a) => daAssegnazione(a, magazzino))];
}

/** Ordine: data, poi momento di registrazione, poi identificativo. */
export function confrontaOp(a: Operazione, b: Operazione): number {
  return a.data.localeCompare(b.data) || a.creatoIl.localeCompare(b.creatoIl) || a.id.localeCompare(b.id);
}

/** Nome della raccolta di dati che contiene le operazioni di un certo tipo. */
export function raccoltaDi(tipo: TipoOperazione): 'trasferimenti' | 'resi' | 'assegnazioni' {
  return tipo === 'trasferimento' ? 'trasferimenti' : tipo === 'reso' ? 'resi' : 'assegnazioni';
}

/** Nome del tipo di operazione: "trasferimento", "reso", "assegnazione" (iniziale maiuscola a richiesta). */
export function nomeTipo(tipo: TipoOperazione, maiuscola = false): string {
  const n = tipo === 'trasferimento' ? 'trasferimento' : tipo === 'reso' ? 'reso' : 'assegnazione';
  return maiuscola ? n[0].toUpperCase() + n.slice(1) : n;
}

/** Articolo indeterminativo per il tipo: "un trasferimento", "un'assegnazione". */
export function unTipo(tipo: TipoOperazione): string {
  return tipo === 'assegnazione' ? "un'assegnazione" : 'un ' + nomeTipo(tipo);
}

/** Descrizione breve dei punti vendita coinvolti (es. "A → B", "Magazzino → B", "C"). */
export function descriviPdv(o: Operazione): string {
  if (o.tipo === 'reso') return o.pdvResoNome;
  return `${o.pdvOrigineNome} → ${o.pdvDestNome}`;
}
