const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const Database = require('better-sqlite3-multiple-ciphers');

let db = null;

const CATEGORIAS_PADRAO = ['Restaurante', 'Uber', 'Transporte público', 'Breno', 'Relacionamento', 'Investimento', 'Academia', 'Saúde'];

// Gera um id curto e único (compatível com os ids antigos do json-server)
function gerarId() {
  return crypto.randomBytes(8).toString('base64url');
}

// Converte uma linha do banco no formato que a interface espera
function mapearTransacao(row) {
  if (!row) return null;
  // Compatibilidade: dados antigos não têm anoReferente — deriva do campo data (YYYY-MM-DD)
  const anoReferente = row.anoReferente != null
    ? row.anoReferente
    : (row.data ? parseInt(row.data.split('-')[0], 10) : new Date().getFullYear());
  return {
    id: row.id,
    tipo: row.tipo,
    categoria: row.categoria,
    valor: row.valor,
    parcelas: row.parcelas,
    parcelaAtual: row.parcelaAtual ?? undefined,
    data: row.data,
    comentario: row.comentario ?? '',
    formaPagamento: row.formaPagamento,
    mesReferente: row.mesReferente,
    anoReferente,
    mesFim: row.mesFim ?? undefined,
    anoFim: row.anoFim ?? undefined,
    grupoId: row.grupoId ?? undefined,
    pago: !!row.pago,
    mesesPagos: row.mesesPagos ? JSON.parse(row.mesesPagos) : []
  };
}

