// Medienserver: liefert NUR die Videodateien aus (/media/<zufälliger-Name>), sonst nichts.
// Nur dieser Port wird durch den Tunnel (z. B. Cloudflare) ins Internet gestellt, die App bleibt im Heimnetz.
const express = require('express');
const path = require('path');

const NAME = /^[0-9a-f]{24}\.[a-z0-9]{2,5}$/;

function start(uploadDir, port) {
  const app = express();
  app.disable('x-powered-by');
  app.get('/media/:file', (req, res) => {
    if (!NAME.test(req.params.file)) return res.status(404).end();
    res.sendFile(path.join(uploadDir, req.params.file), { dotfiles: 'deny', acceptRanges: true }, err => {
      if (err && !res.headersSent) res.status(404).end();
    });
  });
  app.use((req, res) => res.status(404).end());
  // nur lokal: der Tunnel läuft auf demselben Rechner
  return app.listen(port, '127.0.0.1', () => console.log(`Medienserver auf http://127.0.0.1:${port}/media/… (für den Tunnel)`));
}

module.exports = { start };
