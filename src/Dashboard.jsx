import { useEffect, useState, useMemo } from 'react';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, 
  PieChart, Pie, Cell, ResponsiveContainer, 
  BarChart, Bar 
} from 'recharts';

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#AF19FF', '#FF19A3', '#19FF5A', '#19E3FF'];
const LISTA_MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

export default function Dashboard() {
  const [transacoes, setTransacoes] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [mesSelecionado, setMesSelecionado] = useState(new Date().getMonth());

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

  const dadosMensaisAgrupados = useMemo(() => {
    const base = LISTA_MESES.map(nomeMes => {
      const obj = { nome: nomeMes, valorTotal: 0 };
      nomesCategorias.forEach(cat => obj[cat] = 0);
      return obj;
    });

    transacoes.forEach(t => {
      const valor = parseFloat(t.valor);
      
      if (t.tipo === 'Gastos mensais fixos') {
        const idxInicio = LISTA_MESES.indexOf(t.mesReferente);
        const idxFim = t.mesFim ? LISTA_MESES.indexOf(t.mesFim) : 12;
        
        base.forEach((m, idx) => {
          if (idx >= idxInicio && idx < idxFim) {
            m[t.categoria] = (m[t.categoria] || 0) + valor;
            m.valorTotal += valor;
          }
        });
      } else {
        // Agrupamento Estrito Sem Fracionamento em Memória
        const idx = LISTA_MESES.indexOf(t.mesReferente);
        if (idx !== -1) {
          base[idx][t.categoria] = (base[idx][t.categoria] || 0) + valor;
          base[idx].valorTotal += valor;
        }
      }
    });
    return base;
  }, [transacoes, nomesCategorias]);

  const dadosPizza = useMemo(() => {
    const mesData = dadosMensaisAgrupados[mesSelecionado];
    return nomesCategorias
      .map(cat => ({ name: cat, value: mesData[cat] }))
      .filter(item => item.value > 0);
  }, [dadosMensaisAgrupados, mesSelecionado, nomesCategorias]);

  return (
    <div className="dashboard-metrics">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2.5rem', marginTop: '1rem' }}>
        
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