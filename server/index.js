const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { publishReel } = require('./instagram');
const { publishShort } = require('./youtube');
const media = require('./media');
const tunnel = require('./tunnel');
const igToken = require('./igtoken');
const { publishTikTok } = require('./tiktok');
const queue = require('./queue');
const log = require('./log');
const settings = require('./settings');
const { notify } = require('./notify');
const { lastOccurrence, upcoming } = require('./schedule');

// einfache .env-Unterstützung ohne Zusatzpaket
const envFile = path.join(__dirname, '..', '.env');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2];
  }
}

const PORT = process.env.PORT || 3000;
const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');
const MAX_MB = 500;
const TICK_MS = 10_000;
const CATCHUP_MS = 12 * 3600e3;   // verpasste Wochentermine nur bis zu 12 Stunden nachholen
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (req, file, cb) =>
      cb(null, crypto.randomBytes(12).toString('hex') + (path.extname(file.originalname).toLowerCase() || '.mp4')),
  }),
  limits: { fileSize: MAX_MB * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, file.mimetype.startsWith('video/')),
});

const PUBLISHERS = { instagram: publishReel, youtube: publishShort, tiktok: publishTikTok };
const NAMES = { instagram: 'Instagram', youtube: 'YouTube', tiktok: 'TikTok' };

const clean = v => (v || '').trim();
const cleanPlatforms = v => [].concat(v || []).filter(p => PUBLISHERS[p]);
const parseTime = v => { const d = new Date(v); return v && !isNaN(d) ? d.toISOString() : null; };

function hashFile(file) {
  return new Promise((resolve, reject) => {
    const h = crypto.createHash('sha256');
    fs.createReadStream(file).on('data', d => h.update(d)).on('end', () => resolve(h.digest('hex'))).on('error', reject);
  });
}

// Schritte pro Plattform; bereits veröffentlichte bleiben erhalten (kein doppeltes Posten)
function stepsFor(platforms, old = {}) {
  const steps = {};
  for (const p of platforms) {
    steps[p] = old[p]?.state === 'done' ? old[p] : { name: NAMES[p], state: 'waiting', text: 'Wartet …' };
  }
  return steps;
}

// ---------- Planer ----------
let busy = false;

async function runItem(item) {
  item.status = 'running';
  queue.save();

  const filePath = path.join(UPLOAD_DIR, item.file);
  const caption = [item.title, item.description, item.tags].filter(Boolean).join('\n\n');

  for (const p of item.platforms) {
    const step = item.steps[p];
    if (step.state === 'done') continue;
    step.state = 'running';
    step.text = 'Wird gestartet …';
    queue.save();
    try {
      // Instagram holt das Video über den Tunnel ab; dessen Adresse wird erst jetzt gelesen
      const base = p === 'instagram' ? await tunnel.baseUrl(item.base) : item.base;
      const result = await PUBLISHERS[p]({
        videoUrl: `${base}/media/${item.file}`, filePath,
        title: item.title, description: item.description, tags: item.tags, caption,
        onStatus: s => { step.text = s; },
      });
      step.state = 'done';
      step.text = 'Veröffentlicht ✓';
      step.result = result?.id;
      log.add({ itemId: item.id, hash: item.hash, title: item.title, platform: p, status: 'done', result: result?.id, test: !!result?.test });
    } catch (err) {
      console.error(`${NAMES[p]}:`, err);
      step.state = 'error';
      step.text = err.message;
      log.add({ itemId: item.id, hash: item.hash, title: item.title, platform: p, status: 'error', error: err.message });
    }
    queue.save();
  }

  const allDone = item.platforms.every(p => item.steps[p].state === 'done');
  item.status = allDone ? 'done' : 'error';
  if (allDone) {
    item.finishedAt = new Date().toISOString();
    fs.unlink(filePath, () => {});   // Video wird nach dem Veröffentlichen nicht mehr gebraucht
  }
  queue.save();

  if (!allDone) {
    const failed = item.platforms.filter(p => item.steps[p].state === 'error')
      .map(p => `${NAMES[p]}: ${item.steps[p].text}`).join(' | ');
    notify({ title: 'Veröffentlichung fehlgeschlagen', message: `${item.title || item.originalName} – ${failed}`, priority: 4, tags: ['x'] });
  }
}

async function tick() {
  if (busy) return;
  const now = Date.now();
  const due = queue.raw()
    .filter(i => i.status === 'queued' && new Date(i.scheduledAt).getTime() <= now)
    .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt))[0];
  if (!due) return;
  busy = true;
  try { await runItem(due); } finally { busy = false; }
  setImmediate(tick);
}
const kick = () => setImmediate(tick);

// Beim Start: unterbrochene Aufträge nicht automatisch wiederholen, sonst droht doppeltes Posten
for (const item of queue.raw()) {
  if (item.status !== 'running') continue;
  item.status = 'error';
  for (const step of Object.values(item.steps)) {
    if (step.state === 'running') {
      step.state = 'error';
      step.interrupted = true;
      step.text = 'Unterbrochen – bitte prüfen, ob schon veröffentlicht wurde.';
    }
  }
}
queue.save();

