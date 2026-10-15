/**
 * Test del backend reale (apps-script/Code.gs) eseguito nell'emulatore.
 * Avvio: npm run test:backend
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createBackend } from '../emulatore/gas-mock.mjs';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gestionale-test-'));
const dataFile = path.join(dir, 'db.json');
const TOKEN = 'token-di-prova';
let be = createBackend({ dataFile, token: TOKEN });
be.setup();

const call = (action, payload = {}, extra = {}) => be.request({ token: TOKEN, action, payload, operatore: 'Test', ...extra });
const ok = (r) => { assert.equal(r.ok, true, JSON.stringify(r.error)); return r.data; };
const ko = (r, code) => { assert.equal(r.ok, false, 'atteso errore'); if (code) assert.equal(r.error.code, code, r.error.message); return r.error; };

let C1, C2, P1, P2, P3, pr1, pr2, tr1;

test('sicurezza: token mancante o errato', () => {
  ko(be.request({ action: 'getAll' }), 'AUTH');
  ko(be.request({ token: 'sbagliato', action: 'getAll' }), 'AUTH');
  ko(call('azioneInesistente'), 'RICHIESTA');
});

test('setup: due cataloghi e causali iniziali, nessun premio o PDV inventato', () => {
  const d = ok(call('getAll'));
  assert.deepEqual(d.cataloghi.map((c) => c.codice), ['2025/2026', '2026/2027']);
  assert.equal(d.premi.length, 0);
  assert.equal(d.pdv.length, 0);
  assert.equal(d.causali.filter((c) => c.tipo === 'reso').length, 5);
  [C1, C2] = d.cataloghi.map((c) => c.id);
  be.setup(); // ripetere setup non duplica nulla
  assert.equal(ok(call('getAll')).cataloghi.length, 2);
});

test('creazione PDV, codici duplicati ed e-mail non valide', () => {
  P1 = ok(call('savePdv', { codice: 'PDV001', nome: 'Negozio Uno (FITTIZIO)', email: 'Uno@Esempio.it' }));
  assert.equal(P1.email, 'uno@esempio.it');
  assert.equal(P1.attivo, 'SI');
  P2 = ok(call('savePdv', { codice: 'PDV002', nome: 'Negozio Due (FITTIZIO)' }));
  P3 = ok(call('savePdv', { codice: '00123', nome: 'Negozio con zeri' }));
  assert.equal(ok(call('getAll')).pdv.find((p) => p.id === P3.id).codice, '00123', 'gli zeri iniziali devono restare');
  ko(call('savePdv', { codice: 'pdv001', nome: 'Doppione' }), 'DUPLICATO');
  ko(call('savePdv', { codice: 'X', nome: 'Y', email: 'non-una-mail' }), 'VALIDAZIONE');
  ko(call('savePdv', { codice: '', nome: 'Senza codice' }), 'VALIDAZIONE');
});

test('premi nei due cataloghi, duplicati per catalogo', () => {
  pr1 = ok(call('savePremio', { catalogo_id: C1, codice: 'A100', descrizione: 'Premio prova 25/26' }));
  pr2 = ok(call('savePremio', { catalogo_id: C2, codice: 'A100', descrizione: 'Premio prova 26/27' }));
  assert.notEqual(pr1.id, pr2.id, 'stesso codice ammesso in cataloghi diversi');
  ko(call('savePremio', { catalogo_id: C1, codice: 'a100', descrizione: 'Altro' }), 'DUPLICATO');
  ko(call('savePremio', { catalogo_id: C1, codice: 'Z', descrizione: '' }), 'VALIDAZIONE');
  ko(call('savePremio', { id: pr1.id, catalogo_id: C2, codice: 'A100', descrizione: 'x' }), 'DUPLICATO');
});

test('trasferimento valido e validazioni', () => {
  tr1 = ok(call('saveTrasferimento', { data: '2026-10-01', catalogo_id: C1, premio_id: pr1.id, pdv_origine_id: P1.id, pdv_destinazione_id: P2.id, quantita: 5, riferimento: 'DDT 1' }));
  assert.equal(tr1.id, 'TR-000001');
  assert.equal(tr1.stato, 'valido');
  assert.equal(tr1.premio_descrizione, 'Premio prova 25/26');
  assert.equal(tr1.pdv_origine_nome, 'Negozio Uno (FITTIZIO)');
  assert.equal(tr1.creato_da, 'Test');
  const base = { data: '2026-10-01', catalogo_id: C1, premio_id: pr1.id, pdv_origine_id: P1.id, pdv_destinazione_id: P2.id, quantita: 1 };
  ko(call('saveTrasferimento', { ...base, pdv_destinazione_id: P1.id }), 'VALIDAZIONE');
  for (const q of [0, -3, 2.5, 'abc', '']) ko(call('saveTrasferimento', { ...base, quantita: q }), 'VALIDAZIONE');
  ko(call('saveTrasferimento', { ...base, premio_id: pr2.id }), 'VALIDAZIONE'); // premio di un altro catalogo
  ko(call('saveTrasferimento', { ...base, premio_id: 'PR-999999' }), 'VALIDAZIONE');
  ko(call('saveTrasferimento', { ...base, pdv_origine_id: 'PV-999999' }), 'VALIDAZIONE');
  ko(call('saveTrasferimento', { ...base, data: '2026-02-30' }), 'VALIDAZIONE');
  ko(call('saveTrasferimento', { ...base, causale: 'Causale inventata' }), 'VALIDAZIONE');
  const t2 = ok(call('saveTrasferimento', { ...base, catalogo_id: C2, premio_id: pr2.id, pdv_origine_id: P2.id, pdv_destinazione_id: P3.id, quantita: 3, causale: 'richiesta del pdv' }));
  assert.equal(t2.causale, 'Richiesta del PDV');
});

test('testo che sembra una formula resta testo', () => {
  const t = ok(call('saveTrasferimento', { data: '2026-10-02', catalogo_id: C1, premio_id: pr1.id, pdv_origine_id: P2.id, pdv_destinazione_id: P1.id, quantita: 1, note: '=SOMMA(A1:A3)', riferimento: '-rif' }));
  const back = ok(call('getAll')).trasferimenti.find((x) => x.id === t.id);
  assert.equal(back.note, '=SOMMA(A1:A3)');
  assert.equal(back.riferimento, '-rif');
  ok(call('annullaOperazione', { tipo: 'trasferimento', id: t.id, motivo: 'test formula' }));
});

test('reso indipendente e reso collegato a un trasferimento', () => {
  const r1 = ok(call('saveReso', { data: '2026-10-03', catalogo_id: C1, premio_id: pr1.id, pdv_id: P3.id, quantita: 2, causale: 'Premio difettoso' }));
  assert.equal(r1.trasferimento_id, '');
  assert.equal(r1.id, 'RS-000001');
  const r2 = ok(call('saveReso', { data: '2026-10-04', catalogo_id: C1, premio_id: pr1.id, pdv_id: P2.id, quantita: 1, trasferimento_id: tr1.id }));
  assert.equal(r2.trasferimento_id, tr1.id);
  ko(call('saveReso', { data: '2026-10-04', catalogo_id: C2, premio_id: pr2.id, pdv_id: P2.id, quantita: 1, trasferimento_id: tr1.id }), 'VALIDAZIONE');
  ko(call('saveReso', { data: '2026-10-04', catalogo_id: C1, premio_id: pr1.id, pdv_id: P2.id, quantita: 1, trasferimento_id: 'TR-999999' }), 'VALIDAZIONE');
  const t = ok(call('getAll')).trasferimenti.find((x) => x.id === tr1.id);
  assert.equal(t.quantita, '5', 'il reso non deve modificare il trasferimento');
});

test('modifica tracciata, controllo conflitti e snapshot storici', () => {
  const upd = ok(call('saveTrasferimento', { ...tr1, quantita: 7, atteso_modificato_il: tr1.modificato_il }));
  assert.equal(upd.quantita, '7');
  ko(call('saveTrasferimento', { ...tr1, quantita: 8, atteso_modificato_il: tr1.modificato_il }), 'CONFLITTO');
  const reg = ok(call('getRegistro', { entita_id: tr1.id }));
  assert.equal(reg[0].azione, 'modifica');
  assert.deepEqual(JSON.parse(reg[0].dettagli).quantita, ['5', '7']);
  // Rinomina del PDV: l'operazione mantiene il nome storico.
  ok(call('savePdv', { ...P1, nome: 'Negozio Uno RINOMINATO' }));
  const t = ok(call('getAll')).trasferimenti.find((x) => x.id === tr1.id);
  assert.equal(t.pdv_origine_nome, 'Negozio Uno (FITTIZIO)');
  tr1 = t;
});

test('annullamento e ripristino', () => {
  const r = ok(call('annullaOperazione', { tipo: 'trasferimento', id: tr1.id, motivo: 'errore', atteso_modificato_il: tr1.modificato_il }));
  assert.equal(r.operazione.stato, 'annullato');
  assert.ok(r.operazione.annullato_il);
  assert.equal(r.avvisi.length, 1, 'avvisa dei resi collegati');
  ko(call('annullaOperazione', { tipo: 'trasferimento', id: tr1.id }), 'VALIDAZIONE');
  ko(call('saveTrasferimento', { ...tr1, quantita: 9 }), 'VALIDAZIONE');
  const d = ok(call('getAll'));
  assert.equal(d.trasferimenti.length, 3, 'nessuna eliminazione fisica');
  const rr = ok(call('ripristinaOperazione', { tipo: 'trasferimento', id: tr1.id }));
  assert.equal(rr.operazione.stato, 'valido');
});

test('PDV o premio disattivati: non usabili per nuove operazioni', () => {
  ok(call('savePdv', { ...P3, attivo: false }));
  ko(call('saveTrasferimento', { data: '2026-10-05', catalogo_id: C1, premio_id: pr1.id, pdv_origine_id: P3.id, pdv_destinazione_id: P2.id, quantita: 1 }), 'VALIDAZIONE');
  ok(call('savePdv', { ...P3, attivo: true }));
});

test('importazione PDV con duplicati ed errori', () => {
  const righe = [
    { codice: 'PDV010', nome: 'Import A', email: 'a@esempio.it', _riga: 2 },
    { codice: 'PDV011', nome: 'Import B', email: 'sbagliata', _riga: 3 },
    { codice: 'PDV010', nome: 'Import A bis', _riga: 4 },
    { codice: 'PDV001', nome: 'Esistente aggiornato?', _riga: 5 },
    { codice: '', nome: 'Senza codice', _riga: 6 },
    { codice: 'PDV012', nome: 'Import C', citta: 'Padova', _riga: 7 },
  ];
  const res = ok(call('importPdv', { righe, modalita: 'salta' }));
  assert.equal(res.inseriti, 2);
  assert.equal(res.saltati, 1);
  assert.deepEqual(res.errori.map((e) => e.riga), [3, 4, 6]);
  const pdv = ok(call('getAll')).pdv;
  assert.equal(pdv.find((p) => p.codice === 'PDV001').nome, 'Negozio Uno RINOMINATO', 'nessuna sovrascrittura silenziosa');
  const res2 = ok(call('importPdv', { righe: [{ codice: 'PDV001', nome: 'Aggiornato da import' }], modalita: 'aggiorna' }));
  assert.equal(res2.aggiornati, 1);
  const p1 = ok(call('getAll')).pdv.find((p) => p.codice === 'PDV001');
  assert.equal(p1.nome, 'Aggiornato da import');
  assert.equal(p1.email, 'uno@esempio.it', 'i campi non presenti nel file restano invariati');
});

test('importazione premi separata per catalogo', () => {
  const res = ok(call('importPremi', { catalogo_id: C2, modalita: 'salta', righe: [
    { codice: 'B1', descrizione: 'Premio B1' }, { codice: 'A100', descrizione: 'Già esiste in 26/27' },
    { codice: '', descrizione: 'Senza codice' }, { codice: '', descrizione: 'senza codice ' }, { codice: 'B2', descrizione: '' },
  ] }));
  assert.equal(res.inseriti, 2);
  assert.equal(res.saltati, 1);
  assert.equal(res.errori.length, 2);
  const premi = ok(call('getAll')).premi;
  assert.equal(premi.filter((p) => p.catalogo_id === C1).length, 1, 'il catalogo 2025/2026 non è toccato');
  assert.equal(premi.filter((p) => p.catalogo_id === C2).length, 3);
});

test('nuovo catalogo e nuova causale', () => {
  const c = ok(call('saveCatalogo', { codice: '2027/2028', nome: 'Catalogo premi 2027/2028' }));
  assert.equal(c.id, 'CT-03');
  ko(call('saveCatalogo', { codice: '2027/2028', nome: 'x' }), 'DUPLICATO');
  ok(call('saveCausale', { tipo: 'reso', descrizione: 'Scaduto' }));
  ko(call('saveCausale', { tipo: 'reso', descrizione: 'scaduto' }), 'DUPLICATO');
});

test('persistenza dopo il riavvio', () => {
  const prima = ok(call('getAll'));
  be = createBackend({ dataFile, token: TOKEN });
  const dopo = ok(call('getAll'));
  assert.deepEqual(dopo.trasferimenti, prima.trasferimenti);
  assert.deepEqual(dopo.pdv, prima.pdv);
  assert.equal(dopo.resi.length, 2);
  const t = ok(call('saveTrasferimento', { data: '2026-10-06', catalogo_id: C1, premio_id: pr1.id, pdv_origine_id: P1.id, pdv_destinazione_id: P3.id, quantita: 1 }));
  assert.equal(t.id, 'TR-000004', 'la numerazione prosegue dopo il riavvio');
});

test('backup completo e ripristino', () => {
  const backup = ok(call('exportBackup'));
  assert.equal(backup.formato, 'gestionale-premi-backup');
  assert.ok(backup.fogli.Registro.righe.length > 0, 'il backup include il registro delle modifiche');
  const nTr = backup.fogli.Trasferimenti.righe.length;
  ok(call('saveTrasferimento', { data: '2026-10-07', catalogo_id: C1, premio_id: pr1.id, pdv_origine_id: P1.id, pdv_destinazione_id: P2.id, quantita: 99 }));
  ko(call('restoreBackup', { backup, conferma: 'si' }), 'VALIDAZIONE');
  ko(call('restoreBackup', { backup: { formato: 'altro' }, conferma: 'RIPRISTINA' }), 'VALIDAZIONE');
  const res = ok(call('restoreBackup', { backup: JSON.parse(JSON.stringify(backup)), conferma: 'RIPRISTINA' }));
  assert.ok(res.copia_sicurezza.nome.includes('backup'), 'copia di sicurezza prima del ripristino');
  const d = ok(call('getAll'));
  assert.equal(d.trasferimenti.length, nTr);
  assert.ok(!d.trasferimenti.some((t) => t.quantita === '99'));
  const t = ok(call('saveTrasferimento', { data: '2026-10-08', catalogo_id: C1, premio_id: pr1.id, pdv_origine_id: P1.id, pdv_destinazione_id: P2.id, quantita: 1 }));
  assert.equal(t.id, 'TR-000005', 'i contatori sono ripristinati insieme ai dati');
  const drive = ok(call('backupDrive'));
  assert.ok(drive.url.startsWith('https://'));
});

test('richiesta malformata', () => {
  const r = be.request('{non json');
  assert.equal(r.ok, false);
});

/* ------------------------------------------------------------------ assegnazioni dal magazzino */

