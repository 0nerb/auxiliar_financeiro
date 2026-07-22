const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const db = require('./db.cjs');

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
}

// 2. Orquestração do ciclo de vida da aplicação
app.whenReady().then(() => {
  // Caminho seguro e com permissão de escrita (Ex: ~/Library/Application Support/auxiliar-financeiro/)
  db.inicializar(app.getPath('userData'));
  registrarHandlers();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// Encerramento seguro do banco e da interface gráfica
app.on('window-all-closed', () => {
  db.fechar();
  if (process.platform !== 'darwin') app.quit();
});