// ---------- Wochenplan (Autopilot) ----------
const drafts = () => queue.raw().filter(i => i.status === 'draft')
  .sort((a, b) => a.createdAt.localeCompare(b.createdAt));   // ältestes Video zuerst
const fmtDay = d => d.toLocaleString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

// Zeitpunkt, an dem das letzte Video im Vorrat rausgeht
function runway(count) {
  const s = settings.get();
  if (!s.enabled || !s.slots.length || !count) return null;
  return upcoming(s.slots, new Date(), count).pop() || null;
}

// warnt einmal pro Bestand, wenn das Vorrat knapp wird oder leer ist
function checkStock() {
  const s = settings.get();
  if (!s.enabled) return;
  const count = drafts().length;
  if (count > s.lowStock) {
    if (s.state.lowNotified !== null) settings.setState({ lowNotified: null });
    return;
  }
  if (s.state.lowNotified === count) return;
  settings.setState({ lowNotified: count });
  const end = runway(count);
  notify(count === 0
    ? { title: 'Vorrat leer', message: 'Es sind keine Videos mehr im Vorrat. Beim nächsten Termin wird nichts gepostet.', priority: 4, tags: ['warning'] }
    : { title: 'Vorrat fast leer', message: `Nur noch ${count} ${count === 1 ? 'Video' : 'Videos'} im Vorrat${end ? ` – reicht bis ${fmtDay(end)}` : ''}.`, priority: 3, tags: ['warning'] });
}

function autopilot() {
  const s = settings.get();
  if (!s.enabled || !s.slots.length) return;

  const now = new Date();
  const due = s.slots.map(sl => lastOccurrence(sl, now)).sort((a, b) => b - a)[0];
  const handled = s.state.lastHandled ? new Date(s.state.lastHandled) : null;
  if (!handled || due > handled) {
    settings.setState({ lastHandled: due.toISOString() });
    if (handled && now - due <= CATCHUP_MS) {
      const next = drafts()[0];
      if (next) {
        next.scheduledAt = now.toISOString();
        next.status = 'queued';
        next.auto = true;
        queue.save();
        kick();
      } else {
        notify({ title: 'Termin ohne Video', message: `Für ${fmtDay(due)} war kein Video im Vorrat.`, priority: 4, tags: ['warning'] });
      }
    }
  }
  checkStock();
}

// ---------- Routen ----------
const app = express();
// Fehlersuche: mit DEBUG_REQUESTS=1 wird jede Anfrage mit Dauer protokolliert
if (process.env.DEBUG_REQUESTS === '1') {
  app.use((req, res, next) => {
    const t = Date.now();
    res.on('close', () => {
      const ms = Date.now() - t;
      console.log(`${new Date().toLocaleTimeString('de-DE')} ${req.ip} ${req.method} ${req.url} ${res.writableFinished ? res.statusCode : 'ABGEBROCHEN'} ${ms}ms`);
    });
    next();
  });
}
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));
// Instagram muss das Video über diese öffentliche URL abholen können
app.use('/media', express.static(UPLOAD_DIR));

app.post('/api/videos', upload.single('video'), async (req, res) => {
  const fail = (code, error) => {
    if (req.file) fs.unlink(req.file.path, () => {});
    return res.status(code).json({ error });
  };
  if (!req.file) return fail(400, 'Bitte eine Videodatei auswählen.');

  const platforms = cleanPlatforms(req.body.platforms);
  if (!platforms.length) return fail(400, 'Keine gültige Plattform gewählt.');

  // Dasselbe Video nie zweimal hochladen: Vergleich über den Inhalt, nicht über den Dateinamen
  const hash = await hashFile(req.file.path);
  const inStock = queue.raw().find(i => i.hash === hash && i.status !== 'done');
  if (inStock) return fail(409, `Dieses Video ist schon im Vorrat („${inStock.title || inStock.originalName}").`);
  const posted = log.published(hash);
  if (posted.length) {
    const where = [...new Set(posted.map(e => NAMES[e.platform]))].join(', ');
    const day = new Date(posted[0].time).toLocaleDateString('de-DE');
    return fail(409, `Dieses Video wurde bereits am ${day} auf ${where} veröffentlicht und wird nicht erneut hochgeladen.`);
  }

  const when = req.body.when || 'now';
  let scheduledAt = null;
  let status = 'draft';
  if (when === 'now') {
    scheduledAt = new Date().toISOString();
    status = 'queued';
  } else if (when === 'schedule') {
    scheduledAt = parseTime(req.body.scheduledAt);
    if (!scheduledAt) return fail(400, 'Bitte Datum und Uhrzeit angeben.');
    status = 'queued';
  }

  const item = {
    id: crypto.randomBytes(6).toString('hex'),
    file: req.file.filename,
    originalName: req.file.originalname,
    size: req.file.size,
    hash,
    title: clean(req.body.title).slice(0, 100),
    description: clean(req.body.description),
    tags: clean(req.body.tags),
    platforms,
    steps: stepsFor(platforms),
    scheduledAt,
    status,
    base: `${req.protocol}://${req.get('host')}`,
    createdAt: new Date().toISOString(),
  };
  queue.add(item);
  kick();
  res.json(queue.view(item));
});

