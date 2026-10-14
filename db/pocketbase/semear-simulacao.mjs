// Enche a casa com dados variados, para se poder experimentar a app inteira.
//
//   SEMEAR="<nome da casa>" node db/pocketbase/semear-simulacao.mjs
//
// ⚠ O nome da casa não é enfeite: é o travão. Sem ele — ou com um nome que não
// bata certo — o guião imprime o servidor a que está ligado, a casa que lá
// está, o que ia reescrever, e sai com o código 2 sem tocar em nada. Ver «O
// travão» mais abaixo.
//
// ── O que isto é, e o que NÃO é ──────────────────────────────────────────────
//
// Não é a família de demonstração do `data.js` — essa vive no telefone e some
// assim que a casa se liga ao servidor. Isto escreve na casa A SÉRIO, no
// servidor, para se poder tocar em tudo: marcar tarefas, pagar semanadas,
// fechar contas, ver o histórico, entrar como criança.
//
// ⚠ Por isso mesmo, ANTES de o correr faça uma cópia do `pb_data`:
//
//     Get-Process pocketbase | Stop-Process -Force
//     Copy-Item pb_data pb_data.antes-da-simulacao -Recurse
//
// e para voltar atrás, o contrário. É a única forma de devolver a casa ao que
// era sem depender de eu me lembrar de tudo o que criei.
//
// ── O que semeia ─────────────────────────────────────────────────────────────
//
// Dois adultos e duas crianças (além de quem já lá vive), envelopes com
// limites, um mês aberto, despesas espalhadas por três semanas, transferências
// entre envelopes, um acerto por pagar, tarefas de todas as urgências e
// recorrências — umas feitas, uma por confirmar —, semanadas e bónus nos
// cofres, uma ida às compras fechada e outra a decorrer, equipamentos com
// garantias a expirar, consultas de saúde com notas e receitas, e eventos com
// os três níveis de visibilidade.
import PocketBase from 'pocketbase';
import { SUPERUTILIZADOR, SUPER_PALAVRA, URL_DO_SERVIDOR } from './ambiente.mjs';
import { sair } from './sair.mjs';

const pb = new PocketBase(URL_DO_SERVIDOR);
pb.autoCancellation(false);
await pb.collection('_superusers').authWithPassword(SUPERUTILIZADOR, SUPER_PALAVRA);

// ⚠ A data LOCAL, e não o `toISOString()`.
//
// Portugal está uma hora à frente de UTC em setembro, e `new Date(...).
// toISOString()` devolve o dia anterior durante a primeira hora do dia. O mês
// abriu a «2026-08-31» com o dia 1 escrito no código — e o ecrã ficava a dizer
// «Orçamento de Agosto» a 6 de setembro.
const pad = (n) => String(n).padStart(2, '0');
const local = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const dia = (n) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return local(d);
};
const iso = (n) => `${dia(n)} 00:00:00.000Z`;

const casa = (await pb.collection('casas').getFullList())[0];
if (!casa) { console.error('Não há casa nenhuma. Entre na app uma vez primeiro.'); await sair(1); }

// ── O travão: encher uma casa pede-se pelo NOME dela ─────────────────────────
//
// ⚠ Este guião escreve na casa A SÉRIO, e é essa a intenção — sem isso não se
// passeia pela app inteira. O que ele não pode é fazê-lo sem que quem o mandou
// correr esteja a olhar para o nome da casa que vai mexer.
//
// Não apaga nada: não há uma única chamada de apagar no ficheiro. Mas faz duas
// coisas que NÃO SE DESFAZEM, e é por isso que o travão existe:
//
//   1. reescreve as regras do orçamento da casa — rendimento, valor do ponto,
//      dia de pagamento, dividir a meias, pontos ligados;
//   2. fecha o mês que estiver ABERTO, com data de há 31 dias, e abre outro.
//
// O resto são dezenas de linhas acrescentadas às de quem lá vive, para separar
// à mão semanas depois. E ele pega na PRIMEIRA casa que encontra, sem perguntar
// qual — o que num servidor com uma casa só quer dizer: a sua.
//
// O caminho de volta está num comentário lá em cima — parar o servidor e copiar
// o `pb_data` — e depende de alguém se lembrar. Um comentário não é um travão.
//
// É a mesma forma do `PB_RECRIAR` do `criar-colecoes.mjs`: o valor é o nome
// exacto da casa, e nada mais serve.
const pedido = (process.env.SEMEAR || '').trim();
if (pedido !== String(casa.nome).trim()) {
  console.error(pedido === ''
    ? 'RECUSADO: falta dizer em que casa se semeia.'
    : `RECUSADO: SEMEAR=«${pedido}» não é o nome da casa deste servidor.`);
  console.error(`Servidor: ${URL_DO_SERVIDOR}`);
  console.error(`Casa lá dentro: «${casa.nome}».`);
  console.error('Semear REESCREVE as regras do orçamento dessa casa e FECHA o mês aberto —');
  console.error('duas coisas que não se desfazem —, e acrescenta-lhe dezenas de linhas.');
  console.error('Faça uma cópia do `pb_data` primeiro, e depois escreva o nome da casa:');
  console.error(`  SEMEAR="${casa.nome}" node db/pocketbase/semear-simulacao.mjs`);
  console.error('Nada foi escrito.');
  await sair(2);
}

