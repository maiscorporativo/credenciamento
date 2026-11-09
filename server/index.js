import 'dotenv/config';
import express from 'express';
import crypto from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';
import { db, getSetting, setSetting, tx, ROOT, DB_PATH } from './db.js';
import {
  CATEGORIAS, ROLES, onlyDigits, clean, slug, makeLogin, makeBadgeName, makeCode, parseConsent, extractCode,
} from './util.js';
import { DEFAULT_LABEL, DEFAULT_EVENT } from './defaults.js';
import { importRows, refreshSearch, uniqueCode } from './importer.js';
import { mauticRoutes, startMauticPolling } from './mautic.js';

const PORT = Number(process.env.PORT || 3000);
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
// sem ADMIN_PASS no .env, gera uma senha aleatória a cada inicialização (mostrada no console)
const ADMIN_PASS = process.env.ADMIN_PASS || crypto.randomBytes(9).toString('base64url');

const app = express();
// guarda o corpo bruto: o webhook do Mautic é assinado (HMAC) sobre os bytes exatos recebidos
app.use(express.json({ limit: '20mb', verify: (req, _res, buf) => { req.rawBody = buf; } }));
app.use(express.urlencoded({ extended: true, limit: '5mb', verify: (req, _res, buf) => { req.rawBody = buf; } }));

// ---------------------------------------------------------------- helpers
const now = () => db.prepare("SELECT datetime('now','localtime') AS n").get().n;
const err = (res, status, msg) => res.status(status).json({ error: msg });
const wrap = (fn) => (req, res, next) => { try { const r = fn(req, res, next); if (r?.catch) r.catch(next); } catch (e) { next(e); } };

/** Dados públicos de um participante (para listagens administrativas) */
function full(p) {
  if (!p) return p;
  const area = p.area_id ? db.prepare('SELECT nome FROM areas WHERE id = ?').get(p.area_id) : null;
  return { ...p, consentimento: !!p.consentimento, area_nome: area?.nome || null };
}

/** Dados de contato vistos por outro participante — respeita o consentimento (LGPD) */
function contactView(p) {
  const base = { id: p.id, nome: p.nome, sobrenome: p.sobrenome, nome_cracha: p.nome_cracha, empresa: p.empresa, cargo: p.cargo, cidade: p.cidade, categoria: p.categoria, consentimento: !!p.consentimento };
  return p.consentimento ? { ...base, email: p.email, whatsapp: p.whatsapp } : { ...base, email: '', whatsapp: '' };
}

// ---------------------------------------------------------------- auth
const loginAttempts = new Map();

function auth(...roles) {
  return (req, res, next) => {
    const token = (req.headers.authorization || '').replace(/^Bearer /, '');
    const s = token && db.prepare('SELECT * FROM sessions WHERE token = ?').get(token);
    if (!s) return err(res, 401, 'Sessão expirada. Faça login novamente.');
    let user;
    if (s.participant_id == null) {
      user = { id: null, nome: 'Administrador', role: 'admin', master: true };
    } else {
      const p = db.prepare('SELECT * FROM participants WHERE id = ?').get(s.participant_id);
      if (!p) return err(res, 401, 'Usuário removido.');
      user = full(p);
    }
    if (roles.length && !roles.includes(user.role)) return err(res, 403, 'Sem permissão para esta função.');
    req.user = user;
    req.token = token;
    next();
  };
}
const ANY = auth();
const ADMIN = auth('admin');
const DESK = auth('admin', 'balcao');
const SCAN = auth('admin', 'scanner');

