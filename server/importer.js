import { db, tx } from './db.js';
import { clean, onlyDigits, slug, makeLogin, makeBadgeName, makeCode, parseConsent } from './util.js';

const now = () => db.prepare("SELECT datetime('now','localtime') AS n").get().n;

export function uniqueCode() {
  const exists = db.prepare('SELECT 1 FROM participants WHERE code = ?');
  for (;;) { const c = makeCode(); if (!exists.get(c)) return c; }
}

/** texto pesquisável sem acentos (SQLite não remove acentos, então guardamos uma coluna derivada) */
export function refreshSearch(id) {
  const p = db.prepare('SELECT * FROM participants WHERE id = ?').get(id);
  if (!p) return;
  const s = slug([p.nome, p.sobrenome, p.nome_cracha, p.empresa, p.cargo, p.cidade, p.categoria].join(' '));
  db.prepare('UPDATE participants SET search_text = ? WHERE id = ?').run(s, id);
}

/**
 * Insere/atualiza inscritos. Quem já existe (mesmo CPF, ID de inscrição ou e-mail) não é duplicado.
 * Usado pela importação de planilha e pela integração com o Mautic.
 */
export function importRows(rows, { update = false, origem = 'importacao', categoria = '', promote = false } = {}) {
  const stats = { inseridos: 0, atualizados: 0, ignorados: 0, erros: [], novos: [] };
  const findBy = {
    cpf: db.prepare("SELECT * FROM participants WHERE cpf = ? AND cpf != ''"),
    ext: db.prepare("SELECT * FROM participants WHERE ext_id = ? AND ext_id != ''"),
    email: db.prepare("SELECT * FROM participants WHERE lower(email) = ? AND email != ''"),
  };
  tx(() => {
    rows.forEach((raw, i) => {
      const d = {
        ext_id: clean(raw.ext_id), nome: clean(raw.nome), sobrenome: clean(raw.sobrenome),
        email: clean(raw.email).toLowerCase(), whatsapp: clean(raw.whatsapp), cpf: onlyDigits(raw.cpf),
        empresa: clean(raw.empresa), cargo: clean(raw.cargo), cidade: clean(raw.cidade),
        consentimento: parseConsent(raw.consentimento),
      };
      if (raw.observacoes) d.observacoes = clean(raw.observacoes);
      if (raw.categoria || categoria) d.categoria = clean(raw.categoria || categoria).toUpperCase();
      if (!d.nome && !d.sobrenome) { stats.ignorados++; return; }
      if (!d.nome) { d.nome = d.sobrenome; d.sobrenome = ''; }
      // mesmo ID ou e-mail, mas CPF diferente = outra pessoa (ex.: mãe e filha com o mesmo e-mail)
      const samePerson = (p) => p && !(d.cpf && p.cpf && p.cpf !== d.cpf) ? p : null;
      const existing = (d.cpf && findBy.cpf.get(d.cpf)) || (d.ext_id && samePerson(findBy.ext.get(d.ext_id))) || (d.email && samePerson(findBy.email.get(d.email)));
      if (existing) {
        // visitante que também se inscreveu como expositor (ou outra categoria): promove, sem mexer no resto
        if (promote && d.categoria && d.categoria !== 'VISITANTE' && existing.categoria === 'VISITANTE') {
          db.prepare('UPDATE participants SET categoria = ?, observacoes = CASE WHEN ? != \'\' AND observacoes = \'\' THEN ? ELSE observacoes END, updated_at = ? WHERE id = ?')
            .run(d.categoria, d.observacoes || '', d.observacoes || '', now(), existing.id);
          refreshSearch(existing.id);
          stats.atualizados++;
          return;
        }
        if (!update) { stats.ignorados++; return; }
        const keys = Object.keys(d).filter((k) => d[k] !== '' && k !== 'categoria');
        db.prepare(`UPDATE participants SET ${keys.map((k) => `${k} = ?`).join(', ')}, login = ?, updated_at = ? WHERE id = ?`)
          .run(...keys.map((k) => d[k]), makeLogin(d.nome, d.sobrenome), now(), existing.id);
        refreshSearch(existing.id);
        stats.atualizados++;
        return;
      }
      try {
        d.nome_cracha = makeBadgeName(d.nome, d.sobrenome);
        d.login = makeLogin(d.nome, d.sobrenome);
        d.code = uniqueCode();
        d.origem = origem;
        const keys = Object.keys(d);
        const r = db.prepare(`INSERT INTO participants(${keys.join(',')}) VALUES(${keys.map(() => '?').join(',')})`).run(...keys.map((k) => d[k]));
        refreshSearch(r.lastInsertRowid);
        stats.inseridos++;
        stats.novos.push(`${d.nome} ${d.sobrenome}`.trim());
      } catch (e) { stats.erros.push(`Linha ${i + 2}: ${e.message}`); }
    });
  });
  return stats;
}
