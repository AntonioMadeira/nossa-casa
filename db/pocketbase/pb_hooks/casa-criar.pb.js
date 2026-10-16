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
// As regras das coleções ficam como estão — fechadas. É ESTE gancho, no
// servidor, que no primeiro login pela Google cria a casa e o administrador de
// uma vez. Nada do que o cliente manda decide a casa nem o papel: o cliente só
// diz «quero criar uma casa» e como se chama; o resto é escrito aqui.
//
//   · `membros.createRule` não se abre. Abrir `@request.context = "oauth2"` deixava
//     o cliente escolher `casa` e `papel` em `createData`: entrava-se como
//     administrador de qualquer casa.
//   · Quem NÃO pediu para criar uma casa e não existe é recusado, com uma
//     frase que diz o que fazer — em vez de ficar com uma casa que não pediu
//     (um convidado cujo administrador escreveu outro e-mail).
//   · Quem já existe (ou foi acrescentado por e-mail por um administrador)
//     entra como sempre; este gancho nem lhe toca.
//
// -- Limites -------------------------------------------------------------------
//
// `CASAS_PERMITIDAS` (opcional, variável de ambiente do servidor): lista de
// e-mails, separados por vírgulas, que podem criar casas. Se estiver definida,
// quem não está nela é recusado; se não estiver, qualquer conta Google pode.
// Convém defini-la enquanto houver dados de saúde de menores. O limite de
// tentativas por IP (migração `rate_limits`) cobre o abuso em massa.
//
// -- Atómico -------------------------------------------------------------------
//
// Se criar o administrador falhar, a casa acabada de criar apaga-se: não fica
// uma casa sem ninguém lá dentro.
//
// ATENÇÃO: cada handler corre num contexto ISOLADO no JSVM — nada de
// constantes ou funções de fora, nem sequer as deste ficheiro.

onRecordAuthWithOAuth2Request((e) => {
  // Já é membro (ou foi acrescentado por e-mail): entra como sempre.
  if (!e.isNewRecord) return e.next();

  const dados = e.createData || {};
  const quer = dados.nova_casa === true || dados.nova_casa === 'true';
  if (!quer) {
    throw new ForbiddenError(
      // ⚠ O cliente reconhece esta frase (`SEM_CASA` em src/criar-casa.js) para
      // abrir o formulário de «Criar a minha casa». Se a mudar, mude lá também.
      'Este e-mail ainda não faz parte de nenhuma casa. Crie a sua, ou peça o '
      + 'convite a um administrador.');
  }

  const email = String((e.oAuth2User && e.oAuth2User.email) || '').trim().toLowerCase();
  if (!email) throw new BadRequestError('A conta da Google não tem endereço de e-mail.');

  const permitidos = String($os.getenv('CASAS_PERMITIDAS') || '')
    .split(',').map((s) => s.trim().toLowerCase()).filter((s) => s);
  if (permitidos.length && permitidos.indexOf(email) < 0) {
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

  let casa = null;
  try {
    casa = new Record(e.app.findCollectionByNameOrId('casas'));
    casa.set('nome', nomeCasa);
    casa.set('valor_ponto', 0.10);
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
  } catch (err) {
    if (casa && casa.id) {
      try { e.app.delete(casa); } catch (_) { /* a casa fica por apagar à mão; o erro verdadeiro é o de baixo */ }
    }
    throw err;
  }

  e.next();
}, 'membros');
