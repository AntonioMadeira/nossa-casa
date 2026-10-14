// A FILA LEVA A SAÚDE ATÉ AO SERVIDOR — provado a correr, não a ler.
//
//   node db/pocketbase/provar-a-fila-leva-a-saude.mjs
//
// ── O que este ficheiro já foi, e porque é que mudou de lado ────────────────
//
// Chamava-se `provar-a-fila-nao-leva-saude.mjs` e provava o contrário: que uma
// consulta enfileirada NÃO subia para um servidor fora de casa.
//
// Isso era a decisão de 03/09/2026 — a saúde só sobe para um servidor que viva
// dentro de casa. Em 30/09/2026 a casa mudou-se para uma máquina alugada e o
// dono decidiu que a saúde sobe na mesma. O cabeçalho do `src/endereco.js` tem
// a decisão, a data e o custo.
//
// ⚠ O defeito que interessa apanhar inverteu-se com ela. Antes era «a saúde
// escapou»; agora é «a saúde não chegou» — uma consulta escrita no corredor do
// hospital, sem rede, que fica na fila e nunca lá vai dar.
//
// ── O que se mantém, e é o mais importante ──────────────────────────────────
//
// A MÁQUINA continua a mesma: o travão é perguntado à ENTRADA da fila e
// outra vez à SAÍDA, no `despachar()`. Hoje as duas perguntas têm a mesma
// resposta — «sim» — porque a decisão está em `A_SAUDE_SOBE = true`.
//
// Isso não a torna inútil: é o que faz a decisão ser reversível numa linha. Se
// `A_SAUDE_SOBE` passar a `false`, os seis caminhos obedecem, incluindo a fila.
// Sem a pergunta à saída, uma linha enfileirada antes da mudança subia na
// drenagem seguinte — foi esse o defeito medido a 28/09/2026.
//
// ── E porque é que isto é do servidor e não do Jest ─────────────────────────
//
// Porque um guarda que LÊ código não distingue «está escrito» de «acontece».
// Medido a 29/09: pus um `false &&` à frente da condição, o guarda de texto
// ficou verde, e só uma prova que CORRE apanhou. A lição ficou; o que mudou foi
// o que ela mede.
//
// E o `src/pocketbase.js` traz o SDK do PocketBase, que é ESM, e o Jest deste
// projeto não o importa.
import PocketBase from 'pocketbase';
import { URL, PREFIXO, comecar, prova, igual, resumo } from './provas.mjs';
import { configurar, estaLigado, auth, escrever } from '../../src/pocketbase.js';

const memoria = new Map();
const storage = {
  getItem: async (k) => (memoria.has(k) ? memoria.get(k) : null),
  setItem: async (k, v) => { memoria.set(k, v); },
  removeItem: async (k) => { memoria.delete(k); },
};

const { pb: admin } = await comecar();
const casa = await admin.collection('casas').create({ nome: `${PREFIXO}fila`, valor_ponto: 0.1 });
const rita = await admin.collection('membros').create({
  nome: 'Rita', login: `${casa.id}_rita`, casa: casa.id, papel: 'admin',
  email: `fila.${Date.now()}@exemplo.pt`, password: 'palavra-longa-1',
  passwordConfirm: 'palavra-longa-1', verified: true,
});
const leo = await admin.collection('membros').create({
  nome: 'Leo', login: `${casa.id}_leo`, casa: casa.id, papel: 'crianca',
  password: '135790', passwordConfirm: '135790', verified: true,
});
await admin.collection('envelopes').create({ casa: casa.id, nome: 'Mercearia', limite_base: 550 });

// ⚠ O endereço do SERVIDOR ALUGADO, simulado: o `localtest.me` tem um registo
// público que aponta para 127.0.0.1, e o `eEnderecoDeCasa` diz-lhe que NÃO é de
// casa. Mesmo servidor, nome de fora — é assim que se mede o destino sem ter
// ainda a máquina.
//
// ⚠ E não um nome inventado. Um endereço que não resolve provaria só que a rede
// não funciona: tudo «não sobe», com travão ou sem ele.
const COMO_O_ALUGADO = URL.replace('127.0.0.1', 'localtest.me');

// ⚠ Mudar de endereço PERDE a sessão, e sem sessão o servidor recusa por uma
// razão que não é esta: um 400 «Failed to create record» da regra da coleção
// lê-se como «não chegou», e a causa seria outra. A app faz o mesmo — tem
// sessão contra o servidor com que estiver a falar.
const apontarA = async (url) => {
  configurar({ storage, url });
  try { await auth.entrarAdulto(rita.email, 'palavra-longa-1'); } catch (e) { /* endereço morto */ }
};

