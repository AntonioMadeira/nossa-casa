// Povoa uma casa de SIMULAÇÃO, o mais cheia e difícil possível — para se
// percorrer a app no navegador à procura de ecrãs que rebentem.
//
//   PB_URL=http://127.0.0.1:8096 node scripts/simular-casa.mjs
//   npm run simular:casa
//
// ── O que isto é, e o que NÃO é ──────────────────────────────────────────────
//
// Não é o `semear-simulacao.mjs`, que enche a casa que JÁ EXISTE no servidor.
// Isto cria uma casa própria, «Casa da Simulação», com cinco membros e as
// coleções todas cheias: três meses de despesas, sessenta linhas, títulos
// longos, caracteres que partem HTML, um filho com nome comprido, listas
// fechadas, um mês fechado, consultas com imagens em anexo, um PDF num
// contrato. Correr duas vezes deixa UMA casa: a anterior com o mesmo nome é
// apagada primeiro, pela ordem das relações.
//
// ⚠ RECUSA-SE a correr contra o servidor da casa a sério (porta 8095). Sai com
// código 2 e diz porquê. O alvo é o servidor de simulação, em 8096.
//
// Uma parte das escritas vai pela CAMADA DA APP (`src/sync.js`, com sessões de
// adulto e de criança), porque assim se testa o caminho que a app usa — as
// regras do servidor aplicam-se. O resto escreve-o o superutilizador, que é
// mais rápido e não precisa de sessão: o histórico, os meses fechados, as
// linhas confirmadas.
//
// As imagens dos anexos fabricam-se como no `simular-exportacao-saude.mjs`
// (pelo Chrome, a dizerem por escrito que são simulação); sem Chrome, desenha-se
// um PNG à mão com o `zlib`. Vivem em `.simulacao/`, ignorada pelo git.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { sair } from '../db/pocketbase/sair.mjs';

const raiz = path.resolve(import.meta.dirname, '..');
const modulo = (p) => import(pathToFileURL(path.join(raiz, p)).href);

// O andaime das provas traz o resolvedor de `./format` sem extensão, o `URL`
// do ambiente, o superutilizador e a memória de um telemóvel acabado de abrir.
const { URL, ligarComoAdmin, memoriaDeTelemovel, semRecusa, comId } = await modulo('db/pocketbase/provas.mjs');

const NOME = 'Casa da Simulação';

// ── O travão ────────────────────────────────────────────────────────────────
if (/:8095(\/|$)/.test(URL)) {
  console.error(`RECUSADO: ${URL} é o servidor da casa a sério (porta 8095).`);
  console.error('Este guião apaga e recria uma casa inteira. Aponte-o ao servidor de simulação:');
  console.error('  PB_URL=http://127.0.0.1:8096 node scripts/simular-casa.mjs');
  await sair(2);
}
try {
  const r = await fetch(`${URL.replace(/\/$/, '')}/api/health`);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
} catch (e) {
  console.error(`O servidor em ${URL} não responde (${e.message}). Nada foi escrito.`);
  await sair(1);
}

const admin = await ligarComoAdmin();
console.log(`Servidor: ${URL}`);

// ── Datas ───────────────────────────────────────────────────────────────────
// A data LOCAL, e não `toISOString()`: Portugal está uma hora à frente de UTC
// e o dia mudava durante a primeira hora (lição do `semear-simulacao.mjs`).
const pad = (n) => String(n).padStart(2, '0');
const local = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const HOJE = new Date();
const dia = (n) => { const d = new Date(HOJE); d.setDate(d.getDate() + n); return local(d); };
const iso = (ymd, hora = '00:00:00') => `${ymd} ${hora}.000Z`;
const chave = (ymd) => `d${ymd}`;
const dmy = (ymd) => `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}/${ymd.slice(0, 4)}`;
// O primeiro dia do mês `n` a contar deste, e um dia dentro dele (preso ao
// último dia do mês — e, no mês corrente, a hoje).
const primeiroDoMes = (n) => local(new Date(HOJE.getFullYear(), HOJE.getMonth() + n, 1));
const diaDoMes = (n, dd) => {
  const d = new Date(HOJE.getFullYear(), HOJE.getMonth() + n, 1);
  const ultimo = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(dd, ultimo, n === 0 ? HOJE.getDate() : 31));
  return local(d);
};
const aaaaMM = (ymd) => ymd.slice(0, 7);
// A semana corrente, de segunda a domingo.
const segunda = dia(-((HOJE.getDay() + 6) % 7));
const diaDaSemana = (i) => { const d = new Date(`${segunda}T12:00:00`); d.setDate(d.getDate() + i); return local(d); };
const r2 = (v) => Math.round(v * 100) / 100;

// ── Ficheiros fabricados ────────────────────────────────────────────────────
const saida = path.join(raiz, '.simulacao');
fs.mkdirSync(saida, { recursive: true });

const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome', '/usr/bin/chromium',
].find(p => fs.existsSync(p));

// Um PNG desenhado à mão: faixas de cor, sem dependências. É o que serve quando
// não há Chrome — e o que garante que o anexo é uma imagem a sério.
const crcTabela = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xFFFFFFFF;
  for (const b of buf) c = crcTabela[(c ^ b) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
};
const pngAMao = (largura, altura, semente) => {
  const bloco = (tipo, dados) => {
    const t = Buffer.from(tipo, 'ascii');
    const tam = Buffer.alloc(4); tam.writeUInt32BE(dados.length);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, dados])));
    return Buffer.concat([tam, t, dados, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(largura, 0); ihdr.writeUInt32BE(altura, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const linhas = [];
  for (let y = 0; y < altura; y++) {
    const l = Buffer.alloc(1 + largura * 3);
    for (let x = 0; x < largura; x++) {
      const faixa = Math.floor((x + y * semente) / 24) % 2;
      l[1 + x * 3] = faixa ? 40 + semente * 30 : 200 - y / 4;
      l[2 + x * 3] = 90 + (x / largura) * 120;
      l[3 + x * 3] = faixa ? 160 : 60 + semente * 40;
    }
    linhas.push(l);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    bloco('IHDR', ihdr), bloco('IDAT', zlib.deflateSync(Buffer.concat(linhas))), bloco('IEND', Buffer.alloc(0)),
  ]);
};

// Uma imagem de anexo, pelo Chrome quando há, senão à mão. Devolve o caminho.
const imagem = (nome, titulo, semente) => {
  const png = path.join(saida, `${nome}.png`);
  if (CHROME) {
    const html = path.join(saida, `${nome}.html`);
    fs.writeFileSync(html, `<!doctype html><html><body style="margin:0;width:800px;height:520px;background:linear-gradient(135deg,#dfe6ee,#5c6b7a 60%,#1f2833);font-family:Segoe UI,Arial;color:#f4f6f8">
<div style="position:absolute;left:0;right:0;top:48px;text-align:center;font-size:22px;letter-spacing:4px;opacity:.85">SIMULAÇÃO · ${titulo.toUpperCase()}</div>
<div style="position:absolute;left:120px;right:120px;top:200px;height:${90 + semente * 20}px;border:6px solid rgba(255,255,255,.5);border-radius:${30 + semente * 10}px"></div>
<div style="position:absolute;left:0;right:0;bottom:36px;text-align:center;font-size:16px;opacity:.7">imagem gerada para a casa de simulação · não é um documento real</div>
</body></html>`);
    spawnSync(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', '--window-size=800,520',
      `--screenshot=${png}`, pathToFileURL(html).href], { stdio: 'ignore' });
    if (fs.existsSync(png) && fs.statSync(png).size > 0) return png;
  }
  fs.writeFileSync(png, pngAMao(640, 400, semente));
  return png;
};
const blobDe = (caminho, mime) => new Blob([fs.readFileSync(caminho)], { type: mime });

