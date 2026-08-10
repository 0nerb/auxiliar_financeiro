// Helpers compartilhados de período (mês + ano), usados por Listagem e Dashboard.
import { calcularCofrinho } from './cofrinho';

export const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

const fmtBRL = (v) => `R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Bloco de texto descrevendo os cofrinhos (com rendimento, se a taxa CDI for informada).
function blocoCofrinhos(cofrinhos, cdiAnualPct, gastoMes) {
  if (!cofrinhos || cofrinhos.length === 0) return ['- Reservas/cofrinhos: nenhum cadastrado.'];

  const cdiDecimal = (cdiAnualPct || 0) / 100;
  const calc = cofrinhos.map(c => calcularCofrinho(c, cdiDecimal));
  const total = calc.reduce((a, c) => a + c.valor, 0);
  const rendMensal = calc.reduce((a, c) => a + c.mensal, 0);

  const linhas = [];
  const rendTxt = cdiAnualPct ? `, rendendo ~${fmtBRL(rendMensal)}/mês (bruto, CDI a ${cdiAnualPct}% a.a.)` : '';
  linhas.push(`- Reservas/cofrinhos: total guardado ${fmtBRL(total)}${rendTxt}.`);
  if (gastoMes > 0) {
    linhas.push(`  Isso equivale a ${(total / gastoMes).toFixed(1)} meses dos gastos atuais.`);
  }
  calc.forEach(c => {
    const rend = cdiAnualPct ? ` — rende ~${fmtBRL(c.mensal)}/mês` : '';
    linhas.push(`  • ${c.nome}: ${fmtBRL(c.valor)} a ${c.percentualCdi}% do CDI${rend}`);
  });
  return linhas;
}

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

// Monta um resumo textual compacto para a IA analisar (a matemática é feita aqui, no código).
export function montarResumoFinanceiro(transacoes, ganhos, cofrinhos, ano, mesIdx, cdiAnual = 0) {
  const fmt = (v) => `R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const mesNome = MESES[mesIdx];

  const doMes = transacoes.filter(t => apareceNoPeriodo(t, ano, mesIdx));
  const soma = (arr) => arr.reduce((a, t) => a + t.valor, 0);

  const gastoTotal = soma(doMes);
  const fixas = soma(doMes.filter(t => t.tipo === 'Gastos mensais fixos'));
  const investimentos = soma(doMes.filter(t => t.tipo === 'Investimentos'));
  const parcelas = soma(doMes.filter(t => t.tipo === 'Entradas no cartão' && t.parcelas > 1));
  const credito = soma(doMes.filter(t => t.formaPagamento === 'Crédito'));
  const debito = soma(doMes.filter(t => t.formaPagamento === 'Débito'));

  const porCat = {};
  doMes.forEach(t => { porCat[t.categoria] = (porCat[t.categoria] || 0) + t.valor; });
  const topCats = Object.entries(porCat).sort((a, b) => b[1] - a[1]).slice(0, 3);

  const ganhoMes = ganhos
    .filter(g => g.mesReferente === mesNome && g.anoReferente === ano)
    .reduce((a, g) => a + g.valor, 0);
  const saldo = ganhoMes - gastoTotal;

  let gastoAno = 0;
  for (let m = 0; m < 12; m++) {
    gastoAno += soma(transacoes.filter(t => apareceNoPeriodo(t, ano, m)));
  }
  const ganhoAno = ganhos.filter(g => g.anoReferente === ano).reduce((a, g) => a + g.valor, 0);

  const pctFixas = gastoTotal > 0 ? ` (${Math.round((fixas / gastoTotal) * 100)}% dos gastos)` : '';

  return [
    `Resumo financeiro de ${mesNome} de ${ano}:`,
    `- Renda no mês: ${fmt(ganhoMes)}`,
    `- Gasto total no mês: ${fmt(gastoTotal)}`,
    `- Saldo do mês (renda menos gastos): ${fmt(saldo)}`,
    `- Gastos fixos: ${fmt(fixas)}${pctFixas}`,
    `- Parcelas de cartão no mês: ${fmt(parcelas)}`,
    `- Investido no mês: ${fmt(investimentos)}`,
    `- Pago no crédito: ${fmt(credito)}; no débito/pix: ${fmt(debito)}`,
    `- Maiores categorias de gasto: ${topCats.map(([c, v]) => `${c} ${fmt(v)}`).join(', ') || 'nenhuma'}`,
    ...blocoCofrinhos(cofrinhos, cdiAnual, gastoTotal),
    '',
    `Visão do ano de ${ano}: renda acumulada ${fmt(ganhoAno)}, gastos acumulados ${fmt(gastoAno)}.`
  ].join('\n');
}

