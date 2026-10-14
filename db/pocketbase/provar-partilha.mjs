// A lista partilhada com quem não tem a app — no servidor.
//
//   node db/pocketbase/provar-partilha.mjs
//
// Um adulto pede um endereço só de leitura da lista aberta; o servidor escreve
// o sinal e o prazo; quem abre o endereço vê rótulos e corredores e mais nada.
// 12/09/2026 — a nona das dez funcionalidades.
import PocketBase from 'pocketbase';
import { URL, PREFIXO, comecar, prova, igual, recusado, resumo, memoriaDeTelemovel } from './provas.mjs';

const { configurar, auth } = await import('../../src/pocketbase.js');
const sync = await import('../../src/sync.js');
configurar({ url: URL, storage: memoriaDeTelemovel() });

const { pb: admin } = await comecar();
const casa = await admin.collection('casas').create({ nome: PREFIXO + 'Partilha', valor_ponto: 0.1 });
const mk = (nome, papel, extra) => admin.collection('membros').create({
  nome, login: `${casa.id}_${nome}`, casa: casa.id, papel, verified: true, ...extra });
const s = (p) => ({ password: p, passwordConfirm: p });
const rita = await mk('Rita', 'admin', { email: 'rita-pl@x.pt', ...s('palavra-longa-1') });
const leo = await mk('Leo', 'crianca', { ...s('135790') });

const loja = await admin.collection('lojas').create({ casa: casa.id, nome: 'Continente' });
const mercearia = await admin.collection('seccoes').create({ casa: casa.id, nome: 'Mercearia', posto: 1 });
const frescos = await admin.collection('seccoes').create({ casa: casa.id, nome: 'Frescos', posto: 2 });
const lista = await admin.collection('listas_compras').create({ casa: casa.id, loja: loja.id, comprador: rita.id });
const artigo = (rotulo, corredor, extra = {}) => admin.collection('artigos').create({
  casa: casa.id, lista: lista.id, rotulo, corredor: corredor.id, estado: 'por_comprar', pedido_por: rita.id, estimativa: 3.5, ...extra });
await artigo('Arroz agulha', mercearia);
await artigo('Leite meio-gordo', frescos, { estado: 'confirmado' });
await artigo('Bicicleta da Mia', mercearia, { visibilidade: 'adultos' });

const telemovel = async (id, senha) => {
  const c = new PocketBase(URL);
  c.autoCancellation(false);
  await c.collection('membros').authWithPassword(id, senha);
  return c;
};
const doLeo = await telemovel(`${casa.id}_Leo`, '135790');
await auth.entrarAdulto('rita-pl@x.pt', 'palavra-longa-1');
const daRita = sync.sessao();

const abrir = (sinal) => fetch(`${URL}/lista/${sinal}`).then(async r => ({ status: r.status, texto: await r.text() }));

console.log('\n── pedir o endereço ──');

let partilha = null;
await prova('a Rita pede o endereço, e o servidor escreve o sinal e o prazo — não o cliente', async () => {
  partilha = await sync.partilharLista({ casa: daRita.casa, lista: lista.id, criadaPor: daRita.membro });
  igual(/^[A-Za-z0-9]{24}$/.test(partilha.sinal), true);
  igual(partilha.url.endsWith(`/lista/${partilha.sinal}`), true);
  const expira = Date.parse(String(partilha.expiraEm).replace(' ', 'T'));
  const daquiA = (expira - Date.now()) / 60000;
  igual(daquiA > 55 && daquiA <= 61, true);
});

await prova('⚠ um sinal e um prazo escolhidos pelo cliente são ignorados', async () => {
  const { pb: daRitaCru } = await import('../../src/pocketbase.js');
  const r = await daRitaCru.collection('partilhas_lista').create({
    casa: casa.id, lista: lista.id, criada_por: rita.id, sinal: 'abc', expira_em: '2030-01-01 00:00:00.000Z' });
  igual(r.sinal !== 'abc' && r.sinal.length === 24, true);
  igual(String(r.expira_em).slice(0, 4) !== '2030', true);
  await admin.collection('partilhas_lista').delete(r.id);
});

