import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { chiama, messaggioErrore } from '../lib/api.ts';
import { leggiConfig, salvaConfig, type Config } from '../lib/config.ts';
import { unisci } from '../lib/operazioni.ts';
import type { Catalogo, Causale, DatiCompleti, Operazione, Pdv, Premio, Reso, Trasferimento } from '../lib/types.ts';

type Raccolta = 'cataloghi' | 'premi' | 'pdv' | 'causali' | 'trasferimenti' | 'resi';
type ConId = { id: string };

interface Stato {
  cfg: Config;
  aggiornaConfig: (c: Config) => void;
  dati: DatiCompleti | null;
  caricamento: boolean;
  errore: string;
  ultimoCaricamento: Date | null;
  ricarica: (silenzioso?: boolean) => Promise<void>;
  api: <T>(action: string, payload?: unknown) => Promise<T>;
  /** Inserisce o sostituisce un record nella copia locale dopo una scrittura riuscita. */
  aggiorna: (raccolta: Raccolta, record: ConId) => void;
  operazioni: Operazione[];
  mappe: {
    pdv: Map<string, Pdv>; premi: Map<string, Premio>; cataloghi: Map<string, Catalogo>;
    trasferimenti: Map<string, Trasferimento>; resi: Map<string, Reso>;
  };
  cataloghiOrdinati: Catalogo[];
  causali: (tipo: 'trasferimento' | 'reso', soloAttive?: boolean) => Causale[];
}

const Ctx = createContext<Stato | null>(null);

export function useDati(): Stato {
  const s = useContext(Ctx);
  if (!s) throw new Error('useDati fuori dal provider');
  return s;
}

export function ProviderDati({ children }: { children: ReactNode }) {
  const [cfg, setCfg] = useState<Config>(leggiConfig);
  const [dati, setDati] = useState<DatiCompleti | null>(null);
  const [caricamento, setCaricamento] = useState(false);
  const [errore, setErrore] = useState('');
  const [ultimo, setUltimo] = useState<Date | null>(null);
  const cfgRef = useRef(cfg);
  cfgRef.current = cfg;

  const api = useCallback(<T,>(action: string, payload: unknown = {}) => chiama<T>(cfgRef.current, action, payload), []);

  const ricarica = useCallback(async (silenzioso = false) => {
    if (!cfgRef.current.url || !cfgRef.current.token) return;
    if (!silenzioso) setCaricamento(true);
    try {
      const d = await chiama<DatiCompleti>(cfgRef.current, 'getAll');
      setDati(d);
      setErrore('');
      setUltimo(new Date());
    } catch (e) {
      if (!silenzioso) setErrore(messaggioErrore(e));
    } finally {
      if (!silenzioso) setCaricamento(false);
    }
  }, []);

  useEffect(() => { void ricarica(); }, [cfg.url, cfg.token, ricarica]);

  // Uso da più PC: quando si torna sulla finestra dopo almeno un minuto, i dati vengono riletti.
  useEffect(() => {
    const onFocus = () => {
      if (ultimo && Date.now() - ultimo.getTime() > 60000) void ricarica(true);
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [ultimo, ricarica]);

  const aggiornaConfig = useCallback((c: Config) => { salvaConfig(c); setCfg(c); }, []);

  const aggiorna = useCallback((raccolta: Raccolta, record: ConId) => {
    setDati((d) => {
      if (!d) return d;
      const lista = d[raccolta] as unknown as ConId[];
      const i = lista.findIndex((r) => r.id === record.id);
      const nuova = i >= 0 ? lista.map((r, j) => (j === i ? record : r)) : [...lista, record];
      return { ...d, [raccolta]: nuova };
    });
  }, []);

  const operazioni = useMemo(() => (dati ? unisci(dati.trasferimenti, dati.resi) : []), [dati]);

  const mappe = useMemo(() => ({
    pdv: new Map((dati?.pdv ?? []).map((x) => [x.id, x])),
    premi: new Map((dati?.premi ?? []).map((x) => [x.id, x])),
    cataloghi: new Map((dati?.cataloghi ?? []).map((x) => [x.id, x])),
    trasferimenti: new Map((dati?.trasferimenti ?? []).map((x) => [x.id, x])),
    resi: new Map((dati?.resi ?? []).map((x) => [x.id, x])),
  }), [dati]);

  const cataloghiOrdinati = useMemo(() => [...(dati?.cataloghi ?? [])].sort((a, b) =>
    (Number(a.ordine) || 0) - (Number(b.ordine) || 0) || a.codice.localeCompare(b.codice)), [dati]);

  const causali = useCallback((tipo: 'trasferimento' | 'reso', soloAttive = true) =>
    (dati?.causali ?? []).filter((c) => c.tipo === tipo && (!soloAttive || c.attivo === 'SI'))
      .sort((a, b) => (Number(a.ordine) || 0) - (Number(b.ordine) || 0)), [dati]);

  const valore: Stato = {
    cfg, aggiornaConfig, dati, caricamento, errore, ultimoCaricamento: ultimo, ricarica, api, aggiorna,
    operazioni, mappe, cataloghiOrdinati, causali,
  };
  return <Ctx.Provider value={valore}>{children}</Ctx.Provider>;
}
