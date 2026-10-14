// Prova os hooks: qualidade do PIN, força da palavra-passe de adulto,
// minimização e as guardas de papel. Um hook por testar é um hook que não existe.
//   node db/pocketbase/provar-hooks.mjs
import { PREFIXO, comecar, prova, recusado, resumo } from './provas.mjs';

// Casa de provas, limpa. Só o que é das provas é apagado — o que estiver
// noutra casa fica onde está.
const { pb } = await comecar();

const casa = await pb.collection('casas').create({ nome: PREFIXO + 'Prova', valor_ponto: 0.1 });
const mk = (nome, papel, extra) => pb.collection('membros').create({
  nome, login: `${casa.id}_${nome}`, casa: casa.id, papel, ...extra,
});
const senha = (p) => ({ password: p, passwordConfirm: p });

console.log('\n── qualidade do PIN ──');
await prova('quatro dígitos iguais recusados', () => recusado(() => mk('a', 'crianca', senha('111111'))));
await prova('sequência recusada',              () => recusado(() => mk('b', 'crianca', senha('123456'))));
await prova('sequência invertida recusada',    () => recusado(() => mk('b2', 'crianca', senha('987654'))));
await prova('letras recusadas',                () => recusado(() => mk('c', 'crianca', senha('12ab'))));
let leo;
await prova('PIN válido aceite', async () => { leo = await mk('leo', 'crianca', senha('135790')); });

console.log('\n── palavra-passe de adulto ──');
await prova('adulto com 4 caracteres recusado',
  () => recusado(() => mk('d', 'adulto', { email: 'd@x.pt', ...senha('135790') })));
let rita;
await prova('adulto com palavra longa aceite', async () => {
  rita = await mk('rita', 'admin', { email: 'r@x.pt', ...senha('palavra-longa-1') });
});

console.log('\n── §8: minimização ──');
await prova('criança com e-mail recusada',
  () => recusado(() => mk('e', 'crianca', { email: 'e@x.pt', ...senha('135790') })));
await prova('criança sem e-mail: é assim que fica', () => {
  if (leo.email) throw new Error('a criança ficou com e-mail');
});

console.log('\n── §4: guardas de papel ──');
await prova('despromover o último administrador recusado',
  () => recusado(() => pb.collection('membros').update(rita.id, { papel: 'adulto' })));
await prova('adulto → criança recusado', async () => {
  const t = await mk('tomas', 'adulto', { email: 't@x.pt', ...senha('palavra-longa-2') });
  await recusado(() => pb.collection('membros').update(t.id, { papel: 'crianca' }));
});
await prova('com dois administradores, despromover um é permitido', async () => {
  const t = (await pb.collection('membros').getFullList()).find(m => m.nome === 'tomas');
  await pb.collection('membros').update(t.id, { papel: 'admin' });
  await pb.collection('membros').update(rita.id, { papel: 'adulto' });
});

resumo();
