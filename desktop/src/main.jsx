import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// As telas vêm de ../../shared (compartilhadas com a futura versão web).
// O que é específico do desktop é o window.api definido pelo preload.cjs.
import '@shared/index.css'
import App from '@shared/App.jsx'
import { ConfirmProvider } from '@shared/ConfirmDialog.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ConfirmProvider>
      <App />
    </ConfirmProvider>
  </StrictMode>,
)
