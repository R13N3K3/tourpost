const form = document.getElementById('form');
const fileInput = document.getElementById('file');
const dropzone = document.getElementById('dropzone');
const dropInner = document.getElementById('dropInner');
const submitBtn = document.getElementById('submit');
const statusEl = document.getElementById('status');
const bar = document.getElementById('bar');
const progress = document.getElementById('progress');
const whenSel = document.getElementById('when');
const whenBox = document.getElementById('whenBox');
const scheduledAt = document.getElementById('scheduledAt');

let selectedFile = null;

function setStatus(text, type = '') {
  statusEl.textContent = text;
  statusEl.className = 'status ' + type;
}

function setProgress(pct) {
  progress.classList.toggle('active', pct !== null);
  if (pct !== null) bar.style.width = pct + '%';
}

// Vorschlag für den Termin: in einer Stunde, in Ortszeit
function defaultTime() {
  const d = new Date(Date.now() + 3600e3);
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

whenSel.addEventListener('change', () => {
  whenBox.classList.toggle('hidden', whenSel.value !== 'schedule');
  if (whenSel.value === 'schedule' && !scheduledAt.value) scheduledAt.value = defaultTime();
});

fileInput.addEventListener('change', () => {
  selectedFile = fileInput.files[0] || null;
  if (!selectedFile) return;
  dropzone.classList.add('has-file');
  dropInner.innerHTML = '';
  const v = document.createElement('video');
  v.src = URL.createObjectURL(selectedFile);
  v.controls = true;
  v.playsInline = true;
  v.muted = true;
  dropInner.appendChild(v);
  setStatus(`${selectedFile.name} (${(selectedFile.size / 1048576).toFixed(1)} MB)`);
});

// fetch kennt keinen Upload-Fortschritt, daher XMLHttpRequest
function upload(formData) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/videos');
    xhr.upload.onprogress = e => {
      if (e.lengthComputable) {
        const pct = Math.round((e.loaded / e.total) * 100);
        setProgress(pct);
        setStatus(`Video wird hochgeladen … ${pct} %`);
      }
    };
    xhr.onload = () => {
      let data = {};
      try { data = JSON.parse(xhr.responseText); } catch {}
      xhr.status === 200 ? resolve(data) : reject(new Error(data.error || 'Upload fehlgeschlagen.'));
    };
    xhr.onerror = () => reject(new Error('Server nicht erreichbar.'));
    xhr.send(formData);
  });
}

// Hinweise der Videoprüfung stehen vor dem Ergebnis
const warnText = item => (item.warnings || []).map(w => `⚠ ${w}`).join('\n');
const withWarnings = (item, text) => [warnText(item), text].filter(Boolean).join('\n\n');

const ICONS = { waiting: '…', running: '⏳', done: '✓', error: '✗' };
const stepsText = item => Object.values(item.steps).map(s => `${ICONS[s.state]} ${s.name}: ${s.text}`).join('\n');

async function waitForItem(id) {
  for (;;) {
    const res = await fetch(`/api/queue/${id}`);
    const item = await res.json();
    if (item.status === 'done' || item.status === 'error') return item;
    setStatus(withWarnings(item, stepsText(item)));
    await new Promise(r => setTimeout(r, 2000));
  }
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!selectedFile) return setStatus('Bitte zuerst ein Video auswählen.', 'error');

  const chosen = [...form.querySelectorAll('input[name=platform]:checked')].map(i => i.value);
  if (!chosen.length) return setStatus('Bitte mindestens eine Plattform wählen.', 'error');

  const when = whenSel.value;
  if (when === 'schedule' && !scheduledAt.value) return setStatus('Bitte Datum und Uhrzeit angeben.', 'error');

  const data = new FormData();
  data.append('video', selectedFile);
  data.append('title', document.getElementById('title').value);
  data.append('description', document.getElementById('desc').value);
  data.append('tags', document.getElementById('tags').value);
  data.append('when', when);
  if (when === 'schedule') data.append('scheduledAt', new Date(scheduledAt.value).toISOString());   // Ortszeit → UTC
  chosen.forEach(p => data.append('platforms', p));

  submitBtn.disabled = true;
  try {
    setProgress(0);
    const item = await upload(data);
    setProgress(null);

    if (when === 'now') {
      setStatus('Wird verarbeitet …');
      const done = await waitForItem(item.id);
      setStatus(withWarnings(done, stepsText(done)), done.status === 'done' ? 'ok' : 'error');
    } else {
      const text = when === 'schedule'
        ? `Geplant für ${new Date(item.scheduledAt).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' })} ✓`
        : 'Im Vorrat gespeichert ✓\nWird automatisch nach dem Wochenplan gepostet.';
      setStatus(withWarnings(item, `${text}\nZeiten und Reihenfolge siehst du unter „Vorrat".`), 'ok');
    }
  } catch (err) {
    setProgress(null);
    setStatus(err.message, 'error');
  } finally {
    submitBtn.disabled = false;
  }
});
