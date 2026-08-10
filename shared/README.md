# shared

Interface e regras de negócio usadas pelas versões desktop e web.

```
src/
├── App.jsx                    Navegação e layout
├── Login.jsx                  Tela de acesso
├── Dashboard.jsx              Gráficos e visão geral
├── InsercaoDados.jsx          Cadastro de transações
├── GanhosMes.jsx              Renda mensal
├── Listagem.jsx               Contas do mês
├── Cofrinhos.jsx              Reservas que rendem % do CDI
├── CarteiraInvestimentos.jsx  Ações, FIIs, Tesouro e Bitcoin
├── CarteiraConsolidada.jsx    Visão somada e alocação
├── Analise.jsx                Conversa com a IA
├── Backup.jsx                 Exportar e restaurar dados
├── ConfirmDialog.jsx          Modal de confirmação
├── periodo.js                 Cálculos por mês/ano e resumos para a IA
├── cofrinho.js                Rendimento por percentual do CDI
└── erros.js                   Mensagens de erro legíveis
```

## Regra principal

Nada aqui pode depender do Electron, de `require` ou de módulos do Node.
Todo acesso a dados passa por **`window.api`**, que cada versão implementa do
seu jeito (IPC no desktop, HTTP na web).

Ao adicionar uma dependência npm usada por este código, lembre de incluí-la na
lista `DEPS_COMPARTILHADAS` em `desktop/vite.config.js` — é o que permite ao
desktop resolver os pacotes a partir daqui.

## Componentes específicos de cada versão

`Login.jsx` e `Backup.jsx` foram escritos para o modelo do desktop (senha que
abre um banco criptografado local, backup em arquivo). Na versão web, com
contas de usuário no servidor, eles provavelmente serão substituídos por
equivalentes próprios.
