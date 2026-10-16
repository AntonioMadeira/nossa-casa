// «Criar a minha casa»: o que se pergunta, como se valida, e o que se faz depois
// de a casa existir. Sem React — para se poder provar sem desenhar nada.
//
// A ordem é a que uma casa nova pede:
//   1. a pessoa diz como se chama a casa e como se chama ela;
//   2. entra pela Google, e o SERVIDOR cria a casa e faz dela administradora;
//   3. só então se acrescentam as crianças e os outros adultos — porque só
//      uma administradora pode acrescentar membros.
//
// O que a pessoa escreve no passo 1 atravessa a ida à Google, e por isso é só
// texto sem segredo: nomes e e-mails. Os PIN e as palavras-passe gera-se no
// passo 3, depois do login.

export const MAX_CASA = 40;
export const MAX_NOME = 30;
export const MAX_CRIANCAS = 8;
export const MAX_ADULTOS = 4;

export const emailValido = (e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(e || '').trim());

export const erroDoNomeDaCasa = (n) => {
  const v = String(n || '').trim();
  if (!v) return 'Diga como se chama a casa.';
  if (v.length > MAX_CASA) return `O nome da casa não pode passar de ${MAX_CASA} caracteres.`;
  return null;
};

export const erroDoNome = (n) => {
  const v = String(n || '').trim();
  if (!v) return 'Diga o seu nome.';
  if (v.length > MAX_NOME) return `O nome não pode passar de ${MAX_NOME} caracteres.`;
  return null;
};

// Valida o rascunho inteiro. Devolve a primeira razão, ou null.
export const erroDoRascunho = ({ nomeCasa, nome, criancas = [], adultos = [] } = {}) => {
  const e = erroDoNomeDaCasa(nomeCasa) || erroDoNome(nome);
  if (e) return e;
  if (criancas.length > MAX_CRIANCAS) return `No máximo ${MAX_CRIANCAS} crianças de cada vez; as outras acrescentam-se depois.`;
  if (adultos.length > MAX_ADULTOS) return `No máximo ${MAX_ADULTOS} adultos de cada vez; os outros acrescentam-se depois.`;
  const vistos = new Set([String(nome).trim().toLowerCase()]);
  for (const c of criancas) {
    const err = erroDoNome(c);
    if (err) return 'Uma das crianças precisa de um nome.';
    const k = String(c).trim().toLowerCase();
    if (vistos.has(k)) return `Já há alguém chamado ${String(c).trim()} nesta casa.`;
    vistos.add(k);
  }
  for (const a of adultos) {
    if (erroDoNome(a.nome)) return 'Um dos adultos precisa de um nome.';
    if (!emailValido(a.email)) return `O adulto ${String(a.nome).trim()} precisa de um e-mail válido: entra com a conta Google desse e-mail.`;
    const k = String(a.nome).trim().toLowerCase();
    if (vistos.has(k)) return `Já há alguém chamado ${String(a.nome).trim()} nesta casa.`;
    vistos.add(k);
  }
  return null;
};

// O que se guarda enquanto a pessoa vai à Google e volta: aparado, sem vazios,
// sem nada que não seja texto.
export const limparRascunho = ({ nomeCasa, nome, criancas = [], adultos = [] } = {}) => ({
  nomeCasa: String(nomeCasa || '').trim(),
  nome: String(nome || '').trim(),
  criancas: criancas.map((c) => String(c || '').trim()).filter(Boolean),
  adultos: adultos
    .map((a) => ({ nome: String((a && a.nome) || '').trim(), email: String((a && a.email) || '').trim() }))
    .filter((a) => a.nome || a.email),
});

// Números ao acaso a sério quando o aparelho os dá; o `Math.random` só para
// quando não há (as provas). Um PIN de criança não é um segredo de estado, mas
// também não tem de ser previsível.
const aoAcaso = (n) => {
  const c = typeof globalThis !== 'undefined' ? globalThis.crypto : null;
  if (c && typeof c.getRandomValues === 'function') {
    const b = new globalThis.Uint32Array(1);
    c.getRandomValues(b);
    return b[0] % n;
  }
  return Math.floor(Math.random() * n);
};

const SEQ = '0123456789';
// Seis dígitos que o servidor aceita: nada de iguais nem de sequências (as
// mesmas regras do `pin.pb.js`). Entrada `sorteio` só para as provas.
export const pinAleatorio = (sorteio = aoAcaso) => {
  for (let i = 0; i < 200; i += 1) {
    let pin = '';
    for (let d = 0; d < 6; d += 1) pin += String(sorteio(10));
    if (/^(\d)\1{5}$/.test(pin)) continue;
    if (SEQ.includes(pin) || SEQ.split('').reverse().join('').includes(pin)) continue;
    return pin;
  }
  return '482016';
};

const ALFABETO = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
// A palavra-passe do servidor de um adulto. Ninguém a escreve: o adulto entra
// pela Google com o e-mail, e esta só existe porque a coleção a exige.
export const senhaAleatoria = (sorteio = aoAcaso) => {
  let s = '';
  for (let i = 0; i < 20; i += 1) s += ALFABETO[sorteio(ALFABETO.length)];
  return s;
};

// O que acrescentar depois do login, na ordem em que a pessoa os escreveu, e os
// PIN que se atribuíram às crianças (para lhos mostrar uma vez).
export const membrosDoRascunho = (r, sorteio = aoAcaso) => {
  const pins = {};
  const membros = [];
  for (const a of r.adultos || []) {
    membros.push({ nome: a.nome, papel: 'adulto', email: a.email, segredo: senhaAleatoria(sorteio) });
  }
  for (const c of r.criancas || []) {
    const pin = pinAleatorio(sorteio);
    pins[c] = pin;
    membros.push({ nome: c, papel: 'crianca', segredo: pin });
  }
  return { membros, pins };
};