app.post('/api/login', wrap((req, res) => {
  const ip = req.ip;
  const a = loginAttempts.get(ip) || { n: 0, t: Date.now() };
  if (Date.now() - a.t > 5 * 60_000) { a.n = 0; a.t = Date.now(); }
  if (a.n >= 30) return err(res, 429, 'Muitas tentativas. Aguarde alguns minutos.');
  a.n++; loginAttempts.set(ip, a);

  const login = clean(req.body.login).toLowerCase();
  const senha = String(req.body.senha ?? '').trim();
  let pid = null, role;

  if (login === ADMIN_USER.toLowerCase() && senha === ADMIN_PASS) {
    role = 'admin';
  } else {
    const cpf = onlyDigits(senha);
    if (cpf.length < 11) return err(res, 401, 'Login ou senha inválidos. A senha é o seu CPF (somente números).');
    const loginSlug = slug(login.replace(/\./g, ' ')).split(' ').filter(Boolean).join('.');
    const p = db.prepare(`SELECT * FROM participants WHERE cpf = ? AND (login = ? OR lower(email) = ? OR cpf = ?) LIMIT 1`)
      .get(cpf, loginSlug, login, onlyDigits(login) || '-');
    if (!p) return err(res, 401, 'Login ou senha inválidos. Use nome.sobrenome e o CPF como senha.');
    pid = p.id; role = p.role;
  }
  const token = crypto.randomBytes(32).toString('hex');
  db.prepare('INSERT INTO sessions(token, participant_id, role) VALUES(?,?,?)').run(token, pid, role);
  loginAttempts.delete(ip);
  const user = pid == null ? { id: null, nome: 'Administrador', role: 'admin', master: true } : full(db.prepare('SELECT * FROM participants WHERE id = ?').get(pid));
  res.json({ token, user });
}));

app.get('/api/me', ANY, (req, res) => res.json({ user: req.user }));
app.post('/api/logout', ANY, (req, res) => { db.prepare('DELETE FROM sessions WHERE token = ?').run(req.token); res.json({ ok: true }); });

app.put('/api/me/consent', ANY, wrap((req, res) => {
  if (!req.user.id) return err(res, 400, 'Administrador mestre não possui cadastro.');
  db.prepare('UPDATE participants SET consentimento = ?, updated_at = ? WHERE id = ?').run(req.body.consentimento ? 1 : 0, now(), req.user.id);
  res.json({ ok: true });
}));

// ---------------------------------------------------------------- configurações
app.get('/api/meta', (req, res) => res.json({ categorias: CATEGORIAS, roles: ROLES, event: getSetting('event', DEFAULT_EVENT) }));
app.get('/api/settings/label', ANY, (req, res) => res.json(getSetting('label', DEFAULT_LABEL)));
app.put('/api/settings/label', ADMIN, (req, res) => { setSetting('label', req.body); res.json({ ok: true }); });
app.put('/api/settings/event', ADMIN, (req, res) => { setSetting('event', { ...DEFAULT_EVENT, ...req.body }); res.json({ ok: true }); });

// ---------------------------------------------------------------- participantes
const EDITABLE = ['nome', 'sobrenome', 'nome_cracha', 'email', 'whatsapp', 'cpf', 'empresa', 'cargo', 'cidade', 'categoria', 'consentimento', 'observacoes', 'ext_id'];
const ADMIN_ONLY = ['role', 'area_id'];

function normalizeInput(body, user) {
  const out = {};
  for (const k of EDITABLE) if (k in body) out[k] = body[k];
  if (user.role === 'admin') for (const k of ADMIN_ONLY) if (k in body) out[k] = body[k];
  for (const k of ['nome', 'sobrenome', 'nome_cracha', 'email', 'whatsapp', 'empresa', 'cargo', 'cidade', 'observacoes', 'ext_id']) if (k in out) out[k] = clean(out[k]);
  if ('email' in out) out.email = out.email.toLowerCase();
  if ('cpf' in out) out.cpf = onlyDigits(out.cpf);
  if ('categoria' in out) { out.categoria = clean(out.categoria).toUpperCase() || 'VISITANTE'; }
  if ('consentimento' in out) out.consentimento = out.consentimento ? 1 : 0;
  if ('role' in out && !ROLES.includes(out.role)) delete out.role;
  if ('area_id' in out) out.area_id = out.area_id ? Number(out.area_id) : null;
  return out;
}

function cpfTaken(cpf, exceptId) {
  if (!cpf) return null;
  return db.prepare('SELECT id, nome, sobrenome FROM participants WHERE cpf = ? AND id != ?').get(cpf, exceptId || 0);
}