await prova('⚠ a criança não partilha a lista da casa', () =>
  recusado(() => doLeo.collection('partilhas_lista').create({ casa: casa.id, lista: lista.id, criada_por: leo.id })));

await prova('⚠ nem se altera uma partilha — desfaz-se apagando', async () => {
  const { pb: daRitaCru } = await import('../../src/pocketbase.js');
  await recusado(() => daRitaCru.collection('partilhas_lista').update(partilha.id, { expira_em: '2030-01-01 00:00:00.000Z' }));
});

console.log('\n── abrir o endereço, sem sessão ──');

await prova('quem abre vê os rótulos e os corredores, riscado o já comprado', async () => {
  const r = await abrir(partilha.sinal);
  igual(r.status, 200);
  igual(r.texto.includes('Arroz agulha'), true);
  igual(r.texto.includes('<h2>Mercearia</h2>'), true);
  igual(r.texto.includes('<h2>Frescos</h2>'), true);
  igual(/<li class="feito">Leite meio-gordo<\/li>/.test(r.texto), true);
  igual(r.texto.includes('Continente'), true);
});

await prova('⚠ e NÃO vê a prenda «só adultos», nem preços, nem quem pediu', async () => {
  const r = await abrir(partilha.sinal);
  igual(r.texto.includes('Bicicleta'), false);
  igual(r.texto.includes('3,5'), false);
  igual(r.texto.includes('3.5'), false);
  igual(r.texto.includes('Rita'), false);
  igual(r.texto.includes('<form'), false);
  igual(r.texto.includes('<script'), false);
});

await prova('⚠ o que a casa escreveu sai ESCAPADO — um rótulo com «<script>» é texto, não código', async () => {
  const marota = await admin.collection('seccoes').create({ casa: casa.id, nome: '"><img src=x onerror=alert(1)>', posto: 3 });
  const a = await artigo('<script>alert("x")</script> pão', marota);
  const r = await abrir(partilha.sinal);
  igual(r.status, 200);
  igual(r.texto.includes('<script'), false);
  igual(r.texto.includes('<img'), false);
  igual(r.texto.includes('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; pão'), true);
  igual(r.texto.includes('<h2>&quot;&gt;&lt;img src=x onerror=alert(1)&gt;</h2>'), true);
  await admin.collection('artigos').delete(a.id);
  await admin.collection('seccoes').delete(marota.id);
});

await prova('⚠ um corredor chamado «constructor» ou «__proto__» não deita a página abaixo', async () => {
  const c1 = await admin.collection('seccoes').create({ casa: casa.id, nome: 'constructor', posto: 4 });
  const c2 = await admin.collection('seccoes').create({ casa: casa.id, nome: '__proto__', posto: 5 });
  const a1 = await artigo('Detergente', c1);
  const a2 = await artigo('Esfregões', c2);
  const semCorredor = await admin.collection('artigos').create({
    casa: casa.id, lista: lista.id, rotulo: 'Pilhas', estado: 'por_comprar', pedido_por: rita.id });
  const outros = await admin.collection('seccoes').create({ casa: casa.id, nome: 'Outros', posto: 6 });
  const a3 = await artigo('Velas', outros);
  // A limpeza corre MESMO que a prova falhe: com estes corredores na lista, um
  // servidor com o hook antigo dava 500 a todas as provas seguintes.
  try {
    const r = await abrir(partilha.sinal);
    igual(r.status, 200);
    igual(r.texto.includes('<h2>constructor</h2>'), true);
    igual(r.texto.includes('Detergente'), true);
    igual(r.texto.includes('Esfregões'), true);
    // Os dois «Outros»: o corredor da casa e o dos artigos sem corredor, separados.
    igual((r.texto.match(/<h2>Outros<\/h2>/g) || []).length, 2);
    igual(r.texto.indexOf('Velas') < r.texto.indexOf('Pilhas'), true);
  } finally {
    for (const x of [a1, a2, a3, semCorredor]) await admin.collection('artigos').delete(x.id);
    for (const x of [c1, c2, outros]) await admin.collection('seccoes').delete(x.id);
  }
});

