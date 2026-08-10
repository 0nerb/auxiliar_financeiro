# desktop

Aplicativo para Windows e macOS, em Electron. A interface vem de `../shared`;
aqui fica tudo que depende do sistema operacional.

## Comandos

```bash
npm install
npm run electron:dev      # desenvolvimento (Vite + Electron)
npm run build             # compila a interface para dist/
npm run lint              # verifica shared/ e desktop/
npm run dist:mac          # gera o .dmg em release/
npm run dist:win          # gera o .exe (só funciona rodando no Windows)
```

## Processo principal

| Arquivo | Responsabilidade |
|---|---|
| `main.cjs` | Ciclo de vida, janela e registro dos canais IPC |
| `preload.cjs` | Define `window.api` — a ponte com a interface |
| `db.cjs` | Banco SQLite criptografado (SQLCipher) |
| `cripto.cjs` | Cofre de chaves: senha e chave de recuperação |
| `backup.cjs` | Exportação e restauração do arquivo `.afbackup` |
| `mercado.cjs` | Cotações e listas de ativos (brapi, Yahoo, CoinGecko, Tesouro) |
| `ai.cjs` | Modelos de IA locais via node-llama-cpp |

As chamadas às APIs de mercado ficam aqui, e não na interface, porque o
processo principal não sofre bloqueio de CORS.

## Segurança dos dados

O banco fica em `financeiro.db`, criptografado com AES-256, na pasta de dados
do usuário (`~/Library/Application Support/auxiliar-financeiro` no macOS,
`%APPDATA%\auxiliar-financeiro` no Windows).

Uma chave aleatória criptografa o banco e é guardada em `cofre.json`, embrulhada
duas vezes: pela senha do usuário e pela chave de recuperação. A senha em si
nunca é armazenada. Sem uma das duas, os dados não são recuperáveis.

## Pontos de atenção

- Alterações em `../shared` e `src/` recarregam sozinhas; mudanças nos `.cjs`
  exigem reiniciar o app.
- `better-sqlite3-multiple-ciphers` e `node-llama-cpp` são módulos nativos.
  Depois de reinstalar dependências, rode
  `npx electron-rebuild -f -w better-sqlite3-multiple-ciphers`.
- O `node_modules` precisa ficar nesta pasta: o electron-builder procura o
  Electron e os módulos nativos a partir daqui.
- Ao adicionar uma dependência usada pelo código de `../shared`, inclua-a em
  `DEPS_COMPARTILHADAS` no `vite.config.js`.
- Compilar não garante que o app abre. Antes de publicar, gere o instalador e
  abra o aplicativo empacotado ao menos uma vez.
