/**
 * Test della lettura dell'export "Prenotazioni premi" di Jasper (dati inventati).
 * Avvio: npm test
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  analizzaJasper, aperteDaTroppo, creaRiepilogo, filtraJasper, giornoDa, leggiExportJasper, numeroIt, tabellaMesi, verificaTotali,
} from '../src/lib/jasper.ts';
import { leggiCsv } from '../src/lib/csv.ts';
import type { ValoreCella } from '../src/lib/xlsx.ts';

const INT = ['Data apertura', 'Codice riordino', null, 'Codice articolo', null, 'Pdv', 'Articolo', 'Codice Prenotazione', 'Tessera',
  'Tipo', 'Stato', 'Etic.', 'Chiusura Storno', null, 'Contributo', null, 'Qta'];

// Come esce da Excel: date numeriche, intestazioni ripetute, subtotali per PDV, righe "Report eseguito il".
function excel(): ValoreCella[][] {
  const r = (data: number, rio: string, art: string, pdv: string, cod: string, tess: string, tipo: string, stato: string, etic: string, chius: number | null, contr: number): ValoreCella[] =>
    [data, rio, null, rio, null, pdv, art, cod, tess, tipo, stato, etic, chius, null, contr, null, 1];
  return [
    [null, null, null, null, 'Prenotazioni premi'],
    ['Totali', null, null, null, null, null, null, null, null, null, null, null, null, null, null, 39, 6],
    INT,
    [null, null, null, null, null, null, null, null, null, null, null, null, null, null, 10, null, 3],
    r(46267, '0406415', 'PADELLA 24 CM BERGNER', '001', '9900000000001', '0499000000001', 'Prenotazione', 'Aperta', 'No', null, 0),
    r(46200, '0406415', 'PADELLA 24 CM BERGNER C/A', '001', '9900000000002', '0499000000002', 'ONLINE', 'Chiusa', 'Si', 46210, 9),
    ['Report eseguito il: ', null, 46290.48],
    INT,
    r(46150, '0406518', 'SCOPA ELETTRICA S/FILI C/', '001', '9900000000003', '0499000000002', 'Prenotazione', 'Aperta', 'Si', null, 1),
    [null, null, null, null, null, null, null, null, null, null, null, null, null, null, 29, null, 3],
    r(46268, '0406245', 'DONAZIONE ENPA', '016', '9900000000004', '0499000000003', 'ONLINE', 'Chiusa', 'No', 46268, 0),
    r(46100, '0406518', 'SCOPA ELETTRICA S/FILI C/A', '016', '9900000000005', '0499000000004', 'Prenotazione', 'Stornata', 'No', 46101, 29),
    r(46268, '0406415', 'PADELLA 24 CM BERGNER', '016', '9900000000006', '0499000000004', 'Prenotazione', 'Aperta', 'No', null, 0),
  ];
}

test('numeri e date in formato italiano o Excel', () => {
  assert.equal(numeroIt('1.234,50'), 1234.5);
  assert.equal(numeroIt('52.306'), 52306);
  assert.equal(numeroIt('12,00'), 12);
  assert.equal(numeroIt(7), 7);
  assert.equal(giornoDa(46267), giornoDa('02/09/2026'));
  assert.equal(giornoDa('2026-09-01'), giornoDa('1/9/26'));
  assert.equal(giornoDa(''), null);
});

test('export Excel: solo le prenotazioni, stati, C/A, donazioni e controllo dei totali', () => {
  const e = leggiExportJasper(excel());
  assert.equal(e.righe.length, 6, 'intestazioni ripetute, subtotali e righe del report vanno scartati');
  assert.deepEqual(e.totali, { contributo: 39, qta: 6 });
  assert.ok(e.dataReport !== null);
  assert.equal(verificaTotali(e)?.ok, true);
  const [a, b, c, d, s] = e.righe;
  assert.equal(a.stato, 'daetic');
  assert.equal(b.stato, 'chiusa');
  assert.equal(b.tipo, 'Online');
  assert.equal(b.premio, 'PADELLA 24 CM BERGNER', 'il suffisso C/A va tolto dal nome');
  assert.equal(b.conContributo, true);
  assert.equal(b.chiusura! - b.apertura!, 10);
  assert.equal(c.stato, 'etic');
  assert.equal(c.premio, 'SCOPA ELETTRICA S/FILI', 'anche il suffisso troncato "C/"');
  assert.equal(d.donazione, true);
  assert.equal(s.stato, 'stornata');
});

test('statistiche: classifiche, donazioni a parte, tempi e aperte da troppo', () => {
  const e = leggiExportJasper(excel());
  const valide = filtraJasper(e.righe, { da: 0, a: 999999, pdv: '', tipo: '', testo: '', stati: new Set(['daetic', 'etic', 'chiusa', 'altro']) });
  assert.equal(valide.length, 5, 'stornate escluse');
  const an = analizzaJasper(valide);
  assert.equal(an.qta, 4, 'la donazione non conta tra i premi');
  assert.deepEqual(an.donazioni, [{ nome: 'DONAZIONE ENPA', qta: 1 }]);
  const padella = an.premi.find((p) => p.chiave === '0406415')!;
  assert.equal(padella.qta, 3, 'versione piena e con contributo insieme');
  assert.equal(padella.conContributo, 1);
  assert.equal(padella.pdv, 2);
  assert.equal(an.nChiuse, 1);
  assert.equal(an.giorniChiusura, 10);
  assert.equal(an.tessere[0].tessera, '0499000000002');
  const vecchie = aperteDaTroppo(valide, e.dataReport!, 60);
  assert.equal(vecchie.totale, 1, 'solo la scopa aperta da oltre 60 giorni');
  const tab = tabellaMesi(valide, 'pdv');
  assert.equal(tab[0].chiave, '001');
  const filtroPdv = filtraJasper(e.righe, { da: 0, a: 999999, pdv: '016', tipo: '', testo: 'padella', stati: new Set(['daetic']) });
  assert.equal(filtroPdv.length, 1);
});

test('riepilogo salvato: niente tessere né codici prenotazione', () => {
  const r = creaRiepilogo(leggiExportJasper(excel()));
  assert.equal(r.righe, 6);
  assert.equal(r.pezzi, 4);
  const testo = JSON.stringify(r.dati);
  assert.ok(!testo.includes('0499000000'), 'nessun numero di tessera');
  assert.ok(!testo.includes('9900000000'), 'nessun codice prenotazione');
  assert.deepEqual(r.dati.premi[0], ['0406415', 'PADELLA 24 CM BERGNER', 3]);
});

test('export CSV con separatore ; e numeri italiani', () => {
  const csv = [
    ';;;;Prenotazioni premi',
    'Totali;;;;;;;;;;;;;;;140.963,00;2',
    INT.map((x) => x ?? '').join(';'),
    '19/07/2026;0406397;;0406397;;001;SET 6 BICCHIERI DECORATI;9900000000101;0499000000999;ONLINE;Chiusa;Sì;27/07/2026;;0,00;;1',
    '19/07/2026;0406397;;0406398;;001;SET 6 BICCHIERI DECORATI C/A;9900000000102;0499000000999;ONLINE;Chiusa;Sì;27/07/2026;;140.963,00;;1',
    'Report eseguito il: ;;15/10/2026',
  ].join('\r\n');
  const e = leggiExportJasper(leggiCsv(csv));
  assert.equal(e.righe.length, 2);
  assert.equal(e.righe[0].tessera, '0499000000999', 'gli zeri iniziali della tessera restano');
  assert.equal(e.righe[1].contributo, 140963);
  assert.equal(e.righe[0].chiusura! - e.righe[0].apertura!, 8);
  assert.equal(verificaTotali(e)?.ok, true);
  assert.equal(e.dataReport, giornoDa('15/10/2026'));
});

test('file sbagliato: messaggio chiaro', () => {
  assert.throws(() => leggiExportJasper([['Codice PDV', 'Nome']]), /Codice Prenotazione/);
});
