import { useEffect, useState, useMemo } from 'react';
import { MESES, apareceNoPeriodo, anosDisponiveis, chavePago } from './periodo';

export default function Listagem() {
  const [transacoes, setTransacoes] = useState([]);
  const [mesSelecionado, setMesSelecionado] = useState(() => MESES[new Date().getMonth()]);
  const [anoSelecionado, setAnoSelecionado] = useState(() => new Date().getFullYear());

  useEffect(() => {
    let ativo = true;
    (async () => {
      try {
        const data = await window.api.listarTransacoes();
        if (!ativo) return;
        setTransacoes(data.sort((a, b) => new Date(b.data) - new Date(a.data)));
      } catch (err) {
        console.error('Erro ao carregar transações:', err);
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
  const valorSemFixas = useMemo(() => transacoesFiltradas.filter(t => t.tipo !== 'Gastos mensais fixos' && t.tipo !== 'Investimentos').reduce((acc, curr) => acc + curr.valor, 0), [transacoesFiltradas]);
  const valorInvestimentos = useMemo(() => transacoesFiltradas.filter(t => t.tipo === 'Investimentos').reduce((acc, curr) => acc + curr.valor, 0), [transacoesFiltradas]);
  const valorCredito = useMemo(() => transacoesFiltradas.filter(t => t.formaPagamento === 'Crédito').reduce((acc, curr) => acc + curr.valor, 0), [transacoesFiltradas]);
  const valorDebito = useMemo(() => transacoesFiltradas.filter(t => t.formaPagamento === 'Débito').reduce((acc, curr) => acc + curr.valor, 0), [transacoesFiltradas]);

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
        <h2 style={{ margin: 0 }}>Visualizar Contas</h2>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', flexWrap: 'wrap' }}>
          <label className="input-group" style={{ flexDirection: 'row', alignItems: 'center', gap: '0.75rem', width: 'auto', fontSize: '1.2rem' }}>
            Mês:
            <select
              className="input-field"
              style={{ width: '180px', fontSize: '1.1rem', padding: '0.5rem' }}
              value={mesSelecionado}
              onChange={e => setMesSelecionado(e.target.value)}
            >
              {MESES.map(mes => <option key={mes} value={mes}>{mes}</option>)}
            </select>
          </label>
          <label className="input-group" style={{ flexDirection: 'row', alignItems: 'center', gap: '0.75rem', width: 'auto', fontSize: '1.2rem' }}>
            Ano:
            <select
              className="input-field"
              style={{ width: '110px', fontSize: '1.1rem', padding: '0.5rem' }}
              value={anoSelecionado}
              onChange={e => setAnoSelecionado(parseInt(e.target.value, 10))}
            >
              {anosDisp.map(ano => <option key={ano} value={ano}>{ano}</option>)}
            </select>
          </label>
        </div>
      </div>

      <div style={{ overflowX: 'auto', width: '100%' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '1.1rem', minWidth: '800px' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #e5e7eb', textAlign: 'left' }}>
              <th style={{ padding: '1rem', whiteSpace: 'nowrap' }}>Data</th>
              <th style={{ padding: '1rem' }}>Tipo</th>
              <th style={{ padding: '1rem' }}>Categoria</th>
              <th style={{ padding: '1rem' }}>Forma</th>
              <th style={{ padding: '1rem', whiteSpace: 'nowrap' }}>Valor</th>
              <th style={{ padding: '1rem', textAlign: 'center', whiteSpace: 'nowrap' }}>Status</th>
              <th style={{ padding: '1rem' }}>Comentário</th>
              <th style={{ padding: '1rem', whiteSpace: 'nowrap' }}>Ação</th>
            </tr>
          </thead>
          <tbody>
            {transacoesFiltradas.map(t => {
              let dataExibida = t.data.split('-').reverse().join('/');
              let descCategoria = t.categoria;

              // Alteração visual da data apenas para fixas projetadas (usa o mês/ano selecionado)
              if (t.tipo === 'Gastos mensais fixos' && t.mesReferente !== mesSelecionado) {
                const digitoMes = String(MESES.indexOf(mesSelecionado) + 1).padStart(2, '0');
                dataExibida = `01/${digitoMes}/${anoSelecionado}`;
              }

              // Concatenação de string com a chave 'parcelaAtual' salva na Inserção
              if (t.tipo === 'Entradas no cartão' && t.parcelas > 1 && t.parcelaAtual) {
                descCategoria = `${t.categoria} (Parc. ${t.parcelaAtual}/${t.parcelas})`;
              }

              // Pago: aceita a chave year-aware (Mês/Ano) e o formato antigo (só o mês)
              const chaveAtual = chavePago(mesSelecionado, anoSelecionado);
              const isPago = t.mesesPagos
                ? (t.mesesPagos.includes(chaveAtual) || t.mesesPagos.includes(mesSelecionado))
                : !!t.pago;
              const isDebito = t.formaPagamento === 'Débito';

              return (
                <tr key={t.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td style={{ padding: '1rem', whiteSpace: 'nowrap' }}>{dataExibida}</td>
                  <td style={{ padding: '1rem' }}>{t.tipo}</td>
                  <td style={{ padding: '1rem' }}>{descCategoria}</td>
                  <td style={{ padding: '1rem', whiteSpace: 'nowrap' }}>
                    <span className={`badge ${isDebito ? 'badge-debito' : 'badge-credito'}`}>
                      {t.formaPagamento || 'Crédito'}
                    </span>
                  </td>
                  <td style={{ padding: '1rem', whiteSpace: 'nowrap', fontWeight: '500' }}>
                    R$ {t.valor.toFixed(2)}
                  </td>
                  
                  <td style={{ padding: '1rem', textAlign: 'center', whiteSpace: 'nowrap' }}>
                    <button 
                      onClick={() => handleTogglePago(t)}
                      style={{ 
                        padding: '0.4rem 0.8rem', 
                        borderRadius: '8px', 
                        border: 'none', 
                        cursor: 'pointer', 
                        fontWeight: 'bold', 
                        backgroundColor: isPago ? '#22c55e' : '#e5e7eb',
                        color: isPago ? '#ffffff' : '#4b5563',
                        transition: 'all 0.3s'
                      }}
                      title="Clique para alternar o status deste mês"
                    >
                      {isPago ? 'Pago ✓' : 'Pendente'}
                    </button>
                  </td>

                  <td style={{ padding: '1rem', color: '#6b7280', fontSize: '0.95rem' }}>
                    {t.comentario || '-'}
                  </td>

                  <td style={{ padding: '1rem', whiteSpace: 'nowrap' }}>
                    <button onClick={() => handleExcluirOuCancelar(t)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.5rem', color: '#dc2626' }}>
                      🗑️
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
          
          <tfoot>
            <tr style={{ backgroundColor: '#f8fafc', borderTop: '2px solid #cbd5e1' }}>
              <td colSpan="5" style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: 'bold' }}>Somatório Total ({mesSelecionado}/{anoSelecionado}):</td>
              <td colSpan="3" style={{ padding: '0.75rem 1rem', fontWeight: 'bold', fontSize: '1.2rem', color: '#2563eb', whiteSpace: 'nowrap' }}>R$ {valorTotal.toFixed(2)}</td>
            </tr>
            <tr style={{ backgroundColor: '#f8fafc', borderTop: '1px solid #e2e8f0' }}>
              <td colSpan="5" style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: 'bold' }}>Somatório (Sem Fixas / Investimentos):</td>
              <td colSpan="3" style={{ padding: '0.75rem 1rem', fontWeight: 'bold', color: '#0f766e', whiteSpace: 'nowrap' }}>R$ {valorSemFixas.toFixed(2)}</td>
            </tr>
            <tr style={{ backgroundColor: '#f8fafc', borderTop: '1px solid #e2e8f0' }}>
              <td colSpan="5" style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: 'bold' }}>Somatório de Investimentos:</td>
              <td colSpan="3" style={{ padding: '0.75rem 1rem', fontWeight: 'bold', color: '#b45309', whiteSpace: 'nowrap' }}>R$ {valorInvestimentos.toFixed(2)}</td>
            </tr>
            <tr style={{ backgroundColor: '#fdf2f8', borderTop: '1px solid #fbcfe8' }}>
              <td colSpan="5" style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: 'bold', color: '#9d174d' }}>Total em Cartão de Crédito:</td>
              <td colSpan="3" style={{ padding: '0.75rem 1rem', fontWeight: 'bold', color: '#db2777', whiteSpace: 'nowrap' }}>R$ {valorCredito.toFixed(2)}</td>
            </tr>
            <tr style={{ backgroundColor: '#f0fdf4', borderTop: '1px solid #bbf7d0' }}>
              <td colSpan="5" style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: 'bold', color: '#166534' }}>Total em Débito / Pix:</td>
              <td colSpan="3" style={{ padding: '0.75rem 1rem', fontWeight: 'bold', color: '#16a34a', whiteSpace: 'nowrap' }}>R$ {valorDebito.toFixed(2)}</td>
            </tr>
          </tfoot>
        </table>
        
        {transacoesFiltradas.length === 0 && (
          <p style={{ textAlign: 'center', padding: '3rem', color: '#6b7280', fontSize: '1.2rem' }}>Nenhum registro localizado para {mesSelecionado}/{anoSelecionado}.</p>
        )}
      </div>
    </div>
  );
}