console.log(`Casa: «${casa.nome}»`);

// As regras da casa, para o orçamento e a semanada fazerem sentido.
await pb.collection('casas').update(casa.id, {
  rendimento_mensal: 3200, valor_ponto: 0.1, dia_pagamento: 5,
  divide_meias: true, pontos_ligados: true,
});

// ── Quem vive na casa ────────────────────────────────────────────────────────
//
// Quem já lá está fica. Estes juntam-se, para haver com quem repartir tarefas,
// despesas e cofres — uma casa de um membro não exercita metade da app.
const jaLa = await pb.collection('membros').getFullList();
const porNome = Object.fromEntries(jaLa.map(m => [m.nome, m]));

const membro = async (nome, papel, extra = {}) => {
  if (porNome[nome]) return porNome[nome];
  const senha = papel === 'crianca' ? extra.pin : 'palavra-longa-1';
  const m = await pb.collection('membros').create({
    nome, login: `${casa.id}_${nome}`, casa: casa.id, papel, verified: true,
    password: senha, passwordConfirm: senha,
    ...(papel === 'crianca' ? {} : { email: extra.email }),
    fem: !!extra.fem,
  });
  porNome[nome] = m;
  console.log(`  + ${nome} (${papel})${papel === 'crianca' ? ` · PIN ${extra.pin}` : ''}`);
  return m;
};

const rita  = await membro('Rita',  'admin',   { email: 'rita.simulacao@exemplo.pt', fem: true });
const tomas = await membro('Tomás', 'adulto',  { email: 'tomas.simulacao@exemplo.pt' });
const leo   = await membro('Léo',   'crianca', { pin: '247015' });
const mia   = await membro('Mia',   'crianca', { pin: '135790', fem: true });
// O dono da casa é quem já lá estava — o primeiro adulto que não é destes.
const dono = jaLa.find(m => m.papel !== 'crianca') || rita;
console.log(`  (o dono da casa continua a ser ${dono.nome})`);

const adultos = [dono, rita, tomas].filter((m, i, a) => a.findIndex(x => x.id === m.id) === i);
const criancas = [leo, mia];

// ── As listas da casa ────────────────────────────────────────────────────────
const daLista = async (colecao, nomes) => {
  const tem = (await pb.collection(colecao).getFullList()).filter(x => x.casa === casa.id);
  const out = {};
  for (const nome of nomes) {
    out[nome] = tem.find(x => x.nome === nome)
      || await pb.collection(colecao).create({ casa: casa.id, nome });
  }
  return out;
};

const lojas = await daLista('lojas', ['Continente de Belém', 'Pingo Doce do Restelo', 'Mercado de Algés']);
const especialidades = await daLista('especialidades',
  ['Medicina geral', 'Dentista', 'Pediatria', 'Oftalmologia', 'Ortodontia']);
const categorias = await daLista('categorias_equip',
  ['Eletrodomésticos', 'Aquecimento', 'Informática', 'Outros']);
console.log(`  listas: ${Object.keys(lojas).length} lojas, ${Object.keys(especialidades).length} especialidades, ${Object.keys(categorias).length} categorias`);

