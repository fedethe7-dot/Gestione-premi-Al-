import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  LuArrowRightLeft, LuChartColumn, LuDownload, LuGift, LuHistory, LuLayoutDashboard, LuMenu, LuPackagePlus, LuRefreshCw, LuSearch, LuSettings, LuStore, LuTriangleAlert, LuUndo2,
} from 'react-icons/lu';
import { Rotella } from './components/comuni.tsx';
import { dataOraIt } from './lib/format.ts';
import { leggiRotta, vai, type Rotta } from './lib/rotta.ts';
import { PaginaBenvenuto } from './pages/Benvenuto.tsx';
import { PaginaCataloghi } from './pages/Cataloghi.tsx';
import { PaginaDashboard } from './pages/Dashboard.tsx';
import { PaginaEsportazioni } from './pages/Esportazioni.tsx';
import { PaginaImpostazioni } from './pages/Impostazioni.tsx';
import { PaginaNuovaOperazione } from './pages/NuovaOperazione.tsx';
import { PaginaPdv } from './pages/PuntiVendita.tsx';
import { PaginaRicercaPremi } from './pages/RicercaPremi.tsx';
import { PaginaStatistiche } from './pages/Statistiche.tsx';
import { PaginaStorico } from './pages/Storico.tsx';
import { ProviderDati, useDati } from './state/dati.tsx';
import { ProviderUi } from './state/ui.tsx';

const VOCI = [
  { path: '', titolo: 'Dashboard', icona: LuLayoutDashboard },
  { path: 'ricerca', titolo: 'Ricerca premi', icona: LuSearch },
  { path: 'trasferimento', titolo: 'Nuovo trasferimento', icona: LuArrowRightLeft },
  { path: 'reso', titolo: 'Nuovo reso', icona: LuUndo2 },
  { path: 'assegnazione', titolo: 'Nuova assegnazione', icona: LuPackagePlus },
  { path: 'storico', titolo: 'Storico operazioni', icona: LuHistory },
  { path: 'pdv', titolo: 'Punti vendita', icona: LuStore },
  { path: 'cataloghi', titolo: 'Cataloghi premi', icona: LuGift },
  { path: 'statistiche', titolo: 'Statistiche', icona: LuChartColumn },
  { path: 'esportazioni', titolo: 'Esportazioni e backup', icona: LuDownload },
  { path: 'impostazioni', titolo: 'Impostazioni', icona: LuSettings },
];


