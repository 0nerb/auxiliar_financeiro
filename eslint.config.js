// A configuração real vive em desktop/eslint.config.js — os plugins do ESLint
// são resolvidos a partir de lá, onde está o node_modules do projeto.
// Este arquivo na raiz permite lintar shared/ e desktop/ de uma vez só.
export { default } from './desktop/eslint.config.js'
