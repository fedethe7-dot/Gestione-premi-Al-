import { useState } from 'react';
import { LuCircleCheck, LuPencil, LuPlus } from 'react-icons/lu';
import { AttivoBadge, Campo, Intestazione } from '../components/comuni.tsx';
import { Modale } from '../components/Modale.tsx';
import { chiama, messaggioErrore } from '../lib/api.ts';
import { cancellaConfig, type Config } from '../lib/config.ts';
import type { Causale } from '../lib/types.ts';
import { useDati } from '../state/dati.tsx';
import { useUi } from '../state/ui.tsx';

export function FormCollegamento({ onSalvato }: { onSalvato?: () => void }) {
  const { cfg, aggiornaConfig } = useDati();
  const { avvisa } = useUi();
  const [f, setF] = useState<Config>(cfg);
  const [mostra, setMostra] = useState(false);
  const [verifica, setVerifica] = useState<{ ok: boolean; testo: string } | null>(null);
  const [inCorso, setInCorso] = useState(false);

  const salva = async () => {
    const c = { ...f, url: f.url.trim(), token: f.token.trim(), operatore: f.operatore.trim() };
    if (!/^https?:\/\//.test(c.url)) { setVerifica({ ok: false, testo: 'L\'indirizzo deve iniziare con https://' }); return; }
    setInCorso(true); setVerifica(null);
    try {
      await chiama(c, 'ping', {}, 30000);
      aggiornaConfig(c);
      setVerifica({ ok: true, testo: 'Collegamento riuscito.' });
      avvisa('successo', 'Collegamento al database salvato.');
      onSalvato?.();
    } catch (e) {
      setVerifica({ ok: false, testo: messaggioErrore(e) });
    } finally { setInCorso(false); }
  };

  return (
    <form noValidate className="space-y-3" onSubmit={(e) => { e.preventDefault(); void salva(); }}>
      <Campo etichetta="Indirizzo della web app (Apps Script)" per="cfg-url" obbligatorio aiuto="Lo trovi in Apps Script › Distribuisci › Gestisci distribuzioni. Termina con /exec.">
        <input id="cfg-url" className="input font-mono text-xs" value={f.url} onChange={(e) => setF({ ...f, url: e.target.value })}
          placeholder="https://script.google.com/macros/s/…/exec" autoComplete="off" spellCheck={false} />
      </Campo>
      <Campo etichetta="Token API" per="cfg-token" obbligatorio aiuto="Generato dalla funzione setup: nel Foglio Google, menu Gestionale premi › Mostra token API.">
        <div className="flex gap-2">
          <input id="cfg-token" className="input font-mono text-xs" type={mostra ? 'text' : 'password'} value={f.token}
            onChange={(e) => setF({ ...f, token: e.target.value })} autoComplete="off" spellCheck={false} />
          <button type="button" className="btn-secondario" onClick={() => setMostra(!mostra)}>{mostra ? 'Nascondi' : 'Mostra'}</button>
        </div>
      </Campo>
      <Campo etichetta="Il tuo nome (operatore)" per="cfg-op" aiuto="Viene registrato su ogni operazione e modifica, per sapere chi l'ha fatta.">
        <input id="cfg-op" className="input" value={f.operatore} maxLength={60} onChange={(e) => setF({ ...f, operatore: e.target.value })} />
      </Campo>
      <div className="flex items-center gap-3">
        <button className="btn-primario" disabled={inCorso || !f.url || !f.token}>{inCorso ? 'Verifica in corso…' : 'Verifica e salva'}</button>
        {verifica && <span className={verifica.ok ? 'text-emerald-700' : 'text-red-700'}>{verifica.ok && <LuCircleCheck className="mr-1 inline" />}{verifica.testo}</span>}
      </div>
    </form>
  );
}

export function PaginaImpostazioni() {
  const { cfg, aggiornaConfig, dati, causali } = useDati();
  const { conferma, avvisa } = useUi();
  return (
    <div className="max-w-4xl space-y-5">
      <Intestazione titolo="Impostazioni" />
      <section className="card p-5">
        <h2 className="mb-1 text-lg font-semibold">Collegamento al database</h2>
        <p className="mb-4 text-slate-600">I dati sono salvati nel Foglio Google collegato. Queste impostazioni restano solo in questo browser.</p>
        <FormCollegamento />
      </section>

      <section className="card p-5">
        <h2 className="mb-3 text-lg font-semibold">File CSV</h2>
        <Campo etichetta="Separatore delle colonne" per="cfg-sep" aiuto="Excel in italiano usa il punto e virgola. Con il punto e virgola i decimali usano la virgola.">
          <select id="cfg-sep" className="input max-w-xs" value={cfg.separatore}
            onChange={(e) => { aggiornaConfig({ ...cfg, separatore: e.target.value === ',' ? ',' : ';' }); avvisa('successo', 'Separatore aggiornato.'); }}>
            <option value=";">Punto e virgola ( ; ) — Excel italiano</option>
            <option value=",">Virgola ( , )</option>
          </select>
        </Campo>
      </section>

      {dati && (
        <section className="card p-5">
          <h2 className="mb-1 text-lg font-semibold">Causali</h2>
          <p className="mb-4 text-slate-600">Le causali disattivate restano visibili sulle operazioni già registrate ma non si possono più scegliere.</p>
          <div className="grid gap-5 md:grid-cols-2">
            <ElencoCausali tipo="trasferimento" elenco={causali('trasferimento', false)} />
            <ElencoCausali tipo="reso" elenco={causali('reso', false)} />
          </div>
        </section>
      )}

      <section className="card p-5">
        <h2 className="mb-2 text-lg font-semibold">Informazioni</h2>
        <dl className="grid grid-cols-[12rem_1fr] gap-y-1 text-slate-700">
          <dt className="text-slate-500">Versione programma</dt><dd>{__APP_VERSION__}</dd>
          {dati && <><dt className="text-slate-500">Database</dt><dd>{dati.nome_database} (schema {dati.schema})</dd></>}
          {dati && <><dt className="text-slate-500">Contenuto</dt><dd>{dati.pdv.length} PDV, {dati.premi.length} premi, {dati.trasferimenti.length} trasferimenti, {dati.resi.length} resi</dd></>}
        </dl>
        <button className="btn-secondario mt-4" onClick={async () => {
          const ok = await conferma({ titolo: 'Scollegare questo browser?', messaggio: 'Indirizzo e token verranno rimossi da questo browser. I dati nel Foglio Google non vengono toccati.', etichetta: 'Scollega', pericolo: true });
          if (ok !== null) { cancellaConfig(); location.reload(); }
        }}>Scollega questo browser</button>
      </section>
    </div>
  );
}

function ElencoCausali({ tipo, elenco }: { tipo: 'trasferimento' | 'reso'; elenco: Causale[] }) {
  const { api, aggiorna } = useDati();
  const { avvisa } = useUi();
  const [modifica, setModifica] = useState<Partial<Causale> | null>(null);
  const [errore, setErrore] = useState('');
  const [inCorso, setInCorso] = useState(false);

  const salva = async (c: Partial<Causale>) => {
    setInCorso(true); setErrore('');
    try {
      const r = await api<Causale>('saveCausale', { ...c, tipo });
      aggiorna('causali', r);
      avvisa('successo', 'Causale salvata.');
      setModifica(null);
    } catch (e) { setErrore(messaggioErrore(e)); avvisa('errore', messaggioErrore(e)); } finally { setInCorso(false); }
  };

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="font-semibold">{tipo === 'trasferimento' ? 'Causali dei trasferimenti' : 'Causali dei resi'}</h3>
        <button className="btn-secondario px-2 py-1 text-xs" onClick={() => setModifica({ descrizione: '', attivo: 'SI' })}><LuPlus /> Aggiungi</button>
      </div>
      <ul className="divide-y divide-slate-100 rounded-md border border-slate-200">
        {elenco.map((c) => (
          <li key={c.id} className="flex items-center gap-2 px-3 py-1.5">
            <span className={`flex-1 ${c.attivo === 'SI' ? '' : 'text-slate-400'}`}>{c.descrizione}</span>
            <AttivoBadge attivo={c.attivo} />
            <button className="btn-testo px-1.5 py-1" aria-label={`Modifica ${c.descrizione}`} onClick={() => setModifica(c)}><LuPencil /></button>
            <button className="btn-testo px-1.5 py-1 text-xs" disabled={inCorso} onClick={() => salva({ ...c, attivo: c.attivo === 'SI' ? 'NO' : 'SI' })}>{c.attivo === 'SI' ? 'Disattiva' : 'Riattiva'}</button>
          </li>
        ))}
        {elenco.length === 0 && <li className="px-3 py-2 text-slate-500">Nessuna causale.</li>}
      </ul>
      {modifica && (
        <Modale titolo={modifica.id ? 'Modifica causale' : 'Nuova causale'} chiudi={() => setModifica(null)} larghezza="max-w-md">
          <form noValidate onSubmit={(e) => { e.preventDefault(); void salva(modifica); }} className="space-y-3">
            <Campo etichetta="Descrizione" per="causale-desc" obbligatorio errore={errore}>
              <input id="causale-desc" className="input" maxLength={100} value={modifica.descrizione ?? ''} autoFocus
                onChange={(e) => setModifica({ ...modifica, descrizione: e.target.value })} />
            </Campo>
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-secondario" onClick={() => setModifica(null)}>Annulla</button>
              <button className="btn-primario" disabled={inCorso || !modifica.descrizione?.trim()}>Salva</button>
            </div>
          </form>
        </Modale>
      )}
    </div>
  );
}
