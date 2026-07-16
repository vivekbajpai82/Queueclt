const { getConfig, setConfig } = require('../config/configManager');

function register(program) {
  const config = program.command('config').description('Manage configuration (retry, backoff, etc.)');

  config
    .command('get [key]')
    .description('Show current configuration, or a single key')
    .action((key) => {
      const current = getConfig();
      if (key) {
        if (!(key in current)) {
          console.error(`Unknown config key: "${key}"`);
          process.exitCode = 1;
          return;
        }
        console.log(`${key} = ${current[key]}`);
        return;
      }
      Object.entries(current).forEach(([k, v]) => console.log(`${k} = ${v}`));
    });

  config
    .command('set <key> <value>')
    .description('Set a configuration value, e.g. queuectl config set max-retries 3')
    .action((key, value) => {
      const normalizedKey = key.replace(/-/g, '_');
      try {
        const updated = setConfig(normalizedKey, value);
        console.log(`${normalizedKey} = ${updated[normalizedKey]}`);
      } catch (err) {
        console.error(err.message);
        process.exitCode = 1;
      }
    });
}

module.exports = { register };