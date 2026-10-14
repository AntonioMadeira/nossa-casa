/// <reference path="../pb_data/types.d.ts" />

// O PIN de uma crianca, definido por um adulto que administra a casa.
//
// -- Porque e uma rota e nao um update -----------------------------------------
//
// O PocketBase exige `oldPassword` para mudar uma palavra-passe pela colecao,
// mesmo a quem administra. E correto para uma app com contas de estranhos, e
// errado para esta: quem poe o PIN de uma crianca de sete anos e o pai, e ele
// nao sabe o PIN antigo -- e o objetivo e frequentemente nao saber.
//
// Deixar o PIN so no cliente era pior. O `resumoPin` da loja serve a entrada
// SEM servidor e e isso e nada mais -- o comentario dele diz «nao e
// criptografia». O PIN a serio e a palavra-passe do membro, com bcrypt feito
// aqui, e sem esta rota o PIN definido no telemovel do pai nao deixava a
// crianca entrar no dela: um lado tinha o resumo novo, o servidor o antigo.
//
// Esta rota muda UM campo, de UM membro da MESMA casa, e so por quem administra.
//
// ATENCAO: cada handler corre num contexto ISOLADO no JSVM -- nada de
// constantes de fora, nem sequer as deste ficheiro. As auxiliares vao dentro.

routerAdd('POST', '/api/casa/pin', (e) => {
  const quem = e.auth;
  if (!quem) throw new UnauthorizedError('Entre primeiro.');
  if (quem.get('papel') !== 'admin') {
    throw new ForbiddenError('So quem administra a casa define PIN.');
  }

  const corpo = new DynamicModel({ membro: '', pin: '' });
  e.bindBody(corpo);

  const idDoMembro = String(corpo.membro || '').trim();
  const pin = String(corpo.pin || '').trim();
  if (!idDoMembro) throw new BadRequestError('Falta dizer de quem e o PIN.');

  // -- A qualidade do PIN, no SERVIDOR --------------------------------------
  //
  // O cliente ja a verifica (`pinError`), e isso e para a pessoa saber porque
  // e que o PIN nao serve enquanto o escreve. Isto e outra coisa: um cliente
  // pode ser trocado, e a regra que protege a casa nao pode viver so nele.
  if (!/^[0-9]{6}$/.test(pin)) throw new BadRequestError('O PIN tem de ter 6 digitos.');
  if (/^([0-9])\1{5}$/.test(pin)) throw new BadRequestError('Nao pode ter os seis digitos iguais.');
  const seq = '0123456789';
  const inv = '9876543210';
  if (seq.indexOf(pin) >= 0 || inv.indexOf(pin) >= 0) {
    throw new BadRequestError('Nao pode ser uma sequencia.');
  }

  const alvo = $app.findRecordById('membros', idDoMembro);
  if (!alvo) throw new NotFoundError('Esse membro nao existe.');

  // -- A mesma casa, sempre -------------------------------------------------
  //
  // Sem isto, quem administra uma casa punha o PIN de uma crianca de OUTRA. E
  // o mesmo defeito de forma que apareceu quatro vezes nas regras das colecoes
  // em 04/09/2026: uma relacao que ninguem pergunta de que casa e.
  if (String(alvo.get('casa')) !== String(quem.get('casa'))) {
    throw new ForbiddenError('Esse membro nao e desta casa.');
  }

  // -- E so a criancas ------------------------------------------------------
  //
  // Um adulto tem palavra-passe, nao PIN, e muda-a ele. Deixar esta rota tocar
  // num adulto era dar a quem administra a chave da conta do companheiro --
  // incluindo a ficha de saude dele, que e so dele (INVARIANTE #3).
  if (alvo.get('papel') !== 'crianca') {
    throw new ForbiddenError('So se define o PIN de uma crianca.');
  }

  alvo.setPassword(pin);
  // A app le isto para dizer «PIN definido» sem nunca ver o PIN.
  alvo.set('pin_definido', true);
  $app.save(alvo);

  return e.json(200, { ok: true });
});

// A crianca muda o SEU PIN, sabendo o atual.
//
// A reposicao sem o PIN atual continua a ser so de quem administra (a rota
// acima): isto e mudar, nao recuperar. Pedido pelo dono da casa em 09/09/2026:
// «o Administrador pode fazer reset e as criancas podem alterar o PIN».
//
// Porque e uma rota e nao um update da propria coleccao: a `updateRule` de
// `membros` e so para quem administra -- e bem, porque e ela que guarda o
// papel e a casa. Abrir o update ao proprio membro para mudar a palavra-passe
// abria-lhe tambem o `papel`. A rota muda UM campo, do PROPRIO, e mais nada.
//
// Mudar a palavra-passe invalida o token com que a crianca entrou (o PocketBase
// roda a chave do token). O cliente volta a entrar com o PIN novo a seguir --
// e por isso a resposta devolve o `login`, para ele nao ter de o adivinhar.
routerAdd('POST', '/api/casa/pin/proprio', (e) => {
  const quem = e.auth;
  if (!quem) throw new UnauthorizedError('Entre primeiro.');
  if (quem.get('papel') !== 'crianca') {
    throw new ForbiddenError('So uma crianca muda o PIN por aqui; um adulto muda a palavra-passe.');
  }

  const corpo = new DynamicModel({ atual: '', novo: '' });
  e.bindBody(corpo);
  const atual = String(corpo.atual || '').trim();
  const novo = String(corpo.novo || '').trim();

  // O PIN atual primeiro: sem ele, quem apanhar um telemovel desbloqueado
  // trocava o PIN da crianca e ficava com o perfil dela.
  if (!quem.validatePassword(atual)) {
    throw new BadRequestError('O PIN atual nao esta certo.');
  }

  // A mesma qualidade da rota de cima -- repetida aqui porque cada handler do
  // JSVM corre isolado e nao ve funcoes de fora.
  if (!/^[0-9]{6}$/.test(novo)) throw new BadRequestError('O PIN tem de ter 6 digitos.');
  if (/^([0-9])\1{5}$/.test(novo)) throw new BadRequestError('Nao pode ter os seis digitos iguais.');
  if ('0123456789'.indexOf(novo) >= 0 || '9876543210'.indexOf(novo) >= 0) {
    throw new BadRequestError('Nao pode ser uma sequencia.');
  }
  if (novo === atual) throw new BadRequestError('O PIN novo e igual ao atual.');

  const eu = $app.findRecordById('membros', quem.id);
  eu.setPassword(novo);
  eu.set('pin_definido', true);
  $app.save(eu);

  return e.json(200, { ok: true, login: eu.getString('login') });
});
