import crypto from 'node:crypto';

export const CATEGORIAS = ['VISITANTE', 'EXPOSITOR', 'STAFF', 'PALESTRANTE', 'IMPRENSA', 'ORGANIZAÇÃO', 'VIP'];
export const ROLES = ['participante', 'scanner', 'balcao', 'admin'];

export const onlyDigits = (s) => String(s ?? '').replace(/\D/g, '');
export const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
export const slug = (s) => clean(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9 ]/g, '');

/** login = primeiro nome + último sobrenome, ex.: "Cássia Regina" "Souza Preto" -> cassia.preto */
export function makeLogin(nome, sobrenome) {
  const n = slug(nome).split(' ').filter(Boolean);
  const s = slug(sobrenome).split(' ').filter(Boolean);
  const first = n[0] || '';
  const last = s.length ? s[s.length - 1] : (n.length > 1 ? n[n.length - 1] : '');
  return [first, last].filter(Boolean).join('.');
}

/** Nome curto para o crachá: primeiro nome + último sobrenome, capitalizado */
export function makeBadgeName(nome, sobrenome) {
  const n = clean(nome).split(' ').filter(Boolean);
  const s = clean(sobrenome).split(' ').filter(Boolean);
  const SUFFIX = /^(filho|filha|junior|júnior|jr\.?|neto|neta|sobrinho|segundo|terceiro)$/i;
  let last = s.length ? s[s.length - 1] : n.length > 1 ? n[n.length - 1] : '';
  if (SUFFIX.test(last) && s.length > 1) last = `${s[s.length - 2]} ${last}`;
  const parts = [n[0], ...last.split(' ')].filter(Boolean);
  return parts.map((p) => p.charAt(0).toLocaleUpperCase('pt-BR') + p.slice(1).toLocaleLowerCase('pt-BR')).join(' ');
}

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sem 0/O/1/I para leitura humana
export function makeCode(len = 8) {
  const bytes = crypto.randomBytes(len);
  let out = '';
  for (let i = 0; i < len; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

export function parseConsent(v) {
  const s = slug(v);
  return ['sim', 's', 'yes', 'y', '1', 'true', 'x', 'autorizo'].includes(s) ? 1 : 0;
}

/** Extrai o código de um conteúdo lido (QR pode vir como "SIRAN:ABCD1234" ou URL) */
export function extractCode(raw) {
  const s = String(raw ?? '').trim();
  const m = s.match(/([A-HJ-NP-Z2-9]{8})\s*$/i);
  return m ? m[1].toUpperCase() : s.toUpperCase();
}

export function formatCpf(d) {
  const x = onlyDigits(d);
  return x.length === 11 ? `${x.slice(0, 3)}.${x.slice(3, 6)}.${x.slice(6, 9)}-${x.slice(9)}` : x;
}
