// Extrai a mensagem legível de um erro vindo do processo principal.
// O Electron embrulha as falhas de IPC assim:
//   "Error invoking remote method 'auth:destravar': Error: Senha incorreta."
// Aqui ficamos apenas com o texto final, que é o que interessa ao usuário.
export function mensagemErro(erro, padrao = 'Não foi possível concluir a operação.') {
  const bruto = (typeof erro?.message === 'string' ? erro.message : String(erro || '')).trim();
  if (!bruto) return padrao;

  const partes = bruto.split(/Error:\s*/);
  const limpo = partes[partes.length - 1].trim();

  // Sobrou só o rótulo genérico ("Error") — não diz nada ao usuário
  if (!limpo || /^Error$/i.test(limpo)) return padrao;

  return limpo;
}
