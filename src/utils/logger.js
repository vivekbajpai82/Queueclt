const fs = require('fs');
const path = require('path');

const LOG_DIR = path.join(__dirname, '..', '..', 'data', 'logs');
const LOG_FILE = path.join(LOG_DIR, 'worker.log');

function ensureLogDir() {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
}

function writeToFile(line) {
  try {
    ensureLogDir();
    fs.appendFileSync(LOG_FILE, line + '\n');
  } catch {
    // If file logging fails for any reason, don't crash the process over it.
  }
}

function timestamp() {
  return new Date().toISOString();
}

function format(level, msg, tag) {
  return `[${timestamp()}]${tag ? ` [${tag}]` : ''} ${level}${msg}`;
}

function info(msg, tag = '') {
  const line = format('', msg, tag);
  console.log(line);
  writeToFile(line);
}

function warn(msg, tag = '') {
  const line = format('WARN: ', msg, tag);
  console.warn(line);
  writeToFile(line);
}

function error(msg, tag = '') {
  const line = format('ERROR: ', msg, tag);
  console.error(line);
  writeToFile(line);
}

module.exports = { info, warn, error, LOG_FILE };