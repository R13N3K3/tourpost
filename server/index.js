const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { publishReel } = require('./instagram');

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

const PUBLISHERS = { instagram: publishReel };
const jobs = new Map();

const app = express();
app.use(express.static(path.join(__dirname, '..', 'public')));
// Instagram muss das Video über diese öffentliche URL abholen können
app.use('/media', express.static(UPLOAD_DIR));

app.post('/api/publish', upload.single('video'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Bitte eine Videodatei auswählen.' });

  const platforms = [].concat(req.body.platforms || []).filter(p => PUBLISHERS[p]);
  if (!platforms.length) return res.status(400).json({ error: 'Keine gültige Plattform gewählt.' });

  const caption = [req.body.caption, req.body.tags].map(s => (s || '').trim()).filter(Boolean).join('\n\n');
  const base = process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get('host')}`;
  const videoUrl = `${base}/media/${req.file.filename}`;

  const id = crypto.randomBytes(6).toString('hex');
  const job = { id, state: 'running', status: 'Wird gestartet …', results: {} };
  jobs.set(id, job);
  res.json({ jobId: id });

  (async () => {
    try {
      for (const p of platforms) {
        job.results[p] = await PUBLISHERS[p]({
          videoUrl, caption, onStatus: s => { job.status = s; },
        });
      }
      job.state = 'done';
      job.status = 'Veröffentlicht.';
    } catch (err) {
      console.error(err);
      job.state = 'error';
      job.status = err.message;
    } finally {
      fs.unlink(req.file.path, () => {});
    }
  })();
});

app.get('/api/jobs/:id', (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) return res.status(404).json({ error: 'Unbekannter Auftrag.' });
  res.json(job);
});

app.use((err, req, res, next) => {
  if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: `Datei zu groß (max. ${MAX_MB} MB).` });
  console.error(err);
  res.status(500).json({ error: 'Serverfehler.' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Läuft auf http://localhost:${PORT} (Instagram-Modus: ${process.env.IG_MODE === 'live' ? 'LIVE' : 'Test'})`);
});
