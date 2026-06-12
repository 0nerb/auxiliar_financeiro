import { useEffect, useState, useMemo } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  PieChart, Pie, Cell, ResponsiveContainer,
  BarChart, Bar
} from 'recharts';
import { MESES as LISTA_MESES, apareceNoPeriodo, anosDisponiveis } from './periodo';

// Paleta categórica usada pelas séries dos gráficos
const COLORS = ['#16a34a', '#2563eb', '#d97706', '#dc2626', '#9333ea', '#0ea5e9', '#65a30d', '#db2777'];

// Lê uma CSS variable resolvida para passar aos charts (recharts precisa de cores explícitas)
function useCssVar(nome) {
  const [valor, setValor] = useState('');
  useEffect(() => {
    const ler = () => setValor(getComputedStyle(document.documentElement).getPropertyValue(nome).trim());
    ler();
    // Reage a alternâncias de tema (data-theme muda no <html>)
    const obs = new MutationObserver(ler);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => obs.disconnect();
  }, [nome]);
  return valor;
}

const fmtReal = (v) => `R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function Dashboard() {
  const [transacoes, setTransacoes] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [mesSelecionado, setMesSelecionado] = useState(new Date().getMonth());
  const [anoSelecionado, setAnoSelecionado] = useState(new Date().getFullYear());

  const corGrid = useCssVar('--color-border');
  const corTexto = useCssVar('--color-text-secondary');
  const corLinha = useCssVar('--color-accent');

  useEffect(() => {
    let ativo = true;
    (async () => {
      try {
        const [trans, cats] = await Promise.all([
          window.api.listarTransacoes(),
          window.api.listarCategorias()
        ]);
        if (!ativo) return;
        setTransacoes(trans);
        setCategorias(cats);
      } catch (err) {
        console.error('Erro ao carregar dados do Dashboard:', err);
      }
    })();
    return () => { ativo = false; };
  }, []);

  const nomesCategorias = useMemo(() => categorias.map(c => c.nome), [categorias]);
  const anosDisp = useMemo(() => anosDisponiveis(transacoes), [transacoes]);

  // Agregação por mês do ano selecionado, com cada categoria como uma série
  const dadosMensaisAgrupados = useMemo(() => {
    const base = LISTA_MESES.map(nomeMes => {
      const obj = { nome: nomeMes.slice(0, 3), nomeCompleto: nomeMes, valorTotal: 0 };
      nomesCategorias.forEach(cat => obj[cat] = 0);
      return obj;
    });
    base.forEach((m, mesIdx) => {
      transacoes.forEach(t => {
        if (!apareceNoPeriodo(t, anoSelecionado, mesIdx)) return;
        const valor = parseFloat(t.valor);
        m[t.categoria] = (m[t.categoria] || 0) + valor;
        m.valorTotal += valor;
      });
    });
    return base;
  }, [transacoes, nomesCategorias, anoSelecionado]);

  const dadosPizza = useMemo(() => {
    const mesData = dadosMensaisAgrupados[mesSelecionado];
    return nomesCategorias
      .map(cat => ({ name: cat, value: mesData[cat] }))
      .filter(item => item.value > 0);
  }, [dadosMensaisAgrupados, mesSelecionado, nomesCategorias]);

  // Métricas do ano todo (somatórios visíveis nos cards do topo)
  const metricas = useMemo(() => {
    const m = { total: 0, credito: 0, debito: 0, investimentos: 0, fixas: 0 };
    LISTA_MESES.forEach((_, mesIdx) => {
      transacoes.forEach(t => {
        if (!apareceNoPeriodo(t, anoSelecionado, mesIdx)) return;
        const v = parseFloat(t.valor);
        m.total += v;
        if (t.formaPagamento === 'Crédito') m.credito += v;
        if (t.formaPagamento === 'Débito')  m.debito  += v;
        if (t.tipo === 'Investimentos')     m.investimentos += v;
        if (t.tipo === 'Gastos mensais fixos') m.fixas += v;
      });
    });
    return m;
  }, [transacoes, anoSelecionado]);

  const tooltipStyle = {
    background: 'var(--color-bg-surface)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-md)',
    color: 'var(--color-text-primary)'
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

      {/* Linha de cabeçalho com seletor de ano */}
      <div className="card card-compact" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <p className="metric-label">Resumo financeiro</p>
          <h2 style={{ margin: '0.15rem 0 0' }}>{anoSelecionado}</h2>
        </div>
        <label className="input-group" style={{ flexDirection: 'row', alignItems: 'center', gap: '0.6rem', width: 'auto' }}>
          <span className="input-label" style={{ margin: 0 }}>Ano</span>
          <select
            className="input-field"
            style={{ width: '110px' }}
            value={anoSelecionado}
            onChange={e => setAnoSelecionado(parseInt(e.target.value, 10))}
          >
            {anosDisp.map(ano => <option key={ano} value={ano}>{ano}</option>)}
          </select>
        </label>
      </div>

      {/* Cards de métricas */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem' }}>
        <div className="metric-card">
          <span className="metric-label">Total no ano</span>
          <span className="metric-value">{fmtReal(metricas.total)}</span>
        </div>
        <div className="metric-card">
          <span className="metric-label">Cartão de crédito</span>
          <span className="metric-value" style={{ color: 'var(--color-pink-text)' }}>{fmtReal(metricas.credito)}</span>
        </div>
        <div className="metric-card">
          <span className="metric-label">Débito / Pix</span>
          <span className="metric-value" style={{ color: 'var(--color-accent-text)' }}>{fmtReal(metricas.debito)}</span>
        </div>
        <div className="metric-card">
          <span className="metric-label">Investimentos</span>
          <span className="metric-value" style={{ color: 'var(--color-warning-text)' }}>{fmtReal(metricas.investimentos)}</span>
        </div>
      </div>

      {/* Gráficos */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
          <h2 style={{ margin: 0 }}>Evolução total de gastos</h2>
          <span className="metric-label">Mensal</span>
        </div>
        <div className="chart-container">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={dadosMensaisAgrupados} margin={{ top: 10, right: 20, left: 0, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={corGrid} />
              <XAxis dataKey="nome" stroke={corTexto} fontSize={12} />
              <YAxis stroke={corTexto} fontSize={12} />
              <Tooltip formatter={(val) => fmtReal(val)} contentStyle={tooltipStyle} cursor={{ stroke: corGrid }} />
              <Legend verticalAlign="bottom" height={28} wrapperStyle={{ color: corTexto, fontSize: 12 }} />
              <Line type="monotone" dataKey="valorTotal" name="Total gasto" stroke={corLinha} strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
          <h2 style={{ margin: 0 }}>Categorias por mês</h2>
          <span className="metric-label">Empilhado</span>
        </div>
        <div className="chart-container">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={dadosMensaisAgrupados} margin={{ top: 10, right: 20, left: 0, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={corGrid} />
              <XAxis dataKey="nome" stroke={corTexto} fontSize={12} />
              <YAxis stroke={corTexto} fontSize={12} />
              <Tooltip formatter={(val) => fmtReal(val)} contentStyle={tooltipStyle} cursor={{ fill: 'transparent' }} />
              <Legend verticalAlign="bottom" height={28} wrapperStyle={{ color: corTexto, fontSize: 12 }} />
              {nomesCategorias.map((cat, index) => (
                <Bar key={cat} dataKey={cat} stackId="a" fill={COLORS[index % COLORS.length]} name={cat} radius={[4, 4, 0, 0]} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
          <h2 style={{ margin: 0 }}>Distribuição de {LISTA_MESES[mesSelecionado]}</h2>
          <select
            className="input-field"
            style={{ width: 'auto' }}
            value={mesSelecionado}
            onChange={e => setMesSelecionado(parseInt(e.target.value, 10))}
          >
            {LISTA_MESES.map((nome, i) => <option key={i} value={i}>{nome}</option>)}
          </select>
        </div>

        <div style={{ minHeight: '340px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {dadosPizza.length > 0 ? (
            <ResponsiveContainer width="100%" height={340}>
              <PieChart key={mesSelecionado}>
                <Pie
                  data={dadosPizza}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={120}
                  paddingAngle={2}
                  dataKey="value"
                  label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                >
                  {dadosPizza.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(val) => fmtReal(val)} contentStyle={tooltipStyle} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <p style={{ color: 'var(--color-text-secondary)' }}>Sem dados para este mês.</p>
          )}
        </div>
      </div>
    </div>
  );
}
