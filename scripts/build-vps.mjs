// Constrói a versão web para o VPS (https://anossacasa.app).
//
//   npm run build:vps          → dist/
//
// ⚠ Porque é que isto existe: o `app.json` tem `experiments.baseUrl: "/nossa-casa"`
// para o GitHub Pages (que serve a app em /nossa-casa/). No VPS a app vive na
// raiz do domínio, e com aquele prefixo o `index.html` pede o JavaScript em
// `/nossa-casa/_expo/...`, que lá não existe: o servidor devolve HTML, o
// navegador recusa-o e fica um ecrã azul-escuro em branco. Já aconteceu duas
// vezes a 14/10/2026.
//
// Por isso este script tira o `baseUrl` SÓ durante o build e repõe o `app.json`
// no fim, aconteça o que acontecer. O build do Pages (workflow) não passa por aqui.
//
// O backend por omissão é https://casa.anossacasa.app; para outro, defina
// EXPO_PUBLIC_PB_URL antes de correr.
import { readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const APP_JSON = 'app.json';
const SAIDA = 'dist';
const original = readFileSync(APP_JSON, 'utf8');

const restaurar = () => writeFileSync(APP_JSON, original);
process.on('SIGINT', () => { restaurar(); process.exit(130); });

let codigo = 1;
try {
  const app = JSON.parse(original);
  if (app.expo?.experiments) {
    delete app.expo.experiments.baseUrl;
    if (!Object.keys(app.expo.experiments).length) delete app.expo.experiments;
  }
  writeFileSync(APP_JSON, JSON.stringify(app, null, 2));

  if (existsSync(SAIDA)) rmSync(SAIDA, { recursive: true, force: true });
  const r = spawnSync('npx', ['expo', 'export', '--platform', 'web', '--output-dir', SAIDA], {
    stdio: 'inherit',
    shell: true,
    env: { ...process.env, EXPO_PUBLIC_PB_URL: process.env.EXPO_PUBLIC_PB_URL || 'https://casa.anossacasa.app' },
  });
  codigo = r.status ?? 1;

  if (codigo === 0) {
    // A guarda que interessa: nenhuma ligação do index.html pode levar o prefixo.
    const html = readFileSync(`${SAIDA}/index.html`, 'utf8');
    if (html.includes('/nossa-casa/')) {
      console.error('\nFALHOU: o index.html ainda tem o prefixo /nossa-casa/ — não publique este build.');
      codigo = 1;
    } else {
      console.log(`\nOK: ${SAIDA}/ pronto para o VPS (sem baseUrl, backend ${process.env.EXPO_PUBLIC_PB_URL || 'https://casa.anossacasa.app'}).`);
    }
  }
} finally {
  restaurar();
}
process.exit(codigo);
