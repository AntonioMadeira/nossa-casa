// O que sobe para a base de dados, o que não sobe, e porquê — campo a campo.
//
// ── Porque é que este ficheiro existe ────────────────────────────────────────
//
// Em 04/09/2026 medi que a base de dados tinha 31 coleções e o cliente escrevia
// em 10. As tarefas, a agenda, o orçamento e as regras da casa viviam só no
// telefone de quem as escreveu, e dois telefones nunca se viam.
//
// Corrigi-o por partes, e a cada parte ficava a mesma pergunta sem resposta
// escrita: e o resto? «Não sobe» era indistinguível de «esqueci-me», e a única
// forma de saber qual era ler o `sync.js` inteiro.
//
// ⚠ Isto é a resposta, e é a mesma forma de guarda que fechou as relações não
// ancoradas: em vez de eu me lembrar, ENUMERA-SE. Cada chave de `DATA_KEYS` tem
// de estar aqui, com um `como` e um `porque`. A prova em
// `__tests__/o-que-sobe.test.js` falha se faltar uma, se sobrar uma que já não
// exista, ou se um `porque` for curto demais para dizer alguma coisa.
//
// A consequência prática: quem acrescentar um campo à loja tem de decidir, ali
// e nesse momento, se ele é da casa ou do dispositivo. Não pode adiar sem que
// uma prova o diga.
//
// ── As três respostas possíveis ──────────────────────────────────────────────
//
//   'linhas'  sobe como LINHAS numa coleção aditiva ou própria. O servidor
//             manda, e dois telefones fundem-se em vez de se anularem.
//   'campo'   sobe como campo de uma linha que já existe (a casa, o membro).
//   'local'   NÃO sobe, e a razão está escrita. São três famílias: estado do
//             dispositivo, coisas derivadas de outra que já sobe, e o que
//             ainda não tem coleção.
export const O_QUE_SOBE = {
  // ── Tarefas ───────────────────────────────────────────────────────────────
  newTasks: ['linhas', 'A coleção `tarefas`, com título, atribuição, pontos, urgência e prazo.'],
  done: ['linhas', 'Uma linha por (tarefa, dia) em `tarefas_feitas`, com índice único. Marcar cria, desmarcar apaga — nunca um booleano na tarefa (INVARIANTE #2).'],
  feitas: ['local', 'O `id` da linha de `tarefas_feitas` por «tarefa|dia», guardado para se poder DESMARCAR. É um índice do que já subiu, não dado da casa — refaz-se a cada leitura.'],
  taskEdits: ['campo', 'As alterações de uma tarefa vão para a própria linha em `tarefas`. O mapa existe porque uma SEMENTE não se pode editar no sítio.'],
  urg: ['campo', 'A `urgencia` da linha da tarefa. O mapa é a forma que oito ecrãs leem, e enche-se a partir da linha.'],
  due: ['campo', 'O `prazo` da linha da tarefa, pela mesma razão do `urg`.'],
  taskGone: ['local', 'Lápides de sementes apagadas. Uma tarefa do servidor apaga-se LÁ; isto só marca as que vêm do ficheiro `data.js` e não existem em coleção nenhuma.'],
  taskOrder: ['campo', 'O `posto` da linha da tarefa, dentro do grupo de urgência. É da CASA e não de quem olha: se fosse de cada um, a Rita arrastava uma tarefa para cima e o Tomás continuava a vê-la em terceiro.'],
  pending: ['local', 'Uma criança marcou e falta um adulto confirmar. No servidor isso é a AUSÊNCIA de `confirmada_em` na linha de `tarefas_feitas`; aqui é o passo intermédio da interface.'],
  rotate: ['local', 'Alternar uma tarefa entre as crianças. Sem campo no servidor — a rotação é semanal e derivável, e ainda não se decidiu se vale uma coluna.'],
  recurringReset: ['local', 'Em que DIA uma tarefa recorrente foi reposta neste dispositivo. O que a casa partilha é a linha de `tarefas_feitas` do dia; isto é o relógio local a saber que a de ontem já não conta para hoje.'],
  pontosDeTarefasApagadas: ['local', 'Pontos ganhos numa tarefa que foi apagada. O histórico verdadeiro são as linhas de `tarefas_feitas`, que ficam.'],
  trocas: ['linhas', 'A coleção `trocas_tarefas`: uma linha por troca entre irmãos, do DIA — as duas tarefas, quem propôs, quem aceitou. A atribuição do dia deriva-se dela no `allTasks`; nada se escreve na tarefa, e à meia-noite acabou.', 'trocaDeTarefas'],

  // ── Agenda ────────────────────────────────────────────────────────────────
  added: ['linhas', 'A coleção `eventos`, com os três níveis de visibilidade impostos pelo servidor (INVARIANTE #3).'],
  eventEdits: ['campo', 'As alterações de um evento vão para a própria linha. O mapa existe pela mesma razão do `taskEdits`.'],
  eventGone: ['local', 'Lápides de eventos-semente. Um evento do servidor apaga-se lá.'],
  googleCalendarImported: ['local', 'Que eventos da Google já foram importados NESTE dispositivo, para não os oferecer duas vezes. A `credenciais_agenda` do servidor é outra coisa.'],
  filaGoogle: ['local', 'O que falta empurrar para a agenda da Google. É estado deste DISPOSITIVO: o token da Google é de quem entrou neste telemóvel, e uma fila partilhada punha o outro adulto a tentar escrever numa agenda a que não tem acesso. Esvazia-se sozinha quando a rede volta ou a agenda é ligada.'],

  // ── Dinheiro ──────────────────────────────────────────────────────────────
  vaultMoves: ['linhas', 'A coleção `cofre_movimentos`, aditiva e com chave de idempotência.'],
  metasDaCasa: ['linhas', 'A coleção `metas`: o nome, o alvo em euros, e para quando. A lista existia no servidor desde o primeiro dia e o cliente nunca lhe escreveu — a lista da app era a constante `GOALS` do `data.js`, e uma meta criada pela Rita não existia em sítio nenhum.', 'criarMeta'],
  metaMovs: ['linhas', 'A coleção `meta_movimentos`, aditiva e com chave de idempotência. O que está juntado numa meta é a SOMA destas linhas: havia um `metas.atual` no servidor e um `at` na semente, os dois saldos ESCRITOS, e dois telemóveis a reforçar a mesma meta anulavam-se.', 'reforcarMeta'],
  objetivosCofre: ['linhas', 'A coleção `objetivos_cofre`: o nome e o alvo do objetivo de cada criança («Bicicleta, 120 €»), uma linha por criança. O que está juntado é o saldo do cofre — a soma dos `cofre_movimentos` — e nunca um campo daqui.', 'definirObjetivoDoCofre'],
  pratos: ['linhas', 'A coleção `pratos`: o nome e os ingredientes `{ rotulo, s }` de cada prato da casa, em JSON — são o MOLDE do prato; um artigo só nasce quando se põe o prato na lista, e aí é um `artigos` normal.', 'pratoDaCasa'],
  ementa: ['linhas', 'A coleção `ementa`: o jantar de cada dia, um por dia (índice único). Marcar outra vez altera a linha; «sem jantar» é a ausência dela.', 'jantarDoDia'],
  contasFixas: ['linhas', 'A coleção `contas_fixas`: a DEFINIÇÃO de cada conta — nome, valor, dia do mês, envelope e quem paga. A criança não a recebe (é orçamento). «Paga» não vive aqui.', 'contaFixaDaCasa'],
  contasPagas: ['linhas', 'As `despesas` deste e dos outros meses que têm `conta_fixa` a apontar — uma por pagamento, com o mês. «Paga este mês» é haver uma destas para a conta e o mês (INVARIANTE #2), nunca um campo escrito; a segunda do mês colide na chave `conta-fixa:<id>:<mês>`.', 'contasPagas'],
  metasProprias: ['local', 'Se a CASA é dona da lista de metas, ou se ainda corre com as sementes. Fica verdadeira ao primeiro toque e na primeira leitura do servidor. Chamou-se `metasDoServidor` e era a bandeira a descrever como ficou verdadeira em vez do que significa: apagar a última meta punha a lista a zero e as duas metas da demonstração voltavam.'],
  envMove: ['linhas', 'A SOMA das `transferencias` deste mês. Era um saldo escrito, e dois telefones a mover dinheiro anulavam-se — o INVARIANTE #2 ao contrário.'],
  envelopesDaCasa: ['linhas', 'A coleção `envelopes`. Eram sementes no código, e a lista da casa não existia em lado nenhum.'],
  envelopesProprios: ['local', 'Se a CASA é dona da lista de envelopes, ou se ainda corre com as sementes. Fica verdadeira ao primeiro toque e na primeira leitura do servidor. Sem ela, apagar o último envelope deixava a lista vazia e as quatro sementes voltavam — o mesmo defeito que as `metasProprias` já resolveram nas metas.'],
  seccoesDaCasa: ['linhas', 'A coleção `seccoes`, ORDENADA pelo `posto`. Eram quatro nomes fixos no `data.js` e o artigo guardava um ÍNDICE — a partir do momento em que a casa os pode reordenar, um índice aponta para outra coisa a cada mudança. E sem subirem, quem reordenasse num telemóvel ficava a ser o único a ver a ordem nova.', 'criarSeccao'],
  registered: ['linhas', 'A soma das `despesas` não anuladas DESTE mês. Fechar o mês escrevia zero por cima dela, e as linhas ficavam: o mês fechado reabria sozinho.'],
  despesasMeias: ['linhas', 'Quantas `despesas` deste mês estão marcadas «a meias». É a linha de baixo do cartão do acerto, que dizia «14 despesas partilhadas este mês» — o número da demonstração, escrito à mão.', 'despesasMeias'],
  gastoLocal: ['local', 'O gasto do mês por envelope que AINDA NÃO passou pelo servidor. É a metade de cá do `gastoPorEnvelope`, e existe porque sem servidor a app tem de contar sozinha — era uma condição escrita à mão (`e.name === "Mercearia" ? registered : 0`) e uma despesa em qualquer outro envelope não movia nada em ecrã nenhum. Fica local de propósito: quando o servidor responde, é ele que manda.'],
  gastoPorEnvelope: ['linhas', 'A soma das `despesas` DESTE mês por envelope. A loja fazia `used: nome === "Mercearia" ? registered : 0` — o gasto inteiro do mês na Mercearia e zero nos outros, um resto da demonstração onde só havia compras.', 'gastoPorEnvelope'],
  partilhasPagas: ['linhas', 'Quanto cada adulto pagou das `despesas` com `divide_meias` DESTE mês. É a base do acerto de contas, que era uma constante da demonstração — numa casa a sério valia zero e a secção dizia sempre «tudo acertado».', 'partilhasPagas'],
  acertoMovs: ['linhas', 'A coleção `acertos`, aditiva e filtrada pelo mês aberto. Subia e nunca voltava — a coleção nem estava na lista que o `ler.casa()` puxa —, por isso quem recebia continuava a ver a dívida por pagar.', 'acerto'],
  paidPts: ['linhas', 'A SOMA do campo `pontos` dos `cofre_movimentos` da criança. Era um campo escrito no telefone de quem pagava: a linha do cofre chegava ao outro adulto e este número não, e a semanada era paga duas vezes.', 'movimentoDeCofre'],
  mes: ['linhas', 'A linha de `meses` que está ABERTA — a que não tem `fechado_em`. É ela que define o intervalo por onde os totais se filtram.', 'abrirMes'],
  monthLimits: ['campo', 'O `limites` da linha do mês aberto, um objeto `envelope → limite` guardado como JSON. Muda com o `mudarLimiteDoMes`.', 'alterarMes'],
  monthZero: ['local', 'Marca uma casa que ainda não abriu mês nenhum, e nessas o gasto dos envelopes-semente não conta. Com servidor, quem responde a isso é o `mes` ser nulo; isto fica para a app correr sem servidor, como sempre correu.'],
  monthName: ['local', 'O nome do mês a mostrar. É uma etiqueta do ecrã, calculada da data.'],
  extractos: ['local', 'O extracto de cada mês — cada movimento de dinheiro, por ordem do tempo, com quem o fez e o saldo a seguir a ele. NÃO é dado: é uma DERIVAÇÃO das linhas do mês (`despesas`, `cofre_movimentos`, `meta_movimentos`, `acertos`, `transferencias`) feita na leitura (`extractosDe`), e refaz-se a cada leitura. Nada se grava ao fechar o mês: um extracto gravado seria um saldo escrito, e é o INVARIANTE #2 ao contrário. Sem servidor fica vazio — a app local guarda as somas do mês, não as linhas.'],

  // ── Compras ───────────────────────────────────────────────────────────────
  newItems: ['linhas', 'A coleção `artigos`, ligada à `listas_compras` da ida às compras.'],
  iconesDeSeccao: ['campo', 'O ícone que a família ESCOLHEU para cada corredor — o campo `icone` da coleção `seccoes`, lido como um mapa `nome → ícone`. Só as escolhas entram: um corredor que não esteja aqui ganha o ícone que o nome sugere, e a sugestão corre no cliente (`src/icone-do-corredor.js`) porque é desenho e não dado. Guardar o palpite no servidor era escrever uma escolha que ninguém fez.', 'iconeDaSeccao'],
  status: ['linhas', 'O `estado` de cada artigo vive NA LINHA — por comprar, confirmado, sem stock. Era um mapa que cada telefone reescrevia, e o esquema já avisava: «se fosse uma lista de identificadores confirmados, dois telefones na mesma loja anulavam-se».'],
  shopPlan: ['campo', 'A `listas_compras` aberta: a loja, quem vai, e para quando.'],
  itemGone: ['local', 'Lápides de artigos-semente. Um artigo do servidor apaga-se lá.'],
  itemEdits: ['campo', 'As alterações de um artigo — rótulo, corredor, estimativa, habitual — vão para a própria linha em `artigos`. O mapa existe porque uma SEMENTE do `data.js` não se pode editar no sítio, e é a mesma forma do `taskEdits`.', 'alterarArtigo'],
  itemOrder: ['campo', 'O `posto` da linha do artigo, dentro do corredor. É da CASA e não de quem olha: a lista do Modo Compras é o percurso da loja, e se a ordem fosse de cada um os dois adultos andavam por caminhos diferentes. Mesma razão do `taskOrder`.'],
  shopHistory: ['linhas', 'As últimas dez `listas_compras` FECHADAS, com o `total` que a ida custou. Era uma lista escrita no telefone de quem foi ao supermercado: quem não tinha ido via o histórico vazio.', 'shopHistory'],
  precos: ['local', 'O histórico de preços por artigo e loja. Não tem coleção no servidor: são observações deste dispositivo, e a comparação entre lojas ainda é local. É a lacuna maior que resta nas compras.'],
  precoPago: ['local', 'O que se escreveu no corredor NESTA ida. É um rascunho: vira observações ao fechar a conta, e limpa-se.'],

  // ── Regras e listas da casa ───────────────────────────────────────────────
  roles: ['campo', 'O `papel` de cada membro. Decide o que o servidor DEVOLVE — mudá-lo só no cliente mudava a aparência e mais nada.', 'editarMembro'],
  pins: ['campo', 'A palavra-passe do membro, por uma rota própria: o PocketBase exige `oldPassword` e quem põe o PIN de uma criança não o sabe. A criança ENTRA no servidor com ele, e muda-o por outra rota sabendo o atual; o `pin_definido` do membro diz se já tem PIN. O resumo local serve só a entrada sem servidor.', 'definirPin'],
  pontosLigados: ['campo', 'O `pontos_ligados` da casa. A Rita desligava os pontos e o Tomás continuava a vê-los.'],
  ementaDesligada: ['campo', 'O `ementa_desligada` da casa: se a casa NÃO planeia os jantares da semana. Pela negativa porque um `bool` novo nasce a `false` em todas as linhas, e `false` tem de ser «ligada». Desligada, a secção sai das Compras e da app da criança; os pratos ficam.', 'ementaDesligada'],
  iconesDesligados: ['campo', 'O `icones_desligados` da casa: se esta casa NÃO quer ícones nos corredores das Compras. Pela negativa pela mesma razão do `ementaDesligada`, e aqui custava mais caro — um `icones_ligados` nasce a `false` e apagava os ícones a quem já os tinha escolhido, no instante em que o campo chegasse. Desligado, os títulos dos corredores ficam só com o nome e a grelha de escolher sai do ecrã; o `seccoes.icone` fica intacto e voltar a ligar traz tudo.', 'iconesDesligados'],
  pointValue: ['campo', 'O `valor_ponto` da casa. Os dois telefones pagavam semanadas de valores diferentes.'],
  payDay: ['campo', 'O `dia_pagamento` da casa: em que dia da semana a semanada se paga.'],
  splitHalf: ['campo', 'O `divide_meias` da casa: se cada despesa partilhada se divide a meias.'],
  orcamento: ['campo', 'O campo `orcamento` da casa, em JSON: o modo (mensal ou anual), o ano, o rendimento do ano e a sua distribuição pelos meses.'],
  rendimento: ['campo', 'O `rendimento_mensal` da casa, contra o qual os limites dos envelopes se medem.'],
  nomeDaCasa: ['campo', 'O `nome` da casa, que aparece no cabeçalho e no ecrã de entrada.'],
  membros: ['linhas', 'A coleção `membros`. O servidor manda: se responder, são estes e mais nenhuns.'],
  specialities: ['linhas', 'A coleção `especialidades`. Só quem administra a casa lhes mexe — decisão do dono em 05/09/2026: manda o servidor.'],
  equipCatsProprias: ['local', 'Se a CASA é dona da lista de categorias de equipamento, ou se ainda corre com as quatro sementes. É o que deixa a lista ficar vazia depois do «Começar de Zero» sem as sementes voltarem.'],
  equipCats: ['linhas', 'A coleção `categorias_equip`, uma das três listas da casa com a mesma forma.'],
  stores: ['linhas', 'A coleção `lojas`. Renomear GUARDA a linha — apagar levava atrás as listas de compras que a referem.'],
  listasIds: ['local', 'O `nome → id` das três listas da casa. É um índice do que já subiu, não dado — refaz-se a cada leitura.'],

  // ── Saúde ─────────────────────────────────────────────────────────────────
  health: ['linhas', 'A coleção `episodios_saude`, e só para um servidor que viva na casa (`eEnderecoDeCasa`).'],
  healthDocs: ['linhas', 'A coleção `anexos`, com o ficheiro, pelo mesmo travão.'],
  healthNotes: ['linhas', 'A coleção `notas_saude`. Só o autor altera ou apaga a sua, e a regra é do servidor.', 'notaDeSaude'],
  healthRecipes: ['linhas', 'A coleção `receitas_saude`, ligada ao episódio. A receita tem de chegar a quem for à farmácia, e não a quem a escreveu.', 'receitaDeSaude'],
  healthAlergias: ['linhas', 'A coleção `alergias_saude`: uma linha por alergia do MEMBRO — nome, gravidade, nota —, com as regras da ficha de saúde e o travão de casa. É a primeira secção da ficha de emergência; as outras três derivam do que já sobe.', 'alergiaDeSaude'],
  healthTomas: ['linhas', 'A coleção `tomas_saude`: uma linha por toma marcada — a receita, quando, quem —, aditiva; desmarcar apaga-a. Sobe pelo mesmo travão de casa das consultas, por decisão do dono da casa em 12/09/2026.', 'tomaDeSaude'],
  healthDecisions: ['linhas', 'A coleção `decisoes_saude`, com índice único por episódio: uma decisão é um estado, não um movimento, e não se pode somar.', 'decisaoDeSaude'],
  healthArchived: ['local', 'Que consultas estão arquivadas. Ainda não tem campo no servidor — arquivar é uma vista deste dispositivo sobre a lista, não uma propriedade da consulta.'],
  healthGone: ['local', 'Lápides de consultas-semente apagadas neste dispositivo.'],

  // ── Equipamentos ──────────────────────────────────────────────────────────
  contratos: ['linhas', 'A coleção `contratos`: nome, fornecedor, quando renova, fidelização, quem trata e o documento na própria linha. O documento sobe à parte, num `update` com ficheiro, porque a fila serializa em JSON; até subir fica «só aqui».', 'contratoDaCasa'],
  newEquip: ['linhas', 'A coleção `equipamentos`. Existia desde o início e ninguém escrevia nela: a garantia da máquina de lavar era conhecida de um telefone só. As fotografias (`fatura`, `foto`) sobem à parte, num `update` com ficheiro (`fotografiaDoEquipamento`), porque a fila serializa em JSON; até subirem a ficha diz «só neste aparelho».', 'equipamentoDaCasa'],
  equipEdits: ['campo', 'As alterações de um equipamento vão para a própria linha. O mapa existe porque uma SEMENTE não se pode editar no sítio.', 'alterarEquipamento'],
  equipGone: ['local', 'Lápides de equipamentos-semente. Um equipamento do servidor apaga-se LÁ, pelo `apagarEquipamento`; isto marca só os que vêm do `data.js`.'],

  // ── Do dispositivo, e de mais ninguém ─────────────────────────────────────
  schemeByUser: ['campo', 'O `esquema_cor` da linha de `preferencias` de cada um. É a única coleção que NÃO é da casa: a regra é `membro = @request.auth.id`, e nem quem administra vê as dos outros.', 'preferenciasDoMembro'],
  themeByUser: ['campo', 'O `aspeto` da mesma linha — claro, escuro ou sistema. Os valores são os mesmos dos dois lados, e por isso não há tabela de tradução.', 'preferenciasDoMembro'],
  notif: ['campo', 'Os avisos, na mesma linha: `resumo_ativo`, `resumo_hora` e `aviso_prazo_dias`. Cada um escolhe os seus, e ninguém escolhe pelos outros.', 'preferenciasDoMembro'],
  clearedSeeds: ['local', 'Se as sementes de demonstração já saíram deste dispositivo. É um facto sobre este telefone, não sobre a casa.'],
  deDemonstracao: ['local', 'Se a app está a correr com a família de demonstração. É o oposto de ter servidor — por definição não sobe.'],
  casaDoServidor: ['local', 'O `id` da casa do servidor que a cópia local deste aparelho reflete. Serve para quem entrar de OUTRA casa no mesmo telemóvel não ver a anterior: se o id mudar, o estado volta a vazio antes da leitura. É o aparelho a saber de quem é a cópia, não dado da casa.'],
  registo: ['linhas', 'A coleção `registo`, que só se apende. Não há repetidas para juntar: a linha nasce no momento da acção, escrita por quem a fez. E traz o `quem`, que é a única coisa que um registo local nunca podia ter.', 'registoDaCasa'],
};

// As três respostas possíveis, para a prova as poder verificar.
export const RESPOSTAS = ['linhas', 'campo', 'local'];
