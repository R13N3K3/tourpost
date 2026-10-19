const form = document.getElementById('form');
const fileInput = document.getElementById('file');
const dropzone = document.getElementById('dropzone');
const dropInner = document.getElementById('dropInner');
const submitBtn = document.getElementById('submit');
const statusEl = document.getElementById('status');
const bar = document.getElementById('bar');
const progress = document.getElementById('progress');

let selectedFile = null;

function setStatus(text, type = '') {
  statusEl.textContent = text;
  statusEl.className = 'status ' + type;
}

function setProgress(pct) {
  progress.classList.toggle('active', pct !== null);
  if (pct !== null) bar.style.width = pct + '%';
}

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
    xhr.open('POST', '/api/publish');
    xhr.upload.onprogress = e => {
      if (e.lengthComputable) {
        setProgress(Math.round((e.loaded / e.total) * 100));
        setStatus(`Video wird hochgeladen … ${Math.round((e.loaded / e.total) * 100)} %`);
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

async function waitForJob(jobId) {
  for (;;) {
    const res = await fetch(`/api/jobs/${jobId}`);
    const job = await res.json();
    if (job.state === 'done') return job;
    if (job.state === 'error') throw new Error(job.status);
    setStatus(job.status);
    await new Promise(r => setTimeout(r, 2000));
  }
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!selectedFile) return setStatus('Bitte zuerst ein Video auswählen.', 'error');

  const chosen = [...form.querySelectorAll('input[name=platform]:checked')].map(i => i.value);
  if (!chosen.length) return setStatus('Bitte mindestens eine Plattform wählen.', 'error');

  const data = new FormData();
  data.append('video', selectedFile);
  data.append('caption', document.getElementById('title').value);
  data.append('tags', document.getElementById('tags').value);
  chosen.forEach(p => data.append('platforms', p));

  submitBtn.disabled = true;
  try {
    setProgress(0);
    const { jobId } = await upload(data);
    setProgress(null);
    setStatus('Wird verarbeitet …');
    await waitForJob(jobId);
    setStatus('Veröffentlicht ✓', 'ok');
  } catch (err) {
    setProgress(null);
    setStatus(err.message, 'error');
  } finally {
    submitBtn.disabled = false;
  }
});
