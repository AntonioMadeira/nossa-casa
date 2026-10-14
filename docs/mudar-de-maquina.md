# Mudar a casa para uma máquina alugada

> ✅ **Feito a 14/10/2026.** A casa vive em `root@136.144.202.8` (Ubuntu 22.04),
> em `/opt/nossa-casa`, com os serviços `nossa-casa` e `cloudflared` no
> `systemd`. A firewall deixa o SSH (22) e, desde 14/10/2026, o 80 e o 443: o
> Nginx serve a app web em `anossacasa.app` diretamente, sem túnel, e com as
> portas fechadas o site ficava inacessível. O PocketBase (8095) continua só em
> `127.0.0.1`, e a casa (`casa.anossacasa.app`) continua a chegar pelo túnel.
> O login por password está desligado. A máquina antiga ficou com os serviços
> parados e o `pb_data.antes-da-vps` como cópia de regresso.
>
> **Os scripts `db/pocketbase/*.mjs` apontam a `127.0.0.1:8095` por omissão**, e
> esse endereço já não é a casa. Contra a casa a sério, abra um túnel e corra-os
> como sempre: `ssh -L 8095:127.0.0.1:8095 root@136.144.202.8`.
> `npm run db:servir` arranca um servidor LOCAL — serve para desenvolver, já não
> é a casa. Para verificar a casa: `verificar-a-casa.ps1`.
>
> **Cópia diária:** o próprio PocketBase faz uma às 03:00 e guarda as 14 mais
> recentes, em `/opt/nossa-casa/pb_data/backups/` (Settings → Backups). Fica na
> mesma máquina: para ter uma fora dela, puxe-as com
> `scp root@136.144.202.8:/opt/nossa-casa/pb_data/backups/*.zip .`.
> A cópia pontual de 14/10/2026 está em `copias-da-vps/`, na máquina antiga.

> Escrito a 28/09/2026, antes de haver máquina. Decisão do dono da casa: uma VPS
> alugada, com a Cloudflare à frente. O fornecedor recomendado é a **Amen VPS
> XS** (1 GB, 1 vCPU, 25 GB NVMe, backups incluídos, 4 €/mês +IVA) — e a razão
> está em `docs/onde-alojar.md`.

## A ideia que torna isto pequeno

⚠ **O túnel vai com a casa, e mais nada muda lá fora.**

Seria natural pensar que mudar de máquina obriga a mexer no DNS, nos URIs
autorizados da consola da Google. **Não obriga** — desde que o `cloudflared` passe a correr na máquina nova com as
mesmas credenciais do túnel.

Um túnel da Cloudflare não é um endereço: é uma ligação de saída. O
`casa.anossacasa.app` aponta para o **túnel**, não para um IP. Quem corre o
`cloudflared` com aquele ficheiro de credenciais **é** o outro lado do túnel.
Mover o ficheiro move a casa.

O que isso poupa:

| | |
|---|---|
| DNS na Cloudflare | **não muda** |
| URIs autorizados na consola da Google | **não mudam** |
| Certificado TLS | **não há** — é da Cloudflare, como hoje |
| Portas abertas na VPS | **22, 80 e 443** (SSH e o Nginx da app web) — **nunca a 8095** |

E fica com a mesma propriedade que já provámos: o PocketBase escuta em
`127.0.0.1`, as regras do túnel tapam `/_/` e os superutilizadores, e a casa só
se alcança pelo túnel. A app web (`anossacasa.app`) é servida pelo Nginx nas
portas 80/443, abertas de propósito. Numa VPS alugada convém limitar o resto:
uma VPS leva varrimentos de portas desde o primeiro minuto.

⚠ **O que MUDA, e é o preço disto:** o túnel só pode correr num sítio de cada
vez com as mesmas credenciais. No momento em que arrancar na VPS, a casa da sua
máquina deixa de responder. Não há um período com as duas — por isso a ordem dos
passos abaixo importa.

## ⚠ O que muda no comportamento da app, e não é pequeno

Antes a app marcava `http://127.0.0.1:8095`. Na máquina nova marca
`https://casa.anossacasa.app` (`EXPO_PUBLIC_PB_URL`).

**Isto NÃO fecha o travão da saúde.** Desde 30/09/2026 quem decide é a constante
`A_SAUDE_SOBE = true` em `src/endereco.js`, e não o endereço; e desde 14/10/2026
a VPS privada conta como «de casa» no `eEnderecoDeCasa`, por decisão do dono:

```
eEnderecoDeCasa('http://127.0.0.1:8095')       -> true
eEnderecoDeCasa('https://casa.anossacasa.app') -> true
```

Resultado: o envio e o apagamento da saúde comportam-se como antes. Ficam por
confirmar na VPS, a correr: o login com Google, a app num telemóvel com o
endereço novo, e o envio e o apagamento de uma ficha de saúde.

