import { useEffect, useState } from 'react';
import { HashRouter, Routes, Route, NavLink, useLocation } from 'react-router-dom';
import InsercaoDados from './InsercaoDados';
import Dashboard from './Dashboard';
import Listagem from './Listagem';
import './App.css';

// ----- ícones simples (SVG inline, herdam currentColor) -----
const Icon = ({ d, size = 18 }) => (
  <svg className="nav-link-icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={d} />
  </svg>
);
const IconDashboard = () => <Icon d="M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z" />;
const IconPlus = () => <Icon d="M12 5v14M5 12h14" />;
const IconList = () => <Icon d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />;
const IconSun = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
  </svg>
);
const IconMoon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
  </svg>
);

// ----- Hook de tema (persistente em localStorage, aplica data-theme no <html>) -----
function useTheme() {
  const [tema, setTema] = useState(() => {
    if (typeof window === 'undefined') return 'light';
    const salvo = localStorage.getItem('tema');
    if (salvo === 'light' || salvo === 'dark') return salvo;
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', tema);
    localStorage.setItem('tema', tema);
  }, [tema]);

  return [tema, () => setTema(t => (t === 'dark' ? 'light' : 'dark'))];
}

// Título e subtítulo da topbar conforme a rota ativa
function useTituloRota() {
  const { pathname } = useLocation();
  if (pathname.startsWith('/inserir'))  return { titulo: 'Inserir transação', subtitulo: 'Registre uma nova entrada no controle financeiro' };
  if (pathname.startsWith('/listagem')) return { titulo: 'Visualizar contas',  subtitulo: 'Filtre por mês e ano para ver seus lançamentos' };
  return { titulo: 'Dashboard', subtitulo: 'Visão geral dos seus gastos e investimentos' };
}

function Shell() {
  const [tema, alternarTema] = useTheme();
  const { titulo, subtitulo } = useTituloRota();

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="sidebar-logo">A</div>
          <span>Auxiliar</span>
        </div>

        <div className="sidebar-section">Navegação</div>
        <NavLink to="/" end className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}>
          <IconDashboard /> Dashboard
        </NavLink>
        <NavLink to="/inserir" className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}>
          <IconPlus /> Inserir dados
        </NavLink>
        <NavLink to="/listagem" className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}>
          <IconList /> Visualizar contas
        </NavLink>

        <div className="sidebar-footer">Auxiliar Financeiro v1.2</div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div>
            <h1 className="topbar-title">{titulo}</h1>
            <p className="topbar-subtitle">{subtitulo}</p>
          </div>
          <div className="topbar-actions">
            <button
              type="button"
              className="btn-icon"
              onClick={alternarTema}
              title={tema === 'dark' ? 'Mudar para tema claro' : 'Mudar para tema escuro'}
              aria-label="Alternar tema"
            >
              {tema === 'dark' ? <IconSun /> : <IconMoon />}
            </button>
          </div>
        </header>

        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/inserir" element={<InsercaoDados />} />
          <Route path="/listagem" element={<Listagem />} />
        </Routes>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <HashRouter>
      <Shell />
    </HashRouter>
  );
}
