const { exec } = require('child_process');

/**
 * Runs a shell command and resolves with success/failure info.
 * Never rejects — failures are reported via the resolved object so
 * callers can route them into the retry/DLQ flow uniformly.
 */
function runCommand(command) {
  return new Promise((resolve) => {
    exec(command, { timeout: 0 }, (err, stdout, stderr) => {
      if (err) {
        resolve({
          success: false,
          exitCode: err.code ?? 1,
          error: err.message,
          stdout,
          stderr,
        });
        return;
      }
      resolve({ success: true, exitCode: 0, stdout, stderr });
    });
  });
}

module.exports = { runCommand };