// ── O orçamento ──────────────────────────────────────────────────────────────
const ENVELOPES = [
  ['Mercearia', 550], ['Casa & contas', 780], ['Transportes', 240],
  ['Lazer', 180], ['Saúde', 150], ['Escola', 120],
];
const envs = {};
for (const [nome, limite] of ENVELOPES) {
  const tem = (await pb.collection('envelopes').getFullList()).find(e => e.casa === casa.id && e.nome === nome);
  envs[nome] = tem || await pb.collection('envelopes').create({ casa: casa.id, nome, limite_base: limite });
}
console.log(`  ${Object.keys(envs).length} envelopes`);

// O mês ABERTO — sem ele os totais somam desde sempre.
const mesesAbertos = (await pb.collection('meses').getFullList()).filter(m => m.casa === casa.id && !m.fechado_em);
for (const m of mesesAbertos) await pb.collection('meses').update(m.id, { fechado_em: iso(-31) });
const primeiroDoMes = (() => { const d = new Date(); d.setDate(1); return local(d); })();
await pb.collection('meses').create({
  casa: casa.id, mes: `${primeiroDoMes} 00:00:00.000Z`, rendimento: 3200,
  limites: Object.fromEntries(ENVELOPES),
});
console.log(`  mês aberto a ${primeiroDoMes}`);

let n = 0;
const chave = () => `sim-${Date.now()}-${++n}`;

// ── Despesas ─────────────────────────────────────────────────────────────────
//
// ⚠ Todas DENTRO do mês aberto, e é a diferença entre uma simulação que se vê e
// uma que não se vê. À primeira espalhei-as por três semanas para trás; o mês
// abre no dia 1, hoje era dia 5, e nove das dez caíam fora — o orçamento dizia
// «0 % usado» com dez despesas na base de dados. Estava certo e não servia para
// nada.
//
// `dentroDoMes` conta para trás a partir de hoje sem sair do mês.
const diasNoMes = new Date().getDate() - 1;
const dentroDoMes = (i) => -Math.min(i, diasNoMes);

// ⚠ TODOS os envelopes levam despesas, e em graus diferentes: um quase cheio
// (a Mercearia, acima dos 94 % que acendem o aviso do «Precisa de Si»), uns a
// meio, e um quase intocado. Um orçamento onde tudo está a 20 % não mostra nada
// do que o ecrã sabe fazer.
//
// `divide_meias` alterna de propósito: é o que dá base ao acerto de contas.
const DESPESAS = [
  ['Mercearia', 128.4, 'Compras da semana · Continente', dentroDoMes(5), dono, true],
  ['Mercearia', 96.15, 'Compras · Pingo Doce', dentroDoMes(3), rita, true],
  ['Mercearia', 74.9, 'Compras · Continente', dentroDoMes(1), dono, true],
  ['Mercearia', 41.2, 'Talho e peixaria', dentroDoMes(4), tomas, true],
  ['Mercearia', 18.6, 'Pão, leite e fruta', dentroDoMes(0), rita, true],
  ['Mercearia', 22.35, 'Mercado de Algés', dentroDoMes(2), dono, true],
  ['Mercearia', 165, 'Compras do mês · produtos de limpeza', dentroDoMes(6), dono, true],

  ['Casa & contas', 78.9, 'Eletricidade', dentroDoMes(3), dono, true],
  ['Casa & contas', 31.2, 'Internet e televisão', dentroDoMes(3), rita, true],
  ['Casa & contas', 42.6, 'Água', dentroDoMes(5), dono, true],
  ['Casa & contas', 24.99, 'Gás', dentroDoMes(6), tomas, true],
  ['Casa & contas', 180, 'Condomínio', dentroDoMes(2), rita, true],

  ['Transportes', 45, 'Passe do Léo', dentroDoMes(4), tomas, false],
  ['Transportes', 62.3, 'Combustível', dentroDoMes(1), dono, true],
  ['Transportes', 58.7, 'Combustível', dentroDoMes(5), rita, true],
  ['Transportes', 12, 'Estacionamento', dentroDoMes(0), dono, false],

  ['Lazer', 28, 'Cinema em família', dentroDoMes(2), rita, true],
  ['Lazer', 46.5, 'Almoço fora', dentroDoMes(6), dono, true],
  ['Lazer', 15.9, 'Livros', dentroDoMes(4), tomas, false],

  ['Saúde', 35, 'Consulta da Mia', dentroDoMes(1), tomas, true],
  ['Saúde', 18.45, 'Farmácia', dentroDoMes(3), rita, true],

  ['Escola', 22.5, 'Material escolar', dentroDoMes(4), rita, true],
];
for (const [env, valor, descricao, quando, quem, meias] of DESPESAS) {
  await pb.collection('despesas').create({
    casa: casa.id, envelope: envs[env].id, valor, descricao,
    data: iso(quando), pagador: quem.id, divide_meias: !!meias, idem_key: chave(),
  });
}
const gasto = DESPESAS.reduce((n, d) => n + d[1], 0);
console.log(`  ${DESPESAS.length} despesas · ${gasto.toFixed(2)} € gastos`);

