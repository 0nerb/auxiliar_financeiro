import { createContext, useContext } from 'react';

// Contexto e hook do modal de confirmação (separados do componente para o Fast Refresh)
export const ConfirmContext = createContext(() => Promise.resolve(false));

export function useConfirm() {
  return useContext(ConfirmContext);
}
