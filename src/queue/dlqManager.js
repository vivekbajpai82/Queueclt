const storage = require('../storage/sqliteStorage');
const { STATES } = require('../models/Job');

function moveToDLQ(jobId, errorMessage) {
  return storage.updateJob(jobId, {
    state: STATES.DEAD,
    locked_by: null,
    last_error: errorMessage,
  });
}

function listDLQ() {
  return storage.listJobs(STATES.DEAD);
}

/**
 * Requeues a dead job back to pending, resetting its attempt count
 * so it gets a fresh set of retries.
 */
function retryFromDLQ(jobId) {
  const job = storage.getJob(jobId);
  if (!job) throw new Error(`Job ${jobId} not found`);
  if (job.state !== STATES.DEAD) {
    throw new Error(`Job ${jobId} is not in the DLQ (current state: ${job.state})`);
  }

  return storage.updateJob(jobId, {
    state: STATES.PENDING,
    attempts: 0,
    last_error: null,
    locked_by: null,
    run_at: new Date().toISOString(),
  });
}

module.exports = { moveToDLQ, listDLQ, retryFromDLQ };