const listEl = document.getElementById('list');
const emptyEl = document.getElementById('empty');
const errorEl = document.getElementById('error');
const logEl = document.getElementById('log');

const PLATFORMS = { instagram: 'Instagram Reel', youtube: 'YouTube Short', tiktok: 'TikTok' };
const STATUS = {
  draft: ['Im Vorrat', ''], queued: ['Geplant', 'info'], running: ['Läuft', 'warn'],
  done: ['Fertig', 'ok'], error: ['Fehler', 'err'],
};
const RANK = { running: 0, queued: 1, error: 2, draft: 3, done: 4 };
const ICONS = { waiting: '…', running: '⏳', done: '✓', error: '✗' };

let items = [];
let editing = null;   // ID des Videos, das gerade bearbeitet wird

const esc = s => { const d = document.createElement('div'); d.textContent = s ?? ''; return d.innerHTML; };
const fmt = iso => iso
  ? new Date(iso).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' })
  : 'kein Termin';

// ISO-Zeit → Wert für <input type="datetime-local"> in der Ortszeit des Handys
function toLocalInput(iso) {
  const d = iso ? new Date(iso) : new Date(Date.now() + 3600e3);
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function sorted() {
  return [...items].sort((a, b) =>
    RANK[a.status] - RANK[b.status] ||
    (a.status === 'done' ? (b.finishedAt || '').localeCompare(a.finishedAt || '')
                         : (a.scheduledAt || '9').localeCompare(b.scheduledAt || '9')));
}

function editForm(it) {
  const when = it.status === 'draft' ? 'draft' : 'schedule';
  return `
    <form class="edit-form" data-id="${it.id}">
      <div class="field"><label>Titel</label>
        <input type="text" name="title" maxlength="100" value="${esc(it.title)}"></div>
      <div class="field"><label>Beschreibung</label>
        <textarea name="description">${esc(it.description)}</textarea></div>
      <div class="field"><label>Hashtags</label>
        <input type="text" name="tags" value="${esc(it.tags)}"></div>
      <div class="field"><label>Plattformen</label>
        <div class="platforms">
          ${Object.entries(PLATFORMS).map(([k, n]) => `
            <label class="platform"><input type="checkbox" name="platform" value="${k}"
              ${it.platforms.includes(k) ? 'checked' : ''}><span class="name">${n}</span></label>`).join('')}
        </div></div>
      <div class="field"><label>Wann veröffentlichen?</label>
        <select name="when">
          <option value="schedule" ${when === 'schedule' ? 'selected' : ''}>Zu einem Zeitpunkt</option>
          <option value="draft" ${when === 'draft' ? 'selected' : ''}>Im Vorrat lassen (Wochenplan)</option>
        </select></div>
      <div class="field ${when === 'draft' ? 'hidden' : ''}" data-when-box><label>Datum und Uhrzeit</label>
        <input type="datetime-local" name="scheduledAt" value="${toLocalInput(it.scheduledAt)}"></div>
      <div class="actions">
        <button type="submit" class="btn small">Speichern</button>
        <button type="button" class="btn small ghost" data-action="cancel">Abbrechen</button>
      </div>
    </form>`;
}

function card(it) {
  const [label, cls] = STATUS[it.status];
  const steps = Object.values(it.steps).map(s =>
    `<div class="${s.state === 'error' ? 'err' : ''}">${ICONS[s.state]} ${esc(s.name)}: ${esc(s.text)}</div>`).join('');
  const warns = (it.warnings || []).map(w => `<div class="warn">⚠ ${esc(w)}</div>`).join('');
  const editable = it.status !== 'running' && it.status !== 'done';
  const when = it.status === 'done' ? `Veröffentlicht ${fmt(it.finishedAt)}`
    : it.status === 'draft' ? (it.eta ? `Voraussichtlich ${fmt(it.eta)}` : 'Wartet auf den Wochenplan') : fmt(it.scheduledAt);

  return `
    <article class="card item" data-id="${it.id}">
      <div class="item-head">
        <div>
          <div class="item-title">${esc(it.title || it.originalName)}</div>
          <div class="item-meta">${when} · ${it.platforms.map(p => PLATFORMS[p]).join(', ')}</div>
        </div>
        <span class="pill ${cls}">${label}</span>
      </div>
      <div class="steps">${steps}${warns}</div>
      ${editing === it.id ? editForm(it) : `
        <div class="actions">
          ${editable ? `<button class="btn small ghost" data-action="edit" data-id="${it.id}">Bearbeiten</button>` : ''}
          ${editable ? `<button class="btn small" data-action="now" data-id="${it.id}">${it.status === 'error' ? 'Erneut versuchen' : 'Jetzt posten'}</button>` : ''}
          ${it.status !== 'running' ? `<button class="btn small danger" data-action="delete" data-id="${it.id}">Löschen</button>` : ''}
        </div>`}
    </article>`;
}

function render() {
  listEl.innerHTML = sorted().map(card).join('');
  emptyEl.classList.toggle('hidden', items.length > 0);
}

async function api(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Fehler beim Speichern.');
  return data;
}

async function loadLog() {
  try {
    const entries = await api('GET', '/api/log');
    logEl.innerHTML = entries.length ? entries.map(e => `
      <li>
        <span>${e.status === 'done' ? '✓' : '✗'} ${esc(e.title || 'Ohne Titel')} · ${esc(PLATFORMS[e.platform] || e.platform)}${e.test ? ' (Test)' : ''}
          ${e.status === 'error' ? `<br><span class="meta">${esc(e.error)}</span>` : ''}</span>
        <span class="meta">${fmt(e.time)}</span>
      </li>`).join('') : '<li><span class="meta">Noch keine Einträge.</span></li>';
  } catch {}
}

async function load() {
  loadLog();
  try {
    items = await api('GET', '/api/queue');
    errorEl.textContent = '';
    if (!editing) render();
  } catch (err) {
    errorEl.textContent = 'Server nicht erreichbar.';
  }
}

listEl.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const id = btn.dataset.id || btn.closest('[data-id]')?.dataset.id;
  try {
    if (btn.dataset.action === 'edit') { editing = id; render(); return; }
    if (btn.dataset.action === 'cancel') { editing = null; render(); return; }
    if (btn.dataset.action === 'now') {
      // nach einem Absturz ist unklar, ob schon gepostet wurde – nicht blind wiederholen
      const it = items.find(x => x.id === id);
      const unsure = Object.values(it.steps).some(s => s.interrupted);
      if (unsure && !confirm('Der Vorgang wurde unterbrochen. Prüfe zuerst in der App, ob das Video schon online ist. Trotzdem erneut senden?')) return;
      await api('PATCH', `/api/queue/${id}`, { when: 'now' });
    }
    if (btn.dataset.action === 'delete') {
      if (!confirm('Dieses Video wirklich aus dem Vorrat löschen?')) return;
      await api('DELETE', `/api/queue/${id}`);
    }
    await load();
  } catch (err) {
    errorEl.textContent = err.message;
  }
});

