import { useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { LogIn } from 'lucide-react';
import { homeFor, useAuth } from '../lib/auth';

export default function Login() {
  const { user, login, meta, ready } = useAuth();
  const [params] = useSearchParams();
  const nav = useNavigate();
  const [form, setForm] = useState({ login: '', senha: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (ready && user) return <Navigate to={params.get('next') || homeFor(user)} replace />;

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      const u = await login(form.login, form.senha);
      nav(params.get('next') || homeFor(u), { replace: true });
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };

  return (
    <div className="flex min-h-full items-center justify-center bg-gradient-to-br from-brand-900 via-[#0f5a2c] to-brand-700 p-4">
      <form onSubmit={submit} className="w-full max-w-sm rounded-2xl bg-white p-7 shadow-2xl">
        <div className="mb-6 text-center">
          <div className="text-2xl font-black tracking-tight text-brand-900">{meta.event?.nome || 'SIRAN Summit'}</div>
          <div className="text-sm text-slate-500">Credenciamento e networking</div>
        </div>
        <label className="label" htmlFor="login">Login</label>
        <input id="login" className="input mb-4" autoCapitalize="none" autoCorrect="off" placeholder="nome.sobrenome"
          value={form.login} onChange={(e) => setForm({ ...form, login: e.target.value })} required />
        <label className="label" htmlFor="senha">Senha</label>
        <input id="senha" className="input mb-2" type="password" inputMode="numeric" placeholder="seu CPF (somente números)"
          value={form.senha} onChange={(e) => setForm({ ...form, senha: e.target.value })} required />
        <p className="mb-4 text-xs text-slate-500">Use seu primeiro nome e último sobrenome, sem acentos (ex.: <b>maria.silva</b>). A senha é o seu CPF.</p>
        {error && <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>}
        <button className="btn-primary w-full py-3" disabled={busy}><LogIn size={18} /> {busy ? 'Entrando…' : 'Entrar'}</button>
      </form>
    </div>
  );
}
