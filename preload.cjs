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

  // Ganhos (renda por mês)
  listarGanhos: () => ipcRenderer.invoke('ganhos:listar'),
  inserirGanho: (ganho) => ipcRenderer.invoke('ganhos:inserir', ganho),
  excluirGanho: (id) => ipcRenderer.invoke('ganhos:excluir', id),

  // Cofrinhos (reservas que rendem % do CDI)
  listarCofrinhos: () => ipcRenderer.invoke('cofrinhos:listar'),
  inserirCofrinho: (cofrinho) => ipcRenderer.invoke('cofrinhos:inserir', cofrinho),
  atualizarCofrinho: (id, campos) => ipcRenderer.invoke('cofrinhos:atualizar', id, campos),
  excluirCofrinho: (id) => ipcRenderer.invoke('cofrinhos:excluir', id),

  // Configurações chave/valor
  getConfig: (chave) => ipcRenderer.invoke('config:get', chave),
  setConfig: (chave, valor) => ipcRenderer.invoke('config:set', chave, valor),

  // Categorias
  listarCategorias: () => ipcRenderer.invoke('categorias:listar'),
  inserirCategoria: (nome) => ipcRenderer.invoke('categorias:inserir', nome),
  excluirCategoria: (id) => ipcRenderer.invoke('categorias:excluir', id)
});