await prova('⚠ a resposta não se guarda em cache nem se indexa', async () => {
  const r = await fetch(`${URL}/lista/${partilha.sinal}`);
  igual(r.headers.get('cache-control'), 'no-store');
  igual(r.headers.get('x-robots-tag'), 'noindex');
  igual((await r.text()).includes('<meta name="robots" content="noindex">'), true);
});

await prova('⚠ um sinal que não existe, ou mal formado, dá 404 — e a caixa conta', async () => {
  igual((await abrir('a'.repeat(24))).status, 404);
  igual((await abrir('nao-e-um-sinal')).status, 404);
  igual((await abrir(partilha.id)).status, 404);
  const trocado = partilha.sinal.split('').map(ch => ch === ch.toUpperCase() ? ch.toLowerCase() : ch.toUpperCase()).join('');
  if (trocado !== partilha.sinal) igual((await abrir(trocado)).status, 404);
});

await prova('⚠ a criança não lê as partilhas da casa', async () => {
  igual((await doLeo.collection('partilhas_lista').getFullList()).length, 0);
});

await prova('⚠ sem prazo escrito, o endereço recusa — a data vazia não é «para sempre»', async () => {
  await admin.collection('partilhas_lista').update(partilha.id, { expira_em: null });
  igual((await abrir(partilha.sinal)).status, 410);
  await admin.collection('partilhas_lista').update(partilha.id, { expira_em: '2099-01-01 00:00:00.000Z' });
  igual((await abrir(partilha.sinal)).status, 200);
});

await prova('⚠ não há escrita por este caminho', async () => {
  const r = await fetch(`${URL}/lista/${partilha.sinal}`, { method: 'POST', body: '{}' });
  igual(r.status === 404 || r.status === 405, true);
});

await prova('⚠ expirado, o endereço recusa', async () => {
  await admin.collection('partilhas_lista').update(partilha.id, { expira_em: '2020-01-01 00:00:00.000Z' });
  igual((await abrir(partilha.sinal)).status, 410);
  await admin.collection('partilhas_lista').update(partilha.id, { expira_em: '2099-01-01 00:00:00.000Z' });
  igual((await abrir(partilha.sinal)).status, 200);
});

await prova('⚠ com a lista fechada, o endereço recusa', async () => {
  await admin.collection('listas_compras').update(lista.id, { fechada_em: '2026-09-12 18:00:00.000Z', total: 12 });
  igual((await abrir(partilha.sinal)).status, 410);
  await admin.collection('listas_compras').update(lista.id, { fechada_em: null });
  igual((await abrir(partilha.sinal)).status, 200);
});

await prova('desfazer a partilha mata o endereço na hora', async () => {
  await sync.apagarPartilhaDaLista(partilha.id);
  igual((await abrir(partilha.sinal)).status, 404);
});

await prova('⚠ uma adulta de outra casa não partilha a lista desta', async () => {
  const outra = await admin.collection('casas').create({ nome: PREFIXO + 'Outra', valor_ponto: 0.1 });
  await admin.collection('membros').create({
    nome: 'Vizinha', login: `${outra.id}_Vizinha`, casa: outra.id, papel: 'admin',
    email: 'viz-pl@x.pt', ...s('palavra-longa-9'), verified: true });
  const cVizinha = await telemovel('viz-pl@x.pt', 'palavra-longa-9');
  await recusado(() => cVizinha.collection('partilhas_lista').create({ casa: outra.id, lista: lista.id, criada_por: rita.id }));
  igual((await cVizinha.collection('partilhas_lista').getFullList()).length, 0);
});

resumo();
