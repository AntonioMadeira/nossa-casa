/// <reference path="../pb_data/types.d.ts" />

// Criar uma casa nova, a partir do «Criar a minha casa» do ecrã de entrada.
//
// -- O problema --------------------------------------------------------------
//
// Quem entra pela Google pela primeira vez ainda não existe em `membros`, e a
// regra de criação dessa coleção exige que quem escreve seja administrador da
// mesma casa. Uma casa só a cria o superutilizador (`casas.createRule: null`).
// Resultado: ninguém de fora conseguia criar a sua casa, e a app não tinha por
// onde começar.
//
// -- A solução, e porque não é abrir as regras -------------------------------
//
// As regras das coleções ficam como estão — fechadas. É ESTE ficheiro, no
// servidor, que cria a casa e o administrador de uma vez. Nada do que o cliente
// manda decide a casa nem o papel: o cliente só diz «quero criar uma casa» e
// como se chama; o resto é escrito aqui.
//
//   · `membros.createRule` não se abre. Abrir `@request.context = "oauth2"` deixava
//     o cliente escolher `casa` e `papel` em `createData`: entrava-se como
//     administrador de qualquer casa.
//   · Quem já existe (ou foi acrescentado por e-mail por um administrador)
//     entra como sempre; nada disto lhe toca.
//
// -- Dois caminhos, uma só passagem pela Google ---------------------------------
//
// A. «Criar a minha casa» ANTES da Google: a pessoa preenche o formulário e vai
//    à Google com `nova_casa` em `createData`. O login pela Google cria a casa.
//
// B. «Continuar com Google» de alguém que não está em nenhuma casa: a Google
//    confirma quem é, e o servidor RECUSA o login — mas com um BILHETE. A app
//    pergunta «Quer criar uma casa?»; se sim, mostra o formulário e chama
//    `POST /api/casa/criar` com o bilhete, e o servidor cria a casa e devolve a
//    sessão. Sem segunda ida à Google.
//
// O bilhete é o que torna o B seguro: é aleatório (40 caracteres), vale 15
// minutos, USA-SE UMA VEZ, e está ligado ao e-mail que a Google confirmou — o
// cliente nunca diz qual é o e-mail. Vive em memória do servidor
// (`$app.store()`): se o servidor reiniciar, perde-se, e a pessoa volta a entrar
// pela Google. Só se emite um bilhete a quem não existe e pode criar casas.
//
// -- Quem cria a casa responde pelos dados -------------------------------------
//
// Uma casa guarda dados de saúde de menores, e quem a cria é quem decide o que
// lá entra. Em vez de o servidor o presumir, a pessoa di-lo («Aceito a
// responsabilidade pelos dados») e o servidor REGISTA-o na casa: a versão do
// texto que aceitou (`responsabilidade_versao`), quando
// (`responsabilidade_aceite_em`) e com que e-mail (`responsabilidade_por`).
// Sem o aceite a casa não se cria. Estes três campos não se alteram depois, nem
// pelo administrador da casa — é o registo de que foi aceite.
//
// Se o texto mudar de sentido, sobe a versão aqui e em `src/criar-casa.js`; as
// casas antigas ficam com a versão que aceitaram.
//
// -- Limites -------------------------------------------------------------------
//
// `CASAS_PERMITIDAS` (opcional, variável de ambiente do servidor): lista de
// e-mails, separados por vírgulas, que podem criar casas. Se estiver definida,
// quem não está nela não recebe bilhete e é recusado; se não estiver, qualquer
// conta Google pode. O limite de tentativas por IP cobre o abuso em massa.
//
// -- Atómico -------------------------------------------------------------------
//
// Se criar o administrador falhar, a casa acabada de criar apaga-se: não fica
// uma casa sem ninguém lá dentro.
//
// ATENÇÃO: cada handler corre num contexto ISOLADO no JSVM — nada de
// constantes ou funções de fora, nem sequer as deste ficheiro. É por isso que a
// criação da casa aparece escrita duas vezes (caminhos A e B), e as duas têm de
// ser mantidas iguais.

