import { FormCollegamento } from './Impostazioni.tsx';

export function PaginaBenvenuto() {
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-semibold">Benvenuto nel gestionale premi</h1>
      <p className="mt-1 text-slate-600">Prima di iniziare va collegato il database (un Foglio Google). Si fa una volta sola per ogni PC o browser.</p>
      <div className="mt-5 grid gap-5 md:grid-cols-[1fr_1.2fr]">
        <ol className="card list-decimal space-y-2 p-5 pl-9 text-slate-700">
          <li>Crea un Foglio Google vuoto e apri <b>Estensioni › Apps Script</b>.</li>
          <li>Incolla il contenuto del file <code className="rounded bg-slate-100 px-1">apps-script/Code.gs</code> del progetto e salva.</li>
          <li>Esegui la funzione <b>setup</b> (autorizza l'accesso quando richiesto).</li>
          <li><b>Distribuisci › Nuova distribuzione › App web</b>: esegui come <i>Me</i>, accesso <i>Chiunque</i>.</li>
          <li>Copia qui l'indirizzo della web app e il token API (menu del Foglio: <b>Gestionale premi › Mostra token API</b>).</li>
        </ol>
        <div className="card p-5"><FormCollegamento /></div>
      </div>
      <p className="mt-4 text-sm text-slate-500">La guida completa è nel file README del progetto su GitHub.</p>
    </div>
  );
}
