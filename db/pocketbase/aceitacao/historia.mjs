// O andaime das histórias de aceitação.
//
// Uma história é o percurso de duas ou três pessoas pela CAMADA DA APP
// (`src/sync.js`, `src/pocketbase.js`) contra o servidor da casa — o que um
// utilizador faria, na ordem em que o faria, e o que os outros veem a seguir.
// Não é a prova das regras (essa é `provar-*.mjs`, coleção a coleção) nem o
// guarda do ecrã (esse é o Jest): é a pergunta «a história que prometemos ao
// dono da casa acontece mesmo, de ponta a ponta?».
//
// Cada história tem a sua casa, marcada com o PREFIXO das provas, com a mesma
// família: a Rita administra, o Tomás é adulto, o Léo e a Mia são crianças com
// PIN. Muda-se de pessoa com `como.rita()`, `como.leo()`… — a app tem UMA
// sessão, e é essa que se troca; para ver «o outro telemóvel ao mesmo tempo» há
// clientes crus por pessoa (`de.tomas`, `de.leo`, `de.mia`).
import PocketBase from 'pocketbase';
import { URL, PREFIXO, comecar, prova, igual, recusado, comId, semRecusa, resumo, memoriaDeTelemovel } from '../provas.mjs';

// `comId` para o que o servidor responde com o id (escritas diretas); `semRecusa`
// para o que vai pela FILA — despesas, movimentos de cofre —, que devolve a
// contagem do que foi enviado, não a linha.
export { URL, prova, igual, recusado, comId, semRecusa };

export const hoje = new Date().toISOString().slice(0, 10);
export const chave = (iso) => `d${iso}`;
// A forma humana das datas da loja, «dd/mm/aaaa» — é a que os contratos falam.
export const dmy = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
export const diaDaqui = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

// «Dado», «Quando», «Então»: só a forma de contar — por baixo é a mesma `prova`.
export const dado = (texto, fn) => prova(`Dado que ${texto}`, fn);
export const quando = (texto, fn) => prova(`Quando ${texto}`, fn);
export const entao = (texto, fn) => prova(`Então ${texto}`, fn);
export const fim = () => resumo();

export async function casaDaHistoria(nome) {
  const { configurar, auth } = await import('../../../src/pocketbase.js');
  const sync = await import('../../../src/sync.js');
  configurar({ url: URL, storage: memoriaDeTelemovel() });

  const { pb: admin } = await comecar();
  const casa = await admin.collection('casas').create({ nome: PREFIXO + nome, valor_ponto: 0.1 });
  const s = (p) => ({ password: p, passwordConfirm: p });
  const mk = (n, papel, extra) => admin.collection('membros').create({
    nome: n, login: `${casa.id}_${n}`, casa: casa.id, papel, verified: true, ...extra });
  const marca = casa.id.slice(0, 6);
  const rita = await mk('Rita', 'admin', { email: `rita-${marca}@x.pt`, ...s('palavra-longa-1') });
  const tomas = await mk('Tomás', 'adulto', { email: `tomas-${marca}@x.pt`, ...s('palavra-longa-2') });
  const leo = await mk('Léo', 'crianca', { ...s('135790') });
  const mia = await mk('Mia', 'crianca', { fem: true, ...s('246813') });

  const telemovel = async (id, senha) => {
    const c = new PocketBase(URL);
    c.autoCancellation(false);
    await c.collection('membros').authWithPassword(id, senha);
    return c;
  };
  const de = {
    tomas: await telemovel(`tomas-${marca}@x.pt`, 'palavra-longa-2'),
    leo: await telemovel(`${casa.id}_Léo`, '135790'),
    mia: await telemovel(`${casa.id}_Mia`, '246813'),
  };

  // A sessão da APP, trocada de pessoa para pessoa. Devolve `{ casa, membro }`.
  const como = {
    rita: async () => { await auth.entrarAdulto(`rita-${marca}@x.pt`, 'palavra-longa-1'); return sync.sessao(); },
    tomas: async () => { await auth.entrarAdulto(`tomas-${marca}@x.pt`, 'palavra-longa-2'); return sync.sessao(); },
    leo: async () => { await auth.entrarCrianca(`${casa.id}_Léo`, '135790'); return sync.sessao(); },
    mia: async () => { await auth.entrarCrianca(`${casa.id}_Mia`, '246813'); return sync.sessao(); },
  };

  // Uma segunda casa, com uma adulta, para o «de fora ninguém entra».
  const vizinha = async () => {
    const outra = await admin.collection('casas').create({ nome: PREFIXO + nome + ' (vizinha)', valor_ponto: 0.1 });
    await admin.collection('membros').create({ nome: 'Vizinha', login: `${outra.id}_Vizinha`, casa: outra.id,
      papel: 'admin', email: `viz-${marca}@x.pt`, ...s('palavra-longa-9'), verified: true });
    return { casa: outra, cliente: await telemovel(`viz-${marca}@x.pt`, 'palavra-longa-9') };
  };

  // O quadro `nome → id`, como a loja o passa ao `puxarSaude` — é ele que
  // traduz «quem marcou» e «quem escreveu» para o nome.
  const ids = { Rita: rita.id, 'Tomás': tomas.id, 'Léo': leo.id, Mia: mia.id };

  return { admin, sync, auth, casa, rita, tomas, leo, mia, ids, de, como, telemovel, vizinha };
}
