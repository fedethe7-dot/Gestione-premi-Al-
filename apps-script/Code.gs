/**
 * GESTIONALE TRASFERIMENTI E RESI PREMI — Backend Google Apps Script
 *
 * Questo script va incollato nell'editor Apps Script di un Foglio Google
 * (Estensioni > Apps Script). Il Foglio Google è il database.
 *
 * Prima installazione: eseguire la funzione `setup` dall'editor.
 * Poi: Distribuisci > Nuova distribuzione > App web
 *      (Esegui come: Me — Chi ha accesso: Chiunque).
 *
 * Sicurezza: ogni richiesta deve contenere il token API salvato nelle
 * Proprietà dello script (generato da `setup`, mai scritto nel codice).
 */

var SCHEMA_VERSION = 1;
var APP_NAME = 'Gestionale premi';
var BACKUP_FOLDER = 'Backup Gestionale Premi';

/** Struttura delle tabelle (un foglio per entità). */
var SHEETS = {
  Meta: ['chiave', 'valore'],
  Cataloghi: ['id', 'codice', 'nome', 'data_inizio', 'data_fine', 'attivo', 'ordine', 'creato_il', 'modificato_il'],
  Premi: ['id', 'catalogo_id', 'codice', 'descrizione', 'categoria', 'note', 'attivo', 'creato_il', 'modificato_il'],
  PDV: ['id', 'codice', 'nome', 'indirizzo', 'citta', 'email', 'email2', 'note', 'attivo', 'creato_il', 'modificato_il'],
  Causali: ['id', 'tipo', 'descrizione', 'attivo', 'ordine', 'creato_il', 'modificato_il'],
  Trasferimenti: ['id', 'data', 'catalogo_id', 'premio_id', 'premio_codice', 'premio_descrizione',
    'pdv_origine_id', 'pdv_origine_codice', 'pdv_origine_nome',
    'pdv_destinazione_id', 'pdv_destinazione_codice', 'pdv_destinazione_nome',
    'quantita', 'causale', 'riferimento', 'note', 'stato',
    'creato_il', 'creato_da', 'modificato_il', 'modificato_da', 'annullato_il', 'motivo_annullamento'],
  Resi: ['id', 'data', 'catalogo_id', 'premio_id', 'premio_codice', 'premio_descrizione',
    'pdv_id', 'pdv_codice', 'pdv_nome', 'quantita', 'causale', 'trasferimento_id', 'riferimento', 'note', 'stato',
    'creato_il', 'creato_da', 'modificato_il', 'modificato_da', 'annullato_il', 'motivo_annullamento'],
  Registro: ['id', 'timestamp', 'entita', 'entita_id', 'azione', 'operatore', 'dettagli'],
  // Predisposizione per la fase 2 (invio e-mail ai PDV): tabelle vuote, nessun invio in questa versione.
  ModelliEmail: ['id', 'nome', 'oggetto', 'corpo', 'attivo', 'creato_il', 'modificato_il'],
  InviiEmail: ['id', 'creato_il', 'pdv_id', 'destinatario', 'oggetto', 'modello_id', 'chiave_univoca', 'esito', 'errore', 'inviato_il']
};

var ID_PREFIX = {
  Cataloghi: 'CT', Premi: 'PR', PDV: 'PV', Causali: 'CA', Trasferimenti: 'TR', Resi: 'RS',
  Registro: 'LG', ModelliEmail: 'ME', InviiEmail: 'IE'
};

var SEED_CATALOGHI = [
  { codice: '2025/2026', nome: 'Catalogo premi 2025/2026', ordine: '1' },
  { codice: '2026/2027', nome: 'Catalogo premi 2026/2027', ordine: '2' }
];
var SEED_CAUSALI = [
  { tipo: 'reso', descrizione: 'Premio difettoso' },
  { tipo: 'reso', descrizione: 'Premio errato' },
  { tipo: 'reso', descrizione: 'Eccedenza' },
  { tipo: 'reso', descrizione: 'Reso richiesto dal PDV' },
  { tipo: 'reso', descrizione: 'Altra causale' },
  { tipo: 'trasferimento', descrizione: 'Richiesta del PDV' },
  { tipo: 'trasferimento', descrizione: 'Altra causale' }
];

var MAX_QTA = 1000000;

/* ======================================================================
 * Ingresso HTTP
 * ==================================================================== */

function doGet() {
  return json_({ ok: true, data: { servizio: APP_NAME, schema: SCHEMA_VERSION, messaggio: 'Servizio attivo. Usa l\'applicazione per accedere ai dati.' } });
}

