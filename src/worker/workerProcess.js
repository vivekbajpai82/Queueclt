const queueManager = require('../queue/queueManager');
const retryManager = require('../queue/retryManager');
const { runCommand } = require('./executor');
const { getConfig } = require('../config/configManager');
const logger = require('../utils/logger');

const workerId = `worker-${process.pid}`;

let shuttingDown = false;
let currentlyProcessing = false;

async function pollLoop() {
  queueManager.initStorage();
  const config = getConfig();

  logger.info('Worker started', workerId);

  while (!shuttingDown) {
    const job = queueManager.claimNextJob(workerId);

    if (!job) {
      await sleep(config.poll_interval_ms);
      continue;
    }

    currentlyProcessing = true;
    logger.info(`Claimed job ${job.id}: ${job.command}`, workerId);

    const result = await runCommand(job.command);

    if (result.success) {
      queueManager.markCompleted(job.id);
      logger.info(`Job ${job.id} completed successfully`, workerId);
    } else {
      const errMsg = result.error || `Exit code ${result.exitCode}`;
      const updated = retryManager.handleFailure(job, errMsg, config.backoff_base);
      if (updated.state === 'dead') {
        logger.warn(`Job ${job.id} exhausted retries, moved to DLQ: ${errMsg}`, workerId);
      } else {
        logger.warn(
          `Job ${job.id} failed (attempt ${updated.attempts}/${job.max_retries}), retry at ${updated.run_at}: ${errMsg}`,
          workerId
        );
      }
    }

    currentlyProcessing = false;
  }

  logger.info('Worker stopped gracefully', workerId);
  process.exit(0);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function gracefulShutdown(signal) {
  if (shuttingDown) return;
  logger.info(`Received ${signal}, shutting down after current job finishes...`, workerId);
  shuttingDown = true;

  // If idle (not mid-job), exit immediately; otherwise the poll loop
  // will exit right after the in-flight job finishes.
  if (!currentlyProcessing) {
    process.exit(0);
  }
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

pollLoop().catch((err) => {
  logger.error(`Fatal worker error: ${err.message}`, workerId);
  process.exit(1);
});