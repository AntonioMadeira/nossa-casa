// Um «fornecedor de entrada» falso, para desenvolver e mostrar a entrada e o
// «Criar a minha casa» SEM credenciais da Google.
//
//   node scripts/oidc-falso.mjs --configurar     liga-o ao PocketBase e fica a servir
//   node scripts/oidc-falso.mjs                  só serve (já estava ligado)
//
// Depois compile/corra a app com:
//   EXPO_PUBLIC_PB_URL=http://127.0.0.1:8095 EXPO_PUBLIC_OAUTH_PROVIDER=oidc
//
// O botão «Continuar com Google» passa a abrir uma página de teste onde se
// escreve um e-mail e um nome, e volta à app como se a Google o tivesse
// confirmado. É para DESENVOLVIMENTO: quem escreve o e-mail é a pessoa que
// testa, por isso nunca se liga a um servidor com dados reais.
//
// ⚠ O `--configurar` altera a configuração OAuth da coleção `membros` do
// servidor em `PB_URL` e substitui o que lá estiver. Recusa servidores que não
// sejam locais (127.0.0.1 / localhost).
import http from 'node:http';
import PocketBase from 'pocketbase';
import { SUPERUTILIZADOR, SUPER_PALAVRA, URL_DO_SERVIDOR } from '../db/pocketbase/ambiente.mjs';

const PORTA = Number(process.env.OIDC_FALSO_PORTA || 18090);
const BASE = `http://127.0.0.1:${PORTA}`;
const codigo = (email, nome) => Buffer.from(JSON.stringify({ email, nome })).toString('base64url');
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

if (process.argv.includes('--configurar')) {
  if (!/^https?:\/\/(127\.0\.0\.1|localhost)[:/]/.test(URL_DO_SERVIDOR)) {
    throw new Error(`Recusado: ${URL_DO_SERVIDOR} não é um servidor local. Isto é só para desenvolvimento.`);
  }
  const pb = new PocketBase(URL_DO_SERVIDOR);
  pb.autoCancellation(false);
  await pb.collection('_superusers').authWithPassword(SUPERUTILIZADOR, SUPER_PALAVRA);
  await pb.collections.update('membros', {
    oauth2: {
      enabled: true,
      mappedFields: { name: '', username: '', avatarURL: '', id: '' },
      providers: [{
        name: 'oidc', displayName: 'Fornecedor falso', clientId: 'dev', clientSecret: 'dev', pkce: true,
        authURL: `${BASE}/auth`, tokenURL: `${BASE}/token`, userInfoURL: `${BASE}/userinfo`,
      }],
    },
  });
  console.log(`Ligado a ${URL_DO_SERVIDOR} como fornecedor «oidc».`);
}

http.createServer((q, r) => {
  const u = new URL(q.url, BASE);
  const corpo = [];
  q.on('data', (c) => corpo.push(c));
  q.on('end', () => {
    if (u.pathname === '/auth') {
      const retorno = u.searchParams.get('redirect_uri') || '';
      const estado = u.searchParams.get('state') || '';
      r.setHeader('content-type', 'text/html; charset=utf-8');
      return r.end(`<!doctype html><html lang="pt"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Entrar (fornecedor de teste)</title>
<body style="font-family:system-ui,sans-serif;max-width:380px;margin:40px auto;padding:0 20px;color:#1f2937">
<h2>Entrar com uma conta de teste</h2>
<p style="color:#6b7280;font-size:14px">Isto faz de conta que é a Google. Escreva o e-mail com que quer entrar.</p>
<form method="get" action="/confirmar">
<input type="hidden" name="retorno" value="${esc(retorno)}"><input type="hidden" name="estado" value="${esc(estado)}">
<label>E-mail<br><input name="email" type="email" required value="ana.nova@example.com" style="width:100%;padding:12px;font-size:16px;margin:6px 0 14px"></label>
<label>Nome na conta<br><input name="nome" value="Ana Nova" style="width:100%;padding:12px;font-size:16px;margin:6px 0 18px"></label>
<button style="width:100%;padding:14px;font-size:16px;background:#1a73e8;color:#fff;border:0;border-radius:8px">Continuar</button>
</form></body></html>`);
    }
    if (u.pathname === '/confirmar') {
      const alvo = new URL(u.searchParams.get('retorno'));
      alvo.searchParams.set('code', codigo(u.searchParams.get('email'), u.searchParams.get('nome')));
      alvo.searchParams.set('state', u.searchParams.get('estado'));
      r.statusCode = 302; r.setHeader('location', alvo.toString()); return r.end();
    }
    r.setHeader('content-type', 'application/json');
    if (u.pathname === '/token') {
      const p = new URLSearchParams(Buffer.concat(corpo).toString());
      return r.end(JSON.stringify({ access_token: p.get('code'), token_type: 'Bearer', expires_in: 3600 }));
    }
    if (u.pathname === '/userinfo') {
      const t = (q.headers.authorization || '').replace('Bearer ', '');
      try {
        const { email, nome } = JSON.parse(Buffer.from(t, 'base64url').toString());
        return r.end(JSON.stringify({ sub: `u-${email}`, email, email_verified: true, name: nome }));
      } catch { r.statusCode = 401; return r.end('{}'); }
    }
    r.statusCode = 404; r.end('{}');
  });
}).listen(PORTA, '127.0.0.1', () => console.log(`Fornecedor de teste em ${BASE}`));
