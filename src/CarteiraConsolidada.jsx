import { useState, useEffect, useMemo } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend, LineChart, Line, XAxis, YAxis, CartesianGrid } from 'recharts';

const RANGES = [
  { label: '1M', dias: 30 },
  { label: '3M', dias: 90 },
  { label: '6M', dias: 180 },
  { label: '1A', dias: 365 },
  { label: 'Máx', dias: 1095 }
];

const fmtReal = (v) => `R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtPct = (v) => `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`;
const corVar = (v) => (v >= 0 ? 'var(--color-accent-text)' : 'var(--color-danger-text)');

const CLASSES = {
  acoes: { rotulo: 'Ações', cor: '#2563eb' },
  fiis: { rotulo: 'Fundos Imobiliários', cor: '#16a34a' },
  tesouro: { rotulo: 'Tesouro Direto', cor: '#d97706' },
  bitcoin: { rotulo: 'Bitcoin', cor: '#f59e0b' }
};

export default function CarteiraConsolidada() {
  const [holdings, setHoldings] = useState([]);
  const [precos, setPrecos] = useState({});   // `${classe}:${ticker}` -> preco
  const [divs, setDivs] = useState({});        // holdingId -> { porCota }
  const [historicos, setHistoricos] = useState({}); // `${classe}:${ticker}` -> [{data, preco}]
  const [rangeDias, setRangeDias] = useState(180);

  useEffect(() => {
    let ativo = true;
    (async () => {
      try {
        const cart = await window.api.listarCarteira();
        if (ativo) setHoldings(cart);
      } catch (err) {
        console.error('Erro ao carregar carteira consolidada:', err);
      }
    })();
    return () => { ativo = false; };
  }, []);

  // Cotação (por classe+ticker) e dividendos (por ativo)
  useEffect(() => {
    const vistas = new Set();
    holdings.forEach(async (h) => {
      const chave = `${h.classe}:${h.ticker}`;
      if (!vistas.has(chave)) {
        vistas.add(chave);
        try {
          const cot = await window.api.cotacaoAtual(h.ticker, h.classe);
          setPrecos(prev => ({ ...prev, [chave]: cot.preco }));
        } catch {
          setPrecos(prev => ({ ...prev, [chave]: null }));
        }
      }
      if (h.classe === 'acoes' || h.classe === 'fiis') {
        try {
          const d = await window.api.dividendos(h.ticker, h.classe, h.dataCompra);
          setDivs(prev => ({ ...prev, [h.id]: d }));
        } catch {
          setDivs(prev => ({ ...prev, [h.id]: { porCota: 0 } }));
        }
      }
    });
  }, [holdings]);

  // Séries históricas por ativo (para o gráfico de evolução). Tesouro não tem histórico.
  useEffect(() => {
    const vistas = new Set();
    holdings.forEach(async (h) => {
      const chave = `${h.classe}:${h.ticker}`;
      if (vistas.has(chave) || h.classe === 'tesouro') return;
      vistas.add(chave);
      try {
        const serie = await window.api.serieHistorica(h.ticker, h.classe, rangeDias);
        setHistoricos(prev => ({ ...prev, [chave]: serie }));
      } catch {
        setHistoricos(prev => ({ ...prev, [chave]: [] }));
      }
    });
  }, [holdings, rangeDias]);

  // Valor da carteira em cada data (soma só ativos já comprados até aquela data).
  // As séries já vêm limitadas ao rangeDias, então basta unir as datas presentes.
  const serieCarteira = useMemo(() => {
    const datasSet = new Set();
    Object.values(historicos).forEach(s => s.forEach(pt => datasSet.add(pt.data)));
    const datas = [...datasSet].sort();
    if (datas.length === 0) return [];

    const precoEm = (serie, dataStr) => {
      let p = null;
      for (const pt of serie) { if (pt.data <= dataStr) p = pt.preco; else break; }
      return p;
    };

    return datas.map(dataStr => {
      let total = 0;
      let algum = false;
      holdings.forEach(h => {
        if (h.dataCompra > dataStr) return; // ainda não possuía
        const chave = `${h.classe}:${h.ticker}`;
        const preco = h.classe === 'tesouro' ? precos[chave] : precoEm(historicos[chave] || [], dataStr);
        if (preco != null) { total += preco * h.quantidade; algum = true; }
      });
      return algum ? { data: dataStr, valor: total } : null;
    }).filter(Boolean);
  }, [historicos, holdings, precos]);

  const enriquecidos = useMemo(() => holdings.map(h => {
    const preco = precos[`${h.classe}:${h.ticker}`];
    const investido = h.precoCompra * h.quantidade;
    const valorAtual = preco != null ? preco * h.quantidade : null;
    const divPorCota = divs[h.id]?.porCota || 0;
    const proventos = divPorCota * h.quantidade;
    const rentabilidade = valorAtual != null && investido > 0
      ? ((valorAtual - investido + proventos) / investido) * 100
      : null;
    return { ...h, investido, valorAtual, proventos, rentabilidade };
  }), [holdings, precos, divs]);

  const totais = useMemo(() => {
    let investido = 0, atual = 0, proventos = 0, temTudo = true;
    enriquecidos.forEach(e => {
      investido += e.investido;
      proventos += e.proventos;
      if (e.valorAtual != null) atual += e.valorAtual; else temTudo = false;
    });
    const ganho = temTudo ? (atual - investido + proventos) : null;
    const rentabilidade = investido > 0 && ganho != null ? (ganho / investido) * 100 : null;
    return { investido, atual, proventos, ganho, rentabilidade, temTudo };
  }, [enriquecidos]);

  // Alocação por classe (valor atual)
  const porClasse = useMemo(() => {
    const mapa = {};
    enriquecidos.forEach(e => {
      if (e.valorAtual == null) return;
      if (!mapa[e.classe]) mapa[e.classe] = { classe: e.classe, valor: 0, investido: 0 };
      mapa[e.classe].valor += e.valorAtual;
      mapa[e.classe].investido += e.investido;
    });
    return Object.values(mapa).sort((a, b) => b.valor - a.valor);
  }, [enriquecidos]);

  const dadosPizza = porClasse.map(c => ({ name: CLASSES[c.classe]?.rotulo || c.classe, value: c.valor, cor: CLASSES[c.classe]?.cor }));

  const tooltipStyle = { background: 'var(--color-bg-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', color: 'var(--color-text-primary)' };

  if (holdings.length === 0) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: '3rem', color: 'var(--color-text-secondary)', maxWidth: '960px' }}>
        Nenhum investimento cadastrado ainda. Adicione ativos nas abas Ações, Fundos Imobiliários, Tesouro Direto ou Bitcoin.
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', maxWidth: '960px' }}>

      {/* Totais gerais */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '1rem' }}>
        <div className="metric-card">
          <span className="metric-label">Total investido</span>
          <span className="metric-value">{fmtReal(totais.investido)}</span>
        </div>
        <div className="metric-card">
          <span className="metric-label">Valor atual</span>
          <span className="metric-value">{totais.temTudo ? fmtReal(totais.atual) : '...'}</span>
        </div>
        <div className="metric-card">
          <span className="metric-label">Proventos recebidos</span>
          <span className="metric-value" style={{ color: 'var(--color-accent-text)' }}>{fmtReal(totais.proventos)}</span>
        </div>
        <div className="metric-card">
          <span className="metric-label">Ganho/perda total</span>
          <span className="metric-value" style={{ color: totais.ganho == null ? 'var(--color-text-secondary)' : corVar(totais.ganho) }}>
            {totais.ganho == null ? '...' : fmtReal(totais.ganho)}
          </span>
        </div>
        <div className="metric-card">
          <span className="metric-label">Rentabilidade</span>
          <span className="metric-value" style={{ color: totais.rentabilidade == null ? 'var(--color-text-secondary)' : corVar(totais.rentabilidade) }}>
            {totais.rentabilidade == null ? '...' : fmtPct(totais.rentabilidade)}
          </span>
        </div>
      </div>

      {/* Evolução da carteira */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1rem' }}>
          <h2 style={{ margin: 0 }}>Evolução da carteira</h2>
          <div style={{ display: 'flex', gap: '0.35rem' }}>
            {RANGES.map(r => (
              <button
                key={r.dias}
                type="button"
                className="btn"
                onClick={() => setRangeDias(r.dias)}
                style={{
                  padding: '0.35rem 0.7rem',
                  fontSize: '0.8rem',
                  background: rangeDias === r.dias ? 'var(--color-accent)' : 'transparent',
                  color: rangeDias === r.dias ? 'var(--color-text-on-accent)' : 'var(--color-text-secondary)',
                  borderColor: rangeDias === r.dias ? 'var(--color-accent)' : 'var(--color-border-strong)'
                }}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>
        <div style={{ height: 280 }}>
          {serieCarteira.length > 1 ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={serieCarteira} margin={{ top: 5, right: 15, left: 5, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis
                  dataKey="data"
                  stroke="var(--color-text-secondary)"
                  fontSize={11}
                  minTickGap={40}
                  tickFormatter={(d) => d.split('-').slice(1).reverse().join('/')}
                />
                <YAxis
                  stroke="var(--color-text-secondary)"
                  fontSize={11}
                  width={70}
                  domain={['auto', 'auto']}
                  tickFormatter={(v) => `R$ ${(v / 1000).toFixed(1)}k`}
                />
                <Tooltip
                  contentStyle={tooltipStyle}
                  formatter={(v) => [fmtReal(v), 'Valor da carteira']}
                  labelFormatter={(d) => d.split('-').reverse().join('/')}
                />
                <Line type="monotone" dataKey="valor" name="Valor" stroke="var(--color-accent)" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-secondary)' }}>
              {holdings.every(h => h.classe === 'tesouro')
                ? 'Sem histórico para Tesouro Direto — cadastre ações, FIIs ou Bitcoin para ver a evolução.'
                : 'Carregando histórico...'}
            </div>
          )}
        </div>
      </div>

      {/* Alocação por tipo */}
      <div className="card">
        <h2 style={{ margin: '0 0 1rem' }}>Alocação por tipo de investimento</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '1rem', alignItems: 'center' }}>
          <div style={{ height: 240 }}>
            {dadosPizza.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={dadosPizza} cx="50%" cy="50%" innerRadius={55} outerRadius={100} paddingAngle={2} dataKey="value">
                    {dadosPizza.map((d, i) => <Cell key={i} fill={d.cor} />)}
                  </Pie>
                  <Tooltip formatter={(v) => fmtReal(v)} contentStyle={tooltipStyle} />
                  <Legend verticalAlign="bottom" height={30} wrapperStyle={{ fontSize: 12, color: 'var(--color-text-secondary)' }} />
                </PieChart>
              </ResponsiveContainer>
            ) : <p style={{ color: 'var(--color-text-secondary)' }}>Carregando cotações...</p>}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {porClasse.map(c => {
              const pct = totais.atual > 0 ? (c.valor / totais.atual) * 100 : 0;
              const rent = c.investido > 0 ? ((c.valor - c.investido) / c.investido) * 100 : 0;
              return (
                <div key={c.classe} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0.75rem', background: 'var(--color-bg-muted)', borderRadius: 'var(--radius-md)' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ width: 10, height: 10, borderRadius: 2, background: CLASSES[c.classe]?.cor, display: 'inline-block' }} />
                    {CLASSES[c.classe]?.rotulo || c.classe}
                  </span>
                  <span style={{ textAlign: 'right' }}>
                    <span style={{ fontWeight: 500 }}>{fmtReal(c.valor)}</span>
                    <span style={{ color: 'var(--color-text-secondary)', fontSize: '0.8rem', marginLeft: '0.5rem' }}>{Math.round(pct)}%</span>
                    <span style={{ color: corVar(rent), fontSize: '0.8rem', marginLeft: '0.5rem' }}>{fmtPct(rent)}</span>
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Todos os ativos */}
      <div className="table-wrap">
        <table className="t-financeiro">
          <thead>
            <tr>
              <th>Ativo</th>
              <th>Tipo</th>
              <th>Investido</th>
              <th>Valor atual</th>
              <th>Rentabilidade</th>
            </tr>
          </thead>
          <tbody>
            {enriquecidos.slice().sort((a, b) => (b.valorAtual || 0) - (a.valorAtual || 0)).map(e => (
              <tr key={e.id}>
                <td>
                  <div style={{ fontWeight: 500 }}>{e.ticker}</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.nome}</div>
                </td>
                <td><span className="badge badge-muted">{CLASSES[e.classe]?.rotulo || e.classe}</span></td>
                <td style={{ whiteSpace: 'nowrap' }}>{fmtReal(e.investido)}</td>
                <td style={{ whiteSpace: 'nowrap', fontWeight: 500 }}>{e.valorAtual != null ? fmtReal(e.valorAtual) : '...'}</td>
                <td style={{ whiteSpace: 'nowrap', fontWeight: 500, color: e.rentabilidade != null ? corVar(e.rentabilidade) : 'var(--color-text-secondary)' }}>
                  {e.rentabilidade != null ? fmtPct(e.rentabilidade) : '...'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.8rem', textAlign: 'center' }}>
        Rentabilidade de Ações e FIIs inclui proventos recebidos. Valores informativos, sujeitos a atraso das cotações.
      </p>
    </div>
  );
}
