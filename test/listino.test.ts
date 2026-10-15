/**
 * Test del listino premi: lettura Excel, raggruppamento delle varianti, confronto e ricerca.
 * Usa un file di prova con dati di esempio (test/fixtures/premi-prova.xlsx).
 * Se è impostata la variabile PREMI_XLSX con il percorso del file reale, lo verifica anche.
 * Avvio: node --test test/listino.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { leggiXlsx } from '../src/lib/xlsx.ts';
import {
  codiceDaEan, confronta, creaIndice, cerca, daVerificare, numeroDaValore, raggruppa, riconosciFogli, senzaCA, stagioneDa, type Gruppo,
} from '../src/lib/listino.ts';

const FILE = path.join(import.meta.dirname, 'fixtures', 'premi-prova.xlsx');
const carica = async (f: string) => riconosciFogli((await leggiXlsx(fs.readFileSync(f))).fogli);

test('utilità: stagione, EAN, numeri, suffisso C/A', () => {
  assert.equal(stagioneDa('2027-2026'), '2026/2027');
  assert.equal(stagioneDa('Foglio1', 'CONCORSO 2024-2023'), '2023/2024');
  assert.equal(codiceDaEan('24064545'), '0406454');
  assert.equal(codiceDaEan('123'), '');
  assert.equal(numeroDaValore('-'), null);
  assert.equal(numeroDaValore('49,00 €'), 49);
  assert.equal(numeroDaValore('9.900'), 9900);
  assert.equal(numeroDaValore(5200), 5200);
  assert.equal(senzaCA('DECESPUGLIATORE ELETTRICO C/A'), 'DECESPUGLIATORE ELETTRICO');
  assert.equal(senzaCA('OCCHIALI DA SOLE C/AI'), 'OCCHIALI DA SOLE C/AI', '«C/AI» fa parte del nome');
  assert.equal(senzaCA('GATTO C/STIVALI FABA'), 'GATTO C/STIVALI FABA');
});

test('lettura del file Excel: fogli, stagioni, codici come testo', async () => {
  const fogli = await carica(FILE);
  assert.deepEqual(fogli.map((f) => [f.nome, f.stagione, f.righe.length]), [['2027-2026', '2026/2027', 6], ['2026-2025', '2025/2026', 10]]);
  const tutte = fogli.flatMap((f) => f.righe);
  assert.ok(tutte.every((r) => typeof r.codice === 'string'));
  const ricostruito = tutte.find((r) => r.codice === '0356121');
  assert.ok(ricostruito, 'il codice scritto come numero 356121 diventa 0356121');
  assert.equal(ricostruito.codiceRicostruito, '356121');
  assert.equal(tutte.find((r) => r.codice === '0356122')?.codicePreconf, '0356121', 'formula =A10 letta dal valore calcolato');
});

test('caso principale: DECESPUGLIATORE ELETTRICO con le due versioni', async () => {
  const { gruppi } = raggruppa((await carica(FILE)).flatMap((f) => f.righe));
  const g = gruppi.find((x) => x.nome === 'DECESPUGLIATORE ELETTRICO')!;
  assert.ok(g);
  assert.equal(g.stagione, '2025/2026');
  assert.equal(g.varianti.length, 2);
  const [piena, ca] = g.varianti;
  assert.deepEqual([piena.codice, piena.punti, piena.contributo, piena.modalita], ['0406454', 9900, 0, 'pieno']);
  assert.deepEqual([ca.codice, ca.punti, ca.contributo, ca.modalita], ['0406455', 5200, 49, 'contributo']);
  assert.equal(daVerificare(g), false);
});

test('raggruppamento: nessuna duplicazione, nessun accorpamento sbagliato', async () => {
  const { gruppi, conteggi } = raggruppa((await carica(FILE)).flatMap((f) => f.righe));
  assert.equal(conteggi.righe, 16);
  assert.equal(conteggi.varianti, 16, 'ogni riga del file finisce in una sola variante');
  const codici = gruppi.flatMap((g) => g.varianti.map((v) => `${g.stagione}#${v.codice}#${v.ean}`));
  assert.equal(new Set(codici).size, codici.length, 'nessuna variante duplicata');
  // Stesso nome in stagioni diverse: premi distinti.
  const trolley = gruppi.filter((g) => g.nome === 'TROLLEY CABINA RONCATO');
  assert.equal(trolley.length, 2);
  assert.notEqual(trolley[0].stagione, trolley[1].stagione);
  // Nomi con «C/» che non sono varianti.
  assert.equal(gruppi.find((g) => g.nome === 'GATTO C/STIVALI FABA')?.varianti.length, 1);
  const occhiali = gruppi.find((g) => g.nome === 'OCCHIALI DA SOLE C/AI')!;
  assert.deepEqual(occhiali.varianti.map((v) => v.codice), ['0389397', '0389398']);
  // Variante senza «C/A» nel nome ma con codice principale e contributo.
  assert.deepEqual(gruppi.find((g) => g.nome === 'PULSOSSIMETRO BEURER')?.varianti.map((v) => [v.codice, v.modalita]), [['0406492', 'pieno'], ['0406493', 'contributo']]);
  // Contributo con i centesimi conservato esatto.
  assert.equal(gruppi.find((g) => g.stagione === '2025/2026' && g.nome === 'TROLLEY CABINA RONCATO')?.varianti[1].contributo, 28.5);
});

test('casi dubbi: codice duplicato risolto con l\'EAN e premio orfano, entrambi da verificare', async () => {
  const { gruppi } = raggruppa((await carica(FILE)).flatMap((f) => f.righe));
  const taglia = gruppi.find((g) => g.nome === 'TAGLIABORDI/SIEPI ELETTRICO')!;
  assert.equal(taglia.chiave, '2025/2026#0406452', 'chiave stabile dal codice confermato dall\'EAN');
  assert.deepEqual(taglia.varianti.map((v) => v.codice), ['0406384', '0406453'], 'i codici del file non vengono cambiati');
  assert.ok(daVerificare(taglia));
  assert.ok(taglia.verifiche.some((v) => v.testo.includes('EAN')));
  const wln = gruppi.find((g) => g.nome === 'TROLLEY WLN')!;
  assert.equal(wln.varianti.length, 1, 'il trolley con lo stesso codice non viene accorpato');
  const orfano = gruppi.find((g) => g.nome === 'PREMIO ORFANO')!;
  assert.ok(orfano && daVerificare(orfano));
  assert.equal(orfano.varianti[0].modalita, 'contributo');
});

test('ricerca: nome, parte del nome, codici completi e parziali, maiuscole, refusi', async () => {
  const { gruppi } = raggruppa((await carica(FILE)).flatMap((f) => f.righe));
  const idx = creaIndice(gruppi);
  const nomi = (q: string) => cerca(idx, q).risultati.map((r) => r.gruppo.nome);
  assert.deepEqual(nomi('DECESPUGLIATORE ELETTRICO'), ['DECESPUGLIATORE ELETTRICO']);
  assert.deepEqual(nomi('decespugl'), ['DECESPUGLIATORE ELETTRICO']);
  assert.deepEqual(nomi('  elettrico   decespugliatore '), ['DECESPUGLIATORE ELETTRICO'], 'ordine delle parole e spazi indifferenti');
  const c1 = cerca(idx, '0406454').risultati;
  assert.equal(c1.length, 1);
  assert.deepEqual(c1[0].evidenziati, ['0406454'], 'evidenzia la versione senza contributo');
  const c2 = cerca(idx, '0406455').risultati;
  assert.equal(c2[0].gruppo.nome, 'DECESPUGLIATORE ELETTRICO');
  assert.deepEqual(c2[0].evidenziati, ['0406455'], 'evidenzia la versione con contributo');
  assert.equal(c2[0].gruppo.varianti.length, 2, 'le altre versioni restano visibili');
  assert.deepEqual(cerca(idx, '406455').risultati[0].evidenziati, ['0406455'], 'anche senza zero iniziale');
  assert.deepEqual(nomi('64545'), ['DECESPUGLIATORE ELETTRICO'], 'codice parziale (anche EAN)');
  const refuso = cerca(idx, 'decespugliatre');
  assert.equal(refuso.simili, true);
  assert.equal(refuso.risultati[0].gruppo.nome, 'DECESPUGLIATORE ELETTRICO');
  assert.equal(cerca(idx, 'premio che non esiste').risultati.length, 0);
  assert.equal(cerca(idx, '').risultati.length, 0);
});

test('confronto con l\'archivio: invariati, modifiche di punti e contributo, nuovi, assenti, conflitti', async () => {
  const { gruppi } = raggruppa((await carica(FILE)).flatMap((f) => f.righe));
  const stesso = confronta(gruppi, gruppi);
  assert.equal(stesso.totali.invariati, gruppi.length);
  assert.equal(stesso.conflitti.length, 0, 'il codice duplicato nel file non è un conflitto con sé stesso');
  const copia: Gruppo[] = JSON.parse(JSON.stringify(gruppi));
  const dec = copia.find((g) => g.nome === 'DECESPUGLIATORE ELETTRICO')!;
  dec.varianti[1].punti = 5000; dec.varianti[1].contributo = 55;
  copia.push({ chiave: '2025/2026#0409999', stagione: '2025/2026', nome: 'PREMIO NUOVO', verifiche: [],
    varianti: [{ codice: '0409999', ean: '24099990', codicePreconf: '', descrizione: 'PREMIO NUOVO', punti: 100, contributo: 0, modalita: 'pieno', foglio: 'x', riga: 1 }] });
  const tolto = copia.findIndex((g) => g.nome === 'TROLLEY WLN');
  copia.splice(tolto, 1);
  // Lo stesso codice spostato su un altro premio: conflitto.
  copia.find((g) => g.nome === 'PULSOSSIMETRO BEURER')!.varianti.push({ codice: '0389151', ean: '23891517', codicePreconf: '', descrizione: 'X', punti: 1, contributo: 1, modalita: 'contributo', foglio: 'x', riga: 2 });
  copia.find((g) => g.nome === 'PULSOSSIMETRO BEURER')!.stagione = '2025/2026';
  const c = confronta(gruppi, copia);
  assert.equal(c.totali.nuovi, 1);
  const d = c.gruppi.find((g) => g.gruppo.nome === 'DECESPUGLIATORE ELETTRICO')!;
  assert.equal(d.esito, 'aggiornato');
  assert.deepEqual(d.varianti[1].modifiche.map((m) => [m.campo, m.prima, m.dopo]), [['punti', '5200', '5000'], ['contributo', '49', '55']]);
  assert.deepEqual(c.assenti.map((a) => a.nome), ['TROLLEY WLN'], 'chi manca dal file è segnalato, non cancellato');
});

test('file riorganizzato: rileggendolo si ottengono gli stessi premi', async () => {
  // Il formato «Varianti» del file riorganizzato rispetta i premi già decisi (anche quelli con codici duplicati).
  const { gruppi } = raggruppa((await carica(FILE)).flatMap((f) => f.righe));
  const righe = [['ID premio', 'Stagione', 'Premio', 'Codice principale', 'Codice', 'EAN', 'Cod. preconfez. originale', 'Descrizione originale', 'Modalità', 'Punti', 'Contributo €', 'Foglio origine', 'Riga origine'],
    ...gruppi.flatMap((g) => g.varianti.map((v) => [g.chiave, g.stagione, g.nome, g.varianti[0].codice, v.codice, v.ean, v.codicePreconf, v.descrizione,
      v.modalita === 'pieno' ? 'Punteggio pieno' : 'Punti ridotti + contributo', v.punti, v.contributo, v.foglio, v.riga]))];
  const fogli = riconosciFogli([{ nome: 'Varianti', righe }]);
  assert.equal(fogli[0].formato, 'riorganizzato');
  const di = raggruppa(fogli[0].righe);
  const c = confronta(gruppi, di.gruppi);
  assert.equal(c.totali.invariati, gruppi.length);
  assert.equal(c.totali.nuovi + c.totali.aggiornati, 0);
});

test('file reale (facoltativo, con PREMI_XLSX)', { skip: !process.env.PREMI_XLSX }, async () => {
  const fogli = await carica(process.env.PREMI_XLSX!);
  const righe = fogli.flatMap((f) => f.righe);
  const { gruppi, conteggi } = raggruppa(righe);
  assert.equal(conteggi.varianti, righe.length);
  const idx = creaIndice(gruppi);
  const r = cerca(idx, '0406455').risultati[0];
  assert.equal(r.gruppo.nome, 'DECESPUGLIATORE ELETTRICO');
  assert.deepEqual(r.gruppo.varianti.map((v) => [v.codice, v.punti, v.contributo]), [['0406454', 9900, 0], ['0406455', 5200, 49]]);
  for (const g of gruppi) {
    const p = g.varianti.find((v) => v.modalita === 'pieno');
    for (const v of g.varianti.filter((x) => x.modalita === 'contributo')) {
      assert.ok(v.contributo > 0, `${v.codice} ha un contributo`);
      if (p && p.punti !== null && v.punti !== null) assert.ok(v.punti < p.punti, `${v.codice} costa meno punti della versione piena`);
    }
  }
});

/* ======================================================================
 * Archivio del listino nel backend reale (Code.gs nell'emulatore)
 * ==================================================================== */
