// Einstellungen (Wochenplan, Warnschwelle) in data/settings.json.
// "state" ist interner Zustand des Planers und gehört nicht in die Antwort an die App.
const fs = require('fs');
const path = require('path');

const FILE = path.join(process.env.DATA_DIR || path.join(__dirname, '..', 'data'), 'settings.json');

// Standardplan: Freitag und Sonntag um 12:00 (Schalter bleibt aus, bis er in der App eingeschaltet wird)
let data = { enabled: false, slots: [{ day: 5, time: '12:00' }, { day: 0, time: '12:00' }], lowStock: 2, state: { lastHandled: null, lowNotified: null } };
try { data = { ...data, ...JSON.parse(fs.readFileSync(FILE, 'utf8')) }; } catch {}
data.state = { lastHandled: null, lowNotified: null, ...data.state };

function save() {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  const tmp = FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, FILE);
}

const user = () => ({ enabled: data.enabled, slots: data.slots, lowStock: data.lowStock });

function validate(body) {
  const slots = [];
  for (const s of [].concat(body.slots || [])) {
    const day = Number(s.day);
    if (!Number.isInteger(day) || day < 0 || day > 6) return { error: 'Ungültiger Wochentag.' };
    const m = /^(\d{2}):(\d{2})$/.exec(s.time || '');
    if (!m || +m[1] > 23 || +m[2] > 59) return { error: 'Ungültige Uhrzeit.' };
    if (slots.some(x => x.day === day)) return { error: 'Jeder Wochentag nur einmal.' };
    slots.push({ day, time: s.time });
  }
  const lowStock = Number(body.lowStock ?? 2);
  if (!Number.isInteger(lowStock) || lowStock < 0 || lowStock > 50) return { error: 'Ungültige Warnschwelle.' };
  if (body.enabled && !slots.length) return { error: 'Bitte mindestens einen Wochentag wählen.' };
  return { value: { enabled: !!body.enabled, slots: slots.sort((a, b) => a.day - b.day), lowStock } };
}

module.exports = {
  get: () => data,
  user,
  validate,
  update(v) { Object.assign(data, v); save(); },
  setState(p) { Object.assign(data.state, p); save(); },
};
