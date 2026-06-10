const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const Database = require('better-sqlite3');

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
  `);

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

function inicializar(userDataPath) {
  const dbPath = path.join(userDataPath, 'financeiro.db');
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  criarTabelas();
  semearCategorias();
  migrarDoJson(dbPath);
  console.log('[DB] Banco SQLite operando em:', dbPath);
  return dbPath;
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
function atualizarTransacao(id, campos) {
  const permitidos = {
    mesesPagos: v => JSON.stringify(v),
    mesFim: v => v,
    anoFim: v => v,
    pago: v => (v ? 1 : 0),
    comentario: v => v,
    categoria: v => v,
    valor: v => v
  };

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

function excluirTransacao(id) {
  db.prepare('DELETE FROM transacoes WHERE id = ?').run(id);
  return { id };
}

// Exclui todas as parcelas de uma mesma compra (mesmo grupoId)
function excluirGrupo(grupoId) {
  const info = db.prepare('DELETE FROM transacoes WHERE grupoId = ?').run(grupoId);
  return { grupoId, removidos: info.changes };
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
}

module.exports = {
  inicializar,
  listarTransacoes,
  inserirTransacao,
  atualizarTransacao,
  excluirTransacao,
  excluirGrupo,
  listarCategorias,
  inserirCategoria,
  excluirCategoria,
  fechar
};