function criarTabelas() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS categorias (
      id   TEXT PRIMARY KEY,
      nome TEXT NOT NULL UNIQUE
    );

    CREATE TABLE IF NOT EXISTS transacoes (
      id             TEXT PRIMARY KEY,
      tipo           TEXT,
      categoria      TEXT,
      valor          REAL,
      parcelas       INTEGER DEFAULT 1,
      parcelaAtual   INTEGER,
      data           TEXT,
      comentario     TEXT,
      formaPagamento TEXT,
      mesReferente   TEXT,
      anoReferente   INTEGER,
      mesFim         TEXT,
      anoFim         INTEGER,
      grupoId        TEXT,
      pago           INTEGER DEFAULT 0,
      mesesPagos     TEXT DEFAULT '[]'
    );

    CREATE TABLE IF NOT EXISTS ganhos (
      id           TEXT PRIMARY KEY,
      valor        REAL,
      mesReferente TEXT,
      anoReferente INTEGER,
      comentario   TEXT,
      data         TEXT
    );

    CREATE TABLE IF NOT EXISTS cofrinhos (
      id            TEXT PRIMARY KEY,
      nome          TEXT,
      valor         REAL,
      percentualCdi REAL,
      dataDeposito  TEXT,
      comentario    TEXT
    );

    CREATE TABLE IF NOT EXISTS configuracoes (
      chave TEXT PRIMARY KEY,
      valor TEXT
    );

    CREATE TABLE IF NOT EXISTS carteira (
      id          TEXT PRIMARY KEY,
      classe      TEXT,
      ticker      TEXT,
      nome        TEXT,
      quantidade  REAL,
      precoCompra REAL,
      dataCompra  TEXT,
      comentario  TEXT
    );

    CREATE TABLE IF NOT EXISTS ativos_cache (
      classe       TEXT,
      ticker       TEXT,
      nome         TEXT,
      subtipo      TEXT,
      setor        TEXT,
      preco        REAL,
      atualizadoEm TEXT,
      PRIMARY KEY (classe, ticker)
    );
  `);

  // Migração: coluna preco no cache de ativos (para bancos criados antes)
  const colsCache = db.prepare('PRAGMA table_info(ativos_cache)').all().map(c => c.name);
  if (!colsCache.includes('preco')) {
    db.exec('ALTER TABLE ativos_cache ADD COLUMN preco REAL');
  }

  // Migração para bancos já existentes: adiciona colunas novas se faltarem
  const colunas = db.prepare('PRAGMA table_info(transacoes)').all().map(c => c.name);
  const adicionar = {
    anoReferente: 'INTEGER',
    anoFim: 'INTEGER',
    grupoId: 'TEXT'
  };
  for (const [nome, tipo] of Object.entries(adicionar)) {
    if (!colunas.includes(nome)) {
      db.exec(`ALTER TABLE transacoes ADD COLUMN ${nome} ${tipo}`);
      console.log(`[DB] Coluna "${nome}" adicionada à tabela transacoes.`);
    }
  }
}

function semearCategorias() {
  const total = db.prepare('SELECT COUNT(*) AS n FROM categorias').get().n;
  if (total > 0) return;
  const insert = db.prepare('INSERT INTO categorias (id, nome) VALUES (?, ?)');
  const tx = db.transaction(() => {
    CATEGORIAS_PADRAO.forEach((nome, i) => insert.run('cat' + (i + 1), nome));
  });
  tx();
}

// Importa os dados de um db.json antigo (json-server) na primeira execução
function migrarDoJson(dbPath) {
  const total = db.prepare('SELECT COUNT(*) AS n FROM transacoes').get().n;
  if (total > 0) return; // já migrado / já possui dados

  const jsonAntigo = path.join(path.dirname(dbPath), 'db.json');
  if (!fs.existsSync(jsonAntigo)) return;

  let dados;
  try {
    dados = JSON.parse(fs.readFileSync(jsonAntigo, 'utf-8'));
  } catch (e) {
    console.error('[DB] Falha ao ler db.json para migração:', e);
    return;
  }

  const tx = db.transaction(() => {
    if (Array.isArray(dados.transacoes)) {
      dados.transacoes.forEach(t => inserirTransacao(t, t.id));
    }
    // Categorias do json-server substituem as padrão, se existirem
    if (Array.isArray(dados.categorias) && dados.categorias.length > 0) {
      db.prepare('DELETE FROM categorias').run();
      const insert = db.prepare('INSERT OR IGNORE INTO categorias (id, nome) VALUES (?, ?)');
      dados.categorias.forEach(c => insert.run(c.id || gerarId(), c.nome));
    }
  });
  tx();
  console.log(`[DB] Migração concluída: ${dados.transacoes?.length || 0} transações importadas do db.json.`);
}

// Detecta um banco ainda em texto claro (arquivos SQLite começam com "SQLite format 3")
function estaEmTextoClaro(dbPath) {
  if (!fs.existsSync(dbPath)) return false;
  const fd = fs.openSync(dbPath, 'r');
  const buf = Buffer.alloc(16);
  fs.readSync(fd, buf, 0, 16, 0);
  fs.closeSync(fd);
  return buf.toString('utf8').startsWith('SQLite format 3');
}

// Converte um banco em texto claro para cifrado, preservando os dados.
// Trabalha numa cópia e só substitui o original após validar.
// Retorna o caminho do backup temporário (em texto claro), que deve ser
// apagado assim que o banco cifrado abrir com sucesso.
function cifrarBancoExistente(dbPath, chave) {
  const backup = `${dbPath}.backup-${Date.now()}`;
  const temp = `${dbPath}.cifrando`;

  // Consolida o WAL no arquivo principal antes de copiar
  const plano = new Database(dbPath);
  plano.pragma('wal_checkpoint(TRUNCATE)');
  const contagem = plano.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table'").get().n;
  plano.close();

  fs.copyFileSync(dbPath, backup);
  fs.copyFileSync(dbPath, temp);

  const alvo = new Database(temp);
  alvo.pragma(`rekey='${chave}'`);
  alvo.close();

  // Valida a cópia cifrada antes de promovê-la
  const verif = new Database(temp);
  verif.pragma(`key='${chave}'`);
  const contagemNova = verif.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table'").get().n;
  verif.close();

  if (contagemNova !== contagem) {
    fs.unlinkSync(temp);
    throw new Error('Falha ao criptografar o banco: os dados não conferem. Nada foi alterado.');
  }

  ['-wal', '-shm'].forEach(sufixo => {
    const f = dbPath + sufixo;
    if (fs.existsSync(f)) fs.unlinkSync(f);
  });
  fs.renameSync(temp, dbPath);
  console.log('[DB] Banco criptografado com sucesso.');
  return backup;
}

// Remove com sobrescrita os bytes de um arquivo antes de apagar,
// para que o conteúdo em texto claro não fique recuperável no disco.
function apagarComSobrescrita(arquivo) {
  try {
    if (!fs.existsSync(arquivo)) return;
    const tamanho = fs.statSync(arquivo).size;
    const fd = fs.openSync(arquivo, 'r+');
    fs.writeSync(fd, crypto.randomBytes(tamanho), 0, tamanho, 0);
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fs.unlinkSync(arquivo);
  } catch (e) {
    console.error('[DB] Não foi possível apagar o arquivo temporário:', e.message);
  }
}

function inicializar(userDataPath, chave) {
  if (!chave) throw new Error('O banco só pode ser aberto com a chave de criptografia.');
  const dbPath = path.join(userDataPath, 'financeiro.db');

  let backupEmClaro = null;
  if (estaEmTextoClaro(dbPath)) backupEmClaro = cifrarBancoExistente(dbPath, chave);

  db = new Database(dbPath);
  db.pragma(`key='${chave}'`);
  db.prepare('SELECT count(*) FROM sqlite_master').get(); // falha cedo se a chave estiver errada
  db.pragma('journal_mode = WAL');

  // Banco cifrado abriu: o backup em texto claro não pode continuar no disco
  if (backupEmClaro) {
    apagarComSobrescrita(backupEmClaro);
    console.log('[DB] Backup temporário em texto claro removido com segurança.');
  }
  criarTabelas();
  semearCategorias();
  migrarDoJson(dbPath);
  console.log('[DB] Banco SQLite (criptografado) operando em:', dbPath);
  return dbPath;
}

function estaAberto() {
  return db !== null;
}

// Descarrega o WAL no arquivo principal (usado antes de exportar um backup)
function consolidar() {
  if (db) db.pragma('wal_checkpoint(TRUNCATE)');
}

// ---- Transações ----

function listarTransacoes() {
  return db.prepare('SELECT * FROM transacoes').all().map(mapearTransacao);
}

function inserirTransacao(t, idExistente) {
  const id = idExistente || gerarId();
  db.prepare(`
    INSERT INTO transacoes
      (id, tipo, categoria, valor, parcelas, parcelaAtual, data, comentario, formaPagamento, mesReferente, anoReferente, mesFim, anoFim, grupoId, pago, mesesPagos)
    VALUES
      (@id, @tipo, @categoria, @valor, @parcelas, @parcelaAtual, @data, @comentario, @formaPagamento, @mesReferente, @anoReferente, @mesFim, @anoFim, @grupoId, @pago, @mesesPagos)
  `).run({
    id,
    tipo: t.tipo ?? null,
    categoria: t.categoria ?? null,
    valor: t.valor ?? 0,
    parcelas: t.parcelas ?? 1,
    parcelaAtual: t.parcelaAtual ?? null,
    data: t.data ?? null,
    comentario: t.comentario ?? '',
    formaPagamento: t.formaPagamento ?? null,
    mesReferente: t.mesReferente ?? null,
    anoReferente: t.anoReferente ?? null,
    mesFim: t.mesFim ?? null,
    anoFim: t.anoFim ?? null,
    grupoId: t.grupoId ?? null,
    pago: t.pago ? 1 : 0,
    mesesPagos: JSON.stringify(t.mesesPagos ?? [])
  });
  return mapearTransacao(db.prepare('SELECT * FROM transacoes WHERE id = ?').get(id));
}

// Atualização parcial — aceita apenas campos conhecidos
// Campos que a edição de um lançamento pode alterar.
// Os de PARCELA_COMPARTILHADA descrevem a compra inteira e podem ser aplicados
// a todas as parcelas de uma vez; os demais são próprios de cada linha.
const CAMPOS_EDITAVEIS = {
  mesesPagos: v => JSON.stringify(v),
  mesFim: v => v,
  anoFim: v => v,
  pago: v => (v ? 1 : 0),
  comentario: v => v,
  categoria: v => v,
  valor: v => Number(v),
  data: v => v,
  formaPagamento: v => v,
  mesReferente: v => v,
  anoReferente: v => (v == null ? null : parseInt(v, 10)),
  parcelaAtual: v => (v == null ? null : parseInt(v, 10))
};

const PARCELA_COMPARTILHADA = ['categoria', 'valor', 'comentario', 'formaPagamento'];

function atualizarTransacao(id, campos) {
  const permitidos = CAMPOS_EDITAVEIS;

  const sets = [];
  const valores = {};
  for (const [chave, transform] of Object.entries(permitidos)) {
    if (chave in campos) {
      sets.push(`${chave} = @${chave}`);
      valores[chave] = transform(campos[chave]);
    }
  }
  if (sets.length === 0) return mapearTransacao(db.prepare('SELECT * FROM transacoes WHERE id = ?').get(id));

  valores.id = id;
  db.prepare(`UPDATE transacoes SET ${sets.join(', ')} WHERE id = @id`).run(valores);
  return mapearTransacao(db.prepare('SELECT * FROM transacoes WHERE id = ?').get(id));
}

// Aplica a todas as parcelas de uma compra os campos que descrevem a compra
// inteira (categoria, valor, forma e comentário). Mês, data e número da
// parcela são próprios de cada linha e por isso ficam de fora.
function atualizarGrupo(grupoId, campos) {
  const sets = [];
  const valores = {};
  for (const chave of PARCELA_COMPARTILHADA) {
    if (chave in campos) {
      sets.push(`${chave} = @${chave}`);
      valores[chave] = CAMPOS_EDITAVEIS[chave](campos[chave]);
    }
  }
  if (sets.length === 0) return listarTransacoesDoGrupo(grupoId);

  valores.grupoId = grupoId;
  db.prepare(`UPDATE transacoes SET ${sets.join(', ')} WHERE grupoId = @grupoId`).run(valores);
  return listarTransacoesDoGrupo(grupoId);
}

// Renumera parcelas em lote, numa única transação para não deixar a sequência
// pela metade se algo falhar. A ordem cronológica é decidida na interface,
// que é quem conhece a ordem dos meses — aqui só se aplicam os pares prontos.
function renumerarParcelas(pares) {
  const atualizar = db.prepare('UPDATE transacoes SET parcelaAtual = @parcelaAtual WHERE id = @id');
  const emLote = db.transaction((lista) => {
    for (const { id, parcelaAtual } of lista) {
      atualizar.run({ id, parcelaAtual: parseInt(parcelaAtual, 10) });
    }
  });
  emLote(pares);
  return { atualizados: pares.length };
}

function listarTransacoesDoGrupo(grupoId) {
  return db.prepare('SELECT * FROM transacoes WHERE grupoId = ?').all(grupoId).map(mapearTransacao);
}

function excluirTransacao(id) {
  db.prepare('DELETE FROM transacoes WHERE id = ?').run(id);
  return { id };
}

// Exclui todas as parcelas de uma mesma compra (mesmo grupoId)
function excluirGrupo(grupoId) {
  const info = db.prepare('DELETE FROM transacoes WHERE grupoId = ?').run(grupoId);
  return { grupoId, removidos: info.changes };
}

// ---- Ganhos (renda por mês) ----

function listarGanhos() {
  return db.prepare('SELECT * FROM ganhos').all();
}

function inserirGanho(g) {
  const id = gerarId();
  db.prepare(`
    INSERT INTO ganhos (id, valor, mesReferente, anoReferente, comentario, data)
    VALUES (@id, @valor, @mesReferente, @anoReferente, @comentario, @data)
  `).run({
    id,
    valor: g.valor ?? 0,
    mesReferente: g.mesReferente ?? null,
    anoReferente: g.anoReferente ?? null,
    comentario: g.comentario ?? '',
    data: g.data ?? null
  });
  return db.prepare('SELECT * FROM ganhos WHERE id = ?').get(id);
}

function excluirGanho(id) {
  db.prepare('DELETE FROM ganhos WHERE id = ?').run(id);
  return { id };
}

// ---- Cofrinhos (reservas que rendem % do CDI) ----

function listarCofrinhos() {
  return db.prepare('SELECT * FROM cofrinhos ORDER BY rowid').all();
}

function inserirCofrinho(c) {
  const id = gerarId();
  db.prepare(`
    INSERT INTO cofrinhos (id, nome, valor, percentualCdi, dataDeposito, comentario)
    VALUES (@id, @nome, @valor, @percentualCdi, @dataDeposito, @comentario)
  `).run({
    id,
    nome: c.nome ?? '',
    valor: c.valor ?? 0,
    percentualCdi: c.percentualCdi ?? 100,
    dataDeposito: c.dataDeposito ?? null,
    comentario: c.comentario ?? ''
  });
  return db.prepare('SELECT * FROM cofrinhos WHERE id = ?').get(id);
}

function atualizarCofrinho(id, campos) {
  const permitidos = ['nome', 'valor', 'percentualCdi', 'dataDeposito', 'comentario'];
  const sets = [];
  const valores = {};
  for (const chave of permitidos) {
    if (chave in campos) {
      sets.push(`${chave} = @${chave}`);
      valores[chave] = campos[chave];
    }
  }
  if (sets.length === 0) return db.prepare('SELECT * FROM cofrinhos WHERE id = ?').get(id);
  valores.id = id;
  db.prepare(`UPDATE cofrinhos SET ${sets.join(', ')} WHERE id = @id`).run(valores);
  return db.prepare('SELECT * FROM cofrinhos WHERE id = ?').get(id);
}

function excluirCofrinho(id) {
  db.prepare('DELETE FROM cofrinhos WHERE id = ?').run(id);
  return { id };
}

// ---- Configurações chave/valor (taxa CDI etc.) ----

function getConfig(chave) {
  const row = db.prepare('SELECT valor FROM configuracoes WHERE chave = ?').get(chave);
  return row ? row.valor : null;
}

function setConfig(chave, valor) {
  db.prepare(`
    INSERT INTO configuracoes (chave, valor) VALUES (?, ?)
    ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor
  `).run(chave, String(valor));
  return { chave, valor };
}

// ---- Carteira de investimentos ----

function listarCarteira(classe) {
  if (classe) {
    return db.prepare('SELECT * FROM carteira WHERE classe = ? ORDER BY rowid').all(classe);
  }
  return db.prepare('SELECT * FROM carteira ORDER BY rowid').all();
}

function inserirCarteira(item) {
  const id = gerarId();
  db.prepare(`
    INSERT INTO carteira (id, classe, ticker, nome, quantidade, precoCompra, dataCompra, comentario)
    VALUES (@id, @classe, @ticker, @nome, @quantidade, @precoCompra, @dataCompra, @comentario)
  `).run({
    id,
    classe: item.classe ?? null,
    ticker: item.ticker ?? null,
    nome: item.nome ?? null,
    quantidade: item.quantidade ?? 0,
    precoCompra: item.precoCompra ?? null,
    dataCompra: item.dataCompra ?? null,
    comentario: item.comentario ?? ''
  });
  return db.prepare('SELECT * FROM carteira WHERE id = ?').get(id);
}

function atualizarCarteira(id, campos) {
  const permitidos = ['quantidade', 'precoCompra', 'dataCompra', 'comentario'];
  const sets = [];
  const valores = {};
  for (const chave of permitidos) {
    if (chave in campos) { sets.push(`${chave} = @${chave}`); valores[chave] = campos[chave]; }
  }
  if (sets.length === 0) return db.prepare('SELECT * FROM carteira WHERE id = ?').get(id);
  valores.id = id;
  db.prepare(`UPDATE carteira SET ${sets.join(', ')} WHERE id = @id`).run(valores);
  return db.prepare('SELECT * FROM carteira WHERE id = ?').get(id);
}

function excluirCarteira(id) {
  db.prepare('DELETE FROM carteira WHERE id = ?').run(id);
  return { id };
}

// ---- Cache de listas de ativos ----

function salvarListaAtivos(classe, ativos) {
  const agora = new Date().toISOString();
  const del = db.prepare('DELETE FROM ativos_cache WHERE classe = ?');
  const ins = db.prepare(`
    INSERT OR REPLACE INTO ativos_cache (classe, ticker, nome, subtipo, setor, preco, atualizadoEm)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const tx = db.transaction(() => {
    del.run(classe);
    ativos.forEach(a => ins.run(classe, a.ticker, a.nome, a.subtipo ?? null, a.setor ?? null, a.preco ?? null, agora));
  });
  tx();
  return { classe, total: ativos.length, atualizadoEm: agora };
}

