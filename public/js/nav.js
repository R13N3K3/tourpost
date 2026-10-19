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
    href: 'touren.html',
    label: 'Touren',
    title: 'Pilztouren',
    desc: 'Kundenansicht für gebuchte Touren',
    nav: true,
    soon: true,
    icon: '<path d="M4 12a8 6 0 0 1 16 0z"/><path d="M10 12v7a2 2 0 0 0 4 0v-7"/>',
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

document.addEventListener('DOMContentLoaded', () => {
  renderBottomNav();
  const grid = document.querySelector('[data-menu-grid]');
  if (grid) renderMenuGrid(grid);
});

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
