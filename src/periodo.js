// Helpers compartilhados de período (mês + ano), usados por Listagem e Dashboard.

export const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

// Ano de referência da transação. Dados antigos não têm o campo → deriva da data (YYYY-MM-DD).
export function anoReferenteDe(t) {
  if (t.anoReferente != null) return t.anoReferente;
  if (t.data) return parseInt(t.data.split('-')[0], 10);
  return new Date().getFullYear();
}

// Índice absoluto de mês (ano*12 + mês) — permite comparar períodos atravessando anos.
function indiceAbsoluto(ano, mesIdx) {
  return ano * 12 + mesIdx;
}

// Decide se uma transação deve aparecer no período (ano, mesIdx) selecionado.
export function apareceNoPeriodo(t, ano, mesIdx) {
  const mesIdxT = MESES.indexOf(t.mesReferente);
  const anoT = anoReferenteDe(t);

  if (t.tipo === 'Gastos mensais fixos') {
    // Gasto fixo se projeta do mês de início para frente, até ser cancelado (mesFim/anoFim).
    const inicio = indiceAbsoluto(anoT, mesIdxT);
    const alvo = indiceAbsoluto(ano, mesIdx);
    if (alvo < inicio) return false;
    if (t.mesFim) {
      const anoFimT = t.anoFim != null ? t.anoFim : anoT;
      const fim = indiceAbsoluto(anoFimT, MESES.indexOf(t.mesFim));
      if (alvo >= fim) return false;
    }
    return true;
  }

  // Transações comuns e parcelas: aparecem exatamente no seu mês/ano de referência.
  return mesIdxT === mesIdx && anoT === ano;
}

// Lista contínua de anos para os seletores, cobrindo os dados existentes + ano atual.
export function anosDisponiveis(transacoes) {
  const atual = new Date().getFullYear();
  const anos = transacoes.map(anoReferenteDe);
  anos.push(atual);
  const min = Math.min(...anos);
  const max = Math.max(...anos, atual + 1);
  const range = [];
  for (let a = min; a <= max; a++) range.push(a);
  return range;
}

// Chave year-aware para marcar um período como pago (evita confundir Maio/2026 com Maio/2027).
export function chavePago(mes, ano) {
  return `${mes}/${ano}`;
}