app.get('/api/participants', DESK, wrap((req, res) => {
  const { q = '', categoria = '', status = '', role = '' } = req.query;
  const limit = Math.min(Number(req.query.limit) || 50, 5000);
  const offset = Number(req.query.offset) || 0;
  const where = [], args = [];
  const term = clean(q);
  if (term) {
    const digits = onlyDigits(term);
    const code = extractCode(term);
    const words = slug(term).split(' ').filter(Boolean);
    const wordsSql = words.length ? words.map(() => 'search_text LIKE ?').join(' AND ') : '0';
    where.push(`(code = ? OR lower(email) LIKE ? OR (? != '' AND (cpf LIKE ? OR replace(replace(replace(replace(replace(whatsapp,' ',''),'-',''),'(',''),')',''),'+','') LIKE ?))
      OR login LIKE ? OR ext_id = ? OR (${wordsSql}))`);
    args.push(code, `%${term.toLowerCase()}%`, digits, `%${digits}%`, `%${digits}%`, `%${slug(term).replace(/ /g, '.')}%`, term, ...words.map((w) => `%${w}%`));
  }
  if (categoria) { where.push('categoria = ?'); args.push(categoria); }
  if (role) { where.push(role === 'equipe' ? "role != 'participante'" : 'role = ?'); if (role !== 'equipe') args.push(role); }
  if (status === 'credenciado') where.push('checkin_at IS NOT NULL');
  if (status === 'pendente') where.push('checkin_at IS NULL');
  if (status === 'impresso') where.push('print_count > 0');
  if (status === 'nao_impresso') where.push('print_count = 0');
  const w = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const base = `FROM participants ${w}`;
  const total = db.prepare(`SELECT count(*) AS n ${base}`).get(...args).n;
  const rows = db.prepare(`SELECT * ${base} ORDER BY (code = ?) DESC, nome COLLATE NOCASE, sobrenome COLLATE NOCASE LIMIT ? OFFSET ?`)
    .all(...args, extractCode(term), limit, offset);
  res.json({ total, rows: rows.map(({ search_text, ...p }) => full(p)) });
}));

app.post('/api/participants/by-ids', DESK, wrap((req, res) => {
  const ids = (req.body.ids || []).map(Number).filter(Boolean);
  const stmt = db.prepare('SELECT * FROM participants WHERE id = ?');
  const rows = ids.map((id) => stmt.get(id)).filter(Boolean)
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  res.json(rows.map(({ search_text, ...p }) => full(p)));
}));

app.get('/api/participants/:id', DESK, wrap((req, res) => {
  const p = db.prepare('SELECT * FROM participants WHERE id = ?').get(req.params.id);
  if (!p) return err(res, 404, 'Participante não encontrado.');
  const scans = db.prepare(`SELECT s.*, a.nome AS area_nome FROM scans s LEFT JOIN areas a ON a.id = s.area_id WHERE participant_id = ? ORDER BY scanned_at DESC LIMIT 200`).all(p.id);
  const prints = db.prepare('SELECT * FROM prints WHERE participant_id = ? ORDER BY printed_at DESC').all(p.id);
  const contatos = db.prepare('SELECT count(*) AS n FROM contacts WHERE owner_id = ?').get(p.id).n;
  const { search_text, ...rest } = p;
  res.json({ ...full(rest), scans, prints, contatos });
}));

app.post('/api/participants', DESK, wrap((req, res) => {
  const d = normalizeInput(req.body, req.user);
  if (!d.nome) return err(res, 400, 'Informe o nome.');
  const dup = cpfTaken(d.cpf);
  if (dup) return err(res, 409, `CPF já cadastrado para ${dup.nome} ${dup.sobrenome} (#${dup.id}).`);
  d.nome_cracha ||= makeBadgeName(d.nome, d.sobrenome || '');
  d.login = makeLogin(d.nome, d.sobrenome || '');
  d.code = uniqueCode();
  d.origem = req.user.role === 'balcao' ? 'balcao' : (req.body.origem || 'manual');
  const keys = Object.keys(d);
  const r = db.prepare(`INSERT INTO participants(${keys.join(',')}) VALUES(${keys.map(() => '?').join(',')})`).run(...keys.map((k) => d[k]));
  refreshSearch(r.lastInsertRowid);
  res.json(full(db.prepare('SELECT * FROM participants WHERE id = ?').get(r.lastInsertRowid)));
}));