function doPost(e) {
  var raw = e && e.postData ? e.postData.contents : '';
  return json_(handleRequest_(raw));
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function AppError(code, message, details) {
  this.code = code;
  this.message = message;
  this.details = details || null;
}

function fail_(code, message, details) {
  throw new AppError(code, message, details);
}

var ACTIONS = {
  ping: { write: false, fn: function () { return { schema: SCHEMA_VERSION, ora: nowIso_() }; } },
  getAll: { write: false, fn: getAll_ },
  getRegistro: { write: false, fn: getRegistro_ },
  savePdv: { write: true, fn: savePdv_ },
  savePremio: { write: true, fn: savePremio_ },
  saveCatalogo: { write: true, fn: saveCatalogo_ },
  saveCausale: { write: true, fn: saveCausale_ },
  saveTrasferimento: { write: true, fn: saveTrasferimento_ },
  saveReso: { write: true, fn: saveReso_ },
  annullaOperazione: { write: true, fn: annullaOperazione_ },
  ripristinaOperazione: { write: true, fn: ripristinaOperazione_ },
  importPdv: { write: true, fn: importPdv_ },
  importPremi: { write: true, fn: importPremi_ },
  backupDrive: { write: true, fn: function () { return backupDrive_(); } },
  exportBackup: { write: false, fn: exportBackup_ },
  restoreBackup: { write: true, fn: restoreBackup_ }
};

function handleRequest_(raw) {
  var lock = null;
  try {
    var req;
    try { req = JSON.parse(raw || '{}'); } catch (e) { fail_('RICHIESTA', 'Richiesta non valida (JSON).'); }
    var token = PropertiesService.getScriptProperties().getProperty('API_TOKEN');
    if (!token) fail_('CONFIG', 'Token API non configurato: esegui la funzione "setup" nell\'editor Apps Script.');
    if (!req.token || String(req.token) !== token) fail_('AUTH', 'Token API non valido. Controlla le Impostazioni dell\'applicazione.');
    var action = ACTIONS[req.action];
    if (!action) fail_('RICHIESTA', 'Azione sconosciuta: ' + req.action);
    var ctx = { operatore: str_(req.operatore, 60) || 'non indicato', cache: {} };
    checkSchema_();
    if (action.write) {
      lock = LockService.getScriptLock();
      if (!lock.tryLock(25000)) fail_('OCCUPATO', 'Il database è occupato da un\'altra operazione. Riprova tra qualche secondo.');
    }
    var data = action.fn(req.payload || {}, ctx);
    if (action.write) SpreadsheetApp.flush();
    return { ok: true, data: data };
  } catch (err) {
    if (err instanceof AppError) return { ok: false, error: { code: err.code, message: err.message, details: err.details } };
    return { ok: false, error: { code: 'INTERNO', message: 'Errore interno del server: ' + (err && err.message ? err.message : String(err)) } };
  } finally {
    if (lock) { try { lock.releaseLock(); } catch (e) { /* ignorato */ } }
  }
}

/* ======================================================================
 * Installazione e menu
 * ==================================================================== */

/** Da eseguire una volta dall'editor. Crea i fogli, i dati iniziali e il token API. */
function setup() {
  var ss = ss_();
  Object.keys(SHEETS).forEach(function (name) { ensureSheet_(ss, name); });
  var meta = metaMap_();
  if (!meta.schema_version) setMeta_('schema_version', String(SCHEMA_VERSION));
  if (readAll_('Cataloghi').length === 0) {
    var now = nowIso_();
    var ids = nextIds_('Cataloghi', SEED_CATALOGHI.length);
    appendRows_('Cataloghi', SEED_CATALOGHI.map(function (c, i) {
      return { id: ids[i], codice: c.codice, nome: c.nome, data_inizio: '', data_fine: '', attivo: 'SI', ordine: c.ordine, creato_il: now, modificato_il: now };
    }));
  }
  if (readAll_('Causali').length === 0) {
    var now2 = nowIso_();
    var cids = nextIds_('Causali', SEED_CAUSALI.length);
    appendRows_('Causali', SEED_CAUSALI.map(function (c, i) {
      return { id: cids[i], tipo: c.tipo, descrizione: c.descrizione, attivo: 'SI', ordine: String(i + 1), creato_il: now2, modificato_il: now2 };
    }));
  }
  var props = PropertiesService.getScriptProperties();
  var token = props.getProperty('API_TOKEN');
  if (!token) {
    token = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '').slice(0, 8);
    props.setProperty('API_TOKEN', token);
  }
  var sh = ss.getSheetByName('Foglio1') || ss.getSheetByName('Sheet1');
  if (sh && ss.getSheets().length > 1 && sh.getLastRow() === 0) ss.deleteSheet(sh);
  Logger.log('Setup completato. Token API (da copiare nelle Impostazioni dell\'app): ' + token);
  return token;
}

/** Genera un nuovo token: quello vecchio smette di funzionare. */
function rigeneraToken() {
  var token = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '').slice(0, 8);
  PropertiesService.getScriptProperties().setProperty('API_TOKEN', token);
  Logger.log('Nuovo token API: ' + token);
  return token;
}

/** Facoltativo: copia di sicurezza automatica ogni notte su Google Drive. */
function installaBackupGiornaliero() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'backupAutomatico') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('backupAutomatico').timeBased().everyDays(1).atHour(2).create();
  Logger.log('Backup giornaliero installato (ogni notte tra le 2 e le 3).');
}

function backupAutomatico() {
  var lock = LockService.getScriptLock();
  lock.waitLock(60000);
  try { backupDrive_(); } finally { lock.releaseLock(); }
}

function onOpen() {
  try {
    SpreadsheetApp.getUi().createMenu(APP_NAME)
      .addItem('Mostra token API', 'mostraToken')
      .addItem('Crea copia di sicurezza ora', 'backupAutomatico')
      .addToUi();
  } catch (e) { /* contesto senza interfaccia */ }
}

function mostraToken() {
  var token = PropertiesService.getScriptProperties().getProperty('API_TOKEN') || '(non ancora generato: esegui setup)';
  SpreadsheetApp.getUi().alert('Token API', token, SpreadsheetApp.getUi().ButtonSet.OK);
}

/* ======================================================================
 * Accesso ai fogli
 * ==================================================================== */

function ss_() { return SpreadsheetApp.getActiveSpreadsheet(); }

function ensureSheet_(ss, name) {
  var cols = SHEETS[name];
  var sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  if (sh.getMaxColumns() < cols.length) sh.insertColumnsAfter(sh.getMaxColumns(), cols.length - sh.getMaxColumns());
  var lastCol = Math.max(sh.getLastColumn(), 1);
  var header = sh.getRange(1, 1, 1, lastCol).getDisplayValues()[0].filter(function (h) { return h !== ''; });
  if (header.length === 0) {
    sh.getRange(1, 1, 1, cols.length).setValues([cols]);
  } else {
    // Migrazione: aggiunge in coda le colonne nuove senza toccare quelle esistenti.
    var missing = cols.filter(function (c) { return header.indexOf(c) < 0; });
    if (missing.length) {
      var start = header.length + 1;
      if (sh.getMaxColumns() < header.length + missing.length) sh.insertColumnsAfter(sh.getMaxColumns(), header.length + missing.length - sh.getMaxColumns());
      sh.getRange(1, start, 1, missing.length).setValues([missing]);
    }
  }
  // Tutto in formato testo: evita che Fogli converta date, codici con zeri iniziali, ecc.
  sh.getRange(1, 1, sh.getMaxRows(), sh.getMaxColumns()).setNumberFormat('@');
  sh.setFrozenRows(1);
  sh.getRange(1, 1, 1, sh.getLastColumn()).setFontWeight('bold');
  return sh;
}

