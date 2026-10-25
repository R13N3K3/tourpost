const form = document.getElementById('form');
const fehler = document.getElementById('fehler');
const senden = document.getElementById('senden');
const password = document.getElementById('password');
const code = document.getElementById('code');
const zeigen = document.getElementById('zeigen');

// Passwort bei Bedarf sichtbar machen (am Handy tippt man sich leicht vertippt)
zeigen.addEventListener('click', () => {
  const sichtbar = password.type === 'password';
  password.type = sichtbar ? 'text' : 'password';
  zeigen.textContent = sichtbar ? 'Verbergen' : 'Anzeigen';
  zeigen.setAttribute('aria-pressed', String(sichtbar));
  password.focus();
});

// Enter im Passwortfeld springt zum Code
password.addEventListener('keydown', e => {
  if (e.key === 'Enter') { e.preventDefault(); code.focus(); }
});

// Nur Ziffern im Code (Leerzeichen aus der App-Anzeige „123 456“ stören nicht). Sind 6 Ziffern da, geht es von allein los.
code.addEventListener('input', () => {
  code.value = code.value.replace(/\D/g, '').slice(0, 6);
  if (code.value.length === 6 && password.value && !senden.disabled) form.requestSubmit();
});

form.addEventListener('submit', async e => {
  e.preventDefault();
  fehler.hidden = true;
  senden.disabled = true;
  try {
    const res = await fetch('/api/remote/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: password.value, code: code.value.replace(/\D/g, ''), remember: document.getElementById('remember').checked }),
    });
    if (res.ok) { location.replace('/'); return; }
    const data = await res.json().catch(() => ({}));
    fehler.textContent = data.error || 'Anmeldung fehlgeschlagen.';
    fehler.hidden = false;
    code.value = '';
    code.focus();
  } catch {
    fehler.textContent = 'Keine Verbindung.';
    fehler.hidden = false;
  } finally {
    senden.disabled = false;
  }
});