// ───────────────────────── Caminho A (e emissão do bilhete do B) ─────────────
onRecordAuthWithOAuth2Request((e) => {
  // Já é membro (ou foi acrescentado por e-mail): entra como sempre.
  if (!e.isNewRecord) return e.next();

  const dados = e.createData || {};
  const quer = dados.nova_casa === true || dados.nova_casa === 'true';

  const email = String((e.oAuth2User && e.oAuth2User.email) || '').trim().toLowerCase();
  if (!email) throw new BadRequestError('A conta da Google não tem endereço de e-mail.');

  const permitidos = String($os.getenv('CASAS_PERMITIDAS') || '')
    .split(',').map((s) => s.trim().toLowerCase()).filter((s) => s);
  const podeCriar = permitidos.length === 0 || permitidos.indexOf(email) >= 0;

  if (!quer) {
    if (!podeCriar) {
      // Sem bilhete: não há nada que esta pessoa possa fazer aqui sozinha. A frase
      // NÃO diz «ainda não faz parte de nenhuma casa», que é a que a app reconhece
      // para oferecer a criação de uma.
      throw new ForbiddenError(
        'Este e-mail não está em nenhuma casa e não está autorizado a criar casas '
        + 'neste servidor. Peça o convite a um administrador.');
    }

    // O bilhete. Limpam-se primeiro os expirados, e põe-se um teto: um servidor
    // aberto a qualquer conta Google não pode guardar bilhetes sem fim.
    const loja = e.app.store();
    const agora = Date.now();
    const todos = loja.getAll();
    let vivos = 0;
    Object.keys(todos).forEach((k) => {
      if (k.indexOf('casa-criar:') !== 0) return;
      if (todos[k] && todos[k].exp < agora) loja.remove(k); else vivos += 1;
    });
    if (vivos >= 5000) throw new BadRequestError('O servidor está ocupado. Tente daqui a uns minutos.');

    const nomeGoogle = String((e.oAuth2User && e.oAuth2User.name) || '').trim().slice(0, 30);
    // Só maiúsculas e dígitos (sem 0, O, 1, I): o PocketBase passa a primeira letra
    // do texto de um erro a maiúscula e põe-lhe um ponto final, e um bilhete com
    // minúsculas voltava do cliente trocado. Assim a normalização não o altera.
    const bilhete = $security.randomStringWithAlphabet(40, 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789');
    loja.set('casa-criar:' + bilhete, { email: email, nome: nomeGoogle, exp: agora + 15 * 60 * 1000 });

    throw new ForbiddenError(
      // ⚠ O cliente reconhece esta frase (`SEM_CASA` em src/criar-casa.js) e o
      // bilhete que vai em `data`, para perguntar «Quer criar uma casa?».
      // Se a mudar, mude lá também.
      'Este e-mail ainda não faz parte de nenhuma casa. Crie a sua, ou peça o '
      + 'convite a um administrador.',
      // ⚠ O PocketBase trata o `data` de um erro como erros de VALIDAÇÃO: um texto
      // solto vira «Invalid value». Por isso cada valor vai num `ValidationError`
      // e o texto lê-se em `.message` (`response.data.bilhete.message`).
      {
        bilhete: new ValidationError('bilhete', bilhete),
        email: new ValidationError('email', email),
        nome: new ValidationError('nome', nomeGoogle || '-'),
      });
  }

  // Caminho A: a pessoa pediu para criar a casa ANTES de ir à Google.
  if (!podeCriar) {
    throw new ForbiddenError('Este e-mail não está autorizado a criar casas neste servidor.');
  }

  const nomeCasa = String(dados.nome_casa || '').trim();
  if (!nomeCasa) throw new BadRequestError('A casa precisa de um nome.');
  if (nomeCasa.length > 40) throw new BadRequestError('O nome da casa não pode passar de 40 caracteres.');

  const nome = String(dados.nome || (e.oAuth2User && e.oAuth2User.name) || email.split('@')[0])
    .trim().slice(0, 30);
  if (!nome) throw new BadRequestError('Diga o seu nome.');

  // O identificador interno: `casa_nome`, como o das crianças. Único porque
  // leva o id da casa.
  const slug = nome.toLowerCase().replace(/[^a-z0-9]+/g, '') || 'admin';

  if (dados.responsabilidade_aceite !== true || dados.termos !== 'v1') {
    throw new BadRequestError('É preciso aceitar a responsabilidade pelos dados desta casa.');
  }

  let casa = null;
  try {
    casa = new Record(e.app.findCollectionByNameOrId('casas'));
    casa.set('nome', nomeCasa);
    casa.set('valor_ponto', 0.10);
    casa.set('responsabilidade_versao', 'v1');
    casa.set('responsabilidade_aceite_em', new Date().toISOString());
    casa.set('responsabilidade_por', email);
    e.app.save(casa);

    const membro = new Record(e.app.findCollectionByNameOrId('membros'));
    membro.set('nome', nome);
    membro.set('login', casa.id + '_' + slug);
    membro.set('casa', casa.id);
    membro.set('papel', 'admin');
    membro.set('email', email);
    membro.set('emailVisibility', true);
    membro.set('verified', true);
    membro.setRandomPassword();
    e.app.save(membro);

    // A partir daqui o PocketBase trata-o como um membro que já existia:
    // liga a conta da Google a ele e devolve a sessão.
    e.record = membro;
    e.isNewRecord = false;
    e.app.logger().info('Casa criada', 'casa', casa.id, 'por', email, 'responsabilidade', 'v1');
  } catch (err) {
    if (casa && casa.id) {
      try { e.app.delete(casa); } catch (_) { /* a casa fica por apagar à mão; o erro verdadeiro é o de baixo */ }
    }
    throw err;
  }

  e.next();
}, 'membros');

// ───────────────────────── Caminho B: criar a casa com o bilhete ──────────────
routerAdd('POST', '/api/casa/criar', (e) => {
  const d = new DynamicModel({
    bilhete: '', nome_casa: '', nome: '', responsabilidade_aceite: false, termos: '',
  });
  e.bindBody(d);

  // O ponto final que o PocketBase põe ao texto dos erros pode ter vindo agarrado.
  const chave = 'casa-criar:' + String(d.bilhete || '').trim().replace(/\.+$/, '');
  const loja = e.app.store();
  const pedido = String(d.bilhete || '').trim() ? loja.get(chave) : null;
  if (!pedido || pedido.exp < Date.now()) {
    if (pedido) loja.remove(chave);
    throw new BadRequestError('Esta entrada expirou. Entre outra vez pela Google.');
  }
  // O e-mail é o que a Google confirmou quando o bilhete foi emitido — nunca o
  // que o cliente diz.
  const email = String(pedido.email);

  const permitidos = String($os.getenv('CASAS_PERMITIDAS') || '')
    .split(',').map((s) => s.trim().toLowerCase()).filter((s) => s);
  if (permitidos.length && permitidos.indexOf(email) < 0) {
    throw new ForbiddenError('Este e-mail não está autorizado a criar casas neste servidor.');
  }

  const nomeCasa = String(d.nome_casa || '').trim();
  if (!nomeCasa) throw new BadRequestError('A casa precisa de um nome.');
  if (nomeCasa.length > 40) throw new BadRequestError('O nome da casa não pode passar de 40 caracteres.');

  const nome = String(d.nome || pedido.nome || email.split('@')[0]).trim().slice(0, 30);
  if (!nome) throw new BadRequestError('Diga o seu nome.');
  const slug = nome.toLowerCase().replace(/[^a-z0-9]+/g, '') || 'admin';

  if (d.responsabilidade_aceite !== true || d.termos !== 'v1') {
    throw new BadRequestError('É preciso aceitar a responsabilidade pelos dados desta casa.');
  }

  // Só depois de tudo validado se gasta o bilhete: um erro do formulário (sem
  // nome, sem aceite) deixa a pessoa corrigir e repetir sem voltar à Google.
  loja.remove(chave);

  let casa = null;
  let membro = null;
  try {
    casa = new Record(e.app.findCollectionByNameOrId('casas'));
    casa.set('nome', nomeCasa);
    casa.set('valor_ponto', 0.10);
    casa.set('responsabilidade_versao', 'v1');
    casa.set('responsabilidade_aceite_em', new Date().toISOString());
    casa.set('responsabilidade_por', email);
    e.app.save(casa);

    membro = new Record(e.app.findCollectionByNameOrId('membros'));
    membro.set('nome', nome);
    membro.set('login', casa.id + '_' + slug);
    membro.set('casa', casa.id);
    membro.set('papel', 'admin');
    membro.set('email', email);
    membro.set('emailVisibility', true);
    membro.set('verified', true);
    membro.setRandomPassword();
    e.app.save(membro);
    e.app.logger().info('Casa criada', 'casa', casa.id, 'por', email, 'responsabilidade', 'v1');
  } catch (err) {
    if (casa && casa.id) {
      try { e.app.delete(casa); } catch (_) { /* a casa fica por apagar à mão; o erro verdadeiro é o de baixo */ }
    }
    // Devolve o bilhete: a criação falhou por razões que não são da pessoa.
    loja.set(chave, pedido);
    throw new BadRequestError('Não foi possível criar a casa. Tente outra vez.');
  }

  // A mesma resposta de qualquer entrada: sessão e membro.
  return $apis.recordAuthResponse(e, membro, 'oauth2', {});
});

// O registo de que a responsabilidade foi aceite não se altera depois — nem
// pelo administrador da casa, que pode renomeá-la mas não reescrever isto.
// (Uma escrita do próprio servidor, como o «Começar de Zero», não passa por aqui.)
onRecordUpdateRequest((e) => {
  if (e.hasSuperuserAuth()) return e.next();
  const antigo = e.app.findRecordById('casas', e.record.id);
  const campos = ['responsabilidade_versao', 'responsabilidade_aceite_em', 'responsabilidade_por'];
  for (let i = 0; i < campos.length; i += 1) {
    if (e.record.getString(campos[i]) !== antigo.getString(campos[i])) {
      throw new BadRequestError('O registo da responsabilidade pelos dados não se altera.');
    }
  }
  e.next();
}, 'casas');
