import { useEffect, useState, useMemo } from 'react';
import { MESES, apareceNoPeriodo, anosDisponiveis, chavePago, anoReferenteDe } from './periodo';
import { useConfirm } from './confirmContext';
import EditarLancamento from './EditarLancamento';

export default function Listagem() {
  const confirmar = useConfirm();
  const [transacoes, setTransacoes] = useState([]);
  const [ganhos, setGanhos] = useState([]);
  const [mesSelecionado, setMesSelecionado] = useState(() => MESES[new Date().getMonth()]);
  const [anoSelecionado, setAnoSelecionado] = useState(() => new Date().getFullYear());
  const [categorias, setCategorias] = useState([]);
  const [editando, setEditando] = useState(null); // transação aberta no modal de edição

  const ordenarRecentes = (lista) => [...lista].sort((a, b) => new Date(b.data) - new Date(a.data));

  // Parcelas de uma mesma compra, em ordem cronológica de mês referente
  const indiceMes = (t) => anoReferenteDe(t) * 12 + MESES.indexOf(t.mesReferente);
  const parcelasDoGrupo = (lista, grupoId) =>
    lista.filter(t => t.grupoId === grupoId).sort((a, b) => indiceMes(a) - indiceMes(b));

  // Até onde o número da parcela pode ir sem estourar o total nos meses seguintes.
  // Ex.: 3ª linha de 10 parcelas, com 7 meses pela frente → no máximo 3.
  const limitesParcelaDe = (t) => {
    if (!t.grupoId || !(t.parcelas > 1)) return null;
    const irmas = parcelasDoGrupo(transacoes, t.grupoId);
    const idx = irmas.findIndex(x => x.id === t.id);
    if (idx < 0) return null;
    const posteriores = irmas.length - 1 - idx;
    return { min: 1, max: Math.max(1, t.parcelas - posteriores) };
  };

  useEffect(() => {
    let ativo = true;
    (async () => {
      try {
        const [trans, gans, cats] = await Promise.all([
          window.api.listarTransacoes(),
          window.api.listarGanhos(),
          window.api.listarCategorias()
        ]);
        if (!ativo) return;
        setTransacoes(trans.sort((a, b) => new Date(b.data) - new Date(a.data)));
        setGanhos(gans);
        setCategorias(cats.map(c => c.nome ?? c));
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

  const handleSalvarEdicao = async (campos, aplicarNoGrupo) => {
    const alvo = editando;
    // Categoria, valor, forma e comentário descrevem a compra; data, mês e
    // número da parcela são próprios de cada linha.
    const { categoria, valor, formaPagamento, comentario, ...soDestaLinha } = campos;

    if (aplicarNoGrupo && alvo.grupoId) {
      await window.api.atualizarGrupo(alvo.grupoId, { categoria, valor, formaPagamento, comentario });
      await window.api.atualizarTransacao(alvo.id, soDestaLinha);
    } else {
      await window.api.atualizarTransacao(alvo.id, campos);
    }

    let atualizadas = await window.api.listarTransacoes();

    // Mudar o número da parcela desloca as parcelas dos meses seguintes, para a
    // sequência não quebrar: virar 3/10 em 2/10 faz o mês seguinte ser 3/10.
    // Os meses anteriores ficam como estão.
    const mudouParcela = campos.parcelaAtual != null && campos.parcelaAtual !== alvo.parcelaAtual;
    if (mudouParcela && alvo.grupoId) {
      const irmas = parcelasDoGrupo(atualizadas, alvo.grupoId);
      const idx = irmas.findIndex(x => x.id === alvo.id);
      if (idx >= 0) {
        const pares = irmas.slice(idx).map((t, i) => ({ id: t.id, parcelaAtual: campos.parcelaAtual + i }));
        await window.api.renumerarParcelas(pares);
        atualizadas = await window.api.listarTransacoes();
      }
    }

    setTransacoes(ordenarRecentes(atualizadas));
    setEditando(null);
  };

  // Irmãs de um parcelamento antigo (sem grupoId), casadas pelas características da compra
  const irmasSemGrupo = (transacao) => transacoes.filter(t =>
    !t.grupoId &&
    t.tipo === transacao.tipo &&
    t.parcelas === transacao.parcelas &&
    t.categoria === transacao.categoria &&
    t.valor === transacao.valor &&
    t.formaPagamento === transacao.formaPagamento &&
    (t.comentario || '') === (transacao.comentario || '')
  );

  const handleExcluirOuCancelar = async (transacao) => {
    const ehParcelamento = transacao.tipo === 'Entradas no cartão' && transacao.parcelas > 1;

    try {
      if (transacao.tipo === 'Gastos mensais fixos') {
        const escolha = await confirmar({
          mensagem: 'Este é um gasto fixo, que se repete todos os meses. O que você quer fazer?',
          opcoes: [
            {
              chave: 'encerrar',
              rotulo: `Encerrar a partir de ${mesSelecionado}/${anoSelecionado}`,
              descricao: 'Some deste mês em diante e preserva o histórico já registrado.'
            },
            {
              chave: 'tudo',
              rotulo: 'Excluir de todos os meses',
              descricao: 'Apaga o gasto por completo, inclusive dos meses anteriores.',
              perigo: true
            }
          ]
        });
        if (!escolha) return;

        if (escolha === 'encerrar') {
          await window.api.atualizarTransacao(transacao.id, { mesFim: mesSelecionado, anoFim: anoSelecionado });
          setTransacoes(prev => prev.map(t => t.id === transacao.id
            ? { ...t, mesFim: mesSelecionado, anoFim: anoSelecionado } : t));
        } else {
          await window.api.excluirTransacao(transacao.id);
          setTransacoes(prev => prev.filter(t => t.id !== transacao.id));
        }

      } else if (ehParcelamento) {
        const comGrupo = !!transacao.grupoId;
        const irmas = comGrupo ? parcelasDoGrupo(transacoes, transacao.grupoId) : irmasSemGrupo(transacao);
        const rotuloParcela = transacao.parcelaAtual
          ? `a parcela ${transacao.parcelaAtual}/${transacao.parcelas}`
          : 'esta parcela';

        const escolha = await confirmar({
          mensagem: `Esta compra está parcelada em ${transacao.parcelas}x. O que você quer remover?`,
          opcoes: [
            {
              chave: 'uma',
              rotulo: `Somente ${rotuloParcela}`,
              descricao: 'As outras parcelas continuam como estão.'
            },
            {
              chave: 'todas',
              rotulo: `Todas as ${irmas.length} parcelas da compra`,
              descricao: 'Remove a compra inteira, de todos os meses.',
              perigo: true
            }
          ]
        });
        if (!escolha) return;

        if (escolha === 'uma') {
          await window.api.excluirTransacao(transacao.id);
          setTransacoes(prev => prev.filter(t => t.id !== transacao.id));
        } else if (comGrupo) {
          await window.api.excluirGrupo(transacao.grupoId);
          setTransacoes(prev => prev.filter(t => t.grupoId !== transacao.grupoId));
        } else {
          await Promise.all(irmas.map(t => window.api.excluirTransacao(t.id)));
          const removidos = new Set(irmas.map(t => t.id));
          setTransacoes(prev => prev.filter(t => !removidos.has(t.id)));
        }

      } else {
        // Transação avulsa
        if (!(await confirmar('Deseja remover este registro de contas?'))) return;
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
            <select className="input-field" style={{ width: '120px' }} value={anoSelecionado} onChange={e => setAnoSelecionado(parseInt(e.target.value, 10))}>
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
                    <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                      <button
                        onClick={() => setEditando(t)}
                        title="Editar"
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-secondary)', display: 'inline-flex', marginRight: '0.4rem' }}
                      >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
                        </svg>
                      </button>
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

      {editando && (
        <EditarLancamento
          transacao={editando}
          limitesParcela={limitesParcelaDe(editando)}
          categorias={categorias}
          anos={anosDisp}
          onSalvar={handleSalvarEdicao}
          onFechar={() => setEditando(null)}
        />
      )}
    </div>
  );
}