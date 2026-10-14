// Onde é que a saúde pode ir.
//
// ── A DECISÃO EM VIGOR (30/09/2026) ─────────────────────────────────────────
//
// **A saúde sobe para o servidor da casa, seja ele onde for** — incluindo uma
// máquina alugada. Decisão do dono da casa, tomada com o custo à frente e
// depois de eu o ter levantado duas vezes.
//
// O que ele disse, e fica escrito porque é a razão e não um detalhe: «o RGPD é
// preocupação minha». É a casa dele, os filhos dele e a responsabilidade dele.
//
// ── O que isto substituiu, e porque é que a substituição foi precisa ────────
//
// De 03/09 a 29/09/2026 a regra foi outra: a saúde subia **só para um servidor
// que vivesse dentro de casa**, e isso decidia-se olhando para o ENDEREÇO —
// `127.0.0.1` era casa, um nome na internet não era.
//
// Essa regra fez o seu trabalho. Foi ela que obrigou a voltar a esta conversa
// no dia em que o servidor mudou de sítio, que é exactamente o que o comentário
// dela prometia. E foi a medir o que ela faria no servidor alugado que se viu o
// preço: as histórias de aceitação da medicação e da ficha de emergência
// falhavam, porque o outro adulto deixava de ver a receita e a alergia.
//
// ⚠ Mantê-la teria sido pior do que mudá-la em silêncio: a app deixaria de
// sincronizar a saúde no dia da mudança, sem ninguém pedir isso, e o código
// continuaria a prometer uma coisa enquanto a casa vivia outra.
//
// ── Porque é que é uma CONSTANTE e não o endereço ───────────────────────────
//
// Porque a pergunta deixou de ser técnica. «Este servidor está em casa?» era
// uma medição; «esta casa guarda saúde no servidor?» é uma escolha — e uma
// escolha escreve-se, não se infere.
//
// Escrita aqui, num sítio só, ela é lida pelos SEIS caminhos por onde a saúde
// pode sair deste dispositivo (ver
// `__tests__/o-travao-da-saude-em-todo-o-lado.test.js`). Inverter a decisão é
// mudar esta linha: os seis obedecem, e nenhum fica para trás.
//
// E é uma constante do CÓDIGO, não uma variável de ambiente. Uma variável de
// ambiente é configuração por máquina, e foi assim que a regra antiga se tornou
// mentira sem ninguém reparar — o endereço mudou, e ninguém voltou ao texto.
// Uma constante aparece no `diff`, com data e razão.
export const A_SAUDE_SOBE = true;

// A frase que se mostra quando não sobe. Fica, porque a decisão pode voltar
// atrás numa linha — e nesse dia a app tem de saber explicar-se.
export const PORQUE_NAO_SOBE =
  'A saúde não sai deste dispositivo para um servidor fora de casa: cinco '
  + 'pontos de conformidade por resolver (db/postgres/README.md). São dados '
  + 'clínicos de menores.';

// ── O que conta como «de casa» ──────────────────────────────────────────────
//
// ⚠ Isto JÁ NÃO DECIDE se a saúde sobe — a constante acima é que decide, desde
// 30/09/2026. Continua aqui por duas razões, e nenhuma é sentimental:
//
//  1. É a implementação da decisão anterior, provada por seis provas em
//     `db/pocketbase/provar-saude-sobe.mjs`. Se a decisão voltar atrás, volta
//     inteira e medida, em vez de ser reescrita de memória.
//  2. Diz, em código, o que «dentro de casa» quer dizer nesta casa — que é a
//     pergunta que se voltará a fazer no dia em que alguém reabrir o assunto.
//
// O próprio dispositivo, a rede local, ou um nome mDNS que só existe nela. Um
// nome que não acabe em `.local` é a internet, e a dúvida resolve-se sempre
// para o lado de NÃO.
//
// ⚠ E é uma correção, não uma preferência. A primeira versão usava
// `new URL(url).hostname`, e o React Native não tem um `URL` completo — no
// ambiente dos testes desta app não tem nenhum: `new URL('http://127.0.0.1')`
// atira «TextEncoder is not defined». Com o `try/catch` a devolver falso pelo
// lado seguro, o efeito era a saúde NUNCA subir no telemóvel, que é onde a
// família a usa — e o lado seguro escondia o defeito em vez de o mostrar.
//
// Exige esquema de propósito: um endereço sem `http://` não se sabe ler, e o
// que não se sabe ler não é casa. O `[^@/]*@` deixa passar utilizador e senha
// no endereço sem os confundir com o anfitrião; os rectos apanham IPv6.
const hostDe = (url) => {
  const m = String(url).match(/^[a-z][a-z0-9+.\-]*:\/\/(?:[^@/]*@)?(\[[^\]]+\]|[^/?#:]+)/i);
  return m ? m[1].toLowerCase() : null;
};

export const eEnderecoDeCasa = (url) => {
  if (!url) return false;
  let host = hostDe(url);
  if (!host) return false;
  host = host.replace(/^\[/, '').replace(/\]$/, '');        // IPv6 entre rectos

  if (host === 'localhost' || host.endsWith('.localhost')) return true;
  if (host === '::1') return true;
  if (host.endsWith('.local')) return true;                 // mDNS da rede de casa
  // A VPS privada da casa (decisão do dono, 14/10/2026): sem contrato de
  // subcontratação e sem mais ninguém com acesso, é «de casa» por decisão sua.
  if (host === 'casa.anossacasa.app') return true;

  // ⚠ Por partes, e não por prefixo de texto: `192.168.1.5.exemplo.com` começa
  // por «192.168.» e é um nome na internet.
  const partes = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!partes) return false;
  if (partes.slice(1).some(n => Number(n) > 255)) return false;
  const [a, b] = [Number(partes[1]), Number(partes[2])];
  if (a === 127) return true;                               // 127.0.0.0/8
  if (a === 10) return true;                                // 10/8
  if (a === 172 && b >= 16 && b <= 31) return true;          // 172.16/12
  if (a === 192 && b === 168) return true;                   // 192.168/16
  if (a === 169 && b === 254) return true;                   // ligação local
  return false;
};
