import { useState } from 'react';
import { NavLink, Outlet, Link } from 'react-router-dom';
import { BarChart3, FileSpreadsheet, LayoutDashboard, LogOut, MapPin, Menu, Printer, RefreshCw, ScanLine, Tag, Users, UserCog, X } from 'lucide-react';
import { useAuth } from '../lib/auth';

const NAV = [
  { to: '/admin', end: true, icon: LayoutDashboard, label: 'Painel' },
  { to: '/balcao', icon: Printer, label: 'Balcão (impressão)', external: true },
  { to: '/admin/participantes', icon: Users, label: 'Participantes' },
  { to: '/admin/importar', icon: FileSpreadsheet, label: 'Importar planilha' },
  { to: '/admin/mautic', icon: RefreshCw, label: 'Integração Mautic' },
  { to: '/admin/etiqueta', icon: Tag, label: 'Etiqueta' },
  { to: '/admin/espacos', icon: MapPin, label: 'Espaços' },
  { to: '/admin/equipe', icon: UserCog, label: 'Equipe / leitores' },
  { to: '/admin/relatorios', icon: BarChart3, label: 'Relatórios' },
  { to: '/app/acesso', icon: ScanLine, label: 'Leitor de acesso', external: true },
];

export default function AdminLayout() {
  const { user, logout, meta } = useAuth();
  const [open, setOpen] = useState(false);
  return (
    <div className="flex min-h-full">
      <aside className={`fixed inset-y-0 left-0 z-40 w-64 transform bg-brand-900 text-white transition lg:static lg:translate-x-0 ${open ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex items-center justify-between px-5 py-5">
          <div>
            <div className="text-lg font-extrabold leading-tight text-lime">{meta.event?.nome || 'Credenciamento'}</div>
            <div className="text-xs text-white/60">Credenciamento · {meta.event?.edicao}</div>
          </div>
          <button className="lg:hidden" onClick={() => setOpen(false)} aria-label="Fechar menu"><X size={20} /></button>
        </div>
        <nav className="space-y-1 px-3">
          {NAV.map(({ to, end, icon: Icon, label, external }) => external ? (
            <Link key={to} to={to} className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-white/80 hover:bg-white/10">
              <Icon size={18} /> {label}
            </Link>
          ) : (
            <NavLink key={to} to={to} end={end} onClick={() => setOpen(false)}
              className={({ isActive }) => `flex items-center gap-3 rounded-lg px-3 py-2 text-sm ${isActive ? 'bg-white/15 font-semibold text-white' : 'text-white/80 hover:bg-white/10'}`}>
              <Icon size={18} /> {label}
            </NavLink>
          ))}
        </nav>
        <div className="absolute inset-x-0 bottom-0 border-t border-white/10 p-4 text-sm">
          <div className="truncate text-white/70">{user?.nome} {user?.sobrenome}</div>
          <button onClick={logout} className="mt-2 flex items-center gap-2 text-white/60 hover:text-white"><LogOut size={16} /> Sair</button>
        </div>
      </aside>
      {open && <div className="fixed inset-0 z-30 bg-black/40 lg:hidden" onClick={() => setOpen(false)} />}
      <main className="min-w-0 flex-1">
        <div className="flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-3 lg:hidden">
          <button onClick={() => setOpen(true)} aria-label="Abrir menu"><Menu /></button>
          <span className="font-bold">{meta.event?.nome}</span>
        </div>
        <div className="mx-auto max-w-7xl p-4 lg:p-8"><Outlet /></div>
      </main>
    </div>
  );
}
