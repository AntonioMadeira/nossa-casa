// Prova o próprio src/pocketbase.js contra um servidor — não o SDK cru.
// É a diferença entre «o cliente está escrito» e «o cliente funciona».
//   node db/pocketbase/provar-cliente.mjs
import { URL, PREFIXO, comecar, prova, igual, resumo } from './provas.mjs';
import { configurar, estaLigado, auth, ler, escrever, google } from '../../src/pocketbase.js';

// Um AsyncStorage de mentira, em memória. É para isto que o módulo aceita
// armazenamento injetado.
const memoria = new Map();
const storage = {
  getItem: async (k) => (memoria.has(k) ? memoria.get(k) : null),
  setItem: async (k, v) => { memoria.set(k, v); },
  removeItem: async (k) => { memoria.delete(k); },
};

// ── Dados de prova, pelo caminho de administração ─────────────────────────────
// Casa de provas, limpa. Só o que é das provas é apagado — o que estiver
// noutra casa fica onde está.
const { pb: admin } = await comecar();
const casa = await admin.collection('casas').create({ nome: PREFIXO + 'Bengui', valor_ponto: 0.1 });
const rita = await admin.collection('membros').create({
  nome: 'rita', login: `${casa.id}_rita`, casa: casa.id, papel: 'admin',
  email: 'rita@x.pt', password: 'palavra-longa-1', passwordConfirm: 'palavra-longa-1', verified: true });
const leo = await admin.collection('membros').create({
  nome: 'leo', login: `${casa.id}_leo`, casa: casa.id, papel: 'crianca',
  password: '135790', passwordConfirm: '135790', verified: true });
await admin.collection('envelopes').create({ casa: casa.id, nome: 'Mercearia', limite_base: 550 });

// ── Provas ───────────────────────────────────────────────────────────────────
console.log('\n── a ligação é opcional ──');
await prova('sem URL, o módulo diz que não está ligado', () => {
  configurar({ storage, url: '' });
  igual(estaLigado(), false);
});
await prova('sem URL, uma leitura recusa em vez de rebentar', async () => {
  try { await ler.casa(); throw new Error('devia ter recusado'); }
  catch (e) { igual(e.message, 'Servidor não configurado.'); }
});
await prova('a fila continua a aceitar escritas offline', async () => {
  const r = await escrever.criar('cofre_movimentos', { casa: casa.id, membro: leo.id, tipo: 'bonus', valor: 1 });
  igual(r.pendentes, 1, 'a escrita não ficou em fila');
});

console.log('\n── com servidor ──');
configurar({ storage, url: URL });
await prova('agora diz que está ligado', () => igual(estaLigado(), true));

await prova('o adulto entra por e-mail', async () => {
  await auth.entrarAdulto('rita@x.pt', 'palavra-longa-1');
  igual(auth.valida(), true);
  igual(auth.membro().nome, 'rita');
});

await prova('a fila pendente esvazia ao ligar', async () => {
  const r = await escrever.esvaziar();
  igual(r.pendentes, 0, `ficaram ${r.pendentes}`);
  igual(r.enviadas, 1);
});

await prova('ler.casa() devolve as coleções', async () => {
  const d = await ler.casa();
  igual(Array.isArray(d.envelopes), true);
  igual(d.envelopes.length, 1);
  igual(d.membros.length, 2);
});

await prova('escrever.criar põe chave de idempotência sozinha', async () => {
  await escrever.criar('cofre_movimentos', { casa: casa.id, membro: leo.id, tipo: 'bonus', valor: 2 });
  const movs = await ler.colecao('cofre_movimentos');
  if (!movs.every(m => m.idem_key)) throw new Error('há movimentos sem chave');
});

// ⚠ Duas escritas AO MESMO TEMPO — é o que a loja faz sempre: o movimento de
// dinheiro e, um instante depois, a linha do registo. A fila lia-se e
// regravava-se com `await` pelo meio, e a segunda escrita gravava por cima da
// primeira: o bónus morria sem ser enviado e o registo ia duas vezes. Apanhado
// em 13/09/2026 na casa simulada. Aqui não se espera pela primeira antes de
// pedir a segunda — é essa a prova.
await prova('⚠ duas escritas em simultâneo chegam AMBAS, e nenhuma vai duas vezes', async () => {
  const antes = (await ler.colecao('cofre_movimentos')).length;
  const texto = `Bónus em simultâneo ${Date.now()}`;
  const [a, b] = await Promise.all([
    escrever.criar('cofre_movimentos', { casa: casa.id, membro: leo.id, tipo: 'bonus', valor: 0.5, motivo: 'simultâneo' }),
    escrever.criar('registo', { casa: casa.id, texto, quem: rita.id, quando: new Date().toISOString(), area: 'Dinheiro' }),
  ]);
  igual(a.recusadas.length + b.recusadas.length, 0, 'uma das duas foi recusada');
  igual((await ler.colecao('cofre_movimentos')).length, antes + 1, 'o movimento perdeu-se na fila');
  const linhas = (await ler.colecao('registo')).filter(r => r.texto === texto);
  igual(linhas.length, 1, `o registo foi ${linhas.length} vezes`);
  igual(await escrever.pendentes(), 0);
});

await prova('o saldo é a soma das vistas, não um campo', async () => {
  const v = await ler.colecao('v_cofre_saldo');
  const doLeo = v.find(x => x.membro === leo.id);
  igual(doLeo.saldo, 3.5, 'os três bónus não somaram');
});

