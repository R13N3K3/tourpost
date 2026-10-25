const text = document.getElementById('text');
const neu = document.getElementById('neu');
const token = location.pathname.split('/').pop();

async function koppeln() {
  neu.hidden = true;
  text.textContent = 'Gerät wird angemeldet …';
  try {
    const res = await fetch('/api/remote/pair', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    });
    if (res.ok) { text.textContent = 'Angemeldet ✓'; location.replace('/'); return; }
    const data = await res.json().catch(() => ({}));
    text.textContent = (data.error || 'Das hat nicht geklappt.') + ' Erzeuge am PC einen neuen QR-Code mit „npm run remote-pair“.';
  } catch {
    text.textContent = 'Keine Verbindung.';
    neu.hidden = false;
  }
}

neu.addEventListener('click', koppeln);
koppeln();
