# web

Versão do Auxiliar Financeiro para navegador. **Ainda não implementada** —
esta pasta guarda o plano e a estrutura.

```
client/    Interface: reaproveita ../shared + adaptador HTTP para window.api
server/    API REST, banco de dados e contas de usuário
```

## Decisões já tomadas

- **Multiusuário**: cadastro, login e isolamento de dados entre contas.
- **Sem IA nesta versão.** O modelo local tem vários gigabytes e não roda no
  navegador; rodá-lo no servidor exigiria máquina cara, e usar uma API na
  nuvem faria os dados financeiros saírem do ambiente. A análise por IA segue
  exclusiva do desktop até que essa escolha seja revista.

## O que precisa ser construído

**Servidor**
- Banco de dados (as mesmas tabelas do desktop, com uma coluna de usuário)
- Cadastro, login e sessões
- Endpoints espelhando os 42 métodos de `window.api`
- Proxy para as APIs de mercado (brapi, Yahoo, CoinGecko), que hoje são
  chamadas pelo processo principal do Electron para evitar bloqueio de CORS

**Cliente**
- Adaptador que define `window.api` usando `fetch`, com a mesma assinatura do
  `desktop/preload.cjs` — assim as telas de `shared/` funcionam sem alteração
- Telas próprias de cadastro/login no lugar da senha local

## Ponto de atenção: criptografia

No desktop, o banco é criptografado com uma chave derivada da senha do usuário
e nada sai da máquina. Esse modelo não se traduz diretamente para a web:

- se o servidor conseguir ler os dados, a garantia passa a ser confiança no
  servidor (com as responsabilidades que isso implica para dados de terceiros);
- se a criptografia for ponta a ponta, o servidor não consegue processar nada
  — relatórios e buscas teriam de ser feitos no navegador.

Essa decisão precisa ser tomada antes de modelar o banco.
