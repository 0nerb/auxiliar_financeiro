import { useState, useCallback, useRef, useEffect } from 'react';
import { ConfirmContext } from './confirmContext';

// Substitui o window.confirm nativo (que quebra o foco de teclado no Electron/Windows)
// por um modal em React. Uso: const confirmar = useConfirm(); if (await confirmar('...')) { ... }
export function ConfirmProvider({ children }) {
  const [mensagem, setMensagem] = useState(null);
  const resolverRef = useRef(null);

  const confirmar = useCallback((texto) => {
    return new Promise((resolve) => {
      resolverRef.current = resolve;
      setMensagem(texto);
    });
  }, []);

  const responder = useCallback((valor) => {
    if (resolverRef.current) resolverRef.current(valor);
    resolverRef.current = null;
    setMensagem(null);
  }, []);

  // Enter confirma, Esc cancela — enquanto o modal está aberto
  useEffect(() => {
    if (mensagem === null) return;
    const onKey = (e) => {
      if (e.key === 'Enter') { e.preventDefault(); responder(true); }
      else if (e.key === 'Escape') { e.preventDefault(); responder(false); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mensagem, responder]);

  return (
    <ConfirmContext.Provider value={confirmar}>
      {children}
      {mensagem !== null && (
        <div className="modal-overlay" onMouseDown={() => responder(false)}>
          <div className="modal-box" role="dialog" aria-modal="true" onMouseDown={e => e.stopPropagation()}>
            <p className="modal-msg">{mensagem}</p>
            <div className="modal-actions">
              <button type="button" className="btn btn-ghost" onClick={() => responder(false)}>Cancelar</button>
              <button type="button" className="btn btn-primary" onClick={() => responder(true)} autoFocus>Confirmar</button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}
