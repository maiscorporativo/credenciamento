/**
 * Integração com o Mautic — duas vias que se complementam:
 *  1. Webhook (tempo real): o Mautic chama POST /api/integrations/mautic/webhook/<segredo> a cada envio de formulário.
 *  2. Sincronização pela API (a cada N segundos): busca os envios dos formulários e importa os novos.
 *     Funciona mesmo sem o sistema estar publicado na internet, e cobre webhooks perdidos.
 * Vários formulários podem ser ligados, cada um com sua categoria (ex.: Visitantes → VISITANTE, Expositor → EXPOSITOR).
 * Tudo passa por importRows(), então ninguém é duplicado (CPF, ID do envio ou e-mail).
 */
import crypto from 'node:crypto';
import { getSetting, setSetting } from './db.js';
import { importRows } from './importer.js';

const KEY = 'mautic';
export const TARGETS = ['nome', 'sobrenome', 'email', 'whatsapp', 'cpf', 'empresa', 'cargo', 'cidade', 'categoria', 'consentimento', 'observacoes'];

// Os "aliases" dos campos no Mautic são minúsculos, com _ e cortados em 25 caracteres (ex.: autorizo_o_compartilhamen)
const GUESS = {
  nome: (a) => ['nome', 'nome_completo', 'first_name', 'firstname', 'primeiro_nome', 'name', 'seu_nome'].includes(a),
  sobrenome: (a) => ['sobrenome', 'last_name', 'lastname', 'ultimo_nome'].includes(a),
  email: (a) => /e_?mail/.test(a),
  whatsapp: (a) => /whats|celular|telefone|phone|fone/.test(a),
  cpf: (a) => /cpf/.test(a),
  empresa: (a) => /empresa|company|propriedade|organiza/.test(a),
  cargo: (a) => /cargo|position|funcao/.test(a),
  cidade: (a) => /cidade|city|municipio/.test(a),
  categoria: (a) => /categoria|perfil|tipo_de_part/.test(a),
  consentimento: (a) => /autorizo|compartilh|consent|lgpd/.test(a),
  observacoes: (a) => /cota|observ|patrocin/.test(a),
};

function cfg() {
  const c = getSetting(KEY, {});
  if (!c.webhookSecret) { c.webhookSecret = process.env.MAUTIC_WEBHOOK_SECRET || crypto.randomBytes(18).toString('base64url'); setSetting(KEY, c); }
  const merged = {
    url: process.env.MAUTIC_URL || '', user: process.env.MAUTIC_USER || '', pass: process.env.MAUTIC_PASS || '',
    forms: [], pollEnabled: false, pollSeconds: 60, mapping: {}, lastIds: {}, aliases: [], status: {}, ...c,
  };
  // formulários definidos por variável de ambiente (ex.: MAUTIC_FORMS=33:VISITANTE,32:EXPOSITOR) — usados se nada foi salvo na tela
  if (!c.forms?.length && !c.formId && process.env.MAUTIC_FORMS) {
    merged.forms = process.env.MAUTIC_FORMS.split(',').map((x) => { const [id, cat] = x.split(':'); return { id: Number(id), categoria: (cat || 'VISITANTE').trim().toUpperCase() }; });
  }
  if (c.pollEnabled === undefined && /^(1|true|sim)$/i.test(process.env.MAUTIC_POLL || '')) merged.pollEnabled = true;
  // compatibilidade com a versão de um formulário só
  if (!merged.forms.length && c.formId) merged.forms = [{ id: Number(c.formId), categoria: 'VISITANTE' }];
  merged.forms = merged.forms.map((f) => ({ id: Number(f.id), name: f.name || '', categoria: f.categoria || 'VISITANTE' })).filter((f) => f.id);
  return merged;
}
function save(patch) { setSetting(KEY, { ...getSetting(KEY, {}), ...patch }); }
function status(patch) { const c = cfg(); save({ status: { ...c.status, ...patch } }); }

/** Mapeamento: o que o administrador escolheu (se o campo existir neste formulário) ou o que foi detectado sozinho */
export function effectiveMapping(aliases, overrides = {}) {
  const m = {};
  for (const t of TARGETS) {
    const o = overrides[t];
    if (o === '') continue;                                  // "não usar"
    if (o && aliases.includes(o)) { m[t] = o; continue; }
    const hit = aliases.find((a) => GUESS[t](a) && !Object.values(m).includes(a));
    if (hit) m[t] = hit;
  }
  if (m.nome && m.nome === m.sobrenome) delete m.nome;
  return m;
}

const val = (v) => (Array.isArray(v) ? v.join(', ') : v && typeof v === 'object' ? Object.values(v).join(', ') : v ?? '');

