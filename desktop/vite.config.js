import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

// A interface (telas React) vive em ../shared e é compartilhada com a versão web.
const shared = fileURLToPath(new URL('../shared/src', import.meta.url))
const nodeModules = fileURLToPath(new URL('./node_modules', import.meta.url))

// Cada app do monorepo tem seu próprio node_modules (o desktop precisa disso
// para o electron-builder achar os módulos nativos). Como ../shared fica fora
// desta pasta, o resolvedor não encontraria "react" e companhia sozinho —
// por isso essas dependências são apontadas explicitamente para cá.
// Ao adicionar uma nova dependência usada pelo código compartilhado,
// inclua-a nesta lista.
const DEPS_COMPARTILHADAS = ['react', 'react-dom', 'react-router-dom', 'recharts']

export default defineConfig({
  base: './',
  plugins: [react()],
  resolve: {
    alias: [
      { find: '@shared', replacement: shared },
      {
        find: new RegExp(`^(${DEPS_COMPARTILHADAS.join('|')})($|/)`),
        replacement: `${nodeModules}/$1$2`,
      },
    ],
  },
  server: {
    // Permite ao dev server servir arquivos de fora desta pasta (../shared)
    fs: { allow: ['..'] },
  },
})
