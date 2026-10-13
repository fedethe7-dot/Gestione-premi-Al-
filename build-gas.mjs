/**
 * Crea apps-script/Index.html: la pagina da aggiungere al progetto Apps Script, che carica
 * l'applicazione già compilata (docs/app.js + docs/app.css) da GitHub Pages.
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

/*
 * Il codice dell'app NON viene incollato in Apps Script (file enorme, che l'editor rovina):
 * Index.html è una pagina piccola che carica app.js e app.css da GitHub Pages.
 * Così, ogni volta che l'app si aggiorna su GitHub, la versione integrata si aggiorna da sola.
 */
const PAGES = 'https://fedethe7-dot.github.io/Gestione-premi-Al-/';
const caricatore = `
(function () {
  var base = '${PAGES}';
  var v = Date.now().toString(36);
  var mostraErrore = function (testo) {
    var r = document.getElementById('root');
    if (r && !r.firstChild) r.innerHTML = '<div style="font:15px system-ui;padding:24px;color:#991b1b">' + testo + '</div>';
  };
  window.addEventListener('error', function (e) { mostraErrore('Errore: ' + (e.message || 'sconosciuto')); });
  var css = document.createElement('link');
  css.rel = 'stylesheet';
  css.href = base + 'app.css?v=' + v;
  document.head.appendChild(css);
  var js = document.createElement('script');
  js.type = 'module';
  js.src = base + 'app.js?v=' + v;
  js.onerror = function () { mostraErrore('Impossibile caricare il programma da ' + base + ' (controlla che GitHub Pages sia attivo).'); };
  document.body.appendChild(js);
})();
`;

const html = `<!doctype html>
<html lang="it">
<head>
<meta charset="utf-8">
<meta name="robots" content="noindex, nofollow">
<style>${cssExtra}</style>
</head>
<body>
<div id="root"></div>
<script>${adattatore}</script>
<script>${caricatore}</script>
</body>
</html>
`;

fs.writeFileSync(OUT, html);
console.log(`Creato apps-script/Index.html (${(fs.statSync(OUT).size / 1024).toFixed(0)} KB)`);
