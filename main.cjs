const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const db = require('./db.cjs');
const ai = require('./ai.cjs');
const mercado = require('./mercado.cjs');

// 1. Registra os canais IPC que a interface usa no lugar do antigo json-server
function registrarHandlers() {
  ipcMain.handle('transacoes:listar', () => db.listarTransacoes());
  ipcMain.handle('transacoes:inserir', (_e, transacao) => db.inserirTransacao(transacao));
  ipcMain.handle('transacoes:atualizar', (_e, id, campos) => db.atualizarTransacao(id, campos));
  ipcMain.handle('transacoes:excluir', (_e, id) => db.excluirTransacao(id));
  ipcMain.handle('transacoes:excluirGrupo', (_e, grupoId) => db.excluirGrupo(grupoId));

  ipcMain.handle('ganhos:listar', () => db.listarGanhos());
  ipcMain.handle('ganhos:inserir', (_e, ganho) => db.inserirGanho(ganho));
  ipcMain.handle('ganhos:excluir', (_e, id) => db.excluirGanho(id));

  ipcMain.handle('cofrinhos:listar', () => db.listarCofrinhos());
  ipcMain.handle('cofrinhos:inserir', (_e, c) => db.inserirCofrinho(c));
  ipcMain.handle('cofrinhos:atualizar', (_e, id, campos) => db.atualizarCofrinho(id, campos));
  ipcMain.handle('cofrinhos:excluir', (_e, id) => db.excluirCofrinho(id));

  ipcMain.handle('config:get', (_e, chave) => db.getConfig(chave));
  ipcMain.handle('config:set', (_e, chave, valor) => db.setConfig(chave, valor));

  ipcMain.handle('categorias:listar', () => db.listarCategorias());
  ipcMain.handle('categorias:inserir', (_e, nome) => db.inserirCategoria(nome));
  ipcMain.handle('categorias:excluir', (_e, id) => db.excluirCategoria(id));

  // IA local (node-llama-cpp)
  ipcMain.handle('ia:listarModelos', () => ai.listarModelos());
  ipcMain.handle('ia:baixar', (_e, id) => ai.baixarModelo(id));
  ipcMain.handle('ia:prepararChat', (_e, id, contexto) => ai.prepararChat(id, contexto));
  ipcMain.handle('ia:perguntar', (_e, pergunta) => ai.perguntar(pergunta));

  // Carteira de investimentos
  ipcMain.handle('carteira:listar', (_e, classe) => db.listarCarteira(classe));
  ipcMain.handle('carteira:inserir', (_e, item) => db.inserirCarteira(item));
  ipcMain.handle('carteira:atualizar', (_e, id, campos) => db.atualizarCarteira(id, campos));
  ipcMain.handle('carteira:excluir', (_e, id) => db.excluirCarteira(id));

  // Listas de ativos (cache + atualização via API)
  ipcMain.handle('ativos:listarCache', (_e, classe) => db.listarAtivosCache(classe));
  ipcMain.handle('ativos:ultimaAtualizacao', (_e, classe) => db.ultimaAtualizacaoLista(classe));
  ipcMain.handle('ativos:atualizarLista', async (_e, classe) => {
    const ativos = await mercado.buscarLista(classe);
    return db.salvarListaAtivos(classe, ativos);
  });

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
  // Caminho seguro e com permissão de escrita (Ex: ~/Library/Application Support/auxiliar-financeiro/)
  db.inicializar(app.getPath('userData'));
  ai.inicializar(app.getPath('userData'));
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
