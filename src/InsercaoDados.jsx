import { useState, useEffect } from 'react';
import { MESES, chavePago } from './periodo';
import GanhosMes from './GanhosMes';

const TIPOS_ENTRADA = ['Gastos mensais fixos', 'Entradas no cartão', 'Investimentos'];

// Anos disponíveis na inserção: do ano passado até 6 anos à frente (cobre parcelas longas).
const ANO_ATUAL = new Date().getFullYear();
const ANOS = Array.from({ length: 8 }, (_, i) => ANO_ATUAL - 1 + i);

export default function InsercaoDados() {
  const dataAtual = new Date();

  const [formData, setFormData] = useState({
    tipo: TIPOS_ENTRADA[0],
    categoria: '',
    valor: '',
    parcelas: 1,
    data: dataAtual.toISOString().split('T')[0],
    comentario: '',
    formaPagamento: 'Crédito',
    mesReferente: MESES[dataAtual.getMonth()],
    anoReferente: dataAtual.getFullYear(),
    pago: false
  });

  const [categorias, setCategorias] = useState([]);
  const [gerenciando, setGerenciando] = useState(false);
  const [novaCategoria, setNovaCategoria] = useState('');
  const [mensagem, setMensagem] = useState(null); // { tipo: 'ok' | 'erro', texto }

  const carregarCategorias = async () => {
    try {
      const dados = await window.api.listarCategorias();
      setCategorias(dados);
      setFormData(prev => (
        prev.categoria || dados.length === 0
          ? prev
          : { ...prev, categoria: dados[0].nome }
      ));
    } catch (err) {
      console.error('Erro ao carregar categorias:', err);
    }
  };

  useEffect(() => {
    let ativo = true;
    (async () => {
      try {
        const dados = await window.api.listarCategorias();
        if (!ativo) return;
        setCategorias(dados);
        setFormData(prev => (
          prev.categoria || dados.length === 0
            ? prev
            : { ...prev, categoria: dados[0].nome }
        ));
      } catch (err) {
        console.error('Erro ao carregar categorias:', err);
      }
    })();
    return () => { ativo = false; };
  }, []);

  const handleAdicionarCategoria = async (e) => {
    e.preventDefault();
    const nome = novaCategoria.trim();
    if (!nome) return;
    if (categorias.some(c => c.nome.toLowerCase() === nome.toLowerCase())) {
      setMensagem({ tipo: 'erro', texto: 'Essa categoria já existe.' });
      return;
    }
    try {
      await window.api.inserirCategoria(nome);
      setNovaCategoria('');
      await carregarCategorias();
      setFormData(prev => ({ ...prev, categoria: nome }));
    } catch (err) {
      console.error('Erro ao adicionar categoria:', err);
      setMensagem({ tipo: 'erro', texto: 'Não foi possível adicionar a categoria.' });
    }
  };

  const handleExcluirCategoria = async (cat) => {
    if (!window.confirm(`Excluir a categoria "${cat.nome}"?`)) return;
    try {
      await window.api.excluirCategoria(cat.id);
      const restantes = categorias.filter(c => c.id !== cat.id);
      setCategorias(restantes);
      setFormData(prev => (
        prev.categoria === cat.nome
          ? { ...prev, categoria: restantes[0] ? restantes[0].nome : '' }
          : prev
      ));
    } catch (err) {
      console.error('Erro ao excluir categoria:', err);
      setMensagem({ tipo: 'erro', texto: 'Não foi possível excluir a categoria.' });
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const valorTotal = parseFloat(formData.valor);
    let requests = [];

    const payloadBase = { ...formData };
    const diaBase = formData.data.split('-')[2];

    if (formData.tipo === 'Entradas no cartão' && formData.parcelas > 1 && formData.formaPagamento === 'Crédito') {
      // Valor digitado é o de CADA parcela, replicado nos meses seguintes
      const valorParcela = valorTotal;
      const grupoId = crypto.randomUUID();
      const indiceBase = formData.anoReferente * 12 + MESES.indexOf(formData.mesReferente);

      for (let i = 0; i < formData.parcelas; i++) {
        const indiceAtual = indiceBase + i;
        const anoParcela = Math.floor(indiceAtual / 12);
        const mesIdxParcela = indiceAtual % 12;
        const mesReferenteParcela = MESES[mesIdxParcela];
        const dataFormatada = `${anoParcela}-${String(mesIdxParcela + 1).padStart(2, '0')}-${diaBase}`;

        requests.push(window.api.inserirTransacao({
          ...payloadBase,
          valor: valorParcela,
          data: dataFormatada,
          mesReferente: mesReferenteParcela,
          anoReferente: anoParcela,
          parcelaAtual: i + 1,
          grupoId,
          mesesPagos: formData.pago ? [chavePago(mesReferenteParcela, anoParcela)] : []
        }));
      }
    } else {
      requests.push(window.api.inserirTransacao({
        ...payloadBase,
        valor: valorTotal,
        mesesPagos: formData.pago ? [chavePago(formData.mesReferente, formData.anoReferente)] : []
      }));
    }

    try {
      await Promise.all(requests);
      setMensagem({ tipo: 'ok', texto: requests.length > 1 ? `${requests.length} parcelas inseridas com sucesso.` : 'Transação inserida com sucesso.' });
      setFormData(prev => ({
        ...prev,
        valor: '',
        parcelas: 1,
        comentario: '',
        pago: false
      }));
    } catch (err) {
      console.error('Erro ao inserir transação:', err);
      setMensagem({ tipo: 'erro', texto: 'Erro ao salvar. Tente novamente.' });
    }
  };

  const ehParcelado = formData.tipo === 'Entradas no cartão' && formData.formaPagamento === 'Crédito' && formData.parcelas > 1;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: '1.25rem', maxWidth: '960px' }}>

      {mensagem && (
        <div
          className={`badge ${mensagem.tipo === 'ok' ? 'badge-debito' : 'badge-danger'}`}
          style={{ alignSelf: 'flex-start', padding: '0.5rem 0.9rem', fontSize: '0.85rem' }}
          onAnimationEnd={() => setMensagem(null)}
        >
          {mensagem.texto}
        </div>
      )}

      <form onSubmit={handleSubmit} className="card" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

        {/* Forma de pagamento + Já pago */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.25rem' }}>
          <div className="input-group">
            <span className="input-label">Forma de pagamento</span>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              {['Crédito', 'Débito'].map(opcao => {
                const ativo = formData.formaPagamento === opcao;
                return (
                  <button
                    type="button"
                    key={opcao}
                    onClick={() => setFormData({ ...formData, formaPagamento: opcao })}
                    className="btn"
                    style={{
                      flex: 1,
                      background: ativo ? 'var(--color-accent)' : 'transparent',
                      color: ativo ? 'var(--color-text-on-accent)' : 'var(--color-text-secondary)',
                      borderColor: ativo ? 'var(--color-accent)' : 'var(--color-border-strong)'
                    }}
                  >
                    {opcao === 'Crédito' ? 'Cartão de crédito' : 'Débito / Pix'}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="input-group">
            <span className="input-label">Status</span>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', cursor: 'pointer', padding: '0.6rem 0.85rem', border: '1px solid var(--color-border-strong)', borderRadius: 'var(--radius-md)' }}>
              <input
                type="checkbox"
                checked={formData.pago}
                onChange={e => setFormData({ ...formData, pago: e.target.checked })}
                style={{ width: 18, height: 18, accentColor: 'var(--color-accent)' }}
              />
              <span style={{ color: 'var(--color-text-primary)' }}>Já está paga</span>
            </label>
          </div>
        </div>

        {/* Tipo + Parcelas */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.25rem' }}>
          <label className="input-group">
            <span className="input-label">Tipo de entrada</span>
            <select className="input-field" value={formData.tipo} onChange={e => setFormData({ ...formData, tipo: e.target.value })}>
              {TIPOS_ENTRADA.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>

          {formData.tipo === 'Entradas no cartão' && formData.formaPagamento === 'Crédito' && (
            <label className="input-group">
              <span className="input-label">Número de parcelas</span>
              <input type="number" min="1" required className="input-field" value={formData.parcelas} onChange={e => setFormData({ ...formData, parcelas: parseInt(e.target.value, 10) || 1 })} />
            </label>
          )}
        </div>

        {/* Categoria com gerenciador */}
        <div className="input-group">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="input-label">Categoria</span>
            <button
              type="button"
              onClick={() => setGerenciando(g => !g)}
              style={{ background: 'none', border: 'none', color: 'var(--color-accent)', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 500, padding: 0 }}
            >
              {gerenciando ? 'Concluir' : 'Gerenciar categorias'}
            </button>
          </div>
          <select className="input-field" value={formData.categoria} onChange={e => setFormData({ ...formData, categoria: e.target.value })}>
            {categorias.length === 0 && <option value="">Nenhuma categoria</option>}
            {categorias.map(c => <option key={c.id} value={c.nome}>{c.nome}</option>)}
          </select>

          {gerenciando && (
            <div style={{ marginTop: '0.65rem', padding: '0.85rem', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', background: 'var(--color-bg-muted)' }}>
              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.6rem' }}>
                <input
                  type="text"
                  className="input-field"
                  style={{ flex: 1 }}
                  placeholder="Nova categoria..."
                  value={novaCategoria}
                  onChange={e => setNovaCategoria(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleAdicionarCategoria(e); }}
                />
                <button type="button" className="btn btn-primary" onClick={handleAdicionarCategoria}>Adicionar</button>
              </div>
              <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '0.35rem', maxHeight: '200px', overflowY: 'auto' }}>
                {categorias.map(c => (
                  <li key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.4rem 0.65rem', background: 'var(--color-bg-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)' }}>
                    <span>{c.nome}</span>
                    <button
                      type="button"
                      onClick={() => handleExcluirCategoria(c)}
                      title="Excluir categoria"
                      style={{ background: 'none', border: 'none', color: 'var(--color-danger)', cursor: 'pointer', fontSize: '1rem', padding: '0 0.25rem' }}
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Valor + Data */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.25rem' }}>
          <label className="input-group">
            <span className="input-label">{ehParcelado ? 'Valor de cada parcela (R$)' : 'Valor (R$)'}</span>
            <input type="number" step="0.01" required className="input-field" value={formData.valor} onChange={e => setFormData({ ...formData, valor: e.target.value })} />
            {ehParcelado && (
              <span style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)' }}>
                Será lançado em cada uma das {formData.parcelas} parcelas — total: R$ {(parseFloat(formData.valor || 0) * formData.parcelas).toFixed(2)}.
              </span>
            )}
          </label>

          <label className="input-group">
            <span className="input-label">Data exata da compra</span>
            <input type="date" required className="input-field" value={formData.data} onChange={e => setFormData({ ...formData, data: e.target.value })} />
          </label>
        </div>

        {/* Mês + Ano */}
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1rem' }}>
          <label className="input-group">
            <span className="input-label">Mês referente (ciclo de cobrança)</span>
            <select className="input-field" value={formData.mesReferente} onChange={e => setFormData({ ...formData, mesReferente: e.target.value })}>
              {MESES.map(mes => <option key={mes} value={mes}>{mes}</option>)}
            </select>
          </label>
          <label className="input-group">
            <span className="input-label">Ano</span>
            <select className="input-field" value={formData.anoReferente} onChange={e => setFormData({ ...formData, anoReferente: parseInt(e.target.value, 10) })}>
              {ANOS.map(ano => <option key={ano} value={ano}>{ano}</option>)}
            </select>
          </label>
        </div>

        <label className="input-group">
          <span className="input-label">Comentário</span>
          <textarea className="input-field" value={formData.comentario} onChange={e => setFormData({ ...formData, comentario: e.target.value })} placeholder="Opcional..." />
        </label>

        <button type="submit" className="btn btn-primary" style={{ alignSelf: 'flex-start', padding: '0.8rem 1.5rem' }}>
          Salvar transação
        </button>
      </form>

      <GanhosMes />
    </div>
  );
}
