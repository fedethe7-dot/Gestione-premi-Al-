/**
 * Emulatore locale di Google Apps Script + Fogli Google.
 * Serve SOLO per sviluppo e test automatici: esegue il vero file apps-script/Code.gs
 * dentro Node, con un Foglio simulato salvato su file JSON.
 * Non serve per l'uso normale del gestionale.
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const CODE_PATH = path.join(here, '..', 'apps-script', 'Code.gs');

class MockRange {
  constructor(sheet, row, col, nr, nc) {
    if (row < 1 || col < 1 || nr < 1 || nc < 1) throw new Error(`Intervallo non valido ${row},${col},${nr},${nc}`);
    if (row + nr - 1 > sheet.maxRows || col + nc - 1 > sheet.maxCols) {
      throw new Error('The coordinates of the range are outside the dimensions of the sheet.');
    }
    Object.assign(this, { sheet, row, col, nr, nc });
  }
  getDisplayValues() {
    const out = [];
    for (let r = 0; r < this.nr; r++) {
      const line = [];
      for (let c = 0; c < this.nc; c++) {
        const v = this.sheet.get(this.row + r, this.col + c);
        line.push(v.startsWith("'") ? v.slice(1) : v);
      }
      out.push(line);
    }
    return out;
  }
  getValues() { return this.getDisplayValues(); }
  setValues(values) {
    if (values.length !== this.nr) throw new Error(`Righe attese ${this.nr}, ricevute ${values.length}`);
    values.forEach((line, r) => {
      if (line.length !== this.nc) throw new Error(`Colonne attese ${this.nc}, ricevute ${line.length}`);
      line.forEach((v, c) => {
        const s = String(v);
        if (s.startsWith('=')) throw new Error('Formula non prevista scritta nel foglio: ' + s);
        this.sheet.set(this.row + r, this.col + c, s);
      });
    });
    return this;
  }
  clearContent() {
    for (let r = 0; r < this.nr; r++) for (let c = 0; c < this.nc; c++) this.sheet.set(this.row + r, this.col + c, '');
    return this;
  }
  setNumberFormat() { return this; }
  setFontWeight() { return this; }
}

class MockSheet {
  constructor(name, data) {
    this.name = name;
    this.cells = data?.cells || [];
    this.maxRows = data?.maxRows || 1000;
    this.maxCols = data?.maxCols || 26;
  }
  get(r, c) { return (this.cells[r - 1] && this.cells[r - 1][c - 1]) || ''; }
  set(r, c, v) {
    while (this.cells.length < r) this.cells.push([]);
    const line = this.cells[r - 1];
    while (line.length < c) line.push('');
    line[c - 1] = v;
  }
  getName() { return this.name; }
  getLastRow() {
    for (let r = this.cells.length; r >= 1; r--) if ((this.cells[r - 1] || []).some((v) => v !== '')) return r;
    return 0;
  }
  getLastColumn() {
    let m = 0;
    this.cells.forEach((l) => l.forEach((v, i) => { if (v !== '' && i + 1 > m) m = i + 1; }));
    return m;
  }
  getMaxRows() { return this.maxRows; }
  getMaxColumns() { return this.maxCols; }
  insertRowsAfter(_after, n) { this.maxRows += n; }
  insertColumnsAfter(_after, n) { this.maxCols += n; }
  getRange(r, c, nr = 1, nc = 1) { return new MockRange(this, r, c, nr, nc); }
  setFrozenRows() {}
  toJSON() { return { cells: this.cells, maxRows: this.maxRows, maxCols: this.maxCols }; }
}

class MockSpreadsheet {
  constructor(state) {
    this.name = state?.name || 'Gestionale premi (emulatore)';
    this.id = state?.id || 'emulatore';
    this.order = state?.order || ['Foglio1'];
    this.sheets = {};
    for (const n of this.order) this.sheets[n] = new MockSheet(n, state?.sheets?.[n]);
  }
  getName() { return this.name; }
  getId() { return this.id; }
  getSheetByName(n) { return this.sheets[n] || null; }
  getSheets() { return this.order.map((n) => this.sheets[n]); }
  insertSheet(n) { this.sheets[n] = new MockSheet(n); this.order.push(n); return this.sheets[n]; }
  deleteSheet(sh) { delete this.sheets[sh.name]; this.order = this.order.filter((n) => n !== sh.name); }
  toJSON() { return { name: this.name, id: this.id, order: this.order, sheets: Object.fromEntries(this.order.map((n) => [n, this.sheets[n].toJSON()])) }; }
}

export function createBackend({ dataFile, backupDir, token } = {}) {
  const load = () => (dataFile && fs.existsSync(dataFile) ? JSON.parse(fs.readFileSync(dataFile, 'utf8')) : {});
  let state = load();
  let ss = new MockSpreadsheet(state.spreadsheet);
  const props = { ...(state.properties || {}) };
  if (token) props.API_TOKEN = token;
  const logs = [];
  const backups = [];
  let locked = false;

  const save = () => {
    if (!dataFile) return;
    fs.mkdirSync(path.dirname(dataFile), { recursive: true });
    const tmp = dataFile + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify({ spreadsheet: ss.toJSON(), properties: props }));
    fs.renameSync(tmp, dataFile);
  };

  const context = {
    SpreadsheetApp: { getActiveSpreadsheet: () => ss, flush: () => {}, getUi: () => { throw new Error('Nessuna interfaccia'); } },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k) => (k in props ? props[k] : null),
        setProperty: (k, v) => { props[k] = String(v); },
      }),
    },
    LockService: {
      getScriptLock: () => ({
        tryLock: () => { if (locked) return false; locked = true; return true; },
        waitLock: () => { locked = true; },
        releaseLock: () => { locked = false; },
      }),
    },
    Utilities: { getUuid: () => crypto.randomUUID() },
    Logger: { log: (m) => logs.push(String(m)) },
    ContentService: {
      MimeType: { JSON: 'application/json' },
      createTextOutput: (content) => ({ content, setMimeType() { return this; } }),
    },
    DriveApp: {
      getFoldersByName: () => ({ hasNext: () => false }),
      createFolder: (name) => ({ name }),
      getFileById: () => ({
        makeCopy: (name) => {
          const snap = JSON.stringify(ss.toJSON());
          if (backupDir) {
            fs.mkdirSync(backupDir, { recursive: true });
            fs.writeFileSync(path.join(backupDir, name.replace(/[^\w.-]+/g, '_') + '.json'), snap);
          }
          backups.push({ name, snap });
          return { getUrl: () => 'https://drive.example/emulatore/' + encodeURIComponent(name) };
        },
      }),
    },
    console,
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(CODE_PATH, 'utf8'), context, { filename: 'Code.gs' });

  return {
    setup() { const t = context.setup(); save(); return t; },
    get token() { return props.API_TOKEN; },
    /** Equivalente di una chiamata POST alla web app. */
    request(body) {
      const out = context.doPost({ postData: { contents: typeof body === 'string' ? body : JSON.stringify(body) } });
      save();
      return JSON.parse(out.content);
    },
    doGet() { return JSON.parse(context.doGet().content); },
    /** Simula un riavvio: rilegge tutto dal file su disco. */
    reload() { state = load(); ss = new MockSpreadsheet(state.spreadsheet); },
    sheet(name) { return ss.getSheetByName(name); },
    backups,
    logs,
  };
}