app.get('/api/queue', (req, res) => {
  const s = settings.get();
  const ds = drafts();
  const etas = s.enabled && s.slots.length ? upcoming(s.slots, new Date(), ds.length) : [];
  const eta = new Map(ds.map((d, i) => [d.id, etas[i]?.toISOString()]));
  res.json(queue.all().map(i => (eta.has(i.id) ? { ...i, eta: eta.get(i.id) } : i)));
});

app.get('/api/settings', (req, res) => res.json(settings.user()));

app.put('/api/settings', (req, res) => {
  const r = settings.validate(req.body || {});
  if (r.error) return res.status(400).json({ error: r.error });
  settings.update(r.value);
  // Beim Speichern gilt der Plan ab jetzt – vergangene Termine von heute werden nicht rückwirkend ausgelöst
  if (r.value.enabled) settings.setState({ lastHandled: new Date().toISOString(), lowNotified: null });
  checkStock();
  res.json(settings.user());
});

app.get('/api/status', (req, res) => {
  const s = settings.get();
  const count = drafts().length;
  const next = s.enabled && s.slots.length ? upcoming(s.slots, new Date(), 1)[0] : null;
  res.json({
    enabled: s.enabled,
    stock: count,
    lowStock: s.lowStock,
    low: s.enabled && count <= s.lowStock,
    next: next ? next.toISOString() : null,
    runwayEnd: runway(count)?.toISOString() || null,
    notifyConfigured: !!process.env.NTFY_TOPIC,
    igToken: igToken.info(),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  });
});

app.post('/api/notify-test', async (req, res) => {
  res.json(await notify({ title: 'TourPost', message: 'Testnachricht: Benachrichtigungen funktionieren.', tags: ['white_check_mark'] }));
});

app.get('/api/log', (req, res) => {
  res.json(log.all().reverse().slice(0, 50).map(({ hash, ...rest }) => rest));
});

app.get('/api/queue/:id', (req, res) => {
  const item = queue.find(req.params.id);
  if (!item) return res.status(404).json({ error: 'Video nicht gefunden.' });
  res.json(queue.view(item));
});

app.patch('/api/queue/:id', (req, res) => {
  const item = queue.find(req.params.id);
  if (!item) return res.status(404).json({ error: 'Video nicht gefunden.' });
  if (item.status === 'running' || item.status === 'done') {
    return res.status(409).json({ error: 'Dieses Video kann nicht mehr geändert werden.' });
  }

  const b = req.body || {};
  let platforms = null;
  if ('platforms' in b) {
    platforms = cleanPlatforms(b.platforms);
    if (!platforms.length) return res.status(400).json({ error: 'Keine gültige Plattform gewählt.' });
  }
  let scheduledAt = null;
  if (b.when === 'schedule') {
    scheduledAt = parseTime(b.scheduledAt);
    if (!scheduledAt) return res.status(400).json({ error: 'Bitte Datum und Uhrzeit angeben.' });
  }

  if ('title' in b) item.title = clean(b.title).slice(0, 100);
  if ('description' in b) item.description = clean(b.description);
  if ('tags' in b) item.tags = clean(b.tags);
  if (platforms) {
    item.platforms = platforms;
    item.steps = stepsFor(platforms, item.steps);
  }
  if (b.when === 'now') {
    item.scheduledAt = new Date().toISOString();
    item.status = 'queued';
  } else if (b.when === 'schedule') {
    item.scheduledAt = scheduledAt;
    item.status = 'queued';
  } else if (b.when === 'draft') {
    item.scheduledAt = null;
    item.status = 'draft';
  }
  // beim erneuten Einplanen nur die fehlgeschlagenen Plattformen wiederholen
  if (item.status === 'queued') {
    for (const step of Object.values(item.steps)) {
      if (step.state === 'error') { step.state = 'waiting'; step.text = 'Wartet …'; delete step.interrupted; }
    }
  }

  queue.save();
  kick();
  res.json(queue.view(item));
});

app.delete('/api/queue/:id', (req, res) => {
  const item = queue.find(req.params.id);
  if (!item) return res.status(404).json({ error: 'Video nicht gefunden.' });
  if (item.status === 'running') return res.status(409).json({ error: 'Das Video wird gerade veröffentlicht.' });
  queue.remove(item.id);
  fs.unlink(path.join(UPLOAD_DIR, item.file), () => {});
  res.json({ ok: true });
});

app.use((err, req, res, next) => {
  if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: `Datei zu groß (max. ${MAX_MB} MB).` });
  console.error(err);
  res.status(500).json({ error: 'Serverfehler.' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Läuft auf http://localhost:${PORT} (Instagram-Modus: ${process.env.IG_MODE === 'live' ? 'LIVE' : 'Test'})`);
  media.start(UPLOAD_DIR, Number(process.env.MEDIA_PORT) || 3001);
  tunnel.start(Number(process.env.MEDIA_PORT) || 3001);
  igToken.start();
  setInterval(() => { autopilot(); tick(); }, TICK_MS);
  kick();
});