listEl.addEventListener('change', (e) => {
  if (e.target.name !== 'when') return;
  e.target.closest('form').querySelector('[data-when-box]').classList.toggle('hidden', e.target.value === 'draft');
});

listEl.addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const f = new FormData(form);
  const when = f.get('when');
  const body = {
    title: f.get('title'),
    description: f.get('description'),
    tags: f.get('tags'),
    platforms: f.getAll('platform'),
    when,
  };
  if (when === 'schedule') {
    if (!f.get('scheduledAt')) { errorEl.textContent = 'Bitte Datum und Uhrzeit angeben.'; return; }
    body.scheduledAt = new Date(f.get('scheduledAt')).toISOString();   // Ortszeit → UTC
  }
  try {
    await api('PATCH', `/api/queue/${form.dataset.id}`, body);
    editing = null;
    errorEl.textContent = '';
    await load();
  } catch (err) {
    errorEl.textContent = err.message;
  }
});

load();
// laufende und geplante Videos regelmäßig aktualisieren, aber keine Eingabe überschreiben
setInterval(() => { if (!editing) load(); }, 5000);


// ---------- Wochenplan ----------
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
const DAY_NAMES = { 1: 'Montags', 2: 'Dienstags', 3: 'Mittwochs', 4: 'Donnerstags', 5: 'Freitags', 6: 'Samstags', 0: 'Sonntags' };
const daysEl = document.getElementById('days');
const planForm = document.getElementById('planForm');
const enabledEl = document.getElementById('enabled');
const lowStockEl = document.getElementById('lowStock');
const planStatus = document.getElementById('planStatus');
const stockInfo = document.getElementById('stockInfo');
const banner = document.getElementById('banner');

