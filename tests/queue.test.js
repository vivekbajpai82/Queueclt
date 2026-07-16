const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const storage = require('../src/storage/sqliteStorage');
const queueManager = require('../src/queue/queueManager');
const { STATES } = require('../src/models/Job');

const TEST_DB = path.join(__dirname, 'tmp-queue.db');

function cleanup() {
  ['', '-wal', '-shm'].forEach((suffix) => {
    const file = TEST_DB + suffix;
    if (fs.existsSync(file)) fs.unlinkSync(file);
  });
}

test('queue: enqueue -> claim -> complete flow', () => {
  cleanup();
  storage.init(TEST_DB);

  const job = queueManager.enqueue({ id: 'job1', command: 'echo hello' });
  assert.equal(job.state, STATES.PENDING);
  assert.equal(job.attempts, 0);

  const claimed = queueManager.claimNextJob('worker-1');
  assert.equal(claimed.id, 'job1');
  assert.equal(claimed.state, STATES.PROCESSING);
  assert.equal(claimed.locked_by, 'worker-1');

  const completed = queueManager.markCompleted('job1');
  assert.equal(completed.state, STATES.COMPLETED);
  assert.equal(completed.locked_by, null);

  const noMoreJobs = queueManager.claimNextJob('worker-1');
  assert.equal(noMoreJobs, null);

  storage.close();
  cleanup();
});

test('queue: enqueue rejects duplicate ids', () => {
  cleanup();
  storage.init(TEST_DB);

  queueManager.enqueue({ id: 'dup1', command: 'echo one' });
  assert.throws(
    () => queueManager.enqueue({ id: 'dup1', command: 'echo two' }),
    /already exists/
  );

  storage.close();
  cleanup();
});

test('queue: enqueue requires a command', () => {
  cleanup();
  storage.init(TEST_DB);

  assert.throws(() => queueManager.enqueue({ id: 'no-cmd' }), /command.*required/);

  storage.close();
  cleanup();
});