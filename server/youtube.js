// YouTube-Modul: lädt ein Video als Short hoch (Data API v3, videos.insert).
// YT_MODE=test simuliert alles. Der Live-Upload (OAuth) ist noch nicht eingerichtet.
const { sleep } = require('./util');

async function publishShort({ title, description, tags, onStatus }) {
  if (!title) throw new Error('YouTube braucht einen Titel.');
  if (title.length > 100) throw new Error('Der YouTube-Titel darf höchstens 100 Zeichen lang sein.');

  if (process.env.YT_MODE !== 'live') {
    onStatus('Testmodus: YouTube wird simuliert …');
    await sleep(1500);
    return { id: 'test-yt-' + Date.now(), test: true };
  }

  // Beschreibung enthält #Shorts, damit YouTube das Video als Short einordnet
  void description; void tags;
  throw new Error('YouTube-Live-Upload ist noch nicht eingerichtet (Google-Login fehlt).');
}

module.exports = { publishShort };
