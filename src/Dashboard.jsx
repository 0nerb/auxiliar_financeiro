import { useEffect, useState, useMemo } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  PieChart, Pie, Cell, ResponsiveContainer,
  BarChart, Bar
} from 'recharts';
import { MESES as LISTA_MESES, apareceNoPeriodo, anosDisponiveis } from './periodo';

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#AF19FF', '#FF19A3', '#19FF5A', '#19E3FF'];

export default function Dashboard() {
  const [transacoes, setTransacoes] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [mesSelecionado, setMesSelecionado] = useState(new Date().getMonth());
  const [anoSelecionado, setAnoSelecionado] = useState(new Date().getFullYear());

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

  // Nomes das categorias (dinâmicos) usados como séries dos gráficos
  const nomesCategorias = useMemo(() => categorias.map(c => c.nome), [categorias]);
  const anosDisp = useMemo(() => anosDisponiveis(transacoes), [transacoes]);

  const dadosMensaisAgrupados = useMemo(() => {
    const base = LISTA_MESES.map(nomeMes => {
      const obj = { nome: nomeMes, valorTotal: 0 };
      nomesCategorias.forEach(cat => obj[cat] = 0);
      return obj;
    });

    // Para cada mês do ano selecionado, soma o que cai naquele período (parcelas e fixas incluídas)
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

  return (
    <div className="dashboard-metrics">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2.5rem', marginTop: '1rem' }}>

        <div className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <h2 style={{ margin: 0 }}>Resumo de {anoSelecionado}</h2>
          <label className="input-group" style={{ flexDirection: 'row', alignItems: 'center', gap: '0.75rem', width: 'auto', fontSize: '1.2rem' }}>
            Ano:
            <select
              className="input-field"
              style={{ width: '120px', fontSize: '1.1rem', padding: '0.5rem', marginTop: 0 }}
              value={anoSelecionado}
              onChange={e => setAnoSelecionado(parseInt(e.target.value, 10))}
            >
              {anosDisp.map(ano => <option key={ano} value={ano}>{ano}</option>)}
            </select>
          </label>
        </div>

        <div className="card chart-container">
          <h2 style={{ marginBottom: '1rem' }}>Evolução Total de Gastos</h2>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={dadosMensaisAgrupados} margin={{ top: 5, right: 30, left: 20, bottom: 40 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="nome" padding={{ left: 10, right: 20 }} />
              <YAxis />
              <Tooltip formatter={(val) => `R$ ${val.toFixed(2)}`} />
              <Legend verticalAlign="bottom" height={36} />
              <Line type="monotone" dataKey="valorTotal" name="Total Gasto" stroke="#4f46e5" strokeWidth={3} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="card chart-container">
          <h2 style={{ marginBottom: '1rem' }}>Comparativo de Categorias por Mês</h2>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={dadosMensaisAgrupados} margin={{ top: 5, right: 30, left: 20, bottom: 40 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="nome" padding={{ left: 10, right: 20 }} />
              <YAxis />
              <Tooltip formatter={(val) => `R$ ${val.toFixed(2)}`} />
              <Legend verticalAlign="bottom" height={36} />
              {nomesCategorias.map((cat, index) => (
                <Bar key={cat} dataKey={cat} stackId="a" fill={COLORS[index % COLORS.length]} name={cat} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="card chart-container" style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
            <h2 style={{ fontSize: '1.5rem' }}>Distribuição de {LISTA_MESES[mesSelecionado]}</h2>
            <select 
              className="input-field" 
              style={{ width: 'auto', fontSize: '1.1rem', marginTop: 0 }}
              value={mesSelecionado}
              onChange={e => setMesSelecionado(parseInt(e.target.value, 10))}
            >
              {LISTA_MESES.map((nome, i) => <option key={i} value={i}>{nome}</option>)}
            </select>
          </div>
          
          <div style={{ flexGrow: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {dadosPizza.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart key={mesSelecionado}>
                  <Pie
                    data={dadosPizza}
                    cx="50%"
                    cy="50%"
                    outerRadius={120}
                    dataKey="value"
                    label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                  >
                    {dadosPizza.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(val) => `R$ ${val.toFixed(2)}`} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <p style={{ color: '#6b7280', fontSize: '1.2rem' }}>Sem dados para este mês.</p>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}