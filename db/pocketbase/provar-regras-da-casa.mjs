// As regras da casa viajam entre telemóveis.
//
//   node db/pocketbase/provar-regras-da-casa.mjs
//
// ── O que se encontrou ───────────────────────────────────────────────────────
//
// O valor do ponto, o dia de pagamento, a divisão a meias, o interruptor dos
// pontos, os papéis e os PINs viviam só no telefone de quem os mudou:
//
//   a Rita desligava os pontos e o Tomás continuava a vê-los
//   ela mudava o valor do ponto e os dois pagavam semanadas diferentes
//   ela promovia o Tomás e o SERVIDOR continuava a recusar-lhe a Gestão
//   ela punha o PIN do Léo e ele não conseguia entrar no telefone dele
//
// O último é o mais claro de todos: o papel e o PIN decidem o que o servidor
// devolve. Mudá-los só no cliente não muda nada de facto — muda a aparência.
import PocketBase from 'pocketbase';
import { URL, PREFIXO, comecar, prova, igual, recusado, comId, resumo, memoriaDeTelemovel } from './provas.mjs';

const { configurar, auth } = await import('../../src/pocketbase.js');
const sync = await import('../../src/sync.js');

configurar({ url: URL, storage: memoriaDeTelemovel() });

// ── A casa ───────────────────────────────────────────────────────────────────
const { pb: admin } = await comecar();
const casa = await admin.collection('casas').create({
  nome: PREFIXO + 'Bengui', valor_ponto: 0.1, dia_pagamento: 0,
  divide_meias: true, pontos_ligados: true, rendimento_mensal: 3200,
});
const mk = (nome, papel, extra) => admin.collection('membros').create({
  nome, login: `${casa.id}_${nome}`, casa: casa.id, papel, verified: true, ...extra });
const s = (p) => ({ password: p, passwordConfirm: p });

const rita  = await mk('Rita',  'admin',   { email: 'rita@x.pt',  ...s('palavra-longa-1') });
const tomas = await mk('Tomas', 'adulto',  { email: 'tomas@x.pt', ...s('palavra-longa-2') });
const leo   = await mk('Leo',   'crianca', { ...s('135790') });

await auth.entrarAdulto('rita@x.pt', 'palavra-longa-1');
const daRita = sync.sessao();

const telemovel = async (id, senha) => {
  const c = new PocketBase(URL);
  c.autoCancellation(false);   // uma escrita não se perde por chegar outra atrás
  await c.collection('membros').authWithPassword(id, senha);
  return c;
};
const doTomas = await telemovel('tomas@x.pt', 'palavra-longa-2');

// ═════════════════════════════════════════════════════════════════════════════
console.log('\n── as regras da casa mudam para os dois ──');

await prova('o `puxarCasa` traz as regras na forma da loja', async () => {
  const lida = await sync.puxarCasa();
  if (!lida.regras) throw new Error('não trouxe regras nenhumas');
  igual(lida.regras.pointValue, 0.1);
  igual(lida.regras.payDay, 0);
  igual(lida.regras.splitHalf, true);
  igual(lida.regras.pontosLigados, true);
  igual(lida.regras.rendimento, 3200);
});

await prova('⚠ e os NOMES traduzem-se — é onde um erro se esconde', async () => {
  // `valor_ponto` e não `pointValue`; `divide_meias` e não `splitHalf`. O
  // PocketBase ignora em silêncio o que não conhece: um nome errado aqui é uma
  // regra que a casa julga ter mudado e não mudou.
  await sync.regrasDaCasa(daRita.casa, { pointValue: 0.25, payDay: 5 });
  const c = await admin.collection('casas').getOne(casa.id);
  igual(c.valor_ponto, 0.25);
  igual(c.dia_pagamento, 5);
});

await prova('⚠ o telemóvel do Tomás vê o valor novo', async () => {
  const c = (await doTomas.collection('casas').getFullList())[0];
  igual(c.valor_ponto, 0.25);
});

