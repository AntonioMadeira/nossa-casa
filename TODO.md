# TODO — Nossa Casa

Lista de melhorias, por prioridade. Nasceu da análise de 21/10/2026 (medições no VPS,
no bundle e nos percursos de entrada, criar casa e importar da Google).

- Todas as linhas têm um **número único** (1 a 37), por ordem de prioridade.
- **Impacto** e **Esforço**: A = alto, M = médio, B = baixo.
- Para pedir uma tarefa, diga o número: «faz o 4», «faz o 9 e o 17», «faz o grupo A (1–7)».
- `TAREFAS.md` é a checklist da especificação original (desatualizada); esta lista é a que manda.

---

## A. Fazer já — segurança e operação (1–7)

- [ ] **1 · Cópias de segurança fora do VPS** — Impacto A · Esforço B.
      As 16 cópias do PocketBase estão no mesmo disco: se o VPS morrer perde-se tudo.
      Ligar o envio para S3 (Backblaze, escalão gratuito) nas definições do PocketBase,
      e **testar um restauro** uma vez.
- [ ] **2 · Swap de 1 GB no VPS** — Impacto A · Esforço B.
      Há 856 MB de RAM, 248 MB livres e nenhum swap: um pico pode matar o PocketBase.
- [ ] **3 · Alerta de «site em baixo»** — Impacto A · Esforço B.
      UptimeRobot ou Healthchecks a `https://casa.anossacasa.app/api/health`, aviso por e-mail.
- [ ] **4 · Bloqueio por conta no PIN das crianças** — Impacto A · Esforço M.
      O limite de 5 tentativas é só do ecrã (qualquer cliente o contorna) e o servidor limita
      por IP, não por conta. Contador no servidor (hook de login): `falhas` e `bloqueado_ate`
      em `membros`, com prova em `db/pocketbase/`.
- [ ] **5 · `Content-Security-Policy`** — Impacto M · Esforço B.
      No Nginx, primeiro em modo de relatório (`Content-Security-Policy-Report-Only`) para
      não partir a entrada pela Google.
- [ ] **6 · Limpar o VPS** — Impacto B · Esforço B.
      Guardar só as 3 pastas `/var/www/anossacasa.antes-*` mais recentes (hoje 16, 189 MB) e
      desativar o login do `root` por SSH (usar só `deploy`).
- [ ] **7 · Revogar o token da Cloudflare** — Impacto M · Esforço B. **Só o dono o pode fazer**:
      https://dash.cloudflare.com/profile/api-tokens (o token só tem permissão de DNS).

## B. Robustez — o que causou os problemas de 21/10 (8–13)

- [ ] **8 · Tirar o modo de demonstração do build de produção** — Impacto A · Esforço M.
      A família Bengui e `EVENTOS_DE_DEMONSTRACAO` vão no site real e foram a raiz de vários
      erros. Fazer um build `demo` à parte; reduz também o bundle.
- [ ] **9 · `id_google` no servidor** — Impacto A · Esforço M.
      Campo novo em `eventos` (migração + `criar-colecoes.mjs` + `acrescentar-campos.mjs`).
      Hoje a ligação ao evento da Google vive em cada aparelho, e foi isso que duplicou o
      evento. Com isto a deduplicação deixa de depender de dia, hora e título, e editar ou
      apagar funciona em todos os aparelhos.
- [ ] **10 · Relatório de erros** — Impacto M · Esforço M.
      GlitchTip ou Sentry self-hosted. Hoje as falhas são silenciosas.
- [ ] **11 · Diagnóstico no Perfil** — Impacto M · Esforço B.
      Versão da app, servidor a que está ligada, sessão válida, último erro de leitura
      (`erroDeLeitura` já existe na loja).
- [ ] **12 · Publicação automática** — Impacto M · Esforço M.
      GitHub Actions: testes, `npm run build:vps`, envio para o VPS, cópia e troca atómica.
      Corrigir ou remover o workflow do Pages, que publica com o `baseUrl` errado para o domínio.
- [ ] **13 · Testes de ponta a ponta** — Impacto M · Esforço M.
      Playwright para entrar, criar casa, importar da Google. Muitos dos 145 testes atuais são
      guardas sobre o texto do código; faltam testes de comportamento.

