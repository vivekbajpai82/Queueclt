const queueManager = require('../queue/queueManager');
const workerManager = require('../worker/workerManager');

function register(program) {
  program
    .command('status')
    .description('Show summary of all job states & active workers')
    .action(() => {
      queueManager.initStorage();
      const summary = queueManager.getSummary();
      const activeWorkers = workerManager.listActiveWorkers();

      console.log('Job states:');
      Object.entries(summary).forEach(([state, count]) => {
        console.log(`  ${state.padEnd(12)} ${count}`);
      });
      console.log(`\nActive workers: ${activeWorkers.length}${activeWorkers.length ? ` (${activeWorkers.join(', ')})` : ''}`);
    });
}

module.exports = { register };