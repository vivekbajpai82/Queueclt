const storage = require('../storage/sqliteStorage');
const { createJob, STATES } = require('../models/Job');
const { generateId } = require('../utils/idGenerator');
const { getConfig } = require('../config/configManager');

function initStorage() {
  const config = getConfig();
  storage.init(config.db_path);
}

function enqueue({ id, command, max_retries }) {
  if (!command) throw new Error('"command" is required to enqueue a job');

  const config = getConfig();
  const jobId = id || generateId();

  if (storage.getJob(jobId)) {
    throw new Error(`Job with id "${jobId}" already exists`);
  }

  const job = createJob(jobId, command, max_retries ?? config.max_retries);
  storage.insertJob(job);
  return job;
}

function claimNextJob(workerId) {
  return storage.claimNextJob(workerId);
}

function markCompleted(jobId) {
  return storage.updateJob(jobId, {
    state: STATES.COMPLETED,
    locked_by: null,
    last_error: null,
  });
}

function markFailed(jobId, errorMessage) {
  return storage.updateJob(jobId, {
    state: STATES.FAILED,
    locked_by: null,
    last_error: errorMessage,
  });
}

function getJob(jobId) {
  return storage.getJob(jobId);
}

function listJobs(state) {
  return storage.listJobs(state);
}

function getSummary() {
  return storage.getSummary();
}

module.exports = {
  initStorage,
  enqueue,
  claimNextJob,
  markCompleted,
  markFailed,
  getJob,
  listJobs,
  getSummary,
};