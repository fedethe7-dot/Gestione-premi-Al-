import type { Operazione, Reso, Trasferimento } from './types.ts';

export function daTrasferimento(t: Trasferimento): Operazione {
  return {
    tipo: 'trasferimento', id: t.id, data: t.data, catalogoId: t.catalogo_id,
    premioId: t.premio_id, premioCodice: t.premio_codice, premioDescrizione: t.premio_descrizione,
    pdvOrigineId: t.pdv_origine_id, pdvOrigineCodice: t.pdv_origine_codice, pdvOrigineNome: t.pdv_origine_nome,
    pdvDestId: t.pdv_destinazione_id, pdvDestCodice: t.pdv_destinazione_codice, pdvDestNome: t.pdv_destinazione_nome,
    pdvResoId: '', pdvResoCodice: '', pdvResoNome: '',
    quantita: parseInt(t.quantita, 10) || 0, causale: t.causale, riferimento: t.riferimento, note: t.note,
    stato: t.stato, trasferimentoId: '',
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
    stato: r.stato, trasferimentoId: r.trasferimento_id,
    creatoIl: r.creato_il, creatoDa: r.creato_da, modificatoIl: r.modificato_il, modificatoDa: r.modificato_da,
    annullatoIl: r.annullato_il, motivoAnnullamento: r.motivo_annullamento,
  };
}

export function unisci(trasferimenti: Trasferimento[], resi: Reso[]): Operazione[] {
  return [...trasferimenti.map(daTrasferimento), ...resi.map(daReso)];
}

/** Ordine: data, poi momento di registrazione, poi identificativo. */
export function confrontaOp(a: Operazione, b: Operazione): number {
  return a.data.localeCompare(b.data) || a.creatoIl.localeCompare(b.creatoIl) || a.id.localeCompare(b.id);
}