test('assegnazioni: causali iniziali e magazzino di partenza', () => {
  const d = ok(call('getAll'));
  assert.ok(Array.isArray(d.assegnazioni));
  assert.equal(d.magazzino, 'Magazzino via Svezia 04');
  assert.deepEqual(d.causali.filter((c) => c.tipo === 'assegnazione').map((c) => c.descrizione), ['Prenotazione cliente', 'Altra causale']);
});

test('assegnazione valida, validazioni e numero di prenotazione facoltativo', () => {
  const a = ok(call('saveAssegnazione', { data: '2026-10-15', catalogo_id: C1, premio_id: pr1.id, pdv_id: P2.id, quantita: '2', prenotazione: ' PR-0042 ', causale: 'prenotazione cliente', riferimento: 'DDT 7' }));
  assert.match(a.id, /^AS-\d{6}$/);
  assert.equal(a.pdv_nome, P2.nome);
  assert.equal(a.prenotazione, 'PR-0042');
  assert.equal(a.causale, 'Prenotazione cliente');
  assert.equal(a.stato, 'valido');
  const senza = ok(call('saveAssegnazione', { data: '2026-10-15', catalogo_id: C1, premio_id: pr1.id, pdv_id: P2.id, quantita: '1', prenotazione: '' }));
  assert.equal(senza.prenotazione, '');
  ok(call('annullaOperazione', { tipo: 'assegnazione', id: senza.id, motivo: 'prova senza prenotazione' }));
  ko(call('saveAssegnazione', { data: '2026-10-15', catalogo_id: C1, premio_id: pr1.id, pdv_id: '', quantita: '1', prenotazione: 'X' }), 'VALIDAZIONE');
  ko(call('saveAssegnazione', { data: '2026-10-15', catalogo_id: C2, premio_id: pr1.id, pdv_id: P2.id, quantita: '1', prenotazione: 'X' }), 'VALIDAZIONE');
  ko(call('saveAssegnazione', { data: '2026-10-15', catalogo_id: C1, premio_id: pr1.id, pdv_id: P2.id, quantita: '0', prenotazione: 'X' }), 'VALIDAZIONE');
  ko(call('saveAssegnazione', { data: '2026-10-15', catalogo_id: C1, premio_id: pr1.id, pdv_id: P2.id, quantita: '1', prenotazione: 'X', causale: 'Richiesta del PDV' }), 'VALIDAZIONE');
  const d = ok(call('getAll'));
  assert.equal(d.assegnazioni.length, 2);
  assert.equal(d.trasferimenti.some((t) => t.id === a.id) || d.resi.some((r) => r.id === a.id), false, 'le assegnazioni non finiscono tra trasferimenti o resi');
});