await prova('⚠ o valor do ponto pode ser 0 — os pontos são opcionais', async () => {
  // O servidor tinha `min: 0.01`, e a app passou a deixar descer a 0 em
  // 04/09/2026. A escolha era aceite no telefone e recusada ao subir: a mesma
  // falha silenciosa do `tarefas_feitas`, com a regra mais apertada do que a
  // app.
  await sync.regrasDaCasa(daRita.casa, { pointValue: 0 });
  igual((await admin.collection('casas').getOne(casa.id)).valor_ponto, 0);
});

await prova('mas acima de 5 continua recusado', () =>
  recusado(() => sync.regrasDaCasa(daRita.casa, { pointValue: 9 })));

await prova('⚠ desligar os pontos desliga-os para os DOIS', async () => {
  await sync.regrasDaCasa(daRita.casa, { pontosLigados: false });
  const c = (await doTomas.collection('casas').getFullList())[0];
  igual(c.pontos_ligados, false);
  // E volta a ligar.
  await sync.regrasDaCasa(daRita.casa, { pontosLigados: true });
  igual((await doTomas.collection('casas').getFullList())[0].pontos_ligados, true);
});

await prova('⚠ e `false` não vira o valor por omissão ao voltar', async () => {
  // Um `||` no cliente transformava `divide_meias: false` em `true`: desligar a
  // divisão a meias no servidor não pegava. É preciso `??`, e é o mesmo cuidado
  // que o `pontos_ligados` e o `valor_ponto: 0` precisam.
  await sync.regrasDaCasa(daRita.casa, { splitHalf: false, pointValue: 0, pontosLigados: false });
  const lida = await sync.puxarCasa();
  igual(lida.regras.splitHalf, false);
  igual(lida.regras.pointValue, 0);
  igual(lida.regras.pontosLigados, false);
  // repõe-se, para as provas seguintes
  await sync.regrasDaCasa(daRita.casa, { splitHalf: true, pointValue: 0.1, pontosLigados: true });
});

await prova('⚠ a ementa da semana desliga-se para os DOIS — e uma casa que nunca mexeu no campo tem-na LIGADA', async () => {
  // A regra nova de 12/09/2026. ⚠ A casa desta prova nasceu sem escrever o
  // campo, e o PocketBase dá-lhe `false`: foi isto que apanhou a primeira
  // versão, `ementa_ligada`, que desligava a ementa a toda a casa que já
  // existia. Pela negativa, o `false` de nascença é «ligada».
  igual((await sync.puxarCasa()).regras.ementaDesligada, false);
  await sync.regrasDaCasa(daRita.casa, { ementaDesligada: true });
  igual((await doTomas.collection('casas').getFullList())[0].ementa_desligada, true);
  igual((await sync.puxarCasa()).regras.ementaDesligada, true);
  await sync.regrasDaCasa(daRita.casa, { ementaDesligada: false });
  igual((await sync.puxarCasa()).regras.ementaDesligada, false);
});

await prova('⚠ os ícones dos corredores desligam-se para os DOIS — e uma casa que nunca mexeu no campo TEM-NOS', async () => {
  // A regra nova de 25/09/2026, «deve haver uma opção slider a dizer sem
  // ícones». ⚠ Mesma armadilha da ementa, e aqui ainda mais cara: a casa desta
  // prova nasceu sem escrever o campo e o PocketBase dá-lhe `false`. Um
  // `icones_ligados` apagava os ícones a TODA a casa que já os tinha escolhido,
  // no instante em que o campo chegasse. Pela negativa, o `false` de nascença é
  // «com ícones».
  igual((await sync.puxarCasa()).regras.iconesDesligados, false);
  await sync.regrasDaCasa(daRita.casa, { iconesDesligados: true });
  // ⚠ Lê-se pelo OUTRO adulto: é uma regra da casa, não deste telefone. Se
  // ficasse só no dispositivo de quem mexeu, um via ícones e o outro não.
  igual((await doTomas.collection('casas').getFullList())[0].icones_desligados, true);
  igual((await sync.puxarCasa()).regras.iconesDesligados, true);
  await sync.regrasDaCasa(daRita.casa, { iconesDesligados: false });
  igual((await sync.puxarCasa()).regras.iconesDesligados, false);
});

