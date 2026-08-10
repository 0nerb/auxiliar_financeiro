# Auxiliar Financeiro

Controle financeiro pessoal: contas, gastos parcelados, ganhos, cofrinhos e
carteira de investimentos (ações, FIIs, Tesouro Direto e Bitcoin), com análise
por IA rodando localmente.

O repositório abriga **duas versões do mesmo aplicativo**, que compartilham a
interface:

```
.
├── shared/         Telas e regras em React, usadas pelas duas versões
├── desktop/        Aplicativo para Windows e macOS (Electron)
└── web/            Versão para navegador (em construção)
```

## Como as versões se relacionam

Toda a interface conversa com o backend por um único objeto: **`window.api`**.
É essa a fronteira entre o que é comum e o que é específico de cada versão.

| | Desktop | Web |
|---|---|---|
| `window.api` | IPC do Electron | Chamadas HTTP à API |
| Dados | SQLite local criptografado | Banco no servidor |
| Acesso | Senha local (chave de criptografia) | Contas de usuário |
| IA | Modelo rodando na máquina | Não prevista por ora |

Trocando a implementação de `window.api`, as mesmas telas funcionam nos dois
ambientes.

## Desktop

```bash
cd desktop
npm install
npm run electron:dev     # roda em desenvolvimento
```

Outros comandos: `npm run build` (compila a interface), `npm run dist:mac` e
`npm run dist:win` (geram os instaladores em `desktop/release`).

O `.exe` de cada versão é gerado automaticamente pelo GitHub Actions a cada
push na `main` — veja a aba **Actions**.

> Alterações em `shared/` e `desktop/src` recarregam sozinhas. Mudanças nos
> arquivos `.cjs` (processo principal do Electron) exigem reiniciar o app.

## Web

Ainda não implementada. Veja [`web/README.md`](web/README.md) para o plano.

## Documentação por pasta

- [`shared/README.md`](shared/README.md) — o que vive no código compartilhado
- [`desktop/README.md`](desktop/README.md) — arquitetura do aplicativo desktop
- [`web/README.md`](web/README.md) — plano da versão web
