import { messaggioErrore } from '../lib/api.ts';
import { dataIt, num } from '../lib/format.ts';
import type { Operazione, Reso, Trasferimento } from '../lib/types.ts';
import { useDati } from './dati.tsx';
import { useUi } from './ui.tsx';

/** Annullamento e ripristino tracciati delle operazioni, con conferma. */
export function useAzioniOperazione() {
  const { api, aggiorna, operazioni } = useDati();
  const { conferma, avvisa } = useUi();
  const etichetta = (o: Operazione) => (o.tipo === 'trasferimento' ? 'trasferimento' : 'reso');

  const annulla = async (o: Operazione): Promise<boolean> => {
    const collegati = o.tipo === 'trasferimento' ? operazioni.filter((x) => x.trasferimentoId === o.id && x.stato === 'valido') : [];
    const motivo = await conferma({
      titolo: `Annullare il ${etichetta(o)} ${o.id}?`,
      messaggio: (
        <>
          <p>{dataIt(o.data)} · {o.premioDescrizione} · {num(o.quantita)} pz</p>
          <p>L'operazione resterà nello storico come <b>annullata</b> e verrà esclusa da totali e statistiche. Potrai ripristinarla in seguito.</p>
          {collegati.length > 0 && <p className="text-amber-800">Attenzione: {collegati.length} reso/i collegato/i a questo trasferimento ({collegati.map((c) => c.id).join(', ')}) non verranno modificati.</p>}
        </>
      ),
      etichetta: 'Annulla operazione',
      pericolo: true,
      campoTesto: { etichetta: 'Motivo (facoltativo)', segnaposto: 'Es. inserito due volte' },
    });
    if (motivo === null) return false;
    try {
      const r = await api<{ operazione: Trasferimento | Reso; avvisi: string[] }>('annullaOperazione', { tipo: o.tipo, id: o.id, motivo, atteso_modificato_il: o.modificatoIl });
      aggiorna(o.tipo === 'trasferimento' ? 'trasferimenti' : 'resi', r.operazione);
      avvisa('successo', `${o.id} annullato.`);
      r.avvisi.forEach((a) => avvisa('info', a));
      return true;
    } catch (e) { avvisa('errore', messaggioErrore(e)); return false; }
  };

  const ripristina = async (o: Operazione): Promise<boolean> => {
    const ok = await conferma({
      titolo: `Ripristinare ${o.id}?`,
      messaggio: <p>L'operazione tornerà valida e sarà di nuovo conteggiata nelle statistiche.</p>,
      etichetta: 'Ripristina',
    });
    if (ok === null) return false;
    try {
      const r = await api<{ operazione: Trasferimento | Reso }>('ripristinaOperazione', { tipo: o.tipo, id: o.id, atteso_modificato_il: o.modificatoIl });
      aggiorna(o.tipo === 'trasferimento' ? 'trasferimenti' : 'resi', r.operazione);
      avvisa('successo', `${o.id} ripristinato.`);
      return true;
    } catch (e) { avvisa('errore', messaggioErrore(e)); return false; }
  };

  return { annulla, ripristina };
}
