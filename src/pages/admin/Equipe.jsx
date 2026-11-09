import { useEffect, useState } from 'react';
import { Plus, Search } from 'lucide-react';
import { api, fmtCpf, fullName, ROLE_LABEL } from '../../lib/api';
import { ParticipantModal } from './Participantes';

export default function Equipe() {
  const [team, setTeam] = useState([]);
  const [open, setOpen] = useState(null);
  const [q, setQ] = useState('');
  const [found, setFound] = useState([]);
  const load = () => api('/participants?role=equipe&limit=500').then((d) => setTeam(d.rows));
  useEffect(() => { load(); }, []);
  useEffect(() => {
    if (!q.trim()) { setFound([]); return; }
    const t = setTimeout(() => api(`/participants?limit=8&q=${encodeURIComponent(q)}`).then((d) => setFound(d.rows)), 200);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="mr-auto text-2xl font-extrabold">Equipe e leitores de acesso</h1>
        <button className="btn-primary" onClick={() => setOpen({ id: null, initial: { nome: '', sobrenome: '', categoria: 'STAFF SIRAN SUMMIT', role: 'scanner', consentimento: false } })}><Plus size={16} /> Novo membro da equipe</button>
      </div>
      <div className="card space-y-2 p-4 text-sm text-slate-600">
        <p><b>Como funciona:</b> todo mundo entra com <b>nome.sobrenome</b> e o <b>CPF</b> como senha. O perfil define o que a pessoa vê:</p>
        <ul className="list-disc space-y-0.5 pl-5">
          <li><b>Leitor de acesso</b> — abre a câmera e bipa entradas/saídas do espaço vinculado (ex.: José → Plenária).</li>
          <li><b>Balcão</b> — busca inscritos, edita, marca expositor e imprime etiquetas.</li>
          <li><b>Administrador</b> — acesso total.</li>
        </ul>
        <p>Para dar uma função a alguém que já está inscrito, busque abaixo.</p>
      </div>

      <div className="card p-4">
        <div className="relative">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input className="input pl-9" placeholder="Buscar inscrito para promover a leitor/balcão…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {found.length > 0 && (
          <ul className="mt-2 divide-y divide-slate-100">
            {found.map((p) => (
              <li key={p.id}><button className="w-full px-2 py-2 text-left text-sm hover:bg-slate-50" onClick={() => { setOpen({ id: p.id }); setQ(''); }}>{fullName(p)} <span className="text-slate-500">· {p.empresa} · {fmtCpf(p.cpf)}</span></button></li>
            ))}
          </ul>
        )}
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500"><tr><th className="p-3">Nome</th><th className="p-3">Login</th><th className="p-3">Perfil</th><th className="p-3">Espaço</th></tr></thead>
          <tbody>
            {team.map((p) => (
              <tr key={p.id} className="cursor-pointer border-t border-slate-100 hover:bg-slate-50" onClick={() => setOpen({ id: p.id })}>
                <td className="p-3 font-semibold">{fullName(p)}</td>
                <td className="p-3 font-mono text-xs">{p.login}{!p.cpf && <span className="ml-2 text-red-600">(sem CPF — não consegue entrar)</span>}</td>
                <td className="p-3">{ROLE_LABEL[p.role]}</td>
                <td className="p-3">{p.role === 'scanner' ? (p.area_nome || <span className="text-red-600">sem espaço!</span>) : '—'}</td>
              </tr>
            ))}
            {team.length === 0 && <tr><td colSpan={4} className="p-6 text-center text-slate-400">Nenhum membro de equipe cadastrado.</td></tr>}
          </tbody>
        </table>
      </div>
      {open && <ParticipantModal id={open.id} initial={open.initial} onClose={() => setOpen(null)} onSaved={load} />}
    </div>
  );
}