await prova('⚠ e desligar NÃO apaga o ícone que cada corredor tem', async () => {
  // A promessa que a frase por baixo do interruptor faz: «as escolhas não se
  // perdem — voltam todas se ligar outra vez». Aqui prova-se contra o servidor,
  // que é onde o `seccoes.icone` vive.
  const corredor = await admin.collection('seccoes').create({
    casa: daRita.casa, nome: PREFIXO + 'Talho', posto: 99, icone: 'talho',
  });
  await sync.regrasDaCasa(daRita.casa, { iconesDesligados: true });
  igual((await admin.collection('seccoes').getOne(corredor.id)).icone, 'talho');
  await sync.regrasDaCasa(daRita.casa, { iconesDesligados: false });
  igual((await admin.collection('seccoes').getOne(corredor.id)).icone, 'talho');
  await admin.collection('seccoes').delete(corredor.id);
});

console.log('\n── e quem as pode mudar ──');

await prova('⚠ o Tomás, que é adulto e não administra, NÃO muda as regras', () =>
  recusado(() => doTomas.collection('casas').update(casa.id, { valor_ponto: 5 })));

await prova('⚠ nem uma criança', async () => {
  const doLeo = await telemovel(leo.login, '135790');
  await recusado(() => doLeo.collection('casas').update(casa.id, { valor_ponto: 5 }));
});

// ═════════════════════════════════════════════════════════════════════════════
console.log('\n── os papéis: mudam de facto, não só de aparência ──');

await prova('a Rita promove o Tomás a administrador', async () => {
  await sync.editarMembro(tomas.id, { papel: 'admin' });
  igual((await admin.collection('membros').getOne(tomas.id)).papel, 'admin');
});

await prova('⚠ e o SERVIDOR passa a deixá-lo mudar as regras da casa', async () => {
  // É isto que faltava: o papel decide o que o servidor devolve e aceita.
  // Mudá-lo só no telefone mudava a aparência da Gestão e mais nada.
  const dele = await telemovel('tomas@x.pt', 'palavra-longa-2');
  const r = await dele.collection('casas').update(casa.id, { dia_pagamento: 3 });
  igual(r.dia_pagamento, 3);
});

await prova('e despromovê-lo volta a fechar-lhe a porta', async () => {
  await sync.editarMembro(tomas.id, { papel: 'adulto' });
  const dele = await telemovel('tomas@x.pt', 'palavra-longa-2');
  await recusado(() => dele.collection('casas').update(casa.id, { dia_pagamento: 1 }));
});

// ═════════════════════════════════════════════════════════════════════════════
console.log('\n── e o PIN é a palavra-passe, não um resumo local ──');

await prova('⚠ pela COLEÇÃO é recusado — e era assim que a app o tentava', async () => {
  // O PocketBase exige `oldPassword`, mesmo a quem administra. Quem põe o PIN
  // de uma criança de sete anos não sabe o antigo — o objetivo é muitas vezes
  // não saber. A app fazia `editarMembro(id, { password })` e apanhava a recusa
  // num `.catch(() => {})`: falhava em silêncio.
  let mensagem = null;
  try { await sync.editarMembro(leo.id, { password: '247015', passwordConfirm: '247015' }); }
  catch (e) { mensagem = e.message; }
  if (!mensagem) throw new Error('PASSOU — a coleção devia exigir oldPassword');
});

