const STATES = Object.freeze({
  PENDING: 'pending',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  FAILED: 'failed',
  DEAD: 'dead',
});

/**
 * Builds a fresh job object ready for insertion into storage.
 * @param {string} id - unique job id
 * @param {string} command - shell command to execute
 * @param {number} maxRetries - override for this job's max retry count
 */
function createJob(id, command, maxRetries) {
  const now = new Date().toISOString();
  return {
    id,
    command,
    state: STATES.PENDING,
    attempts: 0,
    max_retries: maxRetries,
    last_error: null,
    locked_by: null,
    run_at: now, // earliest time this job is eligible to run (used for backoff delay)
    created_at: now,
    updated_at: now,
  };
}

module.exports = { STATES, createJob };