function checkSchema_() {
  var ss = ss_();
  var missing = Object.keys(SHEETS).filter(function (n) { return !ss.getSheetByName(n); });
  if (missing.length) fail_('CONFIG', 'Database non inizializzato (fogli mancanti: ' + missing.join(', ') + '). Esegui la funzione "setup".');
}

function sheet_(name) {
  var sh = ss_().getSheetByName(name);
  if (!sh) fail_('CONFIG', 'Foglio mancante: ' + name + '. Esegui la funzione "setup".');
  return sh;
}

function headers_(sh) {
  var lastCol = sh.getLastColumn();
  return sh.getRange(1, 1, 1, lastCol).getDisplayValues()[0];
}

/** Legge tutte le righe di un foglio come oggetti (valori sempre stringa). */
function readAll_(name) {
  var sh = sheet_(name);
  var hdr = headers_(sh);
  var lr = sh.getLastRow();
  if (lr < 2) return [];
  var vals = sh.getRange(2, 1, lr - 1, hdr.length).getDisplayValues();
  var out = [];
  for (var r = 0; r < vals.length; r++) {
    if (vals[r][0] === '') continue;
    var o = { _row: r + 2 };
    for (var c = 0; c < hdr.length; c++) if (hdr[c]) o[hdr[c]] = vals[r][c];
    out.push(o);
  }
  return out;
}

function cached_(ctx, name) {
  if (!ctx.cache[name]) ctx.cache[name] = readAll_(name);
  return ctx.cache[name];
}

function cell_(v) {
  if (v === null || v === undefined) return '';
  var s = String(v);
  // Impedisce che un testo venga interpretato come formula dal Foglio.
  if (/^[=+@]/.test(s) || (/^-/.test(s) && !/^-\d+([.,]\d+)?$/.test(s))) s = "'" + s;
  return s;
}

function ensureCapacity_(sh, lastNeededRow) {
  var max = sh.getMaxRows();
  if (lastNeededRow > max) {
    var add = lastNeededRow - max + 500;
    sh.insertRowsAfter(max, add);
    sh.getRange(max + 1, 1, add, sh.getMaxColumns()).setNumberFormat('@');
  }
}

function appendRows_(name, objs) {
  if (!objs.length) return;
  var sh = sheet_(name);
  var hdr = headers_(sh);
  var start = sh.getLastRow() + 1;
  ensureCapacity_(sh, start + objs.length - 1);
  var rows = objs.map(function (o) { return hdr.map(function (h) { return cell_(o[h]); }); });
  var rng = sh.getRange(start, 1, rows.length, hdr.length);
  rng.setNumberFormat('@');
  rng.setValues(rows);
}

function updateRow_(name, rowIndex, obj) {
  var sh = sheet_(name);
  var hdr = headers_(sh);
  sh.getRange(rowIndex, 1, 1, hdr.length).setValues([hdr.map(function (h) { return cell_(obj[h]); })]);
}

function metaMap_() {
  var m = {};
  readAll_('Meta').forEach(function (r) { m[r.chiave] = { valore: r.valore, row: r._row }; });
  return m;
}

function setMeta_(key, value) {
  var m = metaMap_();
  if (m[key]) updateRow_('Meta', m[key].row, { chiave: key, valore: value });
  else appendRows_('Meta', [{ chiave: key, valore: value }]);
}

/** Genera identificativi progressivi stabili (es. TR-000012). Va chiamata sotto lock. */
function nextIds_(table, n) {
  var key = 'contatore_' + table;
  var m = metaMap_();
  var cur = m[key] ? parseInt(m[key].valore, 10) || 0 : 0;
  var ids = [];
  var width = table === 'Cataloghi' ? 2 : 6;
  for (var i = 1; i <= n; i++) ids.push(ID_PREFIX[table] + '-' + pad_(cur + i, width));
  setMeta_(key, String(cur + n));
  return ids;
}

function pad_(n, w) { var s = String(n); while (s.length < w) s = '0' + s; return s; }

function nowIso_() { return new Date().toISOString(); }

function strip_(o) {
  var c = {};
  Object.keys(o).forEach(function (k) { if (k !== '_row') c[k] = o[k]; });
  return c;
}

function log_(ctx, entita, entitaId, azione, dettagli) {
  var id = nextIds_('Registro', 1)[0];
  appendRows_('Registro', [{ id: id, timestamp: nowIso_(), entita: entita, entita_id: entitaId, azione: azione, operatore: ctx.operatore, dettagli: dettagli ? JSON.stringify(dettagli) : '' }]);
}

function diff_(before, after, fields) {
  var d = {};
  fields.forEach(function (f) {
    if (String(before[f] || '') !== String(after[f] || '')) d[f] = [before[f] || '', after[f] || ''];
  });
  return d;
}

/* ======================================================================
 * Validazione
 * ==================================================================== */

function str_(v, max) {
  if (v === null || v === undefined) return '';
  var s = String(v).replace(/\r\n/g, '\n').trim();
  if (max && s.length > max) s = s.slice(0, max);
  return s;
}

function bool_(v, dflt) {
  if (v === undefined || v === null || v === '') return dflt;
  if (v === true || v === false) return v;
  var s = String(v).trim().toLowerCase();
  if (['si', 'sì', 's', 'true', '1', 'x', 'attivo', 'yes', 'y'].indexOf(s) >= 0) return true;
  if (['no', 'n', 'false', '0', 'non attivo', 'inattivo', 'disattivo'].indexOf(s) >= 0) return false;
  return dflt;
}

function siNo_(b) { return b ? 'SI' : 'NO'; }

function isDate_(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  var p = s.split('-').map(Number);
  var d = new Date(Date.UTC(p[0], p[1] - 1, p[2]));
  return d.getUTCFullYear() === p[0] && d.getUTCMonth() === p[1] - 1 && d.getUTCDate() === p[2] && p[0] >= 2000 && p[0] <= 2100;
}

function isEmail_(s) { return /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]{2,}$/.test(s); }

function qta_(v) {
  var s = String(v === undefined || v === null ? '' : v).trim();
  if (!/^\d+$/.test(s)) return null;
  var n = parseInt(s, 10);
  if (n < 1 || n > MAX_QTA) return null;
  return n;
}

