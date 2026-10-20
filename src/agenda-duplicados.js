// Um evento da agenda da Google que JÁ está na casa não se oferece outra vez.
//
// ── O defeito (21/10/2026) ──────────────────────────────────────────────────
//
// «Só tenho um evento no Google Calendar, e ao sincronizar a app pôs-me dois.»
// A app decidia que um evento da Google «já veio» por duas coisas que vivem NO
// APARELHO: `googleCalendarImported` (o que já se importou ou dispensou aqui) e
// o `idGoogle` guardado em `eventEdits`. O servidor não tem o identificador da
// Google. Num telemóvel novo, num segundo aparelho, ou depois de o browser
// perder os dados, essas duas listas estão vazias — e o evento que a casa já
// tinha (vindo do servidor) era oferecido como novidade. Importá-lo juntava uma
// segunda cópia: reproduzido com a casa a sério, 1 evento → 2.
//
// ── A regra ─────────────────────────────────────────────────────────────────
//
// Um evento da Google que tem o MESMO DIA, a MESMA HORA e o MESMO TÍTULO de um
// evento que a casa já vê, é o mesmo evento. O título compara-se sem olhar a
// maiúsculas nem a espaços a mais. É a mesma resposta em qualquer aparelho,
// porque se compara com o que a casa TEM, e não com o que este aparelho viu.
//
// Dois eventos diferentes que coincidam nos três (duas «Reunião» à mesma hora
// no mesmo dia) ficam como um só: é o preço de não duplicar, e o contrário —
// ver sempre tudo a dobrar — é o que se queria evitar.
const texto = (t) => String(t == null ? '' : t).normalize('NFC').replace(/\s+/g, ' ').trim().toLowerCase();
const dia = (d) => String(d == null ? '' : d).replace(/^d/, '');

// `g` pode vir da Google (`titulo`, `dia`, `hora`) ou já traduzido para a app
// (`title`, `date`, `time`). `eventosDaCasa` são os da app (`title`, `day`, `time`).
export const jaEstaNaCasa = (g, eventosDaCasa) => {
  const d = dia(g.dia !== undefined ? g.dia : g.date);
  const h = (g.hora !== undefined ? g.hora : g.time) || '';
  const t = texto(g.titulo !== undefined ? g.titulo : g.title);
  if (!d || !t) return false;
  return (eventosDaCasa || []).some((e) => e
    && dia(e.day) === d
    && (e.time || '') === h
    && texto(e.title) === t);
};

export const semOsQueJaEstaoNaCasa = (eventos, eventosDaCasa) =>
  (eventos || []).filter((g) => !jaEstaNaCasa(g, eventosDaCasa));
