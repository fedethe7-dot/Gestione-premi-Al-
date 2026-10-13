/**
 * Crea apps-script/Index.html: l'applicazione già compilata (docs/app.js + docs/app.css)
 * in un unico file da aggiungere al progetto Apps Script.
 *
 * Serve per gli account Google aziendali che non permettono l'accesso "Chiunque" alla web app:
 * la pagina viene servita direttamente da Apps Script (doGet) e parla con il Foglio tramite
 * google.script.run, quindi non servono indirizzo, token né impostazioni di collegamento.
 *
 *   node build-gas.mjs      (dopo `npm run build`)
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.dirname(new URL(import.meta.url).pathname);
const DOCS = path.join(ROOT, 'docs');
const OUT = path.join(ROOT, 'apps-script', 'Index.html');

const css = fs.readFileSync(path.join(DOCS, 'app.css'), 'utf8');
const js = fs.readFileSync(path.join(DOCS, 'app.js'), 'utf8');
if (/\bimport\.meta\b|^\s*(import|export)\s/m.test(js)) throw new Error('app.js usa import/export: non può essere incluso come script normale.');

// Evita che "</script" o "</style" dentro il codice chiudano il tag in anticipo.
const safeJs = js.replace(/<\/script/gi, '<\\/script');
const safeCss = css.replace(/<\/style/gi, '<\\/style');

/* Adattatore: l'app chiama fetch(indirizzo, POST); qui le chiamate vengono girate a google.script.run. */
const adattatore = `
(function () {
  var URL_INT = 'https://gestionale-integrato.local/exec';
  var KEY = 'gestionale-premi.config';
  // Impostazioni in memoria se il browser non permette localStorage in questa pagina.
  try { window.localStorage.getItem(KEY); } catch (e) {
    var mem = {};
    try {
      Object.defineProperty(window, 'localStorage', { configurable: true, value: {
        getItem: function (k) { return Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null; },
        setItem: function (k, v) { mem[k] = String(v); },
        removeItem: function (k) { delete mem[k]; }
      } });
    } catch (e2) { /* ignorato */ }
  }
  try {
    var c = {};
    try { c = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { c = {}; }
    if (c.url !== URL_INT || c.token !== 'integrato') {
      c.url = URL_INT; c.token = 'integrato';
      localStorage.setItem(KEY, JSON.stringify(c));
    }
  } catch (e) { /* ignorato */ }

  var fetchOriginale = window.fetch;
  window.fetch = function (input, init) {
    var url = typeof input === 'string' ? input : (input && input.url);
    if (url !== URL_INT) return fetchOriginale.apply(this, arguments);
    return new Promise(function (resolve, reject) {
      var risposta = function (testo) {
        resolve(new Response(testo, { status: 200, headers: { 'Content-Type': 'application/json' } }));
      };
      if (init && init.signal) {
        init.signal.addEventListener('abort', function () { var e = new Error('Tempo scaduto'); e.name = 'AbortError'; reject(e); });
      }
      google.script.run
        .withSuccessHandler(function (testo) { risposta(String(testo)); })
        .withFailureHandler(function (err) {
          risposta(JSON.stringify({ ok: false, error: { code: 'SERVER', message: 'Errore dal server Google: ' + ((err && err.message) || err) } }));
        })
        .api((init && init.body) || '{}');
    });
  };
})();
`;

/* Nella versione integrata indirizzo e token non servono: li nascondo dalle Impostazioni. */
const cssExtra = `
*:has(> label[for="cfg-url"]), *:has(> label[for="cfg-token"]) { display: none !important; }
`;

const html = `<!doctype html>
<html lang="it">
<head>
<meta charset="utf-8">
<meta name="robots" content="noindex, nofollow">
<style>${safeCss}${cssExtra}</style>
</head>
<body>
<div id="root"></div>
<script>${adattatore}</script>
<script>(function () {
${safeJs}
})();</script>
</body>
</html>
`;

fs.writeFileSync(OUT, html);
console.log(`Creato apps-script/Index.html (${(fs.statSync(OUT).size / 1024).toFixed(0)} KB)`);
