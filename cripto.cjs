// Cofre de chaves (envelope encryption).
//
// Uma chave aleatória (DEK) criptografa o banco SQLite. A DEK nunca é salva em
// texto claro: ela é guardada duas vezes, cifrada por chaves derivadas da senha
// do usuário e da chave de recuperação. Assim qualquer uma das duas abre o banco,
// e trocar a senha não exige recriptografar o banco inteiro.

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const ARQUIVO_COFRE = 'cofre.json';

// Parâmetros do scrypt (custo de derivação da senha)
const SCRYPT = { N: 32768, r: 8, p: 1, keylen: 32, maxmem: 128 * 32768 * 8 * 2 };

// Alfabeto sem caracteres ambíguos (0/O, 1/I/L) para a chave de recuperação
const ALFABETO = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

let userDataPath = null;

function inicializar(_userDataPath) {
  userDataPath = _userDataPath;
}

function caminhoCofre() {
  return path.join(userDataPath, ARQUIVO_COFRE);
}

function derivarChave(segredo, saltHex) {
  return crypto.scryptSync(
    segredo.normalize('NFKC'),
    Buffer.from(saltHex, 'hex'),
    SCRYPT.keylen,
    { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p, maxmem: SCRYPT.maxmem }
  );
}

// Cifra a DEK com uma chave derivada de um segredo (senha ou código de recuperação)
function embrulhar(dek, segredo) {
  const salt = crypto.randomBytes(16).toString('hex');
  const kek = derivarChave(segredo, salt);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', kek, iv);
  const cifrada = Buffer.concat([cipher.update(dek), cipher.final()]);
  return {
    salt,
    iv: iv.toString('hex'),
    tag: cipher.getAuthTag().toString('hex'),
    dek: cifrada.toString('hex')
  };
}

// Recupera a DEK a partir do segredo. Lança se o segredo estiver errado.
function desembrulhar(bloco, segredo) {
  const kek = derivarChave(segredo, bloco.salt);
  const decipher = crypto.createDecipheriv('aes-256-gcm', kek, Buffer.from(bloco.iv, 'hex'));
  decipher.setAuthTag(Buffer.from(bloco.tag, 'hex'));
  return Buffer.concat([decipher.update(Buffer.from(bloco.dek, 'hex')), decipher.final()]);
}

function lerCofre() {
  const p = caminhoCofre();
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf-8'));
}

function salvarCofre(cofre) {
  fs.writeFileSync(caminhoCofre(), JSON.stringify(cofre, null, 2), { mode: 0o600 });
}

// Gera um código no formato XXXXX-XXXXX-XXXXX-XXXXX-XXXXX
function gerarChaveRecuperacao() {
  const bytes = crypto.randomBytes(25);
  let out = '';
  for (let i = 0; i < 25; i++) {
    if (i > 0 && i % 5 === 0) out += '-';
    out += ALFABETO[bytes[i] % ALFABETO.length];
  }
  return out;
}

// Normaliza o código digitado (maiúsculas, sem espaços/hífens extras)
function normalizarCodigo(codigo) {
  return String(codigo).toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function status() {
  const cofre = lerCofre();
  return { configurado: !!cofre };
}

// Primeiro uso: cria a senha e devolve a chave de recuperação (mostrada uma única vez)
function criar(senha) {
  if (lerCofre()) throw new Error('Já existe uma senha configurada.');
  if (!senha || senha.length < 6) throw new Error('A senha precisa ter ao menos 6 caracteres.');

  const dek = crypto.randomBytes(32);
  const chaveRecuperacao = gerarChaveRecuperacao();

  salvarCofre({
    versao: 1,
    criadoEm: new Date().toISOString(),
    senha: embrulhar(dek, senha),
    recuperacao: embrulhar(dek, normalizarCodigo(chaveRecuperacao))
  });

  return { chaveRecuperacao, dek: dek.toString('hex') };
}

function destravar(senha) {
  const cofre = lerCofre();
  if (!cofre) throw new Error('Nenhuma senha configurada.');
  try {
    return { dek: desembrulhar(cofre.senha, senha).toString('hex') };
  } catch {
    throw new Error('Senha incorreta.');
  }
}

function destravarComRecuperacao(codigo) {
  const cofre = lerCofre();
  if (!cofre) throw new Error('Nenhuma senha configurada.');
  try {
    return { dek: desembrulhar(cofre.recuperacao, normalizarCodigo(codigo)).toString('hex') };
  } catch {
    throw new Error('Chave de recuperação inválida.');
  }
}

// Redefine a senha usando a DEK já obtida (por senha atual ou por recuperação)
function definirSenhaComDek(dekHex, novaSenha) {
  const cofre = lerCofre();
  if (!cofre) throw new Error('Nenhuma senha configurada.');
  if (!novaSenha || novaSenha.length < 6) throw new Error('A senha precisa ter ao menos 6 caracteres.');
  cofre.senha = embrulhar(Buffer.from(dekHex, 'hex'), novaSenha);
  cofre.alteradoEm = new Date().toISOString();
  salvarCofre(cofre);
  return { ok: true };
}

module.exports = {
  inicializar,
  status,
  criar,
  destravar,
  destravarComRecuperacao,
  definirSenhaComDek
};
