/** Definizione delle colonne di tutti i file CSV esportati. */
import type { Colonna } from './csv.ts';
import { dataIt, dataOraIt } from './format.ts';
import type { StatCatalogo, StatPdv, StatPremio } from './statistiche.ts';
import type { Catalogo, Operazione, Pdv, Premio } from './types.ts';

const siNo = (v: string) => (v === 'SI' ? 'SI' : 'NO');
const statoTesto = (s: string) => (s === 'valido' ? 'Valido' : 'Annullato');

export const colonnePdv: Colonna<Pdv>[] = [
  { titolo: 'Codice PDV', valore: (p) => p.codice },
  { titolo: 'Nome', valore: (p) => p.nome },
  { titolo: 'Indirizzo', valore: (p) => p.indirizzo },
  { titolo: 'Città', valore: (p) => p.citta },
  { titolo: 'E-mail principale', valore: (p) => p.email },
  { titolo: 'E-mail secondaria', valore: (p) => p.email2 },
  { titolo: 'Note', valore: (p) => p.note },
  { titolo: 'Attivo', valore: (p) => siNo(p.attivo) },
];

export function colonnePremi(cat: Map<string, Catalogo>): Colonna<Premio>[] {
  return [
    { titolo: 'Catalogo', valore: (p) => cat.get(p.catalogo_id)?.codice ?? p.catalogo_id },
    { titolo: 'Codice premio', valore: (p) => p.codice },
    { titolo: 'Descrizione', valore: (p) => p.descrizione },
    { titolo: 'Categoria', valore: (p) => p.categoria },
    { titolo: 'Note', valore: (p) => p.note },
    { titolo: 'Attivo', valore: (p) => siNo(p.attivo) },
  ];
}

function finali(): Colonna<Operazione>[] {
  return [
    { titolo: 'Stato', valore: (o) => statoTesto(o.stato) },
    { titolo: 'Registrato il', valore: (o) => dataOraIt(o.creatoIl) },
    { titolo: 'Registrato da', valore: (o) => o.creatoDa },
    { titolo: 'Ultima modifica', valore: (o) => dataOraIt(o.modificatoIl) },
    { titolo: 'Modificato da', valore: (o) => o.modificatoDa },
    { titolo: 'Annullato il', valore: (o) => dataOraIt(o.annullatoIl) },
    { titolo: 'Motivo annullamento', valore: (o) => o.motivoAnnullamento },
  ];
}

function iniziali(cat: Map<string, Catalogo>): Colonna<Operazione>[] {
  return [
    { titolo: 'ID', valore: (o) => o.id },
    { titolo: 'Data', valore: (o) => dataIt(o.data) },
    { titolo: 'Catalogo', valore: (o) => cat.get(o.catalogoId)?.codice ?? o.catalogoId },
    { titolo: 'Codice premio', valore: (o) => o.premioCodice },
    { titolo: 'Premio', valore: (o) => o.premioDescrizione },
  ];
}

export function colonneTrasferimenti(cat: Map<string, Catalogo>): Colonna<Operazione>[] {
  return [
    ...iniziali(cat),
    { titolo: 'Codice PDV origine', valore: (o) => o.pdvOrigineCodice },
    { titolo: 'PDV origine', valore: (o) => o.pdvOrigineNome },
    { titolo: 'Codice PDV destinazione', valore: (o) => o.pdvDestCodice },
    { titolo: 'PDV destinazione', valore: (o) => o.pdvDestNome },
    { titolo: 'Quantità', valore: (o) => o.quantita },
    { titolo: 'Causale', valore: (o) => o.causale },
    { titolo: 'Riferimento / documento', valore: (o) => o.riferimento },
    { titolo: 'Note', valore: (o) => o.note },
    ...finali(),
  ];
}

export function colonneResi(cat: Map<string, Catalogo>): Colonna<Operazione>[] {
  return [
    ...iniziali(cat),
    { titolo: 'Codice PDV', valore: (o) => o.pdvResoCodice },
    { titolo: 'PDV', valore: (o) => o.pdvResoNome },
    { titolo: 'Quantità', valore: (o) => o.quantita },
    { titolo: 'Causale', valore: (o) => o.causale },
    { titolo: 'Trasferimento collegato', valore: (o) => o.trasferimentoId },
    { titolo: 'Numero documento', valore: (o) => o.riferimento },
    { titolo: 'Note', valore: (o) => o.note },
    ...finali(),
  ];
}

