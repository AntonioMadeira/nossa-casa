# Nossa Casa — React Native

App familiar: agenda, tarefas, compras, dinheiro, equipamentos e saúde. Uma base de código, iOS e Android.

Português europeu, euro, datas `dd/mm/aaaa`.

## Correr

```bash
npm install
npx expo start
```

Os ficheiros estão na raiz do projeto — não há pasta `nossa-casa-rn`.

Depois: `i` para o simulador iOS, `a` para Android, ou ler o código QR com a app **Expo Go** no telefone.

Precisa de Node 18+ e, para os simuladores, Xcode (iOS) ou Android Studio.

## Como está organizado

```
App.jsx              casca de navegação — cabeçalho, scroll, rodapé
src/theme.js         cores, escala, tipo, sombra, esquemas, claro/escuro
src/format.js        euro PT-PT, datas, prazos
src/data.js          dados de demonstração
src/store.jsx        estado + persistência + todas as derivações
src/ui.jsx           componentes base (cartão, linha, segmentado, alternador…)
src/Icon.jsx         conjunto de ícones e a marca
src/Sheet.jsx        folha inferior
src/screens/         Login, Inicio, Dinheiro, Tarefas, Compras, Agenda, Perfil
```

**`store.jsx` é o ficheiro a ler primeiro.** Contém a separação entre dados (gravados) e interface (transitória), a máquina de estados das tarefas, as regras de papéis e a validação de PIN. A interface lê tudo através dele.

## ⚠ Invariantes que não se podem quebrar

**1. Cabeçalho e rodapé em todas as janelas.** Estão em `App.jsx` e a raiz é uma coluna flex com exatamente três filhos:

```
header   flex: 0                    ← não encolhe
scroll   flex: 1, minHeight: 0      ← o conteúdo vive aqui
footer   flex: 0                    ← último filho, sempre
```

Se um ecrã precisar de mais espaço, encolhe o conteúdo, nunca o rodapé. Os dois ecrãs de ecrã inteiro (modo de loja, equipamentos) trazem cabeçalho e rodapé próprios — não os escondem. Esta regra quebrou-se três vezes no protótipo; sempre por o rodapé ter saído da coluna da raiz.

**2. Saldos nunca são campos escritos.** Cofres, envelopes e pontos são somas de movimentos aditivos. É o que impede dois telefones de se anularem quando a sincronização entrar.

**3. Alvos de toque nunca abaixo de 44 px.** O componente `Tap` garante-o; use-o em vez de `Pressable` cru para ações só com ícone. No modo de loja as linhas têm 64 px, porque se usa com uma mão e o carrinho na outra.

**4. A cor nunca é a única informação.** Urgência tem cor *e* forma (cheia, tracejada, contorno). Membro tem cor *e* inicial no avatar. Estado tem cor *e* ícone.

**5. O símbolo do euro leva espaço inquebrável.** `EUR()` em `format.js` trata disso — nunca formate valores à mão.

## O que está portado

Os cinco separadores, o ecrã de entrada com as quatro etapas (Google, contas, crianças, PIN), o modo de loja, o calendário expansível com navegação de meses e anos, a folha de perfil com aspeto e esquema de cor, a Gestão da Casa e a ficha de membro com PIN.

A lógica está **completa** — é a mesma do protótipo, e é a parte que vale.

## O que falta, e como se acrescenta

As folhas de criar e gerir (novo evento, nova tarefa, novo artigo, registar equipamento, marcar consulta) e os ecrãs de equipamentos, saúde e documentação. Todas seguem dois padrões que já estão escritos:

- **Folha** — `<Sheet>` com `title`, `sub`, `action`, e os campos dentro. Ver `Dinheiro.jsx`, que tem duas (mover dinheiro, registar despesa).
- **Ecrã de ecrã inteiro** — `<Modal>` com cabeçalho e rodapé próprios. Ver o modo de loja em `Compras.jsx`.

O desenho de cada uma está medido ao pixel no `README.md` do pacote de entrega, na pasta `design_handoff_nossa_casa`.

## Antes de publicar

**A persistência é local.** `AsyncStorage` guarda no dispositivo; os dados não passam para o telefone do outro adulto. Sincronizar implica servidor — ver `Sincronizacao entre Membros` no pacote de entrega.

**As permissões são uma sugestão até haver servidor.** Quem edite o armazenamento do dispositivo escala o próprio papel. O PIN é verificado no cliente. Ambas as falhas estão documentadas em `Seguranca em Producao`, com o que o servidor tem de fazer: PIN como hash com sal, papéis devolvidos pelo servidor a cada sessão, e visibilidade imposta na consulta — nunca na interface.

**Tipos de letra.** O código pede Roboto e Inter. Instale-os com `expo-font` ou substitua por `System` em `theme.js`; sem isso, o Android cai no tipo padrão.

**Licença da fotografia de entrada.** `assets/login-bg.jpg` vem do sistema de design e pode não estar liberta para publicação.

**Google Calendar** exige verificação da Google, e o processo leva semanas. Comece por aí.
