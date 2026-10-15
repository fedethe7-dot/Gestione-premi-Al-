import { useMemo } from 'react';
import { LuBan, LuRotateCcw, LuTriangleAlert } from 'react-icons/lu';
import { FormOperazione } from '../components/FormOperazione.tsx';
import { Intestazione, StatoBadge, Vuoto } from '../components/comuni.tsx';
import { dataIt, dataOraIt, num, oggiIso } from '../lib/format.ts';
import { descriviPdv } from '../lib/operazioni.ts';
import type { TipoOperazione } from '../lib/types.ts';
import { useAzioniOperazione } from '../state/azioni.tsx';
import { useDati } from '../state/dati.tsx';

export function PaginaNuovaOperazione({ tipo, params }: { tipo: TipoOperazione; params?: URLSearchParams }) {
  const { operazioni, cfg, magazzino, assegnazioniAttive } = useDati();
  const { annulla, ripristina } = useAzioniOperazione();
  const oggi = oggiIso();
  const recenti = useMemo(() => operazioni
    .filter((o) => o.tipo === tipo && oggiIso(new Date(o.creatoIl)) === oggi && (!cfg.operatore || o.creatoDa === cfg.operatore))
    .sort((a, b) => b.creatoIl.localeCompare(a.creatoIl) || b.id.localeCompare(a.id))
    .slice(0, 15), [operazioni, tipo, oggi, cfg.operatore]);

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,3fr)_minmax(18rem,1.2fr)]">
      <div>
        <Intestazione titolo={tipo === 'trasferimento' ? 'Nuovo trasferimento' : tipo === 'reso' ? 'Nuovo reso' : 'Nuova assegnazione'}
          sottotitolo={tipo === 'trasferimento' ? 'Premi spostati da un punto vendita a un altro.'
            : tipo === 'reso' ? 'Premi resi da un punto vendita. Non modifica i trasferimenti già registrati.'
              : `Premi assegnati dal ${magazzino} a un punto vendita, con il numero di prenotazione.`} />
        {tipo === 'assegnazione' && !assegnazioniAttive && (
          <p className="mb-3 flex gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-amber-900" role="status">
            <LuTriangleAlert className="mt-0.5 shrink-0" />
            <span>Le assegnazioni funzioneranno dopo l'aggiornamento dello script Apps Script del gestionale (file <b>Code.gs</b>). Trasferimenti, resi e il resto dell'app funzionano già normalmente.</span>
          </p>
        )}
        <div className="card p-5">
          <FormOperazione tipo={tipo} trasferimentoIniziale={params?.get('trasferimento') ?? undefined} />
        </div>
      </div>
      <aside>
        <h2 className="mb-2 mt-1 font-semibold text-slate-700">Registrati oggi{cfg.operatore ? ' da te' : ''}</h2>
        <div className="card divide-y divide-slate-100">
          {recenti.length === 0 && <Vuoto>Nessuna registrazione oggi.</Vuoto>}
          {recenti.map((o) => (
            <div key={o.id} className={`px-3 py-2 ${o.stato === 'annullato' ? 'opacity-60' : ''}`}>
              <div className="flex items-center justify-between gap-2">
                <a href={`#/storico?id=${o.id}`} className="font-mono text-xs text-brand-700 hover:underline">{o.id}</a>
                <span className="text-xs text-slate-500">{dataOraIt(o.creatoIl).slice(11)}</span>
              </div>
              <div className="truncate font-medium" title={o.premioDescrizione}>{num(o.quantita)} × {o.premioDescrizione}</div>
              <div className="truncate text-xs text-slate-600">
                {descriviPdv(o)} · {dataIt(o.data)}{o.prenotazione ? ` · pren. ${o.prenotazione}` : ''}
              </div>
              <div className="mt-1 flex items-center justify-between">
                <StatoBadge stato={o.stato} />
                {o.stato === 'valido'
                  ? <button className="btn-testo px-1.5 py-0.5 text-xs text-red-700" onClick={() => void annulla(o)}><LuBan /> Annulla</button>
                  : <button className="btn-testo px-1.5 py-0.5 text-xs" onClick={() => void ripristina(o)}><LuRotateCcw /> Ripristina</button>}
              </div>
            </div>
          ))}
        </div>
      </aside>
    </div>
  );
}