// A fotografia de um equipamento sobe pelo `update` com ficheiro, e a leitura
// devolve um URL que se abre. Até 13/09/2026 a app escolhia a fotografia e
// nunca a subia — a `fatura` no servidor ficava vazia, e o `blob:` local
// morria ao recarregar a página.
await prova('⚠ a fatura de um equipamento sobe como ficheiro, e lê-se de volta por URL', async () => {
  const eq = await admin.collection('equipamentos').create({ casa: casa.id, nome: 'Frigorífico da prova', preco: 899 });
  igual(eq.fatura, '', 'nasce sem fatura');
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
  const r = await escrever.atualizarComFicheiro('equipamentos', eq.id,
    { campo: 'fatura', blob: new Blob([png], { type: 'image/png' }), nome: 'fatura.png', tipo: 'image/png' });
  igual(!!r.fatura, true, 'o servidor não guardou o ficheiro');
  const url = ler.ficheiro(r, 'fatura');
  igual(/\/api\/files\//.test(String(url)), true, `o URL não é do servidor: ${url}`);
  const resposta = await fetch(url);
  igual(resposta.status, 200, `o ficheiro não se abre: ${resposta.status}`);
  igual((await resposta.arrayBuffer()).byteLength, png.length, 'os bytes não são os mesmos');
  // E a lista traz a fatura preenchida — é daí que a app lê o URL.
  const lido = (await ler.colecao('equipamentos')).find(x => x.id === eq.id);
  igual(!!(lido && lido.fatura), true, 'a leitura não traz a fatura');
});

console.log('\n── a criança, pelo mesmo cliente ──');
await prova('entra pelo login com o PIN', async () => {
  auth.sair();
  await auth.entrarCrianca(leo.login, '135790');
  igual(auth.membro().nome, 'leo');
});
await prova('e o orçamento vem VAZIO — a regra é do servidor', async () => {
  const d = await ler.casa();
  igual(d.envelopes.length, 0, 'a criança recebeu envelopes');
  igual(d.despesas.length, 0);
});
await prova('mas o cofre dela vem', async () => {
  igual((await ler.colecao('cofre_movimentos')).length, 3);
});

console.log('\n── a saúde, pelo cliente ──');
// A ficha é criada pelo caminho de administração; o que se prova é quem a lê.
const ep = await admin.collection('episodios_saude').create({
  casa: casa.id, membro: leo.id, especialidade: 'Pediatria', dia: '2026-08-28', medico: 'Dr.ª Neves' });
await admin.collection('anexos').create({
  casa: casa.id, episodio: ep.id, titulo: 'Análises', tipo: 'exame' });
const epRita = await admin.collection('episodios_saude').create({
  casa: casa.id, membro: rita.id, especialidade: 'Medicina geral', dia: '2026-07-11' });

// ⚠ Esta prova exigia o contrário — «a criança lê a sua ficha e os seus
// anexos». O `podeVerSaude` do cliente diz que não lê e o ecrã da Saúde promete
// «invisíveis às próprias»; era o servidor que discordava dos dois. Corrigido
// em 03/09/2026, por decisão do dono da casa.
//
// O que importa aqui é que a recusa vem pela CONSULTA, não pela interface: o
// `ler.saude()` devolve vazio, portanto a ficha nunca chega ao dispositivo da
// criança. É o INVARIANTE #3 medido do lado do cliente.
await prova('a criança pede a SUA ficha e recebe VAZIO', async () => {
  const f = await ler.saude(leo.id);
  igual(f.episodios.length, 0, 'a ficha da criança chegou ao dispositivo dela');
  igual(f.anexos.length, 0, 'os anexos dela chegaram');
});
await prova('a criança pede a ficha da Rita e recebe VAZIO', async () => {
  const f = await ler.saude(rita.id);
  igual(f.episodios.length, 0, 'a criança viu a ficha de um adulto');
});
await prova('o adulto lê a ficha da criança', async () => {
  auth.sair();
  await auth.entrarAdulto('rita@x.pt', 'palavra-longa-1');
  const f = await ler.saude(leo.id);
  igual(f.episodios.length, 1);
  igual(f.anexos.length, 1);
});
await prova('e a sua própria', async () => igual((await ler.saude(rita.id)).episodios.length, 1));

console.log('\n── Google: o que se pode provar sem credenciais ──');
// O que precisa da Google a sério fica por verificar até haver um projeto no
// Google Cloud. O que NÃO precisa é o comportamento quando ela falta — e é aí
// que uma app costuma rebentar em vez de explicar.
await prova('o servidor anuncia se o OAuth está ligado', async () => {
  const m = await admin.collection('membros').listAuthMethods();
  igual(typeof m.oauth2.enabled, 'boolean');
  if (m.oauth2.enabled && !m.oauth2.providers.some(p => p.name === 'google')) {
    throw new Error('oauth2 ligado mas sem o provedor google');
  }
});
await prova('sem autorização da agenda, google.disponivel() é falso', () =>
  igual(google.disponivel(), false));
// A mensagem mudou com o desenho, e a prova acompanha. A autorização
// deixou de vir da entrada — vem do fluxo próprio, e o que falta agora é
// LIGAR a agenda, não entrar outra vez.
await prova('e pedir eventos explica o que fazer, em vez de rebentar', async () => {
  try { await google.eventos(); throw new Error('devia ter recusado'); }
  catch (e) { igual(e.message, 'A agenda não está ligada nesta conta.'); }
});
await prova('entrar com Google sem provedor configurado dá erro claro', async () => {
  try { await auth.entrarComGoogle(); throw new Error('devia ter recusado'); }
  catch (e) { if (/devia ter recusado/.test(e.message)) throw e; }
});

resumo();
