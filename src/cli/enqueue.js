const queueManager = require('../queue/queueManager');

function register(program) {
  program
    .command('enqueue [jobJson]')
    .description(
      'Add a new job to the queue. Either pass flags (--command "echo hi" --id job1) ' +
        'or a raw JSON string, e.g. \'{"id":"job1","command":"sleep 2"}\' (Unix shells only ' +
        '- on Windows/PowerShell use the flag form to avoid quoting issues).'
    )
    .option('--command <cmd>', 'Shell command to run')
    .option('--id <id>', 'Custom job id (auto-generated if omitted)')
    .option('--max-retries <n>', 'Max retries for this job (overrides config default)')
    .action((jobJson, opts) => {
      queueManager.initStorage();

      let parsed;

      if (opts.command) {
        // Flag-based form — safest on Windows, no shell-quoting gymnastics needed.
        parsed = {
          command: opts.command,
          id: opts.id,
          max_retries: opts.maxRetries !== undefined ? parseInt(opts.maxRetries, 10) : undefined,
        };
      } else if (jobJson) {
        try {
          parsed = JSON.parse(jobJson);
        } catch {
          console.error(
            'Invalid JSON. Example: queuectl enqueue \'{"id":"job1","command":"sleep 2"}\'\n' +
              'On Windows/PowerShell, use flags instead: queuectl enqueue --command "sleep 2" --id job1'
          );
          process.exitCode = 1;
          return;
        }
      } else {
        console.error(
          'Provide a job either via flags (--command "echo hi") or a JSON string.\n' +
            'Examples:\n' +
            '  queuectl enqueue --command "echo hello" --id job1\n' +
            '  queuectl enqueue \'{"id":"job1","command":"echo hello"}\'   (Unix shells)'
        );
        process.exitCode = 1;
        return;
      }

      try {
        const job = queueManager.enqueue(parsed);
        console.log(`Enqueued job "${job.id}" (state: ${job.state})`);
      } catch (err) {
        console.error(`Failed to enqueue job: ${err.message}`);
        process.exitCode = 1;
      }
    });
}

module.exports = { register };