test('assegnazione: modifica tracciata, annullamento e ripristino', () => {
  const a = ok(call('getAll')).assegnazioni[0];
  const m = ok(call('saveAssegnazione', { id: a.id, atteso_modificato_il: a.modificato_il, data: a.data, catalogo_id: C1, premio_id: pr1.id, pdv_id: P1.id, quantita: '3', prenotazione: 'PR-0043' }));
  assert.equal(m.quantita, '3');
  assert.equal(m.pdv_id, P1.id);
  ko(call('saveAssegnazione', { id: a.id, atteso_modificato_il: a.modificato_il, data: a.data, catalogo_id: C1, premio_id: pr1.id, pdv_id: P1.id, quantita: '4', prenotazione: 'PR-0043' }), 'CONFLITTO');
  const log = ok(call('getRegistro', { entita_id: a.id }));
  assert.deepEqual(log.map((r) => r.azione), ['modifica', 'crea']);
  assert.ok(JSON.parse(log[0].dettagli).prenotazione, 'la modifica della prenotazione è nel registro');
  const ann = ok(call('annullaOperazione', { tipo: 'assegnazione', id: a.id, motivo: 'prova', atteso_modificato_il: m.modificato_il }));
  assert.equal(ann.operazione.stato, 'annullato');
  ko(call('saveAssegnazione', { id: a.id, data: a.data, catalogo_id: C1, premio_id: pr1.id, pdv_id: P1.id, quantita: '1', prenotazione: 'PR-0043' }), 'VALIDAZIONE');
  const rip = ok(call('ripristinaOperazione', { tipo: 'assegnazione', id: a.id, atteso_modificato_il: ann.operazione.modificato_il }));
  assert.equal(rip.operazione.stato, 'valido');
  ko(call('annullaOperazione', { tipo: 'assegnazione', id: 'AS-999999' }), 'NON_TROVATO');
});

