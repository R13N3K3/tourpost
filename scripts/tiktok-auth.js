// Holt einmalig das TikTok-Refresh-Token und trägt es in die .env ein.
// Aufruf: npm run tiktok-auth   (TT_CLIENT_KEY, TT_CLIENT_SECRET und TT_REDIRECT_URI müssen in der .env stehen)
// TT_REDIRECT_URI ist eine https-Adresse, die in der TikTok-App als Redirect-URI eingetragen ist.
// Nach der Anmeldung landet der Browser dort (die Seite darf ruhig einen Fehler zeigen). Die komplette
// Adresse aus der Adresszeile wird hier eingefügt.
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const crypto = require('crypto');

const ENV = path.join(__dirname, '..', '.env');
const env = {};
for (const line of fs.existsSync(ENV) ? fs.readFileSync(ENV, 'utf8').split('\n') : []) {
  const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
  if (m) env[m[1]] = m[2];
}
if (!env.TT_CLIENT_KEY || !env.TT_CLIENT_SECRET || !env.TT_REDIRECT_URI) {
  console.error('TT_CLIENT_KEY, TT_CLIENT_SECRET und TT_REDIRECT_URI fehlen in der .env – siehe README (TikTok).');
  process.exit(1);
}

function setEnv(key, value) {
  let text = fs.readFileSync(ENV, 'utf8');
  const re = new RegExp(`^${key}=.*$`, 'm');
  text = re.test(text) ? text.replace(re, () => `${key}=${value}`) : text.replace(/\n?$/, `\n${key}=${value}\n`);
  fs.writeFileSync(ENV, text);
}

const state = crypto.randomBytes(8).toString('hex');
const authUrl = 'https://www.tiktok.com/v2/auth/authorize/?' + new URLSearchParams({
  client_key: env.TT_CLIENT_KEY,
  scope: 'user.info.basic,video.publish',
  response_type: 'code',
  redirect_uri: env.TT_REDIRECT_URI,
  state,
});

console.log('1. Diesen Link im Browser öffnen und bei TikTok anmelden / erlauben:\n');
console.log(authUrl + '\n');
console.log('2. Danach landet der Browser auf deiner Redirect-Adresse (Fehlerseite ist egal).');
console.log('   Die komplette Adresse aus der Adresszeile hier einfügen:\n');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
rl.question('> ', async answer => {
  rl.close();
  try {
    const u = new URL(answer.trim());
    if (u.searchParams.get('state') !== state) throw new Error('Falsche Adresse (state stimmt nicht).');
    const code = u.searchParams.get('code');
    if (!code) throw new Error(u.searchParams.get('error_description') || u.searchParams.get('error') || 'Kein code in der Adresse');
    const r = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_key: env.TT_CLIENT_KEY, client_secret: env.TT_CLIENT_SECRET,
        code, grant_type: 'authorization_code', redirect_uri: env.TT_REDIRECT_URI,
      }),
    });
    const j = await r.json();
    if (!j.refresh_token) throw new Error(j.error_description || j.error || 'Kein Refresh-Token erhalten');
    setEnv('TT_REFRESH_TOKEN', j.refresh_token);
    console.log('\n✓ TT_REFRESH_TOKEN wurde in die .env geschrieben (gültig ca. 365 Tage). Server neu starten.');
  } catch (e) {
    console.error('\nFehlgeschlagen:', e.message);
    process.exit(1);
  }
});
