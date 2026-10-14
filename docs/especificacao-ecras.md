# Handoff: Nossa Casa — app familiar (agenda, tarefas, dinheiro, compras, equipamentos)

> **Version 3 — August 2026.** The visual language changed after the first export and this document is updated throughout. If you have the v1 package, the differences that matter are collected in **Visual language — v2 changes** immediately below; the per-screen specs further down already reflect v2.

## Visual language — v2/v3 changes

1. **No orange anywhere.** The action colour is **Midnight Blue `#011B58`** on a **Storm Blue `#001529`** chrome (scheme *Azul Sóbrio*, the default). `#F16505` and `#FF892E` appear nowhere in the app and the orange scheme was removed from the picker. Only three schemes ship: Azul Sóbrio, Violeta, Cião.
2. **Buttons are tonal, not filled, and smaller.** A primary action is `background: var(--c-act-bg)` + `1px solid var(--c-act-brd)` with the label in `var(--c-act-fg)`, height **44–48px** (was 52–60), **no shadow**. Those three tokens are derived from the active scheme's accent: tint 10 % (light) / 20 % (dark) for the fill, 38–45 % for the border, the accent itself for the label. Destructive actions are the only coloured exception: `2px solid var(--c-error-deep)` with red label and icon.
3. **Corners are much softer.** Buttons **8px**, list rows and cards **6px**, chips **4px**, sheets **8px 8px 0 0**. Nothing is a pill any more except avatars, colour dots, toggles and progress-bar fills (functional roundness).
4. **Shadows mostly gone.** Resting cards use `1px solid var(--c-grey-3)` instead of `elev-1`. Elevation survives on the navbar, sheets and modals.
5. **Início opens on a dark panel.** The navbar extends into a Storm Blue panel carrying the greeting, the date and three tappable figures (Disponível / Tarefas hoje / Eventos). Other tabs keep the compact navbar.
6. **Creation actions are the last row of their list**, in a dashed `1px dashed #A9B4C6` row (44px, 6px radius) — *Acrescentar tarefa*, *Agendar um evento*, *Acrescentar artigo à lista*, *Registar equipamento*. There is no full-width creation button anywhere.
7. **Alert colours: grey except real risk.** Informational rows in *Precisa de Si* use a `#A9B4C6` left edge and `#6A7282` icon; **only a limit that has been exceeded is red** (`#CE0002`). *(08/09/2026 — this paragraph used to say "Amber/Warning Yellow is used nowhere", and the prototype's own code contradicts it: the `needs` list paints an expiring warranty with a `--c-warn-yellow` edge and a `#8F5600` icon, and the store mode, the tiles and the badges use it too. The prototype wins over this text, by the project rule; the app follows the code — amber means "a deadline is near". Upcoming consultations and the calendar-to-connect row, which the prototype does not have, are blue (`state.info`).)* Note tiles are neutral, the points pill is neutral, envelope bars step straight from blue to red.
8. **Real dates.** Events carry `d{YYYY}-{MM}-{DD}` keys; the calendar is computed from the real calendar (20/08/2026 is a **Thursday**, the week shown is 17–23). Month and year navigation, and a selected-day state, exist — see *Agenda*.
9. **New: house history.** Every mutation is logged (who, what, when) and persisted; readable in *Histórico da Casa* inside the profile sheet.
10. **v3 — the scheduling sheet was rebuilt.** Free-text title field, one **Dia e hora** row that opens a calendar popup, and a compact fade roller for the time. Full spec in *13. Sheet: Agendar Evento* and *13b. Popup: Dia e hora*. The old three-preset rows for title / day / time are gone.
11. **v3 — chrome top and bottom.** The bottom menu is Storm Blue `#001529` with white icons and labels (inactive `rgba(255,255,255,.55)`), matching the navbar, so the menu survives dark mode; in the child app it takes that child's colour darkened to 62 %.

## Overview

**Nossa Casa** is a family-management mobile app for a household of two adults (Rita, Tomás) and two young children (Léo, Mia). It joins two things the market keeps separate: household organisation (shared calendar, chores, grocery list) and shared money (monthly budget, envelopes with limits, who-owes-whom settle-up, children's allowance). The single differentiating flow is that the grocery list closes into an expense: shopping mode → close the bill → the real total lands in the *Mercearia* envelope → the balance between the two adults updates.

All UI copy is **European Portuguese (PT-PT)**, currency **euro (€)**, dates **dd/mm/yyyy**. Copy register is procedural and formal (third person, never "tu"), matching the bound design system.

Target: **iOS and Android**. The prototype is framed as an iPhone (402 × 874 logical px) but the layout is a standard vertical flex stack and carries over to Android with its native navigation bar.

## Status

**Prototype version 1.4.2** (26 August 2026). Feature-complete for the flows below; static only where noted. The prototype carries its own changelog — open the app, tap the navbar avatar, then *Documentação* — generated from a single hand-written register in the source (`REGISTO`). Use it to see what changed and why, per version and per area.

**Read in this order:** this README (screens, tokens, interaction rules) → `Seguranca em Producao.dc.html` (security model — read before the first endpoint) → `Sincronizacao entre Membros.dc.html` (data model, sync, roles).

## About the Design Files

The files in `design/` are **design references created in HTML** — prototypes showing intended look and behaviour. They are **not production code to copy**. They use a bespoke in-house template runtime (`support.js`, `<x-dc>`, `<sc-for>`, `<sc-if>`) that exists only for design review; do not port that runtime.

The task is to **recreate these designs in the target codebase's environment** using its established patterns and libraries. If no codebase exists yet (the likely case here), choose the framework — one cross-platform codebase (React Native or Flutter) is the sensible default for a two-platform consumer app of this size — and implement the designs there.

Open `design/Nossa Casa App.dc.html` in a browser to interact with the full prototype. Everything described below is reachable in it.

## Fidelity

**High fidelity.** Final colours, typography, spacing, radii, shadows, states and copy. Recreate the UI faithfully using the target platform's components. Every value in this document is exact and comes from the bound design system's tokens (see *Design Tokens*), not from invention.

One caveat: the prototype's persistence is `localStorage` on one device and its Google sign-in is staged. Both are placeholders for real infrastructure — see *Backend & Sync*.

---

## Information Architecture

Two distinct applications behind one entry screen:

**Adult app** — five bottom-menu entries:
1. **Início** — dark panel (greeting + three figures), *Precisa de Si*, next events, today's tasks, budget summary
2. **Dinheiro** — budget, envelopes, settle-up, family goals, equipment
3. **Tarefas** — member filter, children's allowance, routines and tasks
4. **Compras** — grocery list → shopping mode → receipt
5. **Agenda** — week strip, member legend, grouped days

**Child app** — two bottom-menu entries, entered by PIN, in the child's own colour:
1. **Tarefas** — only that child's tasks, larger touch targets
2. **O Meu Cofre** — balance, movements, request-to-spend

The child app deliberately contains **no budget, envelope or expense information**. This is a product decision, not an oversight.

Two flows take over the whole screen (navbar and bottom menu hidden): **Modo Compras** (in-store) and **Equipamentos da Casa**.

---

## Screens / Views

### 1. Entrar (login)

**Purpose:** authenticate an adult via Google, or hand the device to a child.

**Layout:** full-bleed photographic background (`assets/login-bg.jpg`, `background-size: cover; background-position: center`) with a `rgba(0,0,0,.6)` overlay. Product name block absolutely positioned at `top: 76px; left: 16px`. A frosted glass panel is pinned to the bottom: `background: rgba(0,0,0,.6); backdrop-filter: blur(60px); border-radius: 8px; padding: 24px 20px;` inside a container with `padding: 0 16px 44px`. Column gap 20px.

**Components:**
- Title `Nossa Casa` — Roboto Medium 32px, `#FFFFFF`, letter-spacing 0.25px
- Subtitle `Família Bengui · agenda, tarefas e dinheiro` — Inter 13px, `rgba(255,255,255,.75)`
- Panel heading `Bem-vindo` — Roboto Medium 24px, `#FFFFFF`
- Body `Entre com a sua Conta Google para acessar a casa partilhada.` — Roboto Regular 15px/1.5, `rgba(255,255,255,.8)`
- **Primary button** `Continuar com Google` — white pill, height 56px, `border-radius: 100px`, shadow `0 2px 6px 0 rgba(76,123,166,.20), 0 -2px 6px 0 rgba(76,123,166,.20)`. Contains the 4-colour Google "G" mark (22 × 22, official blue `#4285F4`, green `#34A853`, yellow `#FBBC05`, red `#EA4335`) then label Roboto Bold 16px `#262626`, letter-spacing 0.4px. Hover: background `#FAFAFA`.
- Consent note — Inter 12px/1.6, `rgba(255,255,255,.62)`: *"Ao continuar, a Nossa Casa recebe o seu nome e endereço de e-mail. Nenhum dado bancário é partilhado com a Google."*
- 1px divider `rgba(255,255,255,.2)`
- **Secondary button** `Entrar como Criança` — outline pill, height 48px, `1px solid rgba(255,255,255,.45)`, smile icon 20px + Roboto Medium 15px `#FFFFFF`. Hover: `rgba(255,255,255,.08)`.
- Footer note — Inter 12px/1.6, `rgba(255,255,255,.55)`: *"Ainda não faz parte desta casa? Peça o convite ao administrador da família."*

### 2. Escolher uma conta (Google account picker)

Same background and glass panel. Google mark 20px + heading `Escolher uma conta` (Roboto Medium 18px white). Two account rows, then an "add account" row, then a `Voltar` outline pill.

**Account row:** `background: rgba(255,255,255,.95); border-radius: 16px; padding: 14px 15px; min-height: 64px; gap: 14px`. Left: 40px circular avatar in the member colour with the initial (Roboto Medium 17px white). Middle: name (Roboto Regular 16px `#262626`) over e-mail (Inter 12px `#6A7282`). Right: role pill — `padding: 4px 10px; border-radius: 100px; border: 1px solid #D9D9D9; background: #FAFAFA; Inter 600 11px #6A7282` — values `Administradora` (Rita) and `Adulto` (Tomás).

Accounts: `Rita Bengui / rita.bengui@gmail.com / R / #001529 chrome avatar / Administradora`; `Tomás Bengui / tomas.bengui@gmail.com / T / Adulto`.

"Add" row: transparent, `1px solid rgba(255,255,255,.4)`, 40px circle with dashed border and a plus icon, label `Usar outra conta Google` (15px white).

### 3. Popup: Novo evento no seu calendário

**Purpose:** on opening the app, offer to import an event found in the signed-in user's Google Calendar. This is the *only* moment the Calendar is read — never in the background.

**Layout:** centred modal over `rgba(0,0,0,.5)` scrim, `padding: 24px` around it. Card: white, `border-radius: 8px`, `padding: 24px 20px`, gap 16px, full available width.

**Components:** Google mark 26px + title `Novo evento no seu calendário` (Roboto Medium 20px `#262626`); body 16px/1.5 `#434343`; a `#FAFAFA` radius-8 summary block with three label/value rows (`Evento`, `Quando`, `Origem`) — labels Inter 600 12px `#67769B`, values 15px `#434343` right-aligned, origin value Inter 13px `#6A7282`; then three stacked actions:
- `Adicionar e Partilhar` — orange pill `#F16505`, 52px, home icon + Roboto Bold 15px white
- `Adicionar Só para Mim` — outline pill `1px solid #011B58`, 48px, lock icon + Roboto Medium 15px `#011B58`
- `Ignorar` — text only, 44px, Roboto Medium 15px `#6A7282`

**Data per user:** Rita → `Reunião de condomínio`, quarta 19:00, `Sala do 1.º andar`; Tomás → `Almoço de equipa`, quarta 13:00, `Restaurante do Parque`.

Adding jumps to Agenda with the event present, marked `via Google Calendar`, carrying the chosen visibility. Dismissing or adding marks it handled for that member for the session.

### 4. Navbar (adult app)

`background: #001529` (Storm Blue), `padding: 56px 16px 14px` (the top padding clears the status bar), `display: flex; align-items: center; gap: 12px`, shadow `0 2px 6px 0 rgba(76,123,166,.20), 0 -2px 6px 0 rgba(76,123,166,.20)`.

Contents, left to right: **the active tab's 24px outline icon in white**, then title (Roboto Medium 20px white, letter-spacing 0.25px) over subtitle (Inter 12px `rgba(255,255,255,.65)`), then a 36px white circular avatar with a `2px solid rgba(255,255,255,.5)` ring showing the member initial in `#001529` (tapping it opens the profile sheet), then a 22px search icon.

Titles/subtitles per tab:
| Tab | Icon | Title | Subtitle |
|---|---|---|---|
| Dinheiro | wallet | Dinheiro | Conta conjunta · Agosto de 2026 |
| Tarefas | checkSquare | Tarefas | Semana de 17/08 · rotinas e tarefas |
| Compras | fileDone | Lista de Compras | Semana de 17/08 · partilhada com 2 adultos |
| Agenda | calendar | Agenda | 17 – 23 de agosto de 2026 |

**Início has no navbar** — it renders the dark panel instead (see *6. Início*). The subtitle for Dinheiro follows the open month.

### 5. Bottom menu (adult app)

`background: #FFFFFF`, `border-top: 1px solid #F0F2F5`, shadow `0 -2px 6px 0 rgba(76,123,166,.15)`, `padding: 6px 4px 28px` (bottom padding clears the home indicator). Five equal flex items, each `min-height: 44px`, column, gap 4px: 22px outline icon over Inter 600 10.5px label. Active = the accent colour (default `#011B58`); inactive = `#6A7282`. Labels: `Início`, `Dinheiro`, `Tarefas`, `Compras`, `Agenda`.

### 6. Início

Scroll container `padding: 16px`, column, gap 24px.

- **Dark panel** (replaces the navbar on this tab): `background: #001529; padding: 56px 16px 20px`, column gap 18. Row one: `Bom dia, {primeiro nome}` (Roboto Medium 26px/1.2 white) over the date (Inter 12px `rgba(255,255,255,.65)`), then a 44px search target and the 40px white avatar. Row two: three equal tappable figures separated by `1px rgba(255,255,255,.18)` dividers — `Disponível` / `Tarefas hoje` / `Eventos`, label Inter 600 11px `rgba(255,255,255,.6)` over value Roboto 20px white. Each figure opens its tab.
- **Precisa de Si** — only what needs a decision, ordered by urgency: tasks awaiting confirmation, outstanding settle-up, envelopes at their limit, warranties expiring, tasks still open today. Row: `1px solid var(--c-grey-3)`, `border-left: 4px solid {line}`, radius 6, `padding: 14px 16px`, 22px icon, title over meta, chevron. Colours per item 7 in *Visual language*. The whole block disappears when there is nothing.
- **Action pair** — two 44px buttons side by side: `Compras` (tonal: `var(--c-act-bg)` + `1px solid var(--c-act-brd)`, label `var(--c-act-fg)`) and `Tarefas` (`1px solid var(--c-grey-3)`, label `#6A7282`).
- **Section `Agenda de Hoje`** — heading Roboto Bold 20px `#67769B`, letter-spacing 0.1px. Rows: white card `border-radius: 16px`, shadow `elev-1`, `padding: 14px 16px`, gap 12px — time (Inter 600 13px `#6A7282`, fixed 44px width), a **4px full-height rounded bar in the responsible member's colour**, title (16px `#434343`) over who (Inter 12px `#6A7282`), then a status pill (`A Decorrer` info / `A Aguardar` neutral).
- **Section `Tarefas de Hoje`** — heading plus a `Ver todas` link (Inter 600 12px, accent). Three task rows (see Tarefas for row spec). Tapping toggles completion.
- **Section `Orçamento de Agosto`** — tappable white card radius 8: label `Disponível` (Inter 600 12px `#67769B`) over amount (Roboto 28px/1.2 `#434343`), right-aligned `de 2 400,00 € / orçamento` (Inter 12px `#6A7282`, `white-space: nowrap`); an 8px progress track `#F0F2F5` with a solid `#1890FF` fill at the spent percentage; then a pace line (Inter 12px `#6A7282`).
- **Note tile** — `background: var(--c-grey-1); border: 1px solid var(--c-grey-3); border-radius: 6px; padding: 14px 16px`, infoCircle icon 22px `#6A7282` + 15px/1.5 text. Copy switches between the outstanding settle-up amount and "As contas entre a Rita e o Tomás estão acertadas."

### 7. Dinheiro

- **Perfil Financeiro** card (radius 8, `padding: 18px 16px`): heading Roboto Bold 20px `#67769B`, then a 2-column grid (gap 16px 12px) of label/value pairs — `Orçamento` 2 400,00 €, `Gasto até 20/08` (live), `Disponível` (live, `#389E0D`), `Poupança do mês` 150,00 €. Labels Inter 600 12px `#67769B`, values Roboto 20px `#434343`. Then the 8px progress bar and pace line.
- **Envelopes** card: one tappable block per envelope — name (15px `#434343`) with `used / limit` right-aligned (Inter 13px; `#CE0002` at ≥94 % of limit), a 6px track with the envelope's colour fill, and when at ≥94 % an inline alert row: 18px warning icon `#CE0002` + Inter 12px `var(--c-error-deep)` text + a `Reforçar` action (Roboto Bold 13px, accent). After a transfer, a green line reports it (`Reforçado com 30,00 €` / `Cedeu 30,00 €`). Below all envelopes: a 1px divider and an outline pill `Mover Dinheiro entre Envelopes` (44px, refresh icon).
  Envelopes: Mercearia 412/550 `#1890FF`; Crianças & escola 318/340 `#1890FF`; Casa & contas 486/700 `#1890FF`; Sair & lazer 171/180 `#FF4D4F`.
- **Abrir {mês}** row above the envelopes: opens a sheet that distributes 3 200 € across the four envelopes in 25 € steps, shows what is left for the goals, and on confirm resets the month (spend to zero, transfers cleared, settle-up settled) and renames every month-bearing label.
- **Contas entre Nós** card: headline (`O Tomás deve à Rita 86,50 €` / `Está tudo acertado`) with subtitle, a status pill (`A Decorrer` / `Concluído`), divider, then three ledger rows — **a 10px dot in the payer's colour**, title over meta, signed amount right (green `#389E0D` / red `#CE0002`) — then the CTA `Marcar como Pago` (tonal 46px; becomes `var(--c-grey-1)` with muted label and `Contas Acertadas` once settled).
- **Equipamentos da Casa** card: fileDone icon + heading + `{n} equipamentos · {n} em garantia`, chevron; divider; 2-column summary (`Valor registado`, `Próxima manutenção`). Tapping opens the equipment screen.
- **Metas da Família** card: per goal, name + `1 920,00 € de 3 000,00 € · julho de 2027`, and a 6px `#1890FF` progress track. Goals: Férias no Algarve 64 %, Carro novo 22 %.

### 8. Tarefas

- **Member filter** — pill row, `min-height: 40px`, `padding: 10px 15px`, gap 8px. Each non-"Todos" pill carries an 8px dot in that member's colour (white when selected). Selected: `background/border #001529`, label white Inter 600 13px. Unselected: transparent, `1px solid #D9D9D9`, `#434343`. Options: `Todos`, `Rita`, `Tomás`, `Léo`, `Mia`.
- **Semanada das Crianças** card *(saiu das Tarefas em 10/09/2026: vive no Dinheiro como «Cofres das Crianças», uma linha plana por criança — avatar, nome, pontos por pagar, saldo à direita — e a linha abre o cofre)*: heading + `1 pt = 0,10 €`; a 2-column grid of tappable child cards (`#FAFAFA`, `1px solid #D9D9D9`, radius 16, padding 14): colour dot + name, points (`{n} pt` Roboto 20px) and `{€} por pagar`, divider, then `No cofre` with the vault balance in `#389E0D`. Tapping opens that child's vault sheet.
- **Task rows** — `border-radius: 16px; padding: 14px 15px; min-height: 44px; gap: 12px`. Contents: 26px status icon (checkCircle `#52C41A` when done, else infoCircle `#6A7282`), a **4px bar in the assignee's colour**, title (16px `#434343`) over `{quem} · {recorrência}` (Inter 12px `#6A7282`), a lock icon when the task is private, a status pill (`Concluído` success / `A Confirmar` info / `{n} pt` neutral / `A Aguardar` neutral), and a 20px **pencil** in a 36 × 44 tap target that opens the manage sheet. Done rows: `background: rgba(220,243,209,.2); border: 2px solid #BAE7A3`. Not-done: `#FCFCFD`, `1px solid #D9D9D9`. Tapping the row toggles completion; tapping the pencil must **not** toggle it (stop propagation). The **last row of the list is the creation action**: `1px dashed #A9B4C6`, radius 6, 44px, plus icon + `Acrescentar tarefa` (Inter 600 13.5px, accent).

**Two-step completion for children.** A child tapping a task sets it *A Confirmar* (clock icon, `#1890FF`, info-tinted row); an adult tapping that row confirms it and only then do the points count. An adult tapping an open task completes it directly. In the child app the meta line reads *"Feito — a aguardar confirmação"*.

**Rotation.** *Gerir Tarefa* carries an *Alternar entre as crianças* toggle: when on, the assignee alternates weekly between Léo and Mia and the hint names who has the current week.

Seed tasks (id, title, assignee, recurrence, points, today?, done?):
`lixo` Pôr o lixo na rua · Léo · Rotina de quinta · 20:30 · 3 pt · today;
`mesa` Levantar a mesa do jantar · Mia · Rotina diária · 2 pt · today · done;
`mochila` Arrumar a mochila da escola · Léo · Dias de semana · 21:00 · 2 pt · today;
`roupa` Máquina de roupa + estender · Tomás · Quinta e sábado · 0 pt · today;
`plantas` Regar as plantas da varanda · Mia · Quarta e domingo · 2 pt;
`meds` Vitamina D das crianças · Rita · Rotina diária · manhã · 0 pt · done.

Baseline points before task completions: Léo 14, Mia 11.

### 9. Compras — Lista

- **Summary card:** 2-column grid — `Artigos na lista`, `Por comprar`, `Estimativa`, `Envelope Mercearia` (the last in `#389E0D`). Divider. Then the shopper row: 36px `#FAFAFA` avatar ringed `2px solid #D9D9D9` with `T`, `Compras de sábado · Tomás` over `23/08/2026 · 10:30 · Continente de Belém`, and an `Alterar` action.
- **Per-section groups** (`Frutas & Legumes`, `Frescos`, `Mercearia`, `Casa`): heading + `{n} artigos`, then rows `padding: 13px 15px`: 26px state icon, label over meta, price right (`~ {est}` grey, or the real price in `#389E0D` 600 once bought), and a 20px pencil (34 × 44 target) opening the item manage sheet. Bought rows take the green filled treatment; out-of-stock rows show closeCircle and `Sem stock · adiado para a próxima lista` with the label in `#6A7282`.
- **Creation row** after the last section: `1px dashed #A9B4C6`, radius 6, 44px, `Acrescentar artigo à lista`.
- **Artigos Habituais** card: heading with count, explanatory line ("… entram na lista sozinhos, todas as segundas-feiras."), and a `Gerir Habituais` outline 44px.
- **Footer bar** (white, top divider, `padding: 12px 16px 10px`): a single tonal 44px `Iniciar Compras` — the creation action moved into the list.

Seed items — 13 rows across the four sections with `est`, `real`, provenance and a `staple` flag; full list in the prototype's `ITEMS` array. Total estimate 37,00 €.

### 10. Compras — Modo Compras (full screen)

**Purpose:** aisle-by-aisle confirmation while pushing a trolley. One hand, large targets.

- **Navbar:** back arrow (left) · `Modo Compras` / `Tomás · Continente de Belém · 10:42` · close X (right). Both exits leave shopping mode.
- **Stepper:** white strip, `padding: 14px 12px`, four equal tappable columns, each a 4px rounded bar over an Inter 11px centred label. Bar/label colours: active = accent; a section with nothing left open `#52C41A` / `#389E0D`; otherwise `#D9D9D9` / `#6A7282`. Labels `Frutas`, `Frescos`, `Mercearia`, `Casa`.
- **Cart card:** `Total no carrinho` label over the live total (Roboto 28px), right-aligned `estimativa … / envelope …`; an 8px track whose fill is `#1890FF` while within the envelope and `var(--c-error-deep)` once over — there is no intermediate amber step; then `{n} de {n} artigos confirmados · {n} por confirmar · {n} sem stock`.
- **Item rows:** `min-height: 64px; padding: 16px; gap: 14px` — 32px state icon, label (17px) over meta, and on the right either the two-line action stack (`Confirmar` Roboto Bold 14px accent above `Sem stock` Inter 600 11.5px `#6A7282`) or, once confirmed, the real price in `#389E0D`. Tapping the row confirms (and un-confirms); `Sem stock` must stop propagation.
- **Over-budget banner** when the cart exceeds the envelope's remaining amount, naming the excess.
- **Footer:** a note line, then the primary button 52px — `Secção Seguinte` on `var(--c-grey-1)` while items remain, `Fechar Conta e Registar Despesa` on `var(--c-act-bg)` when everything is handled or on the last section — then a text `Voltar à Lista` (44px, back arrow + Roboto Medium 14px `#6A7282`).

### 11. Compras — Compras Concluídas (receipt)

Navbar `Compras Concluídas` / `23/08/2026 · 11:18 · Continente de Belém`. A green success block (`rgba(220,243,209,.2)`, `2px solid #BAE7A3`, success-tinted shadow) with a 48px checkCircle, `Despesa registada com sucesso.` and the total at Roboto 32px. Then a **Detalhe da Despesa** card with label/value rows (`Envelope` Mercearia, `Pago por` Tomás, `Dividido a meias com` Rita · half the total, `Envelope após a despesa`), and a **Resumo da Lista** card (bought count and value; deferred count). Footer CTA `Ver Impacto no Orçamento` → Dinheiro, with the real total written into the envelope and the month's spend.

### 12. Agenda

- **Calendar card** with a header: the month name (or `Calendário` when expanded) and a **Ver mês / Ver semana** toggle.
  - *Collapsed* — the week strip: seven tappable columns (`padding: 8px 0`, radius 4) with weekday, day number and event count. The week is computed (17–23 August 2026).
  - *Expanded* — a month grid: a navigation row (`‹‹` year, `‹` month, month + year, `›` month, `››` year, each a 40px target), the seven weekday initials, then rows of 46px cells. The grid is computed from the real calendar — day count and starting weekday are correct for any month, and empty trailing weeks are dropped. Each cell shows the day number and up to three 5px dots in the owners' colours. Outside the current month the grid shows no events and a **Voltar a hoje** action appears; in the current month the footer reads *Mês atual*.
  - **Day states:** *selected* = `background: #001529` with white number (this is the primary state — tapping any day selects it, in both the strip and the grid); *today, not selected* = `var(--c-act-bg)` fill with `var(--c-act-fg)` number; *has events* = `var(--c-grey-1)`; otherwise transparent.
- **Selected-day panel** (below the calendar, only when a day is selected): the full date, a `Limpar` action, that day's **events** (tap the pencil to edit) and that day's **tasks** (the routines whose recurrence covers that weekday, with their current state), then `Agendar Neste Dia`.
- **Member legend:** a wrapping row of 10px dots + names (Inter 600 12px `#6A7282`).
- **Day groups:** every day that has events plus today, in date order, headed `Hoje · Quinta, 20/08` / `Amanhã · Sexta, 21/08` / `Domingo, 23/08`. Event rows: time, a 24px member avatar with the initial, title over who, a **visibility pill** (`Família` info / `Só eu` neutral) and a pencil that opens *Gerir Evento* (change time, flip visibility, remove).
- **Creation row** at the end: `1px dashed #A9B4C6`, radius 6, 44px, `Agendar um evento`.

**Visibility rule:** a private event is only ever listed for its owner. Enforce this server-side (see *Backend & Sync*).

### 13. Sheet: Agendar Evento

Bottom sheet: white, `border-radius: 8px 8px 0 0`, `padding: 20px 16px 0`, `max-height: 700px`, `box-sizing: border-box`. Structure is **fixed header / scrolling middle (`flex: 1; min-height: 0; overflow: auto`) / pinned footer (`padding: 14px 0 30px`)** — the sheet must never exceed the screen or cover the status bar.

Fields, in order:

1. **O que quer agendar** — a real text input (height 48, radius 8, `1px solid var(--c-grey-3)`, 15px). Below it, the three former presets survive as **suggestion chips** (radius 4, `padding: 7px 11px`, min-height 34) that fill the field; the active one takes the tonal treatment. Saving with an empty field stores *Compromisso*, never blank.
2. **Dia e hora** — a single 48px row: calendar icon, the full date (`Quinta, 20/08/2026`) over `às 19:00` (Inter 12px muted), and an `Alterar` action in the accent. Tapping anywhere on the row opens the popup in *13b*.
3. **Responsável** — a 2-column pill grid with member dots.
4. Then the **share block** — `#FAFAFA` card, `1px solid #D9D9D9`, radius 8, padding 16: a 24px icon (home when shared, lock when private), `Partilhar com a família` (16px) over a hint (Inter 12px/1.5), and a **toggle** on the right: 52 × 30 pill track (`#001529` on, `#D9D9D9` off), `padding: 3px`, with a 24px white knob (shadow `elev-1`) justified to the end when on. Footer CTA `Guardar Evento`.

Hints: on → *"Fica visível para os 4 membros da casa e entra na Agenda de todos."*; off → *"Fica apenas no calendário da Rita. Ninguém mais o vê."*

### 13b. Popup: Dia e hora

One popup owns both halves of "when", so day and time are never split across two controls. Centred modal (z above the sheet), scrim `rgba(0,0,0,.5)`, card `1px solid var(--c-grey-3)`, radius 6, `padding: 18px 16px`, column gap 14.

- **Header** — `Dia e hora` + close.
- **Navigation row** — `‹‹` year, `‹` month, `{Month} de {Year}`, `›` month, `››` year; each control a 38px target, radius 4.
- **Month grid** — the seven weekday initials, then rows of 42px cells computed from the real calendar (day count, starting weekday, trailing empty weeks dropped). Selected day = `var(--c-storm-blue)` with white number; today (unselected) = `var(--c-act-bg)` fill + `var(--c-act-brd)` border with `var(--c-act-fg)` number; otherwise transparent. **Tapping a day does not close the popup** — the time is chosen in the same view.
- **Hint** — *"Toque no dia. Toque na hora para a ajustar."*
- **Hora row** — the label on the left and the time as a **tappable chip** on the right (radius 4, `padding: 6px 10px`, min-height 32; tonal when open). Tapping toggles the roller.
- **Roller** (revealed only by that tap, right-aligned under the chip) — **60 × 45px**, `var(--c-grey-1)` bed, `1px solid var(--c-grey-3)`, radius 4, two scroll-snap columns (hours 00–23, minutes in 5-minute steps) separated by a 1px `var(--c-grey-2)` rule. **No selection band**: the centred value renders at 14px/700 in `var(--c-act-fg)` at full opacity, neighbours at 10px/600 in `var(--c-text-secondary)` at **opacity .35**. Row height 15px, with a 15px spacer top and bottom so the first and last values can centre. Both drag and tap select; the scrollbars are hidden (`.nc-roller` — the one rule that cannot be inline).
  **Known trade-off, decided deliberately:** the faded neighbours compute to ≈2.4:1 contrast. They are a position cue, not text to read — the selected value carries the information. If your platform's accessibility bar forbids that, the fallback already explored is a 60 × 42 box with a hairline selection band and neighbours at `var(--c-text-muted)` (4.63:1); see option **10a** in `Nossa Casa 5 Direcoes.dc.html`.
  **Implementation note:** in a scroll-snap wheel, wheel position is DOM state, not React state. The prototype writes `scrollTop = index × rowHeight` explicitly on open and on tap (repeated at 60/200/450 ms to win against mount and snap settling), and treats a scroll event as user input for 500 ms so programmatic alignment never fights the finger. Use your platform's native picker instead if it offers one — this is the behaviour to match, not the code.
- **Footer** — `Confirmar {dd/MM} · {HH:mm}`, tonal 44px, which closes the popup. Both values are already written to the draft as they are picked; the button is a dismissal, not a commit.

### 14. Popup: confirmation of a scheduled item

Shown before saving **any** scheduled thing — event, task, or maintenance. Centred modal, z above sheets. Icon (home/lock) + title, a body paragraph, a `#FAFAFA` summary block with three rows, and the actions `Confirmar e Partilhar` / `Confirmar como Privado` (orange pill 52px) and `Voltar e Alterar` (outline pill 48px).

The summary labels change with the kind — **do not hard-code "Evento"**:
| Kind | Row 1 label | Row 2 label |
|---|---|---|
| Event | Evento | Quando |
| Task | Tarefa | Recorrência |
| Maintenance | Manutenção | Quando |

Row 3 is always `Visibilidade` → `Família — 4 membros` (`#1890FF`) or `Só eu — {nome}` (`#6A7282`).

Bodies (shared / private):
- Event: *"Este evento vai aparecer na Agenda de todos os membros da casa e qualquer adulto poderá alterá-lo. Confirma?"* / *"Este evento fica visível apenas para si. Os restantes membros não o verão na Agenda partilhada nem receberão aviso. Confirma?"*
- Task: *"Esta tarefa vai aparecer nas Tarefas de todos os membros da casa, e os pontos contam para a semanada. Confirma?"* / *"Esta tarefa fica visível apenas para si. Não aparece na lista dos restantes membros nem gera aviso. Confirma?"*
- Maintenance: *"Esta manutenção vai aparecer na Agenda de todos os membros da casa e fica registada na ficha do equipamento. Confirma?"* / *"Esta manutenção fica visível apenas para si, mas continua registada na ficha do equipamento. Confirma?"*

### 15. Sheet: Nova Tarefa

Same sheet chrome. Fields: **Tarefa** (four option rows), **Atribuir a** (2-column member pill grid with dots), **Recorrência** (`Todos os dias`, `Dias de semana`, `Uma vez`), **Pontos para a semanada** (`Sem pontos`, `2 pt`, `3 pt`, `5 pt`), and the same share block and toggle. CTA `Guardar Tarefa` → the confirmation popup.

### 16. Sheet: Gerir Tarefa (from the row pencil)

Header: task title over `{quem} · {recorrência} · {n} pt`. **Reatribuir a** member grid; **Pontos** pill row. Actions: `Guardar Alterações` (orange 52px) and `Remover Tarefa` (destructive outline: `2px solid #F16505`, 48px, trash icon, Roboto Bold 15px `#F16505`, hover `rgba(241,101,5,.06)`).

### 17. Sheet: Adicionar Artigo

Fields: **Artigo** (four option rows), **Secção** (2-column pill grid, labels ellipsised), and an **Artigo habitual** toggle block (refresh icon; hint *"Entra na lista sozinho, todas as segundas-feiras."* / *"Compra pontual — entra apenas nesta lista."*). CTA `Adicionar à Lista` — no confirmation popup: a grocery item is not a scheduled, visibility-bearing thing.

### 18. Sheet: Gerir Artigo (from the row pencil)

Header: item label over `{secção} · estimativa {€}`. A `#FAFAFA` row stating `Artigo habitual · semanal` or `Compra pontual`. Actions: `Adiar para a Próxima Lista` (outline 52px, clock icon) and `Remover da Lista` (destructive outline 52px).

### 19. Sheet: Mover Dinheiro

Fields: **Retirar de** and **Reforçar**, each a **2-column grid** of cells (radius 8, `min-height: 52px`) showing the envelope name on one line and `livre {€}` beneath — a single-line pill row does not fit at 402px and stacks into eight rows. Selecting a name for one side swaps it out of the other. Then a `#FAFAFA` amount block (`Valor a mover`, the amount at Roboto 32px, and 10/20/30/50 € pills), and a preview sentence naming both resulting limits: *"O limite de Casa & contas passa a 670,00 € e o de Sair & lazer a 210,00 €. Não sai dinheiro da conta — é só uma redistribuição do orçamento."*

Validation: if the amount exceeds the source envelope's free amount, the preview explains it and the CTA becomes grey `#D9D9D9` / `Valor Indisponível`. Otherwise `Confirmar Movimento`.

`max-height: 660px` with the scrolling middle and pinned CTA.

### 20. Sheet: Cofre da criança

Header: 44px avatar in the child's colour + `Cofre do Léo` / `Cofre da Mia` over `1 pt = 0,10 € · pago pela Rita`. A green balance block (label, balance at Roboto 36px, and either *"Mais {€} por pagar desta semana ({n} pt)."* or *"Semanada desta semana já paga."*). **Movimentos** list — icon, title over meta, signed amount. Actions: `Pagar Semanada · {€}` (orange 56px; grey + `Semanada Paga` when nothing is pending) and `Dar Bónus de 1,00 €` (outline 48px, smile icon). Paying moves the pending points' value into the vault and prepends a movement.

Seed balances: Léo 12,40 €, Mia 8,90 €. Seed movements per child: last week's allowance, a `Bónus — boletim escolar +5,00 €`, and an authorised withdrawal.

### 21. Equipamentos da Casa (full screen)

Navbar: back arrow + `Equipamentos da Casa` / `{n} equipamentos · {n} em garantia`.

Summary card: 2-column grid — `Equipamentos`, `Valor registado`, `Garantias a expirar` (`#AD8B00`), `Próxima manutenção`.

**Registados** list. Each card (`#FCFCFD`, `1px solid #D9D9D9`, radius 16, padding 16, shadow elev-1): name (16px) over `Comprado a {data} · {€}`, a warranty pill on the right, a divider, then a clock icon + `{manutenção} · {data}` or `Sem manutenção agendada`.

**Warranty state from days remaining:** `> 90` → `Em Garantia` (success pill); `0…90` → `Garantia a Expirar` (warning pill); `< 0` → `Fora de Garantia` (neutral pill).

Footer CTA `Registar Equipamento` (orange 56px, camera icon).

Seed equipment: Máquina de lavar roupa Bosch (Eletrodomésticos, 12/03/2025, Worten · Colombo, 549 €, warranty to 12/03/2027, 203 days, Limpeza do filtro 15/09/2026); Frigorífico Samsung RB34 (04/10/2023, El Corte Inglés, 899 €, to 04/10/2026, 44 days, Substituição do filtro de água 28/09/2026); Caldeira Vulcano 24 kW (Aquecimento, 18/11/2021, Instalador Aquatérmica, 1 250 €, to 18/11/2023, −1007 days, Revisão anual obrigatória 02/11/2026); Portátil Dell da Rita (Informática, 20/01/2026, Dell Online, 1 099 €, to 20/01/2028, 517 days, no maintenance).

### 22. Sheet: ficha do equipamento

`max-height: 720px`, scrolling middle, pinned footer.

- **Warranty block** tinted with the state's pill colours: `Garantia` label, the state at Roboto Medium 20px in the state colour, and a line — *"Faltam 203 dias · termina a 12/03/2027."* or *"A garantia terminou a 18/11/2023. Qualquer assistência é paga."*
- **Fotografias:** a 2-column grid of two image drop targets (radius 8, height 130px) captioned `Fatura de compra` and `Equipamento e n.º de série`. Each is per-equipment (ids `nc-fat-{id}` / `nc-eq-{id}`). In production these are camera captures / gallery picks, uploaded to file storage; the record keeps only a reference.
- **Details card:** label/value rows — `Preço de compra`, `Data de compra`, `Onde`, `Manutenção`.
- **Footer:** `Agendar Manutenção` (orange 56px, calendar icon); `Exportar Fatura` (outline 48px, printer icon) which becomes `Fatura Exportada` plus a green confirmation line — *"Fatura enviada para {email} em PDF, com o registo de compra e a garantia."*; `Remover Equipamento` (destructive outline 48px).

### 23. Sheet: Registar Equipamento

`max-height: 720px`. Fields in order: **Fotografias** (two 120px drop targets captioned `Fatura` and `Foto do equipamento`), **Que equipamento** (four option rows), **Categoria** (2-column pill grid: Eletrodomésticos, Aquecimento, Informática, Outros), **Preço pago** (99/199/549/899 € pills), **Garantia** (1 ano / 2 anos / 3 anos pills) with the hint *"A garantia fica registada até {data}. Avisamos 60 dias antes de expirar."*. CTA `Guardar Equipamento`.

### 24. Sheet: Agendar Manutenção

Header: `Agendar Manutenção` over the equipment name. **Tipo de intervenção** (`Revisão`, `Limpeza`, `Assistência técnica`), **Dia** and **Hora** columns, and the share block + toggle. CTA `Agendar` → the confirmation popup (kind: maintenance) → the event lands in the Agenda titled `{tipo} · {equipamento}`, marked `{nome} · manutenção agendada`.

### 25. Sheet: Perfil (from the navbar avatar)

`max-height: 760px`, scrolling. Header: 44px avatar, name over e-mail, close. Then:
- **Esquema de Cor** — four option rows, each showing two 22px swatches (accent + chrome), the name, a note, and a checkCircle when active. Selected row takes the green filled treatment. Note: *"O esquema altera a cor de ação e o cabeçalho apenas neste perfil. Os restantes membros da casa mantêm o esquema que escolheram."*
  Schemes: `Azul Sóbrio` (accent `#011B58`, hover `#0A2A7A`, chrome `#001529`) — **default**; `Violeta` (`#722ED1` / `#8B4EE0` / `#1E1035`); `Cião` (`#08979C` / `#13ADB3` / `#04333B`). The choice is **per member**, stored against that member, and repaints the action colour, the tonal button tokens and the chrome across the whole app. A stored index outside the list falls back to the default. No orange scheme exists.
- **Aspeto** — three cards: `Claro`, `Escuro`, `Sistema` (follows `prefers-color-scheme`), also **per member**. Dark mode replaces the neutral ramp only: page `#00101C`, surface `#0A2033`, subtle `#10293D`, border `#1E3A4F`, text `#F0F2F5 / #DCE3EA / #93A4B5`, slate `#9DB2D6`, outline text `#A9C0E8`. **`--c-white` stays pure white in both modes** — it is the foreground on dark chrome and on accent fills; surfaces use the separate `--c-surface` token. State tints drop to a veil of their own colour.
- **Avisos** — a `Resumo diário` toggle with an hour choice (08:00 / 20:00 / 21:30) and a preview of what today's single notification would say, composed from the live state. Explicit copy: no per-event or per-task notifications.
- **Dados e Armazenamento** — a `var(--c-grey-1)` block with a lock icon, where the data lives, what the user has added, and *"O Google Calendar é consultado apenas quando abre a app — nunca em segundo plano."* Then **Histórico da Casa · {n} registos** (opens the log), `Repor Dados de Demonstração` (destructive outline 48px) and `Começar de Zero (casa nova)` (outline 48px) which empties every seed so the empty states are reachable.
- `Terminar Sessão` (outline 48px, logout icon).

### 26. Histórico da Casa (full screen, from the profile sheet)

Navbar: back arrow + `Histórico da Casa` / `{n} registos · mais recente primeiro`. Rows: 22px icon in the entry's colour, title over meta, and on the right the member's first name over the stamp (`dd/mm · hh:mm`). Empty state explains what will appear.

Logged events: task done / confirmed / reopened, expense registered on closing the bill, envelope transfer, allowance paid, bonus given, settle-up, item added / deferred / removed, event or task removed, equipment registered / removed, invoice exported, month opened. Each entry stores icon, colour, title, meta, member and timestamp; the log is **persisted** and capped at 200 entries. Timestamps come from the app's own clock, not the device's.

### 27. Child app — Quem está a entrar / PIN / Tarefas / O Meu Cofre

**Picker:** same glass panel; heading `Quem está a entrar?` over *"Escolha o seu nome e introduza o PIN de 4 dígitos."*; two rows (avatar in the child's colour, name, `Perfil de criança · {€} no cofre`, chevron); `Voltar`.

**PIN:** avatar + `Olá, {nome}` / `PIN de 4 dígitos`; four 16px dot indicators (`2px solid rgba(255,255,255,.6)`, filled white as digits are entered); a 3-column keypad of 52px-high cells (`rgba(255,255,255,.16)`, `1px solid rgba(255,255,255,.35)`, radius 8, digit at Roboto Medium 20px white) laid out 1–9, `←`, 0, `OK` (the last two at `rgba(255,255,255,.08)`); a `Trocar de perfil` text action. Entering the fourth digit enters the app. **Read state functionally when appending a digit** — reading a stale value drops digits on fast taps. In production this is a real per-child PIN with attempt limiting.

**Child navbar:** `background` = that child's colour, 40px translucent avatar (`rgba(255,255,255,.22)`, ring `rgba(255,255,255,.5)`), `Olá, {nome}` over `{n} pontos por pagar · {€} no cofre`, and a logout icon.

**Child bottom menu:** two entries only, 24px icons, `min-height: 48px`, labels `Tarefas` and `O Meu Cofre`, active in the child's colour.

**Tarefas:** a 2-up summary card (`Por fazer hoje`, `Pontos da semana`, values at Roboto 26px) then that child's task rows at `min-height: 64px; padding: 16px` with 32px icons, 17px titles and a points pill. Tapping completes.

**O Meu Cofre:** the green balance block (Roboto 38px), `Movimentos`, and `Pedir para Usar o Dinheiro` (outline 52px) which becomes `Pedido a Aguardar Autorização` and reveals an info tile — *"Pedido enviado. A Rita ou o Tomás têm de autorizar antes de poder usar o dinheiro."* A child never withdraws unilaterally.

---

## Interactions & Behavior

**Cross-cutting state effects.** Completing a task updates that child's points, the allowance figure, the open-task counts on Início, and the child app. Closing the shopping bill writes the real total into the Mercearia envelope, the month's spend, and the settle-up balance. A transfer changes both envelopes' limits and the amount available in shopping mode.

**Full-screen takeovers.** Modo Compras and Equipamentos hide the navbar and bottom menu; both offer a back affordance in the navbar, and Modo Compras also offers a footer `Voltar à Lista`.

**Sheets.** Every bottom sheet: `border-radius: 8px 8px 0 0`, scrim `rgba(0,0,0,.4)` that dismisses on tap, an explicit close in the header, a capped `max-height`, a scrolling middle and a pinned CTA. Never let a sheet reach the status bar.

**Row taps with a second action.** Task and item rows toggle on tap and expose a pencil that opens a manage sheet; the pencil must stop propagation. Same for `Sem stock` inside a shopping row.

**Animation** (from the design system, conservative): modal entry 200 ms fade + 8px translate-up, ease-out; accordion 320 ms height ease; button press 120 ms `opacity .8` + `scale(.98)`; hover 120 ms background lighten. No skeletons, no springs, no parallax. Loading is a circular spinner in the accent colour.

**States to build that the prototype only implies:** loading and empty states per list, network-failure retry, form validation on real free-text inputs (the prototype uses option pills where production needs text fields, numeric amounts and date/time pickers), and permission-denied states for Calendar access.

## State Management

Persisted per household: task definitions, task completions **and pending confirmations**, task rotation flags, grocery items and their states, envelope limits and movements, expenses with payer and split rule, settle-up state, children's vault balances and movements, events (with owner and visibility), equipment and maintenance, per-member colour scheme and appearance mode, notification preferences, the open month and its envelope limits, the house history log, and which Calendar suggestions have been handled.

Transient (never persisted): active tab, open sheet, confirmation modal, drafts, filter, PIN entry, shopping step, selected equipment, selected day, calendar month/year, search text, export receipts.

The prototype keeps the persisted set in one versioned `localStorage` entry (`nossa-casa/v1`, `{ v: 1, savedAt, …data }`), writes on change with a de-dupe, tolerates unavailable storage, and ignores a saved payload whose version does not match. Keep the shape; replace the storage.

## Backend & Sync

`design/Sincronizacao entre Membros.dc.html` is the full architecture reference. The essentials:

- **The house is the unit of data; the member is the unit of access.** Everything belongs to a household; each member sees what the household allows.
- **Enforce "Só eu" server-side.** If the filter lives on the client, a private event still reaches the other member's device. The server must return only what that member may see.
- **Balances are never written fields.** Vaults, envelope movements and task completions are append-only records; the balance is the sum. This is what stops two devices from cancelling each other out.
- **Offline first, queue of changes.** Write locally and enqueue; send *"o Tomás confirmou o leite a 5,34 €"*, not the whole list. Only the grocery list and shopping mode need live updates; everything else can sync on open and periodically.
- **Three roles:** administrator (creates the household, invites, sets limits), adult (everything but member management), child (own tasks and vault only — no budget). Children have no e-mail account: they are household profiles reached by PIN on their own device.
- **Files separately.** Invoices and equipment photos go to file storage with time-limited links; the record holds the reference. Invoices must be exportable as PDF.
- **Google Calendar is read only when the app opens.** No background sync, no persistent watch. Note that Calendar scopes require Google's verification process — start it early.
- **Compliance:** the app handles minors' data and household financial data. Privacy policy, processing record, explicit parental consent for child profiles, and a decision on hosting location are prerequisites, not follow-ups.

## Security — audited on the prototype, to be built in production

A security pass was run against the prototype (static read + runtime probing). Nothing below is a defect in the *design* — it is the list of controls the prototype deliberately does not have, and that the implementation must add. Ordered by priority.

**1. Real authentication.** The prototype's sign-in is staged: tapping an account name enters that account, no credential. Production needs Google OAuth with a session token, an expiry, and re-auth on sensitive actions (settling accounts, changing envelope limits, paying allowance).

**2. Child PIN — hash, never store.** The prototype keeps PINs in plaintext (`{"Léo":"1234"}`). Production stores a salted hash (Argon2id or bcrypt), in the platform's secure store (iOS Keychain / Android Keystore), never in web storage. The PIN comparison must be constant-time.

**3. Attempt limiting on the PIN.** A 4-digit PIN with no delay falls to brute force in minutes. Required: progressive backoff, lockout after ~5 failures, and a parent-side unlock. (The prototype now verifies the PIN — it added no rate limiting.)

**4. Nothing sensitive in plain client storage.** The prototype writes one unencrypted key holding e-mails, vault balances, the budget, and every expense. Production keeps the authoritative copy server-side; the local cache must be encrypted at rest and cleared on sign-out.

**5. Data integrity.** Local state is currently editable by hand — balances, debts and limits can be rewritten in the browser console. The server is the authority; the client validates schema and version on read and never trusts a restored payload.

**6. Visibility enforced server-side.** Repeated from *Backend & Sync* because it is the one that leaks: the "Só eu" filter runs on the client today. The server must return only what the member may see.

**7. Session lifecycle.** No token, no expiry, no auto-lock. Production needs session expiry, sign-out that clears the local cache, and a short auto-lock for the child profile.

**What the audit found clean, and should stay that way:** no `innerHTML`, `eval` or `new Function` anywhere — user text is escaped by the framework and an injected `<img onerror>` rendered as literal text; storage restore walks a fixed key list, so a `__proto__` key cannot pollute; reads and writes are wrapped so private mode and quota exhaustion degrade silently; a payload with a mismatched version is ignored; and the three third-party scripts load pinned with `integrity` + `crossorigin`. Add a Content-Security-Policy in production — the prototype has none.

**Compliance is a prerequisite, not a follow-up:** minors' data plus household financial data means a privacy policy at a stable URL, a processing record, explicit parental consent for child profiles, and a decision on hosting location, all before first release.

## Security — findings from the prototype

Two failures were found by probing the running prototype, both fixed at the interaction level and both needing server enforcement in production.

**Member card.** In *Gestão da Casa › Membros e PIN*, a member row states identity and role only — the role pill is a **state indicator, not a control**. Tapping the row opens that member's card, where PIN and role are separate rows. Do not put actions in the row: an earlier version had a text action next to a bordered role pill, and the pill read as the button. The card is also where future per-member settings go (colour, spending limit, notification preferences).

**Child PIN.** The prototype originally shipped a factory PIN (`1234`, identical for both children) in plain text in local storage, with unlimited retries. Now: no factory PIN — an adult sets it in *Gestão da Casa › Membros e PIN*; the app rejects four identical digits, ascending/descending runs, and a PIN already used by a sibling; the value is never rendered in clear (the row reads *PIN definido* / *sem PIN*); five wrong attempts lock the profile for 60 seconds. **In production the PIN must be verified server-side and stored as a salted hash — never persisted on the device, hashed or not.**

**Role escalation via local storage.** Editing the `nossa-casa/v1` entry in the browser to set `roles: {"Léo": "admin"}` was accepted, granting a child access to income, envelopes and allowance. This is inherent to a client-only prototype. **In production, roles must be returned by the server on every session and never read from device storage; every mutating call must re-check the caller's role server-side.**

**Full production specification: `design/Seguranca em Producao.dc.html`.** Threat model, session and identity, the complete PIN fix, an operation-by-operation authorisation table, record-level visibility rules, money integrity (append-only movements + idempotency keys), file handling, minors'-data compliance, a never-do checklist, and the probes above written up as a regression suite to run against the API. Read it before writing the first endpoint.

**What passed.** Text injection: user-typed values (`<img src=x onerror=…>`, `<b onmouseover=…>`, `&{alert(1)};`) are rendered as text — no `innerHTML` anywhere in the data path, no nodes created, no handlers fired. Numeric validation: garbage falls back to the previous value, negatives clamp to the minimum, oversized values clamp to the maximum. Stored payload (~4 kB) contains no tokens, passwords or bearer credentials. Private records (a member's own health record) are not reachable from another member's session, and admin-only screens are hidden for non-admins — both still client-side filters, so both need the server-side rule from `Sincronizacao entre Membros`.

## Design Tokens

All values come from the +Cliente design system (`design/_ds/…/colors_and_type.css`, `kit.css`). Use those files as the source of truth.

**Action:** Midnight Blue `#011B58` (the only "do the thing" colour), hover `#0A2A7A`. **Chrome:** Storm Blue `#001529` (navbar, Início panel, dark surfaces, selected day). The design system's Strong Orange `#F16505` is **deliberately unused** in this product — the client asked for it out, and the system's rule ("one colour means act") is preserved by giving that role to Midnight Blue.

**Derived action tokens** (recomputed from the active scheme, both modes): `--c-act-bg` = accent at 10 % (light) / 20 % (dark); `--c-act-brd` = accent at 38 % / 45 %; `--c-act-fg` = the accent, or a 55 %-lightened accent in dark mode.

**Neutrals:** `#FAFAFA` Light Cream, `#F0F2F5` page background, `#D9D9D9` Medium Grey, `#FCFCFD` card surface, `#FFFFFF`, `rgba(0,0,0,.40)`.

**Text:** primary `#262626`, secondary `#434343`, muted `#6A7282`, **subtle slate `#67769B` — section and card titles are slate, not black. This is the system's most distinctive type rule.**

**State:** Informative `#1890FF` (bg `#E8F4FF`), Success `#52C41A` (border `#BAE7A3`, bg `rgba(220,243,209,.2)`, deep text `#389E0D`), Error `#FF4D4F` / deep `#CE0002`, Violet `#722ED1`, Cyan `#08979C`, neutral edge `#A9B4C6`. **Warning Yellow `#FAAD14` is not used** — see change 7.

**Member colours** (all from the state palette): Rita `#722ED1`, Tomás `#08979C`, Léo `#1890FF`, Mia `#011B58`.

**Typography:** **Roboto** for display, body and buttons; **Inter** for dense data and the smallest labels. Scale 38/32/28/24/20/18/16/14/12. Page headers 38–32 Roboto Medium. Card titles 24–32 Roboto Bold in `#67769B`. Body 18 Roboto Regular at 1.5 (16 in the mobile adaptation). Field values 24 (20 on mobile). Tiny chrome 12 Inter. Letter-spacing: h1 0.25px, label 0.1px, button 0.4px. Never ALL-CAPS.

**Spacing — the scale is closed.** Five vertical values only: **2 / 4 / 8 / 16 / 24** (plus 48 for empty-state blocks). 2 and 4 are within a single item (label over value); 8 between rows of a group and between a section heading and its content; 16 between groups; 24 between sections. Card and row padding is **14px vertical / 16px horizontal**, one value, no exceptions. Screen gutters 16. Do not introduce 10, 11, 12, 13, 18 or 20 — the prototype had seven vertical gaps and five paddings before this was closed, and the visible symptom was 70px of dead space between two sibling cards.

**Grouping beats spacing.** Related entries go in ONE bordered container separated by 1px dividers, not in separate cards separated by gaps. This is the dominant pattern (storage block, house block, member list, equipment list): it removes the stacked-gap problem entirely and is how a 70px gap became a 1px line.

**Legacy note — 4-pt grid:**  — 4/8/12/16/24/32/48/64/96. Mobile screen gutters 16; section gaps 20–24; row padding 13–16.

**Radii:** buttons **8px**; cards and list rows **6px**; chips **4px**; inputs 8px; sheets `8px 8px 0 0`; modals 6px. `border-radius: 100px` only for avatars, colour dots, toggle tracks/knobs and progress-bar fills.

**Elevation** — same recipe, used sparingly: `0 2px 6px 0 rgba(76,123,166,X), 0 -2px 6px 0 rgba(76,123,166,X)` with X = 0.15 for sheets and the bottom menu, 0.20 for the navbar and the Início panel. **Resting cards carry no shadow** — they use `1px solid var(--c-grey-3)`. No inner shadows.

**Borders:** cards and rows `1px solid var(--c-grey-3)`; outline buttons `1px solid #011B58`; destructive outline `2px solid var(--c-error-deep)`; tonal buttons `1px solid var(--c-act-brd)`; creation rows `1px dashed #A9B4C6`; complete rows `2px solid #BAE7A3`; dividers `1px solid #F0F2F5`; **focus ring `2px solid #1890FF` with 2px offset**.

**Interaction states:** hover tonal → `var(--c-info-bg)`; hover outline and dashed → `rgba(1,27,88,.03–.04)`; press → `scale(.98)` + opacity `.8`; disabled → opacity 0.4, no shadow; focus → the blue ring.

**Transparency:** the login glass panel (`rgba(0,0,0,.6)` + `backdrop-filter: blur(60px)`), the tonal action fills, and state tints on rows. No gradients, no patterns, no textures.

**Touch targets:** never below 44px; in-store shopping rows 64px.

**Formatting:** currency `1 250,00 €` — thousands separated by a narrow no-break space (U+202F), decimal comma, and a **no-break space before the € sign** (U+00A0) so the symbol never orphans onto its own line. Dates `dd/mm/yyyy`.

## Iconography

Outlined, 1.5–2px stroke, 24px native, square caps — the Ant Design outline family. `design/cliente-icon.jsx` is the exact set used, copied from the design system's kit; the names referenced throughout this document (`home`, `wallet`, `checkSquare`, `calendar`, `fileDone`, `camera`, `bank`, `idcard`, `lock`, `logout`, `user`, `eye`, `printer`, `clock`, `refresh`, `trash`, `edit`, `plus`, `close`, `check`, `checkCircle`, `infoCircle`, `closeCircle`, `warning`, `exclamation`, `smile`, `caretUp/Down/Left/Right`, `arrowLeft/Right`, `search`, `fileText`, `fileAdd`, `eyeOff`) map to it.

Sizes: 24px in body context, 22px in navbars and menus, 26–32px on status rows, 48px on hero confirmations. Icon colour follows text colour; inside a status pill it takes the deep state colour. Never re-fill stroke icons solid. **No emoji anywhere** — this is a financial app.

Use a real icon library on the target platform rather than porting these SVGs; match the family (Ant Design outline or an equivalent 24px outline set).

## Assets

- `design/assets/login-bg.jpg` — the login backdrop, from the design system's asset set. Photographic, warm, natural light. Production needs a licensed equivalent if this one is not cleared for release.
- Invoice and equipment photographs are **user-supplied at runtime**; the prototype uses drop targets as placeholders.
- The Google "G" mark is drawn inline in official brand colours; use Google's supplied asset and follow their branding guidelines in production.
- App icon, listing copy and store screenshots are produced and live in `store/` — see *Store Assets*.

## Store Assets

In `store/` — production-ready exports of the app icon and the six store screenshots.

**Icon**
| File | Use |
|---|---|
| `icone-appstore-1024.png` | App Store, 1024 × 1024, opaque (no alpha, no rounded corners — the store applies its own mask) |
| `android-background-432.png` | Android adaptive icon, background layer (full-bleed Storm Blue) |
| `android-foreground-432.png` | Android adaptive icon, foreground layer (glyph at 42 % of the canvas, transparent) |
| `preview-180/120/76/48/34.png` | Size checks — 34 px is the real legibility test |

Construction: Storm Blue `#001529` field, a white roof stroke (two lines, 1.9 units at 24-unit scale, round caps) and **four equal dots for the four members** below it, in lightened variants of their app colours — violet `#8B4EE0` (Rita), cyan `#13ADB3` (Tomás), blue `#4A8FE0` (Léo), near-white `#E8EDF5` (Mia). Mia's real colour (midnight `#011B58`) is invisible on the field, hence the lightened set. No gradient, no texture, no text. The glyph occupies ~62 % of the canvas so iOS can apply its mask without clipping.

**Why there is no accent colour from the palette:** the icon is one image on the home screen, but the colour scheme is *per member* and there are six of them. An icon tinted with one scheme's accent goes stale the moment that scheme changes — which is exactly what happened to the previous orange-accented icon. The only colours constant across all six schemes are the Storm Blue chrome and white; the member dots are the one deliberate exception, and they come from the state palette, not from any scheme.

**Verified at the smallest size:** `preview-34.png` is included precisely because that is where icons fail. Four *equal* dots survive it; an earlier draft with two large and two small dots merged at that size and was rejected.

**Screenshots** — captured from the current build (v2), 804 × 1748 (2×), phone screen only. For App Store submission recapture at 3× (1206 × 2622) or scale up in the stores' own device templates; the aspect ratio already matches a 402 × 874 logical screen.
| File | Screen | Suggested caption |
|---|---|---|
| `screenshot-1-inicio.png` | Início | O dia da família num ecrã: o que vem a seguir e quem faz o quê. |
| `screenshot-2-dinheiro.png` | Dinheiro | Envelopes com limites — e as contas entre vocês acertadas. |
| `screenshot-3-tarefas.png` | Tarefas | Rotinas com pontos que viram semanada. |
| `screenshot-4-agenda.png` | Agenda | O mês inteiro, e o dia que escolher com tudo o que tem. |
| `screenshot-5-modo-compras.png` | Modo Compras | Corredor a corredor, com o total do carrinho sempre à vista. |
| `screenshot-6-modo-crianca.png` | Modo criança | As tarefas e o cofre do seu filho, no dispositivo dele. |

These are the phone screen without bezel — ready to frame.

Listing copy (name, subtitle, short and long description, keywords, category, rating notes) lives in the design file `Materiais de Loja.dc.html` in the project root.

## Screenshots

In `screenshots/` — captures of the **current** prototype (v3), 804 × 1748 (2×), phone screen only, in flow order.

| File | Screen |
|---|---|
| `01-entrar.png` | Entrar (Google sign-in + child entry) |
| `02-popup-google-calendar.png` | Calendar import popup on opening |
| `03-inicio.png` | Início — dark panel, Precisa de Si |
| `04-dinheiro.png` | Dinheiro |
| `05-tarefas.png` | Tarefas |
| `06-agenda-mes.png` | Agenda, month expanded |
| `07-agendar-evento.png` | Sheet: Agendar Evento (text field + Dia e hora row) |
| `08-dia-e-hora.png` | Popup: Dia e hora, roller revealed |
| `09-compras-lista.png` | Compras — Lista |
| `10-modo-compras.png` | Modo Compras (full screen) |
| `11-perfil.png` | Perfil — Aspeto, Esquema de Cor, Avisos, Dados |
| `12-crianca-tarefas.png` | Child app — Tarefas |
| `13-crianca-cofre.png` | Child app — O Meu Cofre |

**One capture artifact to ignore:** in `08-dia-e-hora.png` the roller's two columns both read from 00. The static capture cannot preserve a scrolled position, so both wheels render at scrollTop 0; live, they sit on the selected value (verified in the DOM). The chip and the confirm button in the same shot show the true value.

Older capture sets (v1, and the v2 seven-shot set) were deleted rather than kept — a stale screenshot is worse than none.


## Files

In `design/`:
- **`Nossa Casa App.dc.html`** — the complete interactive prototype. Every screen, sheet, popup and flow described above. Start here.
- `Sincronizacao entre Membros.dc.html` — data model per collection (who writes, conflict rule), sync strategy, roles, phased plan.
- **`Seguranca em Producao.dc.html`** — production security specification: threat model, sessions, PIN, authorisation table, record-level visibility, money integrity, files, compliance, regression suite.
- `Referencias e Sugestoes.dc.html` — competitive review (ten apps, August 2026) and the prioritised feature rationale behind what was built.
- `Nossa Casa - Opcoes +Cliente.dc.html` — the three navigation directions explored; direction **1a** (rows + bottom menu) was chosen and is what the app implements.
- `Nossa Casa 5 Direcoes.dc.html` — the design-review document behind v2/v3, newest exploration first: **10** small-roller treatments (fade roller chosen), **9** time-field treatments, **8** action colours (Midnight chosen), **7** state-colour schemes (grey-except-risk chosen), **6** creation-action placements (last row of the list chosen), **5** button treatments in the sober skin (compact pair chosen), **4** skins (colour/type/icons), **3** structural directions. Read this to understand *why* v2 looks like it does; every rejected option carries its trade-off in writing.
- `Materiais de Loja.dc.html` — app icon construction and the PT-PT store listing copy.
- `cliente-icon.jsx`, `image-slot.js`, `ios-frame.jsx`, `support.js` — support files the prototypes load. The device frame and the drop-target component are review scaffolding, not product code.
- `_ds/cliente-design-system-…/` — the design system's tokens (`colors_and_type.css`) and kit (`kit.css`). **Treat these as the source of truth for every value.**

To run the prototype: open `design/Nossa Casa App.dc.html` in a browser. No build step, no server.
