import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import './index.css';
import { AuthProvider, homeFor, useAuth } from './lib/auth';
import Login from './pages/Login';
import Inscricao from './pages/Inscricao';
import AdminLayout from './components/AdminLayout';
import Painel from './pages/admin/Painel';
import Participantes from './pages/admin/Participantes';
import Importar from './pages/admin/Importar';
import Etiqueta from './pages/admin/Etiqueta';
import Espacos from './pages/admin/Espacos';
import Equipe from './pages/admin/Equipe';
import Relatorios from './pages/admin/Relatorios';
import Mautic from './pages/admin/Mautic';
import Balcao from './pages/Balcao';
import AppHome from './pages/app/AppHome';
import CodeLink from './pages/app/CodeLink';

function Guard({ roles, children }) {
  const { user, ready } = useAuth();
  const loc = useLocation();
  if (!ready) return <div className="grid h-full place-items-center text-slate-400">Carregando…</div>;
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(loc.pathname)}`} replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to={homeFor(user)} replace />;
  return children;
}

function Home() {
  const { user, ready } = useAuth();
  if (!ready) return null;
  return <Navigate to={homeFor(user)} replace />;
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<Login />} />
          <Route path="/inscricao" element={<Inscricao />} />
          <Route path="/c/:code" element={<Guard><CodeLink /></Guard>} />
          <Route path="/balcao" element={<Guard roles={['admin', 'balcao']}><Balcao /></Guard>} />
          <Route path="/app/*" element={<Guard><AppHome /></Guard>} />
          <Route path="/admin" element={<Guard roles={['admin']}><AdminLayout /></Guard>}>
            <Route index element={<Painel />} />
            <Route path="participantes" element={<Participantes />} />
            <Route path="importar" element={<Importar />} />
            <Route path="etiqueta" element={<Etiqueta />} />
            <Route path="espacos" element={<Espacos />} />
            <Route path="equipe" element={<Equipe />} />
            <Route path="relatorios" element={<Relatorios />} />
            <Route path="mautic" element={<Mautic />} />
          </Route>
          <Route path="*" element={<Home />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  </StrictMode>,
);
