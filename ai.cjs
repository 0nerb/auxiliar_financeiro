const path = require('path');
const fs = require('fs');

// node-llama-cpp é ESM — carregado por import dinâmico e cacheado
let llamaMod = null;
let llama = null;
let modeloCache = null; // { id, model } — mantém o modelo carregado em memória
let chatState = null;   // { id, session, context } — sessão de chat ativa

let userDataPath = null;
let janela = null; // BrowserWindow para enviar progresso/tokens ao renderer

// Catálogo de modelos disponíveis (GGUF quantizado, hospedado no Hugging Face)
const MODELOS = {
  '7b': {
    id: '7b',
    nome: 'Qwen 2.5 7B — equilibrado',
    descricao: 'Melhor qualidade. Recomendado para máquinas com 16 GB de RAM ou mais.',
    // Trecho distintivo do nome do arquivo .gguf (o downloader adiciona prefixos como "hf_bartowski_")
    match: 'Qwen2.5-7B-Instruct-Q4_K_M',
    uri: 'hf:bartowski/Qwen2.5-7B-Instruct-GGUF/Qwen2.5-7B-Instruct-Q4_K_M.gguf',
    tamanho: '~4,7 GB'
  },
  '3b': {
    id: '3b',
    nome: 'Qwen 2.5 3B — leve',
    descricao: 'Mais rápido e leve. Bom para máquinas com 8 GB de RAM.',
    match: 'Qwen2.5-3B-Instruct-Q4_K_M',
    uri: 'hf:bartowski/Qwen2.5-3B-Instruct-GGUF/Qwen2.5-3B-Instruct-Q4_K_M.gguf',
    tamanho: '~2,0 GB'
  }
};

const SYSTEM_PROMPT_CHAT = [
  'Você é um assistente financeiro pessoal que conversa em português do Brasil, de forma clara, direta e amigável.',
  'O usuário vai te fazer perguntas sobre as finanças dele. Use os DADOS FINANCEIROS fornecidos abaixo para responder.',
  'Não invente números que não estejam nos dados; se não souber, diga que não tem essa informação.',
  'Ao comentar investimentos, deixe claro que são observações educacionais e não recomendação formal de compra/venda.',
  'Seja conciso e use tópicos quando fizer sentido.'
].join(' ');

function inicializar(_userDataPath) {
  userDataPath = _userDataPath;
  const dir = path.join(userDataPath, 'modelos');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function setJanela(win) {
  janela = win;
}

function pastaModelos() {
  return path.join(userDataPath, 'modelos');
}

// Encontra o arquivo .gguf do modelo na pasta, tolerando prefixos do downloader.
function caminhoModelo(id) {
  const dir = pastaModelos();
  if (!fs.existsSync(dir)) return null;
  const alvo = MODELOS[id].match;
  const arquivo = fs.readdirSync(dir).find(f => f.endsWith('.gguf') && f.includes(alvo));
  return arquivo ? path.join(dir, arquivo) : null;
}

async function carregarLib() {
  if (!llamaMod) llamaMod = await import('node-llama-cpp');
  if (!llama) llama = await llamaMod.getLlama();
  return llamaMod;
}

// Lista os modelos e indica quais já estão baixados
function listarModelos() {
  return Object.values(MODELOS).map(m => ({
    id: m.id,
    nome: m.nome,
    descricao: m.descricao,
    tamanho: m.tamanho,
    baixado: !!caminhoModelo(m.id)
  }));
}

// Baixa o modelo, emitindo progresso para o renderer
async function baixarModelo(id) {
  const modelo = MODELOS[id];
  if (!modelo) throw new Error('Modelo desconhecido: ' + id);
  if (caminhoModelo(id)) return { ok: true, jaExistia: true };

  const mod = await carregarLib();
  const downloader = await mod.createModelDownloader({
    modelUri: modelo.uri,
    dirPath: pastaModelos(),
    onProgress: ({ totalSize, downloadedSize }) => {
      const pct = totalSize > 0 ? downloadedSize / totalSize : 0;
      if (janela && !janela.isDestroyed()) {
        janela.webContents.send('ia:progresso', { id, totalSize, downloadedSize, pct });
      }
    }
  });

  await downloader.download();
  return { ok: true };
}

// Garante o modelo carregado em memória (cacheado entre perguntas)
async function garantirModelo(id) {
  const caminho = caminhoModelo(id);
  if (!caminho) throw new Error('Modelo ainda não foi baixado.');
  await carregarLib();
  if (!modeloCache || modeloCache.id !== id) {
    if (modeloCache?.model) { try { await modeloCache.model.dispose(); } catch { /* noop */ } }
    const model = await llama.loadModel({ modelPath: caminho });
    modeloCache = { id, model };
  }
  return modeloCache.model;
}

// Inicia (ou reinicia) uma sessão de chat com os dados financeiros como contexto
async function prepararChat(id, contexto) {
  const mod = await carregarLib();
  const model = await garantirModelo(id);

  if (chatState?.context) { try { await chatState.context.dispose(); } catch { /* noop */ } }

  const context = await model.createContext({ contextSize: { max: 8192 } });
  const systemPrompt = `${SYSTEM_PROMPT_CHAT}\n\n=== DADOS FINANCEIROS DO USUÁRIO ===\n${contexto}`;
  const session = new mod.LlamaChatSession({
    contextSequence: context.getSequence(),
    systemPrompt
  });
  chatState = { id, session, context };
  return { ok: true };
}

// Envia uma pergunta na sessão atual (mantém histórico), com streaming de tokens
async function perguntar(pergunta) {
  if (!chatState) throw new Error('Chat não iniciado.');
  const resposta = await chatState.session.prompt(pergunta, {
    temperature: 0.4,
    maxTokens: 800,
    onTextChunk: (chunk) => {
      if (janela && !janela.isDestroyed()) janela.webContents.send('ia:token', chunk);
    }
  });
  return { ok: true, texto: resposta };
}

function fechar() {
  if (chatState?.context) { try { chatState.context.dispose(); } catch { /* noop */ } }
  if (modeloCache?.model) { try { modeloCache.model.dispose(); } catch { /* noop */ } }
  chatState = null;
  modeloCache = null;
}

module.exports = {
  inicializar,
  setJanela,
  listarModelos,
  baixarModelo,
  prepararChat,
  perguntar,
  fechar
};
