import { useState, useEffect } from 'react';

const TIPOS_ENTRADA = ['Gastos mensais fixos', 'Entradas no cartão', 'Investimentos'];
const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

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
    pago: false
  });

  const [categorias, setCategorias] = useState([]);
  const [gerenciando, setGerenciando] = useState(false);
  const [novaCategoria, setNovaCategoria] = useState('');

  // Busca as categorias salvas no banco local
  const carregarCategorias = async () => {
    try {
      const dados = await window.api.listarCategorias();
      setCategorias(dados);
      // Garante que o formulário tenha uma categoria válida selecionada
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
      alert('Essa categoria já existe.');
      return;
    }

    try {
      await window.api.inserirCategoria(nome);
      setNovaCategoria('');
      await carregarCategorias();
      setFormData(prev => ({ ...prev, categoria: nome }));
    } catch (err) {
      console.error('Erro ao adicionar categoria:', err);
      alert('Não foi possível adicionar a categoria.');
    }
  };

  const handleExcluirCategoria = async (cat) => {
    if (!window.confirm(`Excluir a categoria "${cat.nome}"?`)) return;

    try {
      await window.api.excluirCategoria(cat.id);
      const restantes = categorias.filter(c => c.id !== cat.id);
      setCategorias(restantes);
      // Se a categoria excluída estava selecionada, escolhe outra
      setFormData(prev => (
        prev.categoria === cat.nome
          ? { ...prev, categoria: restantes[0] ? restantes[0].nome : '' }
          : prev
      ));
    } catch (err) {
      console.error('Erro ao excluir categoria:', err);
      alert('Não foi possível excluir a categoria.');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const valorTotal = parseFloat(formData.valor);
    let requests = [];
    
    const payloadBase = { ...formData };

    if (formData.tipo === 'Entradas no cartão' && formData.parcelas > 1 && formData.formaPagamento === 'Crédito') {
      const valorParcela = valorTotal / formData.parcelas;
      const [anoStr, mesStr, diaStr] = formData.data.split('-');
      
      let anoBase = parseInt(anoStr, 10);
      let mesBase = parseInt(mesStr, 10);
      const diaBase = diaStr; // Mantém o dia exato da inserção
      
      const indiceMesRefBase = MESES.indexOf(formData.mesReferente);
      
      for (let i = 0; i < formData.parcelas; i++) {
        // Cálculo de avanço do mês da Data ISO
        let novoMesNum = mesBase + i;
        let novoAno = anoBase + Math.floor((novoMesNum - 1) / 12);
        let mesFormatado = ((novoMesNum - 1) % 12) + 1;
        const dataFormatada = `${novoAno}-${String(mesFormatado).padStart(2, '0')}-${diaBase}`;
        
        // Cálculo de avanço do Mês Referente
        const indiceMesRefParcela = (indiceMesRefBase + i) % 12;
        const mesReferenteParcela = MESES[indiceMesRefParcela];
        
        requests.push(window.api.inserirTransacao({
          ...payloadBase,
          valor: valorParcela,
          data: dataFormatada,
          mesReferente: mesReferenteParcela,
          parcelaAtual: i + 1, // Injeção do indexador da parcela atual
          mesesPagos: formData.pago ? [mesReferenteParcela] : []
        }));
      }
    } else {
      // Inserção para registros não parcelados
      requests.push(window.api.inserirTransacao({
        ...payloadBase,
        valor: valorTotal,
        mesesPagos: formData.pago ? [formData.mesReferente] : []
      }));
    }

    await Promise.all(requests);
    alert('Dado(s) inserido(s) com sucesso!');
    
    setFormData({ 
      ...formData, 
      valor: '', 
      parcelas: 1, 
      comentario: '',
      pago: false 
    });
  };

  const fontStyleObj = { fontSize: '1.25rem', padding: '0.75rem' };

  return (
    <div className="card" style={{ maxWidth: '600px', margin: '0 auto' }}>
      <h2 style={{ marginBottom: '1.5rem', fontSize: '1.75rem' }}>Inserir Nova Transação</h2>
      
      <form onSubmit={handleSubmit} className="form-container" style={{ gap: '1.5rem' }}>
        
        <div className="input-group" style={{ fontSize: '1.25rem' }}>
          <span style={{ fontWeight: '600', marginBottom: '0.5rem', display: 'block' }}>Forma de Pagamento</span>
          <div style={{ display: 'flex', gap: '2rem', padding: '0.5rem 0' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
              <input 
                type="radio" 
                name="formaPagamento" 
                value="Crédito"
                checked={formData.formaPagamento === 'Crédito'}
                onChange={e => setFormData({...formData, formaPagamento: e.target.value})}
                style={{ transform: 'scale(1.5)' }}
              />
              Cartão de Crédito
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
              <input 
                type="radio" 
                name="formaPagamento" 
                value="Débito"
                checked={formData.formaPagamento === 'Débito'}
                onChange={e => setFormData({...formData, formaPagamento: e.target.value})}
                style={{ transform: 'scale(1.5)' }}
              />
              Débito / Pix
            </label>
          </div>
        </div>

        <label className="input-group" style={{ fontSize: '1.25rem', flexDirection: 'row', alignItems: 'center', gap: '0.75rem', padding: '0.5rem 0' }}>
          <input 
            type="checkbox" 
            checked={formData.pago}
            onChange={e => setFormData({...formData, pago: e.target.checked})}
            style={{ transform: 'scale(1.5)', cursor: 'pointer' }}
          />
          <span style={{ fontWeight: '600', color: '#16a34a' }}>Esta transação já está paga?</span>
        </label>

        <label className="input-group" style={{ fontSize: '1.25rem' }}>
          <span style={{ fontWeight: '600' }}>Tipo de Entrada</span>
          <select className="input-field" style={fontStyleObj} value={formData.tipo} onChange={e => setFormData({...formData, tipo: e.target.value})}>
            {TIPOS_ENTRADA.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>

        {formData.tipo === 'Entradas no cartão' && formData.formaPagamento === 'Crédito' && (
          <label className="input-group" style={{ fontSize: '1.25rem' }}>
            <span style={{ fontWeight: '600' }}>Número de Parcelas</span>
            <input type="number" min="1" required className="input-field" style={fontStyleObj} value={formData.parcelas} onChange={e => setFormData({...formData, parcelas: parseInt(e.target.value, 10) || 1})} />
          </label>
        )}

        <div className="input-group" style={{ fontSize: '1.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontWeight: '600' }}>Categoria</span>
            <button
              type="button"
              onClick={() => setGerenciando(g => !g)}
              style={{ background: 'none', border: 'none', color: '#2563eb', cursor: 'pointer', fontSize: '0.95rem', fontWeight: '600', padding: 0 }}
            >
              {gerenciando ? 'Concluir' : 'Gerenciar categorias'}
            </button>
          </div>
          <select className="input-field" style={fontStyleObj} value={formData.categoria} onChange={e => setFormData({...formData, categoria: e.target.value})}>
            {categorias.length === 0 && <option value="">Nenhuma categoria</option>}
            {categorias.map(c => <option key={c.id} value={c.nome}>{c.nome}</option>)}
          </select>

          {gerenciando && (
            <div style={{ marginTop: '0.75rem', padding: '1rem', border: '1px solid #d1d5db', borderRadius: '0.5rem', background: '#f9fafb' }}>
              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
                <input
                  type="text"
                  className="input-field"
                  style={{ ...fontStyleObj, flex: 1, marginTop: 0 }}
                  placeholder="Nova categoria..."
                  value={novaCategoria}
                  onChange={e => setNovaCategoria(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleAdicionarCategoria(e); }}
                />
                <button type="button" className="btn-primary" style={{ fontSize: '1rem' }} onClick={handleAdicionarCategoria}>
                  Adicionar
                </button>
              </div>
              <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '0.4rem', maxHeight: '220px', overflowY: 'auto' }}>
                {categorias.map(c => (
                  <li key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.4rem 0.6rem', background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: '0.25rem', fontSize: '1.05rem' }}>
                    <span>{c.nome}</span>
                    <button
                      type="button"
                      onClick={() => handleExcluirCategoria(c)}
                      title="Excluir categoria"
                      style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: '1.1rem', fontWeight: 'bold', padding: '0 0.25rem' }}
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <label className="input-group" style={{ fontSize: '1.25rem' }}>
          <span style={{ fontWeight: '600' }}>Valor (R$)</span>
          <input type="number" step="0.01" required className="input-field" style={fontStyleObj} value={formData.valor} onChange={e => setFormData({...formData, valor: e.target.value})} />
        </label>

        <label className="input-group" style={{ fontSize: '1.25rem' }}>
          <span style={{ fontWeight: '600' }}>Data Exata da Compra</span>
          <input type="date" required className="input-field" style={fontStyleObj} value={formData.data} onChange={e => setFormData({...formData, data: e.target.value})} />
        </label>

        <label className="input-group" style={{ fontSize: '1.25rem' }}>
          <span style={{ fontWeight: '600' }}>Mês Referente (Ciclo de Cobrança)</span>
          <select className="input-field" style={fontStyleObj} value={formData.mesReferente} onChange={e => setFormData({...formData, mesReferente: e.target.value})}>
            {MESES.map(mes => <option key={mes} value={mes}>{mes}</option>)}
          </select>
        </label>

        <label className="input-group" style={{ fontSize: '1.25rem' }}>
          <span style={{ fontWeight: '600' }}>Comentário</span>
          <textarea className="input-field" style={{ ...fontStyleObj, minHeight: '100px', resize: 'vertical' }} value={formData.comentario} onChange={e => setFormData({...formData, comentario: e.target.value})} placeholder="Opcional..." />
        </label>

        <button type="submit" className="btn-primary" style={{ fontSize: '1.25rem', padding: '1rem', marginTop: '1rem' }}>
          Salvar Transação
        </button>
      </form>
    </div>
  );
}