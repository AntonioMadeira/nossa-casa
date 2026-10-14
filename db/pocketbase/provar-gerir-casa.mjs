// As quatro operações da casa, contra o servidor a sério.
//
// Mudar o nome da família, acrescentar um membro, editar um membro, e tirar
// alguém da casa. Os testes em `__tests__/loja-a-correr.test.js` provam o que
// acontece SEM servidor — a validação e a recusa. Estas provam o que acontece
// COM ele, que é o caso que interessa: é o servidor que decide quem pode o
// quê, e é dele que vêm as recusas que o ecrã tem de saber explicar.
//
// Cada prova que verifica uma RECUSA falha se a operação passar. É a mesma
// disciplina de provar-regras.mjs: uma regra que só se testa pelo lado que
// funciona não está testada.
//
//   node db/pocketbase/provar-gerir-casa.mjs
import PocketBase from 'pocketbase';
import { URL, PREFIXO, comecar, criarCasa, criarMembro, prova, igual, resumo } from './provas.mjs';

const { pb: admin } = await comecar();
const casa = await criarCasa(admin, 'Ferreira', {
  rendimento_mensal: 2800, dia_pagamento: 0, divide_meias: true,
});
const membro = (nome, papel, extra) => criarMembro(admin, casa, nome, papel, extra);

const ana = await membro('Ana', 'admin', {
  email: 'ana@exemplo.pt', password: 'palavra-longa-1', passwordConfirm: 'palavra-longa-1',
  verified: true, fem: true });
const bruno = await membro('Bruno', 'adulto', {
  email: 'bruno@exemplo.pt', password: 'palavra-longa-2', passwordConfirm: 'palavra-longa-2',
  verified: true });
const carlos = await membro('Carlos', 'crianca', {
  password: '247015', passwordConfirm: '247015', verified: true });

// Uma segunda casa, para provar que a gestão de uma não chega à outra.
const outra = await criarCasa(admin, 'Vizinhos');
const vizinha = await criarMembro(admin, outra, 'Zita', 'admin', {
  email: 'zita@exemplo.pt', password: 'palavra-longa-9', passwordConfirm: 'palavra-longa-9',
  verified: true });

// Uma recusa que passa é o defeito que estas provas procuram.
const recusa = async (o_que, fn) => {
  let passou = false;
  try { await fn(); passou = true; } catch { /* recusado, como devia */ }
  if (passou) throw new Error(`${o_que} PASSOU, e não devia`);
};

const comoMembro = async (identidade, senha) => {
  const c = new PocketBase(URL);
  c.autoCancellation(false);   // uma escrita não se perde por chegar outra atrás
  await c.collection('membros').authWithPassword(identidade, senha);
  return c;
};
const daAna = await comoMembro('ana@exemplo.pt', 'palavra-longa-1');
const doBruno = await comoMembro('bruno@exemplo.pt', 'palavra-longa-2');
const daZita = await comoMembro('zita@exemplo.pt', 'palavra-longa-9');

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n── mudar o nome da família ──');

await prova('a administração muda o nome da casa', async () => {
  await daAna.collection('casas').update(casa.id, { nome: PREFIXO + 'Ferreira-Lopes' });
  const lida = await daAna.collection('casas').getOne(casa.id);
  igual(lida.nome, PREFIXO + 'Ferreira-Lopes');
});

await prova('um adulto que não administra NÃO muda o nome da casa', () =>
  recusa('mudar o nome sendo adulto', () =>
    doBruno.collection('casas').update(casa.id, { nome: PREFIXO + 'do Bruno' })));

await prova('a administração de outra casa NÃO mexe nesta', () =>
  recusa('mudar o nome de outra casa', () =>
    daZita.collection('casas').update(casa.id, { nome: PREFIXO + 'da Zita' })));

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n── acrescentar um membro ──');

