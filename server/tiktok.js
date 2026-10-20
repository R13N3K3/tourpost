// TikTok-Modul: Content Posting API (Direct Post, FILE_UPLOAD).
// TT_MODE=test simuliert alles. Live braucht TT_CLIENT_KEY, TT_CLIENT_SECRET und TT_REFRESH_TOKEN
// (das Token holt `npm run tiktok-auth`). Ohne bestandenes App-Audit sind alle Videos nur für den
// Autor sichtbar (TT_PRIVACY=SELF_ONLY).
const fs = require('fs');
const { Readable } = require('stream');
const { sleep, setEnvVar } = require('./util');

const API = 'https://open.tiktokapis.com/v2';
const SINGLE_MAX = 64 * 1024 * 1024; // bis 64 MB in einem Stück
const CHUNK = 32 * 1024 * 1024;

async function call(path, token, body) {
  const res = await fetch(API + path, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json; charset=UTF-8' },
    body: JSON.stringify(body || {}),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || (json.error && json.error.code && json.error.code !== 'ok')) {
    const e = json.error || {};
    throw new Error(`TikTok: ${e.message || 'HTTP ' + res.status}${e.code ? ` (${e.code})` : ''}`);
  }
  return json.data || {};
}

// Access-Token (24 h) aus dem Refresh-Token holen. TikTok kann dabei ein neues Refresh-Token ausgeben, das dann gilt.
async function accessToken() {
  const { TT_CLIENT_KEY, TT_CLIENT_SECRET, TT_REFRESH_TOKEN } = process.env;
  if (!TT_CLIENT_KEY || !TT_CLIENT_SECRET || !TT_REFRESH_TOKEN) {
    throw new Error('TT_CLIENT_KEY, TT_CLIENT_SECRET und TT_REFRESH_TOKEN fehlen in der .env (siehe README).');
  }
  const res = await fetch(`${API}/oauth/token/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_key: TT_CLIENT_KEY,
      client_secret: TT_CLIENT_SECRET,
      grant_type: 'refresh_token',
      refresh_token: TT_REFRESH_TOKEN,
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.access_token) {
    throw new Error(`TikTok-Anmeldung fehlgeschlagen: ${json.error_description || json.error || 'HTTP ' + res.status}. Eventuell abgelaufen – `
      + '`npm run tiktok-auth` erneut ausführen.');
  }
  if (json.refresh_token && json.refresh_token !== TT_REFRESH_TOKEN) setEnvVar('TT_REFRESH_TOKEN', json.refresh_token);
  return json.access_token;
}

async function putChunk(url, filePath, start, end, total) {
  const length = end - start + 1;
  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      'Content-Type': 'video/mp4',
      'Content-Length': String(length),
      'Content-Range': `bytes ${start}-${end}/${total}`,
    },
    body: Readable.toWeb(fs.createReadStream(filePath, { start, end })),
    duplex: 'half',
  });
  if (res.status !== 201 && res.status !== 206) {
    throw new Error(`TikTok: Upload abgelehnt (HTTP ${res.status}).`);
  }
}

async function publishTikTok({ filePath, caption, onStatus }) {
  if (process.env.TT_MODE !== 'live') {
    onStatus('Testmodus: TikTok wird simuliert …');
    await sleep(1500);
    return { id: 'test-tt-' + Date.now(), test: true };
  }

  onStatus('Bei TikTok anmelden …');
  const token = await accessToken();

  const privacy = process.env.TT_PRIVACY || 'SELF_ONLY';
  const creator = await call('/post/publish/creator_info/query/', token);
  if (!(creator.privacy_level_options || []).includes(privacy)) {
    throw new Error(`TikTok: Sichtbarkeit ${privacy} ist für dieses Konto nicht erlaubt (erlaubt: ${(creator.privacy_level_options || []).join(', ')}).`);
  }

  const size = fs.statSync(filePath).size;
  const single = size <= SINGLE_MAX;
  const chunkSize = single ? size : CHUNK;
  const count = single ? 1 : Math.floor(size / CHUNK);

  onStatus('Upload zu TikTok wird gestartet …');
  const init = await call('/post/publish/video/init/', token, {
    post_info: { title: (caption || '').slice(0, 2200), privacy_level: privacy },
    source_info: { source: 'FILE_UPLOAD', video_size: size, chunk_size: chunkSize, total_chunk_count: count },
  });

  onStatus(`Video wird zu TikTok hochgeladen (${(size / 1048576).toFixed(1)} MB) …`);
  for (let i = 0; i < count; i++) {
    const start = i * chunkSize;
    const end = i === count - 1 ? size - 1 : start + chunkSize - 1; // letztes Stück nimmt den Rest
    await putChunk(init.upload_url, filePath, start, end, size);
  }

  for (let i = 0; i < 60; i++) {
    const s = await call('/post/publish/status/fetch/', token, { publish_id: init.publish_id });
    if (s.status === 'PUBLISH_COMPLETE') {
      return { id: (s.publicaly_available_post_id && s.publicaly_available_post_id[0]) ? String(s.publicaly_available_post_id[0]) : init.publish_id };
    }
    if (s.status === 'FAILED') throw new Error(`TikTok: Veröffentlichung fehlgeschlagen (${s.fail_reason || 'unbekannt'}).`);
    onStatus('TikTok verarbeitet das Video …');
    await sleep(5000);
  }
  throw new Error('TikTok: Zeitüberschreitung bei der Verarbeitung.');
}

module.exports = { publishTikTok };
