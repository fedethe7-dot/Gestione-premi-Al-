/**
 * Server di sviluppo che imita la web app Apps Script su http://localhost:8787
 * Uso: npm run emulatore   (i dati finiscono in emulatore/dati/ — cartella esclusa da Git)
 */
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createBackend } from './gas-mock.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 8787);
const dataFile = process.env.DATA_FILE || path.join(here, 'dati', 'database.json');
const backend = createBackend({
  dataFile,
  backupDir: path.join(path.dirname(dataFile), 'backup'),
  token: process.env.API_TOKEN || undefined,
});
backend.setup();

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' };

http.createServer((req, res) => {
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
  if (req.method === 'GET') {
    res.writeHead(200, { ...cors, 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(backend.doGet()));
  }
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    const delay = Number(process.env.RITARDO_MS || 0);
    setTimeout(() => {
      const out = backend.request(body);
      res.writeHead(200, { ...cors, 'Content-Type': 'application/json' });
      res.end(JSON.stringify(out));
    }, delay);
  });
}).listen(PORT, () => {
  console.log(`Emulatore Apps Script in ascolto su http://localhost:${PORT}`);
  console.log(`Token API: ${backend.token}`);
  console.log(`Dati: ${dataFile}`);
});
