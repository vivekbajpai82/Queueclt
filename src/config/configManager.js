const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, 'config.json');

function getConfig() {
  const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
  return JSON.parse(raw);
}

function setConfig(key, value) {
  const config = getConfig();

  if (!(key in config)) {
    throw new Error(`Unknown config key: "${key}". Valid keys: ${Object.keys(config).join(', ')}`);
  }

  // Coerce numeric-looking values back into numbers.
  const numeric = Number(value);
  config[key] = Number.isNaN(numeric) ? value : numeric;

  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
  return config;
}

module.exports = { getConfig, setConfig, CONFIG_PATH };