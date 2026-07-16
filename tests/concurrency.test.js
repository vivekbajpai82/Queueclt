const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const storage = require('../src/storage/sqliteStorage');
const queueManager = require('../src/queue/queueManager');

const TEST_DB = path.join(__dirname, 'tmp-concurrency.db');

function cleanup() {
  ['', '-wal', '-shm'].forEach((suffix) => {
    const file = TEST_DB + suffix;
    if (fs.existsSync(file)) fs.unlinkSync(file);
  });
}

test('concurrency: no two workers claim the same job', () => {
  cleanup();
  storage.init(TEST_DB);

  const JOB_COUNT = 20;
  for (let i = 0; i < JOB_COUNT; i++) {
    queueManager.enqueue({ id: `job-${i}`, command: 'echo hi' });
  }

  const claimedBy = new Map();
  const workers = ['worker-A', 'worker-B', 'worker-C'];
  let claimsMade = 0;

  while (claimsMade < JOB_COUNT) {
    for (const w of workers) {
      const job = queueManager.claimNextJob(w);
      if (!job) continue;

      assert.equal(claimedBy.has(job.id), false, `Job ${job.id} claimed more than once`);
      claimedBy.set(job.id, w);
      claimsMade++;
    }
  }

  assert.equal(claimedBy.size, JOB_COUNT);

  const allJobs = queueManager.listJobs();
  allJobs.forEach((job) => {
    assert.equal(job.state, 'processing');
    assert.ok(job.locked_by);
  });

  storage.close();
  cleanup();
});

test('concurrency: claiming with no pending jobs returns null', () => {
  cleanup();
  storage.init(TEST_DB);

  assert.equal(queueManager.claimNextJob('worker-X'), null);

  storage.close();
  cleanup();
});