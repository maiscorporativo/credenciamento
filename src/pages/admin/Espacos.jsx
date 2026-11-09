import { useEffect, useState } from 'react';
import { MapPin, Plus, Trash2 } from 'lucide-react';
import { api } from '../../lib/api';

export default function Espacos() {
  const [areas, setAreas] = useState([]);
  const [nome, setNome] = useState('');
  const load = () => api('/areas').then(setAreas);
  useEffect(() => { load(); }, []);

  const add = async (e) => {
    e.preventDefault();
    try { await api('/areas', { method: 'POST', body: { nome } }); setNome(''); load(); } catch (err) { alert(err.message); }
  };
  const rename = async (a) => {
    const n = prompt('Novo nome do espaço', a.nome);
    if (n && n !== a.nome) { await api(`/areas/${a.id}`, { method: 'PUT', body: { nome: n } }); load(); }
  };
  const toggle = async (a) => { await api(`/areas/${a.id}`, { method: 'PUT', body: { ativo: !a.ativo } }); load(); };
  const remove = async (a) => {
    if (!confirm(`Excluir "${a.nome}"? As leituras já feitas ficarão sem espaço associado.`)) return;
    await api(`/areas/${a.id}`, { method: 'DELETE' }); load();
  };

  return (
    <div className="max-w-3xl space-y-4">
      <h1 className="text-2xl font-extrabold">Espaços do evento</h1>
      <p className="text-sm text-slate-600">Cadastre cada ambiente onde haverá controle de acesso (Plenária, Seminário do Leite, Arena de Negócios…). Depois, em <b>Equipe / leitores</b>, vincule cada leitor ao seu espaço.</p>
      <form onSubmit={add} className="card flex gap-2 p-4">
        <input className="input" placeholder="Ex.: Seminário do Leite" value={nome} onChange={(e) => setNome(e.target.value)} required />
        <button className="btn-primary whitespace-nowrap"><Plus size={16} /> Adicionar</button>
      </form>
      <ul className="card divide-y divide-slate-100">
        {areas.map((a) => (
          <li key={a.id} className="flex items-center gap-3 p-4">
            <MapPin className={a.ativo ? 'text-brand-700' : 'text-slate-300'} />
            <button className="flex-1 text-left" onClick={() => rename(a)}>
              <div className={`font-semibold ${a.ativo ? '' : 'text-slate-400 line-through'}`}>{a.nome}</div>
              <div className="text-xs text-slate-500">{a.operadores} leitor(es) vinculado(s) · clique para renomear</div>
            </button>
            <button className="btn-ghost text-xs" onClick={() => toggle(a)}>{a.ativo ? 'Desativar' : 'Ativar'}</button>
            <button className="btn-ghost p-1 text-red-600" onClick={() => remove(a)} aria-label="Excluir"><Trash2 size={16} /></button>
          </li>
        ))}
        {areas.length === 0 && <li className="p-6 text-center text-slate-400">Nenhum espaço cadastrado.</li>}
      </ul>
    </div>
  );
}
