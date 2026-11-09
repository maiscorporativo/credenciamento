import { useCallback, useEffect, useRef, useState } from 'react';
import { CloudOff, Keyboard, LogIn, LogOut, Repeat } from 'lucide-react';
import { api, ApiError, fmtTime, fullName } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import QrScanner from '../../components/QrScanner';
import { beep } from '../../components/ui';

const QUEUE_KEY = 'cred_scan_queue';
const readQueue = () => { try { return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]'); } catch { return []; } };
const writeQueue = (q) => { try { localStorage.setItem(QUEUE_KEY, JSON.stringify(q)); } catch { /* sem storage */ } };
const localStamp = () => { const d = new Date(); const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`; };
const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now());

const MODES = [
  { k: 'auto', label: 'Automático', icon: Repeat, hint: 'alterna entrada/saída' },
  { k: 'entrada', label: 'Entrada', icon: LogIn },
  { k: 'saida', label: 'Saída', icon: LogOut },
];

export default function Acesso() {
  const { user } = useAuth();
  const [areas, setAreas] = useState([]);
  const [areaId, setAreaId] = useState(user.role === 'scanner' ? user.area_id : (() => { try { return Number(localStorage.getItem('cred_area')) || ''; } catch { return ''; } })());
  const [mode, setMode] = useState('auto');
  const [feed, setFeed] = useState({ rows: [], stats: null });
  const [result, setResult] = useState(null);
  const [pending, setPending] = useState(readQueue().length);
  const [manual, setManual] = useState('');
  const hideTimer = useRef();

  useEffect(() => { api('/areas').then((a) => setAreas(a.filter((x) => x.ativo))); }, []);
  useEffect(() => { try { if (user.role !== 'scanner') localStorage.setItem('cred_area', areaId); } catch { /* ok */ } }, [areaId, user.role]);

  const loadFeed = useCallback(() => {
    if (!areaId) return;
    api(`/scans/recent?area_id=${areaId}`).then(setFeed).catch(() => {});
  }, [areaId]);
  useEffect(() => { loadFeed(); const t = setInterval(loadFeed, 10000); return () => clearInterval(t); }, [loadFeed]);

  // reenvia leituras feitas sem internet
  const flush = useCallback(async () => {
    const q = readQueue();
    if (!q.length) return;
    const rest = [];
    for (const item of q) {
      try { await api('/scans', { method: 'POST', body: item }); }
      catch (e) { if (!(e instanceof ApiError)) rest.push(item); /* erro de rede: tenta depois; erro do servidor: descarta */ }
    }
    writeQueue(rest); setPending(rest.length); loadFeed();
  }, [loadFeed]);
  useEffect(() => { flush(); const t = setInterval(flush, 15000); window.addEventListener('online', flush); return () => { clearInterval(t); window.removeEventListener('online', flush); }; }, [flush]);

  const show = (r) => { setResult(r); clearTimeout(hideTimer.current); hideTimer.current = setTimeout(() => setResult(null), 2600); };

  const onScan = async (code) => {
    if (!areaId) { beep(false); show({ tone: 'err', title: 'Selecione o espaço' }); return; }
    const body = { code, area_id: areaId, direcao: mode, client_uuid: uuid() };
    try {
      const r = await api('/scans', { method: 'POST', body });
      beep(true);
      show({ tone: r.direcao, title: r.direcao === 'entrada' ? 'ENTRADA' : 'SAÍDA', name: r.participant.nome_cracha || fullName(r.participant), sub: [r.participant.empresa, r.participant.categoria].filter(Boolean).join(' · '), dup: r.duplicate });
      loadFeed();
    } catch (e) {
      if (e instanceof ApiError) { beep(false); show({ tone: 'err', title: 'NÃO RECONHECIDO', sub: e.message }); return; }
      const q = [...readQueue(), { ...body, scanned_at: localStamp() }];
      writeQueue(q); setPending(q.length); beep(true);
      show({ tone: 'offline', title: 'SALVO OFFLINE', sub: 'Será enviado quando a internet voltar' });
    }
  };

  const areaName = areas.find((a) => a.id === Number(areaId))?.nome || user.area_nome;
  const tones = { entrada: 'bg-brand-600', saida: 'bg-orange-500', err: 'bg-red-600', offline: 'bg-slate-700' };

  return (
    <div className="space-y-3">
      {user.role === 'scanner' ? (
        <div className="rounded-xl bg-brand-900 p-3 text-center text-white">
          <div className="text-xs uppercase tracking-wide text-white/60">Controle de acesso</div>
          <div className="text-xl font-extrabold text-lime">{areaName || 'Sem espaço vinculado — fale com o administrador'}</div>
        </div>
      ) : (
        <select className="input py-3 text-base font-bold" value={areaId} onChange={(e) => setAreaId(Number(e.target.value) || '')}>
          <option value="">Selecione o espaço…</option>
          {areas.map((a) => <option key={a.id} value={a.id}>{a.nome}</option>)}
        </select>
      )}

      <div className="grid grid-cols-3 gap-1 rounded-xl bg-slate-200 p-1">
        {MODES.map(({ k, label, icon: Icon }) => (
          <button key={k} onClick={() => setMode(k)} className={`flex items-center justify-center gap-1 rounded-lg py-2 text-sm font-bold ${mode === k ? 'bg-white shadow' : 'text-slate-600'}`}><Icon size={16} /> {label}</button>
        ))}
      </div>

      <div className="relative">
        <QrScanner onScan={onScan} cooldownMs={3000} />
        {result && (
          <div className={`absolute inset-0 flex flex-col items-center justify-center rounded-2xl p-6 text-center text-white ${tones[result.tone]}`}>
            <div className="text-4xl font-black">{result.title}</div>
            {result.name && <div className="mt-2 text-2xl font-bold">{result.name}</div>}
            {result.sub && <div className="mt-1 text-white/90">{result.sub}</div>}
            {result.dup && <div className="mt-2 text-xs text-white/80">(leitura repetida — já registrada)</div>}
          </div>
        )}
      </div>

      {pending > 0 && <div className="flex items-center gap-2 rounded-lg bg-amber-100 p-3 text-sm text-amber-900"><CloudOff size={18} /> {pending} leitura(s) aguardando internet para envio.</div>}

      <form onSubmit={(e) => { e.preventDefault(); if (manual.trim()) { onScan(manual.trim()); setManual(''); } }} className="flex gap-2">
        <div className="relative flex-1">
          <Keyboard size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input className="input pl-9 uppercase" placeholder="Digitar código ou usar leitor USB" value={manual} onChange={(e) => setManual(e.target.value)} />
        </div>
        <button className="btn-secondary">OK</button>
      </form>

      {feed.stats && (
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="card p-2"><div className="text-2xl font-extrabold text-brand-700">{feed.stats.presentes}</div><div className="text-xs text-slate-500">dentro agora</div></div>
          <div className="card p-2"><div className="text-2xl font-extrabold">{feed.stats.pessoas}</div><div className="text-xs text-slate-500">pessoas</div></div>
          <div className="card p-2"><div className="text-2xl font-extrabold">{feed.stats.leituras}</div><div className="text-xs text-slate-500">leituras</div></div>
        </div>
      )}

      <ul className="card divide-y divide-slate-100">
        {feed.rows.map((r) => (
          <li key={r.id} className="flex items-center gap-3 px-3 py-2 text-sm">
            <span className={`w-14 text-xs font-bold ${r.direcao === 'entrada' ? 'text-brand-700' : 'text-orange-600'}`}>{r.direcao === 'entrada' ? '→ ENTR' : '← SAÍDA'}</span>
            <span className="min-w-0 flex-1 truncate">{r.nome_cracha || fullName(r)} <span className="text-slate-400">· {r.empresa}</span></span>
            <span className="tabular-nums text-slate-500">{fmtTime(r.scanned_at)}</span>
          </li>
        ))}
        {feed.rows.length === 0 && <li className="p-4 text-center text-sm text-slate-400">Nenhuma leitura ainda.</li>}
      </ul>
    </div>
  );
}
