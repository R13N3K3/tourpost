// Zentrale Liste aller Subseiten – neue Seiten einfach hier ergänzen.
// "soon: true" zeigt die Seite im Menü als "Bald verfügbar" an.
const PAGES = [
  {
    href: 'index.html',
    label: 'Start',
    nav: true,
    icon: '<path d="M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  },
  {
    href: 'video.html',
    label: 'Videos',
    title: 'Video verteilen',
    desc: 'Video auswählen und an Instagram & Co. senden',
    nav: true,
    icon: '<rect x="2" y="6" width="14" height="12" rx="2"/><path d="M16 10l6-3v10l-6-3z"/>',
  },
  {
    href: 'vorrat.html',
    label: 'Vorrat',
    title: 'Vorrat & Planung',
    desc: 'Geplante Videos ansehen und ändern',
    nav: true,
    icon: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  },
  {
    href: 'touren.html',
    label: 'Touren',
    title: 'Touren',
    desc: 'Kundenansicht für gebuchte Touren',
    nav: true,
    soon: true,
    icon: '<path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/>',
  },
];

function svg(paths) {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
    stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
}

function renderBottomNav() {
  const current = location.pathname.split('/').pop() || 'index.html';
  const nav = document.createElement('nav');
  nav.className = 'bottom-nav';
  nav.innerHTML = PAGES.filter(p => p.nav).map(p => `
    <a href="${p.href}" class="${p.href === current ? 'active' : ''}">
      ${svg(p.icon)}<span>${p.label}</span>
    </a>`).join('');
  document.body.appendChild(nav);
}

function renderMenuGrid(container) {
  container.innerHTML = PAGES.filter(p => p.desc).map(p => `
    <a href="${p.href}" class="tile">
      <div class="icon">${svg(p.icon)}</div>
      <h3>${p.title}</h3>
      ${p.soon ? '<span class="badge">Bald verfügbar</span>' : ''}
      <p>${p.desc}</p>
    </a>`).join('');
}

// Nur über den Fernzugriff (mit Login) gibt es diese Schnittstelle: dann erscheint oben „Abmelden"
async function renderLogout() {
  const bar = document.querySelector('.topbar');
  if (!bar) return;
  try {
    if (!(await fetch('/api/remote/me')).ok) return;
  } catch { return; }
  const btn = document.createElement('button');
  btn.className = 'logout';
  btn.textContent = 'Abmelden';
  btn.addEventListener('click', async () => {
    await fetch('/api/remote/logout', { method: 'POST' });
    location.replace('/login');
  });
  bar.appendChild(btn);
}

document.addEventListener('DOMContentLoaded', () => {
  renderBottomNav();
  renderLogout();
  const grid = document.querySelector('[data-menu-grid]');
  if (grid) renderMenuGrid(grid);
});

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
