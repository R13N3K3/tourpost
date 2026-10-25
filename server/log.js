// Dauerhaftes Protokoll aller Veröffentlichungen (data/log.jsonl, eine Zeile pro Ereignis).
// Bleibt bestehen, auch wenn ein Video aus dem Vorrat gelöscht wird.
const fs = require('fs');
const path = require('path');

const FILE = path.join(process.env.DATA_DIR || path.join(__dirname, '..', 'data'), 'log.jsonl');

function read() {
  try {
    return fs.readFileSync(FILE, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l));
  } catch {
    return [];
  }
}

module.exports = {
  add(entry) {
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    fs.appendFileSync(FILE, JSON.stringify({ time: new Date().toISOString(), ...entry }) + '\n');
  },
  all: read,
  // echte Veröffentlichungen zu diesem Video (Testläufe zählen nicht)
  published: hash => read().filter(e => e.hash === hash && e.status === 'done' && !e.test),
};