// Transferências entre envelopes — o INVARIANTE #2 a sério.
await pb.collection('transferencias').create({
  casa: casa.id, de_envelope: envs['Lazer'].id, para_envelope: envs['Mercearia'].id,
  valor: 40, mes: `${primeiroDoMes} 00:00:00.000Z`, por: dono.id, idem_key: chave() });
await pb.collection('transferencias').create({
  casa: casa.id, de_envelope: envs['Escola'].id, para_envelope: envs['Saúde'].id,
  valor: 25, mes: `${primeiroDoMes} 00:00:00.000Z`, por: rita.id, idem_key: chave() });
console.log('  2 transferências entre envelopes');

// Um acerto PARCIAL: fica dívida por saldar, que é o estado interessante.
if (adultos.length > 1) {
  await pb.collection('acertos').create({
    casa: casa.id, de_membro: adultos[1].id, para_membro: adultos[0].id,
    valor: 30, data: iso(-7), idem_key: chave() });
  console.log('  1 acerto parcial (fica dívida por saldar)');
}

// ── Tarefas ──────────────────────────────────────────────────────────────────
//
// Das três urgências, das três recorrências, e com postos para a ordem à mão
// se ver a funcionar.
// ⚠ Há sempre tarefas de HOJE: as diárias, e uma «uma vez» com prazo hoje. Uma
// casa cujas tarefas caem todas na semana que vem mostra «Nada para hoje» no
// Início, que é o ecrã por onde se entra.
const TAREFAS = [
  ['Levar o lixo', leo, 'diaria', 2, 0, 0, 1],
  ['Pôr a mesa', mia, 'diaria', 1, 1, null, 2],
  ['Fazer a cama', leo, 'diaria', 1, 1, null, 3],
  ['Arrumar o quarto', mia, 'dias_semana', 3, 1, 0, null],
  ['Entregar os livros na biblioteca', tomas, 'uma_vez', 0, 0, 0, null],
  ['Marcar revisão do carro', dono, 'uma_vez', 0, 2, 14, null],
  ['Regar as plantas', rita, 'dias_semana', 1, 2, 1, null],
  ['Pagar o condomínio', dono, 'uma_vez', 0, 0, 3, null],
];
const tarefas = {};
for (const [titulo, quem, recorrencia, pontos, urgencia, prazo, posto] of TAREFAS) {
  tarefas[titulo] = await pb.collection('tarefas').create({
    casa: casa.id, titulo, atribuido_a: quem.id, recorrencia, pontos, urgencia,
    ...(prazo === null ? {} : { prazo: iso(prazo) }),
    ...(posto ? { posto } : {}),
  });
}
console.log(`  ${TAREFAS.length} tarefas`);

// Feitas: umas confirmadas (rendem pontos), uma à espera de confirmação.
const feita = async (titulo, quem, quando, confirmada) => {
  await pb.collection('tarefas_feitas').create({
    casa: casa.id, tarefa: tarefas[titulo].id, marcada_por: quem.id, data: iso(quando),
    ...(confirmada ? { confirmada_em: iso(quando) } : {}),
  });
};
await feita('Levar o lixo', leo, -1, true);
await feita('Levar o lixo', leo, -2, true);
await feita('Pôr a mesa', mia, -1, true);
await feita('Pôr a mesa', mia, -2, true);
await feita('Arrumar o quarto', mia, -3, true);
await feita('Fazer a cama', leo, 0, false);        // ⚠ por confirmar, hoje
console.log('  6 marcações (uma por confirmar)');

