import { useState } from 'react';
import { mensagemErro } from './erros';

const fmtTam = (b) => (b > 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.round(b / 1024)} KB`);

export default function Backup() {
  const [exportando, setExportando] = useState(false);
  const [resultado, setResultado] = useState(null);
  const [erro, setErro] = useState(null);
  const [importando, setImportando] = useState(false);
  const [importado, setImportado] = useState(false);

  const handleImportar = async () => {
    setErro(null);
    setResultado(null);
    setImportando(true);
    try {
      const r = await window.api.importarBackup();
      // Os dados foram trocados: a sessão atual não vale mais.
      // O usuário precisa entrar com a senha do backup restaurado.
      if (!r.cancelado) setImportado(true);
    } catch (err) {
      console.error('Erro ao importar backup:', err);
      setErro(mensagemErro(err, 'Não foi possível restaurar o backup.'));
    } finally {
      setImportando(false);
    }
  };

  const handleExportar = async () => {
    setErro(null);
    setResultado(null);
    setExportando(true);
    try {
      const r = await window.api.exportarBackup();
      if (!r.cancelado) setResultado(r);
    } catch (err) {
      console.error('Erro ao exportar backup:', err);
      setErro(mensagemErro(err, 'Não foi possível exportar o backup.'));
    } finally {
      setExportando(false);
    }
  };

  const passo = { display: 'flex', gap: '0.75rem', alignItems: 'flex-start' };
  const numero = {
    width: 24, height: 24, borderRadius: '50%', flexShrink: 0,
    background: 'var(--color-accent-soft)', color: 'var(--color-accent-text)',
    display: 'grid', placeItems: 'center', fontSize: '0.8rem', fontWeight: 600
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', maxWidth: '760px' }}>

      {/* Ação principal */}
      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div>
          <h2 style={{ margin: 0 }}>Exportar backup</h2>
          <p style={{ margin: '0.35rem 0 0', color: 'var(--color-text-secondary)', fontSize: '0.92rem' }}>
            Gera um arquivo único com todos os seus dados — transações, ganhos, cofrinhos e investimentos.
            O conteúdo continua <strong>criptografado</strong>: só abre com a sua senha ou com a chave de recuperação.
          </p>
        </div>

        <button
          type="button"
          className="btn btn-primary"
          onClick={handleExportar}
          disabled={exportando}
          style={{ alignSelf: 'flex-start', padding: '0.8rem 1.5rem' }}
        >
          {exportando ? 'Exportando...' : 'Exportar meus dados'}
        </button>

        {resultado && (
          <div style={{ padding: '0.85rem 1rem', background: 'var(--color-accent-soft)', borderRadius: 'var(--radius-md)', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <span style={{ color: 'var(--color-accent-text)', fontWeight: 500 }}>
              Backup criado ({fmtTam(resultado.tamanho)})
            </span>
            <code style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', wordBreak: 'break-all' }}>
              {resultado.caminho}
            </code>
            <button
              type="button"
              className="btn btn-ghost"
              style={{ alignSelf: 'flex-start', fontSize: '0.85rem' }}
              onClick={() => window.api.revelarArquivo(resultado.caminho)}
            >
              Mostrar na pasta
            </button>
          </div>
        )}

        {erro && (
          <div className="badge badge-danger" style={{ alignSelf: 'flex-start', padding: '0.5rem 0.9rem', fontSize: '0.85rem' }}>{erro}</div>
        )}
      </div>

      {/* Restaurar */}
      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div>
          <h2 style={{ margin: 0 }}>Restaurar backup</h2>
          <p style={{ margin: '0.35rem 0 0', color: 'var(--color-text-secondary)', fontSize: '0.92rem' }}>
            Carrega os dados de um arquivo <code>.afbackup</code>. Use para voltar uma cópia antiga ou
            trazer os dados de outro computador.
          </p>
        </div>

        {importado ? (
          <div style={{ padding: '0.9rem 1rem', background: 'var(--color-accent-soft)', borderRadius: 'var(--radius-md)', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <span style={{ color: 'var(--color-accent-text)', fontWeight: 500 }}>
              Backup restaurado com sucesso.
            </span>
            <span style={{ fontSize: '0.88rem', color: 'var(--color-text-secondary)' }}>
              O aplicativo precisa ser reaberto para carregar os dados restaurados. Entre com a senha
              que você usava no backup.
            </span>
            <button type="button" className="btn btn-primary" style={{ alignSelf: 'flex-start' }} onClick={() => window.location.reload()}>
              Recarregar agora
            </button>
          </div>
        ) : (
          <>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={handleImportar}
              disabled={importando}
              style={{ alignSelf: 'flex-start', padding: '0.8rem 1.5rem' }}
            >
              {importando ? 'Restaurando...' : 'Restaurar de um arquivo'}
            </button>
            <div style={{ padding: '0.75rem 0.9rem', background: 'var(--color-warning-soft)', borderRadius: 'var(--radius-md)' }}>
              <p style={{ margin: 0, fontSize: '0.86rem', color: 'var(--color-warning-text)' }}>
                Restaurar <strong>substitui</strong> os dados deste computador pelos do arquivo. O app pede
                confirmação antes. Se quiser guardar o estado atual, exporte um backup primeiro.
              </p>
            </div>
          </>
        )}
      </div>

      {/* Tutorial */}
      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <h2 style={{ margin: 0 }}>Como fazer e onde guardar</h2>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
          <div style={passo}>
            <span style={numero}>1</span>
            <p style={{ margin: 0, fontSize: '0.92rem' }}>
              Clique em <strong>Exportar meus dados</strong>. Escolha onde salvar — o nome já vem com a data
              (ex.: <code>auxiliar-financeiro-2026-08-02.afbackup</code>).
            </p>
          </div>
          <div style={passo}>
            <span style={numero}>2</span>
            <p style={{ margin: 0, fontSize: '0.92rem' }}>
              Guarde o arquivo em <strong>pelo menos dois lugares diferentes</strong> — se ficar só no seu
              computador, um problema no disco leva o backup junto.
            </p>
          </div>
          <div style={passo}>
            <span style={numero}>3</span>
            <p style={{ margin: 0, fontSize: '0.92rem' }}>
              Refaça o backup de tempos em tempos (uma vez por mês costuma bastar). O arquivo antigo
              não se atualiza sozinho.
            </p>
          </div>
        </div>

        <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: '1rem' }}>
          <h3 style={{ margin: '0 0 0.75rem', fontSize: '0.95rem' }}>Usar seus dados em outro computador</h3>
          <p style={{ margin: '0 0 0.85rem', fontSize: '0.9rem', color: 'var(--color-text-secondary)' }}>
            Você <strong>não precisa</strong> copiar o arquivo para nenhuma pasta específica. Deixe-o onde
            for mais fácil de achar (a Área de Trabalho serve) e siga:
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
            <div style={passo}>
              <span style={numero}>1</span>
              <p style={{ margin: 0, fontSize: '0.92rem' }}>
                Leve o arquivo <code>.afbackup</code> até o outro computador — por pen drive, nuvem
                (Drive, OneDrive, iCloud) ou e-mail. Pode transportar sem medo: ele está criptografado.
              </p>
            </div>
            <div style={passo}>
              <span style={numero}>2</span>
              <p style={{ margin: 0, fontSize: '0.92rem' }}>
                Instale o Auxiliar Financeiro nesse computador e abra o aplicativo.
              </p>
            </div>
            <div style={passo}>
              <span style={numero}>3</span>
              <p style={{ margin: 0, fontSize: '0.92rem' }}>
                Na tela inicial, clique em <strong>“Restaurar meus dados de um backup”</strong> e
                selecione o arquivo. O app coloca tudo no lugar sozinho.
              </p>
            </div>
            <div style={passo}>
              <span style={numero}>4</span>
              <p style={{ margin: 0, fontSize: '0.92rem' }}>
                Entre com a <strong>mesma senha</strong> que você usa aqui. Pronto — seus dados estarão lá.
              </p>
            </div>
          </div>
        </div>

        <div style={{ padding: '0.85rem 1rem', background: 'var(--color-warning-soft)', borderRadius: 'var(--radius-md)' }}>
          <p style={{ margin: 0, fontSize: '0.88rem', color: 'var(--color-warning-text)' }}>
            <strong>Atenção:</strong> o backup só abre com a sua senha (ou a chave de recuperação) — nem
            você consegue acessá-lo sem elas. Guarde a chave de recuperação em um lugar
            <strong> separado</strong> do arquivo de backup.
          </p>
        </div>
      </div>
    </div>
  );
}
