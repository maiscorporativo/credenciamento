import { useEffect, useState } from 'react';
import { CheckCircle2, Copy, RefreshCw, Save, Search, XCircle } from 'lucide-react';
import { api, fmtDate } from '../../lib/api';
import { useAuth } from '../../lib/auth';

const TARGET_LABEL = {
  nome: 'Nome', sobrenome: 'Sobrenome', email: 'E-mail', whatsapp: 'WhatsApp', cpf: 'CPF', empresa: 'Empresa',
  cargo: 'Cargo', cidade: 'Cidade', categoria: 'Categoria', consentimento: 'Autoriza compartilhar dados', observacoes: 'Observações (ex.: cota)',
};
const iso = (s) => (s ? fmtDate(new Date(s).toLocaleString('sv-SE')) : '—');

export default function Mautic() {
  const { meta } = useAuth();
  const [c, setC] = useState(null);
  const [form, setForm] = useState({});
  const [forms, setForms] = useState([]);
  const [test, setTest] = useState(null);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState('');

  const load = () => api('/integrations/mautic').then((d) => { setC(d); setForm({ url: d.url, user: d.user, pass: '', forms: d.forms || [], pollEnabled: d.pollEnabled, pollSeconds: d.pollSeconds, mapping: d.mapping || {} }); });
  useEffect(() => { load(); const t = setInterval(() => api('/integrations/mautic').then(setC), 15000); return () => clearInterval(t); }, []);
  if (!c) return <div className="text-slate-400">Carregando…</div>;

  const run = async (key, fn, ok) => {
    setBusy(key); setMsg(null);
    try { const r = await fn(); if (ok) setMsg({ tone: 'ok', text: typeof ok === 'function' ? ok(r) : ok }); return r; }
    catch (e) { setMsg({ tone: 'err', text: e.message }); } finally { setBusy(''); }
  };
  const save = () => run('save', async () => { const d = await api('/integrations/mautic', { method: 'PUT', body: form }); setC(d); setForm((f) => ({ ...f, pass: '' })); }, 'Configuração salva.');
  const findForms = () => run('forms', async () => { await api('/integrations/mautic', { method: 'PUT', body: form }); setForms(await api('/integrations/mautic/forms')); }, (r) => 'Conectado ao Mautic! Escolha o formulário abaixo.');
  const doTest = () => run('test', async () => { await api('/integrations/mautic', { method: 'PUT', body: form }); setTest(await api('/integrations/mautic/test')); }, 'Conexão OK. Confira a correspondência dos campos.');
  const sync = (full) => run('sync', async () => { const r = await api('/integrations/mautic/sync', { method: 'POST', body: { full } }); load(); return r; },
    (r) => r.skipped ? 'Sincronização já em andamento.' : `${r.lidos} envio(s) lido(s): ${r.inseridos} novo(s), ${r.atualizados} promovido(s)/atualizado(s), ${r.ignorados} já existiam.`);

  const base = (meta.event?.qrBaseUrl || location.origin).replace(/\/+$/, '');
  const webhook = `${base}/api/integrations/mautic/webhook/${c.webhookSecret}`;
  const st = c.status || {};
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  return (
    <div className="max-w-4xl space-y-4">
      <h1 className="text-2xl font-extrabold">Integração com o Mautic</h1>
      <p className="text-sm text-slate-600">Cada inscrição feita no formulário do site entra sozinha no credenciamento, sem precisar exportar planilha. Quem já existe (mesmo CPF, e-mail ou ID do envio) não é duplicado.</p>

      {msg && <div className={`rounded-lg p-3 text-sm ${msg.tone === 'err' ? 'bg-red-50 text-red-700' : 'bg-brand-50 text-brand-900'}`}>{msg.text}</div>}

      {/* ---------- status ---------- */}
      <div className="grid gap-3 md:grid-cols-2">
        <div className="card p-4 text-sm">
          <div className="mb-1 flex items-center gap-2 font-bold">{st.lastError ? <XCircle className="text-red-600" size={18} /> : st.lastSyncAt ? <CheckCircle2 className="text-brand-600" size={18} /> : null} Sincronização automática</div>
          <div>{c.pollEnabled ? `Ligada, a cada ${c.pollSeconds}s` : 'Desligada'} · última: {iso(st.lastSyncAt)}</div>
          {st.lastError && <div className="mt-1 text-red-700">{st.lastError}</div>}
          {st.lastResult && !st.lastError && <div className="mt-1 text-slate-500">{st.lastResult.inseridos} novo(s) na última rodada{st.lastResult.novos?.length ? `: ${st.lastResult.novos.join(', ')}` : ''}</div>}
          <div className="mt-1 text-xs text-slate-400">Último envio processado: {c.forms?.length ? c.forms.map((f) => `form #${f.id} → #${c.lastIds?.[f.id] || 0}`).join(' · ') : '—'}</div>
        </div>
        <div className="card p-4 text-sm">
          <div className="mb-1 font-bold">Webhook (tempo real)</div>
          <div>Último aviso recebido: {iso(st.lastWebhookAt)}</div>
          {st.lastWebhookResult && <div className="mt-1 text-slate-500">{st.lastWebhookResult.inseridos} novo(s){st.lastWebhookResult.novos?.length ? `: ${st.lastWebhookResult.novos.join(', ')}` : ''}</div>}
        </div>
      </div>

      {/* ---------- 1. conexão ---------- */}
      <div className="card space-y-3 p-5">
        <h2 className="font-bold">1. Conexão com a API do Mautic</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="sm:col-span-3"><label className="label">Endereço do Mautic</label><input className="input" placeholder="https://mautic.suaempresa.com.br" value={form.url} onChange={set('url')} /></div>
          <div><label className="label">Usuário</label><input className="input" autoComplete="off" value={form.user} onChange={set('user')} /></div>
          <div><label className="label">Senha</label><input className="input" type="password" autoComplete="new-password" placeholder={c.hasPass ? '•••••• (salva — digite só para trocar)' : ''} value={form.pass} onChange={set('pass')} /></div>
          <div className="flex items-end"><button className="btn-secondary w-full" onClick={findForms} disabled={!!busy}><Search size={16} /> {busy === 'forms' ? 'Conectando…' : 'Conectar e listar formulários'}</button></div>
        </div>
        <div>
          <label className="label">Formulários que alimentam o credenciamento</label>
          <p className="mb-2 text-xs text-slate-500">Marque cada formulário e escolha a categoria com que as pessoas entram (ex.: formulário de expositor → EXPOSITOR). Se um visitante também se inscrever como expositor, ele é promovido a EXPOSITOR.</p>
          {(() => {
            const chosen = form.forms || [];
            const all = forms.length ? forms : chosen.map((f) => ({ id: f.id, name: f.name || `Formulário #${f.id}` }));
            const sorted = [...all].sort((a, b) => (/siran/i.test(b.name) - /siran/i.test(a.name)) || b.id - a.id);
            if (!sorted.length) return <p className="text-sm text-slate-400">Clique em "Conectar e listar formulários".</p>;
            return (
              <ul className="max-h-72 divide-y divide-slate-100 overflow-y-auto rounded-lg ring-1 ring-slate-200">
                {sorted.map((f) => {
                  const sel = chosen.find((x) => Number(x.id) === Number(f.id));
                  const toggle = () => setForm({ ...form, forms: sel ? chosen.filter((x) => Number(x.id) !== Number(f.id)) : [...chosen, { id: f.id, name: f.name, categoria: /exposit/i.test(f.name) ? 'EXPOSITOR' : 'VISITANTE' }] });
                  return (
                    <li key={f.id} className={`flex flex-wrap items-center gap-3 px-3 py-2 text-sm ${sel ? 'bg-brand-50' : ''}`}>
                      <label className="flex flex-1 items-center gap-2"><input type="checkbox" className="h-4 w-4 accent-brand-700" checked={!!sel} onChange={toggle} /> <span className="text-slate-400">#{f.id}</span> {f.name}</label>
                      {sel && (
                        <select className="input w-auto py-1" value={sel.categoria} onChange={(e) => setForm({ ...form, forms: chosen.map((x) => (Number(x.id) === Number(f.id) ? { ...x, categoria: e.target.value } : x)) })}>
                          {meta.categorias.map((c2) => <option key={c2}>{c2}</option>)}
                        </select>
                      )}
                    </li>
                  );
                })}
              </ul>
            );
          })()}
        </div>
      </div>

      {/* ---------- 2. campos ---------- */}
      <div className="card space-y-3 p-5">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="mr-auto font-bold">2. Correspondência dos campos</h2>
          <button className="btn-secondary" onClick={doTest} disabled={!!busy || !form.forms?.length}><RefreshCw size={16} /> {busy === 'test' ? 'Testando…' : 'Testar e ler campos'}</button>
        </div>
        {!test ? <p className="text-sm text-slate-500">Clique em "Testar" para ver os campos do formulário. A correspondência é detectada sozinha; ajuste só se algo estiver errado.</p> : (
          <>
            <p className="text-sm text-slate-600">Campos encontrados nos formulários: <code className="text-xs">{test.aliases.join(', ')}</code>. O que você escolher abaixo vale para os formulários que tiverem aquele campo; nos demais, a detecção é automática.</p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {Object.keys(TARGET_LABEL).map((t) => (
                <div key={t}>
                  <label className="label">{TARGET_LABEL[t]}</label>
                  <select className="input" value={form.mapping[t] ?? test.guessed[t] ?? ''} onChange={(e) => setForm({ ...form, mapping: { ...form.mapping, [t]: e.target.value } })}>
                    <option value="">— não usar —</option>
                    {test.aliases.map((a) => <option key={a}>{a}</option>)}
                  </select>
                </div>
              ))}
            </div>
            {test.forms.map((f) => (
              <div key={f.id} className="overflow-x-auto rounded-lg bg-slate-50 p-3">
                <div className="mb-1 text-sm font-semibold">#{f.id} {f.name} <span className="font-normal text-slate-500">· {f.total} envio(s) · entram como <b>{f.categoria}</b></span></div>
                {!f.mapping.cpf && f.total > 0 && <div className="mb-1 text-xs text-amber-700">⚠ Este formulário não tem campo de CPF — essas pessoas não conseguirão entrar no app até o CPF ser preenchido (no balcão ou na edição).</div>}
                {f.sample.length === 0 ? <div className="text-xs text-slate-400">Nenhum envio ainda.</div> : (
                  <table className="w-full text-xs"><thead className="text-left text-slate-500"><tr>{['nome', 'sobrenome', 'email', 'cpf', 'empresa', 'consentimento', 'observacoes'].map((k) => <th key={k} className="px-1">{TARGET_LABEL[k]}</th>)}</tr></thead>
                    <tbody>{f.sample.map((r, i) => <tr key={i} className="border-t border-slate-200">{['nome', 'sobrenome', 'email', 'cpf', 'empresa', 'consentimento', 'observacoes'].map((k) => <td key={k} className="max-w-40 truncate px-1 py-1">{r[k]}</td>)}</tr>)}</tbody></table>
                )}
              </div>
            ))}
          </>
        )}
      </div>

      {/* ---------- 3. automático ---------- */}
      <div className="card space-y-3 p-5">
        <h2 className="font-bold">3. Atualização automática</h2>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-brand-700" checked={!!form.pollEnabled} onChange={set('pollEnabled')} /> Buscar novas inscrições no Mautic a cada
          <input type="number" min="20" className="input w-20 py-1" value={form.pollSeconds} onChange={set('pollSeconds')} /> segundos</label>
        <div className="flex flex-wrap gap-2">
          <button className="btn-primary" onClick={save} disabled={!!busy}><Save size={16} /> Salvar configuração</button>
          <button className="btn-secondary" onClick={() => sync(false)} disabled={!!busy || !c.forms?.length}><RefreshCw size={16} /> {busy === 'sync' ? 'Sincronizando…' : 'Sincronizar agora'}</button>
          <button className="btn-ghost text-xs" onClick={() => confirm('Reler TODOS os envios do formulário? Quem já existe continua sem duplicar.') && sync(true)} disabled={!!busy || !c.forms?.length}>Reler tudo desde o início</button>
        </div>
      </div>

      {/* ---------- 4. webhook ---------- */}
      <div className="card space-y-3 p-5">
        <h2 className="font-bold">4. Webhook — opcional, para entrar na hora (requer o sistema publicado em https)</h2>
        <div className="flex gap-2">
          <input className="input font-mono text-xs" readOnly value={webhook} onFocus={(e) => e.target.select()} />
          <button className="btn-secondary" onClick={() => navigator.clipboard?.writeText(webhook).then(() => setMsg({ tone: 'ok', text: 'URL copiada.' }))}><Copy size={16} /></button>
        </div>
        <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-600">
          <li>No Mautic: <b>Configurações (engrenagem) → Webhooks → Novo</b>.</li>
          <li>Nome: "Credenciamento SIRAN". <b>URL do webhook:</b> cole a URL acima.</li>
          <li>Em <b>Eventos do webhook</b>, marque apenas <b>"Evento de envio de formulário"</b> (Form Submit Event). Publicado: Sim. Salve.</li>
          <li>Clique em <b>"Enviar solicitação de teste"</b> no Mautic e confira acima em "Último aviso recebido".</li>
        </ol>
        {location.hostname === 'localhost' && !meta.event?.qrBaseUrl && <p className="rounded bg-amber-50 p-2 text-xs text-amber-900">O sistema está rodando só neste computador (localhost), então o Mautic não consegue chamar este endereço. Use a sincronização automática (passo 3) até publicar o sistema.</p>}
        <button className="btn-ghost text-xs" onClick={() => confirm('Gerar nova URL? A antiga deixa de funcionar e você precisará atualizar no Mautic.') && api('/integrations/mautic/new-secret', { method: 'POST' }).then(setC)}>Gerar nova URL secreta</button>
      </div>
    </div>
  );
}
