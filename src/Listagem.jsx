import { useEffect, useState, useMemo } from 'react';
import { MESES, apareceNoPeriodo, anosDisponiveis, chavePago } from './periodo';

export default function Listagem() {
  const [transacoes, setTransacoes] = useState([]);
  const [ganhos, setGanhos] = useState([]);
  const [mesSelecionado, setMesSelecionado] = useState(() => MESES[new Date().getMonth()]);
  const [anoSelecionado, setAnoSelecionado] = useState(() => new Date().getFullYear());

  useEffect(() => {
    let ativo = true;
    (async () => {
      try {
        const [trans, gans] = await Promise.all([
          window.api.listarTransacoes(),
          window.api.listarGanhos()
        ]);
        if (!ativo) return;
        setTransacoes(trans.sort((a, b) => new Date(b.data) - new Date(a.data)));
        setGanhos(gans);
      } catch (err) {
        console.error('Erro ao carregar dados:', err);
      }
    })();
    return () => { ativo = false; };
  }, []);

  const handleTogglePago = async (transacao) => {
    const mesesPagosAtuais = transacao.mesesPagos || (transacao.pago ? [transacao.mesReferente] : []);
    const chave = chavePago(mesSelecionado, anoSelecionado);
    // Considera pago tanto pela chave year-aware quanto pelo formato antigo (só o mês)
    const estaPago = mesesPagosAtuais.includes(chave) || mesesPagosAtuais.includes(mesSelecionado);

    const novosMesesPagos = estaPago
      ? mesesPagosAtuais.filter(m => m !== chave && m !== mesSelecionado)
      : [...mesesPagosAtuais, chave];

    try {
      await window.api.atualizarTransacao(transacao.id, { mesesPagos: novosMesesPagos });
      setTransacoes(prev => prev.map(t => t.id === transacao.id ? { ...t, mesesPagos: novosMesesPagos } : t));
    } catch (err) {
      console.error('Erro ao atualizar status de pagamento:', err);
    }
  };

  const handleExcluirOuCancelar = async (transacao) => {
    const ehParcelamento = transacao.tipo === 'Entradas no cartão' && transacao.parcelas > 1;

    try {
      if (transacao.tipo === 'Gastos mensais fixos') {
        // Gasto fixo: cancela a partir deste mês/ano (some daqui para frente, preserva o passado)
        if (!window.confirm(`Encerrar este gasto fixo a partir de ${mesSelecionado}/${anoSelecionado}?`)) return;
        await window.api.atualizarTransacao(transacao.id, { mesFim: mesSelecionado, anoFim: anoSelecionado });
        setTransacoes(prev => prev.map(t => t.id === transacao.id ? { ...t, mesFim: mesSelecionado, anoFim: anoSelecionado } : t));
      } else if (ehParcelamento && transacao.grupoId) {
        // Parcelado (novo): remove a compra inteira de uma vez pelo grupo
        if (!window.confirm(`Esta é uma compra parcelada em ${transacao.parcelas}x. Remover TODAS as ${transacao.parcelas} parcelas de uma vez?`)) return;
        await window.api.excluirGrupo(transacao.grupoId);
        setTransacoes(prev => prev.filter(t => t.grupoId !== transacao.grupoId));
      } else if (ehParcelamento) {
        // Parcelado (dado antigo, sem grupo): casa as parcelas irmãs pelas características da compra
        const irmaos = transacoes.filter(t =>
          !t.grupoId &&
          t.tipo === transacao.tipo &&
          t.parcelas === transacao.parcelas &&
          t.categoria === transacao.categoria &&
          t.valor === transacao.valor &&
          t.formaPagamento === transacao.formaPagamento &&
          (t.comentario || '') === (transacao.comentario || '')
        );
        if (!window.confirm(`Compra parcelada em ${transacao.parcelas}x. Foram encontradas ${irmaos.length} parcelas semelhantes. Remover todas de uma vez?`)) return;
        await Promise.all(irmaos.map(t => window.api.excluirTransacao(t.id)));
        const idsRemovidos = new Set(irmaos.map(t => t.id));
        setTransacoes(prev => prev.filter(t => !idsRemovidos.has(t.id)));
      } else {
        // Transação avulsa
        if (!window.confirm("Deseja remover este registro de contas?")) return;
        await window.api.excluirTransacao(transacao.id);
        setTransacoes(prev => prev.filter(t => t.id !== transacao.id));
      }
    } catch (err) {
      console.error('Erro ao remover registro:', err);
    }
  };

  const anosDisp = useMemo(() => anosDisponiveis(transacoes), [transacoes]);

  const transacoesFiltradas = useMemo(() => {
    const indiceSelecionado = MESES.indexOf(mesSelecionado);
    return transacoes.filter(t => apareceNoPeriodo(t, anoSelecionado, indiceSelecionado));
  }, [transacoes, mesSelecionado, anoSelecionado]);

  const valorTotal = useMemo(() => transacoesFiltradas.reduce((acc, curr) => acc + curr.valor, 0), [transacoesFiltradas]);
  const valorInvestimentos = useMemo(() => transacoesFiltradas.filter(t => t.tipo === 'Investimentos').reduce((acc, curr) => acc + curr.valor, 0), [transacoesFiltradas]);
  const valorCredito = useMemo(() => transacoesFiltradas.filter(t => t.formaPagamento === 'Crédito').reduce((acc, curr) => acc + curr.valor, 0), [transacoesFiltradas]);
  const valorDebito = useMemo(() => transacoesFiltradas.filter(t => t.formaPagamento === 'Débito').reduce((acc, curr) => acc + curr.valor, 0), [transacoesFiltradas]);

  // Saldo do mês = ganhos − gastos no mesmo período
  const totalGanhos = useMemo(() =>
    ganhos
      .filter(g => g.mesReferente === mesSelecionado && g.anoReferente === anoSelecionado)
      .reduce((acc, g) => acc + g.valor, 0),
    [ganhos, mesSelecionado, anoSelecionado]
  );
  const saldo = totalGanhos - valorTotal;

  const fmtReal = (v) => `R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

      {/* Filtros */}
      <div className="card card-compact" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <p className="metric-label">Período</p>
          <h2 style={{ margin: '0.15rem 0 0' }}>{mesSelecionado} de {anoSelecionado}</h2>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
          <label className="input-group" style={{ flexDirection: 'row', alignItems: 'center', gap: '0.5rem', width: 'auto' }}>
            <span className="input-label" style={{ margin: 0 }}>Mês</span>
            <select className="input-field" style={{ width: '160px' }} value={mesSelecionado} onChange={e => setMesSelecionado(e.target.value)}>
              {MESES.map(mes => <option key={mes} value={mes}>{mes}</option>)}
            </select>
          </label>
          <label className="input-group" style={{ flexDirection: 'row', alignItems: 'center', gap: '0.5rem', width: 'auto' }}>
            <span className="input-label" style={{ margin: 0 }}>Ano</span>
            <select className="input-field" style={{ width: '100px' }} value={anoSelecionado} onChange={e => setAnoSelecionado(parseInt(e.target.value, 10))}>
              {anosDisp.map(ano => <option key={ano} value={ano}>{ano}</option>)}
            </select>
          </label>
        </div>
      </div>

      {/* Cards de resumo */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '1rem' }}>
        <div className="metric-card">
          <span className="metric-label">Total do mês</span>
          <span className="metric-value">{fmtReal(valorTotal)}</span>
        </div>
        <div className="metric-card">
          <span className="metric-label">Saldo do mês</span>
          <span className="metric-value" style={{ color: saldo >= 0 ? 'var(--color-accent-text)' : 'var(--color-danger-text)' }}>
            {saldo >= 0 ? fmtReal(saldo) : `− ${fmtReal(Math.abs(saldo))}`}
          </span>
          <span style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)' }}>
            {fmtReal(totalGanhos)} − {fmtReal(valorTotal)}
          </span>
        </div>
        <div className="metric-card">
          <span className="metric-label">Investimentos</span>
          <span className="metric-value" style={{ color: 'var(--color-warning-text)' }}>{fmtReal(valorInvestimentos)}</span>
        </div>
        <div className="metric-card">
          <span className="metric-label">Crédito</span>
          <span className="metric-value" style={{ color: 'var(--color-pink-text)' }}>{fmtReal(valorCredito)}</span>
        </div>
        <div className="metric-card">
          <span className="metric-label">Débito / Pix</span>
          <span className="metric-value" style={{ color: 'var(--color-accent-text)' }}>{fmtReal(valorDebito)}</span>
        </div>
      </div>

      {/* Tabela */}
      {transacoesFiltradas.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '3rem', color: 'var(--color-text-secondary)' }}>
          Nenhum registro localizado para {mesSelecionado}/{anoSelecionado}.
        </div>
      ) : (
        <div className="table-wrap">
          <table className="t-financeiro">
            <thead>
              <tr>
                <th>Data</th>
                <th>Tipo</th>
                <th>Categoria</th>
                <th>Forma</th>
                <th>Valor</th>
                <th style={{ textAlign: 'center' }}>Status</th>
                <th>Comentário</th>
                <th style={{ textAlign: 'center' }}>Ação</th>
              </tr>
            </thead>
            <tbody>
              {transacoesFiltradas.map(t => {
                let dataExibida = t.data.split('-').reverse().join('/');
                let descCategoria = t.categoria;

                if (t.tipo === 'Gastos mensais fixos' && t.mesReferente !== mesSelecionado) {
                  const digitoMes = String(MESES.indexOf(mesSelecionado) + 1).padStart(2, '0');
                  dataExibida = `01/${digitoMes}/${anoSelecionado}`;
                }

                if (t.tipo === 'Entradas no cartão' && t.parcelas > 1 && t.parcelaAtual) {
                  descCategoria = `${t.categoria} (${t.parcelaAtual}/${t.parcelas})`;
                }

                const chaveAtual = chavePago(mesSelecionado, anoSelecionado);
                const isPago = t.mesesPagos
                  ? (t.mesesPagos.includes(chaveAtual) || t.mesesPagos.includes(mesSelecionado))
                  : !!t.pago;
                const isDebito = t.formaPagamento === 'Débito';

                return (
                  <tr key={t.id}>
                    <td style={{ whiteSpace: 'nowrap' }}>{dataExibida}</td>
                    <td style={{ color: 'var(--color-text-secondary)' }}>{t.tipo}</td>
                    <td style={{ fontWeight: 500 }}>{descCategoria}</td>
                    <td>
                      <span className={`badge ${isDebito ? 'badge-debito' : 'badge-credito'}`}>
                        {t.formaPagamento || 'Crédito'}
                      </span>
                    </td>
                    <td style={{ whiteSpace: 'nowrap', fontWeight: 500 }}>{fmtReal(t.valor)}</td>
                    <td style={{ textAlign: 'center' }}>
                      <button
                        onClick={() => handleTogglePago(t)}
                        className={`pago-btn ${isPago ? 'pago-btn-on' : 'pago-btn-off'}`}
                        title="Clique para alternar o status deste mês"
                      >
                        {isPago ? 'Pago ✓' : 'Pendente'}
                      </button>
                    </td>
                    <td style={{ color: 'var(--color-text-secondary)', fontSize: '0.85rem' }}>{t.comentario || '—'}</td>
                    <td style={{ textAlign: 'center' }}>
                      <button
                        onClick={() => handleExcluirOuCancelar(t)}
                        title="Remover"
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-danger)', display: 'inline-flex' }}
                      >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M10 11v6M14 11v6" />
                        </svg>
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}