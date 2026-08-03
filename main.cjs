const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const db = require('./db.cjs');
const ai = require('./ai.cjs');
const mercado = require('./mercado.cjs');
const cripto = require('./cripto.cjs');
const backup = require('./backup.cjs');

// Chave de criptografia da sessão — vive apenas em memória, nunca é salva.
let dekSessao = null;

// Abre o banco e a IA depois que a chave foi obtida
function abrirDados(dek) {
  dekSessao = dek;
  db.inicializar(app.getPath('userData'), dek);
  ai.inicializar(app.getPath('userData'));
}

// Garante que os dados só sejam acessados com o app destravado
function comBanco(fn) {
  return (...args) => {
    if (!db.estaAberto()) throw new Error('O aplicativo está bloqueado.');
    return fn(...args);
  };
}

// 1. Registra os canais IPC que a interface usa no lugar do antigo json-server
function registrarHandlers() {
  // --- Autenticação / criptografia ---
  ipcMain.handle('auth:status', () => ({ ...cripto.status(), destravado: db.estaAberto() }));

  ipcMain.handle('auth:criar', (_e, senha) => {
    const { chaveRecuperacao, dek } = cripto.criar(senha);
    abrirDados(dek);
    return { ok: true, chaveRecuperacao };
  });

  ipcMain.handle('auth:destravar', (_e, senha) => {
    const { dek } = cripto.destravar(senha);
    abrirDados(dek);
    return { ok: true };
  });

  ipcMain.handle('auth:recuperar', (_e, codigo) => {
    const { dek } = cripto.destravarComRecuperacao(codigo);
    abrirDados(dek);
    return { ok: true };
  });

  ipcMain.handle('auth:redefinirSenha', (_e, novaSenha) => {
    if (!dekSessao) throw new Error('O aplicativo está bloqueado.');
    return cripto.definirSenhaComDek(dekSessao, novaSenha);
  });

  // --- Backup ---
  ipcMain.handle('backup:exportar', comBanco(async () => {
    const { canceled, filePath } = await dialog.showSaveDialog({
      title: 'Exportar backup criptografado',
      defaultPath: path.join(app.getPath('documents'), backup.nomeSugerido()),
      filters: [{ name: 'Backup do Auxiliar Financeiro', extensions: ['afbackup'] }]
    });
    if (canceled || !filePath) return { cancelado: true };
    return backup.exportar(app.getPath('userData'), filePath, () => db.consolidar());
  }));

  ipcMain.handle('backup:revelar', (_e, caminho) => {
    shell.showItemInFolder(caminho);
    return { ok: true };
  });

  // Importar NÃO exige o app destravado: num computador novo o usuário
  // restaura o backup antes de ter qualquer senha configurada.
  ipcMain.handle('backup:importar', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: 'Selecione o arquivo de backup',
      properties: ['openFile'],
      filters: [{ name: 'Backup do Auxiliar Financeiro', extensions: ['afbackup'] }]
    });
    if (canceled || !filePaths?.length) return { cancelado: true };

    // Se já existem dados nesta máquina, exige confirmação explícita
    if (backup.temDadosLocais(app.getPath('userData'))) {
      const { response } = await dialog.showMessageBox({
        type: 'warning',
        buttons: ['Cancelar', 'Substituir meus dados'],
        defaultId: 0,
        cancelId: 0,
        message: 'Já existem dados neste computador',
        detail: 'Restaurar o backup vai substituir os dados atuais deste computador. Essa ação não pode ser desfeita.'
      });
      if (response !== 1) return { cancelado: true };
    }

    if (db.estaAberto()) db.fechar();
    return backup.importar(app.getPath('userData'), filePaths[0]);
  });
  // --- Dados (exigem o app destravado) ---
  ipcMain.handle('transacoes:listar', comBanco(() => db.listarTransacoes()));
  ipcMain.handle('transacoes:inserir', comBanco((_e, transacao) => db.inserirTransacao(transacao)));
  ipcMain.handle('transacoes:atualizar', comBanco((_e, id, campos) => db.atualizarTransacao(id, campos)));
  ipcMain.handle('transacoes:excluir', comBanco((_e, id) => db.excluirTransacao(id)));
  ipcMain.handle('transacoes:excluirGrupo', comBanco((_e, grupoId) => db.excluirGrupo(grupoId)));

  ipcMain.handle('ganhos:listar', comBanco(() => db.listarGanhos()));
  ipcMain.handle('ganhos:inserir', comBanco((_e, ganho) => db.inserirGanho(ganho)));
  ipcMain.handle('ganhos:excluir', comBanco((_e, id) => db.excluirGanho(id)));

  ipcMain.handle('cofrinhos:listar', comBanco(() => db.listarCofrinhos()));
  ipcMain.handle('cofrinhos:inserir', comBanco((_e, c) => db.inserirCofrinho(c)));
  ipcMain.handle('cofrinhos:atualizar', comBanco((_e, id, campos) => db.atualizarCofrinho(id, campos)));
  ipcMain.handle('cofrinhos:excluir', comBanco((_e, id) => db.excluirCofrinho(id)));

  ipcMain.handle('config:get', comBanco((_e, chave) => db.getConfig(chave)));
  ipcMain.handle('config:set', comBanco((_e, chave, valor) => db.setConfig(chave, valor)));

  ipcMain.handle('categorias:listar', comBanco(() => db.listarCategorias()));
  ipcMain.handle('categorias:inserir', comBanco((_e, nome) => db.inserirCategoria(nome)));
  ipcMain.handle('categorias:excluir', comBanco((_e, id) => db.excluirCategoria(id)));

  // IA local (node-llama-cpp)
  ipcMain.handle('ia:listarModelos', () => ai.listarModelos());
  ipcMain.handle('ia:baixar', (_e, id) => ai.baixarModelo(id));
  ipcMain.handle('ia:prepararChat', (_e, id, contexto) => ai.prepararChat(id, contexto));
  ipcMain.handle('ia:perguntar', (_e, pergunta) => ai.perguntar(pergunta));

  // Carteira de investimentos
  ipcMain.handle('carteira:listar', comBanco((_e, classe) => db.listarCarteira(classe)));
  ipcMain.handle('carteira:inserir', comBanco((_e, item) => db.inserirCarteira(item)));
  ipcMain.handle('carteira:atualizar', comBanco((_e, id, campos) => db.atualizarCarteira(id, campos)));
  ipcMain.handle('carteira:excluir', comBanco((_e, id) => db.excluirCarteira(id)));

  // Listas de ativos (cache + atualização via API)
  ipcMain.handle('ativos:listarCache', comBanco((_e, classe) => db.listarAtivosCache(classe)));
  ipcMain.handle('ativos:ultimaAtualizacao', comBanco((_e, classe) => db.ultimaAtualizacaoLista(classe)));
  ipcMain.handle('ativos:atualizarLista', comBanco(async (_e, classe) => {
    const ativos = await mercado.buscarLista(classe);
    return db.salvarListaAtivos(classe, ativos);
  }));

  // Dados de mercado (cotação atual + variação desde a compra), roteados por classe
  ipcMain.handle('mercado:dadosAtivo', (_e, ticker, classe, dataCompra) => mercado.dadosAtivo(ticker, classe, dataCompra));
  ipcMain.handle('mercado:cotacaoAtual', (_e, ticker, classe) => {
    // Tesouro: preço vem do cache da lista (evita rebaixar o CSV)
    if (classe === 'tesouro') {
      const preco = db.precoAtivoCache('tesouro', ticker);
      if (preco == null) throw new Error('Preço do título não encontrado. Atualize a lista.');
      return { preco, moeda: 'BRL', nome: ticker };
    }
    return mercado.cotacaoAtual(ticker, classe);
  });
  ipcMain.handle('mercado:precoNaData', (_e, ticker, classe, data) => mercado.precoNaData(ticker, classe, data));
  ipcMain.handle('mercado:dividendos', (_e, ticker, classe, dataCompra) => mercado.dividendosDesde(ticker, classe, dataCompra));
  ipcMain.handle('mercado:serie', (_e, ticker, classe, dias) => mercado.serieHistorica(ticker, classe, dias));
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.cjs')
    }
  });

  win.removeMenu();

  // Roteamento condicional (Build vs Desenvolvimento)
  if (app.isPackaged) {
    win.loadFile(path.join(__dirname, 'dist', 'index.html'));
  } else {
    win.loadURL('http://localhost:5173');
  }

  // A IA precisa da janela para enviar progresso de download e tokens
  ai.setJanela(win);
  return win;
}

// 2. Orquestração do ciclo de vida da aplicação
app.whenReady().then(() => {
  // O banco NÃO é aberto aqui: só depois que o usuário informar a senha,
  // pois a chave de criptografia é derivada dela.
  // Caminho seguro e com permissão de escrita (Ex: ~/Library/Application Support/auxiliar-financeiro/)
  cripto.inicializar(app.getPath('userData'));
  registrarHandlers();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// Encerramento seguro do banco e da interface gráfica
app.on('window-all-closed', () => {
  db.fechar();
  ai.fechar();
  if (process.platform !== 'darwin') app.quit();
});