function norm_(s) { return String(s || '').trim().toLowerCase().replace(/\s+/g, ' '); }

function check_(errors) {
  var list = Object.keys(errors);
  if (list.length) fail_('VALIDAZIONE', list.map(function (k) { return errors[k]; }).join(' '), { campi: errors });
}

function findById_(rows, id) {
  for (var i = 0; i < rows.length; i++) if (rows[i].id === id) return rows[i];
  return null;
}

function checkVersion_(existing, atteso) {
  if (atteso !== undefined && atteso !== null && atteso !== '' && existing.modificato_il !== atteso) {
    fail_('CONFLITTO', 'Questo dato è stato modificato da un\'altra persona nel frattempo. Ricarica i dati e riprova.');
  }
}

/* ======================================================================
 * Lettura
 * ==================================================================== */

function getAll_() {
  var out = {};
  ['Cataloghi', 'Premi', 'PDV', 'Causali', 'Trasferimenti', 'Resi'].forEach(function (n) {
    out[n] = readAll_(n).map(strip_);
  });
  return {
    cataloghi: out.Cataloghi, premi: out.Premi, pdv: out.PDV, causali: out.Causali,
    trasferimenti: out.Trasferimenti, resi: out.Resi,
    schema: SCHEMA_VERSION, nome_database: ss_().getName(), ora: nowIso_()
  };
}

function getRegistro_(p) {
  var id = str_(p.entita_id, 40);
  var rows = readAll_('Registro').map(strip_);
  if (id) rows = rows.filter(function (r) { return r.entita_id === id; });
  var limit = Math.min(parseInt(p.limite, 10) || 200, 2000);
  return rows.slice(-limit).reverse();
}

/* ======================================================================
 * Punti vendita
 * ==================================================================== */

var PDV_FIELDS = ['codice', 'nome', 'indirizzo', 'citta', 'email', 'email2', 'note', 'attivo'];

function cleanPdv_(p) {
  return {
    codice: str_(p.codice, 40), nome: str_(p.nome, 150), indirizzo: str_(p.indirizzo, 200), citta: str_(p.citta, 100),
    email: str_(p.email, 150).toLowerCase(), email2: str_(p.email2, 150).toLowerCase(), note: str_(p.note, 1000),
    attivo: siNo_(bool_(p.attivo, true))
  };
}

function validatePdv_(v) {
  var e = {};
  if (!v.codice) e.codice = 'Il codice PDV è obbligatorio.';
  if (!v.nome) e.nome = 'Il nome del punto vendita è obbligatorio.';
  if (v.email && !isEmail_(v.email)) e.email = 'E-mail principale non valida (' + v.email + ').';
  if (v.email2 && !isEmail_(v.email2)) e.email2 = 'E-mail secondaria non valida (' + v.email2 + ').';
  return e;
}

function savePdv_(p, ctx) {
  var v = cleanPdv_(p);
  var errors = validatePdv_(v);
  check_(errors);
  var rows = cached_(ctx, 'PDV');
  var now = nowIso_();
  var dup = rows.filter(function (r) { return norm_(r.codice) === norm_(v.codice) && r.id !== p.id; })[0];
  if (dup) fail_('DUPLICATO', 'Esiste già un punto vendita con codice "' + v.codice + '" (' + dup.nome + ').');
  if (p.id) {
    var ex = findById_(rows, p.id);
    if (!ex) fail_('NON_TROVATO', 'Punto vendita non trovato.');
    checkVersion_(ex, p.atteso_modificato_il);
    var upd = strip_(ex);
    PDV_FIELDS.forEach(function (f) { upd[f] = v[f]; });
    upd.modificato_il = now;
    updateRow_('PDV', ex._row, upd);
    log_(ctx, 'PDV', ex.id, 'modifica', diff_(ex, upd, PDV_FIELDS));
    return upd;
  }
  var obj = { id: nextIds_('PDV', 1)[0] };
  PDV_FIELDS.forEach(function (f) { obj[f] = v[f]; });
  obj.creato_il = now; obj.modificato_il = now;
  appendRows_('PDV', [obj]);
  log_(ctx, 'PDV', obj.id, 'crea', null);
  return obj;
}

function importPdv_(p, ctx) {
  var rows = Array.isArray(p.righe) ? p.righe : [];
  var modalita = p.modalita === 'aggiorna' ? 'aggiorna' : 'salta';
  if (!rows.length) fail_('VALIDAZIONE', 'Il file non contiene righe da importare.');
  if (rows.length > 20000) fail_('VALIDAZIONE', 'Troppe righe in un solo file (massimo 20.000).');
  var existing = cached_(ctx, 'PDV');
  var byCode = {};
  existing.forEach(function (r) { byCode[norm_(r.codice)] = r; });
  var seen = {}, toInsert = [], toUpdate = [], errori = [], saltati = 0;
  rows.forEach(function (raw, i) {
    var riga = raw._riga || (i + 2);
    var v = cleanPdv_(raw);
    if (raw.attivo === undefined || raw.attivo === '') v.attivo = 'SI';
    var e = validatePdv_(v);
    if (Object.keys(e).length) { errori.push({ riga: riga, motivo: Object.keys(e).map(function (k) { return e[k]; }).join(' ') }); return; }
    var k = norm_(v.codice);
    if (seen[k]) { errori.push({ riga: riga, motivo: 'Codice "' + v.codice + '" ripetuto nel file (già alla riga ' + seen[k] + ').' }); return; }
    seen[k] = riga;
    var ex = byCode[k];
    if (ex) {
      if (modalita === 'aggiorna') toUpdate.push({ ex: ex, v: v, raw: raw }); else saltati++;
      return;
    }
    toInsert.push(v);
  });
  var now = nowIso_();
  if (toInsert.length) {
    var ids = nextIds_('PDV', toInsert.length);
    appendRows_('PDV', toInsert.map(function (v, i) {
      var o = { id: ids[i] }; PDV_FIELDS.forEach(function (f) { o[f] = v[f]; }); o.creato_il = now; o.modificato_il = now; return o;
    }));
  }
  toUpdate.forEach(function (u) {
    var upd = strip_(u.ex);
    // Aggiorna solo i campi presenti nel file: i campi non mappati restano invariati.
    PDV_FIELDS.forEach(function (f) { if (u.raw[f] !== undefined && f !== 'codice') upd[f] = u.v[f]; });
    upd.modificato_il = now;
    updateRow_('PDV', u.ex._row, upd);
  });
  log_(ctx, 'PDV', '', 'importa', { inseriti: toInsert.length, aggiornati: toUpdate.length, saltati: saltati, errori: errori.length });
  return { inseriti: toInsert.length, aggiornati: toUpdate.length, saltati: saltati, errori: errori };
}

