import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, LogOut, Pencil, Printer, ScanLine, Search, UserPlus } from 'lucide-react';
import { api, fmtCpf, fmtDate, fullName, validCpf } from '../lib/api';
import { useAuth } from '../lib/auth';
import { printLabels } from '../lib/label';
import { CategoryBadge, ExhibitorToggle, LabelPreview, Modal, ParticipantForm, useLabelTemplate } from '../components/ui';

const EMPTY = { nome: '', sobrenome: '', categoria: 'VISITANTE', consentimento: true };

export default function Balcao() {
  const { user, logout, meta } = useAuth();
  const [tpl] = useLabelTemplate();
  const [q, setQ] = useState('');
  const [results, setResults] = useState({ rows: [], total: 0 });
  const [sel, setSel] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [modal, setModal] = useState(null); // {mode:'new'|'edit', data}
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const searchRef = useRef();

  const flash = (text, tone = 'ok') => { setMsg({ text, tone }); setTimeout(() => setMsg(null), 3500); };

  const search = useCallback(async (term) => {
    if (!term.trim()) { setResults({ rows: [], total: 0 }); return; }
    const r = await api(`/participants?limit=30&q=${encodeURIComponent(term)}`);
    setResults(r);
    // leitor USB / QR: código exato abre direto
    if (r.rows[0] && r.rows[0].code === term.trim().toUpperCase().slice(-8)) select(r.rows[0]);
  }, []);

  useEffect(() => { const t = setTimeout(() => search(q).catch(() => {}), 220); return () => clearTimeout(t); }, [q, search]);
  useEffect(() => { searchRef.current?.focus(); }, []);

  const select = (p) => { setSel(p); setDirty(false); };
  const patch = (k, v) => { setSel((s) => ({ ...s, [k]: v })); setDirty(true); };

  const save = async (data = sel) => {
    const saved = await api(`/participants/${data.id}`, { method: 'PUT', body: data });
    setSel(saved); setDirty(false);
    setResults((r) => ({ ...r, rows: r.rows.map((x) => (x.id === saved.id ? saved : x)) }));
    return saved;
  };

  const print = async (p = sel) => {
    if (!tpl || !p) return;
    if (p.print_count > 0 && !confirm(`${fullName(p)} já teve a etiqueta impressa ${p.print_count}x (última: ${fmtDate(p.last_print_at)}). Imprimir novamente?`)) return;
    setBusy(true);
    try {
      const cur = dirty ? await save() : p;
      await printLabels(tpl, [cur], meta.event);
      const r = await api('/print', { method: 'POST', body: { ids: [cur.id] } });
      const done = { ...cur, print_count: cur.print_count + 1, last_print_at: r.at, checkin_at: cur.checkin_at || r.at };
      setSel(done);
      setResults((x) => ({ ...x, rows: x.rows.map((y) => (y.id === done.id ? done : y)) }));
      flash(`Etiqueta de ${fullName(cur)} enviada para a impressora.`);
      setQ('');
      searchRef.current?.focus();
    } catch (e) { flash(e.message, 'err'); } finally { setBusy(false); }
  };

  const submitModal = async () => {
    try {
      if (modal.mode === 'new') {
        const created = await api('/participants', { method: 'POST', body: { ...modal.data, origem: 'balcao' } });
        setModal(null); select(created);
        if (meta.event?.autoPrint !== false) await print(created);
      } else {
        await save(modal.data); setModal(null); flash('Dados atualizados.');
      }
    } catch (e) { alert(e.message); }
  };

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'F2' && sel && !modal) { e.preventDefault(); print(); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <div className="flex min-h-full flex-col">
      <header className="flex items-center gap-3 bg-brand-900 px-4 py-3 text-white">
        {user.role === 'admin' && <Link to="/admin" className="rounded p-1 hover:bg-white/10" aria-label="Voltar"><ArrowLeft size={20} /></Link>}
        <div className="flex-1">
          <div className="font-extrabold text-lime">{meta.event?.nome} · Balcão de credenciamento</div>
          <div className="text-xs text-white/60">Operador: {user.nome} {user.sobrenome}</div>
        </div>
        <Link to="/app/acesso" className="btn bg-white/10 text-white hover:bg-white/20"><ScanLine size={18} /> Bipar acesso</Link>
        <button onClick={() => setModal({ mode: 'new', data: { ...EMPTY } })} className="btn bg-lime text-brand-900 hover:bg-white"><UserPlus size={18} /> Novo cadastro</button>
        <button onClick={logout} className="rounded p-2 hover:bg-white/10" aria-label="Sair"><LogOut size={18} /></button>
      </header>

      <div className="grid flex-1 gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <section className="flex min-h-0 flex-col">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
            <input ref={searchRef} value={q} onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && results.rows[0]) select(results.rows[0]); }}
              placeholder="Nome, CPF, e-mail, empresa ou bipe o QR Code"
              className="w-full rounded-2xl border-2 border-slate-200 bg-white py-4 pl-12 pr-4 text-lg outline-none focus:border-brand-600" />
          </div>
          <div className="mt-2 text-xs text-slate-500">{q ? `${results.total} resultado(s)` : 'Digite para buscar. Enter seleciona o primeiro. F2 imprime.'}</div>
          <ul className="mt-3 space-y-2 overflow-y-auto">
            {results.rows.map((p) => (
              <li key={p.id}>
                <button onClick={() => select(p)} className={`card flex w-full items-center gap-3 p-3 text-left hover:ring-brand-500 ${sel?.id === p.id ? 'ring-2 ring-brand-600' : ''}`}>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold">{fullName(p)}</div>
                    <div className="truncate text-sm text-slate-500">{p.empresa || '—'} · {fmtCpf(p.cpf)}</div>
                  </div>
                  <CategoryBadge c={p.categoria} />
                  {p.checkin_at && <CheckCircle2 className="text-brand-600" size={20} aria-label="Credenciado" />}
                </button>
              </li>
            ))}
          </ul>
        </section>

        <section>
          {!sel ? (
            <div className="card grid h-full min-h-64 place-items-center p-8 text-center text-slate-400">Selecione um inscrito para conferir os dados e imprimir a etiqueta.</div>
          ) : (
            <div className="card space-y-4 p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-2xl font-extrabold">{fullName(sel)}</h2>
                  <div className="text-sm text-slate-500">{sel.email} · {sel.whatsapp} · CPF {fmtCpf(sel.cpf)}</div>
                </div>
                <button className="btn-secondary" onClick={() => setModal({ mode: 'edit', data: { ...sel } })}><Pencil size={16} /> Editar</button>
              </div>

              {!validCpf(sel.cpf) && (
                <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">⚠ CPF {sel.cpf ? 'incompleto/inválido' : 'não informado'} — confirme com o participante e corrija em <b>Editar</b> (o CPF é a senha do app).</div>
              )}
              {sel.checkin_at ? (
                <div className="rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-900">✔ Credenciado em {fmtDate(sel.checkin_at)} · etiqueta impressa {sel.print_count}x</div>
              ) : (
                <div className="rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-600">Ainda não credenciado</div>
              )}

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="label">Nome no crachá</label>
                  <input className="input text-base font-semibold" value={sel.nome_cracha} onChange={(e) => patch('nome_cracha', e.target.value)} />
                </div>
                <div>
                  <label className="label">Empresa</label>
                  <input className="input text-base" value={sel.empresa} onChange={(e) => patch('empresa', e.target.value)} />
                </div>
              </div>
              <ExhibitorToggle categoria={sel.categoria} onChange={(v) => patch('categoria', v)} />

              <div>
                <div className="label">Pré-visualização da etiqueta</div>
                <div className="overflow-x-auto rounded-xl bg-slate-200 p-4"><LabelPreview tpl={tpl} participant={sel} scale={1.4} className="mx-auto" /></div>
              </div>

              <div className="flex flex-wrap gap-2">
                <button className="btn-primary flex-1 py-4 text-lg" onClick={() => print()} disabled={busy || !tpl}>
                  <Printer /> {busy ? 'Imprimindo…' : sel.print_count ? 'Reimprimir etiqueta' : 'Imprimir etiqueta'}
                </button>
                {dirty && <button className="btn-secondary py-4" onClick={() => save().then(() => flash('Alterações salvas.'))}>Salvar sem imprimir</button>}
              </div>
            </div>
          )}
        </section>
      </div>

      {msg && <div className={`fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-xl px-5 py-3 font-semibold text-white shadow-lg ${msg.tone === 'err' ? 'bg-red-600' : 'bg-brand-700'}`}>{msg.text}</div>}

      {modal && (
        <Modal title={modal.mode === 'new' ? 'Novo cadastro no balcão' : 'Editar participante'} onClose={() => setModal(null)} wide
          footer={<><button className="btn-secondary" onClick={() => setModal(null)}>Cancelar</button>
            <button className="btn-primary" onClick={submitModal}>{modal.mode === 'new' ? (meta.event?.autoPrint !== false ? 'Cadastrar e imprimir' : 'Cadastrar') : 'Salvar'}</button></>}>
          <ParticipantForm value={modal.data} onChange={(data) => setModal({ ...modal, data })} />
        </Modal>
      )}
    </div>
  );
}
