const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const storage = require('../src/storage/sqliteStorage');
const queueManager = require('../src/queue/queueManager');
const retryManager = require('../src/queue/retryManager');
const dlqManager = require('../src/queue/dlqManager');
const { STATES } = require('../src/models/Job');

const TEST_DB = path.join(__dirname, 'tmp-retry.db');
const BACKOFF_BASE = 2;

function cleanup() {
  ['', '-wal', '-shm'].forEach((suffix) => {
    const file = TEST_DB + suffix;
    if (fs.existsSync(file)) fs.unlinkSync(file);
  });
}

test('retry: failed job is retried with exponential backoff until max_retries, then moves to DLQ', () => {
  cleanup();
  storage.init(TEST_DB);

  const job = queueManager.enqueue({ id: 'flaky1', command: 'exit 1', max_retries: 2 });
  let current = queueManager.claimNextJob('worker-1');
  assert.equal(current.id, 'flaky1');

  const beforeFail1 = Date.now();
  const afterFail1 = retryManager.handleFailure(current, 'boom', BACKOFF_BASE);
  assert.equal(afterFail1.state, STATES.PENDING);
  assert.equal(afterFail1.attempts, 1);
  assert.ok(new Date(afterFail1.run_at).getTime() >= beforeFail1);

  assert.equal(queueManager.claimNextJob('worker-1'), null);

  storage.updateJob('flaky1', { run_at: new Date(Date.now() - 1000).toISOString() });
  current = queueManager.claimNextJob('worker-1');
  assert.equal(current.attempts, 1);

  const afterFail2 = retryManager.handleFailure(current, 'boom again', BACKOFF_BASE);
  assert.equal(afterFail2.attempts, 2);
  assert.equal(afterFail2.state, STATES.PENDING);

  storage.updateJob('flaky1', { run_at: new Date(Date.now() - 1000).toISOString() });
  current = queueManager.claimNextJob('worker-1');

  const afterFail3 = retryManager.handleFailure(current, 'final boom', BACKOFF_BASE);
  assert.equal(afterFail3.state, STATES.DEAD);
  assert.equal(afterFail3.last_error, 'final boom');

  const dlqJobs = dlqManager.listDLQ();
  assert.equal(dlqJobs.length, 1);
  assert.equal(dlqJobs[0].id, 'flaky1');

  storage.close();
  cleanup();
});

test('retry: job can be requeued from the DLQ with attempts reset', () => {
  cleanup();
  storage.init(TEST_DB);

  queueManager.enqueue({ id: 'dead1', command: 'exit 1', max_retries: 0 });
  const claimed = queueManager.claimNextJob('worker-1');
  retryManager.handleFailure(claimed, 'immediate death', BACKOFF_BASE);

  const dead = queueManager.getJob('dead1');
  assert.equal(dead.state, STATES.DEAD);

  const requeued = dlqManager.retryFromDLQ('dead1');
  assert.equal(requeued.state, STATES.PENDING);
  assert.equal(requeued.attempts, 0);
  assert.equal(requeued.last_error, null);

  storage.close();
  cleanup();
});