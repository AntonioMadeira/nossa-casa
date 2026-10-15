# Nossa Casa — instruções para o Claude Code

App familiar para uma casa de dois adultos (Rita, Tomás) e duas crianças (Léo, Mia): agenda,
tarefas com pontos, lista de compras que fecha em despesa, orçamento por envelopes,
equipamentos com garantias, e fichas de saúde.

**Português europeu em toda a interface.** Registo formal, terceira pessoa, nunca "tu".
Euro com vírgula decimal. Datas dd/mm/aaaa.

---

## Estado do projeto

Este é um projeto **Expo / React Native** com a lógica de negócio completa e a camada visual
parcial. O que falta está em `TAREFAS.md`, por ordem.

```
npm install
npx expo start        # i = iOS, a = Android, ou QR com o Expo Go
```

**O código nunca foi executado** — foi verificado estaticamente. Espere ajustes na primeira
compilação. O candidato mais provável são os tipos de letra (ver README.md).

---

## Fonte de verdade do desenho

`design/Nossa Casa App.dc.html` é o protótipo interativo — **abra-o num navegador antes de
escrever qualquer ecrã**. É HTML, corre com duplo clique, e cada medida nele está decidida e
testada. Quando este ficheiro e o protótipo discordarem, o protótipo ganha.

`docs/especificacao-ecras.md` descreve os 26 ecrãs ao pixel. `docs/sincronizacao.html` e
`docs/seguranca.html` são as especificações de servidor.

---

## Invariantes — não negociáveis

### 0. A base de dados está escrita — e provada

O alvo é o **PocketBase**: `db/pocketbase/`. As regras que impõem os invariantes abaixo
não estão escritas e esperadas — estão **provadas a correr**:

```
npm run db:servir     # o servidor. Sem ele a app corre local, e o ecrã de
                      # entrada diz que o servidor não responde — não que a
                      # Google esteja mal configurada. Já enganou duas vezes.
                      # ⚠ ISTO FALHA NA CONSOLA DAS FERRAMENTAS (17/09/2026):
                      # o script chama `pocketbase` sem caminho e o PATH de lá
                      # não o vê — «'pocketbase' is not recognized». É a mesma
                      # história do `gh`. Com o caminho completo, a partir da
                      # raiz do projeto, e apontando os hooks à worktree onde
                      # se está a trabalhar:
                      #
                      #   ./pocketbase.exe serve --http=127.0.0.1:8095 \
                      #     --dir "<raiz>/pb_data" \
                      #     --migrationsDir "<worktree>/db/pocketbase/pb_migrations" \
                      #     --hooksDir "<worktree>/db/pocketbase/pb_hooks"
                      #
                      # E depois de o servidor cair, a sessão vai-se: a app
                      # volta ao «Continuar com Google», e só o dono da casa a
                      # pode reabrir. Ver [[servidor-em-baixo-expulsa-o-utilizador]].
npm run db:provar     # as regras, coleção a coleção — 34 ficheiros, 605 provas (27/09/2026)
                      # ⚠ Desde 27/09 isto é um CORREDOR (`provar-tudo.mjs`) e
                      # não uma cadeia de `&&` no package.json. Três razões, as
                      # três medidas: a cadeia parava ao primeiro erro e escondia
                      # o resto; parou uma vez aos 30 ficheiros com o código 127
                      # e TODAS as linhas a verde, e só se deu por ela somando à
                      # mão; e havia um ficheiro no disco — o
                      # `provar-limpar-casa.mjs` — que nunca estava na cadeia e
                      # nunca tinha corrido. O corredor enumera do DISCO, conta
                      # os ficheiros, e repete UMA vez quem rebentar sem falhar
                      # prova nenhuma — dizendo-o no fim, com o nome.
npm run aceitacao     # as HISTÓRIAS, de ponta a ponta pela camada da app — 10 histórias,
                      # 70 passos «Dado / Quando / Então», em db/pocketbase/aceitacao/
```

Cada prova tenta o que a `docs/seguranca.html` diz que não pode acontecer e falha se
**passar**. Antes de mexer nas coleções, corra-as; depois de mexer, corra-as outra vez.
`db/README.md` explica cada decisão.