/* ======================================================================
 * Cataloghi e premi
 * ==================================================================== */

function saveCatalogo_(p, ctx) {
  var v = { codice: str_(p.codice, 20), nome: str_(p.nome, 100), data_inizio: str_(p.data_inizio, 10), data_fine: str_(p.data_fine, 10), attivo: siNo_(bool_(p.attivo, true)), ordine: str_(p.ordine, 5) };
  var e = {};
  if (!v.codice) e.codice = 'Il codice stagione è obbligatorio (es. 2027/2028).';
  if (!v.nome) e.nome = 'Il nome del catalogo è obbligatorio.';
  if (v.data_inizio && !isDate_(v.data_inizio)) e.data_inizio = 'Data di inizio non valida.';
  if (v.data_fine && !isDate_(v.data_fine)) e.data_fine = 'Data di fine non valida.';
  if (v.data_inizio && v.data_fine && v.data_fine < v.data_inizio) e.data_fine = 'La data di fine è precedente a quella di inizio.';
  check_(e);
  var rows = cached_(ctx, 'Cataloghi');
  if (rows.some(function (r) { return norm_(r.codice) === norm_(v.codice) && r.id !== p.id; })) fail_('DUPLICATO', 'Esiste già un catalogo "' + v.codice + '".');
  var now = nowIso_();
  var F = ['codice', 'nome', 'data_inizio', 'data_fine', 'attivo', 'ordine'];
  if (p.id) {
    var ex = findById_(rows, p.id);
    if (!ex) fail_('NON_TROVATO', 'Catalogo non trovato.');
    var upd = strip_(ex);
    F.forEach(function (f) { upd[f] = v[f] || (f === 'ordine' ? ex.ordine : v[f]); });
    upd.modificato_il = now;
    updateRow_('Cataloghi', ex._row, upd);
    log_(ctx, 'Catalogo', ex.id, 'modifica', diff_(ex, upd, F));
    return upd;
  }
  var obj = { id: nextIds_('Cataloghi', 1)[0] };
  F.forEach(function (f) { obj[f] = v[f]; });
  if (!obj.ordine) obj.ordine = String(rows.length + 1);
  obj.creato_il = now; obj.modificato_il = now;
  appendRows_('Cataloghi', [obj]);
  log_(ctx, 'Catalogo', obj.id, 'crea', null);
  return obj;
}

var PREMIO_FIELDS = ['codice', 'descrizione', 'categoria', 'note', 'attivo'];

function cleanPremio_(p) {
  return { codice: str_(p.codice, 40), descrizione: str_(p.descrizione, 200), categoria: str_(p.categoria, 80), note: str_(p.note, 1000), attivo: siNo_(bool_(p.attivo, true)) };
}

function premioKey_(v) { return v.codice ? 'c:' + norm_(v.codice) : 'd:' + norm_(v.descrizione); }

function savePremio_(p, ctx) {
  var catalogoId = str_(p.catalogo_id, 20);
  var cat = findById_(cached_(ctx, 'Cataloghi'), catalogoId);
  if (!cat) fail_('VALIDAZIONE', 'Seleziona un catalogo valido.');
  var v = cleanPremio_(p);
  if (!v.descrizione) fail_('VALIDAZIONE', 'La descrizione del premio è obbligatoria.', { campi: { descrizione: 'Obbligatoria.' } });
  var rows = cached_(ctx, 'Premi');
  var key = premioKey_(v);
  var dup = rows.filter(function (r) { return r.catalogo_id === catalogoId && r.id !== p.id && premioKey_(r) === key; })[0];
  if (dup) fail_('DUPLICATO', v.codice
    ? 'Nel catalogo ' + cat.codice + ' esiste già un premio con codice "' + v.codice + '" (' + dup.descrizione + ').'
    : 'Nel catalogo ' + cat.codice + ' esiste già un premio senza codice con descrizione "' + v.descrizione + '".');
  var now = nowIso_();
  if (p.id) {
    var ex = findById_(rows, p.id);
    if (!ex) fail_('NON_TROVATO', 'Premio non trovato.');
    if (ex.catalogo_id !== catalogoId) fail_('VALIDAZIONE', 'Non è possibile spostare un premio in un altro catalogo: crealo nel catalogo corretto.');
    checkVersion_(ex, p.atteso_modificato_il);
    var upd = strip_(ex);
    PREMIO_FIELDS.forEach(function (f) { upd[f] = v[f]; });
    upd.modificato_il = now;
    updateRow_('Premi', ex._row, upd);
    log_(ctx, 'Premio', ex.id, 'modifica', diff_(ex, upd, PREMIO_FIELDS));
    return upd;
  }
  var obj = { id: nextIds_('Premi', 1)[0], catalogo_id: catalogoId };
  PREMIO_FIELDS.forEach(function (f) { obj[f] = v[f]; });
  obj.creato_il = now; obj.modificato_il = now;
  appendRows_('Premi', [obj]);
  log_(ctx, 'Premio', obj.id, 'crea', null);
  return obj;
}