function toRow(s, overrides) {
  const r = s.results || {};
  const mapping = effectiveMapping(Object.keys(r), overrides);
  const row = { ext_id: String(s.id ?? '') };
  for (const [target, alias] of Object.entries(mapping)) row[target] = val(r[alias]);
  if (row.observacoes && mapping.observacoes) row.observacoes = `${mapping.observacoes.replace(/_/g, ' ')}: ${row.observacoes}`;
  return row;
}

/** Importa envios de UM formulário, aplicando a categoria configurada para ele */
function processSubs(submissions, form, origem) {
  const c = cfg();
  const aliases = [...new Set([...c.aliases, ...submissions.flatMap((s) => Object.keys(s.results || {}))])];
  const stats = importRows(submissions.map((s) => toRow(s, c.mapping)), { origem, categoria: form.categoria, promote: true });
  const lastIds = { ...c.lastIds, [form.id]: Math.max(Number(c.lastIds[form.id]) || 0, ...submissions.map((s) => Number(s.id) || 0)) };
  save({ aliases, lastIds });
  return stats;
}

// ---------------------------------------------------------------- API do Mautic
async function mautic(path) {
  const c = cfg();
  if (!c.url || !c.user || !c.pass) throw new Error('Preencha endereço, usuário e senha do Mautic.');
  const base = c.url.replace(/\/+$/, '').replace(/\/api$/, '');
  let res;
  try {
    res = await fetch(`${base}/api${path}`, {
      headers: { authorization: 'Basic ' + Buffer.from(`${c.user}:${c.pass}`).toString('base64'), accept: 'application/json' },
      signal: AbortSignal.timeout(20000),
    });
  } catch (e) { throw new Error(`Não foi possível conectar ao Mautic (${e.cause?.code || e.message}). Confira o endereço.`); }
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = null; }
  if (res.status === 401 || res.status === 403) {
    const m = data?.errors?.[0]?.message || '';
    if (/credenc|credential/i.test(m)) throw new Error(`Usuário ou senha incorretos (resposta do Mautic: "${m}"). Use o nome de usuário do Mautic (não o e-mail) e confira a senha.`);
    if (res.status === 403) throw new Error(`O usuário entrou, mas não tem permissão para ver formulários/resultados (resposta do Mautic: "${m}").`);
    throw new Error(`Mautic recusou o acesso (resposta: "${m}"). Verifique se "API" e "autenticação básica HTTP" estão ativadas.`);
  }
  if (res.status === 404) throw new Error('Endereço não encontrado no Mautic. Confira a URL e o ID do formulário.');
  if (!res.ok || !data) throw new Error(`Mautic respondeu ${res.status}: ${(data?.errors?.[0]?.message || text).slice(0, 200)}`);
  return data;
}
const list = (x) => (Array.isArray(x) ? x : x && typeof x === 'object' ? Object.values(x) : []);

async function fetchPage(formId, start, limit) {
  const d = await mautic(`/forms/${formId}/submissions?start=${start}&limit=${limit}&orderBy=s.id&orderByDir=DESC`);
  return { total: Number(d.total) || 0, rows: list(d.submissions) };
}

async function fetchNew(formId, lastId) {
  const LIMIT = 100;
  const fresh = [];
  for (let start = 0; ; start += LIMIT) {
    const { total, rows } = await fetchPage(formId, start, LIMIT);
    const ids = rows.map((r) => Number(r.id));
    const desc = ids.every((id, i) => i === 0 || id <= ids[i - 1]);
    fresh.push(...rows.filter((r) => Number(r.id) > lastId));
    // ordem decrescente confirmada: para ao alcançar envios já processados
    if (!rows.length || start + LIMIT >= total || (desc && ids.some((id) => id <= lastId))) break;
    if (start > 50000) break;
  }
  return fresh.sort((a, b) => a.id - b.id);
}

let running = false;
export async function syncNow({ full = false } = {}) {
  if (running) return { skipped: true };
  running = true;
  const c = cfg();
  const total = { lidos: 0, inseridos: 0, atualizados: 0, ignorados: 0, erros: [], novos: [], porFormulario: [] };
  try {
    if (!c.forms.length) throw new Error('Escolha ao menos um formulário do Mautic.');
    for (const form of c.forms) {
      const fresh = await fetchNew(form.id, full ? 0 : Number(c.lastIds[form.id]) || 0);
      const st = fresh.length ? processSubs(fresh, form, 'mautic') : { inseridos: 0, atualizados: 0, ignorados: 0, erros: [], novos: [] };
      total.lidos += fresh.length; total.inseridos += st.inseridos; total.atualizados += st.atualizados; total.ignorados += st.ignorados;
      total.erros.push(...st.erros); total.novos.push(...st.novos);
      total.porFormulario.push({ id: form.id, categoria: form.categoria, lidos: fresh.length, inseridos: st.inseridos, atualizados: st.atualizados });
    }
    status({ lastSyncAt: new Date().toISOString(), lastError: '', lastResult: { lidos: total.lidos, inseridos: total.inseridos, atualizados: total.atualizados, ignorados: total.ignorados, novos: total.novos.slice(-10) } });
    if (total.inseridos) console.log(`[mautic] ${total.inseridos} novo(s): ${total.novos.slice(0, 15).join(', ')}${total.novos.length > 15 ? '…' : ''}`);
    return total;
  } catch (e) {
    status({ lastSyncAt: new Date().toISOString(), lastError: e.message });
    throw e;
  } finally { running = false; }
}

