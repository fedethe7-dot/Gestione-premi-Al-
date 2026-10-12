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