function importPremi_(p, ctx) {
  var catalogoId = str_(p.catalogo_id, 20);
  var cat = findById_(cached_(ctx, 'Cataloghi'), catalogoId);
  if (!cat) fail_('VALIDAZIONE', 'Seleziona il catalogo in cui importare i premi.');
  var rows = Array.isArray(p.righe) ? p.righe : [];
  var modalita = p.modalita === 'aggiorna' ? 'aggiorna' : 'salta';
  if (!rows.length) fail_('VALIDAZIONE', 'Il file non contiene righe da importare.');
  if (rows.length > 20000) fail_('VALIDAZIONE', 'Troppe righe in un solo file (massimo 20.000).');
  var byKey = {};
  cached_(ctx, 'Premi').forEach(function (r) { if (r.catalogo_id === catalogoId) byKey[premioKey_(r)] = r; });
  var seen = {}, toInsert = [], toUpdate = [], errori = [], saltati = 0;
  rows.forEach(function (raw, i) {
    var riga = raw._riga || (i + 2);
    var v = cleanPremio_(raw);
    if (!v.descrizione) { errori.push({ riga: riga, motivo: 'Descrizione mancante.' }); return; }
    var k = premioKey_(v);
    if (seen[k]) { errori.push({ riga: riga, motivo: (v.codice ? 'Codice "' + v.codice + '"' : 'Descrizione "' + v.descrizione + '"') + ' ripetuto nel file (già alla riga ' + seen[k] + ').' }); return; }
    seen[k] = riga;
    var ex = byKey[k];
    if (ex) { if (modalita === 'aggiorna') toUpdate.push({ ex: ex, v: v, raw: raw }); else saltati++; return; }
    toInsert.push(v);
  });
  var now = nowIso_();
  if (toInsert.length) {
    var ids = nextIds_('Premi', toInsert.length);
    appendRows_('Premi', toInsert.map(function (v, i) {
      var o = { id: ids[i], catalogo_id: catalogoId }; PREMIO_FIELDS.forEach(function (f) { o[f] = v[f]; }); o.creato_il = now; o.modificato_il = now; return o;
    }));
  }
  toUpdate.forEach(function (u) {
    var upd = strip_(u.ex);
    PREMIO_FIELDS.forEach(function (f) { if (u.raw[f] !== undefined && f !== 'codice') upd[f] = u.v[f]; });
    upd.modificato_il = now;
    updateRow_('Premi', u.ex._row, upd);
  });
  log_(ctx, 'Premio', '', 'importa', { catalogo: cat.codice, inseriti: toInsert.length, aggiornati: toUpdate.length, saltati: saltati, errori: errori.length });
  return { inseriti: toInsert.length, aggiornati: toUpdate.length, saltati: saltati, errori: errori };
}

/* ======================================================================
 * Causali
 * ==================================================================== */

function saveCausale_(p, ctx) {
  var v = { tipo: p.tipo === 'trasferimento' ? 'trasferimento' : (p.tipo === 'reso' ? 'reso' : ''), descrizione: str_(p.descrizione, 100), attivo: siNo_(bool_(p.attivo, true)), ordine: str_(p.ordine, 5) };
  if (!v.tipo) fail_('VALIDAZIONE', 'Tipo causale non valido.');
  if (!v.descrizione) fail_('VALIDAZIONE', 'La descrizione della causale è obbligatoria.');
  var rows = cached_(ctx, 'Causali');
  if (rows.some(function (r) { return r.tipo === v.tipo && norm_(r.descrizione) === norm_(v.descrizione) && r.id !== p.id; })) fail_('DUPLICATO', 'Questa causale esiste già.');
  var now = nowIso_();
  if (p.id) {
    var ex = findById_(rows, p.id);
    if (!ex) fail_('NON_TROVATO', 'Causale non trovata.');
    var upd = strip_(ex);
    upd.descrizione = v.descrizione; upd.attivo = v.attivo; if (v.ordine) upd.ordine = v.ordine; upd.modificato_il = now;
    updateRow_('Causali', ex._row, upd);
    log_(ctx, 'Causale', ex.id, 'modifica', diff_(ex, upd, ['descrizione', 'attivo', 'ordine']));
    return upd;
  }
  var obj = { id: nextIds_('Causali', 1)[0], tipo: v.tipo, descrizione: v.descrizione, attivo: v.attivo, ordine: v.ordine || String(rows.length + 1), creato_il: now, modificato_il: now };
  appendRows_('Causali', [obj]);
  log_(ctx, 'Causale', obj.id, 'crea', null);
  return obj;
}

function causaleValida_(ctx, tipo, testo, precedente) {
  if (!testo) return '';
  if (precedente && norm_(precedente) === norm_(testo)) return precedente;
  var c = cached_(ctx, 'Causali').filter(function (r) { return r.tipo === tipo && norm_(r.descrizione) === norm_(testo); })[0];
  if (!c) fail_('VALIDAZIONE', 'Causale non riconosciuta: "' + testo + '". Aggiungila nelle Impostazioni.');
  if (c.attivo !== 'SI') fail_('VALIDAZIONE', 'La causale "' + c.descrizione + '" non è più attiva.');
  return c.descrizione;
}

/* ======================================================================
 * Operazioni: trasferimenti e resi
 * ==================================================================== */

var TR_FIELDS = ['data', 'catalogo_id', 'premio_id', 'pdv_origine_id', 'pdv_destinazione_id', 'quantita', 'causale', 'riferimento', 'note'];
var RS_FIELDS = ['data', 'catalogo_id', 'premio_id', 'pdv_id', 'quantita', 'causale', 'trasferimento_id', 'riferimento', 'note'];

/** Controlla che un premio o PDV esista; se è disattivato è accettato solo se già presente nell'operazione. */
function entita_(rows, id, etichetta, precedenteId, e, campo) {
  if (!id) { e[campo] = etichetta + ': campo obbligatorio.'; return null; }
  var r = findById_(rows, id);
  if (!r) { e[campo] = etichetta + ' inesistente.'; return null; }
  if (r.attivo !== 'SI' && r.id !== precedenteId) { e[campo] = etichetta + ' "' + (r.nome || r.descrizione) + '" non è attivo.'; return null; }
  return r;
}

function commonOp_(p, ctx, prev, e) {
  var data = str_(p.data, 10);
  if (!isDate_(data)) e.data = 'Data non valida.';
  var cat = findById_(cached_(ctx, 'Cataloghi'), str_(p.catalogo_id, 20));
  if (!cat) e.catalogo_id = 'Catalogo non valido.';
  var premio = entita_(cached_(ctx, 'Premi'), str_(p.premio_id, 20), 'Premio', prev ? prev.premio_id : null, e, 'premio_id');
  if (premio && cat && premio.catalogo_id !== cat.id) e.premio_id = 'Il premio selezionato non appartiene al catalogo ' + cat.codice + '.';
  var q = qta_(p.quantita);
  if (q === null) e.quantita = 'La quantità deve essere un numero intero positivo (massimo ' + MAX_QTA + ').';
  return { data: data, cat: cat, premio: premio, quantita: q };
}

