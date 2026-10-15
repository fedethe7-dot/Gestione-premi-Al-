/**
 * Listino premi (ricerca per nome e codice): caricato dal database solo quando serve e tenuto in memoria
 * per tutta la sessione, così la ricerca è istantanea anche tornando sulla pagina.
 */
import { useCallback, useEffect, useState } from 'react';
import { ApiError, messaggioErrore } from '../lib/api.ts';
import { creaIndice, daArchivio, type Gruppo, type ListinoArchivio, type VoceIndice } from '../lib/listino.ts';
import { useDati } from './dati.tsx';

export interface StatoListino {
  archivio: ListinoArchivio | null;
  gruppi: Gruppo[];
  indice: VoceIndice[];
  stagioni: string[];
  caricamento: boolean;
  errore: string;
  /** Lo script Apps Script è di una versione precedente e non conosce il listino. */
  daAggiornare: boolean;
}

interface Cache { chiave: string; stato: StatoListino }
let cache: Cache | null = null;
const ascoltatori = new Set<(s: StatoListino) => void>();

const VUOTO: StatoListino = { archivio: null, gruppi: [], indice: [], stagioni: [], caricamento: false, errore: '', daAggiornare: false };

function prepara(archivio: ListinoArchivio): StatoListino {
  const gruppi = daArchivio(archivio);
  const stagioni = [...new Set(gruppi.map((g) => g.stagione))].sort().reverse();
  return { archivio, gruppi, indice: creaIndice(gruppi), stagioni, caricamento: false, errore: '', daAggiornare: false };
}

export function useListino() {
  const { cfg, api } = useDati();
  const chiave = cfg.url + '|' + cfg.token;
  const [stato, setStato] = useState<StatoListino>(() => (cache?.chiave === chiave ? cache.stato : { ...VUOTO, caricamento: true }));

  const pubblica = useCallback((s: StatoListino) => {
    cache = { chiave, stato: s };
    ascoltatori.forEach((f) => f(s));
  }, [chiave]);

  const ricarica = useCallback(async () => {
    pubblica({ ...(cache?.chiave === chiave ? cache.stato : VUOTO), caricamento: true, errore: '' });
    try {
      pubblica(prepara(await api<ListinoArchivio>('getListino')));
    } catch (e) {
      const vecchio = e instanceof ApiError && e.code === 'RICHIESTA' && /sconosciuta/i.test(e.message);
      pubblica({ ...VUOTO, errore: vecchio ? '' : messaggioErrore(e), daAggiornare: vecchio });
    }
  }, [api, chiave, pubblica]);

  /** Dopo un'importazione o un ripristino il backend restituisce già il listino aggiornato. */
  const imposta = useCallback((a: ListinoArchivio) => pubblica(prepara(a)), [pubblica]);

  useEffect(() => {
    ascoltatori.add(setStato);
    if (cache?.chiave !== chiave) void ricarica();
    return () => { ascoltatori.delete(setStato); };
  }, [chiave, ricarica]);

  return { ...stato, ricarica, imposta };
}
