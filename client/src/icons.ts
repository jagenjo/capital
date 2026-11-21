// Small stroke icons (16x16, currentColor) used in the navigation, top bar and settings.
const P: Record<string, string> = {
  map: '<path d="M1.5 3.5l4-1.5 5 1.5 4-1.5v10l-4 1.5-5-1.5-4 1.5z"/><path d="M5.5 2v10.5M10.5 3.5V14"/>',
  buildings: '<rect x="2.5" y="5" width="6" height="9"/><rect x="8.5" y="2" width="5" height="12"/><path d="M4.5 8h2M4.5 11h2M10.5 5h1M10.5 8h1M10.5 11h1"/>',
  chain: '<circle cx="3.5" cy="8" r="2"/><circle cx="12.5" cy="3.5" r="2"/><circle cx="12.5" cy="12.5" r="2"/><path d="M5.3 7l5.4-2.5M5.3 9l5.4 2.5"/>',
  market: '<path d="M2 6l1.5-3.5h9L14 6M2 6v1a2 2 0 004 0 2 2 0 004 0 2 2 0 004 0V6M3 9.5V14h10V9.5"/>',
  finance: '<circle cx="8" cy="8" r="6"/><path d="M8 4v8M10 6c-.4-.7-1.1-1-2-1-1.1 0-2 .5-2 1.4 0 1.9 4 1 4 2.9 0 .9-.9 1.3-2 1.3-.9 0-1.7-.3-2.1-1"/>',
  analytics: '<path d="M8 2a6 6 0 106 6H8z"/><path d="M10 1.5A6 6 0 0114.5 6H10z"/>',
  stocks: '<path d="M2 13.5h12M3 10l3-3 2.5 2.5L13 4.5M10 4.5h3v3"/>',
  personnel: '<circle cx="8" cy="5" r="2.6"/><path d="M3 14c0-3.5 2-5 5-5s5 1.5 5 5"/>',
  realestate: '<path d="M2 8l6-5.5L14 8M3.5 7v7h9V7M6.5 14v-4h3v4"/>',
  marketing: '<path d="M2.5 6.5v3h2.5l5 3.5V3L5 6.5zM12.5 6v4"/>',
  rankings: '<path d="M5 2.5h6v4a3 3 0 01-6 0zM5 4H2.5c0 2 1 3 2.5 3M11 4h2.5c0 2-1 3-2.5 3M8 9.5V12M5.5 13.5h5"/>',
  news: '<rect x="2" y="2.5" width="12" height="11" rx="1"/><path d="M4.5 5.5h7M4.5 8h3M9 8h2.5M4.5 10.5h7"/>',
  messages: '<path d="M2 3.5h12v8H8l-3 2.5v-2.5H2z"/>',
  encyclopedia: '<path d="M3 2.5h8a2 2 0 012 2v9H5a2 2 0 01-2-2zM3 11.5a2 2 0 012-2h8"/>',
  radio: '<rect x="2" y="6" width="12" height="8" rx="1.5"/><path d="M4 6l8-3.5M5 10h3M10.5 10h1.5"/>',
  tv: '<rect x="2" y="4" width="12" height="8.5" rx="1.5"/><path d="M5.5 2L8 4l2.5-2M5.5 14.5h5"/>',
  settings: '<circle cx="8" cy="8" r="2.2"/><path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M3.4 12.6l1.4-1.4M11.2 4.8l1.4-1.4"/>',
  clock: '<circle cx="8" cy="8" r="6"/><path d="M8 4.5V8l2.5 1.5"/>',
  cash: '<rect x="2" y="4" width="12" height="9" rx="1.5"/><path d="M2 6.5h12M10.5 9.5H12"/>',
  debt: '<rect x="2" y="3.5" width="12" height="9" rx="1"/><path d="M2 6.5h12M4.5 10h2.5"/>',
  worth: '<path d="M2 13l3.5-4 3 2L14 4M10.5 4H14v3.5"/>',
  globe: '<circle cx="8" cy="8" r="6.5"/><ellipse cx="8" cy="8" rx="3" ry="6.5"/><path d="M1.5 8h13"/>',
  ready: '<path d="M3 8.5l3.2 3.2L13 4.8"/>',
  next: '<path d="M4 3l8 5-8 5z"/>',
  leave: '<path d="M6.5 2.5h-4v11h4M6 8h8M11.5 5.5L14 8l-2.5 2.5"/>',
};
export function icon(name: string): HTMLElement {
  const s = document.createElement('span'); s.className = 'ico';
  s.innerHTML = `<svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${P[name] ?? ''}</svg>`; return s;
}