// @ts-expect-error modulo JavaScript dell'emulatore senza tipi
import { createBackend } from '../emulatore/gas-mock.mjs';
import os from 'node:os';
import { daArchivio, perImportazione, type ListinoArchivio } from '../src/lib/listino.ts';

const TOKEN = 'tok';
const nuovoDb = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'listino-test-')), 'db.json');
function backend(dataFile: string) {
  const be = createBackend({ dataFile, token: TOKEN });
  const call = (action: string, payload = {}) => be.request({ token: TOKEN, action, payload, operatore: 'Test' });
  const ok = (r: { ok: boolean; data?: unknown; error?: { message: string } }) => { assert.equal(r.ok, true, r.error?.message); return r.data as any; };
  return { be, call, ok };
}
const gruppiProva = async () => raggruppa((await carica(FILE)).flatMap((f) => f.righe)).gruppi;

test('backend: importazione, reimportazione, modifiche, assenti, ripristino e persistenza', async () => {
  const file = nuovoDb();
  const { be, call, ok } = backend(file);
  be.setup();
  const prima = ok(call('getAll'));
  const gruppi = await gruppiProva();

  const vuoto: ListinoArchivio = ok(call('getListino'));
  assert.deepEqual([vuoto.gruppi.length, vuoto.varianti.length, vuoto.importazioni.length], [0, 0, 0]);

  // 1) Prima importazione.
  const i1 = ok(call('importaListino', { file: 'premi-prova.xlsx', gruppi: perImportazione(gruppi) }));
  assert.equal(i1.importazione.premi_nuovi, String(gruppi.length));
  assert.equal(i1.importazione.varianti_nuove, '16');
  assert.equal(i1.importazione.premi_da_verificare, '3', 'tagliabordi, trolley con lo stesso codice, orfano');
  const arch = daArchivio(i1.listino);
  const dec = arch.find((g) => g.nome === 'DECESPUGLIATORE ELETTRICO')!;
  assert.deepEqual(dec.varianti.map((v) => [v.codice, v.punti, v.contributo, v.modalita]), [['0406454', 9900, 0, 'pieno'], ['0406455', 5200, 49, 'contributo']]);
  assert.ok(i1.listino.varianti.every((v: { codice: string }) => typeof v.codice === 'string'));
  assert.ok(i1.listino.varianti.some((v: { codice: string }) => v.codice === '0356121'), 'zeri iniziali conservati nel foglio');
  assert.equal(arch.find((g) => g.nome === 'TAGLIABORDI/SIEPI ELETTRICO')!.verifiche.length > 0, true, 'le note di verifica tornano indietro');
  // L'archivio riletto è identico al file: confronto senza differenze.
  assert.equal(confronta(arch, gruppi).totali.invariati, gruppi.length);

  // 2) Stessa importazione: tutto invariato, nessun doppione.
  const i2 = ok(call('importaListino', { file: 'premi-prova.xlsx', gruppi: perImportazione(gruppi) }));
  assert.deepEqual([i2.importazione.premi_nuovi, i2.importazione.premi_aggiornati, i2.importazione.premi_invariati], ['0', '0', String(gruppi.length)]);
  assert.equal(i2.listino.varianti.length, 16);

  // 3) Aggiornamento parziale: punti e contributo cambiati, un premio nuovo, un premio assente dal file.
  const mod: typeof gruppi = JSON.parse(JSON.stringify(gruppi));
  const d = mod.find((g) => g.nome === 'DECESPUGLIATORE ELETTRICO')!;
  d.varianti[1].punti = 5000; d.varianti[1].contributo = 55.5;
  mod.push({ chiave: '2025/2026#0409999', stagione: '2025/2026', nome: 'PREMIO NUOVO', verifiche: [],
    varianti: [{ codice: '0409999', ean: '24099990', codicePreconf: '', descrizione: 'PREMIO NUOVO', punti: 100, contributo: 0, modalita: 'pieno', foglio: 'x', riga: 1 }] });
  const senzaWln = mod.filter((g) => g.nome !== 'TROLLEY WLN');
  const i3 = ok(call('importaListino', { file: 'aggiornamento.xlsx', gruppi: perImportazione(senzaWln) }));
  assert.equal(i3.importazione.premi_nuovi, '1');
  assert.equal(i3.importazione.premi_aggiornati, '1');
  assert.equal(i3.importazione.varianti_aggiornate, '1');
  assert.equal(i3.importazione.non_presenti, '1');
  assert.equal(i3.importazione.disattivati, '0');
  const a3 = daArchivio(i3.listino);
  assert.ok(a3.some((g) => g.nome === 'TROLLEY WLN'), 'il premio assente dal file resta in archivio');
  assert.deepEqual(a3.find((g) => g.nome === 'DECESPUGLIATORE ELETTRICO')!.varianti[1].contributo, 55.5);

  // 4) Persistenza: un nuovo avvio legge gli stessi dati.
  const riavvio = backend(file);
  const dopo: ListinoArchivio = riavvio.ok(riavvio.call('getListino'));
  assert.equal(dopo.varianti.length, 17);
  assert.equal(dopo.importazioni.length, 3);
  assert.equal(dopo.importazioni[0].file, 'aggiornamento.xlsx', 'storico dal più recente');

  // 5) Disattivazione solo su richiesta.
  const i4 = riavvio.ok(riavvio.call('importaListino', { file: 'agg.xlsx', gruppi: perImportazione(senzaWln), disattiva_assenti: true }));
  assert.equal(i4.importazione.disattivati, '1');
  assert.ok(!daArchivio(i4.listino).some((g) => g.nome === 'TROLLEY WLN'));
  assert.ok(daArchivio(i4.listino, false).some((g) => g.nome === 'TROLLEY WLN'), 'disattivato, non cancellato');

  // 6) Ripristino del listino com'era prima dell'aggiornamento (3).
  const r = riavvio.ok(riavvio.call('ripristinaListino', { importazione_id: i3.importazione.id }));
  assert.equal(r.importazione.tipo, 'ripristino');
  const ar = daArchivio(r.listino);
  assert.equal(ar.find((g) => g.nome === 'DECESPUGLIATORE ELETTRICO')!.varianti[1].punti, 5200);
  assert.ok(!ar.some((g) => g.nome === 'PREMIO NUOVO'));
  assert.ok(ar.some((g) => g.nome === 'TROLLEY WLN'));
  // Anche il ripristino si può annullare.
  const lr: ListinoArchivio = riavvio.ok(riavvio.call('getListino'));
  assert.equal(lr.importazioni.find((x) => x.id === r.importazione.id)?.ripristinabile, 'SI');

  // 7) Le altre funzioni del gestionale non sono toccate.
  const tutto = riavvio.ok(riavvio.call('getAll'));
  assert.deepEqual(tutto.cataloghi, prima.cataloghi);
  assert.deepEqual(tutto.causali, prima.causali);
});