// ── Cofres ───────────────────────────────────────────────────────────────────
const cofre = async (quem, tipo, valor, motivo, quando, pontos = 0) => {
  await pb.collection('cofre_movimentos').create({
    casa: casa.id, membro: quem.id, tipo, valor, motivo, pontos,
    data: iso(quando), autorizado_por: dono.id, idem_key: chave() });
};
// ⚠ Pagar MENOS pontos do que a criança ganhou, e nunca mais.
//
// Isto pagava 12 pontos ao Léo e 9 à Mia. Ganhos: o Léo tem duas marcações
// confirmadas de «Levar o lixo», a 2 pontos — QUATRO. A Mia tem duas de «Pôr a
// mesa» (1) e uma de «Arrumar o quarto» (3) — CINCO.
//
// O que a app mostra por pagar é `ganhos − pagos`, e com estes números dava
// NEGATIVO: o cofre do Léo dizia «Pagar Semanada · −1,00 €». O botão estava
// desactivado, portanto nada rebentava — só um número impossível num ecrã de
// dinheiro, à espera de que alguém reparasse.
//
// Metade paga e metade por pagar é o que exercita as duas metades do ecrã: o
// histórico de movimentos, e o «Mais X por pagar desta semana».
await cofre(leo, 'semanada', 0.2, 'Semanada desta semana', -7, 2);   // de 4 ganhos
await cofre(leo, 'bonus', 1, 'Ajudou com as compras', -3);
await cofre(mia, 'semanada', 0.3, 'Semanada desta semana', -7, 3);   // de 5 ganhos
await cofre(mia, 'retirada', -2.5, 'Comprou um caderno', -2);
console.log('  4 movimentos de cofre');

// ── Compras ──────────────────────────────────────────────────────────────────
const listaFechada = await pb.collection('listas_compras').create({
  casa: casa.id, loja: lojas['Continente de Belém'].id, comprador: dono.id,
  planeada_para: iso(-7), fechada_em: iso(-7), total: 62.4 });
for (const [rotulo, seccao] of [['Leite', 0], ['Maçãs', 1], ['Azeite', 0], ['Detergente', 3]]) {
  await pb.collection('artigos').create({
    casa: casa.id, lista: listaFechada.id, rotulo, seccao,
    pedido_por: dono.id, estado: 'confirmado' });
}
const listaAberta = await pb.collection('listas_compras').create({
  casa: casa.id, loja: lojas['Pingo Doce do Restelo'].id, comprador: rita.id,
  planeada_para: iso(2) });
const ARTIGOS = [
  ['Leite', 0, 'por_comprar', dono], ['Ovos', 0, 'por_comprar', rita],
  ['Bananas', 1, 'confirmado', rita], ['Iogurtes', 1, 'por_comprar', mia],
  ['Papel de cozinha', 3, 'sem_stock', tomas], ['Massa', 0, 'por_comprar', leo],
  ['Frango', 2, 'por_comprar', dono], ['Alface', 1, 'confirmado', rita],
];
for (const [rotulo, seccao, estado, quem] of ARTIGOS) {
  await pb.collection('artigos').create({
    casa: casa.id, lista: listaAberta.id, rotulo, seccao, estado,
    pedido_por: quem.id, habitual: seccao === 0 });
}
console.log(`  1 ida fechada (4 artigos) e 1 a decorrer (${ARTIGOS.length} artigos)`);

// ── Equipamentos ─────────────────────────────────────────────────────────────
const EQUIP = [
  ['Máquina de lavar roupa', 'Eletrodomésticos', -700, 400, 'Worten', 449],
  ['Frigorífico', 'Eletrodomésticos', -1100, 25, 'Worten', 899],   // garantia a acabar
  ['Caldeira', 'Aquecimento', -1500, -60, 'Junkers', 1200],        // garantia expirada
  ['Portátil da escola', 'Informática', -200, 530, 'FNAC', 699],
];
for (const [nome, cat, comprado, garantia, loja, preco] of EQUIP) {
  await pb.collection('equipamentos').create({
    // ⚠ O NOME, não o id: `equipamentos.categoria` é um campo de texto, e é o
    // nome que a folha da app escreve. Com o id, a ficha do Frigorífico dizia
    // «klb00gtqqxcckvf» por baixo do nome — a semente a comportar-se de outra
    // maneira que a app, que é como estes defeitos se escondem.
    casa: casa.id, nome, categoria: categorias[cat].nome,
    comprado_em: iso(comprado), garantia_ate: iso(garantia), loja, preco,
    ...(nome === 'Caldeira' ? { manutencao: 'Revisão anual', manutencao_ate: iso(20) } : {}),
  });
}
console.log(`  ${EQUIP.length} equipamentos (um com garantia a acabar, outro expirada)`);

