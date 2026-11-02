import { useState, useEffect } from 'react';
import { MESES, anoReferenteDe } from './periodo';

export default function EditarLancamento({ transacao, categorias, anos, limitesParcela, onSalvar, onFechar }) {
  const ehParcelado = transacao.tipo === 'Entradas no cartão' && transacao.parcelas > 1;
  const ehFixo = transacao.tipo === 'Gastos mensais fixos';
  // Parcelamentos antigos não têm grupoId: nesses, a edição vale só para a linha
  const podeAgrupar = ehParcelado && !!transacao.grupoId;

  const [form, setForm] = useState(() => ({
    categoria: transacao.categoria || '',
    valor: String(transacao.valor ?? ''),
    data: transacao.data || '',
    formaPagamento: transacao.formaPagamento || 'Crédito',
    mesReferente: transacao.mesReferente || MESES[0],
    anoReferente: anoReferenteDe(transacao),
    comentario: transacao.comentario || '',
    parcelaAtual: String(transacao.parcelaAtual ?? 1)
  }));
  // Numa compra parcelada, o normal é querer corrigir a compra toda
  const [aplicarNoGrupo, setAplicarNoGrupo] = useState(podeAgrupar);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState(null);

  useEffect(() => {
    const aoTeclar = (e) => { if (e.key === 'Escape') onFechar(); };
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, [onFechar]);

  const mudar = (campo) => (e) => setForm(f => ({ ...f, [campo]: e.target.value }));

  const submeter = async (e) => {
    e.preventDefault();
    setErro(null);

    const valor = parseFloat(String(form.valor).replace(',', '.'));
    if (!form.categoria) return setErro('Escolha uma categoria.');
    if (Number.isNaN(valor) || valor <= 0) return setErro('Informe um valor maior que zero.');
    if (!form.data) return setErro('Informe a data.');

    const campos = {
      categoria: form.categoria,
      valor,
      data: form.data,
      formaPagamento: form.formaPagamento,
      mesReferente: form.mesReferente,
      anoReferente: parseInt(form.anoReferente, 10),
      comentario: form.comentario
    };

    if (ehParcelado) {
      const parcela = parseInt(form.parcelaAtual, 10);
      const min = limitesParcela?.min ?? 1;
      const max = limitesParcela?.max ?? transacao.parcelas;
      if (Number.isNaN(parcela) || parcela < min || parcela > max) {
        return setErro(max < transacao.parcelas
          ? `Informe um número entre ${min} e ${max}: acima disso as parcelas dos meses seguintes passariam de ${transacao.parcelas}.`
          : `A parcela deve ser um número entre ${min} e ${max}.`);
      }
      campos.parcelaAtual = parcela;
    }

    setSalvando(true);
    try {
      await onSalvar(campos, aplicarNoGrupo && podeAgrupar);
    } catch (err) {
      console.error('Erro ao salvar lançamento:', err);
      setErro('Não foi possível salvar as alterações.');
      setSalvando(false);
    }
  };

  return (
    <div className="modal-overlay" onMouseDown={onFechar}>
      <div
        className="modal-box"
        role="dialog"
        aria-modal="true"
        aria-label="Editar lançamento"
        style={{ maxWidth: '520px', maxHeight: '90vh', overflowY: 'auto' }}
        onMouseDown={e => e.stopPropagation()}
      >
        <h2 style={{ margin: '0 0 0.25rem', fontSize: '1.1rem' }}>Editar lançamento</h2>
        <p style={{ margin: '0 0 1.25rem', color: 'var(--color-text-secondary)', fontSize: '0.85rem' }}>
          {transacao.tipo}
          {ehParcelado && ` · parcelado em ${transacao.parcelas}x`}
        </p>

        <form onSubmit={submeter} style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
          <label className="input-group">
            <span className="input-label">Categoria</span>
            <select className="input-field" value={form.categoria} onChange={mudar('categoria')}>
              {/* Mantém a categoria atual na lista mesmo se ela tiver sido excluída depois */}
              {form.categoria && !categorias.includes(form.categoria) && (
                <option value={form.categoria}>{form.categoria}</option>
              )}
              {categorias.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <label className="input-group">
              <span className="input-label">{ehParcelado ? 'Valor da parcela (R$)' : 'Valor (R$)'}</span>
              <input type="number" step="0.01" min="0" className="input-field"
                     value={form.valor} onChange={mudar('valor')} />
            </label>
            <label className="input-group">
              <span className="input-label">Data</span>
              <input type="date" className="input-field" value={form.data} onChange={mudar('data')} />
            </label>
          </div>

          <label className="input-group">
            <span className="input-label">Forma de pagamento</span>
            <select className="input-field" value={form.formaPagamento} onChange={mudar('formaPagamento')}>
              <option value="Crédito">Cartão de crédito</option>
              <option value="Débito">Débito / Pix</option>
            </select>
          </label>

          {ehParcelado && (
            <label className="input-group">
              <span className="input-label">Parcela sendo paga</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <input type="number" min={limitesParcela?.min ?? 1} max={limitesParcela?.max ?? transacao.parcelas}
                       className="input-field" style={{ width: '110px' }}
                       value={form.parcelaAtual} onChange={mudar('parcelaAtual')} />
                <span style={{ color: 'var(--color-text-secondary)' }}>de {transacao.parcelas}</span>
              </div>
              {podeAgrupar && (
                <span style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', marginTop: '0.1rem' }}>
                  As parcelas dos meses seguintes são renumeradas junto.
                </span>
              )}
            </label>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px', gap: '0.75rem' }}>
            <label className="input-group">
              <span className="input-label">{ehFixo ? 'Mês de início' : 'Mês referente'}</span>
              <select className="input-field" value={form.mesReferente} onChange={mudar('mesReferente')}>
                {MESES.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </label>
            <label className="input-group">
              <span className="input-label">Ano</span>
              <select className="input-field" value={form.anoReferente} onChange={mudar('anoReferente')}>
                {anos.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </label>
          </div>

          <label className="input-group">
            <span className="input-label">Comentário</span>
            <input type="text" className="input-field" placeholder="Opcional"
                   value={form.comentario} onChange={mudar('comentario')} />
          </label>

          {podeAgrupar && (
            <label style={{
              display: 'flex', alignItems: 'flex-start', gap: '0.6rem', cursor: 'pointer',
              background: 'var(--color-bg-muted)', padding: '0.75rem', borderRadius: 'var(--radius-md)'
            }}>
              <input type="checkbox" checked={aplicarNoGrupo} style={{ marginTop: '0.2rem' }}
                     onChange={e => setAplicarNoGrupo(e.target.checked)} />
              <span style={{ fontSize: '0.85rem', lineHeight: 1.45 }}>
                Aplicar às {transacao.parcelas} parcelas desta compra
                <span style={{ display: 'block', color: 'var(--color-text-secondary)' }}>
                  Vale para categoria, valor, forma e comentário. Data, mês e número da
                  parcela mudam só nesta linha.
                </span>
              </span>
            </label>
          )}

          {erro && (
            <p role="alert" style={{ margin: 0, color: 'var(--color-danger-text)', fontSize: '0.85rem' }}>{erro}</p>
          )}

          <div className="modal-actions" style={{ marginTop: '0.25rem' }}>
            <button type="button" className="btn btn-ghost" onClick={onFechar} disabled={salvando}>Cancelar</button>
            <button type="submit" className="btn btn-primary" disabled={salvando}>
              {salvando ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