⚠ **Um campo novo precisa de DOIS sítios.** O `criar-colecoes.mjs` é a verdade de como a base
se constrói do zero — e para o ser **apaga tudo e recria**. Numa casa com dados, correr esse
ficheiro é perder a casa. Declare o campo lá e acrescente-o à tabela do `acrescentar-campos.mjs`:

```
npm run db:campos     # idempotente, e confere que os campos ficaram lá
```

Já falhou três vezes por esta ordem: o `membros.avatar`, o `artigos.corredor`, o `artigos.posto`.
O quarto, `membros.pin_definido` (09/09/2026), o quinto, `artigos.visibilidade` (11/09/2026), e o
sexto, `despesas.conta_fixa` (12/09/2026), já nasceram nos dois sítios. **E uma REGRA que mude
depois da base precisa do mesmo par**: a declaração no `criar-colecoes.mjs` e uma linha na tabela
`REGRAS` do `acrescentar-campos.mjs`, que a aplica ao servidor a andar — aconteceu ao
`tarefas_feitas` (apagar), aos `artigos` (ler) e às `despesas` (criar, com a âncora da conta fixa).

⚠ **O sétimo caso apanhou-se ao contrário (13/09/2026):** o `membros.avatar` e o `figura`
estavam SÓ na tabela do `acrescentar-campos.mjs` — uma base criada do zero nascia sem eles. E
**toda a coleção que o `criar-colecoes.mjs` cria tem de estar na lista `NOSSAS`** (a ordem de
apagamento): `objetivos_cofre`, `pratos` e `ementa` não estavam, e a segunda corrida do ficheiro
parava em «Collection name must be unique». O guarda é `__tests__/a-casa-simulada-apanhou.test.js`.
A forma de o provar sem tocar na casa real é um PocketBase temporário noutra porta com
`npm run simular:casa` (uma casa cheia e difícil: cinco membros, oito corredores, três meses).

**O PIN vive no servidor.** A criança entra com `authWithPassword` (o `login`
`casa_nome` e o PIN como palavra-passe), o «tem PIN» é o `pin_definido` do membro
(escrito pelo hook e pela rota, nunca pelo cliente), quem administra repõe pela rota
`/api/casa/pin` e a criança muda o seu por `/api/casa/pin/proprio` sabendo o atual.
O resumo local (`resumoPin`) serve a entrada SEM servidor e mais nada. Guardas:
`a-entrada-da-crianca-e-no-servidor` e `provar-regras-da-casa.mjs`.
O PocketBase aceita um `update` e **ignora em silêncio** o campo que não conhece — uma escrita
que não se lê de volta passa por boa.

`src/pocketbase.js` é a camada de ligação. Sem `EXPO_PUBLIC_PB_URL` definido, a app corre
local como sempre correu — a ligação é opcional, não um pré-requisito.

`db/postgres/` é o esquema PostgreSQL anterior, guardado como referência: é onde as
políticas estão pensadas ao pormenor.

**⚠ A saúde SINCRONIZA desde 30/09/2026** (`A_SAUDE_SOBE = true` em `src/endereco.js`, decisão
do dono da casa: «o RGPD é preocupação minha»). Tudo o que está abaixo sobre o travão descreve o
mecanismo, que continua lá e se inverte numa linha — mas o travão está **aberto**. Confirmado de
novo em 15/10/2026, quando uma frase do Perfil afirmou o contrário por se ter fiado neste ficheiro.

**A saúde não SINCRONIZA — mas está construída.** (histórico, até 30/09/2026) Esta linha dizia que `episodios_saude`
e `anexos` «não existem nas coleções nem na camada de cliente», e era falso nas duas
metades. Corrigido em 03/09/2026:

- as coleções **existem**, com regras e **16 provas** em `provar-saude.mjs`
- o cliente **tem** `ler.saude()` em `src/pocketbase.js`
- o que não existe é a **escrita**, e é travada à mão: `recusaSaude()` em `src/sync.js`
  rebenta se alguém lhe acrescentar uma escrita de saúde
- as **tomas** de uma receita (`tomas_saude`, 12/09/2026) estão dentro do mesmo travão,
  por decisão do dono da casa: «as tomas sobem pelo travão de casa»
- as **alergias** da ficha de emergência (`alergias_saude`, 12/09/2026), idem

