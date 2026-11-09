import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';

// raiz do projeto, independente da pasta de onde o servidor foi iniciado
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// DATA_DIR aceita "~/pasta" (pasta pessoal do usuário no servidor). Na hospedagem, use uma pasta FORA
// da pasta do app: a cada implantação a pasta do app pode ser recriada e o que estiver dentro dela se perde.
const rawDir = (process.env.DATA_DIR || 'data').trim();
export const DATA_DIR = rawDir.startsWith('~') ? path.join(os.homedir(), rawDir.slice(1).replace(/^[\/]+/, '')) : path.resolve(ROOT, rawDir);
fs.mkdirSync(DATA_DIR, { recursive: true });

export const DB_PATH = path.join(DATA_DIR, 'credenciamento.db');
export const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');

db.exec(`
CREATE TABLE IF NOT EXISTS areas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL UNIQUE,
  ativo INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS participants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ext_id TEXT,                         -- ID da planilha de inscrição
  code TEXT NOT NULL UNIQUE,           -- código do QR / código de barras
  nome TEXT NOT NULL,
  sobrenome TEXT NOT NULL DEFAULT '',
  nome_cracha TEXT NOT NULL DEFAULT '',-- nome curto impresso na etiqueta
  email TEXT NOT NULL DEFAULT '',
  whatsapp TEXT NOT NULL DEFAULT '',
  cpf TEXT NOT NULL DEFAULT '',        -- somente dígitos
  empresa TEXT NOT NULL DEFAULT '',
  cargo TEXT NOT NULL DEFAULT '',
  cidade TEXT NOT NULL DEFAULT '',
  categoria TEXT NOT NULL DEFAULT 'VISITANTE',
  consentimento INTEGER NOT NULL DEFAULT 0,  -- autoriza compartilhar dados de contato
  login TEXT NOT NULL DEFAULT '',            -- nome.sobrenome (sem acento)
  role TEXT NOT NULL DEFAULT 'participante', -- participante | scanner | balcao | admin
  area_id INTEGER REFERENCES areas(id) ON DELETE SET NULL,
  observacoes TEXT NOT NULL DEFAULT '',
  origem TEXT NOT NULL DEFAULT 'importacao', -- importacao | balcao | manual
  checkin_at TEXT,
  print_count INTEGER NOT NULL DEFAULT 0,
  last_print_at TEXT,
  search_text TEXT NOT NULL DEFAULT '',     -- nome/empresa sem acentos, para busca
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_part_cpf ON participants(cpf);
CREATE INDEX IF NOT EXISTS idx_part_login ON participants(login);
CREATE INDEX IF NOT EXISTS idx_part_email ON participants(email);

CREATE TABLE IF NOT EXISTS scans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  participant_id INTEGER NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  area_id INTEGER REFERENCES areas(id) ON DELETE SET NULL,
  scanner_id INTEGER REFERENCES participants(id) ON DELETE SET NULL,
  direcao TEXT NOT NULL DEFAULT 'entrada', -- entrada | saida
  client_uuid TEXT UNIQUE,                 -- evita duplicar leituras feitas offline
  scanned_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_scans_area ON scans(area_id, scanned_at);
CREATE INDEX IF NOT EXISTS idx_scans_part ON scans(participant_id, scanned_at);

CREATE TABLE IF NOT EXISTS contacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id INTEGER NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  contact_id INTEGER NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  nota TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  UNIQUE(owner_id, contact_id)
);

CREATE TABLE IF NOT EXISTS prints (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  participant_id INTEGER NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  operador TEXT NOT NULL DEFAULT '',
  printed_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  participant_id INTEGER,          -- NULL = administrador mestre (.env)
  role TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`);

export function getSetting(key, fallback) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  if (!row) return fallback;
  try { return JSON.parse(row.value); } catch { return fallback; }
}

export function setSetting(key, value) {
  db.prepare('INSERT INTO settings(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .run(key, JSON.stringify(value));
}

export function tx(fn) {
  db.exec('BEGIN');
  try { const r = fn(); db.exec('COMMIT'); return r; }
  catch (e) { db.exec('ROLLBACK'); throw e; }
}

// categoria antiga "STAFF" passou a se chamar "STAFF SIRAN SUMMIT"
db.prepare("UPDATE participants SET categoria = 'STAFF SIRAN SUMMIT' WHERE categoria = 'STAFF'").run();
