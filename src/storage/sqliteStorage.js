const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const { STATES } = require('../models/Job');

let db = null;

function init(dbPath) {
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  db = new Database(dbPath);

  // WAL mode lets multiple worker processes read/write concurrently
  // without locking the whole file for each operation.
  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 5000');

  db.exec(`
    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY,
      command TEXT NOT NULL,
      state TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      max_retries INTEGER NOT NULL,
      last_error TEXT,
      locked_by TEXT,
      run_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_jobs_state ON jobs (state);
    CREATE INDEX IF NOT EXISTS idx_jobs_run_at ON jobs (run_at);
  `);

  return db;
}

function getDb() {
  if (!db) throw new Error('Storage not initialized. Call init(dbPath) first.');
  return db;
}

function insertJob(job) {
  getDb()
    .prepare(
      `INSERT INTO jobs (id, command, state, attempts, max_retries, last_error, locked_by, run_at, created_at, updated_at)
       VALUES (@id, @command, @state, @attempts, @max_retries, @last_error, @locked_by, @run_at, @created_at, @updated_at)`
    )
    .run(job);
}

function getJob(id) {
  return getDb().prepare('SELECT * FROM jobs WHERE id = ?').get(id);
}

function listJobs(state) {
  if (state) {
    return getDb().prepare('SELECT * FROM jobs WHERE state = ? ORDER BY created_at').all(state);
  }
  return getDb().prepare('SELECT * FROM jobs ORDER BY created_at').all();
}

/**
 * Atomically claims one eligible pending or failed job for a worker.
 * The UPDATE...WHERE guards against two workers claiming the same row:
 * only the worker whose UPDATE actually changes a row (changes === 1) wins.
 */
function claimNextJob(workerId) {
  const database = getDb();
  const nowIso = new Date().toISOString();

  const claim = database.transaction(() => {
    const candidate = database
      .prepare(
        `SELECT id FROM jobs
         WHERE (state = ? OR state = ?) AND run_at <= ?
         ORDER BY run_at ASC
         LIMIT 1`
      )
      .get(STATES.PENDING, STATES.FAILED, nowIso);

    if (!candidate) return null;

    const result = database
      .prepare(
        `UPDATE jobs
         SET state = ?, locked_by = ?, updated_at = ?
         WHERE id = ? AND (state = ? OR state = ?)`
      )
      .run(
        STATES.PROCESSING, 
        workerId, 
        nowIso, 
        candidate.id, 
        STATES.PENDING, 
        STATES.FAILED
      );

    if (result.changes === 0) return null; // another worker beat us to it
    return getJob(candidate.id);
  });

  return claim();
}

function updateJob(id, fields) {
  const current = getJob(id);
  if (!current) throw new Error(`Job ${id} not found`);

  const merged = { ...current, ...fields, updated_at: new Date().toISOString() };

  getDb()
    .prepare(
      `UPDATE jobs SET
        command = @command,
        state = @state,
        attempts = @attempts,
        max_retries = @max_retries,
        last_error = @last_error,
        locked_by = @locked_by,
        run_at = @run_at,
        updated_at = @updated_at
       WHERE id = @id`
    )
    .run(merged);

  return merged;
}

function getSummary() {
  const rows = getDb()
    .prepare('SELECT state, COUNT(*) as count FROM jobs GROUP BY state')
    .all();

  const summary = {
    [STATES.PENDING]: 0,
    [STATES.PROCESSING]: 0,
    [STATES.COMPLETED]: 0,
    [STATES.FAILED]: 0,
    [STATES.DEAD]: 0,
  };
  rows.forEach((row) => {
    summary[row.state] = row.count;
  });
  return summary;
}

function close() {
  if (db) {
    db.close();
    db = null;
  }
}

module.exports = {
  init,
  insertJob,
  getJob,
  listJobs,
  claimNextJob,
  updateJob,
  getSummary,
  close,
};