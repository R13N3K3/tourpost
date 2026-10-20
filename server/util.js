const fs = require('fs');
const path = require('path');

const sleep = ms => new Promise(r => setTimeout(r, ms));

const ENV_FILE = path.join(__dirname, '..', '.env');

// Schreibt einen Wert in die .env (ersetzt oder ergänzt die Zeile) und übernimmt ihn sofort im laufenden Prozess.
function setEnvVar(key, value) {
  let text = fs.existsSync(ENV_FILE) ? fs.readFileSync(ENV_FILE, 'utf8') : '';
  const re = new RegExp(`^${key}=.*$`, 'm');
  text = re.test(text) ? text.replace(re, () => `${key}=${value}`) : text.replace(/\n?$/, `\n${key}=${value}\n`);
  fs.writeFileSync(ENV_FILE, text);
  process.env[key] = value;
}

module.exports = { sleep, setEnvVar };
