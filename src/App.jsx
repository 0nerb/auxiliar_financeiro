import { useEffect, useState } from 'react';
import { HashRouter, Routes, Route, NavLink, useLocation } from 'react-router-dom';
import InsercaoDados from './InsercaoDados';
import Dashboard from './Dashboard';
import Listagem from './Listagem';
import Cofrinhos from './Cofrinhos';
import Analise from './Analise';
import CarteiraInvestimentos from './CarteiraInvestimentos';
import CarteiraConsolidada from './CarteiraConsolidada';
import Login from './Login';
import Backup from './Backup';
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
const IconPiggy = () => <Icon d="M19 9V8a3 3 0 0 0-3-3h-2.5A4.5 4.5 0 0 0 9 9.5v0A4.5 4.5 0 0 0 13.5 14H16a3 3 0 0 0 3-3v-1zM3 12a4 4 0 0 0 4 4M7 16v3M17 17v2M9 5l1-2" />;
const IconSparkles = () => <Icon d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3zM19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15z" />;
const IconChart = () => <Icon d="M3 3v18h18M7 15l3-4 3 3 4-6" />;
const IconBuilding = () => <Icon d="M3 21h18M5 21V7l7-4 7 4v14M9 9h.01M9 13h.01M9 17h.01M15 9h.01M15 13h.01M15 17h.01" />;
const IconLandmark = () => <Icon d="M3 21h18M4 10h16M5 6l7-3 7 3M6 10v11M10 10v11M14 10v11M18 10v11" />;
const IconBitcoin = () => <Icon d="M9 7h5a2.5 2.5 0 0 1 0 5H9m0 0h6a2.5 2.5 0 0 1 0 5H9m0-10V5m0 12v2m3-14V5m0 12v2M9 7v10" />;
const IconShield = () => <Icon d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />;
const IconWallet = () => <Icon d="M19 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h13a2 2 0 0 0 2-2v-2M21 12a2 2 0 0 0-2-2h-4a2 2 0 0 0 0 4h4a2 2 0 0 0 2-2zM15 12h.01" />;
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
  if (pathname.startsWith('/inserir'))   return { titulo: 'Inserir transação', subtitulo: 'Registre uma nova entrada no controle financeiro' };
  if (pathname.startsWith('/listagem'))  return { titulo: 'Visualizar contas',  subtitulo: 'Filtre por mês e ano para ver seus lançamentos' };
  if (pathname.startsWith('/cofrinhos')) return { titulo: 'Cofrinhos',          subtitulo: 'Reservas que rendem um percentual do CDI' };
  if (pathname.startsWith('/acoes'))     return { titulo: 'Ações',              subtitulo: 'Sua carteira de ações da B3 e a variação desde a compra' };
  if (pathname.startsWith('/fiis'))      return { titulo: 'Fundos Imobiliários', subtitulo: 'Seus FIIs e a variação desde a compra' };
  if (pathname.startsWith('/tesouro'))   return { titulo: 'Tesouro Direto',      subtitulo: 'Seus títulos públicos e a variação desde a compra' };
  if (pathname.startsWith('/bitcoin'))   return { titulo: 'Bitcoin',             subtitulo: 'Sua posição em BTC e a variação desde a compra' };
  if (pathname.startsWith('/carteira'))  return { titulo: 'Carteira consolidada', subtitulo: 'Desempenho e alocação de todos os seus investimentos' };
  if (pathname.startsWith('/backup'))    return { titulo: 'Backup',              subtitulo: 'Exporte uma cópia criptografada dos seus dados' };
  if (pathname.startsWith('/analise'))   return { titulo: 'Análise por IA',      subtitulo: 'Apontamentos sobre sua saúde financeira, gerados localmente' };
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
        <NavLink to="/cofrinhos" className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}>
          <IconPiggy /> Cofrinhos
        </NavLink>
        <NavLink to="/acoes" className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}>
          <IconChart /> Ações
        </NavLink>
        <NavLink to="/fiis" className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}>
          <IconBuilding /> Fundos Imobiliários
        </NavLink>
        <NavLink to="/tesouro" className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}>
          <IconLandmark /> Tesouro Direto
        </NavLink>
        <NavLink to="/bitcoin" className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}>
          <IconBitcoin /> Bitcoin
        </NavLink>
        <NavLink to="/carteira" className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}>
          <IconWallet /> Carteira consolidada
        </NavLink>
        <NavLink to="/analise" className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}>
          <IconSparkles /> Análise por IA
        </NavLink>
        <NavLink to="/backup" className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}>
          <IconShield /> Backup
        </NavLink>

        <div className="sidebar-footer">Auxiliar Financeiro v1.5</div>
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
          <Route path="/cofrinhos" element={<Cofrinhos />} />
          <Route path="/acoes" element={<CarteiraInvestimentos classe="acoes" rotulo="ações" mostrarDividendos />} />
          <Route path="/fiis" element={<CarteiraInvestimentos classe="fiis" rotulo="fundos imobiliários" mostrarDividendos />} />
          <Route path="/tesouro" element={<CarteiraInvestimentos classe="tesouro" rotulo="títulos do Tesouro" historicoDisponivel={false} />} />
          <Route path="/bitcoin" element={<CarteiraInvestimentos classe="bitcoin" rotulo="Bitcoin" />} />
          <Route path="/carteira" element={<CarteiraConsolidada />} />
          <Route path="/analise" element={<Analise />} />
          <Route path="/backup" element={<Backup />} />
        </Routes>
      </main>
    </div>
  );
}

export default function App() {
  // O app fica bloqueado até a senha destravar o banco criptografado
  const [destravado, setDestravado] = useState(false);

  if (!destravado) return <Login aoDestravar={() => setDestravado(true)} />;

  return (
    <HashRouter>
      <Shell />
    </HashRouter>
  );
}