function setPlanStatus(text, type = '') {
  planStatus.textContent = text;
  planStatus.className = 'status ' + type;
}

function renderDays(slots) {
  daysEl.innerHTML = DAY_ORDER.map(d => {
    const slot = slots.find(x => x.day === d);
    return `
      <div class="day">
        <label><input type="checkbox" data-day="${d}" ${slot ? 'checked' : ''}><span>${DAY_NAMES[d]}</span></label>
        <input type="time" data-time="${d}" value="${slot ? slot.time : '12:00'}" ${slot ? '' : 'disabled'}>
      </div>`;
  }).join('');
}

daysEl.addEventListener('change', (e) => {
  if (e.target.dataset.day === undefined) return;
  daysEl.querySelector(`[data-time="${e.target.dataset.day}"]`).disabled = !e.target.checked;
});

async function loadPlan() {
  try {
    const s = await api('GET', '/api/settings');
    enabledEl.checked = s.enabled;
    lowStockEl.value = s.lowStock;
    renderDays(s.slots);
  } catch {
    setPlanStatus('Einstellungen konnten nicht geladen werden.', 'error');
  }
}

async function loadStatus() {
  try {
    const st = await api('GET', '/api/status');
    const n = st.stock;
    const parts = [`Im Vorrat: ${n} ${n === 1 ? 'Video' : 'Videos'}`];
    if (st.next) parts.push(`nächster Termin: ${fmt(st.next)}`);
    if (st.runwayEnd) parts.push(`reicht bis ${fmt(st.runwayEnd)}`);
    stockInfo.textContent = parts.join(' · ') + (st.enabled ? '' : ' · Wochenplan ist aus');

    banner.classList.toggle('hidden', !st.low);
    if (st.low) {
      banner.textContent = (n === 0 ? 'Der Vorrat ist leer.' : `Nur noch ${n} ${n === 1 ? 'Video' : 'Videos'} im Vorrat.`)
        + ' Bitte neue Videos hinzufügen.'
        + (st.notifyConfigured ? '' : ' Push-Nachrichten sind noch nicht eingerichtet (NTFY_TOPIC in der .env).');
    }
    document.getElementById('tzInfo').textContent = `Zeiten gelten in der Zeitzone des Servers (${st.timezone}).`;
  } catch {}
}

planForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const slots = [...daysEl.querySelectorAll('[data-day]')].filter(c => c.checked).map(c => ({
    day: Number(c.dataset.day),
    time: daysEl.querySelector(`[data-time="${c.dataset.day}"]`).value,
  }));
  try {
    await api('PUT', '/api/settings', { enabled: enabledEl.checked, slots, lowStock: Number(lowStockEl.value) });
    setPlanStatus('Gespeichert ✓', 'ok');
    await Promise.all([loadPlan(), loadStatus(), load()]);
  } catch (err) {
    setPlanStatus(err.message, 'error');
  }
});

document.getElementById('notifyTest').addEventListener('click', async () => {
  try {
    const r = await api('POST', '/api/notify-test');
    setPlanStatus(r.sent ? 'Testnachricht gesendet ✓' : `Nicht gesendet: ${r.reason}`, r.sent ? 'ok' : 'error');
  } catch (err) {
    setPlanStatus(err.message, 'error');
  }
});

loadPlan();
loadStatus();
setInterval(loadStatus, 5000);
