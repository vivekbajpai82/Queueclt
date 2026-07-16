/**
 * Exponential backoff: delay = base ^ attempts (in seconds).
 * @param {number} base - backoff base (e.g. 2)
 * @param {number} attempts - number of attempts already made
 * @returns {number} delay in milliseconds
 */
function calculateBackoffMs(base, attempts) {
  const delaySeconds = Math.pow(base, attempts);
  return Math.round(delaySeconds * 1000);
}

module.exports = { calculateBackoffMs };