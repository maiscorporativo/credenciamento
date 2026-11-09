import { useEffect, useState } from 'react';
import { Download, Search } from 'lucide-react';
import { api, exportXlsx, fmtDate, fmtMin, fmtTime, fullName } from '../../lib/api';
import { CategoryBadge, Stat } from '../../components/ui';

const TABS = [['espacos', 'Por espaço'], ['pessoa', 'Por participante'], ['networking', 'Networking / leads']];

export default function Relatorios() {
  const [tab, setTab] = useState('espacos');
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-extrabold">Relatórios</h1>
      <div className="flex gap-1 rounded-xl bg-slate-200 p-1 text-sm font-semibold">
        {TABS.map(([k, l]) => <button key={k} onClick={() => setTab(k)} className={`flex-1 rounded-lg px-3 py-2 ${tab === k ? 'bg-white shadow' : 'text-slate-600'}`}>{l}</button>)}
      </div>
      {tab === 'espacos' && <PorEspaco />}
      {tab === 'pessoa' && <PorPessoa />}
      {tab === 'networking' && <Networking />}
    </div>
  );
}

function PorEspaco() {
  const [areas, setAreas] = useState([]);
  const [id, setId] = useState('');
  const [d, setD] = useState(null);
  useEffect(() => { api('/areas').then((a) => { setAreas(a); if (a[0]) setId(String(a[0].id)); }); }, []);
  useEffect(() => { if (id) api(`/reports/areas/${id}`).then(setD); }, [id]);

  const exportar = () => exportXlsx(d.pessoas.map((p) => ({
    nome: fullName(p), empresa: p.empresa, categoria: p.categoria, email: p.email, whatsapp: p.whatsapp,
    primeira_leitura: p.primeira, ultima_leitura: p.ultima, entradas: p.entradas, saidas: p.saidas, minutos_no_espaco: p.minutos, situacao: p.status === 'entrada' ? 'dentro' : 'saiu',
  })), `espaco-${d.area.nome}.xlsx`, d.area.nome);
  const exportarLeituras = () => exportXlsx(d.leituras.map((l) => ({ data_hora: l.scanned_at, direcao: l.direcao, nome: fullName(l), empresa: l.empresa, categoria: l.categoria, operador: l.operador })), `leituras-${d.area.nome}.xlsx`, 'Leituras');

  if (!areas.length) return <div className="card p-6 text-slate-500">Cadastre espaços para ver os relatórios.</div>;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <select className="input w-auto" value={id} onChange={(e) => setId(e.target.value)}>{areas.map((a) => <option key={a.id} value={a.id}>{a.nome}</option>)}</select>
        {d && <><button className="btn-secondary" onClick={exportar}><Download size={16} /> Pessoas (Excel)</button><button className="btn-secondary" onClick={exportarLeituras}><Download size={16} /> Todas as leituras</button></>}
      </div>
      {d && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <Stat label="Presentes agora" value={d.stats.presentes} tone="text-brand-700" />
            <Stat label="Pessoas únicas" value={d.stats.pessoas} />
            <Stat label="Entradas" value={d.stats.entradas} />
            <Stat label="Saídas" value={d.stats.saidas} />
            <Stat label="Leituras" value={d.stats.leituras} />
          </div>
          {d.porHora.length > 0 && (
            <div className="card overflow-x-auto p-4">
              <h3 className="mb-2 font-bold">Fluxo por hora</h3>
              <table className="text-sm"><thead className="text-xs uppercase text-slate-500"><tr><th className="pr-6 text-left">Hora</th><th className="pr-6 text-right">Entradas</th><th className="text-right">Saídas</th></tr></thead>
                <tbody>{d.porHora.map((h) => <tr key={h.hora}><td className="pr-6 tabular-nums">{h.hora.slice(8, 10)}/{h.hora.slice(5, 7)} {h.hora.slice(11)}h</td><td className="pr-6 text-right tabular-nums">{h.entradas}</td><td className="text-right tabular-nums">{h.saidas}</td></tr>)}</tbody></table>
            </div>
          )}
          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500"><tr><th className="p-3">Participante</th><th className="p-3">Categoria</th><th className="p-3">1ª leitura</th><th className="p-3">Última</th><th className="p-3 text-right">Entr./Saídas</th><th className="p-3 text-right">Permanência</th><th className="p-3">Situação</th></tr></thead>
              <tbody>
                {d.pessoas.map((p) => (
                  <tr key={p.id} className="border-t border-slate-100">
                    <td className="p-3"><div className="font-semibold">{fullName(p)}</div><div className="text-xs text-slate-500">{p.empresa}</div></td>
                    <td className="p-3"><CategoryBadge c={p.categoria} /></td>
                    <td className="p-3 tabular-nums">{fmtDate(p.primeira)}</td>
                    <td className="p-3 tabular-nums">{fmtDate(p.ultima)}</td>
                    <td className="p-3 text-right tabular-nums">{p.entradas}/{p.saidas}</td>
                    <td className="p-3 text-right tabular-nums">{fmtMin(p.minutos)}</td>
                    <td className="p-3">{p.status === 'entrada' ? <span className="badge bg-brand-100 text-brand-900">dentro</span> : <span className="badge bg-slate-100 text-slate-600">saiu</span>}</td>
                  </tr>
                ))}
                {d.pessoas.length === 0 && <tr><td colSpan={7} className="p-6 text-center text-slate-400">Nenhuma leitura neste espaço ainda.</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function PorPessoa() {
  const [q, setQ] = useState('');
  const [found, setFound] = useState([]);
  const [d, setD] = useState(null);
  useEffect(() => {
    if (!q.trim()) { setFound([]); return; }
    const t = setTimeout(() => api(`/participants?limit=10&q=${encodeURIComponent(q)}`).then((r) => setFound(r.rows)), 200);
    return () => clearTimeout(t);
  }, [q]);
  const open = (id) => { setQ(''); api(`/reports/participant/${id}`).then(setD); };

  return (
    <div className="space-y-4">
      <div className="card p-4">
        <div className="relative"><Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input className="input pl-9" placeholder="Buscar participante…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        {found.length > 0 && <ul className="mt-2 divide-y divide-slate-100">{found.map((p) => <li key={p.id}><button className="w-full px-2 py-2 text-left text-sm hover:bg-slate-50" onClick={() => open(p.id)}>{fullName(p)} <span className="text-slate-500">· {p.empresa}</span></button></li>)}</ul>}
      </div>
      {d && (
        <div className="space-y-4">
          <div className="card flex flex-wrap items-center gap-3 p-4">
            <div className="mr-auto"><div className="text-xl font-extrabold">{fullName(d.participant)}</div><div className="text-sm text-slate-500">{d.participant.empresa} · credenciado {fmtDate(d.participant.checkin_at)}</div></div>
            <CategoryBadge c={d.participant.categoria} />
            <button className="btn-secondary" onClick={() => exportXlsx(d.scans.map((s) => ({ data_hora: s.scanned_at, espaco: s.area, direcao: s.direcao })), `movimentacao-${d.participant.nome}.xlsx`, 'Movimentação')}><Download size={16} /> Excel</button>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="card p-4">
              <h3 className="mb-2 font-bold">Tempo por espaço</h3>
              {d.areas.length === 0 ? <p className="text-sm text-slate-400">Sem leituras.</p> : (
                <table className="w-full text-sm"><tbody>{d.areas.map((a) => <tr key={a.id} className="border-t border-slate-100"><td className="py-2">{a.nome}</td><td className="text-right tabular-nums">{a.leituras} leituras</td><td className="text-right font-semibold tabular-nums">{fmtMin(a.minutos)}</td></tr>)}</tbody></table>
              )}
              <h3 className="mb-2 mt-4 font-bold">Linha do tempo</h3>
              <ol className="space-y-1 text-sm">
                {d.scans.map((s, i) => <li key={i} className="flex gap-3"><span className="w-28 tabular-nums text-slate-500">{fmtDate(s.scanned_at)}</span><span className={s.direcao === 'entrada' ? 'text-brand-700' : 'text-orange-600'}>{s.direcao === 'entrada' ? '→ entrou' : '← saiu'}</span><span>{s.area}</span></li>)}
              </ol>
            </div>
            <div className="card p-4">
              <h3 className="mb-2 font-bold">Contatos que salvou ({d.contatos.length})</h3>
              <ul className="space-y-1 text-sm">{d.contatos.map((c, i) => <li key={i}>{fullName(c)} <span className="text-slate-500">· {c.empresa} · {fmtTime(c.created_at)}</span></li>)}</ul>
              <h3 className="mb-2 mt-4 font-bold">Quem salvou este contato ({d.escaneadoPor.length})</h3>
              <ul className="space-y-1 text-sm">{d.escaneadoPor.map((c, i) => <li key={i}>{fullName(c)} <span className="text-slate-500">· {c.empresa} · {c.categoria}</span></li>)}</ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Networking() {
  const [d, setD] = useState(null);
  useEffect(() => { api('/reports/networking').then(setD); }, []);
  if (!d) return null;
  return (
    <div className="space-y-4">
      <div className="flex justify-end"><button className="btn-secondary" onClick={() => exportXlsx(d.todos, 'networking-leads.xlsx', 'Leads')}><Download size={16} /> Exportar todos os contatos trocados</button></div>
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500"><tr><th className="p-3">#</th><th className="p-3">Quem mais escaneou</th><th className="p-3">Categoria</th><th className="p-3 text-right">Contatos</th></tr></thead>
          <tbody>{d.ranking.map((r, i) => <tr key={r.id} className="border-t border-slate-100"><td className="p-3 text-slate-400">{i + 1}</td><td className="p-3"><b>{fullName(r)}</b> <span className="text-slate-500">· {r.empresa}</span></td><td className="p-3"><CategoryBadge c={r.categoria} /></td><td className="p-3 text-right font-bold tabular-nums">{r.contatos}</td></tr>)}
            {d.ranking.length === 0 && <tr><td colSpan={4} className="p-6 text-center text-slate-400">Nenhum contato trocado ainda.</td></tr>}</tbody>
        </table>
      </div>
      <p className="text-xs text-slate-500">E-mail e WhatsApp só aparecem na exportação para quem autorizou o compartilhamento na inscrição (LGPD).</p>
    </div>
  );
}
