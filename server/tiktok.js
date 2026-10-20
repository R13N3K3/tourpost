// TikTok-Modul: Content Posting API.
// TT_MODE=test simuliert alles. Der Live-Upload (OAuth, App-Prüfung) ist noch nicht eingerichtet.
const { sleep } = require('./util');

async function publishTikTok({ caption, onStatus }) {
  if (process.env.TT_MODE !== 'live') {
    onStatus('Testmodus: TikTok wird simuliert …');
    await sleep(1500);
    return { id: 'test-tt-' + Date.now(), test: true };
  }

  void caption;
  throw new Error('TikTok-Live-Upload ist noch nicht eingerichtet (Login und App-Prüfung fehlen).');
}

module.exports = { publishTikTok };
