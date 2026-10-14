/// <reference path="../pb_data/types.d.ts" />

// A coleção `membros` aceita palavras-passe de 4 caracteres, porque o PIN de
// uma criança tem quatro dígitos. Sem mais nada, isso deixaria um adulto
// proteger a casa inteira com «1234». As regras que faltam vivem aqui, porque
// as regras de API do PocketBase não olham para o valor da palavra-passe.
//
// Cada handler corre num contexto isolado e NÃO vê o escopo do módulo: as
// funções auxiliares têm de estar dentro dele. Descobri-o com um
// «pinInvalido is not defined» que só aparecia no caminho de sucesso.

function validarMembro(e) {
  const MIN_ADULTO = 10;

  // Um PIN de seis dígitos tem 1 000 000 de combinações (os de quatro, 10 000).
  // Estas regras não o tornam forte — tornam-no não-óbvio. Quem o
  // torna impraticável de forçar é o hash lento do servidor.
  function pinInvalido(pin) {
    if (!/^\d{6}$/.test(pin)) return 'O PIN tem de ter 6 dígitos.';
    if (/^(\d)\1{5}$/.test(pin)) return 'Não pode ter os seis dígitos iguais.';
    if ('0123456789'.indexOf(pin) !== -1) return 'Não pode ser uma sequência.';
    if ('9876543210'.indexOf(pin) !== -1) return 'Não pode ser uma sequência.';
    return null;
  }

  const papel = e.record.get('papel');
  const senha = e.record.getString('password');

  // Sem palavra-passe nova não há nada a validar — é uma alteração de outro campo.
  if (senha) {
    if (papel === 'crianca') {
      const erro = pinInvalido(senha);
      if (erro) throw new BadRequestError(erro);
      // A verdade sobre «tem PIN» escreve-se AQUI, onde a palavra-passe entra
      // — e não no cliente, que só a via no telemóvel onde o PIN fora posto.
      e.record.set('pin_definido', true);
    } else if (senha.length < MIN_ADULTO) {
      throw new BadRequestError(
        'A palavra-passe de um adulto tem de ter pelo menos ' + MIN_ADULTO + ' caracteres.');
    }
  }

  // §8, minimização: as crianças não têm conta nem e-mail, e é para manter.
  if (papel === 'crianca' && e.record.getString('email')) {
    throw new BadRequestError('Um perfil de criança não leva e-mail.');
  }

  e.next();
}

onRecordCreateRequest(validarMembro, 'membros');
onRecordUpdateRequest(validarMembro, 'membros');

// §4: recusar a despromoção do último administrador e a transição
// adulto → criança. O cliente já tenta impedi-lo; aqui passa a ser regra.
onRecordUpdateRequest((e) => {
  const antigo = e.app.findRecordById('membros', e.record.id);
  const antes = antigo.get('papel');
  const depois = e.record.get('papel');

  if (antes !== depois) {
    if ((antes === 'adulto' || antes === 'admin') && depois === 'crianca') {
      throw new BadRequestError('Um adulto não passa a criança.');
    }
    if (antes === 'admin' && depois !== 'admin') {
      const outros = e.app.findRecordsByFilter('membros',
        'casa = {:casa} && papel = "admin" && id != {:id}', '', 0, 0,
        { casa: antigo.get('casa'), id: e.record.id });
      if (outros.length === 0) {
        throw new BadRequestError('A casa ficaria sem administração.');
      }
    }
  }
  e.next();
}, 'membros');

// A mesma regra, pelo outro caminho.
//
// Este faltava: despromover o último administrador era recusado, e APAGÁ-LO
// passava. A casa ficava sem ninguém que pudesse acrescentar membros, mudar o
// nome ou tocar nas regras — e sem forma de voltar atrás pela app, porque o
// que resolve isso é ser administrador. Só apareceu quando a prova tentou as
// duas portas em vez de uma.
onRecordDeleteRequest((e) => {
  if (e.record.get('papel') === 'admin') {
    const outros = e.app.findRecordsByFilter('membros',
      'casa = {:casa} && papel = "admin" && id != {:id}', '', 0, 0,
      { casa: e.record.get('casa'), id: e.record.id });
    if (outros.length === 0) {
      throw new BadRequestError('A casa ficaria sem administração.');
    }
  }
  e.next();
}, 'membros');

// O `login` já é único — `idx_membro_login`, em criar-colecoes.mjs. Cheguei a
// escrever um hook a repetir a verificação e tirei-o: uma segunda guarda sobre
// a mesma coisa é mais um sítio para as duas discordarem. A recusa do índice é
// traduzida no cliente, em `emPortugues`.
