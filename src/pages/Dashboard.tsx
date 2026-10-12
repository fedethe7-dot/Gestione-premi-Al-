import { useMemo, useState } from 'react';
import { LuArrowRightLeft, LuCircleCheck, LuUndo2 } from 'react-icons/lu';
import { Barra, FiltroPeriodo, Intestazione, Kpi, SelettoreCatalogo, StatoBadge, TipoBadge, Vuoto, type Periodo } from '../components/comuni.tsx';
import { COLORE_RESO, COLORE_TRASF } from '../components/Grafici.tsx';
import { leggiPref, salvaPref } from '../lib/config.ts';
import { dataIt, dataOraIt, num, oggiIso, primoDelMese } from '../lib/format.ts';
import { filtraValide, statPerPdv, statPerPremio, totali } from '../lib/statistiche.ts';
import { useDati } from '../state/dati.tsx';

export function PaginaDashboard() {
  const { dati, operazioni, cataloghiOrdinati, mappe } = useDati();
  const [periodo, setPeriodo] = useState<Periodo>(() => {
    try { const p = JSON.parse(leggiPref('dashboard-periodo')); if (p && typeof p.da === 'string') return p; } catch { /* default */ }
    return { da: primoDelMese(), a: oggiIso() };
  });
  const [catalogo, setCatalogo] = useState(() => leggiPref('dashboard-catalogo'));
  const cambiaPeriodo = (p: Periodo) => { setPeriodo(p); salvaPref('dashboard-periodo', JSON.stringify(p)); };
  const cambiaCatalogo = (c: string) => { setCatalogo(c); salvaPref('dashboard-catalogo', c); };

  const filtrate = useMemo(() => filtraValide(operazioni, { ...periodo, catalogoId: catalogo, premioId: '', pdvId: '', tipo: 'entrambi' }), [operazioni, periodo, catalogo]);
  const tot = totali(filtrate);
  const anag = useMemo(() => new Map(dati!.pdv.map((p) => [p.id, { codice: p.codice, nome: p.nome }])), [dati]);
  const topPremi = useMemo(() => statPerPremio(filtrate).sort((a, b) => b.qTrasf - a.qTrasf || b.qResi - a.qResi).slice(0, 8), [filtrate]);
  const topPdv = useMemo(() => statPerPdv(filtrate, anag).filter((s) => s.nUscita + s.nEntrata > 0)
    .sort((a, b) => (b.nUscita + b.nEntrata) - (a.nUscita + a.nEntrata)).slice(0, 8), [filtrate, anag]);
  const recenti = useMemo(() => [...operazioni].sort((a, b) => b.modificatoIl.localeCompare(a.modificatoIl)).slice(0, 10), [operazioni]);
  const maxP = Math.max(1, ...topPremi.map((p) => p.qTrasf));
  const maxV = Math.max(1, ...topPdv.map((p) => p.nUscita + p.nEntrata));

  const daFare = [
    { fatto: dati!.pdv.length > 0, testo: 'Importa o inserisci i punti vendita', link: '#/pdv' },
    { fatto: dati!.premi.length > 0, testo: 'Importa i premi nei cataloghi 2025/2026 e 2026/2027', link: '#/cataloghi' },
    { fatto: operazioni.length > 0, testo: 'Registra il primo trasferimento', link: '#/trasferimento' },
  ];

  return (
    <div className="space-y-5">
      <Intestazione titolo="Dashboard" azioni={<>
        <a className="btn-primario btn-grande" href="#/trasferimento"><LuArrowRightLeft /> Nuovo trasferimento</a>
        <a className="btn-secondario btn-grande" href="#/reso"><LuUndo2 /> Nuovo reso</a>
      </>} />

      {daFare.some((d) => !d.fatto) && (
        <div className="card p-4">
          <h2 className="mb-2 font-semibold">Per iniziare</h2>
          <ol className="space-y-1">
            {daFare.map((d) => (
              <li key={d.testo} className="flex items-center gap-2">
                <LuCircleCheck className={d.fatto ? 'text-emerald-600' : 'text-slate-300'} />
                {d.fatto ? <span className="text-slate-500 line-through">{d.testo}</span> : <a className="text-brand-700 underline" href={d.link}>{d.testo}</a>}
              </li>
            ))}
          </ol>
        </div>
      )}

      <div className="card grid grid-cols-2 gap-3 p-3 md:grid-cols-4">
        <FiltroPeriodo idBase="dash" periodo={periodo} onChange={cambiaPeriodo} cataloghi={cataloghiOrdinati} />
        <div><label className="label" htmlFor="dash-cat">Stagione / catalogo</label><SelettoreCatalogo id="dash-cat" valore={catalogo} onChange={cambiaCatalogo} cataloghi={cataloghiOrdinati} /></div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi titolo="Trasferimenti" valore={num(tot.nTrasf)} nota="operazioni valide nel periodo" colore={COLORE_TRASF} />
        <Kpi titolo="Quantità trasferita" valore={num(tot.qTrasf)} nota="pezzi" colore={COLORE_TRASF} />
        <Kpi titolo="Resi" valore={num(tot.nResi)} nota="operazioni valide nel periodo" colore={COLORE_RESO} />
        <Kpi titolo="Quantità resa" valore={num(tot.qResi)} nota="pezzi" colore={COLORE_RESO} />
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <section className="card">
          <h2 className="border-b border-slate-200 px-4 py-2.5 font-semibold">Premi più movimentati</h2>
          {topPremi.length === 0 ? <Vuoto>Nessun movimento nel periodo.</Vuoto> : (
            <table className="tabella">
              <thead><tr><th>Premio</th><th>Cat.</th><th className="num">Trasferiti</th><th className="w-32" /><th className="num">Resi</th></tr></thead>
              <tbody>{topPremi.map((p) => (
                <tr key={p.premioId}>
                  <td>{p.codice && <span className="mr-1 font-mono text-xs text-slate-500">{p.codice}</span>}{p.descrizione}</td>
                  <td className="whitespace-nowrap">{mappe.cataloghi.get(p.catalogoId)?.codice}</td>
                  <td className="num font-semibold">{num(p.qTrasf)}</td>
                  <td><Barra valore={p.qTrasf} massimo={maxP} colore={COLORE_TRASF} /></td>
                  <td className="num">{num(p.qResi)}</td>
                </tr>))}
              </tbody>
            </table>
          )}
        </section>
        <section className="card">
          <h2 className="border-b border-slate-200 px-4 py-2.5 font-semibold">PDV con più trasferimenti</h2>
          {topPdv.length === 0 ? <Vuoto>Nessun trasferimento nel periodo.</Vuoto> : (
            <>
              <table className="tabella">
                <thead><tr><th>Punto vendita</th><th className="num">In uscita</th><th className="num">In entrata</th><th className="w-32" /></tr></thead>
                <tbody>{topPdv.map((p) => (
                  <tr key={p.pdvId}>
                    <td><span className="mr-1 font-mono text-xs text-slate-500">{p.codice}</span>{p.nome}</td>
                    <td className="num">{num(p.nUscita)}</td>
                    <td className="num">{num(p.nEntrata)}</td>
                    <td><Barra valore={p.nUscita + p.nEntrata} massimo={maxV} colore={COLORE_TRASF} /></td>
                  </tr>))}
                </tbody>
              </table>
              <p className="px-4 py-2 text-xs text-slate-500">Numero di operazioni. Ogni trasferimento coinvolge due PDV: compare in uscita per uno e in entrata per l'altro.</p>
            </>
          )}
        </section>
      </div>

      <section className="card">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2.5">
          <h2 className="font-semibold">Attività recenti</h2>
          <a className="text-sm text-brand-700 underline" href="#/storico">Vai allo storico</a>
        </div>
        {recenti.length === 0 ? <Vuoto>Nessuna operazione registrata.</Vuoto> : (
          <table className="tabella">
            <tbody>{recenti.map((o) => (
              <tr key={o.id} className={`cursor-pointer ${o.stato === 'annullato' ? 'text-slate-400' : ''}`} onClick={() => { location.hash = `#/storico?id=${o.id}`; }}>
                <td className="w-36 whitespace-nowrap text-slate-500">{dataOraIt(o.modificatoIl)}</td>
                <td className="w-28"><TipoBadge tipo={o.tipo} /></td>
                <td className="font-mono text-xs whitespace-nowrap">{o.id}</td>
                <td>{num(o.quantita)} × {o.premioDescrizione}</td>
                <td>{o.tipo === 'trasferimento' ? `${o.pdvOrigineNome} → ${o.pdvDestNome}` : o.pdvResoNome}</td>
                <td className="whitespace-nowrap">{dataIt(o.data)}</td>
                <td><StatoBadge stato={o.stato} /></td>
                <td className="text-slate-500">{o.modificatoDa}</td>
              </tr>))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
