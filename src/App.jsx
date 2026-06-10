import { HashRouter, Routes, Route, Link } from 'react-router-dom';
import InsercaoDados from './InsercaoDados';
import Dashboard from './Dashboard';
import Listagem from './Listagem'; // Novo componente

function App() {
  return (
    <HashRouter>
      <div className="app-container">
        <nav className="nav-bar">
          <Link to="/" className="nav-link">Dashboard</Link>
          <Link to="/inserir" className="nav-link">Inserir Dados</Link>
          <Link to="/listagem" className="nav-link">Visualizar Contas</Link>
        </nav>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/inserir" element={<InsercaoDados />} />
          <Route path="/listagem" element={<Listagem />} />
        </Routes>
      </div>
    </HashRouter>
  );
}

export default App;