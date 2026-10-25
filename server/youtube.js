// YouTube-Modul: lädt ein Video als Short hoch (Data API v3, videos.insert, resumable).
// YT_MODE=test simuliert alles. Live braucht YT_CLIENT_ID, YT_CLIENT_SECRET und YT_REFRESH_TOKEN
// (das Token holt `npm run youtube-auth`).
const fs = require('fs');
const { Readable } = require('stream');
const { sleep } = require('./util');

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const UPLOAD_URL = 'https://www.googleapis.com/upload/youtube/v3/videos';

async function accessToken() {
  const { YT_CLIENT_ID, YT_CLIENT_SECRET, YT_REFRESH_TOKEN } = process.env;
  if (!YT_CLIENT_ID || !YT_CLIENT_SECRET || !YT_REFRESH_TOKEN) {
    throw new Error('YT_CLIENT_ID, YT_CLIENT_SECRET und YT_REFRESH_TOKEN fehlen in der .env (siehe README).');
  }
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    body: new URLSearchParams({
      client_id: YT_CLIENT_ID,
      client_secret: YT_CLIENT_SECRET,
      refresh_token: YT_REFRESH_TOKEN,
      grant_type: 'refresh_token',
    }),
  });
  const json = await res.json();
  if (!res.ok) {
    const hint = json.error === 'invalid_grant'
      ? ' Das Token ist abgelaufen oder widerrufen – `npm run youtube-auth` erneut ausführen.'
      : '';
    throw new Error(`Google-Anmeldung fehlgeschlagen: ${json.error_description || json.error}.${hint}`);
  }
  return json.access_token;
}

async function apiError(res) {
  let msg = `HTTP ${res.status}`;
  try {
    const j = await res.json();
    msg = j.error?.errors?.[0]?.reason ? `${j.error.message} (${j.error.errors[0].reason})` : (j.error?.message || msg);
  } catch { /* keine JSON-Antwort */ }
  return new Error('YouTube: ' + msg);
}

async function publishShort({ filePath, title, description, tags, onStatus, test }) {
  if (!title) throw new Error('YouTube braucht einen Titel.');
  if (title.length > 100) throw new Error('Der YouTube-Titel darf höchstens 100 Zeichen lang sein.');

  if (test || process.env.YT_MODE !== 'live') {
    onStatus('Testmodus: YouTube wird simuliert …');
    await sleep(1500);
    return { id: 'test-yt-' + Date.now(), test: true };
  }

  onStatus('Bei Google anmelden …');
  const token = await accessToken();

  // #Shorts in der Beschreibung hilft YouTube, das Video als Short einzuordnen
  const text = [description, tags, '#Shorts'].filter(Boolean).join('\n\n');
  const size = fs.statSync(filePath).size;

  onStatus('Upload zu YouTube wird gestartet …');
  const init = await fetch(`${UPLOAD_URL}?uploadType=resumable&part=snippet,status`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json; charset=UTF-8',
      'X-Upload-Content-Type': 'video/*',
      'X-Upload-Content-Length': String(size),
    },
    body: JSON.stringify({
      snippet: { title, description: text, categoryId: '22' },
      status: {
        privacyStatus: process.env.YT_PRIVACY || 'public',
        selfDeclaredMadeForKids: false,
      },
    }),
  });
  if (!init.ok) throw await apiError(init);
  const location = init.headers.get('location');
  if (!location) throw new Error('YouTube: keine Upload-Adresse erhalten.');

  onStatus(`Video wird zu YouTube hochgeladen (${(size / 1048576).toFixed(1)} MB) …`);
  const up = await fetch(location, {
    method: 'PUT',
    headers: { 'Content-Type': 'video/*', 'Content-Length': String(size) },
    body: Readable.toWeb(fs.createReadStream(filePath)),
    duplex: 'half',
  });
  if (!up.ok) throw await apiError(up);
  const video = await up.json();
  if (!video.id) throw new Error('YouTube: Upload ohne Video-ID beantwortet.');
  return { id: video.id };
}

module.exports = { publishShort };
