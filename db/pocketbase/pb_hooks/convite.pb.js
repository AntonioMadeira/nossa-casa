/// <reference path="../pb_data/types.d.ts" />

// O convite por e-mail: quando um membro da casa acrescenta um adulto, o
// servidor escreve a esse adulto, em nome de quem o acrescentou, com o endereço
// da app e a palavra-passe da conta.
//
// -- Porque é um hook e não o cliente -----------------------------------------
//
// A palavra-passe só existe em claro num sítio: no pedido que chega ao
// servidor. Depois de gravada é um hash e ninguém a lê de volta. Quem a
// mandasse a partir do telemóvel precisava de um serviço de correio e das
// credenciais dele no dispositivo. Aqui é o SMTP do próprio PocketBase
// (Definições > Mail), que já é do servidor e nunca chega à app.
//
// -- «Em nome de» --------------------------------------------------------------
//
// O endereço de envio é o do servidor: um SMTP não deixa escrever em nome de
// outro domínio, e tentá-lo faz o correio cair no lixo. O que vai em nome de
// quem criou a conta é o NOME (De: «Rita, via A Nossa Casa»), a voz do texto
// e o Reply-To — quem responder, responde-lhe a ela.
//
// -- O que NUNCA derruba a criação --------------------------------------------
//
// Sem SMTP configurado, ou com o correio em baixo, a conta cria-se na mesma. O
// administrador já tem a palavra-passe à frente (foi ele que a escreveu) e
// pode dá-la à pessoa à mão; o contrário — uma conta que não se cria porque o
// correio falhou — era pior. A falha fica no registo do servidor.
//
// ATENÇÃO: cada handler corre num contexto ISOLADO no JSVM — nada de
// constantes ou funções de fora, nem sequer as deste ficheiro.

onRecordCreateRequest((e) => {
  // A palavra-passe lê-se ANTES do `next()`: depois de gravada já só há o hash.
  const senha = e.record.getString('password');
  const papel = e.record.get('papel');
  const para = e.record.getString('email');
  const nome = e.record.getString('nome');

  e.next();

  // Só convida um adulto, com e-mail, acrescentado por outro membro. Uma
  // criança não tem e-mail (§8) e uma criação feita pelo superutilizador —
  // as provas, a simulação, a migração — não é um convite de ninguém.
  if (papel === 'crianca' || !para || !senha) return;
  const quem = e.auth;
  if (!quem || quem.collection().name !== 'membros') return;

  try {
    const meta = e.app.settings().meta;
    const quemNome = quem.getString('nome') || 'Um membro da casa';
    const quemEmail = quem.getString('email');

    // O endereço da app. `APP_LINK` é para quando a app tem uma página própria
    // de instalação; sem ele, vale o endereço público do servidor.
    const ligacao = $os.getenv('APP_LINK') || meta.appURL;

    const casa = e.app.findRecordById('casas', e.record.getString('casa'));
    const nomeCasa = casa.getString('nome');

    const texto = [
      'Olá, ' + nome + '.',
      '',
      'Acrescentei-o(a) à casa «' + nomeCasa + '» na app A Nossa Casa.',
      '',
      'Abra a app aqui: ' + ligacao,
      '',
      'Para entrar, use:',
      '  E-mail: ' + para,
      '  Palavra-passe: ' + senha,
      '',
      'Pode mudar a palavra-passe quando quiser, no Perfil. Apague este e-mail',
      'depois de a guardar.',
      '',
      quemNome,
    ].join('\n');

    const mensagem = new MailerMessage({
      from: { address: meta.senderAddress, name: quemNome + ', via A Nossa Casa' },
      to: [{ address: para }],
      subject: quemNome + ' acrescentou-o(a) à casa ' + nomeCasa,
      text: texto,
      headers: quemEmail ? { 'Reply-To': quemEmail } : {},
    });
    e.app.newMailClient().send(mensagem);
  } catch (err) {
    // A conta já está criada; só o aviso é que não seguiu.
    e.app.logger().error('Convite por e-mail não enviado', 'para', para, 'erro', String(err));
  }
}, 'membros');
