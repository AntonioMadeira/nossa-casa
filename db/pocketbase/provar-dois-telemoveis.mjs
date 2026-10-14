// A prova de que a ligação serve para alguma coisa.
//
// O INVARIANTE #2 diz que saldos são somas de movimentos, nunca campos
// escritos, e a razão está escrita no CLAUDE.md: «é isto que impede dois
// telefones de se anularem quando ambos alteram a mesma casa — e é a
// diferença entre uma app que funciona a dois e uma que perde dinheiro».
//
// Localmente isso já era verdade. Estas provas mostram que continua a ser
// verdade com dois clientes ao mesmo tempo, que é onde deixa de ser óbvio.
//
//   node db/pocketbase/provar-dois-telemoveis.mjs
import PocketBase from 'pocketbase';
import { URL, comecar, criarCasa, criarMembro, prova, igual, resumo } from './provas.mjs';

// ── Casa de provas, limpa ────────────────────────────────────────────────────
// Só o que é das provas é apagado. O que estiver noutra casa fica onde está.
const { pb: admin } = await comecar();
const casa = await criarCasa(admin, 'Bengui', {
  rendimento_mensal: 3200, dia_pagamento: 0, divide_meias: true,
});
const membro = (nome, papel, extra) => criarMembro(admin, casa, nome, papel, extra);
const rita = await membro('Rita', 'admin', {
  email: 'rita@exemplo.pt', password: 'palavra-longa-1', passwordConfirm: 'palavra-longa-1', verified: true });
const tomas = await membro('Tomas', 'adulto', {
  email: 'tomas@exemplo.pt', password: 'palavra-longa-2', passwordConfirm: 'palavra-longa-2', verified: true });
const leo = await membro('Leo', 'crianca', { password: '135790', passwordConfirm: '135790', verified: true });

// Dois clientes distintos: dois telemóveis, cada um com a sua sessão.
const telemovel = async (identidade, senha) => {
  const c = new PocketBase(URL);
  c.autoCancellation(false);   // uma escrita não se perde por chegar outra atrás
  await c.collection('membros').authWithPassword(identidade, senha);
  return c;
};
const daRita = await telemovel('rita@exemplo.pt', 'palavra-longa-1');
const doTomas = await telemovel('tomas@exemplo.pt', 'palavra-longa-2');

const saldoDoLeo = async (cliente) => {
  const v = (await cliente.collection('v_cofre_saldo').getFullList()).find(x => x.membro === leo.id);
  return v ? Math.round(v.saldo * 100) / 100 : 0;
};

console.log('\n── dois telemóveis, o mesmo cofre ──');

await prova('o cofre começa a zero', async () => igual(await saldoDoLeo(daRita), 0));

await prova('cada um credita 5 € e o cofre fica com 10, não com 5', async () => {
  await daRita.collection('cofre_movimentos').create({
    casa: casa.id, membro: leo.id, tipo: 'bonus', valor: 5, motivo: 'Bónus da Rita',
    idem_key: 'rita-bonus-1' });
  await doTomas.collection('cofre_movimentos').create({
    casa: casa.id, membro: leo.id, tipo: 'bonus', valor: 5, motivo: 'Bónus do Tomás',
    idem_key: 'tomas-bonus-1' });
  igual(await saldoDoLeo(daRita), 10, 'se desse 5, um telemóvel tinha apagado o outro');
  igual(await saldoDoLeo(doTomas), 10, 'os dois têm de ver o mesmo');
});

// Esta apanhou que a camada de sincronização escrevia `descricao` onde a
// coleção tem `motivo`: o PocketBase ignora campos que não conhece em
// silêncio, portanto a escrita passava e o texto caía.
await prova('os dois movimentos ficam ambos no extrato, com o motivo', async () => {
  const ms = await daRita.collection('cofre_movimentos').getFullList();
  igual(ms.length, 2);
  igual(ms.filter(m => m.motivo === 'Bónus da Rita').length, 1);
  igual(ms.filter(m => m.motivo === 'Bónus do Tomás').length, 1);
});

console.log('\n── a fila reenvia sem pagar duas vezes ──');

await prova('a mesma chave duas vezes não credita duas vezes', async () => {
  const antes = await saldoDoLeo(daRita);
  // é isto que acontece quando a fila reenvia depois de uma reconexão
  await daRita.collection('cofre_movimentos').create({
    casa: casa.id, membro: leo.id, tipo: 'semanada', valor: 1.6, idem_key: 'semanada-17-08' });
  const meio = await saldoDoLeo(daRita);
  igual(Math.round((meio - antes) * 100) / 100, 1.6);
  try {
    await daRita.collection('cofre_movimentos').create({
      casa: casa.id, membro: leo.id, tipo: 'semanada', valor: 1.6, idem_key: 'semanada-17-08' });
  } catch { /* recusado pelo índice único, que é o que se quer */ }
  igual(await saldoDoLeo(daRita), meio, 'a semanada foi paga duas vezes');
});

console.log('\n── o saldo não tem caminho de escrita ──');

await prova('nem a administração escreve um saldo', async () => {
  try {
    await daRita.collection('v_cofre_saldo').update(
      (await daRita.collection('v_cofre_saldo').getFullList())[0].id, { saldo: 999 });
    throw new Error('PASSOU — devia ter sido recusado');
  } catch (e) { if (/PASSOU/.test(e.message)) throw e; }
});

await prova('nem apaga um movimento para «corrigir» o saldo', async () => {
  const m = (await daRita.collection('cofre_movimentos').getFullList())[0];
  try {
    await daRita.collection('cofre_movimentos').delete(m.id);
    throw new Error('PASSOU — devia ter sido recusado');
  } catch (e) { if (/PASSOU/.test(e.message)) throw e; }
});

console.log('\n── a criança vê o seu, e só o seu ──');

await prova('o Léo vê o saldo dele mas não mexe nele', async () => {
  const c = await telemovel(leo.login, '135790');
  const v = await c.collection('v_cofre_saldo').getFullList();
  igual(v.length, 1);
  igual(v[0].membro, leo.id);
  try {
    await c.collection('cofre_movimentos').create({
      casa: casa.id, membro: leo.id, tipo: 'bonus', valor: 100, idem_key: 'batota' });
    throw new Error('PASSOU — devia ter sido recusado');
  } catch (e) { if (/PASSOU/.test(e.message)) throw e; }
});

resumo();
