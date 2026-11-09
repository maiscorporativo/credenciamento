const KEY = 'cred_token';

export const getToken = () => { try { return localStorage.getItem(KEY); } catch { return null; } };
export const setToken = (t) => { try { t ? localStorage.setItem(KEY, t) : localStorage.removeItem(KEY); } catch { /* sem storage */ } };

export class ApiError extends Error {
  constructor(message, status) { super(message); this.status = status; }
}

export async function api(path, { method = 'GET', body } = {}) {
  const token = getToken();
  const res = await fetch('/api' + path, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && path !== '/login') {
    setToken(null);
    if (!location.pathname.startsWith('/login')) location.href = '/login?next=' + encodeURIComponent(location.pathname);
  }
  if (!res.ok) throw new ApiError(data.error || `Erro ${res.status}`, res.status);
  return data;
}

export const fmtDate = (s) => (s ? new Date(s.replace(' ', 'T')).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—');
export const fmtTime = (s) => (s ? s.slice(11, 16) : '—');
export const fmtCpf = (d) => (d && d.length === 11 ? `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}` : d || '');
export function validCpf(c) {
  const d = String(c || '').replace(/\D/g, '');
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const dv = (len) => { let s = 0; for (let i = 0; i < len; i++) s += Number(d[i]) * (len + 1 - i); const r = (s * 10) % 11; return r === 10 ? 0 : r; };
  return dv(9) === Number(d[9]) && dv(10) === Number(d[10]);
}
export const fullName =(p) => [p?.nome, p?.sobrenome].filter(Boolean).join(' ');
export const fmtMin = (m) => (m == null ? '—' : m < 60 ? `${m} min` : `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}`);

/** Exporta linhas (array de objetos) para .xlsx — carrega a biblioteca sob demanda */
export async function exportXlsx(rows, filename, sheet = 'Dados') {
  const XLSX = await import('xlsx');
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheet.slice(0, 31));
  XLSX.writeFile(wb, filename);
}

export const CATEGORY_COLORS = {
  VISITANTE: 'bg-sky-100 text-sky-800',
  EXPOSITOR: 'bg-amber-100 text-amber-800',
  'STAFF SIRAN SUMMIT': 'bg-violet-100 text-violet-800',
  PALESTRANTE: 'bg-rose-100 text-rose-800',
  IMPRENSA: 'bg-slate-200 text-slate-800',
  'ORGANIZAÇÃO': 'bg-brand-100 text-brand-900',
  VIP: 'bg-yellow-200 text-yellow-900',
};

export const ROLE_LABEL = { participante: 'Participante', scanner: 'Leitor de acesso', balcao: 'Balcão / impressão', admin: 'Administrador' };