test('backend: dati non validi rifiutati senza toccare l\'archivio', async () => {
  const { be, call } = backend(nuovoDb());
  be.setup();
  const ko = (r: { ok: boolean; error?: { code: string } }, code: string) => { assert.equal(r.ok, false); assert.equal(r.error!.code, code); };
  ko(call('importaListino', { gruppi: [] }), 'VALIDAZIONE');
  ko(call('importaListino', { gruppi: [{ chiave: 'x', stagione: '2025/2026', nome: 'A', varianti: [{ codice: '1', modalita: 'boh', punti: 1, contributo: 0 }] }] }), 'VALIDAZIONE');
  ko(call('importaListino', { gruppi: [{ chiave: 'x', stagione: '2025/2026', nome: 'A', varianti: [{ codice: '1', modalita: 'pieno', punti: -3, contributo: 0 }] }] }), 'VALIDAZIONE');
  ko(call('importaListino', { gruppi: [
    { chiave: 'x', stagione: '2025/2026', nome: 'A', varianti: [{ codice: '1', ean: '', modalita: 'pieno', punti: 1, contributo: 0 }] },
    { chiave: 'y', stagione: '2025/2026', nome: 'B', varianti: [{ codice: '1', ean: '', modalita: 'pieno', punti: 1, contributo: 0 }] }] }), 'VALIDAZIONE');
  ko(call('ripristinaListino', { importazione_id: 'IM-999999' }), 'NON_TROVATO');
  const l = call('getListino') as { data: ListinoArchivio };
  assert.equal(l.data.varianti.length, 0);
  assert.equal(l.data.importazioni.length, 0);
});