⚠ **Toda a relação para `membros` conta.** O guarda `provar-relacoes-ancoradas` saltou as
relações para `membros` durante oito dias — é uma coleção de AUTENTICAÇÃO e o mapa de nomes só
tinha as de base —, e três coleções viveram sem âncora: uma adulta de outra casa criava uma
consulta, um movimento de cofre ou um acerto a apontar para pessoas desta. Corrigido em
12/09/2026: 41 relações vigiadas, um ataque por cada.

O travão é a conformidade, não a construção: cinco pontos no `db/postgres/README.md`, e
são dados clínicos de menores. **Enquanto o servidor da casa correr em `127.0.0.1`**,
quase todos colapsam — não há subcontratante nem titular fora da casa. Voltam todos no
dia em que o servidor for exposto à internet ou alojado por outrem, e isso é decisão do
dono da casa.

⚠ **Uma criança não lê a sua própria ficha.** O servidor devolvia-a e o cliente
escondia-a: uma divergência de três pontas, com o ecrã a prometer «invisíveis às
próprias» em letras. O INVARIANTE #3 diz que o dado não pode CHEGAR ao dispositivo — e
chegava. Resolvido no servidor, que era o lado errado.

### 1. Cabeçalho e rodapé aparecem em TODAS as janelas

Nenhum ecrã os esconde. Nem os de ecrã inteiro (compras, equipamentos, saúde), nem com folhas
ou diálogos abertos. Isto quebrou **três vezes** no protótipo; o padrão do erro é sempre o mesmo:

- O rodapé tem de ser o **último filho da raiz da app**, irmão do cabeçalho e da área de scroll.
- A condição do rodapé é `inApp` e mais nada. Se um ecrã precisar de espaço, encolhe o conteúdo.
- Em React Native: `<View style={{flex:1}}>` com cabeçalho (`flex:0`), conteúdo (`flex:1`) e
  rodapé (`flex:0`). Folhas e diálogos são `<Modal>` ou absolutos **dentro** dessa raiz, com o
  rodapé por cima (`zIndex` alto) — não fora dela.

Depois de mexer na árvore de um ecrã, **meça**: o rodapé tem de ficar visível no fundo do ecrã.

### 2. Saldos nunca são campos escritos

Cofres das crianças, envelopes, pontos e o acerto de contas são **somas de movimentos aditivos**.
Nunca escreva `saldo = X`. Escreva um movimento e some. É isto que impede dois telefones de se
anularem quando ambos alteram a mesma casa — e é a diferença entre uma app que funciona a dois e
uma que perde dinheiro.

Ver `src/store.jsx`: `vault`, `envMove`, `paidPts` seguem esta regra.

### 3. Visibilidade imposta no servidor, nunca no cliente

Um evento privado ("Só eu") ou uma ficha de saúde de adulto **não são escondidos na interface** —
não são devolvidos pela consulta. Se o filtro viver no cliente, o dado chega ao dispositivo do
outro membro e basta uma falha de interface para o revelar.

Quando ligar ao Supabase: políticas de Row Level Security, uma por tabela. `docs/seguranca.html`
tem a tabela de autorização operação a operação.

### 4. Formato do euro com espaço inquebrável

`1 250,00 €` — milhares separados por espaço estreito inquebrável (U+202F), vírgula decimal, e
**espaço inquebrável antes do €** (U+00A0), senão o símbolo cai sozinho para a linha seguinte.
Já implementado em `src/format.js` (`EUR`). Use sempre essa função; nunca formate à mão.

### 5. Alvos de toque nunca abaixo de 44 px

Inclui ícones sozinhos, alternadores, pastilhas e setas.

⚠ **A linha do modo compras passou de 64 a 48 px** (17/09/2026, com o talão).
Os 64 nasceram de uma linha que tinha, do lado direito, DOIS botões de texto
empilhados de 88 × 44 — «Confirmar» e «Sem stock» — e era preciso acertar num
deles com o carrinho na mão. A linha do talão tem dois alvos e mais nenhum: o
nome, que ocupa a largura toda e marca, e o preço, encostado à direita. Um alvo
largo de 48 acerta-se melhor do que um de 64 dividido em duas zonas. O mínimo
de 44 continua a valer para tudo, sem excepção.
Um ícone de 20 px vive dentro de um alvo de 44. Isto falhou repetidamente ao comprimir
espaçamentos — **verifique depois de mexer em qualquer gap**.