// ── Saúde ────────────────────────────────────────────────────────────────────
const CONSULTAS = [
  [mia, 'Dentista', 'Dr. Cardoso', 8, 'Revisão semestral.'],
  [leo, 'Pediatria', 'Dr.ª Neves', -12, 'Consulta de rotina. Tudo bem.'],
  [leo, 'Oftalmologia', 'Dr. Sequeira', 29, ''],
  [rita, 'Medicina geral', 'Dr.ª Pinto', -40, 'Análises pedidas.'],
];
const consultas = [];
for (const [quem, esp, medico, quando, notas] of CONSULTAS) {
  // ⚠ O NOME da especialidade, e não o id da linha em `especialidades`.
  //
  // O campo `especialidade` de `episodios_saude` é TEXTO — a app escreve-lhe o
  // nome e as provas do servidor também. Este semeador escrevia-lhe o id, e o
  // PocketBase aceitava, porque um id é uma cadeia de caracteres como qualquer
  // outra.
  //
  // Não deu erro nenhum. Só se viu quando a leitura da saúde foi ligada e o
  // ecrã passou a mostrar «Léo: ouu605abgi9g6f9» onde devia dizer
  // «Léo: Pediatria». Um campo de texto aceita tudo, e é por isso que um
  // engano destes espera meses.
  consultas.push(await pb.collection('episodios_saude').create({
    casa: casa.id, membro: quem.id, especialidade: esp,
    medico, dia: iso(quando), hora: '10:00', notas }));
}
// ── Notas: VÁRIAS por consulta, e de autores diferentes ──────────────────────
//
// Uma nota por consulta não exercita nada: o que se quer ver é a conversa a
// crescer ao longo do tempo, com quem escreveu e quando, e a regra de que só o
// autor altera ou apaga a sua.
const NOTAS = [
  [1, dono, 'Consulta de rotina. Peso e altura no percentil habitual.'],
  [1, rita, 'Tolerou bem o xarope. Repetir daqui a seis meses.'],
  [1, dono, 'Ficou marcada a próxima para a primavera.'],
  [0, rita, 'Levou o aparelho para ajuste. Queixou-se de o sentir apertado.'],
  [0, tomas, 'Já não se queixa. Escovar com mais cuidado à noite.'],
  [3, dono, 'Análises pedidas: hemograma e ferro.'],
  [3, dono, 'Resultados dentro dos valores. Repetir daqui a um ano.'],
  [2, rita, 'Marcada por causa das dores de cabeça ao fim do dia.'],
];
for (const [i, autor, texto] of NOTAS) {
  await pb.collection('notas_saude').create({
    casa: casa.id, episodio: consultas[i].id, autor: autor.id, texto });
}

// ── Anexos ───────────────────────────────────────────────────────────────────
//
// ⚠ Sem FICHEIRO. O campo é opcional, e um anexo de mentira com um PDF gerado
// só serviria para eu poder dizer que gerei um PDF: o que a app mostra é o
// título, o tipo e a consulta de onde veio. Anexar um ficheiro a sério é o que
// o `expo-image-picker` faz, e é isso que falta experimentar num telemóvel.
const ANEXOS = [
  [1, 'relatorio', 'Relatório da consulta de pediatria'],
  [1, 'exame', 'Boletim de vacinas · página atualizada'],
  [0, 'relatorio', 'Plano ortodôntico'],
  [0, 'exame', 'Radiografia panorâmica'],
  [3, 'exame', 'Análises ao sangue · resultado'],
  [3, 'receita', 'Receita de ferro'],
];
for (const [i, tipo, titulo] of ANEXOS) {
  await pb.collection('anexos').create({
    casa: casa.id, episodio: consultas[i].id, tipo, titulo });
}

