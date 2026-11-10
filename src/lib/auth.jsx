import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, getToken, setToken } from './api';

const Ctx = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [meta, setMeta] = useState({ categorias: [], roles: [], event: {} });
  const [ready, setReady] = useState(false);

  const loadMeta = useCallback(() => api('/meta').then(setMeta).catch(() => {}), []);

  useEffect(() => {
    loadMeta();
    if (!getToken()) { setReady(true); return; }
    api('/me').then((d) => setUser(d.user)).catch(() => setToken(null)).finally(() => setReady(true));
  }, [loadMeta]);

  const login = async (login, senha) => {
    const d = await api('/login', { method: 'POST', body: { login, senha } });
    setToken(d.token);
    setUser(d.user);
    return d.user;
  };
  const logout = async () => {
    try { await api('/logout', { method: 'POST' }); } catch { /* ok */ }
    setToken(null);
    setUser(null);
  };
  // entra direto com uma sessão já criada pelo servidor (ex.: logo após a autoinscrição)
  const adopt = (token, u) => { setToken(token); setUser(u); };
  const refresh = () => api('/me').then((d) => setUser(d.user));

  return <Ctx.Provider value={{ user, meta, ready, login, logout, adopt, refresh, reloadMeta: loadMeta }}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);

export function homeFor(user) {
  if (!user) return '/login';
  return { admin: '/admin', balcao: '/balcao', scanner: '/app/acesso' }[user.role] || '/app';
}
