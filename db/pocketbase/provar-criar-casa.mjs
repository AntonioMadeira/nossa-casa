// Prova «Criar a minha casa»: no primeiro login pela Google, o servidor cria a
// casa e o administrador — e só quando a pessoa o pediu.
//   node db/pocketbase/provar-criar-casa.mjs
//
// A Google não se pode usar numa prova, por isso levanta-se um fornecedor OIDC
// falso (um servidor de 30 linhas) e liga-se à coleção `membros` como se fosse
// ele. O gancho `casa-criar.pb.js` não sabe de que fornecedor vem o utilizador:
// vê `isNewRecord`, `createData` e `oAuth2User`. O que se prova é o gancho.
import http from 'node:http';
import PocketBase from 'pocketbase';
import { PREFIXO, URL as URL_DO_SERVIDOR, comecar, prova, recusado, resumo } from './provas.mjs';

const PORTA = 18091;
const codigo = (email, nome) => Buffer.from(JSON.stringify({ email, nome })).toString('base64url');

const falso = http.createServer((q, r) => {
  const corpo = [];
  q.on('data', (c) => corpo.push(c));
  q.on('end', () => {
    r.setHeader('content-type', 'application/json');
    if (q.url.startsWith('/token')) {
      const p = new URLSearchParams(Buffer.concat(corpo).toString());
      return r.end(JSON.stringify({ access_token: p.get('code'), token_type: 'Bearer', expires_in: 3600 }));
    }
    if (q.url.startsWith('/userinfo')) {
      const t = (q.headers.authorization || '').replace('Bearer ', '');
      const { email, nome } = JSON.parse(Buffer.from(t, 'base64url').toString());
      return r.end(JSON.stringify({ sub: 'u-' + email, email, email_verified: true, name: nome }));
    }
    r.statusCode = 404; r.end('{}');
  });
});
await new Promise((ok) => falso.listen(PORTA, '127.0.0.1', ok));

const { pb } = await comecar();

// Liga o fornecedor falso; repõe a configuração no fim.
const colecao = await pb.collections.getOne('membros');
const antes = JSON.parse(JSON.stringify(colecao.oauth2));
await pb.collections.update('membros', {
  oauth2: {
    enabled: true,
    mappedFields: { name: '', username: '', avatarURL: '', id: '' },
    providers: [{
      name: 'oidc', clientId: 'prova', clientSecret: 'prova', pkce: false, displayName: 'Prova',
      authURL: `http://127.0.0.1:${PORTA}/auth`,
      tokenURL: `http://127.0.0.1:${PORTA}/token`,
      userInfoURL: `http://127.0.0.1:${PORTA}/userinfo`,
    }],
  },
});

const contar = async (c) => (await pb.collection(c).getList(1, 1, { filter: `nome ~ "${PREFIXO}" || email ~ "@prova-casa."` })).totalItems;
const casasDeProvas = async () => (await pb.collection('casas').getFullList({ filter: `nome ~ "${PREFIXO}"` })).length;

// Um login «pela Google» — anónimo, com o cliente SEM sessão, como no ecrã de entrada.
const entrar = (email, nome, createData) => new PocketBase(URL_DO_SERVIDOR).collection('membros').authWithOAuth2Code(
  'oidc', codigo(email, nome), 'x', 'http://127.0.0.1/retorno', createData);

const mail = (n) => `${n}@prova-casa.pt`;
const base = await casasDeProvas();

console.log('\n── quem não pediu uma casa e não existe é recusado ──');
await prova('um e-mail desconhecido, sem «criar casa», não entra', () => recusado(() => entrar(mail('estranho'), 'Estranho')));
await prova('e não deixou casa nenhuma para trás', async () => {
  if ((await casasDeProvas()) !== base) throw new Error('criou uma casa sem lha pedirem');
});
await prova('mandar `casa` e `papel` à mão também não o deixa entrar',
  () => recusado(() => entrar(mail('espertalhao'), 'Esperto', { casa: 'qualquer', papel: 'admin' })));

console.log('\n── pediu para criar uma casa ──');
let ana;
await prova('cria a casa e entra com a sessão do administrador', async () => {
  ana = await entrar(mail('ana'), 'Ana Prova', { nova_casa: true, nome_casa: PREFIXO + 'Casa da Ana', nome: 'Ana' });
  if (!ana.token) throw new Error('sem sessão');
  if (ana.record.papel !== 'admin') throw new Error('papel: ' + ana.record.papel);
  if (ana.record.nome !== 'Ana') throw new Error('nome: ' + ana.record.nome);
});
await prova('a casa tem o nome pedido e uma só casa nasceu', async () => {
  const c = await pb.collection('casas').getOne(ana.record.casa);
  if (c.nome !== PREFIXO + 'Casa da Ana') throw new Error('nome da casa: ' + c.nome);
  if ((await casasDeProvas()) !== base + 1) throw new Error('número de casas');
});
await prova('a conta fica com o e-mail da Google e verificada', async () => {
  const m = await pb.collection('membros').getOne(ana.record.id);
  if (m.email !== mail('ana')) throw new Error('e-mail: ' + m.email);
  if (!m.verified) throw new Error('não verificada');
});
await prova('quem criou lê a sua casa — e só a sua', async () => {
  const eu = new PocketBase(URL_DO_SERVIDOR);
  eu.autoCancellation(false);
  eu.authStore.save(ana.token, ana.record);
  const casas = await eu.collection('casas').getFullList();
  if (casas.length !== 1 || casas[0].id !== ana.record.casa) throw new Error('viu ' + casas.length + ' casas');
});

