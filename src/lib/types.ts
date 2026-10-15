/** Tipi dei dati così come arrivano dal backend (valori testuali dei fogli). */

export type SiNo = 'SI' | 'NO';
export type Stato = 'valido' | 'annullato';
export type TipoOperazione = 'trasferimento' | 'reso' | 'assegnazione';

export interface Catalogo {
  id: string; codice: string; nome: string; data_inizio: string; data_fine: string;
  attivo: SiNo; ordine: string; creato_il: string; modificato_il: string;
}

export interface Premio {
  id: string; catalogo_id: string; codice: string; descrizione: string; categoria: string;
  note: string; attivo: SiNo; creato_il: string; modificato_il: string;
}

export interface Pdv {
  id: string; codice: string; nome: string; indirizzo: string; citta: string;
  email: string; email2: string; note: string; attivo: SiNo; creato_il: string; modificato_il: string;
}

export interface Causale {
  id: string; tipo: TipoOperazione; descrizione: string; attivo: SiNo; ordine: string;
  creato_il: string; modificato_il: string;
}

interface OpBase {
  id: string; data: string; catalogo_id: string;
  premio_id: string; premio_codice: string; premio_descrizione: string;
  quantita: string; causale: string; riferimento: string; note: string; stato: Stato;
  creato_il: string; creato_da: string; modificato_il: string; modificato_da: string;
  annullato_il: string; motivo_annullamento: string;
}

export interface Trasferimento extends OpBase {
  pdv_origine_id: string; pdv_origine_codice: string; pdv_origine_nome: string;
  pdv_destinazione_id: string; pdv_destinazione_codice: string; pdv_destinazione_nome: string;
}

export interface Reso extends OpBase {
  pdv_id: string; pdv_codice: string; pdv_nome: string; trasferimento_id: string;
}

/** Premi che partono dal magazzino (via Svezia 04) verso un punto vendita. */
export interface Assegnazione extends OpBase {
  pdv_id: string; pdv_codice: string; pdv_nome: string; prenotazione: string;
}

export interface DatiCompleti {
  cataloghi: Catalogo[]; premi: Premio[]; pdv: Pdv[]; causali: Causale[];
  trasferimenti: Trasferimento[]; resi: Reso[];
  /** Assente se lo script Apps Script non è ancora stato aggiornato alla versione con le assegnazioni. */
  assegnazioni?: Assegnazione[];
  magazzino?: string;
  schema: number; nome_database: string; ora: string;
}

export interface VoceRegistro {
  id: string; timestamp: string; entita: string; entita_id: string; azione: string; operatore: string; dettagli: string;
}

export interface EsitoImport {
  inseriti: number; aggiornati: number; saltati: number; errori: { riga: number; motivo: string }[];
}

/**
 * Operazione unificata (trasferimento, reso o assegnazione) usata da storico, statistiche ed esportazioni.
 * Per i resi `pdvOrigine*`/`pdvDest*` sono vuoti e il PDV interessato è in `pdvReso*`.
 * Per le assegnazioni l'origine è il magazzino (solo nome, senza id) e il PDV che riceve è in `pdvDest*`.
 */
export interface Operazione {
  tipo: TipoOperazione;
  id: string; data: string; catalogoId: string;
  premioId: string; premioCodice: string; premioDescrizione: string;
  pdvOrigineId: string; pdvOrigineCodice: string; pdvOrigineNome: string;
  pdvDestId: string; pdvDestCodice: string; pdvDestNome: string;
  pdvResoId: string; pdvResoCodice: string; pdvResoNome: string;
  quantita: number; causale: string; riferimento: string; note: string; stato: Stato;
  trasferimentoId: string; prenotazione: string;
  creatoIl: string; creatoDa: string; modificatoIl: string; modificatoDa: string;
  annullatoIl: string; motivoAnnullamento: string;
}