### 6. A urgência manda na ordem das tarefas

Urgentes primeiro, normais depois, sem pressa no fim; os números renumeram-se 1, 2, 3 dentro do
grupo. Mudar a urgência move a tarefa. Ver `sortedTasks` em `src/store.jsx`.

---

## Sistema visual

Tudo em `src/theme.js`. **Não invente valores** — se precisar de um que não existe, é sinal de
que o desenho está a divergir.

**Cor de ação** — não existe laranja nesta app. A ação vem do esquema escolhido pelo membro
(seis esquemas, `SCHEMES`), e é **por perfil**: a Rita pode ter violeta e o Tomás cião.
Nunca escreva uma cor de ação literal; leia-a do tema.

**Os botões seguem o esquema — não há botão preto.** O protótipo pinta todos os botões
principais com três tokens do esquema, e estão no `buildTheme`: `actBg` (o acento em tinta),
`actBrd` (a borda, a 3:1 contra página, folha e cartão) e `actFg` (o acento escurecido ou
clareado até 4,5:1 sobre o fundo real do botão). Um `Primary comum` é isto. O acento **cheio**
fica para o que não se desfaz — a lista fechada de `__tests__/o-acento-e-reservado.test.js`.
O dono da casa perguntou três vezes «porque é que está a preto?» antes de se descobrir que os
tokens do protótipo nunca tinham chegado à app. Antes de dar cor a um componente novo, procure
o token no protótipo.

**Cuidado com o branco.** `white` é primeiro plano (texto sobre cabeçalho e sobre botões de
ação) e `surface` é superfície (cartões, folhas, rodapé). No modo escuro só a segunda escurece.
Sobrecarregar as duas com o mesmo valor apagou metade da interface uma vez.

**Alfa sobre o cabeçalho é calculado, não fixo.** O subtítulo do cabeçalho é branco com
transparência; o alfa depende da luminosidade do cabeçalho do esquema, senão os esquemas claros
falham o contraste. Ver `chromeSub` em `src/theme.js`.

**Títulos de secção seguem o esquema do membro** — nunca preto. Eram slate fixo (`#67769B`);
passaram a ser o acento do esquema no modo claro e o `hover` no escuro, porque o acento não
chega aos 3:1 contra a página escura em três dos seis esquemas (Cinza 2,55, Violeta 2,77,
Céu 2,98). Ver `titulo` em `src/theme.js`.

**As etiquetas pequenas (`Label`) continuam em slate**, e é uma decisão: 12 px precisam de
4,5:1, e aí o Cião falha no claro e o Cinza no escuro. ⚠ Esta frase dizia que o slate chegava
aos 4,5 e **era falso**: o `#67769B` do protótipo dá 4,03 sobre a página e 4,41 sobre o cartão.
Desde 08/09/2026 o `slate` e o `text3` claros estão **um tom abaixo** do protótipo (`#606E90`,
`#656C7C`), medidos. Uma afirmação num documento não é um guarda — o guarda é
`__tests__/texto-pequeno-le-se-nos-doze-temas.test.js`, que calcula os pares de tokens nos doze
temas.

**Texto pequeno em cor: só três tokens servem.** O acento e o `titulo` falham como texto de
11–14 px no escuro em cinco dos seis esquemas (2,12–4,08). Texto em cor de ação leva **`actFg`**
(≥ 4,5 nos doze temas); ícone em cor de ação leva `titulo` (3:1). Cada estado tem três papéis:
`x` é o objeto gráfico (barra, borda, ícone), **`xTexto`** é o texto sobre as superfícies do
tema (o «deep» no claro, um tom claro no escuro), e `xDeep` fica **só** para o texto sobre o
tijolo do próprio estado (`xBg`, opaco e claro nos dois aspetos) e para o preenchimento que leva
branco. Os «deep» eram usados como texto no escuro: `errDeep` sobre o cartão escuro dá 3,00.
A inicial de um avatar é `corSobre(cor)` — branco ou preto, conforme a cor do membro.

**Espaçamento: 2 / 4 / 8 / 16 / 24.** Cinco valores, mais nada. Enchimento dos cartões 14/16.