// Um PDF mínimo e válido — uma página, uma frase — para o documento do contrato.
const pdfMinimo = (texto) => {
  const objetos = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    null,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  const fluxo = `BT /F1 18 Tf 72 770 Td (${texto.replace(/[()\\]/g, '')}) Tj ET`;
  objetos[3] = `<< /Length ${fluxo.length} >>\nstream\n${fluxo}\nendstream`;
  let corpo = '%PDF-1.4\n';
  const posicoes = [];
  objetos.forEach((o, i) => { posicoes.push(corpo.length); corpo += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = corpo.length;
  corpo += `xref\n0 ${objetos.length + 1}\n0000000000 65535 f \n`;
  for (const p of posicoes) corpo += `${String(p).padStart(10, '0')} 00000 n \n`;
  corpo += `trailer\n<< /Size ${objetos.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(corpo, 'latin1');
};

// ── Apagar a casa anterior, pela ordem das relações ─────────────────────────
// Do que aponta para o que é apontado; a casa vai no fim e leva os membros
// por cascata — apagá-los um a um tropeçava no hook «a casa ficaria sem
// administração».
const LIMPEZA = [
  'tomas_saude', 'alergias_saude', 'notas_saude', 'receitas_saude', 'decisoes_saude',
  'eventos', 'anexos', 'episodios_saude', 'especialidades', 'manutencoes', 'categorias_equip',
  'meta_movimentos', 'metas', 'partilhas_lista', 'acertos', 'transferencias',
  'artigos', 'listas_compras', 'lojas', 'seccoes', 'registo', 'meses', 'equipamentos',
  'cofre_movimentos', 'despesas', 'contas_fixas', 'contratos', 'trocas_tarefas',
  'ementa', 'pratos', 'objetivos_cofre', 'envelopes', 'tarefas_feitas', 'tarefas',
];
{
  const anteriores = (await admin.collection('casas').getFullList()).filter(c => c.nome === NOME);
  for (const c of anteriores) {
    let linhas = 0;
    for (const colecao of LIMPEZA) {
      const registos = await admin.collection(colecao).getFullList({ filter: `casa="${c.id}"` }).catch(() => []);
      for (const r of registos) { await admin.collection(colecao).delete(r.id).catch(() => {}); linhas++; }
    }
    const membros = await admin.collection('membros').getFullList({ filter: `casa="${c.id}"` });
    for (const m of membros) {
      const prefs = await admin.collection('preferencias').getFullList({ filter: `membro="${m.id}"` }).catch(() => []);
      for (const p of prefs) { await admin.collection('preferencias').delete(p.id).catch(() => {}); linhas++; }
    }
    await admin.collection('casas').delete(c.id);
    console.log(`Apagada a «${NOME}» anterior (${c.id}): ${linhas} linhas, ${membros.length} membros.`);
  }
}

// ── A casa e quem lá vive ───────────────────────────────────────────────────
const casa = await admin.collection('casas').create({
  nome: NOME, valor_ponto: 0.1, rendimento_mensal: 3200, dia_pagamento: 5,
  divide_meias: true, pontos_ligados: true, ementa_desligada: false,
});
console.log(`Casa «${NOME}»: ${casa.id}`);

// O avatar (`figura`, `avatar`) só existe onde o `db:campos` correu.
const camposMembro = new Set((await admin.collections.getOne('membros')).fields.map(f => f.name));
const membro = async ({ nome, papel, email, senha, pin, fem, cor, figura }) => {
  const p = papel === 'crianca' ? pin : senha;
  const m = await admin.collection('membros').create({
    nome, login: `${casa.id}_${nome}`, casa: casa.id, papel, verified: true, fem: !!fem, cor,
    password: p, passwordConfirm: p,
    ...(email ? { email } : {}),
    ...(camposMembro.has('figura') && figura ? { figura } : {}),
  });
  return { id: m.id, nome, papel, login: m.login, email, senha, pin };
};
const rita  = await membro({ nome: 'Rita',  papel: 'admin',   email: 'rita@simulacao.pt',  senha: 'simulacao-rita-1',  fem: true, cor: '#8B4EE0', figura: 'cachos' });
const tomas = await membro({ nome: 'Tomás', papel: 'adulto',  email: 'tomas@simulacao.pt', senha: 'simulacao-tomas-2', cor: '#13ADB3', figura: 'oculos' });
const leo   = await membro({ nome: 'Léo',   papel: 'crianca', pin: '135790', cor: '#4A8FE0', figura: 'raposa' });
const mia   = await membro({ nome: 'Mia',   papel: 'crianca', pin: '246813', fem: true, cor: '#E0568B', figura: 'coruja' });
const max   = await membro({ nome: 'Maximiliano-Afonso', papel: 'crianca', pin: '975318', cor: '#2E9E5B', figura: 'foguete' });
const TODOS = [rita, tomas, leo, mia, max];
console.log(`  5 membros${camposMembro.has('figura') ? ', com figura' : ' (sem campo de avatar neste servidor)'}`);

// ── A sessão da APP, trocada de pessoa para pessoa ──────────────────────────
const { configurar, auth } = await modulo('src/pocketbase.js');
const sync = await modulo('src/sync.js');
configurar({ url: URL, storage: memoriaDeTelemovel() });
let sessaoAtual = null;
const como = async (m) => {
  if (sessaoAtual === m.id) return;
  if (m.papel === 'crianca') await auth.entrarCrianca(m.login, m.pin);
  else await auth.entrarAdulto(m.email, m.senha);
  sessaoAtual = m.id;
};
const C = casa.id;

// Preferências: esquemas todos diferentes, o Tomás em escuro. Pela app, como
// cada um — a regra só deixa cada membro escrever as suas.
const PREFS = [[rita, 1, 'claro'], [tomas, 2, 'escuro'], [leo, 0, 'sistema'], [mia, 4, 'claro'], [max, 5, 'claro']];
for (const [m, esquemaCor, aspeto] of PREFS) {
  await como(m);
  await sync.preferenciasDoMembro({ membro: m.id, esquemaCor, aspeto, resumoAtivo: m === rita, resumoHora: '20:30', avisoPrazoDias: 2 });
}
console.log('  5 preferências (esquemas 1, 2, 0, 4, 5; Tomás em escuro)');

// ── As listas da casa ───────────────────────────────────────────────────────
await como(rita);
const lista = async (chaveDaLoja, nomes) => {
  const out = {};
  for (const nome of nomes) out[nome] = (await comId(sync.acrescentarNaLista(chaveDaLoja, { casa: C, nome }), nome)).id;
  return out;
};
const lojas = await lista('stores', ['Continente de Belém', 'Pingo Doce do Restelo', 'Mercado de Algés & Feira da Fruta']);
const categorias = await lista('equipCats', ['Eletrodomésticos', 'Aquecimento', 'Informática', 'Jardim', 'Outros']);
const especialidades = await lista('specialities', ['Medicina geral', 'Pediatria', 'Dentista', 'Oftalmologia', 'Alergologia', 'Ortodontia']);
console.log(`  ${Object.keys(lojas).length} lojas, ${Object.keys(categorias).length} categorias, ${Object.keys(especialidades).length} especialidades`);

// ── O orçamento ─────────────────────────────────────────────────────────────
const ENVELOPES = [
  ['Mercearia', 550, '#2E9E5B'], ['Casa & contas', 1180, ''], ['Transportes', 240, ''],
  ['Lazer', 180, '#E0568B'], ['Saúde', 150, ''], ['Educação, livros e material escolar', 120, ''],
  ['Imprevistos', 0, ''],
];
const env = {};
for (const [nome, limite, cor] of ENVELOPES) {
  env[nome] = (await comId(sync.criarEnvelope({ casa: C, nome, limite, cor }), nome)).id;
}
console.log(`  ${ENVELOPES.length} envelopes (um com limite 0)`);

// Três meses: dois fechados, o corrente aberto. Os limites são `nome → limite`.
const limitesDe = (k) => Object.fromEntries(ENVELOPES.map(([n, l]) => [n, l ? l + k * 10 : 0]));
for (const [n, rendimento, fechado] of [[-2, 3100, true], [-1, 3200, true], [0, 3200, false]]) {
  await admin.collection('meses').create({
    casa: C, mes: iso(primeiroDoMes(n)), rendimento, limites: limitesDe(n),
    ...(fechado ? { fechado_em: iso(primeiroDoMes(n + 1)) } : {}),
  });
}
console.log('  3 meses (dois fechados, o corrente aberto)');

// As contas fixas — a definição, pela app.
const CONTAS = [
  ['Renda', 850, 1, 'Casa & contas', tomas], ['EDP · eletricidade', 78.4, 15, 'Casa & contas', rita],
  ['Internet e televisão', 39.99, 20, 'Casa & contas', tomas], ['Água', 31.2, 28, 'Casa & contas', rita],
  ['Ginásio', 34.9, 5, 'Lazer', rita],
];
const contas = {};
for (const [nome, valor, d, e, quem] of CONTAS) {
  contas[nome] = (await comId(sync.contaFixaDaCasa({ casa: C, nome, valor, dia: d, envelope: env[e], quemPaga: quem.id }), nome)).id;
}

// ── Despesas: ~60 em três meses ─────────────────────────────────────────────
// O molde repete-se nos três meses, com os valores a mexer um pouco; o mês
// corrente vai pela FILA da app (como a Rita), os fechados pelo superutilizador.
const MOLDE = [
  ['Mercearia', 128.4, 'Compras da semana · Continente', 2, tomas, true],
  ['Mercearia', 96.15, 'Compras · Pingo Doce', 6, rita, true],
  ['Mercearia', 74.9, 'Compras · Continente', 9, tomas, true],
  ['Mercearia', 41.2, 'Talho e peixaria', 12, tomas, true],
  ['Mercearia', 18.6, 'Pão, leite e fruta', 13, rita, true],
  ['Mercearia', 22.35, 'Mercado de Algés & Feira da Fruta', 4, rita, true],
  ['Casa & contas', 24.99, 'Gás', 8, tomas, true],
  ['Casa & contas', 180, 'Condomínio', 3, rita, true],
  ['Transportes', 45, 'Passe do Léo', 4, tomas, false],
  ['Transportes', 62.3, 'Combustível', 7, tomas, true],
  ['Transportes', 12, 'Estacionamento junto ao hospital', 11, rita, false],
  ['Lazer', 28, 'Cinema em família', 10, rita, true],
  ['Lazer', 46.5, 'Almoço fora · "A Tasquinha"', 6, tomas, true],
  ['Saúde', 35, 'Consulta da Mia', 9, tomas, true],
  ['Saúde', 18.45, 'Farmácia', 12, rita, true],
  ['Educação, livros e material escolar', 22.5, 'Material escolar', 5, rita, true],
  ['Educação, livros e material escolar', 15.9, 'Livros de leitura obrigatória do 5.º ano', 8, tomas, false],
];
let nDespesas = 0;
for (const n of [-2, -1]) {
  const mes = aaaaMM(primeiroDoMes(n));
  for (const [i, [e, valor, descricao, dd, quem, meias]] of MOLDE.entries()) {
    await admin.collection('despesas').create({
      casa: C, envelope: env[e], valor: r2(valor * (1 + (n + 2) * 0.06)), descricao, data: iso(diaDoMes(n, dd)),
      pagador: quem.id, divide_meias: meias, idem_key: `sim:despesa:${mes}:${i}`,
    });
    nDespesas++;
  }
  // As contas fixas pagas nesses meses, com a chave que a app usa.
  for (const [nome, valor, dd, e, quem] of CONTAS) {
    await admin.collection('despesas').create({
      casa: C, envelope: env[e], valor, descricao: nome, data: iso(diaDoMes(n, dd)), pagador: quem.id,
      divide_meias: true, conta_fixa: contas[nome], idem_key: `conta-fixa:${contas[nome]}:${mes}`,
    });
    nDespesas++;
  }
}
await como(rita);
for (const [e, valor, descricao, dd, quem, meias] of MOLDE) {
  if (dd > HOJE.getDate()) continue;   // ainda não aconteceu este mês
  await semRecusa(sync.despesa({ casa: C, envelope: env[e], valor, pagador: quem.id, descricao, data: diaDoMes(0, dd), divideMeias: meias }), descricao);
  nDespesas++;
}
// As difíceis: cêntimos, milhares, «&», «<», aspas, uma descrição comprida.
const DIFICEIS = [
  ['Imprevistos', 1234.56, 'Reparação da caldeira & substituição da válvula <urgente> — "orçamento n.º 2" da Junkers, inclui deslocação e mão de obra', 3, tomas, true],
  ['Lazer', 0.05, 'Saco <reutilizável> & "porta-moedas"', 4, rita, false],
  ['Mercearia', 7.77, 'Fruta a granel: maçãs, pêras, uvas, bananas, kiwis, laranjas, tangerinas, ameixas, figos e um melão que não coube no saco', 5, rita, true],
];
for (const [e, valor, descricao, dd, quem, meias] of DIFICEIS) {
  await semRecusa(sync.despesa({ casa: C, envelope: env[e], valor, pagador: quem.id, descricao, data: diaDoMes(0, Math.min(dd, HOJE.getDate())), divideMeias: meias }), descricao);
  nDespesas++;
}
// Duas contas fixas pagas ESTE mês, pela app, com a chave do mês.
for (const nome of ['Renda', 'Ginásio']) {
  const c = CONTAS.find(x => x[0] === nome);
  await semRecusa(sync.despesa({ casa: C, envelope: env[c[3]], valor: c[1], pagador: c[4].id, descricao: nome,
    data: diaDoMes(0, c[2]), divideMeias: true, contaFixa: contas[nome], idemKey: `conta-fixa:${contas[nome]}:${aaaaMM(primeiroDoMes(0))}` }), nome);
  nDespesas++;
}
// Uma anulada: a linha com `anula_id` é a que saiu das somas; aponta à que a substituiu.
{
  const certa = await admin.collection('despesas').create({ casa: C, envelope: env.Transportes, valor: 58.7, descricao: 'Combustível (corrigida)', data: iso(diaDoMes(0, 2)), pagador: rita.id, divide_meias: true, idem_key: 'sim:despesa:certa' });
  await admin.collection('despesas').create({ casa: C, envelope: env.Transportes, valor: 85.7, descricao: 'Combustível (valor trocado — anulada)', data: iso(diaDoMes(0, 2)), pagador: rita.id, divide_meias: true, anula_id: certa.id, idem_key: 'sim:despesa:anulada' });
  nDespesas += 2;
}
console.log(`  ${nDespesas} despesas em três meses (uma anulada, duas contas fixas pagas este mês)`);

// Transferências em cada mês; acertos entre os adultos nos dois fechados.
for (const n of [-2, -1]) {
  await admin.collection('transferencias').create({ casa: C, de_envelope: env.Lazer, para_envelope: env.Mercearia, valor: 40, mes: iso(primeiroDoMes(n)), por: rita.id, idem_key: `sim:transf:${n}:a` });
  await admin.collection('transferencias').create({ casa: C, de_envelope: env['Educação, livros e material escolar'], para_envelope: env['Saúde'], valor: 25.5, mes: iso(primeiroDoMes(n)), por: rita.id, idem_key: `sim:transf:${n}:b` });
}
await semRecusa(sync.transferenciaEntreEnvelopes({ casa: C, de: env.Transportes, para: env.Mercearia, valor: 60, mes: primeiroDoMes(0), por: rita.id }), 'transferência');
await admin.collection('acertos').create({ casa: C, de_membro: tomas.id, para_membro: rita.id, valor: 45, data: iso(diaDoMes(-2, 28)), idem_key: 'sim:acerto:-2' });
await admin.collection('acertos').create({ casa: C, de_membro: rita.id, para_membro: tomas.id, valor: 30.25, data: iso(diaDoMes(-1, 27)), idem_key: 'sim:acerto:-1' });
console.log('  5 transferências, 2 acertos');

// As metas, com movimentos — um negativo, que é como se corrige.
const ferias = (await comId(sync.criarMeta({ casa: C, nome: 'Férias no Algarve com a família toda', alvo: 1800, quando: 'Julho de 2027' }), 'meta')).id;
const sofa = (await comId(sync.criarMeta({ casa: C, nome: 'Sofá novo', alvo: 900, quando: 'Dezembro' }), 'meta')).id;
for (const [meta, valor, motivo, d] of [[ferias, 250, 'Poupança de julho', diaDoMes(-2, 30)], [ferias, 250, 'Poupança de agosto', diaDoMes(-1, 30)], [ferias, 120.5, 'Subsídio', dia(-4)], [sofa, 300, 'Arranque', diaDoMes(-1, 15)]]) {
  await semRecusa(sync.reforcarMeta({ casa: C, meta, valor, motivo, por: rita.id, data: iso(d) }), motivo);
}
await admin.collection('meta_movimentos').create({ casa: C, meta: sofa, valor: -50, motivo: 'Correção: lançado a dobrar', por: rita.id, data: iso(dia(-2)), idem_key: 'sim:meta:correcao' });
console.log('  2 metas, 5 movimentos');

// ── Tarefas ─────────────────────────────────────────────────────────────────
const TAREFAS = [
  ['Levar o lixo', leo, 'Todos os dias', 2, 1, null],
  ['Pôr a mesa', mia, 'Todos os dias', 1, 1, null],
  ['Fazer a cama', max, 'Todos os dias', 1, 0, null],
  ['Regar as plantas', mia, 'Dias de semana', 2, 1, null],
  ['Arrumar o quarto', leo, 'Dias de semana', 3, 1, null],
  ['Dar de comer ao gato', max, 'Todos os dias', 2, 2, null],
  ['Arrumar a garagem, separar o lixo reciclável e levar as garrafas ao vidrão da esquina', tomas, 'Uma vez', 0, 2, dia(5)],
  ['Entregar os livros na biblioteca', leo, 'Uma vez', 5, 2, dia(-3)],
  ['Marcar revisão do carro', rita, 'Uma vez', 0, 1, dia(0)],
  ['Pagar o condomínio', tomas, 'Uma vez', 0, 2, dia(2)],
  ['Estudar para o teste de Matemática', mia, 'Uma vez', 4, 1, dia(1)],
  ['Comprar filtros para a máquina do café', null, 'Uma vez', 0, 0, null],
  ['Passear o cão', leo, 'Todos os dias', 1, 0, null],
  ['Trocar a lâmpada da despensa & verificar o "quadro" <elétrico>', rita, 'Uma vez', 0, 0, dia(12)],
];
const tarefa = {};
for (const [titulo, quem, recorrencia, pontos, urgencia, prazo] of TAREFAS) {
  tarefa[titulo] = (await comId(sync.tarefaDaCasa({ casa: C, titulo, atribuidoA: quem ? quem.id : null, recorrencia, pontos, urgencia, prazo: prazo ? chave(prazo) : null }), titulo)).id;
}
// A de hoje tem HORA — a app só escreve o dia, o superutilizador acerta-a.
await admin.collection('tarefas').update(tarefa['Marcar revisão do carro'], { prazo: iso(dia(0), '18:00:00') });
// Postos dados à mão, dentro do grupo de urgência 1.
await sync.alterarTarefa(tarefa['Pôr a mesa'], { posto: 1 });
await sync.alterarTarefa(tarefa['Levar o lixo'], { posto: 2 });
console.log(`  ${TAREFAS.length} tarefas`);

// O histórico: ~40 marcações confirmadas nos últimos 30 dias.
const FEITAS = [
  ['Levar o lixo', leo, [1, 3, 5, 7, 9, 11, 13, 15, 17, 19, 21, 23, 25, 27, 29]],
  ['Pôr a mesa', mia, [1, 4, 7, 10, 13, 16, 19, 22, 25, 28]],
  ['Fazer a cama', max, [1, 5, 9, 13, 17, 21, 25]],
  ['Dar de comer ao gato', max, [2, 5, 9, 14]],
  ['Arrumar o quarto', leo, [3, 10, 17]],
  ['Regar as plantas', mia, [4, 11]],
];
let nFeitas = 0;
for (const [titulo, quem, dias] of FEITAS) {
  for (const n of dias) {
    await admin.collection('tarefas_feitas').create({
      casa: C, tarefa: tarefa[titulo], data: iso(dia(-n)), marcada_por: quem.id,
      confirmada_por: (n % 2 ? rita : tomas).id, confirmada_em: iso(dia(-n), '20:00:00'),
    });
    nFeitas++;
  }
}
// Três por confirmar, marcadas HOJE pela própria criança, pela app.
for (const [titulo, quem] of [['Levar o lixo', leo], ['Pôr a mesa', mia], ['Fazer a cama', max]]) {
  await como(quem);
  await comId(sync.marcarTarefaFeita({ casa: C, tarefa: tarefa[titulo], dia: chave(dia(0)), marcadaPor: quem.id }), titulo);
  nFeitas++;
}
console.log(`  ${nFeitas} marcações (3 por confirmar, de hoje)`);

// As trocas: uma por aceitar (Léo → Mia) e uma aceite (Mia → Maximiliano-Afonso).
await como(leo);
await comId(sync.trocaDeTarefas({ casa: C, dia: chave(dia(0)), tarefaDe: tarefa['Passear o cão'], tarefaPara: tarefa['Regar as plantas'], propostaPor: leo.id }), 'troca Léo→Mia');
await como(mia);
const trocaAceite = (await comId(sync.trocaDeTarefas({ casa: C, dia: chave(dia(0)), tarefaDe: tarefa['Pôr a mesa'], tarefaPara: tarefa['Dar de comer ao gato'], propostaPor: mia.id }), 'troca Mia→Max')).id;
await como(max);
await sync.aceitarTrocaDeTarefas(trocaAceite, max.id);
console.log('  2 trocas de tarefas (uma por aceitar, uma aceite)');

// ── Cofres ──────────────────────────────────────────────────────────────────
// Pontos ganhos: Léo 15×2+3×3 = 39, Mia 10×1+2×2 = 14, Max 7×1+4×2 = 15.
// Paga-se MENOS do que o ganho, para haver «por pagar».
await como(rita);
const COFRE = [
  [leo, 'semanada', 2, 'Semanada · 20 pontos', dia(-7), 20], [leo, 'bonus', 1.5, 'Ajudou a lavar o carro', dia(-3), 0],
  [leo, 'retirada', -4, 'Cromos', dia(-1), 0],
  [mia, 'semanada', 0.8, 'Semanada · 8 pontos', dia(-7), 8], [mia, 'retirada', -2.5, 'Comprou um caderno', dia(-2), 0],
  [mia, 'bonus', 5, 'Anos da avó', dia(-20), 0],
  [max, 'semanada', 0.5, 'Semanada · 5 pontos', dia(-7), 5], [max, 'bonus', 2, 'Nota alta a Português', dia(-9), 0],
];
for (const [quem, tipo, valor, motivo, d, pontos] of COFRE) {
  await semRecusa(sync.movimentoDeCofre({ casa: C, membro: quem.id, tipo, valor, motivo, data: iso(d), autorizadoPor: rita.id, pontos }), motivo);
}
await como(leo);
await sync.definirObjetivoDoCofre({ casa: C, membro: leo.id, nome: 'Bicicleta de montanha com suspensão', alvo: 180 });
await como(rita);
await sync.definirObjetivoDoCofre({ casa: C, membro: mia.id, nome: 'Livros da Mia', alvo: 25 });
console.log(`  ${COFRE.length} movimentos de cofre, 2 objetivos`);

// ── Compras ─────────────────────────────────────────────────────────────────
const SECCOES = ['Frutas & Legumes', 'Frescos', 'Talho e peixaria', 'Mercearia', 'Congelados', 'Higiene e limpeza', 'Outros', 'constructor'];
const sec = {};
for (const [i, nome] of SECCOES.entries()) sec[nome] = (await comId(sync.criarSeccao({ casa: C, nome, posto: i + 1 }), nome)).id;

// Cinco idas fechadas, com total e artigos confirmados — o histórico.
const FECHADAS = [
  ['Continente de Belém', tomas, 3, 62.4, [['Leite', 'Frescos', 4.2], ['Maçãs', 'Frutas & Legumes', 3.1], ['Azeite', 'Mercearia', 8.99], ['Detergente', 'Higiene e limpeza', 6.5]]],
  ['Pingo Doce do Restelo', rita, 10, 118.75, [['Frango', 'Talho e peixaria', 7.8], ['Arroz', 'Mercearia', 1.99], ['Iogurtes', 'Frescos', 3.4]]],
  ['Mercado de Algés & Feira da Fruta', rita, 17, 24.3, [['Pêras', 'Frutas & Legumes', 2.9], ['Alface', 'Frutas & Legumes', 0.9], ['Cenouras', 'Frutas & Legumes', 1.2]]],
  ['Continente de Belém', tomas, 24, 201.9, [['Fraldas', 'Higiene e limpeza', 24.9], ['Café', 'Mercearia', 6.2], ['Peixe congelado', 'Congelados', 9.9], ['Ovos', 'Frescos', 2.6]]],
  ['Pingo Doce do Restelo', rita, 38, 88.1, [['Massa', 'Mercearia', 1.1], ['Queijo', 'Frescos', 5.4]]],
];
let nArtigos = 0;
for (const [loja, quem, atras, total, artigos] of FECHADAS) {
  const l = await admin.collection('listas_compras').create({ casa: C, loja: lojas[loja], comprador: quem.id, planeada_para: iso(dia(-atras), '10:00:00'), fechada_em: iso(dia(-atras), '11:30:00'), total });
  for (const [rotulo, corredor, preco] of artigos) {
    await admin.collection('artigos').create({ casa: C, lista: l.id, rotulo, corredor: sec[corredor], pedido_por: quem.id, estado: 'confirmado', preco_real: preco, estimativa: r2(preco * 0.9), habitual: true });
    nArtigos++;
  }
}

// A ida ABERTA, pela app, com 28 artigos difíceis.
await como(rita);
const aberta = (await comId(sync.listaDeCompras({ casa: C, loja: lojas['Pingo Doce do Restelo'], comprador: tomas.id, planeadaPara: chave(dia(1)), hora: '10:30' }), 'lista aberta')).id;
// [rótulo, corredor, quem pediu, estimativa, habitual, estado final, visibilidade]
const ABERTOS = [
  ['Leite meio-gordo', 'Frescos', rita, 4.2, true, 'open'], ['Ovos', 'Frescos', tomas, 2.6, true, 'done'],
  ['Iogurtes naturais', 'Frescos', mia, 3.4, false, 'open'], ['Manteiga', 'Frescos', rita, 2.3, true, 'sem-stock'],
  ['Bananas', 'Frutas & Legumes', leo, 1.8, true, 'done'], ['Maçãs Golden', 'Frutas & Legumes', rita, 3.1, true, 'open'],
  ['Alface & rúcula <fresca>', 'Frutas & Legumes', max, 1.5, false, 'open'], ['Tomate chucha', 'Frutas & Legumes', rita, 2.2, false, 'done'],
  ['Frango inteiro do campo, de preferência o da marca que a avó gosta', 'Talho e peixaria', tomas, 8.9, false, 'open'],
  ['Pescada', 'Talho e peixaria', rita, 9.5, false, 'sem-stock'],
  ['Arroz carolino', 'Mercearia', rita, 1.99, true, 'open'], ['Massa esparguete', 'Mercearia', leo, 1.1, true, 'done'],
  ['Azeite virgem extra 0,5 l', 'Mercearia', tomas, 8.99, true, 'open'], ['Café em grão', 'Mercearia', tomas, 6.2, true, 'open'],
  ['Atum em lata ×6', 'Mercearia', rita, 5.4, false, 'open'], ['Bolachas <b>com chocolate</b>', 'Mercearia', mia, 2.1, false, 'open'],
  ['Ervilhas', 'Congelados', rita, 1.6, false, 'open'], ['Gelado de baunilha', 'Congelados', max, 3.9, false, 'open'],
  ['Papel higiénico ×12', 'Higiene e limpeza', tomas, 6.5, true, 'open'], ['Detergente da roupa', 'Higiene e limpeza', rita, 7.2, true, 'done'],
  ['Pasta de dentes para crianças', 'Higiene e limpeza', mia, 2.8, false, 'open'],
  ['Pilhas AA', 'Outros', tomas, 4.5, false, 'open'], ['Velas de aniversário', 'Outros', rita, 1.2, false, 'open'],
  ['Cadernos pautados', 'constructor', leo, 3.0, false, 'open'],
  ['Prenda de anos do Léo · jogo de construção', null, rita, 34.99, false, 'open', 'adultos'],
  ['Sal grosso', null, rita, 0.6, true, 'open'], ['Fermento', null, tomas, 0.45, false, 'open'],
  ['Água com gás 1,5 l ×6', null, max, 2.7, false, 'done'],
];
const artigoAberto = {};
for (const [rotulo, corredor, quem, estimativa, habitual, , visibilidade] of ABERTOS) {
  await como(quem);   // as crianças também pedem — a regra deixa
  artigoAberto[rotulo] = (await comId(sync.artigoDeCompras({ casa: C, lista: aberta, rotulo, corredor: corredor ? sec[corredor] : null, pedidoPor: quem.id, habitual, estimativa, visibilidade }), rotulo)).id;
  nArtigos++;
}
await como(tomas);
for (const [rotulo, , , estimativa, , estado] of ABERTOS) {
  if (estado === 'open') continue;
  await sync.marcarArtigo(artigoAberto[rotulo], estado, estado === 'done' ? r2(estimativa * 1.08) : undefined);
}
// Postos à mão num corredor: a ordem em que se anda na Mercearia.
await sync.reordenarArtigos(['Café em grão', 'Azeite virgem extra 0,5 l', 'Arroz carolino', 'Massa esparguete', 'Atum em lata ×6', 'Bolachas <b>com chocolate</b>'].map(r => artigoAberto[r]));
console.log(`  ${SECCOES.length} secções, ${FECHADAS.length} idas fechadas, 1 aberta · ${nArtigos} artigos`);

// A partilha da lista, pela app, como a Rita.
await como(rita);
const partilha = await sync.partilharLista({ casa: C, lista: aberta, criadaPor: rita.id });
console.log(`  partilha: ${partilha.url}`);

// ── A ementa ────────────────────────────────────────────────────────────────
const PRATOS = [
  ['Massa à bolonhesa', [['Massa esparguete', 'Mercearia'], ['Carne picada', 'Talho e peixaria'], ['Tomate chucha', 'Frutas & Legumes'], ['Cebola', 'Frutas & Legumes']]],
  ['Frango assado com batatas', [['Frango inteiro', 'Talho e peixaria'], ['Batatas', 'Frutas & Legumes'], ['Limão', 'Frutas & Legumes']]],
  ['Sopa de legumes & pão', [['Cenouras', 'Frutas & Legumes'], ['Courgette', 'Frutas & Legumes'], ['Pão', 'Frescos']]],
  ['Pescada cozida com tudo', [['Pescada', 'Talho e peixaria'], ['Ovos', 'Frescos'], ['Batatas', 'Frutas & Legumes'], ['Grelos', 'Frutas & Legumes']]],
  ['Omelete de queijo e fiambre com salada de alface, tomate e cenoura ralada', [['Ovos', 'Frescos'], ['Queijo', 'Frescos'], ['Fiambre', 'Frescos'], ['Alface', 'Frutas & Legumes']]],
  ['Pizza caseira', [['Farinha', 'Mercearia'], ['Fermento', null], ['Mozarela', 'Frescos'], ['Polpa de tomate', 'Mercearia']]],
];
const prato = {};
for (const [nome, ingredientes] of PRATOS) {
  prato[nome] = (await comId(sync.pratoDaCasa({ casa: C, nome, ingredientes: ingredientes.map(([rotulo, s]) => ({ rotulo, s })) }), nome)).id;
}
for (const [i, nome] of [[0, 'Massa à bolonhesa'], [1, 'Sopa de legumes & pão'], [2, 'Frango assado com batatas'], [4, 'Omelete de queijo e fiambre com salada de alface, tomate e cenoura ralada'], [6, 'Pizza caseira']]) {
  await sync.jantarDoDia({ casa: C, dia: chave(diaDaSemana(i)), prato: prato[nome] });
}
console.log(`  ${PRATOS.length} pratos, 5 jantares esta semana`);

// ── Equipamentos, manutenções e contratos ───────────────────────────────────
await como(tomas);
const EQUIP = [
  ['Máquina de lavar roupa', 'Eletrodomésticos', -700, 400, 'Worten', 449],
  ['Frigorífico', 'Eletrodomésticos', -1100, 12, 'Worten', 899],                    // expira em 12 dias
  ['Caldeira', 'Aquecimento', -1500, -730, 'Junkers', 1200],                        // fora há 2 anos
  ['Portátil da escola', 'Informática', -200, 530, 'FNAC', 699],
  ['Máquina de lavar e secar roupa com bomba de calor, 9 kg, classe A+++ (a da garagem)', 'Eletrodomésticos', -30, 1065, 'MediaMarkt', 1299.99],
  ['Corta-relva', 'Jardim', -400, -35, 'Leroy Merlin', 189],
  ['Televisão da sala', 'Eletrodomésticos', -900, 195, 'Worten', 650],
  ['Aspirador robô', 'Outros', -60, 670, 'Amazon', 279.5],
  ['Impressora', 'Informática', -1300, -570, 'Staples', 99],
];
const equip = {};
for (const [nome, categoria, comprado, garantia, loja, preco] of EQUIP) {
  equip[nome] = (await comId(sync.equipamentoDaCasa({ casa: C, nome, categoria, compradoEm: dmy(dia(comprado)), loja, preco, garantiaAte: dmy(dia(garantia)),
    ...(nome === 'Caldeira' ? { manutencao: 'Revisão anual', manutencaoAte: dmy(dia(20)) } : {}) }), nome)).id;
}
await admin.collection('manutencoes').create({ casa: C, equipamento: equip['Caldeira'], descricao: 'Revisão anual obrigatória', a_fazer_ate: iso(dia(20)) });
await admin.collection('manutencoes').create({ casa: C, equipamento: equip['Aspirador robô'], descricao: 'Trocar o filtro HEPA', a_fazer_ate: iso(dia(45)) });
await admin.collection('manutencoes').create({ casa: C, equipamento: equip['Máquina de lavar roupa'], descricao: 'Limpeza do filtro da bomba', a_fazer_ate: iso(dia(-32)), feita_em: iso(dia(-30)) });

await como(rita);
const CONTRATOS = [
  ['Seguro do carro', 'Fidelidade', 8, null, tomas],
  ['Inspeção periódica do carro', 'IPO Alcântara', -3, null, tomas],
  ['Internet, TV e telemóveis', 'MEO', 120, 300, rita],
  ['Seguro multirriscos da casa', 'Ageas', 200, null, rita],
];
const contrato = {};
for (const [nome, fornecedor, renova, fidelizacao, quem] of CONTRATOS) {
  contrato[nome] = (await comId(sync.contratoDaCasa({ casa: C, nome, fornecedor, renovaEm: dmy(dia(renova)), fidelizacaoAte: fidelizacao ? dmy(dia(fidelizacao)) : '', responsavel: quem.id }), nome)).id;
}
await sync.documentoDoContrato(contrato['Seguro multirriscos da casa'], {
  blob: new Blob([pdfMinimo('Apolice de simulacao - Nossa Casa - nao e um documento real')], { type: 'application/pdf' }),
  nome: 'apolice-simulacao.pdf', mime: 'application/pdf',
});
console.log(`  ${EQUIP.length} equipamentos, 3 manutenções, ${CONTRATOS.length} contratos (um com PDF)`);

// ── Saúde ───────────────────────────────────────────────────────────────────
// Pela app: as regras do servidor aplicam-se, e o travão de casa deixa passar
// porque o servidor vive em 127.0.0.1.
const consulta = async ({ membro: m, especialidade, medico, d, hora, notas }) =>
  (await comId(sync.episodioDeSaude({ casa: C, membro: m.id, especialidade, medico, dia: d, hora, notas }), `${m.nome} · ${especialidade}`)).id;
await como(rita);
const ep = {
  leoPediatria: await consulta({ membro: leo, especialidade: 'Pediatria', medico: 'Dr.ª Neves', d: dia(-40), hora: '09:30', notas: 'Consulta de rotina. Peso e altura no percentil habitual.' }),
  leoOftalmo: await consulta({ membro: leo, especialidade: 'Oftalmologia', medico: 'Dr. Sequeira', d: dia(12), hora: '15:00', notas: '' }),
  miaDentista: await consulta({ membro: mia, especialidade: 'Dentista', medico: 'Dr. Cardoso', d: dia(0), hora: '16:30', notas: 'Revisão semestral & ajuste do aparelho.' }),
  miaPediatria: await consulta({ membro: mia, especialidade: 'Pediatria', medico: 'Dr.ª Neves', d: dia(-100), hora: '10:00', notas: '' }),
  maxGeral: await consulta({ membro: max, especialidade: 'Medicina geral', medico: 'Dr.ª Pinto', d: dia(-7), hora: '11:00', notas: 'Rinite. Pedido de consulta de alergologia.' }),
  maxAlergo: await consulta({ membro: max, especialidade: 'Alergologia', medico: 'Dr. Baptista', d: dia(30), hora: '', notas: '' }),
  rita: await consulta({ membro: rita, especialidade: 'Medicina geral', medico: 'Dr.ª Pinto', d: dia(-20), hora: '08:45', notas: 'Análises pedidas. Só eu vejo isto.' }),
};
await como(tomas);
ep.tomas = await consulta({ membro: tomas, especialidade: 'Dentista', medico: 'Dr. Cardoso', d: dia(9), hora: '18:00', notas: 'Destartarização.' });

// Anexos com imagem (3 + 2) e um sem ficheiro.
await como(rita);
const ANEXOS = [
  [ep.leoPediatria, 'Relatório', 'Relatório da consulta de pediatria', 'relatorio-pediatria', 1],
  [ep.leoPediatria, 'Exame', 'Boletim de vacinas · página atualizada', 'boletim-vacinas', 2],
  [ep.leoPediatria, 'Exame', 'Análises ao sangue · resultado', 'analises', 3],
  [ep.miaDentista, 'Exame', 'Radiografia panorâmica', 'radiografia', 4],
  [ep.miaDentista, 'Relatório', 'Plano ortodôntico', 'plano-ortodontico', 5],
];
for (const [episodio, tipo, titulo, ficheiro, semente] of ANEXOS) {
  await sync.anexoDeSaude({ casa: C, episodio, tipo, titulo, blob: blobDe(imagem(`sim-${ficheiro}`, titulo, semente), 'image/png'), nome: `${ficheiro}.png`, mime: 'image/png' });
}
await sync.anexoDeSaude({ casa: C, episodio: ep.rita, tipo: 'Receita', titulo: 'Receita de ferro (sem fotografia)' });

// Receitas com plano de tomas, e as tomas de hoje numa delas.
const xarope = (await comId(sync.receitaDeSaude({ casa: C, episodio: ep.maxGeral, nome: 'Anti-histamínico infantil', dose: '5 ml', quantidade: '1', unidade: 'frasco', expiraEm: iso(dia(20)), decisao: 'comprar', frequencia: 2, duracaoDias: 10, caixa: 30 }), 'receita')).id;
await comId(sync.receitaDeSaude({ casa: C, episodio: ep.leoPediatria, nome: 'Paracetamol infantil', dose: '250 mg', quantidade: '2', unidade: 'caixa', expiraEm: iso(dia(-5)), decisao: 'já tem' }), 'receita');
await comId(sync.receitaDeSaude({ casa: C, episodio: ep.miaDentista, nome: 'Elixir com flúor', dose: 'bochechar à noite', quantidade: '1', unidade: 'frasco', expiraEm: iso(dia(60)), frequencia: 1, duracaoDias: 30, caixa: 30 }), 'receita');
await comId(sync.receitaDeSaude({ casa: C, episodio: ep.rita, nome: 'Ferro', dose: '1 comprimido ao pequeno-almoço', quantidade: '3', unidade: 'caixa', expiraEm: iso(dia(90)), frequencia: 1, duracaoDias: 90, caixa: 30 }), 'receita');
for (const h of ['08:00', '14:00']) {
  await comId(sync.tomaDeSaude({ casa: C, receita: xarope, quando: `${dia(0)}T${h}:00`, por: rita.id }), 'toma');
}
// Alergias (uma grave), notas de dois autores, duas decisões.
await comId(sync.alergiaDeSaude({ casa: C, membro: max.id, nome: 'Amendoim', gravidade: 'grave', nota: 'Leva caneta de adrenalina na mochila. Avisar a escola & a avó.' }), 'alergia');
await comId(sync.alergiaDeSaude({ casa: C, membro: max.id, nome: 'Pó da casa', gravidade: 'moderada', nota: '' }), 'alergia');
await comId(sync.alergiaDeSaude({ casa: C, membro: mia.id, nome: 'Pólen', gravidade: 'leve', nota: 'Primavera.' }), 'alergia');
await comId(sync.notaDeSaude({ casa: C, episodio: ep.leoPediatria, autor: rita.id, texto: 'Tolerou bem o xarope. Repetir daqui a seis meses.' }), 'nota');
await comId(sync.notaDeSaude({ casa: C, episodio: ep.miaDentista, autor: rita.id, texto: 'Queixou-se de o aparelho estar apertado.' }), 'nota');
await comId(sync.decisaoDeSaude({ casa: C, episodio: ep.miaDentista, tipo: 'seguimento', estado: 'pendente', nota: 'Marcar a próxima revisão em janeiro.' }), 'decisão');
await como(tomas);
await comId(sync.notaDeSaude({ casa: C, episodio: ep.miaDentista, autor: tomas.id, texto: 'Já não se queixa. Escovar com mais cuidado à noite.' }), 'nota');
await comId(sync.decisaoDeSaude({ casa: C, episodio: ep.tomas, tipo: 'alta', estado: 'resolvido', nota: '' }), 'decisão');
console.log(`  ${Object.keys(ep).length} consultas, ${ANEXOS.length + 1} anexos, 4 receitas, 2 tomas, 3 alergias`);

// ── Agenda ──────────────────────────────────────────────────────────────────
// Partilhados, «só eu» de cada adulto, «adultos»; hoje, esta semana, o mês que
// vem; um sem hora; um ligado à consulta da Mia. Não há recorrência no esquema.
await como(rita);
const EVENTOS = [
  ['Buscar o Léo ao treino', dia(0), '18:30', 'familia', 'Desporto', leo],
  ['Ginásio', dia(0), '07:30', 'so-eu', '', null],
  ['Jantar com os pais do Tomás — levar a sobremesa & o vinho', dia(0), '', 'familia', 'Família', null],
  ['Reunião de pais na escola da Mia e do Maximiliano-Afonso (sala 12, entrada pela porta lateral)', diaDaSemana(3), '18:00', 'adultos', 'Escola', mia],
  ['Futebol do Léo', diaDaSemana(5), '10:00', 'familia', 'Desporto', leo],
  ['Piscina', diaDaSemana(6), '09:00', 'familia', 'Desporto', max],
  ['Anos da avó', dia(11), '19:30', 'familia', 'Família', null],
  ['Entrega do relatório', dia(4), '17:00', 'adultos', 'Trabalho', null],
  ['Consulta Dentista · Mia', dia(0), '16:30', 'adultos', 'Saúde', mia, ep.miaDentista],
  ['Visita de estudo ao Oceanário', dia(33), '08:15', 'familia', 'Escola', leo],
  ['Férias de outono — reservar a casa em Sagres', dia(40), '', 'adultos', 'Família', null],
  ['Aniversário do Maximiliano-Afonso', dia(36), '16:00', 'familia', 'Família', max],
  ['Reunião de condomínio', dia(-6), '21:00', 'adultos', 'Casa', null],
];
for (const [titulo, d, hora, visibilidade, etiqueta, responsavel, episodio] of EVENTOS) {
  await comId(sync.eventoDaCasa({ casa: C, dia: chave(d), hora, titulo, responsavel: responsavel ? responsavel.id : null, autor: rita.id, visibilidade, etiqueta, episodio: episodio || null }), titulo);
}
await como(tomas);
await comId(sync.eventoDaCasa({ casa: C, dia: chave(dia(1)), hora: '13:00', titulo: 'Almoço com o Rui (só eu)', autor: tomas.id, visibilidade: 'so-eu', etiqueta: 'Trabalho' }), 'evento');
await comId(sync.eventoDaCasa({ casa: C, dia: chave(dia(-2)), hora: '20:00', titulo: 'Jogo do Benfica', autor: tomas.id, visibilidade: 'familia', etiqueta: 'Desporto' }), 'evento');
console.log(`  ${EVENTOS.length + 2} eventos`);

// ── O registo da casa ───────────────────────────────────────────────────────
await como(rita);
const REGISTO = [
  ['Casa criada pela simulação', 'Gestão da Casa', -45], ['Léo, Mia e Maximiliano-Afonso entraram na casa', 'Gestão da Casa', -45],
  ['Mês aberto', 'Dinheiro', -13], ['Equipamento «Frigorífico» acrescentado', 'Equipamentos', -18],
  ['Ida às compras fechada · Continente de Belém · 62,40 €', 'Compras', -3], ['Semanada de Léo: 2,00 € · 20 pontos', 'Dinheiro', -7],
  ['Tarefa «Regar as plantas» criada para Mia', 'Tarefas', -5], ['Evento «Anos da avó» agendado', 'Agenda', -4],
  ['Especialidade criada: Alergologia', 'Saúde', -2], ['Contrato «Seguro do carro» acrescentado & documento anexado', 'Equipamentos', -1],
];
for (const [texto, area, n] of REGISTO) {
  await semRecusa(sync.registoDaCasa({ casa: C, texto, quem: rita.id, quando: `${dia(-n)}T12:00:00`, area }), texto);
}

// ── Resumo ──────────────────────────────────────────────────────────────────
const contar = async (colecao, filtro) => (await admin.collection(colecao).getList(1, 1, { filter: filtro })).totalItems;
const contagens = {};
for (const colecao of [...LIMPEZA, 'membros']) contagens[colecao] = await contar(colecao, `casa="${C}"`);
contagens.preferencias = await contar('preferencias', TODOS.map(m => `membro="${m.id}"`).join(' || '));

console.log(`\n✓ «${NOME}» povoada.`);
console.log(`  casa: ${C}`);
console.log('  adultos:');
for (const m of [rita, tomas]) console.log(`    ${m.nome.padEnd(20)} ${m.email}  ·  ${m.senha}`);
console.log('  crianças (login · PIN):');
for (const m of [leo, mia, max]) console.log(`    ${m.nome.padEnd(20)} ${m.login}  ·  ${m.pin}`);
console.log(`  partilha da lista (1 h): ${partilha.url}`);
console.log('  contagens:');
const nomes = Object.keys(contagens).sort();
for (let i = 0; i < nomes.length; i += 3) {
  console.log('    ' + nomes.slice(i, i + 3).map(n => `${n} ${contagens[n]}`.padEnd(28)).join(''));
}
