import { useState, useEffect, useMemo } from 'react';

const CDI_PADRAO = 11.15; // % a.a. — usuário pode ajustar conforme a Selic
const fmtReal = (v) => `R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Calcula rendimento BRUTO (sem IR e sem IOF) com juros compostos diários e dias corridos.
//   valor          → quanto está guardado
//   percentualCdi  → ex.: 100 = rende 100% do CDI
//   cdiAnual       → taxa CDI a.a. em decimal (ex.: 0.1115 para 11,15%)
//   dias           → dias corridos
function rendimentoComposto(valor, percentualCdi, cdiAnual, dias) {
  if (valor <= 0 || dias <= 0) return 0;
  const taxaAnualEfetiva = cdiAnual * (percentualCdi / 100);
  const taxaDiaria = Math.pow(1 + taxaAnualEfetiva, 1 / 365) - 1;
  return valor * (Math.pow(1 + taxaDiaria, dias) - 1);
}

function diasDesde(dataIso) {
  if (!dataIso) return 0;
  const inicio = new Date(dataIso + 'T00:00:00');
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const ms = hoje - inicio;
  return Math.max(0, Math.floor(ms / 86400000));
}

export default function Cofrinhos() {
  const [cofrinhos, setCofrinhos] = useState([]);
  const [cdiAnual, setCdiAnual] = useState(CDI_PADRAO); // em %
  const [cdiEditando, setCdiEditando] = useState(String(CDI_PADRAO));
  const [buscandoTaxa, setBuscandoTaxa] = useState(false);
  const [resultadoApi, setResultadoApi] = useState(null); // { valor, buscadaEm } | { erro }

  const hoje = new Date().toISOString().split('T')[0];
  const [form, setForm] = useState({
    nome: '',
    valor: '',
    percentualCdi: '100',
    dataDeposito: hoje,
    comentario: ''
  });

  // Edição inline: id do cofrinho em edição + cópia editável dos campos
  const [editandoId, setEditandoId] = useState(null);
  const [formEdit, setFormEdit] = useState(null);

  // Carrega dados iniciais (cofrinhos + taxa CDI salva)
  useEffect(() => {
    let ativo = true;
    (async () => {
      try {
        const [lista, cdiSalvo] = await Promise.all([
          window.api.listarCofrinhos(),
          window.api.getConfig('cdiAnual')
        ]);
        if (!ativo) return;
        setCofrinhos(lista);
        if (cdiSalvo) {
          const n = parseFloat(cdiSalvo);
          if (!Number.isNaN(n)) {
            setCdiAnual(n);
            setCdiEditando(String(n));
          }
        }
      } catch (err) {
        console.error('Erro ao carregar cofrinhos:', err);
      }
    })();
    return () => { ativo = false; };
  }, []);

  const handleSalvarCdi = async (e) => {
    e.preventDefault();
    const n = parseFloat(cdiEditando.replace(',', '.'));
    if (Number.isNaN(n) || n < 0) return;
    try {
      await window.api.setConfig('cdiAnual', n);
      setCdiAnual(n);
    } catch (err) {
      console.error('Erro ao salvar CDI:', err);
    }
  };

  // Busca a taxa CDI atual na Brasil API (https://brasilapi.com.br/api/taxas/v1/CDI)
  // Preenche o input automaticamente — usuário ainda precisa clicar "Atualizar" para salvar
  const handleBuscarTaxa = async () => {
    setBuscandoTaxa(true);
    setResultadoApi(null);
    try {
      const res = await fetch('https://brasilapi.com.br/api/taxas/v1/CDI');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const valor = parseFloat(data?.valor);
      if (!Number.isFinite(valor)) throw new Error('Resposta inválida');
      setCdiEditando(String(valor));
      setResultadoApi({ valor, buscadaEm: new Date() });
    } catch (err) {
      console.error('Erro ao buscar CDI na Brasil API:', err);
      setResultadoApi({ erro: 'Não foi possível buscar a taxa. Verifique sua conexão.' });
    } finally {
      setBuscandoTaxa(false);
    }
  };

  const handleAdicionar = async (e) => {
    e.preventDefault();
    const valor = parseFloat(form.valor);
    const percentualCdi = parseFloat(form.percentualCdi);
    if (!form.nome.trim() || !valor || valor <= 0 || Number.isNaN(percentualCdi)) return;
    try {
      const novo = await window.api.inserirCofrinho({
        nome: form.nome.trim(),
        valor,
        percentualCdi,
        dataDeposito: form.dataDeposito,
        comentario: form.comentario
      });
      setCofrinhos(prev => [...prev, novo]);
      setForm({ nome: '', valor: '', percentualCdi: '100', dataDeposito: hoje, comentario: '' });
    } catch (err) {
      console.error('Erro ao adicionar cofrinho:', err);
    }
  };

  const handleExcluir = async (c) => {
    if (!window.confirm(`Remover o cofrinho "${c.nome}"?`)) return;
    try {
      await window.api.excluirCofrinho(c.id);
      setCofrinhos(prev => prev.filter(x => x.id !== c.id));
    } catch (err) {
      console.error('Erro ao remover cofrinho:', err);
    }
  };

  const iniciarEdicao = (c) => {
    setEditandoId(c.id);
    setFormEdit({
      nome: c.nome,
      valor: String(c.valor),
      percentualCdi: String(c.percentualCdi),
      dataDeposito: c.dataDeposito,
      comentario: c.comentario || ''
    });
  };

  const cancelarEdicao = () => {
    setEditandoId(null);
    setFormEdit(null);
  };

  const salvarEdicao = async (e) => {
    e.preventDefault();
    const valor = parseFloat(formEdit.valor);
    const percentualCdi = parseFloat(formEdit.percentualCdi);
    if (!formEdit.nome.trim() || !valor || valor <= 0 || Number.isNaN(percentualCdi)) return;
    try {
      const atualizado = await window.api.atualizarCofrinho(editandoId, {
        nome: formEdit.nome.trim(),
        valor,
        percentualCdi,
        dataDeposito: formEdit.dataDeposito,
        comentario: formEdit.comentario
      });
      setCofrinhos(prev => prev.map(x => x.id === editandoId ? atualizado : x));
      cancelarEdicao();
    } catch (err) {
      console.error('Erro ao atualizar cofrinho:', err);
    }
  };

  const cdiDecimal = cdiAnual / 100;

  // Pré-calcula rendimento de cada cofrinho (acumulado e mensal estimado)
  const cofrinhosCalculados = useMemo(() => cofrinhos.map(c => {
    const dias = diasDesde(c.dataDeposito);
    const acumulado = rendimentoComposto(c.valor, c.percentualCdi, cdiDecimal, dias);
    const mensal = rendimentoComposto(c.valor, c.percentualCdi, cdiDecimal, 30);
    const taxaAnualEfetiva = cdiDecimal * (c.percentualCdi / 100) * 100; // em %
    return { ...c, dias, acumulado, mensal, taxaAnualEfetiva };
  }), [cofrinhos, cdiDecimal]);

  const totalGuardado = cofrinhosCalculados.reduce((acc, c) => acc + c.valor, 0);
  const totalAcumulado = cofrinhosCalculados.reduce((acc, c) => acc + c.acumulado, 0);
  const totalMensal = cofrinhosCalculados.reduce((acc, c) => acc + c.mensal, 0);
  const totalAtual = totalGuardado + totalAcumulado;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', maxWidth: '960px' }}>

      {/* Taxa CDI global */}
      <form onSubmit={handleSalvarCdi} className="card card-compact" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <p className="metric-label">Taxa CDI usada nos cálculos</p>
            <h2 style={{ margin: '0.15rem 0 0' }}>{cdiAnual.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}% ao ano</h2>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <input
              type="number"
              step="0.01"
              className="input-field"
              style={{ width: '120px' }}
              value={cdiEditando}
              onChange={e => setCdiEditando(e.target.value)}
            />
            <span style={{ color: 'var(--color-text-secondary)' }}>% a.a.</span>
            <button type="button" className="btn btn-ghost" onClick={handleBuscarTaxa} disabled={buscandoTaxa}>
              {buscandoTaxa ? 'Buscando...' : 'Buscar taxa atual'}
            </button>
            <button type="submit" className="btn btn-primary">Atualizar</button>
          </div>
        </div>

        {/* Feedback da consulta à Brasil API */}
        {resultadoApi && !resultadoApi.erro && (
          <div style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <span className="badge badge-debito">Brasil API</span>
            <span>
              Taxa retornada: <strong style={{ color: 'var(--color-text-primary)' }}>{resultadoApi.valor.toFixed(2)}% a.a.</strong>
            </span>
            <span>· Consultada agora há pouco. Clique em <strong>Atualizar</strong> para salvar.</span>
          </div>
        )}
        {resultadoApi?.erro && (
          <div style={{ fontSize: '0.85rem', color: 'var(--color-danger-text)' }}>{resultadoApi.erro}</div>
        )}
      </form>

      {/* Cards de total */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
        <div className="metric-card">
          <span className="metric-label">Total guardado</span>
          <span className="metric-value">{fmtReal(totalGuardado)}</span>
        </div>
        <div className="metric-card">
          <span className="metric-label">Rendimento acumulado</span>
          <span className="metric-value" style={{ color: 'var(--color-accent-text)' }}>{fmtReal(totalAcumulado)}</span>
        </div>
        <div className="metric-card">
          <span className="metric-label">Saldo total estimado</span>
          <span className="metric-value">{fmtReal(totalAtual)}</span>
        </div>
        <div className="metric-card">
          <span className="metric-label">Rende por mês (estimado)</span>
          <span className="metric-value" style={{ color: 'var(--color-accent-text)' }}>{fmtReal(totalMensal)}</span>
        </div>
      </div>

      {/* Formulário de novo cofrinho */}
      <form onSubmit={handleAdicionar} className="card" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        <div>
          <h2 style={{ margin: 0 }}>Adicionar cofrinho</h2>
          <p style={{ margin: '0.25rem 0 0', color: 'var(--color-text-secondary)', fontSize: '0.9rem' }}>
            Cadastre uma reserva (Nubank, PicPay, Inter...) e o programa calcula quanto ela rendeu até hoje.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1.25rem' }}>
          <label className="input-group">
            <span className="input-label">Nome do cofrinho</span>
            <input type="text" required className="input-field" value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })} placeholder="Ex.: Nubank, PicPay" />
          </label>
          <label className="input-group">
            <span className="input-label">Valor guardado (R$)</span>
            <input type="number" step="0.01" required className="input-field" value={form.valor} onChange={e => setForm({ ...form, valor: e.target.value })} placeholder="0,00" />
          </label>
          <label className="input-group">
            <span className="input-label">Rende quanto do CDI (%)</span>
            <input type="number" step="0.1" required className="input-field" value={form.percentualCdi} onChange={e => setForm({ ...form, percentualCdi: e.target.value })} placeholder="100" />
          </label>
          <label className="input-group">
            <span className="input-label">Data do depósito</span>
            <input type="date" required className="input-field" value={form.dataDeposito} onChange={e => setForm({ ...form, dataDeposito: e.target.value })} />
          </label>
        </div>

        <label className="input-group">
          <span className="input-label">Comentário (opcional)</span>
          <input type="text" className="input-field" value={form.comentario} onChange={e => setForm({ ...form, comentario: e.target.value })} placeholder="Ex.: reserva de emergência" />
        </label>

        <button type="submit" className="btn btn-primary" style={{ alignSelf: 'flex-start', padding: '0.7rem 1.4rem' }}>
          Adicionar cofrinho
        </button>
      </form>

      {/* Lista de cofrinhos */}
      {cofrinhosCalculados.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '2rem', color: 'var(--color-text-secondary)' }}>
          Nenhum cofrinho cadastrado ainda.
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem' }}>
          {cofrinhosCalculados.map(c => {
            // Modo de edição: o card vira um formulário inline
            if (editandoId === c.id && formEdit) {
              return (
                <form key={c.id} onSubmit={salvarEdicao} className="card" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <h3 style={{ margin: 0 }}>Editar cofrinho</h3>

                  <label className="input-group">
                    <span className="input-label">Nome</span>
                    <input type="text" required className="input-field" value={formEdit.nome} onChange={e => setFormEdit({ ...formEdit, nome: e.target.value })} />
                  </label>
                  <label className="input-group">
                    <span className="input-label">Valor guardado (R$)</span>
                    <input type="number" step="0.01" required className="input-field" value={formEdit.valor} onChange={e => setFormEdit({ ...formEdit, valor: e.target.value })} />
                  </label>
                  <label className="input-group">
                    <span className="input-label">Rende quanto do CDI (%)</span>
                    <input type="number" step="0.1" required className="input-field" value={formEdit.percentualCdi} onChange={e => setFormEdit({ ...formEdit, percentualCdi: e.target.value })} />
                  </label>
                  <label className="input-group">
                    <span className="input-label">Data do depósito</span>
                    <input type="date" required className="input-field" value={formEdit.dataDeposito} onChange={e => setFormEdit({ ...formEdit, dataDeposito: e.target.value })} />
                  </label>
                  <label className="input-group">
                    <span className="input-label">Comentário</span>
                    <input type="text" className="input-field" value={formEdit.comentario} onChange={e => setFormEdit({ ...formEdit, comentario: e.target.value })} />
                  </label>

                  <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.25rem' }}>
                    <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>Salvar</button>
                    <button type="button" className="btn btn-ghost" onClick={cancelarEdicao} style={{ flex: 1 }}>Cancelar</button>
                  </div>
                </form>
              );
            }

            // Modo de leitura padrão
            return (
              <div key={c.id} className="card" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
                  <div style={{ minWidth: 0 }}>
                    <h3 style={{ margin: 0 }}>{c.nome}</h3>
                    {c.comentario && (
                      <p style={{ margin: '0.15rem 0 0', color: 'var(--color-text-secondary)', fontSize: '0.85rem' }}>{c.comentario}</p>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: '0.25rem' }}>
                    <button
                      type="button"
                      onClick={() => iniciarEdicao(c)}
                      title="Editar cofrinho"
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-secondary)', display: 'inline-flex', padding: '0.25rem' }}
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleExcluir(c)}
                      title="Remover cofrinho"
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-danger)', display: 'inline-flex', padding: '0.25rem' }}
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M10 11v6M14 11v6" />
                      </svg>
                    </button>
                  </div>
                </div>

                <div>
                  <p className="metric-label">Valor guardado</p>
                  <p style={{ margin: '0.15rem 0 0', fontSize: '1.4rem', fontWeight: 600 }}>{fmtReal(c.valor)}</p>
                </div>

                <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                  <span className="badge badge-debito">{c.percentualCdi}% do CDI</span>
                  <span className="badge badge-muted">{c.taxaAnualEfetiva.toFixed(2)}% a.a.</span>
                  <span className="badge badge-muted">{c.dias} {c.dias === 1 ? 'dia' : 'dias'}</span>
                </div>

                <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: 'var(--color-text-secondary)', fontSize: '0.85rem' }}>Rendeu até hoje</span>
                    <span style={{ fontWeight: 500, color: 'var(--color-accent-text)' }}>{fmtReal(c.acumulado)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: 'var(--color-text-secondary)', fontSize: '0.85rem' }}>Saldo atual estimado</span>
                    <span style={{ fontWeight: 500 }}>{fmtReal(c.valor + c.acumulado)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: 'var(--color-text-secondary)', fontSize: '0.85rem' }}>Rende por mês</span>
                    <span style={{ fontWeight: 500, color: 'var(--color-accent-text)' }}>{fmtReal(c.mensal)}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.8rem', textAlign: 'center', marginTop: '0.5rem' }}>
        Os valores são estimativas (juros compostos diários, dias corridos) e não consideram IR ou IOF.
      </p>
    </div>
  );
}
