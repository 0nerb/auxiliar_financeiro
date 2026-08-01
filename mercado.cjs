// Módulo de dados de mercado (roda no main process para evitar CORS).
// Ações/FIIs: brapi (lista) + Yahoo (cotação/histórico). Bitcoin: CoinGecko. Tesouro: CSV do Tesouro Transparente.

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36';
const TESOURO_CSV = 'https://www.tesourotransparente.gov.br/ckan/dataset/df56aa42-484a-4a59-8184-7676580c81e3/resource/796d2059-14e9-44e3-80c9-2d9e30b405c1/download/PrecoTaxaTesouroDireto.csv';

async function getJson(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
  if (!res.ok) throw new Error(`HTTP ${res.status} em ${url}`);
  return res.json();
}

// ======== LISTAS DE ATIVOS ========

async function buscarLista(classe) {
  if (classe === 'acoes' || classe === 'fiis') return buscarListaBrapi(classe);
  if (classe === 'tesouro') return buscarListaTesouro();
  if (classe === 'bitcoin') return [{ ticker: 'BTC', nome: 'Bitcoin', subtipo: 'cripto', setor: null, preco: null }];
  return [];
}

// --- Ações / FIIs (brapi) ---
async function buscarListaBrapi(classe) {
  const tipo = classe === 'fiis' ? 'fund' : 'stock';
  const ativos = [];
  let page = 1;
  let totalPages = 1;
  do {
    const data = await getJson(`https://brapi.dev/api/quote/list?type=${tipo}&limit=500&page=${page}`);
    totalPages = data.totalPages || 1;
    (data.stocks || []).forEach(s => {
      if (classe === 'fiis' && s.subType && s.subType !== 'fii') return;
      ativos.push({ ticker: s.stock, nome: s.name || s.stock, subtipo: s.subType || tipo, setor: s.sector || null, preco: null });
    });
    page += 1;
  } while (page <= totalPages && page <= 30);
  return ativos;
}

// --- Tesouro Direto (CSV de dados abertos) ---
function parseNum(s) {
  return parseFloat(String(s).trim().replace(/\./g, '').replace(',', '.'));
}
function parseData(s) {
  const [d, m, a] = s.trim().split('/');
  return new Date(Number(a), Number(m) - 1, Number(d));
}

async function buscarListaTesouro() {
  const res = await fetch(TESOURO_CSV, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`HTTP ${res.status} ao baixar CSV do Tesouro`);
  const texto = await res.text();
  const linhas = texto.split(/\r?\n/);
  const cab = linhas[0].split(';').map(h => h.trim());
  const iTipo = cab.indexOf('Tipo Titulo');
  const iVenc = cab.indexOf('Data Vencimento');
  const iBase = cab.indexOf('Data Base');
  // Valor ATUAL da posição = PU de VENDA (marcação a mercado / resgate), não o PU de compra.
  const iPU = cab.indexOf('PU Venda Manha');

  // Mantém, por título, a linha com a Data Base mais recente
  const porTitulo = new Map();
  let maxBase = 0;
  for (let i = 1; i < linhas.length; i++) {
    const col = linhas[i].split(';');
    if (col.length <= iPU) continue;
    const tipo = col[iTipo]?.trim();
    const venc = col[iVenc]?.trim();
    if (!tipo || !venc) continue;
    const base = parseData(col[iBase]).getTime();
    const pu = parseNum(col[iPU]);
    const chave = `${tipo}|${venc}`;
    const atual = porTitulo.get(chave);
    if (!atual || base > atual.base) porTitulo.set(chave, { tipo, venc, base, pu });
    if (base > maxBase) maxBase = base;
  }

  // Só títulos "ativos": negociados no pregão mais recente do arquivo, com PU > 0 e ainda não vencidos
  const limite = maxBase - 7 * 86400000; // tolera até 7 dias do último pregão
  const agora = Date.now();
  const ativos = [];
  porTitulo.forEach(({ tipo, venc, base, pu }) => {
    if (base < limite || pu <= 0) return;
    if (parseData(venc).getTime() < agora) return;
    const ano = venc.split('/')[2];
    ativos.push({ ticker: `${tipo} ${ano}`, nome: `${tipo} (venc. ${venc})`, subtipo: 'tesouro', setor: null, preco: pu });
  });
  ativos.sort((a, b) => a.ticker.localeCompare(b.ticker));
  return ativos;
}