## C. Performance (14–16)

- [ ] **14 · Sincronização incremental** — Impacto A · Esforço A.
      Cada entrada faz cerca de 30 leituras de até 500 linhas. Ler só o que mudou (campo
      `updated`) e usar o tempo real do PocketBase (SSE) para Agenda e Compras.
- [ ] **15 · Aligeirar o bundle** — Impacto M · Esforço M.
      JS: 1,38 MB (375 KB comprimido). Carregar só os 2 pesos usados da fonte Inter (hoje 18
      ficheiros, 9 MB de assets), dividir por ecrã (Saúde, Equipamentos, Documentação).
- [ ] **16 · Dividir o `store.jsx`** (6311 linhas) por domínios — Impacto M · Esforço A.
      Agenda, dinheiro, saúde, tarefas. A prazo, tipos (TypeScript ou JSDoc): vários erros
      foram formas trocadas (`d2026-…` com e sem prefixo, `id` local e `idServidor`).

## D. Design e experiência (17–21)

- [ ] **17 · «Primeiros passos»** depois de criar a casa — Impacto A · Esforço B.
      Cartão no Início: acrescentar crianças, ligar a agenda da Google, definir o orçamento.
- [ ] **18 · Convites por link ou QR**, e uma pessoa em várias casas — Impacto M · Esforço M.
- [ ] **19 · Layout para ecrã grande** — Impacto M · Esforço M.
      No PC a app é uma coluna estreita ao centro; duas colunas aproveitam o espaço.
- [ ] **20 · PWA a sério** — Impacto M · Esforço M.
      Service worker (abrir sem rede) e botão «instalar».
- [ ] **21 · Aviso «e-mail sem casa» por cima da pergunta**, no formulário de criar casa — Impacto B · Esforço B.

## E. Funcionalidades novas, da mais à menos útil (22–28)

- [ ] **22 · Lembretes** — push na PWA e resumo diário por e-mail: tarefas, eventos, garantias, contratos, receitas.
- [ ] **23 · Eventos e tarefas recorrentes** e **feed de calendário (ICS)** da casa.
- [ ] **24 · Sincronização da Google no servidor** (sem o botão «importar») — depende do 9.
- [ ] **25 · Mesada automática** das crianças e metas com progresso.
- [ ] **26 · Importar extratos (CSV)** com categorização das despesas, e gráficos mensais.
- [ ] **27 · Adicionar por frase** («dentista da Mia sexta às 10») com IA — **sem enviar dados de saúde de menores**.
- [ ] **28 · Exportar e apagar os dados da casa** (RGPD) e **página de política de privacidade**,
      ligada à caixa de responsabilidade que já existe.

---

## Feito, para memória (29–37)

- [x] **29 ·** Site no VPS com HTTPS, cabeçalhos de segurança, `fail2ban`, atualizações automáticas (15–21/10/2026).
- [x] **30 ·** Limite de logins: 20 por minuto por IP (migração `1792100001`).
- [x] **31 ·** PIN das crianças com 6 dígitos (os de 4 antigos continuam a entrar).
- [x] **32 ·** «Criar a minha casa»: formulário em 4 passos, casa e administrador criados no servidor, bilhete de uso único para quem entra pela Google sem casa.
- [x] **33 ·** Caixa de responsabilidade pelos dados, registada na casa (versão, data, e-mail).
- [x] **34 ·** O importador da Google não oferece nem cria o que a casa já tem.
- [x] **35 ·** Com servidor, a app nunca fica em silêncio no modo local («Não foi possível ler a casa»).
- [x] **36 ·** `npm run build:vps` e `scripts/oidc-falso.mjs` (entrada sem credenciais da Google, só em desenvolvimento).
- [x] **37 ·** Serviços antigos do PC (`Cloudflared`, `NossaCasaPocketBase`) parados e desativados.

## Regras de casa

- Os serviços antigos do PC têm de ficar **desativados**: dividem o túnel com o VPS e servem a base antiga.
- Nunca correr `npm run db:provar` nem «Começar de Zero» contra a casa real.
- `./publish` = commit só dos ficheiros do Claude, push e deploy completo no VPS.