await prova('⚠ mas pela ROTA passa, e a criança entra no telemóvel dela', async () => {
  // O resumo local (`resumoPin`) serve a entrada sem servidor, e é isso e nada
  // mais. O PIN a sério é a palavra-passe no PocketBase, com bcrypt feito pelo
  // servidor.
  await sync.definirPin(leo.id, '247015');
  const dele = await telemovel(leo.login, '247015');
  igual(dele.authStore.record.nome, 'Leo');
});

await prova('e o PIN antigo deixa de servir', () =>
  recusado(() => telemovel(leo.login, '135790')));

await prova('⚠ a rota verifica a qualidade do PIN outra vez, no SERVIDOR', async () => {
  // O cliente já a verifica, e isso é para a pessoa saber porquê enquanto
  // escreve. Isto é outra coisa: um cliente pode ser trocado, e a regra que
  // protege a casa não pode viver só nele.
  for (const mau of ['111111', '123456', '987654', '12', 'abcd']) {
    await recusado(() => sync.definirPin(leo.id, mau));
  }
  // E o PIN bom continua a servir — nenhuma das recusas o estragou.
  const dele = await telemovel(leo.login, '247015');
  igual(dele.authStore.record.nome, 'Leo');
});

await prova('⚠ e a rota NÃO toca num adulto', async () => {
  // Um adulto tem palavra-passe, não PIN, e muda-a ele. Deixar esta rota tocar
  // num adulto era dar a quem administra a chave da conta do companheiro —
  // incluindo a ficha de saúde dele, que é só dele (INVARIANTE #3).
  await recusado(() => sync.definirPin(tomas.id, '247015'));
  const dele = await telemovel('tomas@x.pt', 'palavra-longa-2');
  igual(dele.authStore.record.nome, 'Tomas');
});

await prova('⚠ nem numa criança de OUTRA casa', async () => {
  const outra = await admin.collection('casas').create({ nome: PREFIXO + 'Outra', valor_ponto: 0.1 });
  const doutra = await admin.collection('membros').create({
    nome: 'Ines', login: `${outra.id}_Ines`, casa: outra.id, papel: 'crianca',
    verified: true, password: '975318', passwordConfirm: '975318' });
  await recusado(() => sync.definirPin(doutra.id, '247015'));
  // O PIN dela continua o que era.
  const dela = await telemovel(doutra.login, '975318');
  igual(dela.authStore.record.nome, 'Ines');
});

await prova('⚠ e quem não administra não define PIN nenhum', async () => {
  // O Tomás voltou a «adulto» numa prova acima.
  const r = await fetch(`${URL.replace(/\/+$/, '')}/api/casa/pin`, {
    method: 'POST',
    headers: { Authorization: doTomas.authStore.token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ membro: leo.id, pin: '864213' }),
  });
  igual(r.ok, false, 'estado ' + r.status);
});

// ═════════════════════════════════════════════════════════════════════════════
console.log('\n── o PIN vive no servidor: «tem PIN», e a criança muda o seu ──');

// 09/09/2026 — o dono da casa: «tudo deve ser guardado no servidor; o
// administrador pode fazer reset e as crianças podem alterar o PIN».

await prova('⚠ `pin_definido` fica a verdadeiro quando o PIN entra — pelo hook e pela rota', async () => {
  // O Léo nasceu com PIN (o hook de criação) e levou outro pela rota.
  igual((await admin.collection('membros').getOne(leo.id)).pin_definido, true);
  // Uma criança nova SEM PIN fica a falso: é o que o escolhedor da entrada
  // mostra como «Ainda sem PIN — pedir a um adulto».
  const semPin = await admin.collection('membros').create({
    nome: 'Duda', login: `${casa.id}_Duda`, casa: casa.id, papel: 'crianca',
    verified: true, password: '864213', passwordConfirm: '864213' });
  // ⚠ Criada COM palavra-passe (a coleção exige uma), portanto tem PIN — e o
  // hook diz-o. O «sem PIN» a sério só existe em linhas anteriores ao campo.
  igual(semPin.pin_definido, true);
  // E a app lê-o traduzido.
  const lida = await sync.puxarCasa();
  igual(lida.membros.Leo.pinDefinido, true);
  igual(typeof lida.membros.Leo.login, 'string');
});

