// Push-Benachrichtigungen aufs Handy über ntfy (https://ntfy.sh).
// Aktiv, sobald NTFY_TOPIC in der .env gesetzt ist. Optional NTFY_SERVER für einen eigenen ntfy-Server.
async function notify({ title, message, priority = 3, tags = [] }) {
  console.log(`[Benachrichtigung] ${title}: ${message}`);
  const topic = process.env.NTFY_TOPIC;
  if (!topic) return { sent: false, reason: 'NTFY_TOPIC ist nicht gesetzt.' };

  const server = (process.env.NTFY_SERVER || 'https://ntfy.sh').replace(/\/$/, '');
  try {
    // JSON-Variante, damit Umlaute in Titel und Text sicher ankommen
    const res = await fetch(server, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topic, title, message, priority, tags }),
      signal: AbortSignal.timeout(10_000),
    });
    return { sent: res.ok, reason: res.ok ? '' : `ntfy antwortete mit ${res.status}.` };
  } catch (err) {
    return { sent: false, reason: err.message };
  }
}

module.exports = { notify };
