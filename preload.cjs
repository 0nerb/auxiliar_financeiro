const { contextBridge, ipcRenderer } = require('electron');

// Expõe uma API segura para a interface (window.api), substituindo as
// antigas chamadas fetch('http://localhost:3000/...') por IPC com o SQLite.
contextBridge.exposeInMainWorld('api', {
  // Transações
  listarTransacoes: () => ipcRenderer.invoke('transacoes:listar'),
  inserirTransacao: (transacao) => ipcRenderer.invoke('transacoes:inserir', transacao),
  atualizarTransacao: (id, campos) => ipcRenderer.invoke('transacoes:atualizar', id, campos),
  excluirTransacao: (id) => ipcRenderer.invoke('transacoes:excluir', id),
  excluirGrupo: (grupoId) => ipcRenderer.invoke('transacoes:excluirGrupo', grupoId),

  // Categorias
  listarCategorias: () => ipcRenderer.invoke('categorias:listar'),
  inserirCategoria: (nome) => ipcRenderer.invoke('categorias:inserir', nome),
  excluirCategoria: (id) => ipcRenderer.invoke('categorias:excluir', id)
});