export function colonneStorico(cat: Map<string, Catalogo>): Colonna<Operazione>[] {
  const [id, ...resto] = iniziali(cat);
  return [
    id,
    { titolo: 'Tipo operazione', valore: (o) => (o.tipo === 'trasferimento' ? 'Trasferimento' : 'Reso') },
    ...resto,
    { titolo: 'Codice PDV origine', valore: (o) => o.pdvOrigineCodice },
    { titolo: 'PDV origine', valore: (o) => o.pdvOrigineNome },
    { titolo: 'Codice PDV destinazione', valore: (o) => o.pdvDestCodice },
    { titolo: 'PDV destinazione', valore: (o) => o.pdvDestNome },
    { titolo: 'Codice PDV reso', valore: (o) => o.pdvResoCodice },
    { titolo: 'PDV reso', valore: (o) => o.pdvResoNome },
    { titolo: 'Quantità', valore: (o) => o.quantita },
    { titolo: 'Causale', valore: (o) => o.causale },
    { titolo: 'Riferimento / documento', valore: (o) => o.riferimento },
    { titolo: 'Trasferimento collegato', valore: (o) => o.trasferimentoId },
    { titolo: 'Note', valore: (o) => o.note },
    ...finali(),
  ];
}

export const colonneStatPdv: Colonna<StatPdv>[] = [
  { titolo: 'Codice PDV', valore: (s) => s.codice },
  { titolo: 'PDV', valore: (s) => s.nome },
  { titolo: 'N. trasferimenti in uscita', valore: (s) => s.nUscita },
  { titolo: 'Quantità in uscita', valore: (s) => s.qUscita },
  { titolo: 'N. trasferimenti in entrata', valore: (s) => s.nEntrata },
  { titolo: 'Quantità in entrata', valore: (s) => s.qEntrata },
  { titolo: 'N. resi', valore: (s) => s.nResi },
  { titolo: 'Quantità resa', valore: (s) => s.qResi },
];

export function colonneStatPremio(cat: Map<string, Catalogo>, conPdv: boolean): Colonna<StatPremio>[] {
  return [
    { titolo: 'Catalogo', valore: (s) => cat.get(s.catalogoId)?.codice ?? s.catalogoId },
    { titolo: 'Codice premio', valore: (s) => s.codice },
    { titolo: 'Premio', valore: (s) => s.descrizione },
    { titolo: 'N. trasferimenti', valore: (s) => s.nTrasf },
    { titolo: 'Quantità trasferita', valore: (s) => s.qTrasf },
    ...(conPdv ? [
      { titolo: 'Quantità in entrata (PDV selezionato)', valore: (s: StatPremio) => s.qEntrata },
      { titolo: 'Quantità in uscita (PDV selezionato)', valore: (s: StatPremio) => s.qUscita },
    ] : []),
    { titolo: 'N. resi', valore: (s) => s.nResi },
    { titolo: 'Quantità resa', valore: (s) => s.qResi },
    { titolo: 'Rapporto resi/trasferiti %', valore: (s) => (s.tassoReso === null ? '' : Math.round(s.tassoReso * 1000) / 10) },
    { titolo: 'PDV coinvolti', valore: (s) => s.pdvCoinvolti },
  ];
}

export const colonneStatCatalogo: Colonna<StatCatalogo>[] = [
  { titolo: 'Catalogo', valore: (s) => s.codice },
  { titolo: 'N. trasferimenti', valore: (s) => s.nTrasf },
  { titolo: 'Quantità trasferita', valore: (s) => s.qTrasf },
  { titolo: 'N. resi', valore: (s) => s.nResi },
  { titolo: 'Quantità resa', valore: (s) => s.qResi },
  { titolo: 'Rapporto resi/trasferiti %', valore: (s) => (s.tassoReso === null ? '' : Math.round(s.tassoReso * 1000) / 10) },
  { titolo: 'Premi movimentati', valore: (s) => s.premiMovimentati },
  { titolo: 'PDV movimentati', valore: (s) => s.pdvMovimentati },
];
