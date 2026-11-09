import { useCallback, useEffect, useState } from 'react';
import { Download, Plus, Printer, Search, Trash2 } from 'lucide-react';
import { api, exportXlsx, fmtCpf, fmtDate, fullName, ROLE_LABEL, validCpf } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { printLabels } from '../../lib/label';
import { CategoryBadge, LabelPreview, Modal, ParticipantForm, useLabelTemplate } from '../../components/ui';

const PAGE = 50;

export function ParticipantModal({ id, initial, onClose, onSaved }) {
  const { meta } = useAuth();
  const [tpl] = useLabelTemplate();
  const [data, setData] = useState(initial || null);
  const [hist, setHist] = useState(null);
  const [areas, setAreas] = useState([]);
  useEffect(() => {
    api('/areas').then(setAreas);
    if (id) api(`/participants/${id}`).then((d) => { setData(d); setHist(d); });
  }, [id]);
  if (!data) return null;

  const save = async (andPrint) => {
    try {
      const saved = id ? await api(`/participants/${id}`, { method: 'PUT', body: data }) : await api('/participants', { method: 'POST', body: data });
      if (andPrint) { await printLabels(tpl, [saved], meta.event); await api('/print', { method: 'POST', body: { ids: [saved.id] } }); }
      onSaved?.(saved); onClose();
    } catch (e) { alert(e.message); }
  };
  const remove = async () => {
    if (!confirm(`Excluir ${fullName(data)} e todo o histórico de acessos e contatos?`)) return;
    await api(`/participants/${id}`, { method: 'DELETE' }); onSaved?.(); onClose();
  };

  return (
    <Modal title={id ? fullName(data) : 'Novo participante'} onClose={onClose} wide
      footer={<>
        {id && <button className="btn-ghost mr-auto text-red-600" onClick={remove}><Trash2 size={16} /> Excluir</button>}
        <button className="btn-secondary" onClick={onClose}>Cancelar</button>
        <button className="btn-secondary" onClick={() => save(true)}><Printer size={16} /> Salvar e imprimir</button>
        <button className="btn-primary" onClick={() => save(false)}>Salvar</button>
      </>}>
      <div className="grid gap-6 lg:grid-cols-[1fr_auto]">
        <ParticipantForm value={data} onChange={setData} admin areas={areas} />
        <div className="space-y-4 lg:w-72">
          <div>
            <div className="label">Etiqueta</div>
            <div className="overflow-x-auto rounded-lg bg-slate-100 p-3"><LabelPreview tpl={tpl} participant={data.code ? data : { ...data, code: 'NOVO0000' }} scale={0.9} /></div>
          </div>
          {id && (
            <div className="space-y-1 rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
              <div><b>Login:</b> {data.login} · <b>senha:</b> CPF</div>
              <div><b>Código:</b> {data.code}</div>
              <div><b>Credenciado:</b> {fmtDate(data.checkin_at)} · impressa {data.print_count}x</div>
              <div><b>Origem:</b> {data.origem} · <b>contatos salvos:</b> {hist?.contatos ?? 0}</div>
            </div>
          )}
          {hist?.scans?.length > 0 && (
            <div>
              <div className="label">Movimentação</div>
              <ul className="max-h-48 space-y-1 overflow-y-auto text-xs">
                {hist.scans.map((s) => (
                  <li key={s.id} className="flex justify-between gap-2 border-b border-slate-100 py-1">
                    <span>{s.area_nome}</span>
                    <span className={s.direcao === 'entrada' ? 'text-brand-700' : 'text-orange-600'}>{s.direcao}</span>
                    <span className="tabular-nums text-slate-500">{fmtDate(s.scanned_at)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

export default function Participantes() {
  const { meta } = useAuth();
  const [tpl] = useLabelTemplate();
  const [f, setF] = useState({ q: '', categoria: '', status: '' });
  const [page, setPage] = useState(0);
  const [data, setData] = useState({ rows: [], total: 0 });
  const [selected, setSelected] = useState(new Set());
  const [open, setOpen] = useState(null); // id | 'new'

  const load = useCallback(() => {
    const qs = new URLSearchParams({ ...f, limit: PAGE, offset: page * PAGE });
    return api('/participants?' + qs).then(setData);
  }, [f, page]);
  useEffect(() => { const t = setTimeout(load, 200); return () => clearTimeout(t); }, [load]);
  useEffect(() => { setPage(0); }, [f]);

  const toggle = (id) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const allOnPage = data.rows.length > 0 && data.rows.every((r) => selected.has(r.id));

  const selectAllFiltered = async () => {
    const qs = new URLSearchParams({ ...f, limit: 5000 });
    const all = await api('/participants?' + qs);
    setSelected(new Set(all.rows.map((r) => r.id)));
  };

  const bulkPrint = async () => {
    const ids = [...selected];
    if (!confirm(`Imprimir ${ids.length} etiqueta(s)? Elas sairão em sequência na impressora.`)) return;
    const list = await api('/participants/by-ids', { method: 'POST', body: { ids } });
    await printLabels(tpl, list, meta.event);
    if (confirm('As etiquetas saíram corretamente? Clique OK para registrar como impressas (e credenciadas).')) {
      await api('/print', { method: 'POST', body: { ids } });
      load();
    }
  };
  const bulk = async (action, value) => {
    const ids = [...selected];
    if (action === 'delete' && !confirm(`Excluir ${ids.length} participante(s)? Não pode ser desfeito.`)) return;
    await api('/participants/bulk', { method: 'POST', body: { ids, action, value } });
    setSelected(new Set()); load();
  };
  const exportAll = async () => {
    const rows = await api('/export/participants');
    await exportXlsx(rows.map((r) => ({ ...r, consentimento: r.consentimento ? 'sim' : 'não' })), `participantes-${new Date().toISOString().slice(0, 10)}.xlsx`, 'Participantes');
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="mr-auto text-2xl font-extrabold">Participantes <span className="text-base font-normal text-slate-400">({data.total})</span></h1>
        <button className="btn-secondary" onClick={exportAll}><Download size={16} /> Exportar Excel</button>
        <button className="btn-primary" onClick={() => setOpen('new')}><Plus size={16} /> Novo</button>
      </div>

      <div className="card grid gap-3 p-4 md:grid-cols-[1fr_auto_auto]">
        <div className="relative">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input className="input pl-9" placeholder="Buscar por nome, CPF, e-mail, empresa, WhatsApp ou código" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} />
        </div>
        <select className="input" value={f.categoria} onChange={(e) => setF({ ...f, categoria: e.target.value })}>
          <option value="">Todas as categorias</option>
          {meta.categorias.map((c) => <option key={c}>{c}</option>)}
        </select>
        <select className="input" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>
          <option value="">Todos</option>
          <option value="credenciado">Credenciados</option>
          <option value="pendente">Não credenciados</option>
          <option value="impresso">Etiqueta impressa</option>
          <option value="nao_impresso">Etiqueta não impressa</option>
        </select>
      </div>

      {selected.size > 0 && (
        <div className="card flex flex-wrap items-center gap-2 bg-brand-50 p-3 text-sm">
          <b>{selected.size} selecionado(s)</b>
          <button className="btn-ghost" onClick={selectAllFiltered}>Selecionar todos os {data.total} do filtro</button>
          <button className="btn-ghost" onClick={() => setSelected(new Set())}>Limpar</button>
          <span className="mx-2 h-5 w-px bg-slate-300" />
          <button className="btn-primary" onClick={bulkPrint}><Printer size={16} /> Imprimir etiquetas</button>
          <button className="btn-secondary" onClick={() => bulk('categoria', 'EXPOSITOR')}>Marcar como EXPOSITOR</button>
          <button className="btn-secondary" onClick={() => bulk('categoria', 'VISITANTE')}>Marcar como VISITANTE</button>
          <select className="input w-auto" value="" onChange={(e) => e.target.value && bulk('categoria', e.target.value)}>
            <option value="">Outra categoria…</option>
            {meta.categorias.map((c) => <option key={c}>{c}</option>)}
          </select>
          <button className="btn-ghost text-red-600" onClick={() => bulk('delete')}><Trash2 size={16} /> Excluir</button>
        </div>
      )}

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="w-10 p-3"><input type="checkbox" className="accent-brand-700" checked={allOnPage} onChange={() => setSelected((s) => { const n = new Set(s); data.rows.forEach((r) => (allOnPage ? n.delete(r.id) : n.add(r.id))); return n; })} aria-label="Selecionar página" /></th>
              <th className="p-3">Nome</th><th className="p-3">Empresa</th><th className="p-3">CPF</th><th className="p-3">Categoria</th><th className="p-3">Credenciado</th><th className="p-3">Perfil</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((p) => (
              <tr key={p.id} className="cursor-pointer border-t border-slate-100 hover:bg-slate-50" onClick={() => setOpen(p.id)}>
                <td className="p-3" onClick={(e) => e.stopPropagation()}><input type="checkbox" className="accent-brand-700" checked={selected.has(p.id)} onChange={() => toggle(p.id)} aria-label={`Selecionar ${fullName(p)}`} /></td>
                <td className="p-3"><div className="font-semibold">{fullName(p)}</div><div className="text-xs text-slate-500">{p.email}</div></td>
                <td className="max-w-56 truncate p-3">{p.empresa}</td>
                <td className="whitespace-nowrap p-3 tabular-nums">{fmtCpf(p.cpf)}{!validCpf(p.cpf) && <span className="badge ml-1 bg-red-100 text-red-700" title="CPF incompleto ou inválido — a pessoa não conseguirá entrar no app">inválido</span>}</td>
                <td className="p-3"><CategoryBadge c={p.categoria} /></td>
                <td className="whitespace-nowrap p-3 text-xs">{p.checkin_at ? <span className="text-brand-700">✔ {fmtDate(p.checkin_at)}{p.print_count > 1 ? ` (${p.print_count}x)` : ''}</span> : <span className="text-slate-400">—</span>}</td>
                <td className="p-3 text-xs">{p.role !== 'participante' ? <span className="badge bg-slate-800 text-white">{ROLE_LABEL[p.role]}{p.area_nome ? ` · ${p.area_nome}` : ''}</span> : ''}</td>
              </tr>
            ))}
            {data.rows.length === 0 && <tr><td colSpan={7} className="p-8 text-center text-slate-400">Nenhum participante encontrado.</td></tr>}
          </tbody>
        </table>
      </div>

      {data.total > PAGE && (
        <div className="flex items-center justify-center gap-3 text-sm">
          <button className="btn-secondary" disabled={page === 0} onClick={() => setPage(page - 1)}>Anterior</button>
          <span>Página {page + 1} de {Math.ceil(data.total / PAGE)}</span>
          <button className="btn-secondary" disabled={(page + 1) * PAGE >= data.total} onClick={() => setPage(page + 1)}>Próxima</button>
        </div>
      )}

      {open && <ParticipantModal id={open === 'new' ? null : open} initial={open === 'new' ? { nome: '', sobrenome: '', categoria: 'VISITANTE', consentimento: true, role: 'participante' } : null}
        onClose={() => setOpen(null)} onSaved={load} />}
    </div>
  );
}
