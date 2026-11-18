'use strict';
/**
 * Database access layer.
 *
 * Uses Node's built-in SQLite (node:sqlite, Node ≥ 22.13) so the backend has no
 * native build step. All SQL in the codebase is written in the portable subset
 * shared by SQLite and PostgreSQL (no SQLite-only functions in queries beyond
 * what `dialect` abstracts), so a PostgreSQL adapter can implement the same
 * get/all/run/tx interface. See docs/ARCHITECTURE.md.
 */
const { DatabaseSync } = require('node:sqlite');

function normalize(params) {
  return params.map((p) => (p === undefined ? null : typeof p === 'boolean' ? (p ? 1 : 0) : p));
}

class Database {
  constructor(file) {
    this.file = file;
    this.db = new DatabaseSync(file);
    this.db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000; PRAGMA synchronous = NORMAL;');
    this.cache = new Map();
    this.depth = 0;
  }
  stmt(sql) {
    let s = this.cache.get(sql);
    if (!s) { s = this.db.prepare(sql); this.cache.set(sql, s); }
    return s;
  }
  get(sql, ...params) { const r = this.stmt(sql).get(...normalize(params)); return r ? { ...r } : undefined; }
  all(sql, ...params) { return this.stmt(sql).all(...normalize(params)).map((r) => ({ ...r })); }
  run(sql, ...params) {
    const r = this.stmt(sql).run(...normalize(params));
    return { changes: Number(r.changes), id: Number(r.lastInsertRowid) };
  }
  exec(sql) { this.db.exec(sql); }
  /** Synchronous transaction; nested calls join the outer transaction. */
  tx(fn) {
    if (this.depth > 0) return fn();
    this.db.exec('BEGIN IMMEDIATE');
    this.depth++;
    try { const out = fn(); this.db.exec('COMMIT'); return out; }
    catch (e) { try { this.db.exec('ROLLBACK'); } catch {} throw e; }
    finally { this.depth--; }
  }
  close() { this.db.close(); }
}

const json = {
  parse(v, fallback) { if (v === null || v === undefined || v === '') return fallback; try { return JSON.parse(v); } catch { return fallback; } },
  str(v) { return JSON.stringify(v ?? null); },
};

const now = () => new Date().toISOString();
const today = () => new Date().toISOString().slice(0, 10);

module.exports = { Database, json, now, today };
