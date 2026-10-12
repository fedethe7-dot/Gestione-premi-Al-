/**
 * Compila l'applicazione nella cartella docs/ (pubblicata da GitHub Pages).
 *   node build.mjs         build di produzione
 *   node build.mjs --dev   sviluppo con ricompilazione automatica su http://localhost:5173
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import * as esbuild from 'esbuild';
import { compile } from 'tailwindcss';

const require = createRequire(import.meta.url);
const ROOT = path.dirname(new URL(import.meta.url).pathname);
const SRC = path.join(ROOT, 'src');
const OUT = path.join(ROOT, 'docs');
const DEV = process.argv.includes('--dev');
const VERSION = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;

function listFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? listFiles(path.join(dir, e.name)) : [path.join(dir, e.name)]);
}

/** Tailwind v4 senza plugin: estrae i possibili nomi di classe dai sorgenti e genera il CSS. */
async function buildCss() {
  const twDir = path.dirname(require.resolve('tailwindcss/package.json'));
  const input = fs.readFileSync(path.join(SRC, 'styles.css'), 'utf8');
  const compiler = await compile(input, {
    base: SRC,
    async loadStylesheet(id, base) {
      let file;
      if (id === 'tailwindcss') file = path.join(twDir, 'index.css');
      else if (id.startsWith('tailwindcss/')) file = path.join(twDir, id.slice('tailwindcss/'.length));
      else file = path.resolve(base, id);
      if (!fs.existsSync(file) && fs.existsSync(file + '.css')) file += '.css';
      return { path: file, base: path.dirname(file), content: fs.readFileSync(file, 'utf8') };
    },
  });
  const candidates = new Set();
  for (const f of listFiles(SRC)) {
    if (!/\.(tsx?|css|html)$/.test(f)) continue;
    for (const tok of fs.readFileSync(f, 'utf8').split(/[\s"'`{}<>;\\]+/)) if (tok) candidates.add(tok);
  }
  const css = compiler.build([...candidates]);
  const out = DEV ? css : (await esbuild.transform(css, { loader: 'css', minify: true, target: ['chrome100', 'edge100', 'firefox100', 'safari15'] })).code;
  fs.writeFileSync(path.join(OUT, 'app.css'), out);
}

function writeHtml() {
  const stamp = DEV ? 'dev' : VERSION + '-' + Date.now().toString(36);
  const html = fs.readFileSync(path.join(SRC, 'index.html'), 'utf8')
    .replaceAll('%VERSIONE%', stamp)
    .replaceAll('%APP_VERSION%', VERSION);
  fs.writeFileSync(path.join(OUT, 'index.html'), html);
  fs.writeFileSync(path.join(OUT, '.nojekyll'), '');
}

const options = {
  entryPoints: [path.join(SRC, 'main.tsx')],
  bundle: true,
  outfile: path.join(OUT, 'app.js'),
  format: 'esm',
  target: ['chrome110', 'edge110', 'firefox115', 'safari16'],
  jsx: 'automatic',
  minify: !DEV,
  sourcemap: DEV,
  legalComments: 'none',
  define: { 'process.env.NODE_ENV': DEV ? '"development"' : '"production"', __APP_VERSION__: JSON.stringify(VERSION) },
  logLevel: 'info',
};

fs.mkdirSync(OUT, { recursive: true });
for (const f of ['app.js', 'app.js.map']) fs.rmSync(path.join(OUT, f), { force: true });

if (DEV) {
  const ctx = await esbuild.context({
    ...options,
    plugins: [{ name: 'css', setup(b) { b.onEnd(async () => { await buildCss(); writeHtml(); }); } }],
  });
  await ctx.watch();
  const { port } = await ctx.serve({ servedir: OUT, port: 5173 });
  console.log(`Sviluppo: http://localhost:${port}`);
} else {
  await esbuild.build(options);
  await buildCss();
  writeHtml();
  const kb = (f) => (fs.statSync(path.join(OUT, f)).size / 1024).toFixed(0) + ' KB';
  console.log(`Build completata in docs/  (app.js ${kb('app.js')}, app.css ${kb('app.css')})`);
}
