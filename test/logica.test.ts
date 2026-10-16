/**
 * Test della logica di statistiche e CSV (senza browser).
 * Avvio: node --test test/logica.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BOM, creaCsv, decodifica, leggiCsv, rilevaSeparatore } from '../src/lib/csv.ts';
import { unisci } from '../src/lib/operazioni.ts';
import { andamentoMensile, filtraValide, filtriVuoti, perCatalogo, perCausale, premiDelPdv, statPerPdv, statPerPremio, totali } from '../src/lib/statistiche.ts';
import type { Catalogo, Reso, Trasferimento } from '../src/lib/types.ts';

const base = { premio_codice: '', causale: '', riferimento: '', note: '', creato_il: '2026-10-01T10:00:00Z', creato_da: 'x', modificato_il: '', modificato_da: '', annullato_il: '', motivo_annullamento: '' };
const tr = (id: string, data: string, cat: string, premio: string, da: string, a: string, q: number, stato: 'valido' | 'annullato' = 'valido', causale = ''): Trasferimento => ({
  ...base, id, data, catalogo_id: cat, premio_id: premio, premio_descrizione: premio, pdv_origine_id: da, pdv_origine_codice: da, pdv_origine_nome: da,
  pdv_destinazione_id: a, pdv_destinazione_codice: a, pdv_destinazione_nome: a, quantita: String(q), stato, causale,
});
const rs = (id: string, data: string, cat: string, premio: string, pdv: string, q: number, causale = '', stato: 'valido' | 'annullato' = 'valido'): Reso => ({
  ...base, id, data, catalogo_id: cat, premio_id: premio, premio_descrizione: premio, pdv_id: pdv, pdv_codice: pdv, pdv_nome: pdv, quantita: String(q), trasferimento_id: '', stato, causale,
});

const ops = unisci([
  tr('T1', '2026-09-10', 'C1', 'P1', 'A', 'B', 10),
  tr('T2', '2026-09-20', 'C1', 'P1', 'B', 'C', 4),
  tr('T3', '2026-10-05', 'C2', 'P2', 'A', 'C', 7, 'valido', 'Richiesta del PDV'),
  tr('T4', '2026-10-06', 'C1', 'P1', 'A', 'B', 100, 'annullato'),
], [
  rs('R1', '2026-10-01', 'C1', 'P1', 'C', 2, 'Premio difettoso'),
  rs('R2', '2026-10-02', 'C1', 'P1', 'B', 1, 'Eccedenza'),
  rs('R3', '2026-12-01', 'C2', 'P3', 'A', 5, 'Premio difettoso'),
]);

test('le operazioni annullate sono escluse', () => {
  const v = filtraValide(ops, filtriVuoti);
  assert.equal(v.length, 6);
  assert.ok(!v.some((o) => o.id === 'T4'));
});

test('totali: ogni trasferimento contato una volta', () => {
  const t = totali(filtraValide(ops, filtriVuoti));
  assert.equal(t.nTrasf, 3);
  assert.equal(t.qTrasf, 21);
  assert.equal(t.nResi, 3);
  assert.equal(t.qResi, 8);
  assert.equal(t.pdvMovimentati, 3);
  assert.equal(t.premiMovimentati, 3);
});

test('filtro per PDV: entrate e uscite distinte', () => {
  const v = filtraValide(ops, { ...filtriVuoti, pdvId: 'B' });
  const t = totali(v, 'B');
  assert.equal(t.nTrasf, 2); // T1 (entrata) e T2 (uscita)
  assert.equal(t.qTrasf, 14);
  assert.deepEqual(t.perPdv, { nUscita: 1, qUscita: 4, nEntrata: 1, qEntrata: 10 });
  assert.equal(t.qResi, 1);
});

test('statistiche per PDV', () => {
  const s = new Map(statPerPdv(filtraValide(ops, filtriVuoti)).map((x) => [x.pdvId, x]));
  assert.deepEqual({ ...s.get('A') }, { pdvId: 'A', codice: 'A', nome: 'A', nUscita: 2, qUscita: 17, nEntrata: 0, qEntrata: 0, nResi: 1, qResi: 5 });
  assert.equal(s.get('B')!.qEntrata, 10);
  assert.equal(s.get('B')!.qUscita, 4);
  assert.equal(s.get('C')!.qEntrata, 11);
  // La somma delle uscite è uguale al totale trasferito (e lo stesso vale per le entrate).
  const tutti = [...s.values()];
  assert.equal(tutti.reduce((a, x) => a + x.qUscita, 0), 21);
  assert.equal(tutti.reduce((a, x) => a + x.qEntrata, 0), 21);
});

test('statistiche per premio e rapporto resi/trasferiti', () => {
  const s = new Map(statPerPremio(filtraValide(ops, filtriVuoti)).map((x) => [x.premioId, x]));
  const p1 = s.get('P1')!;
  assert.equal(p1.qTrasf, 14);
  assert.equal(p1.qResi, 3);
  assert.equal(p1.tassoReso, 3 / 14);
  assert.equal(p1.pdvCoinvolti, 3);
  assert.equal(s.get('P3')!.tassoReso, null, 'senza trasferimenti il rapporto non è calcolabile');
  const conPdv = new Map(statPerPremio(filtraValide(ops, { ...filtriVuoti, pdvId: 'B' }), 'B').map((x) => [x.premioId, x]));
  assert.equal(conPdv.get('P1')!.qEntrata, 10);
  assert.equal(conPdv.get('P1')!.qUscita, 4);
});

test('cataloghi separati e confronto tra stagioni', () => {
  const c1 = totali(filtraValide(ops, { ...filtriVuoti, catalogoId: 'C1' }));
  const c2 = totali(filtraValide(ops, { ...filtriVuoti, catalogoId: 'C2' }));
  assert.equal(c1.qTrasf, 14);
  assert.equal(c2.qTrasf, 7);
  const cat = [{ id: 'C1', codice: '2025/2026', nome: '' }, { id: 'C2', codice: '2026/2027', nome: '' }] as Catalogo[];
  const cmp = perCatalogo(filtraValide(ops, filtriVuoti), cat);
  assert.deepEqual(cmp.map((c) => [c.codice, c.qTrasf, c.qResi]), [['2025/2026', 14, 3], ['2026/2027', 7, 5]]);
});

test('filtri per periodo, premio e tipo', () => {
  assert.equal(filtraValide(ops, { ...filtriVuoti, da: '2026-10-01', a: '2026-10-31' }).length, 3);
  assert.equal(filtraValide(ops, { ...filtriVuoti, premioId: 'P1', tipo: 'reso' }).length, 2);
});

test('andamento mensile con mesi vuoti', () => {
  const m = andamentoMensile(filtraValide(ops, filtriVuoti));
  assert.deepEqual(m.map((x) => x.mese), ['2026-09', '2026-10', '2026-11', '2026-12']);
  assert.equal(m[0].qTrasf, 14);
  assert.equal(m[2].qTrasf + m[2].qResi, 0);
});

test('causali e premi del PDV', () => {
  const c = perCausale(filtraValide(ops, filtriVuoti));
  assert.deepEqual(c.resi.map((x) => [x.causale, x.q]), [['Premio difettoso', 7], ['Eccedenza', 1]]);
  assert.deepEqual(c.trasferimenti.map((x) => x.causale), ['Non indicata', 'Richiesta del PDV']);
  const p = premiDelPdv(filtraValide(ops, filtriVuoti), 'B');
  assert.deepEqual(p.map((x) => [x.id, x.qUscita, x.qEntrata, x.qResi]), [['P1', 4, 10, 1]]);
});

test('CSV: separatore italiano, virgolette, a capo, formule e decimali', () => {
  const righe = [{ a: 'Testo; con separatore', b: 12, c: 'Dice "ciao"\nriga 2' }, { a: '=SOMMA(A1)', b: 2.5, c: '-nota' }, { a: '-12', b: 0, c: '' }];
  const csv = creaCsv(righe, [{ titolo: 'A', valore: (r) => r.a }, { titolo: 'Quantità', valore: (r) => r.b }, { titolo: 'C', valore: (r) => r.c }], ';');
  assert.equal(csv, 'A;Quantità;C\r\n"Testo; con separatore";12;"Dice ""ciao""\nriga 2"\r\n\'=SOMMA(A1);2,5;\'-nota\r\n-12;0;\r\n');
  // Rilettura: nessuna riga persa
  const letto = leggiCsv(csv);
  assert.equal(letto.length, 4);
  assert.deepEqual(letto[1], ['Testo; con separatore', '12', 'Dice "ciao"\nriga 2']);
  assert.equal(BOM, '﻿');
});

test('CSV in lettura: separatore automatico e codifica Windows-1252', () => {
  assert.equal(rilevaSeparatore('codice,nome\n1,a'), ',');
  assert.equal(rilevaSeparatore('"a;b",c,d\n'), ',');
  assert.equal(rilevaSeparatore('codice;nome;città'), ';');
  const ansi = new Uint8Array([0x63, 0x69, 0x74, 0x74, 0xe0, 0x3b, 0x78]); // "città;x" in Windows-1252
  const d = decodifica(ansi.buffer);
  assert.equal(d.testo, 'città;x');
  assert.equal(d.codifica, 'Windows-1252');
  const utf8 = new TextEncoder().encode('﻿città;x');
  assert.equal(decodifica(utf8.buffer as ArrayBuffer).testo, 'città;x');
  assert.deepEqual(leggiCsv('a;b\r\n\r\n1;2\r\n;\r\n'), [['a', 'b'], ['1', '2']], 'righe vuote ignorate');
});

test('assegnazioni: unite allo storico ma escluse dalle statistiche tra PDV', async () => {
  const { daAssegnazione, descriviPdv, nomeTipo } = await import('../src/lib/operazioni.ts');
  const as = { ...base, id: 'A1', data: '2026-10-03', catalogo_id: 'C1', premio_id: 'P1', premio_descrizione: 'P1', pdv_id: 'B', pdv_codice: 'B', pdv_nome: 'B', quantita: '6', prenotazione: 'PR1', stato: 'valido' as const };
  const tutte = unisci([tr('T9', '2026-10-03', 'C1', 'P1', 'A', 'B', 1)], [], [as]);
  assert.equal(tutte.length, 2);
  const o = daAssegnazione(as);
  assert.equal(o.tipo, 'assegnazione');
  assert.equal(o.pdvOrigineNome, 'Magazzino via Svezia 04');
  assert.equal(o.pdvDestId, 'B');
  assert.equal(o.prenotazione, 'PR1');
  assert.equal(descriviPdv(o), 'Magazzino via Svezia 04 → B');
  assert.equal(nomeTipo('assegnazione', true), 'Assegnazione');
  const v = filtraValide(tutte, filtriVuoti);
  assert.deepEqual(v.map((x) => x.id), ['T9']);
  const t = totali(v);
  assert.equal(t.nResi, 0, 'un\'assegnazione non viene contata come reso');
});

test('mail del trasferimento: negozio che riceve, quantità, codice e descrizione come salvati', async () => {
  const { testoMailTrasferimento, oggettoMailTrasferimento } = await import('../src/lib/operazioni.ts');
  const d = { pdvDestCodice: '038', pdvDestNome: 'PIOVE DI SACCO', quantita: '1', premioCodice: '0406397', premioDescrizione: 'BICCHIERI DECORATI' };
  assert.equal(testoMailTrasferimento(d),
    'Ciao, vi chiedo cortesemente di inviare a 038 PIOVE DI SACCO - 1pz - cod. 0406397 - BICCHIERI DECORATI con bolla di trasferimento interno.\nGrazie e buon lavoro');
  assert.match(testoMailTrasferimento({ ...d, quantita: 12 }), / - 12pz - /);
  assert.equal(oggettoMailTrasferimento(d), 'Trasferimento premio cod. 0406397 per 038 PIOVE DI SACCO');
});

test("mail dell'assegnazione: quantità, premio e codice assegnati", async () => {
  const { testoMailAssegnazione, oggettoMailAssegnazione } = await import('../src/lib/operazioni.ts');
  const d = { quantita: '1', premioCodice: '0406407', premioDescrizione: 'MACINA SALE E PEPE' };
  assert.equal(testoMailAssegnazione(d),
    'Ciao, come da accordi, ho assegnato 1pz MACINA SALE E PEPE cod 0406407 per CF (inserisco io in seguito la carta fedeltà)\n\nGrazie e buon lavoro');
  assert.equal(oggettoMailAssegnazione(d), 'Assegnazione premio cod. 0406407 - MACINA SALE E PEPE');
});