console.log('\n── o cliente não escolhe a casa nem o papel ──');
let bruno;
await prova('mandar `casa` e `papel` ao criar: a casa é uma casa NOVA e o papel é admin do servidor', async () => {
  bruno = await entrar(mail('bruno'), 'Bruno', {
    nova_casa: true, nome_casa: PREFIXO + 'Casa do Bruno', casa: ana.record.casa, papel: 'adulto',
  });
  if (bruno.record.casa === ana.record.casa) throw new Error('entrou na casa da Ana!');
  if (bruno.record.papel !== 'admin') throw new Error('papel: ' + bruno.record.papel);
});
await prova('a casa da Ana continua só com a Ana', async () => {
  const n = (await pb.collection('membros').getFullList({ filter: `casa = "${ana.record.casa}"` })).length;
  if (n !== 1) throw new Error(n + ' membros na casa da Ana');
});
await prova('o Bruno não vê a casa da Ana', async () => {
  const eu = new PocketBase(URL_DO_SERVIDOR);
  eu.autoCancellation(false);
  eu.authStore.save(bruno.token, bruno.record);
  const ids = (await eu.collection('casas').getFullList()).map((c) => c.id);
  if (ids.includes(ana.record.casa)) throw new Error('vê a casa da Ana');
});

console.log('\n── o que o servidor recusa ──');
await prova('sem nome da casa, recusado — e sem casa nenhuma criada', async () => {
  const antes2 = await casasDeProvas();
  await recusado(() => entrar(mail('c1'), 'C', { nova_casa: true, nome_casa: '   ' }));
  if ((await casasDeProvas()) !== antes2) throw new Error('criou uma casa sem nome');
});
await prova('nome da casa com mais de 40 caracteres, recusado',
  () => recusado(() => entrar(mail('c2'), 'C', { nova_casa: true, nome_casa: 'x'.repeat(41) })));
await prova('`nova_casa` que não é verdadeiro, recusado',
  () => recusado(() => entrar(mail('c3'), 'C', { nova_casa: 'não', nome_casa: PREFIXO + 'X' })));

console.log('\n── quem já existe entra como sempre ──');
await prova('a Ana volta a entrar sem pedir nada — não nasce outra casa', async () => {
  const antes3 = await casasDeProvas();
  const outra = await entrar(mail('ana'), 'Ana Prova');
  if (outra.record.id !== ana.record.id) throw new Error('outro registo');
  if ((await casasDeProvas()) !== antes3) throw new Error('criou outra casa');
});
await prova('mesmo a pedir «criar casa» outra vez, a Ana continua com a mesma casa', async () => {
  const antes4 = await casasDeProvas();
  const outra = await entrar(mail('ana'), 'Ana Prova', { nova_casa: true, nome_casa: PREFIXO + 'Outra' });
  if (outra.record.casa !== ana.record.casa) throw new Error('mudou de casa');
  if ((await casasDeProvas()) !== antes4) throw new Error('criou outra casa');
});
await prova('um adulto acrescentado pela Ana, por e-mail, entra na casa DELA', async () => {
  await pb.collection('membros').create({
    nome: 'Convidada', login: `${ana.record.casa}_convidada`, casa: ana.record.casa, papel: 'adulto',
    email: mail('convidada'), emailVisibility: true, password: 'palavra-passe-longa-1', passwordConfirm: 'palavra-passe-longa-1',
  });
  const antes5 = await casasDeProvas();
  const c = await entrar(mail('convidada'), 'Convidada');
  if (c.record.casa !== ana.record.casa) throw new Error('foi parar a outra casa');
  if (c.record.papel !== 'adulto') throw new Error('papel: ' + c.record.papel);
  if ((await casasDeProvas()) !== antes5) throw new Error('criou uma casa ao convidado');
});

console.log('\n── as regras das coleções continuam fechadas ──');
await prova('ninguém cria uma casa pela API directa', () => recusado(() => new PocketBase(URL_DO_SERVIDOR)
  .collection('casas').create({ nome: PREFIXO + 'Directa' })));
await prova('nem se acrescenta como administrador de uma casa pela API directa',
  () => recusado(() => new PocketBase(URL_DO_SERVIDOR).collection('membros').create({
    nome: 'Intruso', login: `${ana.record.casa}_intruso`, casa: ana.record.casa, papel: 'admin',
    email: mail('intruso'), password: 'palavra-passe-longa-1', passwordConfirm: 'palavra-passe-longa-1',
  })));

// repõe o que se mexeu
await pb.collections.update('membros', { oauth2: antes });
falso.close();
resumo();
