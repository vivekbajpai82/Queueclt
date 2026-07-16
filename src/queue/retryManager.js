const storage = require('../storage/sqliteStorage');
const { STATES } = require('../models/Job');
const { calculateBackoffMs } = require('../utils/backoff');
const dlqManager = require('./dlqManager');

/**
 * Handles a job failure:
 * - Increment attempt count
 * - Retry with exponential backoff
 * - Move to DLQ after max retries are exhausted
 */
function handleFailure(job, errorMessage, backoffBase) {
  const attempts = job.attempts + 1;

  // Exceeded maximum retries -> move to DLQ
  if (attempts > job.max_retries) {
    return dlqManager.moveToDLQ(job.id, errorMessage);
  }

  // Calculate next retry time
  const delayMs = calculateBackoffMs(backoffBase, attempts);
  const runAt = new Date(Date.now() + delayMs).toISOString();

  // Put the job back into the queue
  return storage.updateJob(job.id, {
    state: STATES.PENDING,
    attempts,
    last_error: errorMessage,
    locked_by: null,
    run_at: runAt,
  });
}

module.exports = { handleFailure };