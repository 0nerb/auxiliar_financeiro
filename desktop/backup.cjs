// Exportação de backup.
//
// O arquivo gerado é autossuficiente: leva o banco JÁ CRIPTOGRAFADO e o cofre de
// chaves (que guarda a chave do banco embrulhada pela senha e pela chave de
// recuperação). Sem isso, um banco cifrado exportado sozinho seria irrecuperável,
// pois a chave real é aleatória e vive apenas no cofre.
//
// O conteúdo permanece protegido por AES-256: sem a senha (ou a chave de
// recuperação) o arquivo não abre, mesmo que alguém o obtenha.

const path = require('path');
const fs = require('fs');

const MARCA = 'auxiliar-financeiro-backup';

// Gera o arquivo de backup em `destino`.
function exportar(userDataPath, destino, prepararBanco) {
  const dbPath = path.join(userDataPath, 'financeiro.db');
  const cofrePath = path.join(userDataPath, 'cofre.json');

  if (!fs.existsSync(dbPath)) throw new Error('Banco de dados não encontrado.');
  if (!fs.existsSync(cofrePath)) throw new Error('Cofre de chaves não encontrado.');

  // Descarrega o WAL no arquivo principal para o backup sair completo
  if (typeof prepararBanco === 'function') prepararBanco();

  const bytesBanco = fs.readFileSync(dbPath);

  // Segurança: o banco precisa estar cifrado (arquivos SQLite em texto claro
  // começam com "SQLite format 3"). Nunca exportar dados legíveis.
  if (bytesBanco.slice(0, 15).toString('utf8').startsWith('SQLite format 3')) {
    throw new Error('O banco não está criptografado. Exportação cancelada por segurança.');
  }

  const conteudo = {
    marca: MARCA,
    versao: 1,
    exportadoEm: new Date().toISOString(),
    cofre: JSON.parse(fs.readFileSync(cofrePath, 'utf-8')),
    banco: bytesBanco.toString('base64')
  };

  fs.writeFileSync(destino, JSON.stringify(conteudo), { mode: 0o600 });

  return {
    ok: true,
    caminho: destino,
    tamanho: fs.statSync(destino).size,
    exportadoEm: conteudo.exportadoEm
  };
}

function nomeSugerido() {
  const hoje = new Date().toISOString().split('T')[0];
  return `auxiliar-financeiro-${hoje}.afbackup`;
}

// Restaura um backup na pasta de dados do app.
// Continua criptografado: só será aberto quando o usuário informar a senha.
function importar(userDataPath, arquivo) {
  let pacote;
  try {
    pacote = JSON.parse(fs.readFileSync(arquivo, 'utf-8'));
  } catch {
    throw new Error('Arquivo inválido ou corrompido.');
  }

  if (pacote.marca !== MARCA) {
    throw new Error('Este arquivo não é um backup do Auxiliar Financeiro.');
  }
  if (!pacote.cofre || !pacote.banco) {
    throw new Error('O backup está incompleto.');
  }

  const bytesBanco = Buffer.from(pacote.banco, 'base64');
  if (bytesBanco.slice(0, 15).toString('utf8').startsWith('SQLite format 3')) {
    throw new Error('O backup contém dados não criptografados. Importação cancelada.');
  }

  const dbPath = path.join(userDataPath, 'financeiro.db');
  const cofrePath = path.join(userDataPath, 'cofre.json');

  // Guarda o que existia (se existia) para poder desfazer em caso de falha
  const anteriores = [];
  [dbPath, cofrePath, `${dbPath}-wal`, `${dbPath}-shm`].forEach(p => {
    if (fs.existsSync(p)) {
      const tmp = `${p}.substituido`;
      fs.renameSync(p, tmp);
      anteriores.push([p, tmp]);
    }
  });

  try {
    fs.writeFileSync(dbPath, bytesBanco, { mode: 0o600 });
    fs.writeFileSync(cofrePath, JSON.stringify(pacote.cofre, null, 2), { mode: 0o600 });
  } catch (e) {
    anteriores.forEach(([p, tmp]) => { try { fs.renameSync(tmp, p); } catch { /* noop */ } });
    throw new Error('Falha ao restaurar o backup: ' + e.message);
  }

  // Deu certo: remove os arquivos substituídos
  anteriores.forEach(([, tmp]) => { try { fs.unlinkSync(tmp); } catch { /* noop */ } });

  return { ok: true, exportadoEm: pacote.exportadoEm, substituiuDados: anteriores.length > 0 };
}

// Existe algum dado já configurado nesta máquina?
function temDadosLocais(userDataPath) {
  return fs.existsSync(path.join(userDataPath, 'cofre.json'));
}

module.exports = { exportar, importar, temDadosLocais, nomeSugerido, MARCA };