const rotaPropria = (token, atual, novo) => fetch(`${URL.replace(/\/+$/, '')}/api/casa/pin/proprio`, {
  method: 'POST',
  headers: { Authorization: token, 'Content-Type': 'application/json' },
  body: JSON.stringify({ atual, novo }),
});

await prova('⚠ a criança muda o SEU PIN sabendo o atual — e entra com o novo', async () => {
  const dele = await telemovel(leo.login, '247015');
  const r = await rotaPropria(dele.authStore.token, '247015', '386142');
  igual(r.ok, true, 'estado ' + r.status);
  const d = await r.json();
  igual(d.login, leo.login);
  igual((await telemovel(leo.login, '386142')).authStore.record.nome, 'Leo');
});

await prova('e o PIN antigo deixa de servir, como quando é o adulto a mudá-lo', () =>
  recusado(() => telemovel(leo.login, '247015')));

await prova('⚠ sem o PIN atual certo, nada muda', async () => {
  const dele = await telemovel(leo.login, '386142');
  const r = await rotaPropria(dele.authStore.token, '000000', '592714');
  igual(r.ok, false, 'estado ' + r.status);
  igual((await telemovel(leo.login, '386142')).authStore.record.nome, 'Leo');
});

await prova('⚠ e a qualidade confere-se outra vez no servidor', async () => {
  const dele = await telemovel(leo.login, '386142');
  for (const mau of ['111111', '123456', '987654', '12', 'abcd', '386142']) {
    const r = await rotaPropria(dele.authStore.token, '386142', mau);
    igual(r.ok, false, `«${mau}» passou`);
  }
  igual((await telemovel(leo.login, '386142')).authStore.record.nome, 'Leo');
});

await prova('⚠ um adulto não usa a rota da criança', async () => {
  const r = await rotaPropria(doTomas.authStore.token, 'palavra-longa-2', '592714');
  igual(r.ok, false, 'estado ' + r.status);
  igual((await telemovel('tomas@x.pt', 'palavra-longa-2')).authStore.record.nome, 'Tomas');
});

await prova('⚠ e a criança continua sem poder mudar o PIN de OUTRA criança', async () => {
  // A `updateRule` de `membros` é de quem administra; a rota só toca no
  // próprio. Abrir o update ao próprio para a palavra-passe abria-lhe o papel.
  const dele = await telemovel(leo.login, '386142');
  await recusado(() => dele.collection('membros').update(leo.id, { papel: 'admin' }));
  await recusado(() => dele.collection('membros').update(leo.id, { password: '592714', passwordConfirm: '592714', oldPassword: '386142' }));
});

// A app entra pelo mesmo caminho.
await prova('a app entra a criança pelo servidor (`sync.entrarCrianca`)', async () => {
  const r = await sync.entrarCrianca(leo.login, '386142');
  igual(r.record.nome, 'Leo');
  await recusado(() => sync.entrarCrianca(leo.login, '247015'));
});

await prova('e `sync.mudarMeuPin` muda e volta a entrar com o novo', async () => {
  await sync.mudarMeuPin('386142', '247015');
  igual(sync.sessao().nome, 'Leo');
  igual((await telemovel(leo.login, '247015')).authStore.record.nome, 'Leo');
});

// ═════════════════════════════════════════════════════════════════════════════
console.log('\n── as três listas da casa ──');

// A Rita voltou a ser a única administradora; entra-se outra vez para o `sync`
// ter a sessão dela.
await auth.entrarAdulto('rita@x.pt', 'palavra-longa-1');