let dina = null;
await prova('a administração acrescenta uma criança, com PIN', async () => {
  dina = await daAna.collection('membros').create({
    casa: casa.id, nome: 'Dina', papel: 'crianca', fem: true,
    login: `${casa.id}_dina`, password: '369152', passwordConfirm: '369152',
  });
  igual(dina.papel, 'crianca');
  // O PIN não volta em claro de lado nenhum
  igual(dina.password, undefined, 'o PIN não pode voltar na resposta');
});

await prova('a criança nova entra com o seu PIN', async () => {
  const c = new PocketBase(URL);
  c.autoCancellation(false);   // uma escrita não se perde por chegar outra atrás
  await c.collection('membros').authWithPassword(`${casa.id}_dina`, '369152');
  igual(c.authStore.record.nome, 'Dina');
});

let eva = null;
await prova('a administração acrescenta um adulto, com e-mail', async () => {
  eva = await daAna.collection('membros').create({
    casa: casa.id, nome: 'Eva', papel: 'adulto', fem: true, email: 'eva@exemplo.pt',
    login: `${casa.id}_eva`, password: 'palavra-longa-3', passwordConfirm: 'palavra-longa-3',
  });
  igual(eva.papel, 'adulto');
});

await prova('um adulto que não administra NÃO acrescenta membros', () =>
  recusa('acrescentar sendo adulto', () =>
    doBruno.collection('membros').create({
      casa: casa.id, nome: 'Intruso', papel: 'adulto', login: `${casa.id}_intruso`,
      email: 'intruso@exemplo.pt', password: 'palavra-longa-4', passwordConfirm: 'palavra-longa-4',
    })));

await prova('a administração de outra casa NÃO acrescenta membros a esta', () =>
  recusa('acrescentar noutra casa', () =>
    daZita.collection('membros').create({
      casa: casa.id, nome: 'Zeca', papel: 'adulto', login: `${casa.id}_zeca`,
      email: 'zeca@exemplo.pt', password: 'palavra-longa-5', passwordConfirm: 'palavra-longa-5',
    })));

await prova('dois membros não podem ter o mesmo login', () =>
  recusa('repetir o login', () =>
    daAna.collection('membros').create({
      casa: casa.id, nome: 'Dina', papel: 'crianca', login: `${casa.id}_dina`,
      password: '582714', passwordConfirm: '582714',
    })));

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n── editar um membro ──');

await prova('a administração promove um adulto a administração', async () => {
  await daAna.collection('membros').update(bruno.id, { papel: 'admin' });
  const lido = await daAna.collection('membros').getOne(bruno.id);
  igual(lido.papel, 'admin');
});

await prova('a concordância de género grava e volta', async () => {
  await daAna.collection('membros').update(eva.id, { fem: true });
  igual((await daAna.collection('membros').getOne(eva.id)).fem, true);
});

await prova('um adulto NÃO se promove a si próprio', async () => {
  // A Eva é adulta e não administra
  const daEva = await comoMembro('eva@exemplo.pt', 'palavra-longa-3');
  await recusa('promover-se a si próprio', () =>
    daEva.collection('membros').update(eva.id, { papel: 'admin' }));
});

await prova('ninguém edita membros de outra casa', () =>
  recusa('editar membro de outra casa', () =>
    daAna.collection('membros').update(vizinha.id, { papel: 'adulto' })));

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n── renomear um membro ──');

await prova('a administração muda o nome, e o login acompanha', async () => {
  await daAna.collection('membros').update(dina.id, {
    nome: 'Diana', login: `${casa.id}_diana`,
  });
  const lida = await daAna.collection('membros').getOne(dina.id);
  igual(lida.nome, 'Diana');
  igual(lida.login, `${casa.id}_diana`);
});

await prova('a criança entra com o login novo, e não com o antigo', async () => {
  const c = new PocketBase(URL);
  c.autoCancellation(false);   // uma escrita não se perde por chegar outra atrás
  await c.collection('membros').authWithPassword(`${casa.id}_diana`, '369152');
  igual(c.authStore.record.nome, 'Diana');
  await recusa('entrar com o login antigo', () =>
    new PocketBase(URL).collection('membros').authWithPassword(`${casa.id}_dina`, '369152'));
});

