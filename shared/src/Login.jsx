import { useState, useEffect } from 'react';
import { mensagemErro } from './erros';

// Tela de bloqueio: cria a senha no primeiro uso e destrava nas próximas vezes.
// Os dados só são carregados depois que a chave correta é obtida.
export default function Login({ aoDestravar }) {
  const [carregando, setCarregando] = useState(true);
  const [configurado, setConfigurado] = useState(false);
  const [modo, setModo] = useState('senha'); // 'senha' | 'recuperacao'

  const [senha, setSenha] = useState('');
  const [confirma, setConfirma] = useState('');
  const [codigo, setCodigo] = useState('');
  const [erro, setErro] = useState(null);
  const [ocupado, setOcupado] = useState(false);

  // Exibida uma única vez, logo após criar a senha
  const [chaveRecuperacao, setChaveRecuperacao] = useState(null);
  const [copiada, setCopiada] = useState(false);
  const [confirmouGuardar, setConfirmouGuardar] = useState(false);
  const [importado, setImportado] = useState(false);

  useEffect(() => {
    let ativo = true;
    (async () => {
      try {
        const st = await window.api.authStatus();
        if (!ativo) return;
        setConfigurado(st.configurado);
        setCarregando(false);
      } catch (err) {
        console.error('Erro ao verificar status:', err);
        if (ativo) setCarregando(false);
      }
    })();
    return () => { ativo = false; };
  }, []);

  const limpaErro = (e) => mensagemErro(e);

  const handleCriar = async (e) => {
    e.preventDefault();
    setErro(null);
    if (senha.length < 6) { setErro('A senha precisa ter ao menos 6 caracteres.'); return; }
    if (senha !== confirma) { setErro('As senhas não conferem.'); return; }
    setOcupado(true);
    try {
      const r = await window.api.authCriar(senha);
      setChaveRecuperacao(r.chaveRecuperacao);
    } catch (err) {
      setErro(limpaErro(err));
    } finally {
      setOcupado(false);
    }
  };

  const handleDestravar = async (e) => {
    e.preventDefault();
    setErro(null);
    setOcupado(true);
    try {
      await window.api.authDestravar(senha);
      aoDestravar();
    } catch (err) {
      setErro(limpaErro(err));
      setSenha('');
    } finally {
      setOcupado(false);
    }
  };

  const handleRecuperar = async (e) => {
    e.preventDefault();
    setErro(null);
    setOcupado(true);
    try {
      await window.api.authRecuperar(codigo);
      aoDestravar();
    } catch (err) {
      setErro(limpaErro(err));
    } finally {
      setOcupado(false);
    }
  };

  // Restaura um backup vindo de outro computador (antes de existir senha aqui)
  const handleImportar = async () => {
    setErro(null);
    setOcupado(true);
    try {
      const r = await window.api.importarBackup();
      if (!r.cancelado) {
        const st = await window.api.authStatus();
        setConfigurado(st.configurado);
        setModo('senha');
        setImportado(true);
      }
    } catch (err) {
      setErro(limpaErro(err));
    } finally {
      setOcupado(false);
    }
  };

  const copiarChave = async () => {
    try {
      await navigator.clipboard.writeText(chaveRecuperacao);
      setCopiada(true);
      setTimeout(() => setCopiada(false), 2000);
    } catch { /* clipboard indisponível */ }
  };

  const caixa = {
    width: '100%',
    maxWidth: chaveRecuperacao ? '540px' : '400px',
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem'
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem', background: 'var(--color-bg-page)' }}>
      <div className="card" style={caixa}>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{ width: 40, height: 40, borderRadius: 10, background: 'var(--color-accent)', color: 'var(--color-text-on-accent)', display: 'grid', placeItems: 'center', fontWeight: 700, fontSize: '1.1rem' }}>A</div>
          <div>
            <h1 style={{ margin: 0, fontSize: '1.25rem' }}>Auxiliar Financeiro</h1>
            <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>Seus dados são criptografados neste computador</p>
          </div>
        </div>

        {carregando && <p style={{ color: 'var(--color-text-secondary)' }}>Carregando...</p>}

        {/* Chave de recuperação — mostrada uma única vez após criar a senha */}
        {!carregando && chaveRecuperacao && (
          <>
            <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: '1rem' }}>
              <h2 style={{ margin: '0 0 0.5rem', fontSize: '1.05rem' }}>Guarde sua chave de recuperação</h2>
              <p style={{ margin: 0, color: 'var(--color-text-secondary)', fontSize: '0.9rem' }}>
                Esta é a <strong>única</strong> forma de acessar seus dados se você esquecer a senha.
                Ela não será mostrada novamente. Anote em um lugar seguro.
              </p>
            </div>

            <div style={{ padding: '1rem', background: 'var(--color-bg-muted)', border: '1px solid var(--color-border-strong)', borderRadius: 'var(--radius-md)', textAlign: 'center', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: '1.15rem', letterSpacing: '0.05em', userSelect: 'all' }}>
              {chaveRecuperacao}
            </div>

            <button type="button" className="btn btn-ghost" onClick={copiarChave}>
              {copiada ? 'Copiada!' : 'Copiar chave'}
            </button>

            <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.6rem', cursor: 'pointer', fontSize: '0.9rem' }}>
              <input type="checkbox" checked={confirmouGuardar} onChange={e => setConfirmouGuardar(e.target.checked)} style={{ marginTop: 3, accentColor: 'var(--color-accent)' }} />
              <span>Guardei minha chave de recuperação em um lugar seguro.</span>
            </label>

            <button type="button" className="btn btn-primary" disabled={!confirmouGuardar} onClick={aoDestravar} style={{ padding: '0.75rem' }}>
              Entrar no aplicativo
            </button>
          </>
        )}

        {/* Primeiro uso: criar senha */}
        {!carregando && !chaveRecuperacao && !configurado && (
          <form onSubmit={handleCriar} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: '1rem' }}>
              <h2 style={{ margin: '0 0 0.35rem', fontSize: '1.05rem' }}>Crie uma senha</h2>
              <p style={{ margin: 0, color: 'var(--color-text-secondary)', fontSize: '0.88rem' }}>
                Ela protege seus dados financeiros. Não há como recuperá-la depois — por isso você
                receberá uma chave de recuperação.
              </p>
            </div>
            <label className="input-group">
              <span className="input-label">Senha (mínimo 6 caracteres)</span>
              <input type="password" className="input-field" value={senha} onChange={e => setSenha(e.target.value)} autoFocus />
            </label>
            <label className="input-group">
              <span className="input-label">Repita a senha</span>
              <input type="password" className="input-field" value={confirma} onChange={e => setConfirma(e.target.value)} />
            </label>
            <button type="submit" className="btn btn-primary" disabled={ocupado} style={{ padding: '0.75rem' }}>
              {ocupado ? 'Criando...' : 'Criar senha e proteger meus dados'}
            </button>

            <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: '1rem', textAlign: 'center' }}>
              <p style={{ margin: '0 0 0.6rem', fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>
                Já usa o Auxiliar Financeiro em outro computador?
              </p>
              <button type="button" className="btn btn-ghost" onClick={handleImportar} disabled={ocupado} style={{ width: '100%' }}>
                Restaurar meus dados de um backup
              </button>
            </div>
          </form>
        )}

        {/* Uso normal: destravar com senha */}
        {!carregando && !chaveRecuperacao && configurado && modo === 'senha' && (
          <form onSubmit={handleDestravar} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {importado && (
              <div style={{ padding: '0.75rem 0.9rem', background: 'var(--color-accent-soft)', borderRadius: 'var(--radius-md)', fontSize: '0.88rem', color: 'var(--color-accent-text)' }}>
                Backup restaurado. Entre com a <strong>senha que você usava no outro computador</strong>.
              </div>
            )}
            <label className="input-group" style={{ borderTop: '1px solid var(--color-border)', paddingTop: '1rem' }}>
              <span className="input-label">Senha</span>
              <input type="password" className="input-field" value={senha} onChange={e => setSenha(e.target.value)} autoFocus />
            </label>
            <button type="submit" className="btn btn-primary" disabled={ocupado} style={{ padding: '0.75rem' }}>
              {ocupado ? 'Abrindo...' : 'Entrar'}
            </button>
            <button type="button" onClick={() => { setModo('recuperacao'); setErro(null); }}
              style={{ background: 'none', border: 'none', color: 'var(--color-accent)', cursor: 'pointer', fontSize: '0.85rem' }}>
              Esqueci minha senha
            </button>
          </form>
        )}

        {/* Recuperação */}
        {!carregando && !chaveRecuperacao && configurado && modo === 'recuperacao' && (
          <form onSubmit={handleRecuperar} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: '1rem' }}>
              <h2 style={{ margin: '0 0 0.35rem', fontSize: '1.05rem' }}>Usar chave de recuperação</h2>
              <p style={{ margin: 0, color: 'var(--color-text-secondary)', fontSize: '0.88rem' }}>
                Digite a chave que você guardou ao criar a senha.
              </p>
            </div>
            <label className="input-group">
              <span className="input-label">Chave de recuperação</span>
              <input type="text" className="input-field" value={codigo} onChange={e => setCodigo(e.target.value)}
                placeholder="XXXXX-XXXXX-XXXXX-XXXXX-XXXXX"
                style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }} autoFocus />
            </label>
            <button type="submit" className="btn btn-primary" disabled={ocupado} style={{ padding: '0.75rem' }}>
              {ocupado ? 'Verificando...' : 'Acessar meus dados'}
            </button>
            <button type="button" onClick={() => { setModo('senha'); setErro(null); }}
              style={{ background: 'none', border: 'none', color: 'var(--color-accent)', cursor: 'pointer', fontSize: '0.85rem' }}>
              Voltar para a senha
            </button>
          </form>
        )}

        {erro && (
          <div
            role="alert"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.6rem',
              padding: '0.75rem 0.9rem',
              borderRadius: 'var(--radius-md)',
              background: 'var(--color-danger-soft)',
              color: 'var(--color-danger-text)',
              fontSize: '0.9rem'
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }} aria-hidden="true">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 8v4M12 16h.01" />
            </svg>
            <span>{erro}</span>
          </div>
        )}
      </div>
    </div>
  );
}
