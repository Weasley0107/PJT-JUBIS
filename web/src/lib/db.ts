import Database from 'better-sqlite3';
import path from 'path';
import bcrypt from 'bcryptjs';

const DB_PATH = path.join(process.cwd(), 'stock_analyses.db');

let db: Database.Database;

function getDb(): Database.Database {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.exec(`
      CREATE TABLE IF NOT EXISTS analyses (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        ticker        TEXT    NOT NULL,
        market        TEXT    NOT NULL,
        period        TEXT    NOT NULL,
        technical     TEXT    NOT NULL,
        compare       TEXT    DEFAULT '',
        mode          TEXT    NOT NULL DEFAULT 'api',
        content       TEXT    NOT NULL,
        input_tokens  INTEGER DEFAULT 0,
        output_tokens INTEGER DEFAULT 0,
        created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        username      TEXT    NOT NULL UNIQUE,
        password_hash TEXT    NOT NULL,
        role          TEXT    NOT NULL DEFAULT 'user',
        created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    // 기존 DB 마이그레이션
    try { db.exec(`ALTER TABLE analyses ADD COLUMN mode TEXT NOT NULL DEFAULT 'api'`); } catch { /* already exists */ }
    try { db.exec(`ALTER TABLE analyses ADD COLUMN input_tokens INTEGER DEFAULT 0`); } catch { /* already exists */ }
    try { db.exec(`ALTER TABLE analyses ADD COLUMN output_tokens INTEGER DEFAULT 0`); } catch { /* already exists */ }

    // 관리자 계정 시드 (없을 때만)
    const admin = db.prepare('SELECT id FROM users WHERE username = ?').get('weasley');
    if (!admin) {
      const hash = bcrypt.hashSync('weasley', 10);
      db.prepare('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)').run('weasley', hash, 'admin');
    }
  }
  return db;
}

export interface Analysis {
  id: number;
  ticker: string;
  market: string;
  period: string;
  technical: string;
  compare: string;
  mode: 'cli';
  content: string;
  input_tokens: number;
  output_tokens: number;
  created_at: string;
}

export function saveAnalysis(params: Omit<Analysis, 'id' | 'created_at'>): number {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO analyses (ticker, market, period, technical, compare, mode, content, input_tokens, output_tokens)
    VALUES (@ticker, @market, @period, @technical, @compare, @mode, @content, @input_tokens, @output_tokens)
  `);
  const result = stmt.run({
    ...params,
    input_tokens: params.input_tokens ?? 0,
    output_tokens: params.output_tokens ?? 0,
  });
  return result.lastInsertRowid as number;
}

export interface MonthlyUsage {
  input_tokens: number;
  output_tokens: number;
  count: number;
  today_count: number;
}

export function getMonthlyUsage(): MonthlyUsage {
  const db = getDb();
  const monthly = db.prepare(`
    SELECT
      COALESCE(SUM(input_tokens), 0)  AS input_tokens,
      COALESCE(SUM(output_tokens), 0) AS output_tokens,
      COUNT(*) AS count
    FROM analyses
    WHERE created_at >= datetime('now', '-30 days')
  `).get() as { input_tokens: number; output_tokens: number; count: number };

  const today = db.prepare(`
    SELECT COUNT(*) AS count
    FROM analyses
    WHERE created_at >= date('now')
  `).get() as { count: number };

  return { ...monthly, today_count: today.count };
}

export function getHistory(limit = 50): Analysis[] {
  const db = getDb();
  return db.prepare(
    'SELECT * FROM analyses ORDER BY created_at DESC LIMIT ?'
  ).all(limit) as Analysis[];
}

export function getAnalysisById(id: number): Analysis | undefined {
  const db = getDb();
  return db.prepare('SELECT * FROM analyses WHERE id = ?').get(id) as Analysis | undefined;
}

export function deleteAnalysis(id: number): void {
  const db = getDb();
  db.prepare('DELETE FROM analyses WHERE id = ?').run(id);
}

export interface User {
  id: number;
  username: string;
  password_hash: string;
  role: string;
  created_at: string;
}

export function getUserByUsername(username: string): User | undefined {
  const db = getDb();
  return db.prepare('SELECT * FROM users WHERE username = ?').get(username) as User | undefined;
}
