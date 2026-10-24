const form = document.getElementById('form');
const fehler = document.getElementById('fehler');
const senden = document.getElementById('senden');

form.addEventListener('submit', async e => {
  e.preventDefault();
  fehler.hidden = true;
  senden.disabled = true;
  try {
    const res = await fetch('/api/remote/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: form.password.value, code: form.code.value.trim(), remember: form.remember.checked }),
    });
    if (res.ok) { location.replace('/'); return; }
    const data = await res.json().catch(() => ({}));
    fehler.textContent = data.error || 'Anmeldung fehlgeschlagen.';
    fehler.hidden = false;
    form.code.value = '';
  } catch {
    fehler.textContent = 'Keine Verbindung.';
    fehler.hidden = false;
  } finally {
    senden.disabled = false;
  }
});
