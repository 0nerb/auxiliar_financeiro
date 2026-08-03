const { contextBridge, ipcRenderer } = require('electron');

// Expõe uma API segura para a interface (window.api), substituindo as
// antigas chamadas fetch('http://localhost:3000/...') por IPC com o SQLite.
contextBridge.exposeInMainWorld('api', {
  // Autenticação / criptografia do banco
  authStatus: () => ipcRenderer.invoke('auth:status'),
  authCriar: (senha) => ipcRenderer.invoke('auth:criar', senha),
  authDestravar: (senha) => ipcRenderer.invoke('auth:destravar', senha),
  authRecuperar: (codigo) => ipcRenderer.invoke('auth:recuperar', codigo),
  authRedefinirSenha: (novaSenha) => ipcRenderer.invoke('auth:redefinirSenha', novaSenha),

  // Backup
  exportarBackup: () => ipcRenderer.invoke('backup:exportar'),
  importarBackup: () => ipcRenderer.invoke('backup:importar'),
  revelarArquivo: (caminho) => ipcRenderer.invoke('backup:revelar', caminho),

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
  excluirCategoria: (id) => ipcRenderer.invoke('categorias:excluir', id),

  // IA local
  iaListarModelos: () => ipcRenderer.invoke('ia:listarModelos'),
  iaBaixar: (id) => ipcRenderer.invoke('ia:baixar', id),
  iaExcluirModelo: (id) => ipcRenderer.invoke('ia:excluirModelo', id),
  iaPrepararChat: (id, contexto) => ipcRenderer.invoke('ia:prepararChat', id, contexto),
  iaPerguntar: (pergunta) => ipcRenderer.invoke('ia:perguntar', pergunta),
  iaContinuar: () => ipcRenderer.invoke('ia:continuar'),

  // Listeners de progresso de download e streaming de tokens.
  // Retornam uma função para cancelar a inscrição.
  onProgressoIA: (callback) => {
    const handler = (_e, dados) => callback(dados);
    ipcRenderer.on('ia:progresso', handler);
    return () => ipcRenderer.removeListener('ia:progresso', handler);
  },
  onTokenIA: (callback) => {
    const handler = (_e, chunk) => callback(chunk);
    ipcRenderer.on('ia:token', handler);
    return () => ipcRenderer.removeListener('ia:token', handler);
  },

  // Investimentos: carteira
  listarCarteira: (classe) => ipcRenderer.invoke('carteira:listar', classe),
  inserirCarteira: (item) => ipcRenderer.invoke('carteira:inserir', item),
  atualizarCarteira: (id, campos) => ipcRenderer.invoke('carteira:atualizar', id, campos),
  excluirCarteira: (id) => ipcRenderer.invoke('carteira:excluir', id),

  // Investimentos: listas de ativos e dados de mercado
  listarAtivosCache: (classe) => ipcRenderer.invoke('ativos:listarCache', classe),
  ultimaAtualizacaoLista: (classe) => ipcRenderer.invoke('ativos:ultimaAtualizacao', classe),
  atualizarListaAtivos: (classe) => ipcRenderer.invoke('ativos:atualizarLista', classe),
  dadosAtivo: (ticker, classe, dataCompra) => ipcRenderer.invoke('mercado:dadosAtivo', ticker, classe, dataCompra),
  cotacaoAtual: (ticker, classe) => ipcRenderer.invoke('mercado:cotacaoAtual', ticker, classe),
  precoNaData: (ticker, classe, data) => ipcRenderer.invoke('mercado:precoNaData', ticker, classe, data),
  dividendos: (ticker, classe, dataCompra) => ipcRenderer.invoke('mercado:dividendos', ticker, classe, dataCompra),
  serieHistorica: (ticker, classe, dias) => ipcRenderer.invoke('mercado:serie', ticker, classe, dias)
});
