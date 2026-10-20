// Speichert den Vorrat (geplante und fertige Videos) in data/queue.json.
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const FILE = path.join(DATA_DIR, 'queue.json');

let items = [];
try { items = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { items = []; }

// atomar schreiben, damit bei einem Absturz keine halbe Datei bleibt
function save() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(items, null, 2));
  fs.renameSync(tmp, FILE);
}

// interne Felder (Dateiname, Basis-URL) gehören nicht in die Antwort an die App
const view = ({ file, base, hash, ...rest }) => rest;

module.exports = {
  raw: () => items,
  all: () => items.map(view),
  find: id => items.find(i => i.id === id),
  view,
  save,
  add(item) { items.push(item); save(); return item; },
  remove(id) {
    const i = items.findIndex(x => x.id === id);
    if (i < 0) return null;
    const [item] = items.splice(i, 1);
    save();
    return item;
  },
};
