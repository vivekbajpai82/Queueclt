const queueManager = require('../queue/queueManager');

function register(program) {
  program
    .command('list')
    .description('List jobs, optionally filtered by state')
    .option('--state <state>', 'Filter by state: pending, processing, completed, failed, dead')
    .action((opts) => {
      queueManager.initStorage();
      const jobs = queueManager.listJobs(opts.state);

      if (jobs.length === 0) {
        console.log('No jobs found.');
        return;
      }

      jobs.forEach((job) => {
        console.log(
          `${job.id}\t${job.state}\t attempts=${job.attempts}/${job.max_retries}\t"${job.command}"${
            job.last_error ? `\t last_error="${job.last_error}"` : ''
          }`
        );
      });
    });
}

module.exports = { register };