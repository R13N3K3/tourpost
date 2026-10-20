// Holt einmalig das YouTube-Refresh-Token und trägt es in die .env ein.
// Aufruf: npm run youtube-auth   (YT_CLIENT_ID und YT_CLIENT_SECRET müssen in der .env stehen)
// Der Anmeldelink wird im Browser auf DIESEM Rechner geöffnet (Rückkehr an 127.0.0.1).
const fs = require('fs');
const path = require('path');
const http = require('http');

const ENV = path.join(__dirname, '..', '.env');
const PORT = 53682;
const REDIRECT = `http://127.0.0.1:${PORT}`;

function readEnv() {
  const env = {};
  for (const line of fs.existsSync(ENV) ? fs.readFileSync(ENV, 'utf8').split('\n') : []) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (m) env[m[1]] = m[2];
  }
  return env;
}

function setEnv(key, value) {
  let text = fs.existsSync(ENV) ? fs.readFileSync(ENV, 'utf8') : '';
  const re = new RegExp(`^${key}=.*$`, 'm');
  text = re.test(text) ? text.replace(re, () => `${key}=${value}`) : text.replace(/\n?$/, `\n${key}=${value}\n`);
  fs.writeFileSync(ENV, text);
}

const env = readEnv();
if (!env.YT_CLIENT_ID || !env.YT_CLIENT_SECRET) {
  console.error('YT_CLIENT_ID und YT_CLIENT_SECRET fehlen in der .env – siehe README (YouTube).');
  process.exit(1);
}

const authUrl = 'https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams({
  client_id: env.YT_CLIENT_ID,
  redirect_uri: REDIRECT,
  response_type: 'code',
  scope: 'https://www.googleapis.com/auth/youtube.upload',
  access_type: 'offline',
  prompt: 'consent',
});

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, REDIRECT);
  const code = url.searchParams.get('code');
  const error = url.searchParams.get('error');
  if (!code && !error) { res.writeHead(404).end(); return; }
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  try {
    if (error) throw new Error(error);
    const r = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      body: new URLSearchParams({
        code, client_id: env.YT_CLIENT_ID, client_secret: env.YT_CLIENT_SECRET,
        redirect_uri: REDIRECT, grant_type: 'authorization_code',
      }),
    });
    const j = await r.json();
    if (!j.refresh_token) throw new Error(j.error_description || j.error || 'Kein Refresh-Token erhalten');
    setEnv('YT_REFRESH_TOKEN', j.refresh_token);
    res.end('<h2>Fertig ✓</h2><p>Das Token steht in der .env. Du kannst dieses Fenster schließen.</p>');
    console.log('\n✓ YT_REFRESH_TOKEN wurde in die .env geschrieben. Server neu starten.');
    server.close();
  } catch (e) {
    res.end(`<h2>Fehlgeschlagen</h2><p>${String(e.message).replace(/</g, '&lt;')}</p>`);
    console.error('\nFehlgeschlagen:', e.message);
    server.close();
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log('Diesen Link im Browser auf diesem Rechner öffnen und bei Google anmelden:\n');
  console.log(authUrl + '\n');
  console.log('Warte auf die Anmeldung … (Abbruch mit Strg+C)');
});