const ROTULO_CLASSE = { acoes: 'Ações', fiis: 'Fundos Imobiliários', tesouro: 'Tesouro Direto', bitcoin: 'Bitcoin', cofrinhos: 'Cofrinhos' };

// Resumo da carteira de investimentos (holdings já enriquecidos com precoAtual, quando disponível).
export function montarResumoCarteira(holdings) {
  if (!holdings || holdings.length === 0) {
    return 'Carteira de investimentos: nenhum ativo cadastrado.';
  }

  let totalInvestido = 0;
  let totalAtual = 0;
  const itens = holdings.map(h => {
    const investido = (h.precoCompra || 0) * (h.quantidade || 0);
    const atual = h.precoAtual != null ? h.precoAtual * (h.quantidade || 0) : null;
    totalInvestido += investido;
    if (atual != null) totalAtual += atual;
    return { ...h, investido, atual };
  });

  const varTotal = totalInvestido > 0 ? ((totalAtual - totalInvestido) / totalInvestido) * 100 : 0;
  const linhas = [
    `Carteira de investimentos: ${itens.length} ativos, total investido ${fmtBRL(totalInvestido)}, valor atual ${fmtBRL(totalAtual)} (variação ${varTotal.toFixed(1)}%).`
  ];

  // Alocação por tipo de ativo
  const porClasse = {};
  itens.forEach(i => { if (i.atual != null) porClasse[i.classe] = (porClasse[i.classe] || 0) + i.atual; });
  const classes = Object.entries(porClasse);
  if (classes.length) {
    linhas.push('Alocação por tipo:');
    classes.forEach(([c, v]) => {
      const pct = totalAtual > 0 ? Math.round((v / totalAtual) * 100) : 0;
      linhas.push(`  ${ROTULO_CLASSE[c] || c}: ${fmtBRL(v)} (${pct}% da carteira)`);
    });
  }

  // Detalhe por ativo (com variação e peso na carteira)
  linhas.push('Ativos:');
  itens.forEach(i => {
    const varTxt = i.atual != null && i.investido > 0 ? `${((i.atual - i.investido) / i.investido * 100).toFixed(1)}%` : 'sem cotação';
    const aloc = i.atual != null && totalAtual > 0 ? `${Math.round((i.atual / totalAtual) * 100)}%` : '-';
    linhas.push(`  • ${i.ticker} (${ROTULO_CLASSE[i.classe] || i.classe}): ${i.quantidade} un, valor atual ${i.atual != null ? fmtBRL(i.atual) : '?'}, variação ${varTxt}, ${aloc} da carteira`);
  });

  return linhas.join('\n');
}

// Lista COMPLETA dos lançamentos do mês (detalhe por transação) para a IA.
export function montarLancamentosDoMes(transacoes, ano, mesIdx) {
  const doMes = transacoes.filter(t => apareceNoPeriodo(t, ano, mesIdx));
  if (doMes.length === 0) return `Lançamentos de ${MESES[mesIdx]}/${ano}: nenhum registrado.`;

  const chave = chavePago(MESES[mesIdx], ano);
  const linhas = doMes
    .slice()
    .sort((a, b) => new Date(a.data) - new Date(b.data))
    .map(t => {
      let categoria = t.categoria;
      if (t.tipo === 'Entradas no cartão' && t.parcelas > 1 && t.parcelaAtual) {
        categoria += ` (parcela ${t.parcelaAtual}/${t.parcelas})`;
      }
      const pago = (t.mesesPagos && (t.mesesPagos.includes(chave) || t.mesesPagos.includes(MESES[mesIdx]))) || t.pago
        ? 'pago' : 'pendente';
      const dataFmt = t.data ? t.data.split('-').reverse().join('/') : '';
      const comentario = t.comentario ? ` — "${t.comentario}"` : '';
      return `- ${dataFmt} | ${t.tipo} | ${categoria} | ${t.formaPagamento || 'Crédito'} | ${fmtBRL(t.valor)} | ${pago}${comentario}`;
    });

  return [`Lançamentos individuais de ${MESES[mesIdx]}/${ano} (${doMes.length} no total):`, ...linhas].join('\n');
}

