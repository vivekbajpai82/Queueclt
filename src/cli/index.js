const { Command } = require('commander');

const enqueueCmd = require('./enqueue');
const workerCmd = require('./worker');
const statusCmd = require('./status');
const listCmd = require('./list');
const dlqCmd = require('./dlq');
const configCmd = require('./config');

function buildCli() {
  const program = new Command();

  program
    .name('queuectl')
    .description('CLI-based background job queue system with retries, exponential backoff, and a Dead Letter Queue')
    .version('1.0.0');

  enqueueCmd.register(program);
  workerCmd.register(program);
  statusCmd.register(program);
  listCmd.register(program);
  dlqCmd.register(program);
  configCmd.register(program);

  return program;
}

module.exports = { buildCli };