test('nuova causale per le assegnazioni', () => {
  const c = ok(call('saveCausale', { tipo: 'assegnazione', descrizione: 'Rifornimento PDV' }));
  assert.equal(c.tipo, 'assegnazione');
  ko(call('saveCausale', { tipo: 'assegnazione', descrizione: 'rifornimento pdv' }), 'DUPLICATO');
  ok(call('saveAssegnazione', { data: '2026-10-16', catalogo_id: C1, premio_id: pr1.id, pdv_id: P2.id, quantita: '1', prenotazione: 'PR-0050', causale: 'Rifornimento PDV' }));
});

test('backup e ripristino includono le assegnazioni; vecchi backup senza assegnazioni restano validi', () => {
  const backup = ok(call('exportBackup'));
  assert.equal(backup.fogli.Assegnazioni.righe.length, 3);
  const res = ok(call('restoreBackup', { backup: JSON.parse(JSON.stringify(backup)), conferma: 'RIPRISTINA' }));
  assert.equal(res.conteggi.Assegnazioni, 3);
  const vecchio = JSON.parse(JSON.stringify(backup));
  delete vecchio.fogli.Assegnazioni;
  const r2 = ok(call('restoreBackup', { backup: vecchio, conferma: 'RIPRISTINA' }));
  assert.equal(r2.conteggi.Assegnazioni, 0);
  assert.equal(ok(call('getAll')).assegnazioni.length, 0);
});