// Agregados (renda/gastos/saldo) de um único mês
function agregadosDoMes(transacoes, ganhos, ano, mesIdx) {
  const gasto = transacoes
    .filter(t => apareceNoPeriodo(t, ano, mesIdx))
    .reduce((a, t) => a + t.valor, 0);
  const renda = ganhos
    .filter(g => g.mesReferente === MESES[mesIdx] && g.anoReferente === ano)
    .reduce((a, g) => a + g.valor, 0);
  return { renda, gasto, saldo: renda - gasto };
}

// Resumo COMPARATIVO: série histórica + comparações com mês anterior, ano anterior e médias.
// Toda a matemática é feita aqui; o modelo só interpreta e compara.
export function montarResumoComparativo(transacoes, ganhos, cofrinhos, ano, mesIdx, cdiAnual = 0, mesesHistorico = 12) {
  const fmt = (v) => `R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const delta = (atual, base) => {
    if (base === 0) return atual === 0 ? '0%' : 'novo (não havia antes)';
    const p = ((atual - base) / Math.abs(base)) * 100;
    return `${p >= 0 ? '+' : ''}${p.toFixed(0)}%`;
  };

  const idxAtual = ano * 12 + mesIdx;

  // Série dos últimos N meses (só os que tiveram movimento)
  const serie = [];
  for (let i = mesesHistorico - 1; i >= 0; i--) {
    const idx = idxAtual - i;
    if (idx < 0) continue;
    const a = Math.floor(idx / 12);
    const m = idx % 12;
    const ag = agregadosDoMes(transacoes, ganhos, a, m);
    if (ag.renda > 0 || ag.gasto > 0) {
      serie.push({ ano: a, mesIdx: m, ...ag });
    }
  }

  const atual = agregadosDoMes(transacoes, ganhos, ano, mesIdx);
  const mesAnt = { a: Math.floor((idxAtual - 1) / 12), m: (idxAtual - 1) % 12 };
  const anteriorAg = agregadosDoMes(transacoes, ganhos, mesAnt.a, mesAnt.m);
  const anoAntAg = agregadosDoMes(transacoes, ganhos, ano - 1, mesIdx);

  // Média dos meses anteriores ativos (exclui o mês atual)
  const anteriores = serie.filter(s => !(s.ano === ano && s.mesIdx === mesIdx));
  const mediaGasto = anteriores.length ? anteriores.reduce((a, s) => a + s.gasto, 0) / anteriores.length : 0;
  const mediaRenda = anteriores.length ? anteriores.reduce((a, s) => a + s.renda, 0) / anteriores.length : 0;

  const linhasSerie = serie.map(s =>
    `- ${MESES[s.mesIdx]}/${s.ano}: renda ${fmt(s.renda)}, gastos ${fmt(s.gasto)}, saldo ${fmt(s.saldo)}`
  );

  const comparacoes = [
    `- Vs mês anterior (${MESES[mesAnt.m]}/${mesAnt.a}): gastos ${delta(atual.gasto, anteriorAg.gasto)}, saldo passou de ${fmt(anteriorAg.saldo)} para ${fmt(atual.saldo)}.`,
    (anoAntAg.renda > 0 || anoAntAg.gasto > 0)
      ? `- Vs mesmo mês do ano passado (${MESES[mesIdx]}/${ano - 1}): gastos ${delta(atual.gasto, anoAntAg.gasto)}, renda ${delta(atual.renda, anoAntAg.renda)}.`
      : `- Vs mesmo mês do ano passado: sem dados registrados.`,
    anteriores.length
      ? `- Média dos meses anteriores: gastos ${fmt(mediaGasto)}, renda ${fmt(mediaRenda)}. O mês atual está ${delta(atual.gasto, mediaGasto)} em gastos frente à média.`
      : `- Ainda não há meses anteriores suficientes para uma média.`
  ];

  return [
    `Análise comparativa da evolução financeira — mês de referência: ${MESES[mesIdx]}/${ano}.`,
    '',
    `Mês atual: renda ${fmt(atual.renda)}, gastos ${fmt(atual.gasto)}, saldo ${fmt(atual.saldo)}.`,
    ...blocoCofrinhos(cofrinhos, cdiAnual, atual.gasto),
    '',
    'Histórico mês a mês (renda / gastos / saldo):',
    ...linhasSerie,
    '',
    'Comparações:',
    ...comparacoes,
    '',
    'Sua tarefa: analise a EVOLUÇÃO ao longo dos meses, aponte tendências (está melhorando ou piorando?),',
    'compare o mês atual com os períodos anteriores e destaque o que mudou. Seja específico com os números.'
  ].join('\n');
}
