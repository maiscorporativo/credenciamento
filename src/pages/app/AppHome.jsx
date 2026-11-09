import { NavLink, Navigate, Route, Routes, Link } from 'react-router-dom';
import { BookUser, IdCard, LayoutDashboard, LogOut, Printer, ScanLine, QrCode } from 'lucide-react';
import { useAuth } from '../../lib/auth';
import MeuCracha from './MeuCracha';
import Escanear from './Escanear';
import Contatos from './Contatos';
import Acesso from './Acesso';

export default function AppHome() {
  const { user, logout, meta } = useAuth();
  const canScanAccess = ['scanner', 'balcao', 'admin'].includes(user.role);
  const isPerson = !!user.id;
  const tabs = [
    isPerson && { to: '/app', end: true, icon: IdCard, label: 'Crachá' },
    isPerson && { to: '/app/escanear', icon: QrCode, label: 'Escanear' },
    isPerson && { to: '/app/contatos', icon: BookUser, label: 'Contatos' },
    canScanAccess && { to: '/app/acesso', icon: ScanLine, label: 'Acesso' },
  ].filter(Boolean);

  return (
    <div className="mx-auto flex min-h-full max-w-lg flex-col bg-slate-50">
      <header className="sticky top-0 z-20 flex items-center gap-3 bg-brand-900 px-4 py-3 text-white">
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-extrabold text-lime">{meta.event?.nome}</div>
          <div className="truncate text-xs text-white/70">{user.nome} {user.sobrenome}</div>
        </div>
        {user.role === 'admin' && <Link to="/admin" className="rounded p-2 hover:bg-white/10" aria-label="Painel"><LayoutDashboard size={18} /></Link>}
        {user.role === 'balcao' && <Link to="/balcao" className="rounded p-2 hover:bg-white/10" aria-label="Balcão"><Printer size={18} /></Link>}
        <button onClick={logout} className="rounded p-2 hover:bg-white/10" aria-label="Sair"><LogOut size={18} /></button>
      </header>

      <main className="flex-1 p-4 pb-24">
        <Routes>
          <Route index element={isPerson ? <MeuCracha /> : <Navigate to="/app/acesso" replace />} />
          <Route path="escanear" element={<Escanear />} />
          <Route path="contatos" element={<Contatos />} />
          <Route path="acesso" element={canScanAccess ? <Acesso /> : <Navigate to="/app" replace />} />
          <Route path="*" element={<Navigate to="/app" replace />} />
        </Routes>
      </main>

      {tabs.length > 1 && (
        <nav className="fixed inset-x-0 bottom-0 z-20 mx-auto flex max-w-lg border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)]">
          {tabs.map(({ to, end, icon: Icon, label }) => (
            <NavLink key={to} to={to} end={end} className={({ isActive }) => `flex flex-1 flex-col items-center gap-0.5 py-2 text-xs ${isActive ? 'font-bold text-brand-700' : 'text-slate-500'}`}>
              <Icon size={22} /> {label}
            </NavLink>
          ))}
        </nav>
      )}
    </div>
  );
}
