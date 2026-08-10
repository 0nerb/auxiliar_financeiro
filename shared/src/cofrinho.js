// Matemática de rendimento dos cofrinhos (bruto, sem IR/IOF), compartilhada
// entre a aba Cofrinhos e o resumo enviado para a IA.

// Rendimento composto diário, dias corridos.
//   valor         → quanto está guardado
//   percentualCdi → ex.: 100 = rende 100% do CDI
//   cdiDecimal    → taxa CDI a.a. em decimal (ex.: 0.1415 para 14,15%)
//   dias          → dias corridos
export function rendimentoComposto(valor, percentualCdi, cdiDecimal, dias) {
  if (valor <= 0 || dias <= 0) return 0;
  const taxaAnualEfetiva = cdiDecimal * (percentualCdi / 100);
  const taxaDiaria = Math.pow(1 + taxaAnualEfetiva, 1 / 365) - 1;
  return valor * (Math.pow(1 + taxaDiaria, dias) - 1);
}

export function diasDesde(dataIso) {
  if (!dataIso) return 0;
  const inicio = new Date(dataIso + 'T00:00:00');
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const ms = hoje - inicio;
  return Math.max(0, Math.floor(ms / 86400000));
}

// Enriquece um cofrinho com os cálculos de rendimento (dias, acumulado, mensal, taxa efetiva).
export function calcularCofrinho(c, cdiDecimal) {
  const dias = diasDesde(c.dataDeposito);
  const acumulado = rendimentoComposto(c.valor, c.percentualCdi, cdiDecimal, dias);
  const mensal = rendimentoComposto(c.valor, c.percentualCdi, cdiDecimal, 30);
  const taxaAnualEfetiva = cdiDecimal * (c.percentualCdi / 100) * 100; // em %
  return { ...c, dias, acumulado, mensal, taxaAnualEfetiva };
}