const contar = async (colecao) => (await admin.collection(colecao)
  .getList(1, 1, { filter: `casa = "${casa.id}"` })).totalItems;

console.log('\n── uma consulta escrita sem rede fica à espera ──');

await apontarA(URL);

await prova('com servidor, a consulta sobe logo — senão não há nada a comparar', async () => {
  igual(estaLigado(), true);
  const r = await escrever.criar('episodios_saude', {
    casa: casa.id, membro: leo.id, especialidade: 'Pediatria',
    medico: 'Dra. Prova', dia: '2026-09-20 10:00:00', notas: 'NOTAS CLINICAS',
  });
  igual(r.enviadas, 1, `enviadas ${r.enviadas}, pendentes ${r.pendentes}`);
  igual(await contar('episodios_saude'), 1, 'o episódio não chegou ao servidor');
});

await prova('sem rede, fica na fila em vez de se perder', async () => {
  await apontarA('http://127.0.0.1:1');
  const r = await escrever.criar('episodios_saude', {
    casa: casa.id, membro: leo.id, especialidade: 'Dermatologia',
    medico: 'Dr. Prova', dia: '2026-09-21 11:00:00', notas: 'escrita no corredor',
  });
  igual(r.pendentes, 1, `ficaram ${r.pendentes} na fila`);
});

console.log('\n── e chega ao servidor alugado ──');

await prova('⚠ a consulta que esperava SOBE para o endereço de fora de casa', async () => {
  // ⚠ Era o contrário até 29/09/2026: esta prova exigia que NÃO subisse.
  // Inverteu-se com a decisão, e o que agora se apanha é ela não chegar.
  await apontarA(COMO_O_ALUGADO);
  const r = await escrever.esvaziar();
  igual(await contar('episodios_saude'), 2, '⚠ A CONSULTA NÃO CHEGOU ao servidor alugado');
  igual(r.pendentes, 0, `ficaram ${r.pendentes} por enviar`);
});

await prova('⚠ e uma consulta nova, escrita já no alugado, também', async () => {
  await apontarA(COMO_O_ALUGADO);
  const r = await escrever.criar('episodios_saude', {
    casa: casa.id, membro: leo.id, especialidade: 'Oftalmologia',
    medico: 'Dr. Prova', dia: '2026-09-22 09:00:00', notas: 'escrita no alugado',
  });
  igual(r.enviadas, 1, `enviadas ${r.enviadas}`);
  igual(await contar('episodios_saude'), 3, 'a consulta nova não chegou');
});

await prova('e o que NÃO é saúde continua a subir, como sempre', async () => {
  // Se o travão travasse tudo, a app parava — e uma prova que não medisse isto
  // deixava passar essa regressão.
  const antes = await contar('registo');
  await apontarA(COMO_O_ALUGADO);
  await escrever.criar('registo', {
    casa: casa.id, texto: 'isto tem de passar', quando: new Date().toISOString(), area: 'Casa',
  });
  const depois = await contar('registo');
  if (!(depois > antes)) throw new Error(`o registo não subiu: ${antes} -> ${depois}`);
});

console.log('\n── e o diário diz o que aconteceu, sem calar nada ──');

await prova('⚠ com a saúde a subir, o registo de saúde vai INTEIRO', async () => {
  // ⚠ O `textoDoRegisto` neutraliza a linha do diário quando o travão está
  // FECHADO — «Uma ficha de saúde foi actualizada» em vez de «Alergia
  // acrescentada à ficha da Mia». Com ele aberto não há nada a esconder de quem
  // já tem a ficha inteira no mesmo servidor, e um diário mais pobre do que
  // precisa de ser também é um defeito.
  await apontarA(COMO_O_ALUGADO);
  const texto = `Alergia acrescentada à ficha do Leo ${Date.now()}`;
  await escrever.criar('registo', {
    casa: casa.id, texto, quando: new Date().toISOString(), area: 'Saúde',
  });
  const linhas = await admin.collection('registo')
    .getFullList({ filter: `casa = "${casa.id}"` });
  const achou = linhas.some((l) => l.texto === texto);
  if (!achou) {
    throw new Error(`o diário foi neutralizado com a saúde a subir: ${linhas.map((l) => l.texto).join(' | ')}`);
  }
});

resumo();