function App() {
  const { cfg, dati, caricamento, errore, ricarica, ultimoCaricamento } = useDati();
  const [rotta, setRotta] = useState<Rotta>(leggiRotta);
  const [menu, setMenu] = useState(false);

  useEffect(() => {
    const onHash = () => { setRotta(leggiRotta()); setMenu(false); window.scrollTo(0, 0); };
    window.addEventListener('hashchange', onHash);
    // Alt+1…9 e Alt+0 (Impostazioni, l'ultima voce): navigazione rapida tra le sezioni.
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey && !e.ctrlKey && /^[0-9]$/.test(e.key)) {
        const voce = VOCI[e.key === '0' ? VOCI.length - 1 : Number(e.key) - 1];
        if (voce) { e.preventDefault(); vai(voce.path); }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('hashchange', onHash); window.removeEventListener('keydown', onKey); };
  }, []);

  const configurato = Boolean(cfg.url && cfg.token);
  const voce = VOCI.find((v) => v.path === rotta.path) ?? VOCI[0];
  useEffect(() => { document.title = `${voce.titolo} · Gestionale premi`; }, [voce]);

  let contenuto;
  if (!configurato) contenuto = <PaginaBenvenuto />;
  else if (rotta.path === 'impostazioni') contenuto = <PaginaImpostazioni />;
  else if (!dati && caricamento) contenuto = <div className="p-10"><Rotella testo="Caricamento dei dati dal database…" /></div>;
  else if (!dati) contenuto = (
    <div className="card mx-auto mt-10 max-w-xl p-6">
      <h1 className="flex items-center gap-2 text-lg font-semibold text-red-800"><LuTriangleAlert /> Impossibile caricare i dati</h1>
      <p className="mt-2 text-slate-700">{errore || 'Errore sconosciuto.'}</p>
      <div className="mt-4 flex gap-2">
        <button className="btn-primario" onClick={() => ricarica()}><LuRefreshCw /> Riprova</button>
        <a className="btn-secondario" href="#/impostazioni">Apri Impostazioni</a>
      </div>
    </div>
  );
  else {
    switch (rotta.path) {
      case 'ricerca': contenuto = <PaginaRicercaPremi params={rotta.params} />; break;
      case 'trasferimento': contenuto = <PaginaNuovaOperazione key="t" tipo="trasferimento" />; break;
      case 'reso': contenuto = <PaginaNuovaOperazione key="r" tipo="reso" params={rotta.params} />; break;
      case 'assegnazione': contenuto = <PaginaNuovaOperazione key="a" tipo="assegnazione" />; break;
      case 'storico': contenuto = <PaginaStorico params={rotta.params} />; break;
      case 'pdv': contenuto = <PaginaPdv />; break;
      case 'cataloghi': contenuto = <PaginaCataloghi />; break;
      case 'statistiche': contenuto = <PaginaStatistiche />; break;
      case 'esportazioni': contenuto = <PaginaEsportazioni />; break;
      default: contenuto = <PaginaDashboard />;
    }
  }

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      {/* Schermi piccoli: barra in alto con il menu a scomparsa. */}
      <div className="sticky top-0 z-30 flex items-center gap-2 border-b border-slate-200 bg-white px-3 py-2 md:hidden">
        <button className="btn-testo px-2 py-1.5" onClick={() => setMenu((m) => !m)} aria-label="Menu" aria-expanded={menu}><LuMenu size={20} /></button>
        <span className="font-semibold">{configurato ? voce.titolo : 'Gestionale premi'}</span>
      </div>
      {menu && <div className="fixed inset-0 z-30 bg-slate-900/40 md:hidden" onClick={() => setMenu(false)} aria-hidden />}
      <aside className={`${menu ? 'fixed inset-y-0 left-0 z-40 flex shadow-xl' : 'hidden'} h-screen w-60 shrink-0 flex-col border-r border-slate-200 bg-white md:sticky md:top-0 md:flex md:shadow-none`}>
        <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-3.5">
          <div className="grid h-8 w-8 place-items-center rounded-md bg-brand-600 text-white"><LuArrowRightLeft /></div>
          <div className="leading-tight">
            <div className="font-semibold">Gestionale premi</div>
            <div className="text-xs text-slate-500">Movimenti dei premi</div>
          </div>
        </div>
        <nav className="flex-1 overflow-y-auto p-2" aria-label="Menu principale">
          {VOCI.map((v, i) => {
            const Icona = v.icona;
            const att = v.path === voce.path && configurato;
            return (
              <a key={v.path} href={'#/' + v.path} aria-current={att ? 'page' : undefined}
                className={`mb-0.5 flex items-center gap-2.5 rounded-md px-3 py-2 ${att ? 'bg-brand-50 font-semibold text-brand-700' : 'text-slate-700 hover:bg-slate-100'} ${!configurato && v.path !== 'impostazioni' ? 'pointer-events-none opacity-40' : ''}`}
                title={i < 9 ? `Alt+${i + 1}` : i === VOCI.length - 1 ? 'Alt+0' : undefined}>
                <Icona className="shrink-0" size={17} aria-hidden />
                <span className="flex-1">{v.titolo}</span>
              </a>
            );
          })}
        </nav>
        {configurato && (
          <div className="border-t border-slate-200 p-3 text-xs text-slate-500">
            {dati && <div className="truncate" title={dati.nome_database}>Database: {dati.nome_database}</div>}
            <div>Operatore: {cfg.operatore || <a className="text-brand-600 underline" href="#/impostazioni">non indicato</a>}</div>
            <div className="mt-1 flex items-center justify-between gap-2">
              <span>{ultimoCaricamento ? 'Aggiornato ' + dataOraIt(ultimoCaricamento.toISOString()).slice(11) : ''}</span>
              <button className="btn-secondario px-2 py-1 text-xs" onClick={() => ricarica()} disabled={caricamento} title="Rileggi i dati dal database">
                <LuRefreshCw className={caricamento ? 'animate-spin' : ''} /> Aggiorna
              </button>
            </div>
            {errore && dati && <div className="mt-1 text-red-700">{errore}</div>}
            <div className="mt-1 text-slate-400">Versione {__APP_VERSION__}</div>
          </div>
        )}
      </aside>
      <main className="min-w-0 flex-1 px-4 py-4 md:px-6 md:py-5">{contenuto}</main>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ProviderUi>
      <ProviderDati>
        <App />
      </ProviderDati>
    </ProviderUi>
  </StrictMode>,
);