for (const [chave, colecao] of Object.entries(sync.LISTA_NO_SERVIDOR)) {
  await prova(`«${chave}» acrescenta uma linha em \`${colecao}\``, async () => {
    const r = await comId(sync.acrescentarNaLista(chave,
      { casa: daRita.casa, nome: 'Fisioterapia' }), `acrescentarNaLista(${chave})`);
    igual((await admin.collection(colecao).getOne(r.id)).nome, 'Fisioterapia');

    // ⚠ Renomear GUARDA a linha. Apagar e criar dava id novo e sem histórico —
    // e numa loja levava atrás as listas de compras que a referem.
    await sync.renomearNaLista(chave, r.id, 'Fisioterapia geral');
    const depois = await admin.collection(colecao).getOne(r.id);
    igual(depois.nome, 'Fisioterapia geral');
    igual(depois.id, r.id, 'a linha mudou de id — foi apagada e recriada');

    await sync.apagarDaLista(chave, r.id);
    await recusado(() => admin.collection(colecao).getOne(r.id));
  });
}

await prova('⚠ e o `puxarCasa` traz as três como listas de TEXTO', async () => {
  // É a forma que oito ecrãs leem. Mudá-la para objetos com id obrigava a
  // mexer neles todos por uma razão que não é deles — daí o mapa à parte.
  const ids = {};
  for (const [chave, colecao] of Object.entries(sync.LISTA_NO_SERVIDOR)) {
    const r = await admin.collection(colecao).create({ casa: casa.id, nome: 'Um nome' });
    ids[chave] = r.id;
  }
  const lida = await sync.puxarCasa();
  for (const chave of Object.keys(sync.LISTA_NO_SERVIDOR)) {
    if (!Array.isArray(lida.listas[chave])) throw new Error(`${chave} não veio como lista`);
    igual(lida.listas[chave].includes('Um nome'), true, chave);
    igual(typeof lida.listas[chave][0], 'string', chave);
    // E o mapa `nome → id`, que é o que permite renomear e apagar.
    igual(lida.listasIds[chave]['Um nome'], ids[chave], chave);
  }
});

await prova('⚠ quem não administra não mexe nas listas', async () => {
  // Mais apertado do que a app, que deixa qualquer adulto criar uma
  // especialidade. Fica dito: é divergência conhecida.
  await recusado(() => doTomas.collection('especialidades').create({
    casa: casa.id, nome: 'Cardiologia' }));
});

await prova('⚠ e ninguém acrescenta à lista de OUTRA casa', async () => {
  // ⚠ Esta prova pedia um `recusado(...)` e falhou por bem: o
  // `acrescentarNaLista` cai na FILA quando o servidor recusa, e devolve
  // `{ pendente: true }` em vez de rebentar. É a mesma armadilha que o
  // `provar-anexo-sobe.mjs` já documenta — um `recusado()` que passa com
  // qualquer erro, ou que não vê erro nenhum, não distingue recusa de nada.
  //
  // O que interessa é a LINHA não existir do outro lado, e é isso que se mede.
  const outra = await admin.collection('casas').create({
    nome: PREFIXO + 'Vizinha', valor_ponto: 0.1 });
  // recusa-esperada: é o ponto da prova. Aqui a escrita TEM de ser travada, e
  // por isso não leva `comId` — o que se mede é a linha não existir do outro
  // lado, três linhas abaixo.
  await sync.acrescentarNaLista('specialities', { casa: outra.id, nome: 'Intrusa' });

  const dela = (await admin.collection('especialidades').getFullList())
    .filter(e => e.casa === outra.id);
  igual(dela.length, 0, dela.map(e => e.nome).join(','));
});

await prova('⚠ e uma escrita recusada NÃO fica a repetir-se para sempre', async () => {
  // A fila é uma rede de segurança para falhas de REDE. Uma recusa de
  // permissão nunca vai passar, e uma fila que a guarde tenta-a a cada
  // arranque, para sempre. Isto mede quantas lá ficaram.
  const p = await sync.pendentes();
  const n = typeof p === 'number' ? p : (p && p.length) || 0;
  if (n > 5) throw new Error(`a fila tem ${n} escritas presas`);
});

resumo();
