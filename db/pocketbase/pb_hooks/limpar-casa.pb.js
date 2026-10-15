/// <reference path="../pb_data/types.d.ts" />

// Apagar os dados de uma casa — a operação mais destrutiva desta app.
//
// ── Porque é que existe ──────────────────────────────────────────────────────
//
// O «Começar de Zero» do Perfil só apagava o `AsyncStorage`: a casa no servidor
// ficava intacta e o `lerDoServidor()` trazia-a de volta na entrada seguinte.
// O botão prometia mais do que fazia.
//
// ── O que apaga, e o que NÃO apaga ───────────────────────────────────────────
//
// Apaga os dados: eventos, tarefas, despesas, cofres, equipamentos, listas,
// preços, saúde. FICAM a casa, os membros e os papéis — «começar de zero» é
// recomeçar a vida da família, não dissolver a família. Quem tem de sair de uma
// casa sai pela Gestão, um membro de cada vez, com o histórico a ser tratado.
//
// Fica também a `credenciais_agenda`: é a autorização da agenda de cada pessoa,
// não um dado desta casa. Apagá-la obrigaria a religar a Google por causa de
// uma limpeza de dados, o que ninguém esperaria.
//
// ── Quem pode ───────────────────────────────────────────────────────────────
//
// Só um administrador, e só na SUA casa. A app exige por cima disso a
// confirmação de todos os administradores — mas essa é a regra da interface, e
// uma regra de interface não é uma regra. Aqui verifica-se o que não se pode
// contornar: o papel e a casa de quem pede.
//
// ⚠ Cada handler corre num contexto ISOLADO no JSVM: a lista de coleções vive
// DENTRO do handler. Fora dele dá `ReferenceError` em cada pedido — já
// aconteceu duas vezes neste projeto, uma delas a derrubar o servidor inteiro.

routerAdd('POST', '/api/casa/limpar', (e) => {
  const membro = e.auth;
  if (!membro) throw new UnauthorizedError('Entre primeiro.');

  if (membro.get('papel') !== 'admin') {
    throw new ForbiddenError('Só um administrador da casa pode fazer isto.');
  }
  const casa = membro.get('casa');
  if (!casa) throw new BadRequestError('Este membro não tem casa.');

  // A ORDEM importa: primeiro o que aponta para outras linhas, depois as
  // apontadas. Ao contrário, o servidor recusa por causa das relações — e uma
  // recusa a meio deixava a casa meio apagada, que é pior do que não apagar.
  //
  // É a mesma ordem que a limpeza das provas usa, e por a mesma razão.
  const PELA_ORDEM = [
    // ⚠ As ALERGIAS têm de estar aqui pelo nome, e ficaram de fora até
    // 29/09/2026.
    //
    // As outras coleções de saúde caem por arrasto: as notas, as receitas, as
    // decisões e os anexos apontam para o `episodio`, e as tomas apontam para a
    // receita. Apagar os episódios leva-as a todas.
    //
    // As alergias não. Elas apontam para a `casa` e para o `membro` — e o
    // «Começar de Zero» não apaga nem a casa nem os membros, que é o que o faz
    // ser «começar de zero» e não «ir embora». Ficavam para trás, em silêncio:
    // as alergias dos filhos sobreviviam a quem pediu para apagar tudo.
    //
    // É a mesma forma do que aconteceu aos pedidos por voz na primeira versão
    // desta lista. Uma coleção que não cascateia tem de ser nomeada.
    'alergias_saude',
    'anexos', 'episodios_saude',
    'tarefas_feitas', 'artigos', 'listas_compras',
    'cofre_movimentos', 'despesas', 'transferencias', 'acertos',
    // «Começar de Zero» é apagar TUDO o que a família escreveu. Estas ficavam
    // para trás: nenhuma cascateia da casa nem dos membros, que ficam.
    'trocas_tarefas', 'partilhas_lista', 'ementa', 'pratos',
    'meta_movimentos', 'objetivos_cofre', 'contas_fixas', 'contratos',
    'registo', 'seccoes',
    'manutencoes', 'eventos', 'tarefas', 'equipamentos',
    'envelopes', 'metas', 'meses',
    'lojas', 'categorias_equip', 'especialidades', 'preferencias',
  ];

  const apagadas = {};
  let total = 0;

  for (const nome of PELA_ORDEM) {
    let linhas;
    try {
      linhas = $app.findRecordsByFilter(nome, 'casa = {:c}', '', 0, 0, { c: casa });
    } catch (err) {
      continue;                 // a coleção pode não existir neste servidor
    }
    let n = 0;
    for (const linha of linhas) {
      try { $app.delete(linha); n++; } catch (err) { /* segue: contamos o que saiu */ }
    }
    if (n) { apagadas[nome] = n; total += n; }
  }

  // O CARIMBO do «Começar de Zero». Os outros aparelhos da casa guardam uma
  // cópia local, e sem isto a cópia deles sobrevivia ao botão: o telemóvel
  // continuava a mostrar o que o browser tinha apagado. Cada aparelho compara
  // este carimbo com o que viu da última vez, e se é novo apaga a sua cópia.
  // Texto e não `date`: só se compara com igualdade, e o texto vai e volta sem
  // ninguém o reformatar.
  let zeradoEm = '';
  try {
    const linhaDaCasa = $app.findRecordById('casas', casa);
    zeradoEm = new Date().toISOString();
    linhaDaCasa.set('zerado_em', zeradoEm);
    $app.save(linhaDaCasa);
  } catch (err) { zeradoEm = ''; }   // servidor sem o campo: apaga na mesma, sem carimbo

  // Diz o que fez, coleção a coleção. Uma operação destas não deve responder
  // «pronto»: quem a pediu tem de poder ver que o que saiu foi o que esperava.
  $app.logger().info('Dados da casa apagados',
    'casa', casa, 'por', membro.get('nome'), 'linhas', total);

  return e.json(200, { casa, total, apagadas, zerado_em: zeradoEm });
}, $apis.requireAuth('membros'));
