import { useState, useEffect } from 'react';
import { MESES } from './periodo';

const ANO_ATUAL = new Date().getFullYear();
const ANOS = Array.from({ length: 8 }, (_, i) => ANO_ATUAL - 1 + i);
const fmtReal = (v) => `R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function GanhosMes() {
  const hoje = new Date();
  const [ganhos, setGanhos] = useState([]);
  const [form, setForm] = useState({
    valor: '',
    mesReferente: MESES[hoje.getMonth()],
    anoReferente: hoje.getFullYear(),
    comentario: ''
  });

  const carregar = async () => {
    try {
      const dados = await window.api.listarGanhos();
      setGanhos(dados);
    } catch (err) {
      console.error('Erro ao carregar ganhos:', err);
    }
  };

  useEffect(() => {
    let ativo = true;
    (async () => {
      try {
        const dados = await window.api.listarGanhos();
        if (ativo) setGanhos(dados);
      } catch (err) {
        console.error('Erro ao carregar ganhos:', err);
      }
    })();
    return () => { ativo = false; };
  }, []);

  const handleAdicionar = async (e) => {
    e.preventDefault();
    const valor = parseFloat(form.valor);
    if (!valor || valor <= 0) return;
    try {
      await window.api.inserirGanho({
        valor,
        mesReferente: form.mesReferente,
        anoReferente: form.anoReferente,
        comentario: form.comentario,
        data: new Date().toISOString().split('T')[0]
      });
      setForm(prev => ({ ...prev, valor: '', comentario: '' }));
      await carregar();
    } catch (err) {
      console.error('Erro ao adicionar ganho:', err);
    }
  };

  const handleExcluir = async (g) => {
    if (!window.confirm('Remover este ganho?')) return;
    try {
      await window.api.excluirGanho(g.id);
      setGanhos(prev => prev.filter(x => x.id !== g.id));
    } catch (err) {
      console.error('Erro ao excluir ganho:', err);
    }
  };

  // Ganhos do mês/ano atualmente selecionado no formulário
  const doMes = ganhos.filter(g => g.mesReferente === form.mesReferente && g.anoReferente === form.anoReferente);
  const subtotal = doMes.reduce((acc, g) => acc + g.valor, 0);

  return (
    <form onSubmit={handleAdicionar} className="card" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <div>
        <h2 style={{ margin: 0 }}>Ganhos do mês</h2>
        <p style={{ margin: '0.25rem 0 0', color: 'var(--color-text-secondary)', fontSize: '0.9rem' }}>
          Registre quanto você recebeu no mês (salário, freela, etc.). Pode adicionar mais de um por mês.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '1.25rem' }}>
        <label className="input-group">
          <span className="input-label">Valor recebido (R$)</span>
          <input type="number" step="0.01" className="input-field" value={form.valor} onChange={e => setForm({ ...form, valor: e.target.value })} placeholder="0,00" />
        </label>
        <label className="input-group">
          <span className="input-label">Mês</span>
          <select className="input-field" value={form.mesReferente} onChange={e => setForm({ ...form, mesReferente: e.target.value })}>
            {MESES.map(mes => <option key={mes} value={mes}>{mes}</option>)}
          </select>
        </label>
        <label className="input-group">
          <span className="input-label">Ano</span>
          <select className="input-field" value={form.anoReferente} onChange={e => setForm({ ...form, anoReferente: parseInt(e.target.value, 10) })}>
            {ANOS.map(ano => <option key={ano} value={ano}>{ano}</option>)}
          </select>
        </label>
      </div>

      <label className="input-group">
        <span className="input-label">Descrição (opcional)</span>
        <input type="text" className="input-field" value={form.comentario} onChange={e => setForm({ ...form, comentario: e.target.value })} placeholder="Ex.: Salário, freelance..." />
      </label>

      <button type="submit" className="btn btn-primary" style={{ alignSelf: 'flex-start', padding: '0.7rem 1.4rem' }}>
        Adicionar ganho
      </button>

      {/* Lista dos ganhos do mês/ano selecionado */}
      <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: '1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
          <span className="metric-label">Ganhos em {form.mesReferente} de {form.anoReferente}</span>
          <span style={{ fontWeight: 600, color: 'var(--color-accent-text)' }}>{fmtReal(subtotal)}</span>
        </div>

        {doMes.length === 0 ? (
          <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.9rem' }}>Nenhum ganho registrado neste mês.</p>
        ) : (
          <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            {doMes.map(g => (
              <li key={g.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.6rem 0.85rem', background: 'var(--color-bg-muted)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)' }}>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontWeight: 500, color: 'var(--color-accent-text)' }}>{fmtReal(g.valor)}</span>
                  {g.comentario && <span style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>{g.comentario}</span>}
                </div>
                <button
                  type="button"
                  onClick={() => handleExcluir(g)}
                  title="Remover ganho"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-danger)', display: 'inline-flex' }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M10 11v6M14 11v6" />
                  </svg>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </form>
  );
}
