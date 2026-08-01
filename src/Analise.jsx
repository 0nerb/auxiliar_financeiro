import { useState, useEffect, useMemo, useRef } from 'react';
import { MESES, anosDisponiveis, montarResumoComparativo, montarResumoCarteira, montarLancamentosDoMes } from './periodo';

const fmtBytes = (b) => {
  if (!b) return '0 MB';
  const gb = b / 1e9;
  return gb >= 1 ? `${gb.toFixed(2)} GB` : `${(b / 1e6).toFixed(0)} MB`;
};

const SUGESTOES = [
  'Faça um resumo da minha saúde financeira.',
  'Onde estou gastando mais e onde dá pra economizar?',
  'Como está minha carteira de investimentos?',
  'Minha alocação está bem distribuída?'
];

export default function Analise() {
  const [modelos, setModelos] = useState([]);
  const [modeloSel, setModeloSel] = useState('7b');
  const [transacoes, setTransacoes] = useState([]);
  const [ganhos, setGanhos] = useState([]);
  const [cofrinhos, setCofrinhos] = useState([]);
  const [cdiAnual, setCdiAnual] = useState(0);
  const [carteira, setCarteira] = useState([]);
  const [cotacoesCart, setCotacoesCart] = useState({}); // ticker -> precoAtual

  const [mesSel, setMesSel] = useState(new Date().getMonth());
  const [anoSel, setAnoSel] = useState(new Date().getFullYear());

  const [baixandoId, setBaixandoId] = useState(null);
  const [progresso, setProgresso] = useState(null);

  const [mensagens, setMensagens] = useState([]); // { role: 'user' | 'assistant', texto }
  const [pergunta, setPergunta] = useState('');
  const [respondendo, setRespondendo] = useState(false);
  const [erro, setErro] = useState(null);

  const preparadoKeyRef = useRef(null); // chave (modelo+período) já preparada no chat
  const fimRef = useRef(null);

  const carregarModelos = async () => {
    const lista = await window.api.iaListarModelos();
    setModelos(lista);
    const baixado = lista.find(m => m.baixado);
    if (baixado) setModeloSel(baixado.id);
  };

  useEffect(() => {
    let ativo = true;
    (async () => {
      try {
        const [trans, gans, cofs, cdi, cart, lista] = await Promise.all([
          window.api.listarTransacoes(),
          window.api.listarGanhos(),
          window.api.listarCofrinhos(),
          window.api.getConfig('cdiAnual'),
          window.api.listarCarteira(),
          window.api.iaListarModelos()
        ]);
        if (!ativo) return;
        setTransacoes(trans);
        setGanhos(gans);
        setCofrinhos(cofs);
        const cdiNum = parseFloat(cdi);
        if (!Number.isNaN(cdiNum)) setCdiAnual(cdiNum);
        setCarteira(cart);
        setModelos(lista);
        const baixado = lista.find(m => m.baixado);
        if (baixado) setModeloSel(baixado.id);
      } catch (err) {
        console.error('Erro ao carregar dados da análise:', err);
      }
    })();
    return () => { ativo = false; };
  }, []);

  // Streaming de tokens → anexa ao último balão do assistente
  useEffect(() => {
    const offProg = window.api.onProgressoIA((d) => setProgresso(d));
    const offTok = window.api.onTokenIA((chunk) => {
      setMensagens(prev => {
        if (prev.length === 0) return prev;
        const copia = [...prev];
        const ultima = copia[copia.length - 1];
        if (ultima.role === 'assistant') copia[copia.length - 1] = { ...ultima, texto: ultima.texto + chunk };
        return copia;
      });
    });
    return () => { offProg(); offTok(); };
  }, []);

  useEffect(() => { fimRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [mensagens]);

  // Trocar de período invalida o contexto já preparado
  useEffect(() => { preparadoKeyRef.current = null; }, [mesSel, anoSel, modeloSel]);

  // Busca a cotação atual de cada ativo da carteira (para valorizar e calcular alocação)
  useEffect(() => {
    const vistos = new Set();
    carteira.forEach(async (c) => {
      if (vistos.has(c.ticker)) return;
      vistos.add(c.ticker);
      try {
        const cot = await window.api.cotacaoAtual(c.ticker, c.classe);
        setCotacoesCart(prev => ({ ...prev, [c.ticker]: cot.preco }));
      } catch {
        setCotacoesCart(prev => ({ ...prev, [c.ticker]: null }));
      }
    });
  }, [carteira]);

  const anosDisp = useMemo(() => anosDisponiveis(transacoes), [transacoes]);
  const resumoFin = useMemo(
    () => montarResumoComparativo(transacoes, ganhos, cofrinhos, anoSel, mesSel, cdiAnual),
    [transacoes, ganhos, cofrinhos, anoSel, mesSel, cdiAnual]
  );
  const resumoCart = useMemo(
    () => montarResumoCarteira(carteira.map(c => ({ ...c, precoAtual: cotacoesCart[c.ticker] }))),
    [carteira, cotacoesCart]
  );
  const resumoLanc = useMemo(
    () => montarLancamentosDoMes(transacoes, anoSel, mesSel),
    [transacoes, anoSel, mesSel]
  );
  const resumo = useMemo(() => `${resumoFin}\n\n${resumoLanc}\n\n${resumoCart}`, [resumoFin, resumoLanc, resumoCart]);

  const algumBaixado = modelos.some(m => m.baixado);

  const handleBaixar = async (id) => {
    setErro(null);
    setBaixandoId(id);
    setProgresso({ pct: 0, downloadedSize: 0, totalSize: 0 });
    try {
      await window.api.iaBaixar(id);
      await carregarModelos();
      setModeloSel(id);
    } catch (err) {
      console.error('Erro no download do modelo:', err);
      setErro('Falha ao baixar o modelo. Verifique sua conexão e tente novamente.');
    } finally {
      setBaixandoId(null);
      setProgresso(null);
    }
  };

  const enviar = async (texto) => {
    const q = (texto ?? pergunta).trim();
    if (!q || respondendo) return;
    setErro(null);
    setPergunta('');
    setRespondendo(true);

    // (Re)prepara o contexto se o período/modelo mudou
    const key = `${modeloSel}|${anoSel}|${mesSel}`;
    try {
      if (preparadoKeyRef.current !== key) {
        await window.api.iaPrepararChat(modeloSel, resumo);
        preparadoKeyRef.current = key;
      }
      setMensagens(prev => [...prev, { role: 'user', texto: q }, { role: 'assistant', texto: '' }]);
      await window.api.iaPerguntar(q);
    } catch (err) {
      console.error('Erro no chat da IA:', err);
      setErro('Não foi possível gerar a resposta. Tente novamente.');
      preparadoKeyRef.current = null;
    } finally {
      setRespondendo(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', maxWidth: '860px' }}>

      {/* Período de contexto */}
      <div className="card card-compact" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <p className="metric-label">Contexto da conversa</p>
          <h2 style={{ margin: '0.15rem 0 0' }}>{MESES[mesSel]} de {anoSel}</h2>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <select className="input-field" style={{ width: '150px' }} value={mesSel} onChange={e => setMesSel(parseInt(e.target.value, 10))}>
            {MESES.map((m, i) => <option key={m} value={i}>{m}</option>)}
          </select>
          <select className="input-field" style={{ width: '120px' }} value={anoSel} onChange={e => setAnoSel(parseInt(e.target.value, 10))}>
            {anosDisp.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
      </div>

      {!algumBaixado ? (
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <h2 style={{ margin: 0 }}>Ativar a análise por IA</h2>
            <p style={{ margin: '0.35rem 0 0', color: 'var(--color-text-secondary)', fontSize: '0.9rem' }}>
              A IA roda 100% no seu computador — seus dados nunca saem da máquina. Escolha um modelo para baixar
              (só na primeira vez). Depois a conversa é offline.
            </p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem' }}>
            {modelos.map(m => (
              <div key={m.id} className="card" style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', background: 'var(--color-bg-muted)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '0.5rem' }}>
                  <h3 style={{ margin: 0 }}>{m.nome}</h3>
                  <span className="badge badge-muted">{m.tamanho}</span>
                </div>
                <p style={{ margin: 0, color: 'var(--color-text-secondary)', fontSize: '0.85rem' }}>{m.descricao}</p>
                <button type="button" className="btn btn-primary" disabled={baixandoId !== null} onClick={() => handleBaixar(m.id)} style={{ marginTop: '0.25rem' }}>
                  {baixandoId === m.id ? 'Baixando...' : 'Baixar e ativar'}
                </button>
                {baixandoId === m.id && progresso && (
                  <div>
                    <div style={{ height: 8, background: 'var(--color-border)', borderRadius: 'var(--radius-pill)', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${Math.round((progresso.pct || 0) * 100)}%`, background: 'var(--color-accent)', transition: 'width 0.2s' }} />
                    </div>
                    <p style={{ margin: '0.35rem 0 0', fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>
                      {Math.round((progresso.pct || 0) * 100)}% — {fmtBytes(progresso.downloadedSize)} de {fmtBytes(progresso.totalSize)}
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '1rem', minHeight: '420px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
            <h2 style={{ margin: 0 }}>Converse sobre suas finanças</h2>
            <select className="input-field" style={{ width: 'auto' }} value={modeloSel} onChange={e => setModeloSel(e.target.value)}>
              {modelos.map(m => (
                <option key={m.id} value={m.id} disabled={!m.baixado}>{m.nome}{m.baixado ? '' : ' (não baixado)'}</option>
              ))}
            </select>
          </div>

          {/* Mensagens */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.75rem', overflowY: 'auto', maxHeight: '460px', paddingRight: '0.25rem' }}>
            {mensagens.length === 0 && (
              <div style={{ color: 'var(--color-text-secondary)', fontSize: '0.9rem' }}>
                <p style={{ margin: '0 0 0.75rem' }}>Faça uma pergunta ou escolha uma sugestão:</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                  {SUGESTOES.map(s => (
                    <button key={s} type="button" className="btn btn-ghost" style={{ fontSize: '0.85rem', padding: '0.5rem 0.85rem' }} onClick={() => enviar(s)}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {mensagens.map((m, i) => (
              <div key={i} style={{ alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '85%' }}>
                <div style={{
                  padding: '0.7rem 0.95rem',
                  borderRadius: 'var(--radius-lg)',
                  background: m.role === 'user' ? 'var(--color-accent)' : 'var(--color-bg-muted)',
                  color: m.role === 'user' ? 'var(--color-text-on-accent)' : 'var(--color-text-primary)',
                  whiteSpace: 'pre-wrap',
                  lineHeight: 1.6,
                  fontSize: '0.95rem'
                }}>
                  {m.texto || (respondendo && i === mensagens.length - 1 ? <span className="cursor-pisca">▍</span> : '')}
                </div>
              </div>
            ))}
            <div ref={fimRef} />
          </div>

          {/* Entrada */}
          <form
            onSubmit={(e) => { e.preventDefault(); enviar(); }}
            style={{ display: 'flex', gap: '0.6rem', borderTop: '1px solid var(--color-border)', paddingTop: '1rem' }}
          >
            <input
              type="text"
              className="input-field"
              style={{ flex: 1 }}
              placeholder="Pergunte algo sobre suas finanças..."
              value={pergunta}
              onChange={e => setPergunta(e.target.value)}
              disabled={respondendo}
            />
            <button type="submit" className="btn btn-primary" disabled={respondendo || !pergunta.trim()}>
              {respondendo ? 'Pensando...' : 'Enviar'}
            </button>
          </form>

          <details>
            <summary style={{ cursor: 'pointer', color: 'var(--color-text-secondary)', fontSize: '0.85rem' }}>
              Ver os dados que a IA está usando de contexto
            </summary>
            <pre style={{ marginTop: '0.6rem', padding: '0.85rem', background: 'var(--color-bg-muted)', borderRadius: 'var(--radius-md)', fontSize: '0.8rem', whiteSpace: 'pre-wrap', color: 'var(--color-text-secondary)' }}>
              {resumo}
            </pre>
          </details>
        </div>
      )}

      {erro && (
        <div className="badge badge-danger" style={{ alignSelf: 'flex-start', padding: '0.5rem 0.9rem', fontSize: '0.85rem' }}>{erro}</div>
      )}

      <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.8rem', textAlign: 'center' }}>
        As respostas são geradas por IA local e servem apenas como orientação geral — não substituem um consultor financeiro.
      </p>
    </div>
  );
}
