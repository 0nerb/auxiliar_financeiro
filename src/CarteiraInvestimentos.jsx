import { useState, useEffect, useMemo } from 'react';
import { useConfirm } from './confirmContext';

const fmtReal = (v) => `R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtPct = (v) => `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`;
const corVar = (v) => (v >= 0 ? 'var(--color-accent-text)' : 'var(--color-danger-text)');

// Componente reutilizável de carteira, parametrizado pela classe.
// historicoDisponivel=false (Tesouro): não busca preço histórico; o preço pago é obrigatório.
// mostrarDividendos=true (FIIs): calcula dividendos/DY e inclui na rentabilidade.
export default function CarteiraInvestimentos({ classe, rotulo, historicoDisponivel = true, mostrarDividendos = false }) {
  const confirmar = useConfirm();
  const hoje = new Date().toISOString().split('T')[0];

  const [ativos, setAtivos] = useState([]);       // lista cacheada de ativos disponíveis
  const [ultimaAtt, setUltimaAtt] = useState(null);
  const [atualizando, setAtualizando] = useState(false);

  const [carteira, setCarteira] = useState([]);
  const [cotacoes, setCotacoes] = useState({});   // ticker -> { carregando, precoAtual, erro }
  const [dividendos, setDividendos] = useState({}); // holdingId -> { porCota, quantidade }
  const [refreshTick, setRefreshTick] = useState(0); // força re-buscar cotações

  const [busca, setBusca] = useState('');
  const [sel, setSel] = useState(null);           // ativo selecionado { ticker, nome }
  const [form, setForm] = useState({ quantidade: '', dataCompra: hoje, precoCompra: '', comentario: '' });
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState(null);

  const carregarTudo = async () => {
    try {
      const [lista, att, cart] = await Promise.all([
        window.api.listarAtivosCache(classe),
        window.api.ultimaAtualizacaoLista(classe),
        window.api.listarCarteira(classe)
      ]);
      setAtivos(lista);
      setUltimaAtt(att);
      setCarteira(cart);
    } catch (err) {
      console.error('Erro ao carregar carteira:', err);
    }
  };

  useEffect(() => {
    let ativo = true;
    (async () => {
      try {
        const [lista, att, cart] = await Promise.all([
          window.api.listarAtivosCache(classe),
          window.api.ultimaAtualizacaoLista(classe),
          window.api.listarCarteira(classe)
        ]);
        if (!ativo) return;
        // Reseta o estado da classe anterior e aplica os dados novos
        setBusca('');
        setSel(null);
        setCotacoes({});
        setAtivos(lista);
        setUltimaAtt(att);
        setCarteira(cart);
      } catch (err) {
        console.error('Erro ao carregar carteira:', err);
      }
    })();
    return () => { ativo = false; };
  }, [classe]);

  // Busca a cotação atual de cada ticker da carteira (re-busca quando refreshTick muda)
  useEffect(() => {
    const tickers = [...new Set(carteira.map(c => c.ticker))];
    tickers.forEach(async (ticker) => {
      try {
        const cot = await window.api.cotacaoAtual(ticker, classe);
        setCotacoes(prev => ({ ...prev, [ticker]: { carregando: false, precoAtual: cot.preco } }));
      } catch {
        setCotacoes(prev => ({ ...prev, [ticker]: { carregando: false, erro: true } }));
      }
    });
  }, [carteira, classe, refreshTick]);

  // Dividendos por ativo desde a compra (só para FIIs/ações)
  useEffect(() => {
    if (!mostrarDividendos) return;
    carteira.forEach(async (c) => {
      // meses desde a compra (calculado aqui, fora do render, para o DY médio mensal)
      const meses = Math.max(1, (Date.now() - new Date(c.dataCompra + 'T00:00:00').getTime()) / (30 * 86400000));
      try {
        const div = await window.api.dividendos(c.ticker, classe, c.dataCompra);
        setDividendos(prev => ({ ...prev, [c.id]: { ...div, meses } }));
      } catch {
        setDividendos(prev => ({ ...prev, [c.id]: { porCota: 0, quantidade: 0, meses } }));
      }
    });
  }, [carteira, classe, mostrarDividendos]);

  const matches = useMemo(() => {
    const q = busca.trim().toUpperCase();
    if (!q) return [];
    return ativos
      .filter(a => a.ticker.toUpperCase().includes(q) || (a.nome || '').toUpperCase().includes(q))
      .slice(0, 12);
  }, [busca, ativos]);

  const handleAtualizarLista = async () => {
    setAtualizando(true);
    setErro(null);
    try {
      await window.api.atualizarListaAtivos(classe);
      const [lista, att] = await Promise.all([
        window.api.listarAtivosCache(classe),
        window.api.ultimaAtualizacaoLista(classe)
      ]);
      setAtivos(lista);
      setUltimaAtt(att);
      setRefreshTick(t => t + 1); // re-busca as cotações (importante p/ Tesouro, cujo preço vem da lista)
    } catch (err) {
      console.error('Erro ao atualizar lista:', err);
      setErro('Não foi possível atualizar a lista. Verifique sua conexão.');
    } finally {
      setAtualizando(false);
    }
  };

  const handleAdicionar = async (e) => {
    e.preventDefault();
    if (!sel) { setErro('Selecione um ativo na busca.'); return; }
    const quantidade = parseFloat(form.quantidade);
    if (!quantidade || quantidade <= 0) { setErro('Informe a quantidade.'); return; }

    let precoCompra = parseFloat(form.precoCompra);
    // Tesouro não tem histórico automático — exige o preço pago
    if (!historicoDisponivel && (!precoCompra || precoCompra <= 0)) {
      setErro('Para o Tesouro, informe o preço que você pagou no título.');
      return;
    }

    setSalvando(true);
    setErro(null);
    try {
      // Preço de compra: usa o informado, ou busca o fechamento do dia da compra
      if (!precoCompra || precoCompra <= 0) {
        const info = await window.api.precoNaData(sel.ticker, classe, form.dataCompra);
        precoCompra = info.preco;
      }
      await window.api.inserirCarteira({
        classe,
        ticker: sel.ticker,
        nome: sel.nome,
        quantidade,
        precoCompra,
        dataCompra: form.dataCompra,
        comentario: form.comentario
      });
      await carregarTudo();
      setSel(null);
      setBusca('');
      setForm({ quantidade: '', dataCompra: hoje, precoCompra: '', comentario: '' });
    } catch (err) {
      console.error('Erro ao adicionar ativo:', err);
      setErro('Não foi possível buscar o preço/adicionar o ativo. Tente novamente.');
    } finally {
      setSalvando(false);
    }
  };

  const handleExcluir = async (item) => {
    if (!(await confirmar(`Remover ${item.ticker} da carteira?`))) return;
    try {
      await window.api.excluirCarteira(item.id);
      setCarteira(prev => prev.filter(c => c.id !== item.id));
    } catch (err) {
      console.error('Erro ao remover ativo:', err);
    }
  };

  // Enriquecimento de cada linha (cotação, variação, dividendos, rentabilidade total)
  const linhas = useMemo(() => carteira.map(c => {
    const cot = cotacoes[c.ticker] || {};
    const precoAtual = cot.precoAtual;
    const investido = c.precoCompra * c.quantidade;
    const valorAtual = precoAtual != null ? precoAtual * c.quantidade : null;
    const variacaoPreco = precoAtual != null && c.precoCompra > 0 ? ((precoAtual - c.precoCompra) / c.precoCompra) * 100 : null;
    const info = dividendos[c.id];
    const divPorCota = info?.porCota || 0;
    const meses = info?.meses || 1;
    const dividendosRecebidos = divPorCota * c.quantidade;
    const dyMedioMensal = mostrarDividendos && c.precoCompra > 0 && info ? (divPorCota / meses) / c.precoCompra * 100 : null;
    const rentabilidadeTotal = precoAtual != null && c.precoCompra > 0
      ? (((precoAtual - c.precoCompra) + (mostrarDividendos ? divPorCota : 0)) / c.precoCompra) * 100
      : null;
    return { ...c, precoAtual, carregando: cot.carregando, erro: cot.erro, investido, valorAtual, variacaoPreco, divPorCota, dividendosRecebidos, dyMedioMensal, rentabilidadeTotal };
  }), [carteira, cotacoes, dividendos, mostrarDividendos]);

  // Totais da carteira
  const totais = useMemo(() => {
    let investido = 0, atual = 0, proventos = 0, temTudo = true;
    linhas.forEach(l => {
      investido += l.investido;
      if (l.valorAtual != null) atual += l.valorAtual; else temTudo = false;
      proventos += l.dividendosRecebidos;
    });
    const ganho = temTudo ? (atual - investido + (mostrarDividendos ? proventos : 0)) : null;
    const rentabilidade = investido > 0 && ganho != null ? (ganho / investido) * 100 : null;
    return { investido, atual, proventos, rentabilidade, temTudo };
  }, [linhas, mostrarDividendos]);

  const dataAttTexto = ultimaAtt
    ? new Date(ultimaAtt).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', maxWidth: '960px' }}>

      {/* Cabeçalho + atualizar lista */}
      <div className="card card-compact" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <p className="metric-label">Lista de {rotulo}</p>
          <h2 style={{ margin: '0.15rem 0 0' }}>
            {ativos.length > 0 ? `${ativos.length} ativos disponíveis` : 'Lista ainda não baixada'}
          </h2>
          {dataAttTexto && <p style={{ margin: '0.2rem 0 0', fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>Atualizada em {dataAttTexto}</p>}
        </div>
        <button type="button" className="btn btn-ghost" onClick={handleAtualizarLista} disabled={atualizando}>
          {atualizando ? 'Atualizando...' : (ativos.length > 0 ? 'Atualizar lista' : 'Baixar lista')}
        </button>
      </div>

      {/* Totais da carteira */}
      {carteira.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '1rem' }}>
          <div className="metric-card">
            <span className="metric-label">Investido</span>
            <span className="metric-value">{fmtReal(totais.investido)}</span>
          </div>
          <div className="metric-card">
            <span className="metric-label">Valor atual</span>
            <span className="metric-value">{totais.temTudo ? fmtReal(totais.atual) : '...'}</span>
          </div>
          {mostrarDividendos && (
            <div className="metric-card">
              <span className="metric-label">Proventos recebidos</span>
              <span className="metric-value" style={{ color: 'var(--color-accent-text)' }}>{fmtReal(totais.proventos)}</span>
            </div>
          )}
          <div className="metric-card">
            <span className="metric-label">{mostrarDividendos ? 'Rentabilidade (c/ proventos)' : 'Variação total'}</span>
            <span className="metric-value" style={{ color: totais.rentabilidade == null ? 'var(--color-text-secondary)' : corVar(totais.rentabilidade) }}>
              {totais.rentabilidade == null ? '...' : fmtPct(totais.rentabilidade)}
            </span>
          </div>
        </div>
      )}

      {/* Adicionar ativo */}
      <form onSubmit={handleAdicionar} className="card" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <h2 style={{ margin: 0 }}>Adicionar ativo à carteira</h2>

        {ativos.length === 0 ? (
          <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.9rem' }}>
            Baixe a lista de {rotulo} primeiro (botão acima) para poder buscar e adicionar ativos.
          </p>
        ) : (
          <>
            <div className="input-group" style={{ position: 'relative' }}>
              <span className="input-label">Buscar ativo (código ou nome)</span>
              <input
                type="text"
                className="input-field"
                placeholder="Ex.: PETR4, Vale, HGLG11..."
                value={sel ? `${sel.ticker} — ${sel.nome}` : busca}
                onChange={e => { setSel(null); setBusca(e.target.value); }}
              />
              {!sel && matches.length > 0 && (
                <ul style={{ listStyle: 'none', position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 5, marginTop: 4, maxHeight: 240, overflowY: 'auto', background: 'var(--color-bg-surface)', border: '1px solid var(--color-border-strong)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-md)' }}>
                  {matches.map(a => (
                    <li key={a.ticker}>
                      <button
                        type="button"
                        onClick={() => { setSel({ ticker: a.ticker, nome: a.nome }); setBusca(''); }}
                        style={{ width: '100%', textAlign: 'left', background: 'none', border: 'none', padding: '0.6rem 0.85rem', cursor: 'pointer', color: 'var(--color-text-primary)', display: 'flex', justifyContent: 'space-between', gap: '0.5rem' }}
                      >
                        <span style={{ fontWeight: 500 }}>{a.ticker}</span>
                        <span style={{ color: 'var(--color-text-secondary)', fontSize: '0.85rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.nome}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '1rem' }}>
              <label className="input-group">
                <span className="input-label">Quantidade</span>
                <input type="number" step="any" className="input-field" value={form.quantidade} onChange={e => setForm({ ...form, quantidade: e.target.value })} placeholder="0" />
              </label>
              <label className="input-group">
                <span className="input-label">Data da compra</span>
                <input type="date" className="input-field" value={form.dataCompra} onChange={e => setForm({ ...form, dataCompra: e.target.value })} />
              </label>
              <label className="input-group">
                <span className="input-label">{historicoDisponivel ? 'Preço pago (opcional)' : 'Preço pago (R$)'}</span>
                <input type="number" step="0.01" className="input-field" value={form.precoCompra} onChange={e => setForm({ ...form, precoCompra: e.target.value })} placeholder={historicoDisponivel ? 'cotação do dia' : 'obrigatório'} />
              </label>
            </div>

            <button type="submit" className="btn btn-primary" style={{ alignSelf: 'flex-start', padding: '0.7rem 1.4rem' }} disabled={salvando}>
              {salvando ? 'Buscando preço...' : 'Adicionar'}
            </button>
          </>
        )}
      </form>

      {erro && (
        <div className="badge badge-danger" style={{ alignSelf: 'flex-start', padding: '0.5rem 0.9rem', fontSize: '0.85rem' }}>{erro}</div>
      )}

      {/* Carteira */}
      {carteira.length > 0 && (
        <div className="table-wrap">
          <table className="t-financeiro">
            <thead>
              <tr>
                <th>Ativo</th>
                <th>Qtd</th>
                <th>Preço compra</th>
                <th>Preço atual</th>
                <th>Valor atual</th>
                {mostrarDividendos && <th title="Dividend yield médio mensal desde a compra">DY méd./mês</th>}
                <th>{mostrarDividendos ? 'Rentabilidade' : 'Variação'}</th>
                <th style={{ textAlign: 'center' }}>Ação</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map(l => (
                <tr key={l.id}>
                  <td>
                    <div style={{ fontWeight: 500 }}>{l.ticker}</div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.nome}</div>
                  </td>
                  <td>{l.quantidade}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>{fmtReal(l.precoCompra)}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {l.carregando ? '...' : l.erro ? '—' : fmtReal(l.precoAtual)}
                  </td>
                  <td style={{ whiteSpace: 'nowrap', fontWeight: 500 }}>
                    {l.valorAtual != null ? fmtReal(l.valorAtual) : '...'}
                  </td>
                  {mostrarDividendos && (
                    <td style={{ whiteSpace: 'nowrap', color: 'var(--color-accent-text)' }} title={`Proventos recebidos: ${fmtReal(l.dividendosRecebidos)}`}>
                      {l.dyMedioMensal != null ? `${l.dyMedioMensal.toFixed(2)}%` : '...'}
                    </td>
                  )}
                  <td style={{ whiteSpace: 'nowrap', fontWeight: 500, color: l.rentabilidadeTotal != null ? corVar(l.rentabilidadeTotal) : 'var(--color-text-secondary)' }}>
                    {l.rentabilidadeTotal != null ? fmtPct(l.rentabilidadeTotal) : '...'}
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <button type="button" onClick={() => handleExcluir(l)} title="Remover" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-danger)', display: 'inline-flex' }}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M10 11v6M14 11v6" />
                      </svg>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.8rem', textAlign: 'center' }}>
        Cotações e histórico via Yahoo Finance; lista de ativos via brapi.dev. Valores podem ter atraso e são apenas informativos.
      </p>
    </div>
  );
}