let timer;
export function startMauticPolling() {
  clearTimeout(timer);
  const c = cfg();
  if (!c.pollEnabled) return;
  const secs = Math.max(20, Number(c.pollSeconds) || 60);
  timer = setTimeout(async () => {
    try { await syncNow(); } catch (e) { console.warn('[mautic]', e.message); }
    startMauticPolling();
  }, secs * 1000);
}

// ---------------------------------------------------------------- rotas
export function mauticRoutes(app, { ADMIN, wrap }) {
  const publicCfg = () => { const { pass, formId, lastId, ...c } = cfg(); return { ...c, hasPass: !!pass }; };

  app.get('/api/integrations/mautic', ADMIN, (req, res) => res.json(publicCfg()));

  app.put('/api/integrations/mautic', ADMIN, wrap((req, res) => {
    const b = req.body;
    const patch = {};
    for (const k of ['url', 'user', 'pollEnabled', 'pollSeconds', 'mapping', 'forms']) if (k in b) patch[k] = b[k];
    if (b.pass) patch.pass = b.pass;               // senha só muda se for digitada de novo
    save(patch);
    startMauticPolling();
    res.json(publicCfg());
  }));

  app.post('/api/integrations/mautic/new-secret', ADMIN, (req, res) => { save({ webhookSecret: crypto.randomBytes(18).toString('base64url') }); res.json(publicCfg()); });

  app.get('/api/integrations/mautic/forms', ADMIN, wrap(async (req, res) => {
    const d = await mautic('/forms?limit=200&minimal=true&orderBy=id&orderByDir=DESC');
    res.json(list(d.forms).map((f) => ({ id: f.id, name: f.name, alias: f.alias })));
  }));

  /** Testa a conexão e mostra, por formulário, os campos e como os últimos envios vão entrar */
  app.get('/api/integrations/mautic/test', ADMIN, wrap(async (req, res) => {
    const c = cfg();
    if (!c.forms.length) throw new Error('Escolha ao menos um formulário do Mautic.');
    const out = [];
    for (const f of c.forms) {
      const { total, rows } = await fetchPage(f.id, 0, 5);
      const aliases = [...new Set(rows.flatMap((s) => Object.keys(s.results || {})))];
      out.push({ ...f, total, aliases, mapping: effectiveMapping(aliases, c.mapping), sample: rows.slice(0, 3).map((s) => ({ ...toRow(s, c.mapping), categoria: f.categoria })) });
    }
    const aliases = [...new Set([...c.aliases, ...out.flatMap((f) => f.aliases)])];
    save({ aliases });
    res.json({ forms: out, aliases, guessed: effectiveMapping(aliases) });
  }));

  app.post('/api/integrations/mautic/sync', ADMIN, wrap(async (req, res) => { const r = await syncNow({ full: !!req.body.full }); res.json({ ...r, novos: r.novos?.slice(-20) }); }));

  /** Webhook do Mautic (evento "Envio de formulário"). O segredo na URL autentica a chamada. */
  app.post('/api/integrations/mautic/webhook/:secret', wrap((req, res) => {
    const c = cfg();
    const a = Buffer.from(String(req.params.secret)); const b = Buffer.from(c.webhookSecret);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return res.status(403).json({ error: 'segredo inválido' });
    const subs = list(req.body?.['mautic.form_on_submit']).map((e) => e.submission || e).filter((s) => s && s.results);
    let recebidos = 0, inseridos = 0; const novos = [];
    for (const form of c.forms) {
      const mine = subs.filter((s) => Number(s.form?.id) === form.id);
      if (!mine.length) continue;
      const st = processSubs(mine, form, 'mautic');
      recebidos += mine.length; inseridos += st.inseridos; novos.push(...st.novos);
    }
    status({ lastWebhookAt: new Date().toISOString(), lastWebhookResult: { recebidos, inseridos, novos } });
    if (inseridos) console.log(`[mautic webhook] novo(s): ${novos.join(', ')}`);
    res.json({ ok: true, recebidos, inseridos });
  }));
}
