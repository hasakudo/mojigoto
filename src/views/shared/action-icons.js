const paths = Object.freeze({
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
  toc: '<path d="M9 5h12M9 12h12M9 19h12"/><circle cx="4" cy="5" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="19" r="1"/>',
  sort: '<path d="M7 3v18m-4-4 4 4 4-4M17 21V3m-4 4 4-4 4 4"/>',
  filter: '<path d="M3 4h18l-7 8v7l-4 2v-9Z"/>',
  bulk: '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="m7 12 3 3 7-7"/>',
  refresh: '<path d="M20 7a9 9 0 1 0 1 8M20 3v5h-5"/>',
  backup: '<path d="M3 11a9 9 0 1 1 3 8M3 5v6h6m3-4v5l3 2"/>',
  todo: '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="m6 8 1 1 2-2m3 1h6m-12 8 1 1 2-2m3 1h6"/>',
  pin: '<path d="m9 3 6 0-1 6 4 4v2H6v-2l4-4Zm3 12v6"/>',
  archive: '<rect x="3" y="3" width="18" height="5" rx="1"/><path d="M5 8v13h14V8m-10 4h6"/>',
  dashboard: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
});

function actionIcon(name, className = "webviewActionIcon") {
  return `<svg class="${className}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${paths[name] || ""}</svg>`;
}

module.exports = { actionIcon };
