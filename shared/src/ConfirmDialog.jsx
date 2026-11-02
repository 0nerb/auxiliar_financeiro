import { useState, useCallback, useRef, useEffect } from 'react';
import { ConfirmContext } from './confirmContext';

// Substitui o window.confirm nativo (que quebra o foco de teclado no Electron/Windows)
// por um modal em React. Dois usos:
//
//   const confirmar = useConfirm();
//   if (await confirmar('Tem certeza?')) { ... }                  → true/false
//   const escolha = await confirmar({ mensagem, opcoes: [...] })  → chave da opção ou null
//
// Cada opção é { chave, rotulo, descricao?, perigo? }.
export function ConfirmProvider({ children }) {
  const [pedido, setPedido] = useState(null);
  const resolverRef = useRef(null);

  const confirmar = useCallback((entrada) => {
    const normalizado = typeof entrada === 'string'
      ? { mensagem: entrada, opcoes: null }
      : { mensagem: entrada.mensagem, opcoes: entrada.opcoes || null };

    return new Promise((resolve) => {
      resolverRef.current = resolve;
      setPedido(normalizado);
    });
  }, []);

  const responder = useCallback((valor) => {
    if (resolverRef.current) resolverRef.current(valor);
    resolverRef.current = null;
    setPedido(null);
  }, []);

  // Esc cancela sempre; Enter confirma apenas no modo sim/não, porque com
  // várias opções não existe uma escolha "óbvia" para o Enter acionar.
  const temOpcoes = !!pedido?.opcoes;
  useEffect(() => {
    if (pedido === null) return;
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); responder(temOpcoes ? null : false); }
      else if (e.key === 'Enter' && !temOpcoes) { e.preventDefault(); responder(true); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pedido, temOpcoes, responder]);

  return (
    <ConfirmContext.Provider value={confirmar}>
      {children}
      {pedido !== null && (
        <div className="modal-overlay" onMouseDown={() => responder(temOpcoes ? null : false)}>
          <div className="modal-box" role="dialog" aria-modal="true" onMouseDown={e => e.stopPropagation()}>
            <p className="modal-msg">{pedido.mensagem}</p>

            {temOpcoes ? (
              <>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                  {pedido.opcoes.map(op => (
                    <button
                      key={op.chave}
                      type="button"
                      onClick={() => responder(op.chave)}
                      style={{
                        textAlign: 'left',
                        padding: '0.75rem 0.9rem',
                        borderRadius: 'var(--radius-md)',
                        border: '1px solid var(--color-border-strong)',
                        background: 'var(--color-bg-muted)',
                        cursor: 'pointer',
                        color: op.perigo ? 'var(--color-danger-text)' : 'var(--color-text-primary)'
                      }}
                    >
                      <span style={{ fontWeight: 500, display: 'block' }}>{op.rotulo}</span>
                      {op.descricao && (
                        <span style={{ display: 'block', marginTop: '0.15rem', fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>
                          {op.descricao}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
                <div className="modal-actions" style={{ marginTop: '1rem' }}>
                  <button type="button" className="btn btn-ghost" onClick={() => responder(null)}>Cancelar</button>
                </div>
              </>
            ) : (
              <div className="modal-actions">
                <button type="button" className="btn btn-ghost" onClick={() => responder(false)}>Cancelar</button>
                <button type="button" className="btn btn-primary" onClick={() => responder(true)} autoFocus>Confirmar</button>
              </div>
            )}
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}