**Ícones** — traço aberto, 1,75 de espessura, grelha de 24. Ver `src/Icon.jsx`. Cada ícone tem um
significado exclusivo: `lock` é privado, `smile` é bónus de criança, `houseGear` é a gestão da
casa, `heartPulse` é saúde. **Nunca reutilize um ícone com outro sentido** — é pior do que um
ícone menos evocativo.

**Uma escolha que cresce com a casa é um CAMPO, não uma fila de pastilhas.**
`src/CampoDeEscolha.jsx` — uma linha de 44 com o valor e um `caretDown`, que abre uma folha
com a lista (e um campo de pesquisa acima de doze opções). A altura não depende do número de
opções: as pastilhas custavam 149 px com quatro corredores e 485 com vinte e sete, e este
campo custa 83 com os dois. Decisão de 25/09/2026, opção B de `design/escolher-corredor.dc.html`.
Duas ou três escolhas **fixas** ficam em `Choice` ou `Segmented`, onde se vêem todas de uma vez.
Quem já está dentro de uma folha usa a `ListaDeEscolha` e não abre uma segunda.
O guarda `__tests__/uma-escolha-que-cresce-nao-e-uma-fila.test.js` enumera as filas que restam,
com a razão escrita de cada uma. Em 26/09/2026 ele disse «corrige tudo» e entraram as últimas:
o envelope (que tinha **três** desenhos para a mesma escolha — fila, grelha de dois e pilha
vertical), a meta do fecho do mês (onde a saída «nenhuma» era um toque repetido que ninguém
anunciava) e a categoria de um equipamento. Nessa ronda o envelope passou também a guardar-se
pelo **nome** e não por um índice, que era a classe 41 por resolver.

**Sem emoji.** É uma app que trata de dinheiro.

---

## Erros já cometidos — não repetir

1. **`</View>` a mais** fechou a raiz cedo e o rodapé saiu da coluna flex. Três vezes.
   Conte as tags depois de editar a árvore de um ecrã.
2. **Sobrecarregar o token de branco** (superfície e primeiro plano no mesmo nome) apagou
   títulos e pastilhas selecionadas no modo escuro.
3. **Acento fixo no ícone da app** — era laranja; quando o laranja saiu, o ícone ficou
   incoerente e ninguém reparou durante semanas. O ícone da app não leva cor de esquema.
4. **Alfas de branco fixos** calibrados para um cabeçalho escuro falharam o contraste nos
   esquemas claros.
5. **Comprimir espaçamentos** fez cair alvos de toque abaixo de 44 px em três sítios.
6. **Pílula tocável dentro de linha tocável** obrigava a adivinhar onde se tocou. Uma linha,
   um destino.

---

## Como verificar

O protótipo foi construído com medição, não com impressão. Mantenha isso:

- Depois de mexer num ecrã, corra-o e **meça** o rodapé, os alvos de toque e as linhas que
  podem partir em duas.
- A largura útil do conteúdo é **355 px** num telefone de 402. Títulos longos partem.
- Teste com os seis esquemas de cor e nos dois aspetos (claro e escuro), não só no predefinido.
- Teste o modo criança: PIN, tarefas, cofre — e confirme que **nenhuma informação de orçamento**
  aparece lá. E nos seis esquemas também: a app da criança segue o `esquema_cor` e o `aspeto`
  da linha DELA em `preferencias` — acento, cabeçalho e rodapé (`t.chrome`, como nos adultos);
  a cor do membro fica só na bola do avatar. Esteve presa no Violeta até 10/09/2026 com o
  servidor a dizer Cião, e o cabeçalho ficou azul mais umas horas — o guarda é
  `__tests__/a-crianca-tem-o-seu-esquema.test.js`.

---

## O que não fazer sem perguntar

- Acrescentar ecrãs, secções ou funcionalidades que não estão em `TAREFAS.md`.
- Mudar o registo da escrita (formal, terceira pessoa) ou traduzir para outra variante.
- Introduzir uma biblioteca de componentes visuais — o sistema é próprio e está em `theme.js`.
- Fechar o travão da saúde (`A_SAUDE_SOBE`) ou mudar quem a vê: são dados de saúde de menores,
  categoria especial no RGPD. A decisão de a sincronizar é do dono da casa. `docs/seguranca.html`
  explica.