function saveTrasferimento_(p, ctx) {
  var rows = cached_(ctx, 'Trasferimenti');
  var prev = null;
  if (p.id) {
    prev = findById_(rows, p.id);
    if (!prev) fail_('NON_TROVATO', 'Trasferimento non trovato.');
    if (prev.stato !== 'valido') fail_('VALIDAZIONE', 'Un trasferimento annullato non può essere modificato: ripristinalo prima.');
    checkVersion_(prev, p.atteso_modificato_il);
  }
  var e = {};
  var c = commonOp_(p, ctx, prev, e);
  var pdvRows = cached_(ctx, 'PDV');
  var orig = entita_(pdvRows, str_(p.pdv_origine_id, 20), 'PDV di origine', prev ? prev.pdv_origine_id : null, e, 'pdv_origine_id');
  var dest = entita_(pdvRows, str_(p.pdv_destinazione_id, 20), 'PDV di destinazione', prev ? prev.pdv_destinazione_id : null, e, 'pdv_destinazione_id');
  if (orig && dest && orig.id === dest.id) e.pdv_destinazione_id = 'Il PDV di origine e quello di destinazione non possono coincidere.';
  check_(e);
  var causale = causaleValida_(ctx, 'trasferimento', str_(p.causale, 100), prev ? prev.causale : '');
  var now = nowIso_();
  var obj = prev ? strip_(prev) : { id: nextIds_('Trasferimenti', 1)[0], stato: 'valido', creato_il: now, creato_da: ctx.operatore, annullato_il: '', motivo_annullamento: '' };
  obj.data = c.data; obj.catalogo_id = c.cat.id;
  obj.premio_id = c.premio.id; obj.premio_codice = c.premio.codice; obj.premio_descrizione = c.premio.descrizione;
  obj.pdv_origine_id = orig.id; obj.pdv_origine_codice = orig.codice; obj.pdv_origine_nome = orig.nome;
  obj.pdv_destinazione_id = dest.id; obj.pdv_destinazione_codice = dest.codice; obj.pdv_destinazione_nome = dest.nome;
  obj.quantita = String(c.quantita); obj.causale = causale;
  obj.riferimento = str_(p.riferimento, 100); obj.note = str_(p.note, 1000);
  obj.modificato_il = now; obj.modificato_da = ctx.operatore;
  if (prev) {
    var d = diff_(prev, obj, TR_FIELDS);
    if (!Object.keys(d).length) return strip_(prev);
    updateRow_('Trasferimenti', prev._row, obj);
    log_(ctx, 'Trasferimento', obj.id, 'modifica', d);
  } else {
    appendRows_('Trasferimenti', [obj]);
    log_(ctx, 'Trasferimento', obj.id, 'crea', null);
  }
  return obj;
}

function saveReso_(p, ctx) {
  var rows = cached_(ctx, 'Resi');
  var prev = null;
  if (p.id) {
    prev = findById_(rows, p.id);
    if (!prev) fail_('NON_TROVATO', 'Reso non trovato.');
    if (prev.stato !== 'valido') fail_('VALIDAZIONE', 'Un reso annullato non può essere modificato: ripristinalo prima.');
    checkVersion_(prev, p.atteso_modificato_il);
  }
  var e = {};
  var c = commonOp_(p, ctx, prev, e);
  var pdv = entita_(cached_(ctx, 'PDV'), str_(p.pdv_id, 20), 'Punto vendita', prev ? prev.pdv_id : null, e, 'pdv_id');
  var trId = str_(p.trasferimento_id, 20);
  if (trId) {
    var tr = findById_(cached_(ctx, 'Trasferimenti'), trId);
    if (!tr) e.trasferimento_id = 'Il trasferimento collegato ' + trId + ' non esiste.';
    else if (tr.stato !== 'valido' && trId !== (prev && prev.trasferimento_id)) e.trasferimento_id = 'Il trasferimento collegato ' + trId + ' è annullato.';
    else if (c.premio && tr.premio_id !== c.premio.id) e.trasferimento_id = 'Il trasferimento collegato ' + trId + ' riguarda un altro premio.';
  }
  check_(e);
  var causale = causaleValida_(ctx, 'reso', str_(p.causale, 100), prev ? prev.causale : '');
  var now = nowIso_();
  var obj = prev ? strip_(prev) : { id: nextIds_('Resi', 1)[0], stato: 'valido', creato_il: now, creato_da: ctx.operatore, annullato_il: '', motivo_annullamento: '' };
  obj.data = c.data; obj.catalogo_id = c.cat.id;
  obj.premio_id = c.premio.id; obj.premio_codice = c.premio.codice; obj.premio_descrizione = c.premio.descrizione;
  obj.pdv_id = pdv.id; obj.pdv_codice = pdv.codice; obj.pdv_nome = pdv.nome;
  obj.quantita = String(c.quantita); obj.causale = causale; obj.trasferimento_id = trId;
  obj.riferimento = str_(p.riferimento, 100); obj.note = str_(p.note, 1000);
  obj.modificato_il = now; obj.modificato_da = ctx.operatore;
  if (prev) {
    var d = diff_(prev, obj, RS_FIELDS);
    if (!Object.keys(d).length) return strip_(prev);
    updateRow_('Resi', prev._row, obj);
    log_(ctx, 'Reso', obj.id, 'modifica', d);
  } else {
    appendRows_('Resi', [obj]);
    log_(ctx, 'Reso', obj.id, 'crea', null);
  }
  return obj;
}

function opTable_(tipo) {
  if (tipo === 'trasferimento') return { sheet: 'Trasferimenti', label: 'Trasferimento' };
  if (tipo === 'reso') return { sheet: 'Resi', label: 'Reso' };
  fail_('RICHIESTA', 'Tipo operazione non valido.');
}