**Antes de migrar, os 22 registos clínicos que já estão no servidor têm de ser
decididos.** Ficam, ou saem? Se ficarem, viajam para a máquina alugada dentro do
`pb_data`.

## Antes de começar

- [ ] Perguntar ao fornecedor, por escrito: **em que país fica a máquina** e se
      dão **contrato de subcontratação (artigo 28.º)**. Guardar a resposta.
- [ ] Resolver os caminhos de saúde por travar (commit `d9d439a`; falta a fila,
      o apagamento, o `registo`, o `ler.saude()` e o `/api/casa/limpar`).
- [ ] Decidir o que fazer aos 22 registos clínicos que já estão no servidor.
- [ ] Ter uma cópia do `pb_data` **fora** das duas máquinas.

## A migração, por ordem

### 1. Encolher o que se vai copiar

⚠ O `auxiliary.db` tem **132 MB** e o `data.db` tem **909 KB**. Aquilo são os
registos de pedidos do PocketBase — 244 mil linhas a 28/09/2026 —, não é a casa.
Copiar 132 MB de registos de acesso para uma máquina nova é começar torto, e num
disco de 25 GB é o que mais cresce com o tempo.

No painel, em *Settings → Logs*, reduzir a retenção (7 dias chega) e deixar o
PocketBase limpar. Só depois copiar.

### 2. Preparar a VPS

```bash
ssh root@<a-maquina>
adduser --system --group --home /opt/nossa-casa casa
```

O `scripts/instalar-no-servidor.sh` faz o resto: descarrega o PocketBase 0.40.1,
põe o serviço do `systemd`, cria as pastas e deixa tudo pronto **sem arrancar**.

### 3. Parar a casa antiga

⚠ Pela ordem: primeiro o túnel, depois o servidor. Ao contrário, fica uma
janela em que o túnel entrega pedidos a um servidor que já morreu.

```powershell
Stop-Service Cloudflared
Stop-Service NossaCasaPocketBase
```

### 4. Copiar o `pb_data` inteiro

É só isto. O PocketBase tem o SQLite embutido: não há *dump*, não há restauro,
não há versões de motor a acertar. **A pasta é a base de dados.**

```bash
scp -r "C:/Users/amadeira/Claude/Projects/Nossa Casa/pb_data" casa@<a-maquina>:/opt/nossa-casa/
```

Leva com ela: a casa, os membros, as credenciais da Google (que vivem numa
coleção, não no `.env.local`) e a pasta `storage` com as fotografias.

### 5. Levar o túnel

```bash
scp C:/Users/amadeira/.cloudflared/458b213d-*.json  casa@<a-maquina>:/opt/nossa-casa/.cloudflared/
scp C:/Users/amadeira/.cloudflared/config.yml        casa@<a-maquina>:/opt/nossa-casa/.cloudflared/
```

⚠ **O `config.yml` tem de ser revisto**, não copiado às cegas: uma regra que
aponte para uma porta sem nada atrás dá 502 a quem lá bater.

### 6. Arrancar, e medir antes de acreditar

```bash
systemctl enable --now nossa-casa
systemctl enable --now cloudflared
curl -s http://127.0.0.1:8095/api/health          # na máquina
curl -s http://127.0.0.1:20241/ready              # readyConnections > 0
```

E de fora, **de uma rede que não a da empresa** — o filtro FortiGuard bloqueia
o domínio na máquina dele:

```bash
curl -s https://casa.anossacasa.app/api/health     # 200
curl -s -o /dev/null -w "%{http_code}" https://casa.anossacasa.app/_/   # 404
```

### 7. Apontar a app

No `.env.local`:

```
EXPO_PUBLIC_PB_URL=https://casa.anossacasa.app
CASA_URL_PUBLICA=https://casa.anossacasa.app
```

⚠ E é aqui que o travão da saúde fecha. Ver a secção acima.

### 8. O que fica para trás

- Os serviços do Windows (`NossaCasaPocketBase` e `Cloudflared`)
  deixam de fazer sentido — remover com o NSSM depois de a casa nova estar
  provada, e **não antes**.
- O `pb_data` da máquina antiga **não se apaga**: é a cópia de segurança que
  resta enquanto a nova não tiver uma semana de vida.

## Como voltar atrás

Parar o `cloudflared` na VPS, arrancar o `Cloudflared` e o
`NossaCasaPocketBase` na máquina antiga, e repor o `EXPO_PUBLIC_PB_URL`. A casa
antiga está intacta — é por isso que o passo 8 diz para não apagar nada.

⚠ O que **não** volta atrás sozinho: o que tiver sido escrito na casa nova
depois da mudança. Voltar atrás é voltar ao estado do momento da cópia.