test('database già in uso senza assegnazioni: la tabella si crea da sola, i dati restano intatti', () => {
  const dir2 = fs.mkdtempSync(path.join(os.tmpdir(), 'gestionale-migrazione-'));
  const file2 = path.join(dir2, 'db.json');
  const be2 = createBackend({ dataFile: file2, token: TOKEN });
  be2.setup();
  const c2 = (action, payload = {}) => be2.request({ token: TOKEN, action, payload, operatore: 'Test' });
  const d0 = ok(c2('getAll'));
  const pv = ok(c2('savePdv', { codice: 'V1', nome: 'Vecchio PDV' }));
  const pr = ok(c2('savePremio', { catalogo_id: d0.cataloghi[0].id, codice: 'Z1', descrizione: 'Premio vecchio' }));
  const pv2 = ok(c2('savePdv', { codice: 'V2', nome: 'Altro PDV' }));
  ok(c2('saveTrasferimento', { data: '2026-10-01', catalogo_id: d0.cataloghi[0].id, premio_id: pr.id, pdv_origine_id: pv.id, pdv_destinazione_id: pv2.id, quantita: 5 }));
  // Simula il database della versione precedente: niente foglio Assegnazioni e niente causali di quel tipo.
  const st = JSON.parse(fs.readFileSync(file2, 'utf8'));
  st.spreadsheet.order = st.spreadsheet.order.filter((n) => n !== 'Assegnazioni');
  delete st.spreadsheet.sheets.Assegnazioni;
  const cau = st.spreadsheet.sheets.Causali.cells;
  const iTipo = cau[0].indexOf('tipo');
  st.spreadsheet.sheets.Causali.cells = cau.filter((r, i) => i === 0 || r[iTipo] !== 'assegnazione');
  fs.writeFileSync(file2, JSON.stringify(st));

  const be3 = createBackend({ dataFile: file2, token: TOKEN });
  const c3 = (action, payload = {}) => be3.request({ token: TOKEN, action, payload, operatore: 'Test' });
  const d = ok(c3('getAll'));
  assert.deepEqual(d.assegnazioni, []);
  assert.equal(d.trasferimenti.length, 1, 'i trasferimenti esistenti restano');
  assert.equal(d.causali.filter((c) => c.tipo === 'assegnazione').length, 2, 'causali delle assegnazioni aggiunte');
  assert.equal(d.causali.filter((c) => c.tipo === 'reso').length, 5, 'le altre causali non vengono duplicate');
  const a = ok(c3('saveAssegnazione', { data: '2026-10-15', catalogo_id: d0.cataloghi[0].id, premio_id: pr.id, pdv_id: pv.id, quantita: 1, prenotazione: '123' }));
  assert.equal(a.id, 'AS-000001');
  ok(c3('getAll'));
  assert.equal(ok(c3('getAll')).causali.filter((c) => c.tipo === 'assegnazione').length, 2, 'la migrazione avviene una volta sola');
});

test('prenotazioni Jasper: riepiloghi salvati e letti, tabella creata da sola', () => {
  const vuoto = ok(call('getJasper'));
  assert.deepEqual(vuoto.riepiloghi, []);
  assert.equal(vuoto.promemoria, '');
  const r = ok(call('saveRiepilogoJasper', { file: 'export.csv', data_report: '2026-10-13', righe: 10, pezzi: 9, contributo: 12.5, dati: JSON.stringify({ premi: [['0406415', 'PADELLA', 3]], pdv: [['001', 9]], stati: {} }) }));
  assert.equal(r.id, 'RJ-000001');
  ok(call('saveRiepilogoJasper', { file: 'export2.csv', righe: 11, pezzi: 10, contributo: 0, dati: '{}' }));
  const d = ok(call('getJasper'));
  assert.deepEqual(d.riepiloghi.map((x) => x.file), ['export2.csv', 'export.csv'], 'dal più recente');
  assert.equal(JSON.parse(d.riepiloghi[1].dati).premi[0][1], 'PADELLA');
  ko(call('saveRiepilogoJasper', { file: 'grande.csv', dati: 'x'.repeat(46000) }), 'VALIDAZIONE');
});
