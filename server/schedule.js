// Wiederkehrende Wochentermine. day: 0 = Sonntag … 6 = Samstag, time: "HH:MM" in der Zeit des Servers.

// letzter Termin dieses Slots, der nicht nach "now" liegt
function lastOccurrence(slot, now) {
  const [h, m] = slot.time.split(':').map(Number);
  const d = new Date(now);
  d.setHours(h, m, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() - slot.day + 7) % 7));
  if (d > now) d.setDate(d.getDate() - 7);
  return d;
}

// die nächsten n Termine nach "from" über alle Slots hinweg, aufsteigend sortiert
function upcoming(slots, from, n) {
  const out = [];
  for (const slot of slots) {
    const d = lastOccurrence(slot, from);
    for (let i = 0; i < n; i++) {
      d.setDate(d.getDate() + 7);
      out.push(new Date(d));
    }
  }
  return out.sort((a, b) => a - b).slice(0, n);
}

module.exports = { lastOccurrence, upcoming };
