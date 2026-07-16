const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

const PID_FILE = path.join(__dirname, '..', '..', 'data', 'workers.pid.json');

function readPids() {
  if (!fs.existsSync(PID_FILE)) return [];
  try {
    return JSON.parse(fs.readFileSync(PID_FILE, 'utf-8'));
  } catch {
    return [];
  }
}

function writePids(pids) {
  const dir = path.dirname(PID_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(PID_FILE, JSON.stringify(pids, null, 2));
}

function isAlive(pid) {
  try {
    process.kill(pid, 0); // signal 0 = existence check, doesn't actually kill
    return true;
  } catch {
    return false;
  }
}

function startWorkers(count) {
  const existing = readPids().filter(isAlive);
  const workerScript = path.join(__dirname, 'workerProcess.js');
  const spawned = [];

  for (let i = 0; i < count; i++) {
    // spawn() (not fork()) is used deliberately: fork() always opens an
    // implicit IPC channel to the child, and that channel keeps the parent
    // process alive even after child.unref() — the CLI command would hang
    // instead of returning immediately. spawn() has no such channel.
    const child = spawn(process.execPath, [workerScript], {
      detached: true,
      stdio: 'ignore',
    });
    child.unref();
    spawned.push(child.pid);
    logger.info(`Spawned worker process pid=${child.pid}`);
  }

  writePids([...existing, ...spawned]);
  return spawned;
}

function stopWorkers() {
  const pids = readPids().filter(isAlive);

  if (pids.length === 0) {
    logger.info('No running workers found.');
    writePids([]);
    return [];
  }

  pids.forEach((pid) => {
    try {
      process.kill(pid, 'SIGTERM'); // triggers graceful shutdown in workerProcess.js
      logger.info(`Sent SIGTERM to worker pid=${pid}`);
    } catch (err) {
      logger.warn(`Could not signal pid=${pid}: ${err.message}`);
    }
  });

  writePids([]);
  return pids;
}

function listActiveWorkers() {
  return readPids().filter(isAlive);
}

module.exports = { startWorkers, stopWorkers, listActiveWorkers };