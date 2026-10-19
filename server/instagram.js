// Instagram-Modul: veröffentlicht ein Video als Reel über die Instagram Graph API.
// IG_MODE=test simuliert alles, ohne etwas zu posten.
const GRAPH = 'https://graph.facebook.com/v21.0';

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function graph(path, { method = 'GET', params = {} } = {}) {
  const url = new URL(GRAPH + path);
  const body = new URLSearchParams({ ...params, access_token: process.env.IG_ACCESS_TOKEN });
  const res = method === 'GET'
    ? await fetch(url + '?' + body)
    : await fetch(url, { method, body });
  const json = await res.json();
  if (json.error) throw new Error(json.error.message);
  return json;
}

async function publishReel({ videoUrl, caption, onStatus }) {
  if (process.env.IG_MODE !== 'live') {
    onStatus('Testmodus: Instagram wird simuliert …');
    await sleep(1500);
    return { id: 'test-' + Date.now(), test: true };
  }

  const userId = process.env.IG_USER_ID;
  if (!userId || !process.env.IG_ACCESS_TOKEN) {
    throw new Error('IG_USER_ID und IG_ACCESS_TOKEN fehlen in der .env');
  }

  onStatus('Instagram holt das Video ab …');
  const container = await graph(`/${userId}/media`, {
    method: 'POST',
    params: { media_type: 'REELS', video_url: videoUrl, caption },
  });

  // Instagram verarbeitet das Video asynchron – bis zu ~5 Minuten warten
  for (let i = 0; i < 60; i++) {
    const { status_code } = await graph(`/${container.id}`, { params: { fields: 'status_code' } });
    if (status_code === 'FINISHED') break;
    if (status_code === 'ERROR' || status_code === 'EXPIRED') {
      throw new Error('Instagram konnte das Video nicht verarbeiten.');
    }
    onStatus('Instagram verarbeitet das Video …');
    await sleep(5000);
    if (i === 59) throw new Error('Zeitüberschreitung bei der Videoverarbeitung.');
  }

  onStatus('Wird veröffentlicht …');
  return graph(`/${userId}/media_publish`, { method: 'POST', params: { creation_id: container.id } });
}

module.exports = { publishReel };