// ── Receitas e decisões ──────────────────────────────────────────────────────
const RECEITAS = [
  [1, 'Xarope para a tosse', '5 ml', 1, 'frasco', 45],
  [1, 'Paracetamol infantil', '250 mg', 2, 'caixa', 120],
  [3, 'Ferro', '1 comprimido ao pequeno-almoço', 3, 'caixa', 90],
  [0, 'Elixir com flúor', 'bochechar à noite', 1, 'frasco', -5],   // já expirou
];
for (const [i, nome, dose, quantidade, unidade, expira] of RECEITAS) {
  await pb.collection('receitas_saude').create({
    casa: casa.id, episodio: consultas[i].id, nome, dose, quantidade, unidade,
    expira_em: iso(expira) });
}
await pb.collection('decisoes_saude').create({
  casa: casa.id, episodio: consultas[0].id, tipo: 'seguimento',
  estado: 'pendente', nota: 'Marcar a próxima revisão em janeiro.' });
await pb.collection('decisoes_saude').create({
  casa: casa.id, episodio: consultas[3].id, tipo: 'alta',
  estado: 'resolvido', nota: 'Sem seguimento necessário.' });

console.log(`  ${CONSULTAS.length} consultas · ${NOTAS.length} notas · ${ANEXOS.length} anexos · ${RECEITAS.length} receitas · 2 decisões`);

// ── Agenda ───────────────────────────────────────────────────────────────────
//
// Os três níveis de visibilidade, para se poder ver o que cada um vê.
// ⚠ Dois são de HOJE, senão a «Agenda de Hoje» do Início fica vazia — e é a
// segunda secção do primeiro ecrã.
const EVENTOS = [
  ['Buscar o Léo ao treino', 0, '18:30', 'familia', dono, 'Desporto'],
  ['Ginásio', 0, '07:30', 'so-eu', dono, ''],
  ['Futebol do Léo', 2, '10:00', 'familia', tomas, 'Desporto'],
  ['Jantar de anos da avó', 3, '19:30', 'familia', dono, 'Família'],
  ['Reunião na escola', 5, '18:00', 'adultos', rita, 'Escola'],
  ['Consulta da Mia', 8, '10:00', 'familia', rita, 'Saúde'],
];
for (const [titulo, quando, hora, visibilidade, autor, etiqueta] of EVENTOS) {
  await pb.collection('eventos').create({
    casa: casa.id, titulo, dia: iso(quando), hora, visibilidade,
    autor: autor.id, etiqueta,
    ...(titulo === 'Consulta da Mia' ? { episodio: consultas[0].id, responsavel: mia.id } : {}),
  });
}
console.log(`  ${EVENTOS.length} eventos (um privado, um só para adultos)`);

// ── O registo da casa ────────────────────────────────────────────────────────
const REGISTO = [
  ['Rita entrou na casa', 'Gestão da Casa', -25, dono],
  ['Léo entrou na casa', 'Gestão da Casa', -25, dono],
  ['Mês aberto', 'Dinheiro', -21, dono],
  ['Equipamento «Frigorífico» acrescentado', 'Equipamentos', -18, rita],
  ['Despesa de 62,40 € em Mercearia · Compras · Continente', 'Dinheiro', -18, dono],
  ['Ida às compras fechada · Continente de Belém · 62,40 €', 'Compras', -7, dono],
  ['Semanada de Léo: 0,20 € · 2 pontos', 'Dinheiro', -7, dono],
  ['Tarefa «Regar as plantas» criada para Rita', 'Tarefas', -5, rita],
  ['Evento «Reunião na escola» agendado', 'Agenda', -4, rita],
  ['Especialidade criada: Ortodontia', 'Saúde', -2, dono],
];
for (const [texto, area, quando, quem] of REGISTO) {
  await pb.collection('registo').create({
    casa: casa.id, texto, area, quem: quem.id, quando: iso(quando) });
}
console.log(`  ${REGISTO.length} linhas de registo`);

console.log('\n✓ Casa semeada. As crianças entram com PIN:');
console.log('    Léo  2470');
console.log('    Mia  1357');
console.log('\nPara voltar atrás: parar o pocketbase e repor `pb_data.antes-da-simulacao`.');
