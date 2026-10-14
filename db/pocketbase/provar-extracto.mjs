// O extracto do mês — cada movimento, derivado das linhas, na leitura.
//
//   node db/pocketbase/provar-extracto.mjs
//
// Nenhum campo novo no servidor, e NADA se grava ao fechar o mês: o extracto é
// o que o `puxarCasa` junta das `despesas`, `cofre_movimentos`,
// `meta_movimentos`, `acertos` e `transferencias` de cada linha de `meses`. Um
// extracto gravado seria um saldo escrito — o INVARIANTE #2 ao contrário.
//
// Prova-se, contra o servidor a sério:
//   · as CINCO espécies de movimento aparecem, com quem as fez;
//   · o intervalo do mês (o dia do fecho conta; o dia da abertura já é do
//     mês novo) e a despesa anulada que não conta;
//   · o saldo corrente, e que um movimento NEUTRO não lhe toca;
//   · que um mês fechado não muda quando o seguinte cresce nem quando o
//     outro abre — é o arquivo a funcionar;
//   · que a criança não recebe extracto nenhum.
//
// 17/09/2026 — substituiu o `provar-retrato.mjs`, que provava a SOMA das
// mesmas linhas.
import { URL, PREFIXO, comecar, prova, igual, resumo, memoriaDeTelemovel } from './provas.mjs';

const { configurar, auth } = await import('../../src/pocketbase.js');
const sync = await import('../../src/sync.js');
configurar({ url: URL, storage: memoriaDeTelemovel() });

const { pb: admin } = await comecar();
const casa = await admin.collection('casas').create({ nome: PREFIXO + 'Extracto', valor_ponto: 0.1 });
const mk = (nome, papel, extra) => admin.collection('membros').create({
  nome, login: `${casa.id}_${nome}`, casa: casa.id, papel, verified: true, ...extra });
const s = (p) => ({ password: p, passwordConfirm: p });

const rita = await mk('Rita', 'admin', { email: 'rita-ex@x.pt', ...s('palavra-longa-1') });
const tomas = await mk('Tomás', 'adulto', { email: 'tomas-ex@x.pt', ...s('palavra-longa-2') });
const leo = await mk('Leo', 'crianca', { ...s('135790') });

const mercearia = await admin.collection('envelopes').create({ casa: casa.id, nome: 'Mercearia', limite_base: 450 });
const lazer = await admin.collection('envelopes').create({ casa: casa.id, nome: 'Lazer', limite_base: 120 });

// Agosto fechado a 31/08; Setembro aberto a 01/09.
await admin.collection('meses').create({ casa: casa.id, mes: '2026-08-01', rendimento: 3000, fechado_em: '2026-08-31',
  limites: { Mercearia: 450, Lazer: 120 } });
const setembro = await admin.collection('meses').create({ casa: casa.id, mes: '2026-09-01', rendimento: 3000,
  limites: { Mercearia: 500, Lazer: 120 } });

const despesa = (data, valor, envelope, extra = {}) => admin.collection('despesas').create({
  casa: casa.id, envelope: envelope.id, valor, data, pagador: rita.id, descricao: `compra de ${data}`,
  idem_key: `ex-${data}-${valor}-${envelope.nome}`, ...extra });
await despesa('2026-08-03', 100.5, mercearia);
await despesa('2026-08-31', 20, lazer, { divide_meias: true });        // o dia do fecho conta em Agosto
await despesa('2026-08-15', 999, mercearia, { anula_id: 'x' });        // anulada: não conta
await despesa('2026-09-01', 30.25, mercearia);                         // o dia da abertura é já Setembro

// As outras quatro espécies, todas em Agosto.
await admin.collection('cofre_movimentos').create({ casa: casa.id, membro: leo.id, tipo: 'semanada',
  valor: 4.2, pontos: 14, data: '2026-08-10', autorizado_por: rita.id, motivo: 'Semanada', idem_key: 'ex-cof1' });
const meta = await admin.collection('metas').create({ casa: casa.id, nome: 'Bicicleta', alvo: 550 });
await admin.collection('meta_movimentos').create({ casa: casa.id, meta: meta.id, valor: 30,
  motivo: 'Reforço de Agosto', por: tomas.id, data: '2026-08-12', idem_key: 'ex-meta1' });
await admin.collection('acertos').create({ casa: casa.id, de_membro: tomas.id, para_membro: rita.id,
  valor: 40, data: '2026-08-28', idem_key: 'ex-ac1' });
await admin.collection('transferencias').create({ casa: casa.id, de_envelope: lazer.id,
  para_envelope: mercearia.id, valor: 25, mes: '2026-08-20', por: rita.id, idem_key: 'ex-tr1' });

await auth.entrarAdulto('rita-ex@x.pt', 'palavra-longa-1');

console.log('\n── cada movimento, com quem o fez ──');

let extractos = null;
await prova('o `puxarCasa` traz um extracto por mês, do mais recente para o mais antigo', async () => {
  extractos = (await sync.puxarCasa()).extractos;
  igual(extractos.length, 2);
  igual(extractos[0].nome, 'Setembro de 2026');
  igual(extractos[0].aberto, true);
  igual(extractos[1].nome, 'Agosto de 2026');
  igual(extractos[1].aberto, false);
  igual(extractos[1].fechadoEm, 'd2026-08-31');
});