function annullaOperazione_(p, ctx) {
  var t = opTable_(p.tipo);
  var ex = findById_(cached_(ctx, t.sheet), str_(p.id, 20));
  if (!ex) fail_('NON_TROVATO', t.label + ' non trovato.');
  if (ex.stato === 'annullato') fail_('VALIDAZIONE', 'Operazione già annullata.');
  checkVersion_(ex, p.atteso_modificato_il);
  var now = nowIso_();
  var upd = strip_(ex);
  upd.stato = 'annullato'; upd.annullato_il = now; upd.motivo_annullamento = str_(p.motivo, 300);
  upd.modificato_il = now; upd.modificato_da = ctx.operatore;
  updateRow_(t.sheet, ex._row, upd);
  log_(ctx, t.label, ex.id, 'annulla', { motivo: upd.motivo_annullamento });
  var avvisi = [];
  if (p.tipo === 'trasferimento') {
    var collegati = cached_(ctx, 'Resi').filter(function (r) { return r.trasferimento_id === ex.id && r.stato === 'valido'; });
    if (collegati.length) avvisi.push('Attenzione: ' + collegati.length + ' reso/i valido/i sono collegati a questo trasferimento (' + collegati.map(function (r) { return r.id; }).join(', ') + '). Non sono stati modificati.');
  }
  return { operazione: upd, avvisi: avvisi };
}

function ripristinaOperazione_(p, ctx) {
  var t = opTable_(p.tipo);
  var ex = findById_(cached_(ctx, t.sheet), str_(p.id, 20));
  if (!ex) fail_('NON_TROVATO', t.label + ' non trovato.');
  if (ex.stato !== 'annullato') fail_('VALIDAZIONE', 'L\'operazione non è annullata.');
  checkVersion_(ex, p.atteso_modificato_il);
  if (!findById_(cached_(ctx, 'Premi'), ex.premio_id)) fail_('VALIDAZIONE', 'Il premio di questa operazione non esiste più.');
  var now = nowIso_();
  var upd = strip_(ex);
  upd.stato = 'valido'; upd.annullato_il = ''; upd.motivo_annullamento = '';
  upd.modificato_il = now; upd.modificato_da = ctx.operatore;
  updateRow_(t.sheet, ex._row, upd);
  log_(ctx, t.label, ex.id, 'ripristina', { motivo_precedente: ex.motivo_annullamento });
  return { operazione: upd, avvisi: [] };
}

/* ======================================================================
 * Backup e ripristino
 * ==================================================================== */

function backupFolder_() {
  var it = DriveApp.getFoldersByName(BACKUP_FOLDER);
  return it.hasNext() ? it.next() : DriveApp.createFolder(BACKUP_FOLDER);
}

/** Copia completa del Foglio Google (tutte le tabelle, registro incluso) in una cartella di Drive. */
function backupDrive_() {
  var ss = ss_();
  var stamp = nowIso_().replace(/[:T]/g, '-').slice(0, 19);
  var nome = ss.getName() + ' - backup ' + stamp;
  var copy = DriveApp.getFileById(ss.getId()).makeCopy(nome, backupFolder_());
  return { nome: nome, url: copy.getUrl(), cartella: BACKUP_FOLDER, creato_il: nowIso_() };
}

/** Esporta TUTTE le tabelle (incluse Meta e Registro) in un unico JSON ripristinabile. */
function exportBackup_() {
  var fogli = {};
  Object.keys(SHEETS).forEach(function (name) {
    var sh = sheet_(name);
    var hdr = headers_(sh);
    var lr = sh.getLastRow();
    var righe = lr >= 2 ? sh.getRange(2, 1, lr - 1, hdr.length).getDisplayValues().filter(function (r) { return r[0] !== ''; }) : [];
    fogli[name] = { intestazioni: hdr, righe: righe };
  });
  return { formato: 'gestionale-premi-backup', schema: SCHEMA_VERSION, creato_il: nowIso_(), nome_database: ss_().getName(), fogli: fogli };
}

function restoreBackup_(p, ctx) {
  if (p.conferma !== 'RIPRISTINA') fail_('VALIDAZIONE', 'Per ripristinare un backup è necessario digitare RIPRISTINA come conferma.');
  var b = p.backup;
  if (!b || b.formato !== 'gestionale-premi-backup' || !b.fogli) fail_('VALIDAZIONE', 'Il file non è un backup valido di questo gestionale.');
  if (Number(b.schema) > SCHEMA_VERSION) fail_('VALIDAZIONE', 'Il backup proviene da una versione più recente del programma: aggiorna prima lo script.');
  ['Cataloghi', 'Premi', 'PDV', 'Trasferimenti', 'Resi', 'Meta'].forEach(function (n) {
    var f = b.fogli[n];
    if (!f || !Array.isArray(f.intestazioni) || !Array.isArray(f.righe)) fail_('VALIDAZIONE', 'Backup incompleto: manca la tabella ' + n + '.');
    if (f.intestazioni[0] !== SHEETS[n][0]) fail_('VALIDAZIONE', 'Backup non valido: intestazioni inattese nella tabella ' + n + '.');
  });
  // Copia di sicurezza dello stato attuale prima di sovrascrivere.
  var sicurezza = backupDrive_();
  var conteggi = {};
  Object.keys(SHEETS).forEach(function (name) {
    var f = b.fogli[name];
    var sh = sheet_(name);
    var hdr = headers_(sh);
    var lr = sh.getLastRow();
    if (lr >= 2) sh.getRange(2, 1, lr - 1, sh.getMaxColumns()).clearContent();
    if (!f) { conteggi[name] = 0; return; }
    var objs = f.righe.map(function (r) {
      var o = {}; f.intestazioni.forEach(function (h, i) { o[h] = r[i]; }); return o;
    });
    var rows = objs.map(function (o) { return hdr.map(function (h) { return cell_(o[h]); }); });
    if (rows.length) {
      ensureCapacity_(sh, rows.length + 1);
      var rng = sh.getRange(2, 1, rows.length, hdr.length);
      rng.setNumberFormat('@');
      rng.setValues(rows);
    }
    conteggi[name] = rows.length;
  });
  log_(ctx, 'Database', '', 'ripristino_backup', { backup_del: b.creato_il, copia_sicurezza: sicurezza.nome });
  return { conteggi: conteggi, copia_sicurezza: sicurezza };
}
