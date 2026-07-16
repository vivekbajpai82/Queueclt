const workerManager = require('../worker/workerManager');

function register(program) {
  const worker = program.command('worker').description('Manage worker processes');

  worker
    .command('start')
    .description('Start one or more workers')
    .option('--count <n>', 'Number of workers to start', '1')
    .action((opts) => {
      const count = parseInt(opts.count, 10);
      if (!Number.isInteger(count) || count < 1) {
        console.error('--count must be a positive integer');
        process.exitCode = 1;
        return;
      }
      const pids = workerManager.startWorkers(count);
      console.log(`Started ${pids.length} worker(s): ${pids.join(', ')}`);
    });

  worker
    .command('stop')
    .description('Stop running workers gracefully')
    .action(() => {
      const stopped = workerManager.stopWorkers();
      console.log(
        stopped.length
          ? `Sent stop signal to ${stopped.length} worker(s): ${stopped.join(', ')}`
          : 'No workers were running.'
      );
    });
}

module.exports = { register };