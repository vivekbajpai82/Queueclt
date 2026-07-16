const queueManager = require('../queue/queueManager');
const dlqManager = require('../queue/dlqManager');

function register(program) {
  const dlq = program.command('dlq').description('View or retry jobs in the Dead Letter Queue');

  dlq
    .command('list')
    .description('List all jobs currently in the DLQ')
    .action(() => {
      queueManager.initStorage();
      const jobs = dlqManager.listDLQ();

      if (jobs.length === 0) {
        console.log('DLQ is empty.');
        return;
      }

      jobs.forEach((job) => {
        console.log(`${job.id}\t"${job.command}"\t last_error="${job.last_error}"`);
      });
    });

  dlq
    .command('retry <jobId>')
    .description('Requeue a job from the DLQ back to pending')
    .action((jobId) => {
      queueManager.initStorage();
      try {
        const job = dlqManager.retryFromDLQ(jobId);
        console.log(`Job "${job.id}" requeued (state: ${job.state})`);
      } catch (err) {
        console.error(`Failed to retry job: ${err.message}`);
        process.exitCode = 1;
      }
    });
}

module.exports = { register };