app.put('/api/participants/:id', DESK, wrap((req, res) => {
  const id = Number(req.params.id);
  const cur = db.prepare('SELECT * FROM participants WHERE id = ?').get(id);
  if (!cur) return err(res, 404, 'Participante não encontrado.');
  const d = normalizeInput(req.body, req.user);
  if (d.cpf) { const dup = cpfTaken(d.cpf, id); if (dup) return err(res, 409, `CPF já cadastrado para ${dup.nome} ${dup.sobrenome} (#${dup.id}).`); }
  if ('nome' in d || 'sobrenome' in d) d.login = makeLogin(d.nome ?? cur.nome, d.sobrenome ?? cur.sobrenome);
  const keys = Object.keys(d);
  if (keys.length) {
    db.prepare(`UPDATE participants SET ${keys.map((k) => `${k} = ?`).join(', ')}, updated_at = ? WHERE id = ?`).run(...keys.map((k) => d[k]), now(), id);
    refreshSearch(id);
  }
  res.json(full(db.prepare('SELECT * FROM participants WHERE id = ?').get(id)));
}));

app.delete('/api/participants/:id', ADMIN, wrap((req, res) => {
  db.prepare('DELETE FROM sessions WHERE participant_id = ?').run(req.params.id);
  db.prepare('DELETE FROM participants WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
}));

/** Registra impressão (e credencia, se ainda não estiver) — aceita vários ids para impressão em lote */
app.post('/api/print', DESK, wrap((req, res) => {
  const ids = (req.body.ids || []).map(Number).filter(Boolean);
  const t = now();
  const operador = req.user.master ? 'admin' : `${req.user.nome} ${req.user.sobrenome}`;
  tx(() => {
    for (const id of ids) {
      db.prepare('UPDATE participants SET print_count = print_count + 1, last_print_at = ?, checkin_at = COALESCE(checkin_at, ?) WHERE id = ?').run(t, req.body.checkin === false ? null : t, id);
      db.prepare('INSERT INTO prints(participant_id, operador, printed_at) VALUES(?,?,?)').run(id, operador, t);
    }
  });
  res.json({ ok: true, at: t });
}));

app.post('/api/participants/:id/checkin', DESK, wrap((req, res) => {
  const value = req.body.undo ? null : now();
  db.prepare('UPDATE participants SET checkin_at = ? WHERE id = ?').run(value, req.params.id);
  res.json({ ok: true, checkin_at: value });
}));

app.post('/api/participants/bulk', ADMIN, wrap((req, res) => {
  const ids = (req.body.ids || []).map(Number);
  const { action, value } = req.body;
  tx(() => {
    for (const id of ids) {
      if (action === 'categoria') db.prepare('UPDATE participants SET categoria = ?, updated_at = ? WHERE id = ?').run(String(value).toUpperCase(), now(), id);
      if (action === 'delete') db.prepare('DELETE FROM participants WHERE id = ?').run(id);
      if (action === 'role' && ROLES.includes(value)) db.prepare('UPDATE participants SET role = ? WHERE id = ?').run(value, id);
      if (action === 'categoria') refreshSearch(id);
    }
  });
  res.json({ ok: true, n: ids.length });
}));

/** Importação: recebe as linhas já mapeadas pelo navegador */
app.post('/api/import', ADMIN, wrap((req, res) => {
  const rows = Array.isArray(req.body.rows) ? req.body.rows : [];
  const { novos, ...stats } = importRows(rows, { update: req.body.mode === 'update' });
  res.json(stats);
}));

app.get('/api/export/participants', ADMIN, wrap((req, res) => {
  const rows = db.prepare(`SELECT p.id, p.ext_id, p.code, p.nome, p.sobrenome, p.nome_cracha, p.email, p.whatsapp, p.cpf, p.empresa, p.cargo, p.cidade,
    p.categoria, p.consentimento, p.login, p.role, a.nome AS area, p.origem, p.checkin_at, p.print_count, p.last_print_at, p.created_at,
    (SELECT count(*) FROM scans s WHERE s.participant_id = p.id) AS leituras,
    (SELECT count(*) FROM contacts c WHERE c.owner_id = p.id) AS contatos_salvos
    FROM participants p LEFT JOIN areas a ON a.id = p.area_id ORDER BY p.nome`).all();
  res.json(rows);
}));

// ---------------------------------------------------------------- áreas
app.get('/api/areas', ANY, (req, res) => res.json(db.prepare(`SELECT a.*,
  (SELECT count(*) FROM participants p WHERE p.area_id = a.id) AS operadores FROM areas a ORDER BY a.nome`).all()));
app.post('/api/areas', ADMIN, wrap((req, res) => {
  const nome = clean(req.body.nome);
  if (!nome) return err(res, 400, 'Informe o nome do espaço.');
  try { const r = db.prepare('INSERT INTO areas(nome) VALUES(?)').run(nome); res.json({ id: r.lastInsertRowid, nome }); }
  catch { err(res, 409, 'Já existe um espaço com esse nome.'); }
}));
app.put('/api/areas/:id', ADMIN, wrap((req, res) => {
  db.prepare('UPDATE areas SET nome = COALESCE(?, nome), ativo = COALESCE(?, ativo) WHERE id = ?')
    .run(req.body.nome ? clean(req.body.nome) : null, req.body.ativo == null ? null : (req.body.ativo ? 1 : 0), req.params.id);
  res.json({ ok: true });
}));
app.delete('/api/areas/:id', ADMIN, wrap((req, res) => { db.prepare('DELETE FROM areas WHERE id = ?').run(req.params.id); res.json({ ok: true }); }));

// ---------------------------------------------------------------- controle de acesso (bipagem)
app.post('/api/scans', SCAN, wrap((req, res) => {
  const code = extractCode(req.body.code);
  const p = db.prepare('SELECT * FROM participants WHERE code = ?').get(code);
  if (!p) return err(res, 404, `Crachá não reconhecido (${code}).`);
  const areaId = req.user.role === 'scanner' ? req.user.area_id : Number(req.body.area_id) || null;
  if (!areaId) return err(res, 400, 'Este operador não está vinculado a nenhum espaço. Peça ao administrador.');
  const area = db.prepare('SELECT * FROM areas WHERE id = ?').get(areaId);
  if (!area?.ativo) return err(res, 400, 'Espaço inativo.');

  if (req.body.client_uuid) {
    const done = db.prepare('SELECT * FROM scans WHERE client_uuid = ?').get(req.body.client_uuid);
    if (done) return res.json({ ok: true, duplicate: true, direcao: done.direcao, participant: contactViewAdmin(p), area: area.nome });
  }
  const last = db.prepare('SELECT * FROM scans WHERE participant_id = ? AND area_id = ? ORDER BY scanned_at DESC, id DESC LIMIT 1').get(p.id, areaId);
  let direcao = req.body.direcao;
  if (!['entrada', 'saida'].includes(direcao)) direcao = last?.direcao === 'entrada' ? 'saida' : 'entrada';

  // leitura repetida em menos de 8 s no mesmo espaço = mesma passagem
  const offline = !!req.body.scanned_at;
  if (!offline && last && last.direcao === direcao) {
    const secs = db.prepare("SELECT (julianday('now','localtime') - julianday(?)) * 86400 AS s").get(last.scanned_at).s;
    if (secs < 8) return res.json({ ok: true, duplicate: true, direcao, participant: contactViewAdmin(p), area: area.nome });
  }
  const at = offline ? String(req.body.scanned_at).slice(0, 19).replace('T', ' ') : now();
  db.prepare('INSERT INTO scans(participant_id, area_id, scanner_id, direcao, client_uuid, scanned_at) VALUES(?,?,?,?,?,?)')
    .run(p.id, areaId, req.user.id, direcao, req.body.client_uuid || null, at);
  res.json({ ok: true, direcao, participant: contactViewAdmin(p), area: area.nome, at, credenciado: !!p.checkin_at });
}));
const contactViewAdmin = (p) => ({ id: p.id, nome: p.nome, sobrenome: p.sobrenome, nome_cracha: p.nome_cracha, empresa: p.empresa, categoria: p.categoria });

app.get('/api/scans/recent', SCAN, wrap((req, res) => {
  const areaId = req.user.role === 'scanner' ? req.user.area_id : Number(req.query.area_id);
  const rows = db.prepare(`SELECT s.id, s.direcao, s.scanned_at, p.nome_cracha, p.nome, p.sobrenome, p.empresa, p.categoria
    FROM scans s JOIN participants p ON p.id = s.participant_id WHERE s.area_id = ? ORDER BY s.scanned_at DESC, s.id DESC LIMIT 30`).all(areaId);
  const stats = areaStats(areaId);
  res.json({ rows, stats });
}));

app.delete('/api/scans/:id', SCAN, wrap((req, res) => {
  const where = req.user.role === 'scanner' ? 'AND scanner_id = ?' : '';
  db.prepare(`DELETE FROM scans WHERE id = ? ${where}`).run(...[req.params.id, ...(where ? [req.user.id] : [])]);
  res.json({ ok: true });
}));

function areaStats(areaId) {
  return db.prepare(`
    WITH ranked AS (SELECT participant_id, direcao, row_number() OVER (PARTITION BY participant_id ORDER BY scanned_at DESC, id DESC) AS rn
                    FROM scans WHERE area_id = ?),
         last AS (SELECT * FROM ranked WHERE rn = 1)
    SELECT
      (SELECT count(*) FROM scans WHERE area_id = ?) AS leituras,
      (SELECT count(*) FROM scans WHERE area_id = ? AND direcao = 'entrada') AS entradas,
      (SELECT count(*) FROM scans WHERE area_id = ? AND direcao = 'saida') AS saidas,
      (SELECT count(*) FROM last) AS pessoas,
      (SELECT count(*) FROM last WHERE direcao = 'entrada') AS presentes`).get(areaId, areaId, areaId, areaId);
}

// ---------------------------------------------------------------- networking (contatos)
app.get('/api/badge', ANY, wrap((req, res) => {
  if (!req.user.id) return err(res, 400, 'Administrador mestre não possui crachá.');
  res.json(req.user);
}));

app.post('/api/contacts', ANY, wrap((req, res) => {
  if (!req.user.id) return err(res, 400, 'Entre com um login de participante para salvar contatos.');
  const code = extractCode(req.body.code);
  const p = db.prepare('SELECT * FROM participants WHERE code = ?').get(code);
  if (!p) return err(res, 404, 'Crachá não reconhecido.');
  if (p.id === req.user.id) return err(res, 400, 'Esse é o seu próprio crachá 🙂');
  const existed = db.prepare('SELECT id FROM contacts WHERE owner_id = ? AND contact_id = ?').get(req.user.id, p.id);
  if (!existed) db.prepare('INSERT INTO contacts(owner_id, contact_id, nota) VALUES(?,?,?)').run(req.user.id, p.id, clean(req.body.nota));
  res.json({ ok: true, novo: !existed, contato: contactView(p) });
}));

app.get('/api/contacts', ANY, wrap((req, res) => {
  const rows = db.prepare(`SELECT c.id AS contact_row, c.nota, c.created_at AS salvo_em, p.* FROM contacts c
    JOIN participants p ON p.id = c.contact_id WHERE c.owner_id = ? ORDER BY c.created_at DESC`).all(req.user.id ?? -1);
  res.json(rows.map((r) => ({ ...contactView(r), contact_row: r.contact_row, nota: r.nota, salvo_em: r.salvo_em })));
}));
app.put('/api/contacts/:row', ANY, wrap((req, res) => {
  db.prepare('UPDATE contacts SET nota = ? WHERE id = ? AND owner_id = ?').run(String(req.body.nota ?? ''), req.params.row, req.user.id ?? -1);
  res.json({ ok: true });
}));
app.delete('/api/contacts/:row', ANY, wrap((req, res) => {
  db.prepare('DELETE FROM contacts WHERE id = ? AND owner_id = ?').run(req.params.row, req.user.id ?? -1);
  res.json({ ok: true });
}));

// ---------------------------------------------------------------- relatórios
app.get('/api/reports/summary', ADMIN, wrap((req, res) => {
  const one = (sql, ...a) => db.prepare(sql).get(...a);
  res.json({
    dbPath: DB_PATH,
    inscritos: one('SELECT count(*) n FROM participants').n,
    credenciados: one('SELECT count(*) n FROM participants WHERE checkin_at IS NOT NULL').n,
    impressoes: one('SELECT count(*) n FROM prints').n,
    reimpressoes: one('SELECT coalesce(sum(print_count - 1), 0) n FROM participants WHERE print_count > 1').n,
    balcao: one("SELECT count(*) n FROM participants WHERE origem = 'balcao'").n,
    leituras: one('SELECT count(*) n FROM scans').n,
    contatos: one('SELECT count(*) n FROM contacts').n,
    porCategoria: db.prepare(`SELECT categoria, count(*) AS total, sum(checkin_at IS NOT NULL) AS credenciados FROM participants GROUP BY categoria ORDER BY total DESC`).all(),
    porHora: db.prepare(`SELECT substr(checkin_at, 1, 13) AS hora, count(*) AS n FROM participants WHERE checkin_at IS NOT NULL GROUP BY hora ORDER BY hora`).all(),
    areas: db.prepare('SELECT id, nome FROM areas ORDER BY nome').all().map((a) => ({ ...a, ...areaStats(a.id) })),
  });
}));

app.get('/api/reports/areas/:id', ADMIN, wrap((req, res) => {
  const id = Number(req.params.id);
  const area = db.prepare('SELECT * FROM areas WHERE id = ?').get(id);
  if (!area) return err(res, 404, 'Espaço não encontrado.');
  const pessoas = db.prepare(`SELECT p.id, p.nome, p.sobrenome, p.empresa, p.categoria, p.email, p.whatsapp,
      min(s.scanned_at) AS primeira, max(s.scanned_at) AS ultima, count(*) AS leituras,
      sum(s.direcao = 'entrada') AS entradas, sum(s.direcao = 'saida') AS saidas,
      (SELECT direcao FROM scans x WHERE x.participant_id = p.id AND x.area_id = ? ORDER BY scanned_at DESC, id DESC LIMIT 1) AS status
    FROM scans s JOIN participants p ON p.id = s.participant_id WHERE s.area_id = ? GROUP BY p.id ORDER BY primeira`).all(id, id);
  const porHora = db.prepare(`SELECT substr(scanned_at, 1, 13) AS hora, sum(direcao='entrada') AS entradas, sum(direcao='saida') AS saidas
    FROM scans WHERE area_id = ? GROUP BY hora ORDER BY hora`).all(id);
  const leituras = db.prepare(`SELECT s.id, s.scanned_at, s.direcao, p.nome, p.sobrenome, p.empresa, p.categoria, o.nome || ' ' || o.sobrenome AS operador
    FROM scans s JOIN participants p ON p.id = s.participant_id LEFT JOIN participants o ON o.id = s.scanner_id
    WHERE s.area_id = ? ORDER BY s.scanned_at DESC, s.id DESC`).all(id);
  res.json({ area, stats: areaStats(id), pessoas: pessoas.map((p) => ({ ...p, minutos: minutesIn(p.id, id) })), porHora, leituras });
}));

/** Tempo de permanência: soma dos intervalos entrada → saída */
function minutesIn(pid, areaId) {
  const rows = db.prepare('SELECT direcao, scanned_at FROM scans WHERE participant_id = ? AND area_id = ? ORDER BY scanned_at, id').all(pid, areaId);
  let total = 0, open = null;
  for (const r of rows) {
    const t = new Date(r.scanned_at.replace(' ', 'T')).getTime();
    if (r.direcao === 'entrada') { if (open == null) open = t; }
    else if (open != null) { total += t - open; open = null; }
  }
  return Math.round(total / 60000);
}

app.get('/api/reports/participant/:id', ADMIN, wrap((req, res) => {
  const p = db.prepare('SELECT * FROM participants WHERE id = ?').get(req.params.id);
  if (!p) return err(res, 404, 'Participante não encontrado.');
  const scans = db.prepare(`SELECT s.scanned_at, s.direcao, a.nome AS area FROM scans s LEFT JOIN areas a ON a.id = s.area_id
    WHERE participant_id = ? ORDER BY scanned_at, s.id`).all(p.id);
  const areas = db.prepare(`SELECT a.id, a.nome, count(*) AS leituras FROM scans s JOIN areas a ON a.id = s.area_id WHERE participant_id = ? GROUP BY a.id`).all(p.id)
    .map((a) => ({ ...a, minutos: minutesIn(p.id, a.id) }));
  const contatos = db.prepare(`SELECT c.created_at, c.nota, x.nome, x.sobrenome, x.empresa, x.categoria FROM contacts c JOIN participants x ON x.id = c.contact_id WHERE owner_id = ? ORDER BY c.created_at`).all(p.id);
  const escaneadoPor = db.prepare(`SELECT c.created_at, x.nome, x.sobrenome, x.empresa, x.categoria FROM contacts c JOIN participants x ON x.id = c.owner_id WHERE contact_id = ? ORDER BY c.created_at`).all(p.id);
  const { search_text, ...rest } = p;
  res.json({ participant: full(rest), scans, areas, contatos, escaneadoPor });
}));

app.get('/api/reports/networking', ADMIN, wrap((req, res) => {
  res.json({
    ranking: db.prepare(`SELECT p.id, p.nome, p.sobrenome, p.empresa, p.categoria, count(*) AS contatos FROM contacts c JOIN participants p ON p.id = c.owner_id
      GROUP BY p.id ORDER BY contatos DESC LIMIT 100`).all(),
    todos: db.prepare(`SELECT c.created_at, o.nome || ' ' || o.sobrenome AS quem, o.empresa AS quem_empresa, o.categoria AS quem_categoria,
      x.nome || ' ' || x.sobrenome AS contato, x.empresa AS contato_empresa, x.categoria AS contato_categoria,
      CASE WHEN x.consentimento THEN x.email ELSE '' END AS contato_email, CASE WHEN x.consentimento THEN x.whatsapp ELSE '' END AS contato_whatsapp, c.nota
      FROM contacts c JOIN participants o ON o.id = c.owner_id JOIN participants x ON x.id = c.contact_id ORDER BY c.created_at DESC`).all(),
  });
}));

// ---------------------------------------------------------------- integração Mautic
mauticRoutes(app, { ADMIN, wrap });

// ---------------------------------------------------------------- front-end compilado
const dist = path.join(ROOT, 'dist');
if (fs.existsSync(dist)) {
  // arquivos de /assets têm nome com hash: podem ficar em cache. O index.html nunca, para cada atualização aparecer na hora.
  const noCache = (res) => res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
  app.use(express.static(dist, {
    index: false,
    setHeaders: (res, file) => { if (file.includes(`${path.sep}assets${path.sep}`)) res.set('Cache-Control', 'public, max-age=31536000, immutable'); else noCache(res); },
  }));
  app.get(/^(?!\/api).*/, (req, res) => { noCache(res); res.sendFile(path.join(dist, 'index.html')); });
}

app.use((e, req, res, _next) => { console.error(e); err(res, 500, e.message || 'Erro interno'); });

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Credenciamento rodando em http://localhost:${PORT}`);
  console.log(`Banco de dados: ${DB_PATH}`);
  startMauticPolling();
  console.log(`Admin mestre: ${ADMIN_USER} / ${process.env.ADMIN_PASS ? '(definida no .env)' : ADMIN_PASS + '  <- temporária! defina ADMIN_PASS no .env'}`);
});