// O nome muda; o identificador não. É isso que faz o histórico continuar a
// apontar para a mesma pessoa em vez de ficar órfão — do lado do servidor as
// relações são por id, ao contrário da loja local, onde são por nome.
await prova('o identificador não muda com o nome, e o histórico segue-o', async () => {
  igual((await daAna.collection('membros').getOne(dina.id)).id, dina.id);
  await daAna.collection('cofre_movimentos').create({
    casa: casa.id, membro: dina.id, tipo: 'semanada', valor: 3,
    motivo: 'depois de renomear', data: '2026-08-30', autorizado_por: ana.id,
    idem_key: 'prova-renomear-1',
  });
  const meus = (await daAna.collection('cofre_movimentos').getFullList())
    .filter(m => m.membro === dina.id);
  igual(meus.length, 1);
});

await prova('um adulto que não administra NÃO renomeia ninguém', async () => {
  // O Bruno foi promovido na secção anterior; volta a adulto, senão isto
  // testava um administrador e passava por engano. Foi o que aconteceu à
  // primeira: a prova dizia «PASSOU, e não devia» e a culpa era da ordem.
  await daAna.collection('membros').update(bruno.id, { papel: 'adulto' });
  const comoAdulto = await comoMembro('bruno@exemplo.pt', 'palavra-longa-2');
  await recusa('renomear sendo adulto', () =>
    comoAdulto.collection('membros').update(dina.id, { nome: 'Doroteia' }));
});

await prova('dois membros não ficam com o mesmo login por renomear', () =>
  recusa('renomear para um login que já existe', () =>
    daAna.collection('membros').update(dina.id, { login: `${casa.id}_ana` })));

await prova('a administração de outra casa NÃO renomeia ninguém desta', () =>
  recusa('renomear noutra casa', () =>
    daZita.collection('membros').update(dina.id, { nome: 'Zulmira' })));

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n── tirar da casa ──');

await prova('a administração tira da casa quem não tem histórico', async () => {
  await daAna.collection('membros').delete(eva.id);
  await recusa('ler quem já saiu', () => daAna.collection('membros').getOne(eva.id));
});

// Esta é a recusa que mais custa a explicar no ecrã, e por isso é a que mais
// importa provar: o histórico da casa não se apaga por alguém sair.
await prova('quem tem histórico NÃO sai — o histórico da casa fica', async () => {
  await daAna.collection('cofre_movimentos').create({
    casa: casa.id, membro: carlos.id, tipo: 'semanada', valor: 5,
    motivo: 'semanada da semana', data: '2026-08-30', autorizado_por: ana.id,
    idem_key: 'prova-historico-1',
  });
  await recusa('remover quem tem movimentos', () =>
    daAna.collection('membros').delete(carlos.id));
  // e continua lá, inteiro
  igual((await daAna.collection('membros').getOne(carlos.id)).nome, 'Carlos');
});

await prova('um adulto que não administra NÃO tira ninguém da casa', async () => {
  const comoAdulto = await comoMembro('bruno@exemplo.pt', 'palavra-longa-2');
  await recusa('remover sendo adulto', () =>
    comoAdulto.collection('membros').delete(dina.id));
});

await prova('a casa não fica sem administração', async () => {
  // A Ana é a única a administrar. Nem se despromove, nem sai.
  await recusa('despromover a última administração', () =>
    daAna.collection('membros').update(ana.id, { papel: 'adulto' }));
  await recusa('remover a última administração', () =>
    daAna.collection('membros').delete(ana.id));
  igual((await daAna.collection('membros').getOne(ana.id)).papel, 'admin');
});

await prova('a administração de outra casa NÃO tira ninguém desta', () =>
  recusa('remover noutra casa', () => daZita.collection('membros').delete(dina.id)));

// ─────────────────────────────────────────────────────────────────────────────
resumo();