await prova('as CINCO espécies aparecem em Agosto, mais a abertura do mês', () => {
  const especies = extractos[1].movimentos.map(m => m.especie).sort().join(',');
  igual(especies, 'acerto,cofre,despesa,despesa,meta,rendimento,transferencia');
});

await prova('cada movimento diz quanto, quando e QUEM', () => {
  const por = Object.fromEntries(extractos[1].movimentos.map(m => [m.especie, m]));
  igual(por.despesa.quem, 'Rita');
  igual(por.cofre.quem, 'Rita');          // quem AUTORIZA a semanada
  igual(por.cofre.detalhe, 'Cofre · Leo');
  igual(por.meta.quem, 'Tomás');
  igual(por.meta.valor, -30);
  igual(por.acerto.quem, 'Tomás');
  igual(por.transferencia.titulo, 'Lazer → Mercearia');
  igual(por.rendimento.quem, null);       // a coleção `meses` não guarda quem abriu
});

await prova('⚠ a despesa ANULADA não entra, e o dia do fecho conta em Agosto', () => {
  const despesas = extractos[1].movimentos.filter(m => m.especie === 'despesa');
  igual(despesas.length, 2);
  igual(despesas.map(d => -d.valor).sort((a, b) => a - b).join(','), '20,100.5');
  igual(extractos[1].saiu, 100.5 + 20 + 4.2 + 30);
});

await prova('⚠ o dia da ABERTURA já é do mês novo', () => {
  const set = extractos[0].movimentos.filter(m => m.especie === 'despesa');
  igual(set.length, 1);
  igual(set[0].valor, -30.25);
});

await prova('⚠ e a abertura vem PRIMEIRO no dia dela — o saldo não mergulha', () => {
  // Setembro abriu a 01/09 e a casa gastou 30,25 € nesse mesmo dia. O
  // desempate era só alfabético e `despesa:` vem antes de `mes:`: o rendimento
  // aparecia a meio do dia 1 e o saldo ia a −30,25 € antes de o dinheiro
  // entrar. Apanhado em 18/09/2026 numa captura do dono da casa.
  const st = extractos[0];
  const noDia1 = st.movimentos.filter(m => m.data === '2026-09-01');
  igual(noDia1.length, 2);
  // A lista vem do mais recente para o mais antigo: a abertura é a última.
  igual(noDia1[noDia1.length - 1].especie, 'rendimento');
  igual(noDia1[0].especie, 'despesa');
  igual(noDia1[noDia1.length - 1].saldo, 3000);
  igual(noDia1[0].saldo, 2969.75);
  igual(st.movimentos.filter(m => !m.neutro).every(m => m.saldo > 0), true);
});

console.log('\n── o saldo corrente, e o que não lhe toca ──');

await prova('o saldo desce a cada saída e começa no rendimento do mês', () => {
  const por = Object.fromEntries(extractos[1].movimentos.map(m => [m.chave.split(':')[0] + ':' + m.data, m]));
  igual(por['mes:2026-08-01'].saldo, 3000);
  igual(por['despesa:2026-08-03'].saldo, 2899.5);
  igual(por['cofre:2026-08-10'].saldo, 2895.3);
  igual(por['meta:2026-08-12'].saldo, 2865.3);
  igual(por['despesa:2026-08-31'].saldo, 2845.3);
  igual(extractos[1].sobrou, 2845.3);
});

await prova('⚠ um acerto e uma transferência APARECEM e NÃO mexem no saldo', () => {
  const neutros = extractos[1].movimentos.filter(m => m.neutro);
  igual(neutros.length, 2);
  igual(neutros.map(m => m.valor).sort((a, b) => a - b).join(','), '25,40');
  // O dinheiro mudou de mão e de gaveta; a casa ficou com o mesmo.
  const transf = neutros.find(m => m.especie === 'transferencia');   // 20/08
  igual(transf.saldo, 2865.3);                                        // o mesmo do movimento anterior
});

console.log('\n── o arquivo: o que está fechado não muda ──');

await prova('⚠ o extracto de Agosto não muda quando Setembro cresce nem quando Outubro abre', async () => {
  const antes = JSON.stringify(extractos[1]);
  await despesa('2026-09-20', 77, mercearia);
  await admin.collection('meses').update(setembro.id, { fechado_em: '2026-09-30' });
  await admin.collection('meses').create({ casa: casa.id, mes: '2026-10-01', rendimento: 3000, limites: {} });
  const depois = (await sync.puxarCasa()).extractos;
  igual(depois.length, 3);
  igual(JSON.stringify(depois.find(e => e.nome === 'Agosto de 2026')), antes);
  igual(depois.find(e => e.nome === 'Setembro de 2026').saiu, 30.25 + 77);
  igual(depois.find(e => e.nome === 'Outubro de 2026').movimentos.length, 1);   // só a abertura
});

console.log('\n── só adultos ──');

await prova('⚠ a criança não recebe extracto nenhum — é o dinheiro da casa', async () => {
  await auth.entrarCrianca(`${casa.id}_Leo`, '135790');
  igual((await sync.puxarCasa()).extractos.length, 0);
});

resumo();