// ======== YAHOO (Ações / FIIs) ========
function yahooUrl(ticker, params) {
  const q = new URLSearchParams(params).toString();
  return `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}.SA?${q}`;
}
async function cotacaoYahoo(ticker) {
  const data = await getJson(yahooUrl(ticker, { range: '1d', interval: '1d' }));
  const meta = data?.chart?.result?.[0]?.meta;
  if (!meta) throw new Error('Sem cotação para ' + ticker);
  return { preco: meta.regularMarketPrice, moeda: meta.currency, nome: meta.longName || meta.shortName || ticker };
}
async function precoYahooNaData(ticker, dataIso) {
  const alvo = new Date(dataIso + 'T00:00:00');
  const p1 = Math.floor((alvo.getTime() - 10 * 86400000) / 1000);
  const p2 = Math.floor((alvo.getTime() + 2 * 86400000) / 1000);
  const data = await getJson(yahooUrl(ticker, { period1: p1, period2: p2, interval: '1d' }));
  const r = data?.chart?.result?.[0];
  const ts = r?.timestamp || [];
  const closes = r?.indicators?.quote?.[0]?.close || [];
  const alvoSec = Math.floor(alvo.getTime() / 1000) + 86400;
  let escolhido = null;
  for (let i = 0; i < ts.length; i++) {
    if (closes[i] == null) continue;
    if (ts[i] <= alvoSec) escolhido = { data: ts[i], preco: closes[i] };
  }
  if (!escolhido) for (let i = 0; i < ts.length; i++) { if (closes[i] != null) { escolhido = { data: ts[i], preco: closes[i] }; break; } }
  if (!escolhido) throw new Error('Sem histórico para ' + ticker);
  return { preco: escolhido.preco, dataPregao: new Date(escolhido.data * 1000).toISOString().split('T')[0] };
}

// Soma os dividendos/proventos por cota pagos desde a data de compra (Yahoo events=div)
async function dividendosDesde(ticker, classe, dataIso) {
  if (classe !== 'acoes' && classe !== 'fiis') return { porCota: 0, quantidade: 0 };
  const alvo = new Date(dataIso + 'T00:00:00');
  const p1 = Math.floor(alvo.getTime() / 1000);
  const p2 = Math.floor(Date.now() / 1000);
  const data = await getJson(yahooUrl(ticker, { period1: p1, period2: p2, interval: '1d', events: 'div' }));
  const divs = data?.chart?.result?.[0]?.events?.dividends || {};
  let porCota = 0;
  let quantidade = 0;
  Object.values(divs).forEach(d => {
    if (d.date * 1000 >= alvo.getTime()) { porCota += d.amount; quantidade += 1; }
  });
  return { porCota, quantidade };
}

// ======== COINGECKO (Bitcoin) ========
async function cotacaoBitcoin() {
  const data = await getJson('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=brl');
  const preco = data?.bitcoin?.brl;
  if (preco == null) throw new Error('Sem cotação de Bitcoin');
  return { preco, moeda: 'BRL', nome: 'Bitcoin' };
}
async function precoBitcoinNaData(dataIso) {
  const [a, m, d] = dataIso.split('-');
  const data = await getJson(`https://api.coingecko.com/api/v3/coins/bitcoin/history?date=${d}-${m}-${a}&localization=false`);
  const preco = data?.market_data?.current_price?.brl;
  if (preco == null) throw new Error('Sem histórico de Bitcoin para ' + dataIso);
  return { preco, dataPregao: dataIso };
}

// Série histórica diária [{ data:'YYYY-MM-DD', preco }] dos últimos `dias`.
async function serieHistorica(ticker, classe, dias) {
  if (classe === 'tesouro') return []; // sem histórico por data
  if (classe === 'bitcoin') {
    const data = await getJson(`https://api.coingecko.com/api/v3/coins/bitcoin/market_chart?vs_currency=brl&days=${dias}`);
    const porDia = new Map();
    (data.prices || []).forEach(([ms, preco]) => {
      const dia = new Date(ms).toISOString().split('T')[0];
      porDia.set(dia, preco); // mantém o último valor do dia
    });
    return [...porDia.entries()].map(([data, preco]) => ({ data, preco })).sort((a, b) => a.data.localeCompare(b.data));
  }
  // Ações / FIIs via Yahoo
  const p1 = Math.floor((Date.now() - dias * 86400000) / 1000);
  const p2 = Math.floor(Date.now() / 1000);
  const data = await getJson(yahooUrl(ticker, { period1: p1, period2: p2, interval: '1d' }));
  const r = data?.chart?.result?.[0];
  const ts = r?.timestamp || [];
  const closes = r?.indicators?.quote?.[0]?.close || [];
  const serie = [];
  for (let i = 0; i < ts.length; i++) {
    if (closes[i] == null) continue;
    serie.push({ data: new Date(ts[i] * 1000).toISOString().split('T')[0], preco: closes[i] });
  }
  return serie;
}

// ======== ROTEAMENTO POR CLASSE ========
async function cotacaoAtual(ticker, classe) {
  if (classe === 'bitcoin') return cotacaoBitcoin();
  if (classe === 'tesouro') throw new Error('Cotação de Tesouro vem do cache da lista.');
  return cotacaoYahoo(ticker);
}
async function precoNaData(ticker, classe, dataIso) {
  if (classe === 'bitcoin') return precoBitcoinNaData(dataIso);
  if (classe === 'tesouro') throw new Error('Histórico de Tesouro indisponível — informe o preço pago.');
  return precoYahooNaData(ticker, dataIso);
}
async function dadosAtivo(ticker, classe, dataCompra) {
  const [atual, naData] = await Promise.all([cotacaoAtual(ticker, classe), precoNaData(ticker, classe, dataCompra)]);
  const variacaoPct = naData.preco > 0 ? ((atual.preco - naData.preco) / naData.preco) * 100 : 0;
  return { ticker, precoAtual: atual.preco, precoCompra: naData.preco, dataPregaoCompra: naData.dataPregao, variacaoPct, nome: atual.nome };
}

module.exports = { buscarLista, cotacaoAtual, precoNaData, dadosAtivo, dividendosDesde, serieHistorica };