function listarAtivosCache(classe) {
  return db.prepare('SELECT ticker, nome, subtipo, setor, preco FROM ativos_cache WHERE classe = ? ORDER BY ticker').all(classe);
}

// Preço cacheado de um ativo (usado pelo Tesouro, cujo preço vem da lista)
function precoAtivoCache(classe, ticker) {
  const row = db.prepare('SELECT preco FROM ativos_cache WHERE classe = ? AND ticker = ?').get(classe, ticker);
  return row ? row.preco : null;
}

function ultimaAtualizacaoLista(classe) {
  const row = db.prepare('SELECT MAX(atualizadoEm) AS em FROM ativos_cache WHERE classe = ?').get(classe);
  return row ? row.em : null;
}

// ---- Categorias ----

function listarCategorias() {
  return db.prepare('SELECT * FROM categorias ORDER BY rowid').all();
}

function inserirCategoria(nome) {
  const id = gerarId();
  db.prepare('INSERT INTO categorias (id, nome) VALUES (?, ?)').run(id, nome);
  return { id, nome };
}

function excluirCategoria(id) {
  db.prepare('DELETE FROM categorias WHERE id = ?').run(id);
  return { id };
}

function fechar() {
  if (db) db.close();
  db = null;
}

module.exports = {
  inicializar,
  estaAberto,
  consolidar,
  listarTransacoes,
  inserirTransacao,
  atualizarTransacao,
  atualizarGrupo,
  renumerarParcelas,
  excluirTransacao,
  excluirGrupo,
  listarGanhos,
  inserirGanho,
  excluirGanho,
  listarCofrinhos,
  inserirCofrinho,
  atualizarCofrinho,
  excluirCofrinho,
  getConfig,
  setConfig,
  listarCarteira,
  inserirCarteira,
  atualizarCarteira,
  excluirCarteira,
  salvarListaAtivos,
  listarAtivosCache,
  precoAtivoCache,
  ultimaAtualizacaoLista,
  listarCategorias,
  inserirCategoria,
  excluirCategoria,
  fechar
};