test('backend: database già in uso senza le tabelle del listino', () => {
  const file = nuovoDb();
  const { be, call, ok } = backend(file);
  be.setup();
  const pdv = ok(call('savePdv', { codice: 'V1', nome: 'Vecchio PDV' }));
  const st = JSON.parse(fs.readFileSync(file, 'utf8'));
  for (const n of ['ListinoGruppi', 'ListinoVarianti', 'Importazioni', 'ListinoBackup']) {
    st.spreadsheet.order = st.spreadsheet.order.filter((x: string) => x !== n);
    delete st.spreadsheet.sheets[n];
  }
  fs.writeFileSync(file, JSON.stringify(st));
  const b2 = backend(file);
  assert.deepEqual(b2.ok(b2.call('getListino')).gruppi, []);
  assert.equal(b2.ok(b2.call('getAll')).pdv[0].id, pdv.id, 'i dati esistenti restano');
});

test('backend: il backup completo include il listino; un backup vecchio non lo cancella', async () => {
  const { be, call, ok } = backend(nuovoDb());
  be.setup();
  ok(call('importaListino', { file: 'x.xlsx', gruppi: perImportazione(await gruppiProva()) }));
  const backup = ok(call('exportBackup'));
  assert.equal(backup.fogli.ListinoVarianti.righe.length, 16);
  ok(call('importaListino', { file: 'y.xlsx', gruppi: perImportazione([{ chiave: 'k', stagione: '2030/2031', nome: 'EXTRA', verifiche: [],
    varianti: [{ codice: '0999999', ean: '', codicePreconf: '', descrizione: 'EXTRA', punti: 1, contributo: 0, modalita: 'pieno', foglio: '', riga: 1 }] }]) }));
  ok(call('restoreBackup', { backup, conferma: 'RIPRISTINA' }));
  assert.equal(ok(call('getListino')).varianti.length, 16, 'il backup riporta il listino com\'era');
  const vecchio = JSON.parse(JSON.stringify(backup));
  for (const n of ['ListinoGruppi', 'ListinoVarianti', 'Importazioni', 'ListinoBackup']) delete vecchio.fogli[n];
  const r = ok(call('restoreBackup', { backup: vecchio, conferma: 'RIPRISTINA' }));
  assert.equal(r.conteggi.ListinoVarianti, 'invariato');
  assert.equal(ok(call('getListino')).varianti.length, 16, 'un backup senza listino lo lascia intatto');
});
