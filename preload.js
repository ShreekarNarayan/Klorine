// =============================================================================
//  preload.js — the toolbar's narrow line to main.js
// =============================================================================
//  This small file runs inside the TOOLBAR page only (never inside websites:
//  main.js removes it from every tab). It gives the toolbar a few narrow
//  functions (Shields panel, title bar, wallpaper) and nothing else:
//
//    window.shields.getStatus(tabNumber)
//        -> blocked/cleaned counts, the site name, and whether JavaScript is
//           switched off for that site
//    window.shields.setScriptsBlocked(tabNumber, true / false)
//        -> switches JavaScript off / on for that tab's site, then reloads
//    window.shields.setShieldsDown(tabNumber, true / false)
//        -> switches Shields off / on for that tab's site, then reloads
//    window.shields.wipeSiteData(tabNumber)
//        -> erases that tab's site cookies and storage, then reloads
//
//    window.klorineWindow.setTitleBarLook({ color, symbolColor, height })
//        -> colors the minimize / maximize / close buttons to match the theme
//
//    window.klorineWallpaper.load() / choose(choice) / save(bytes) / remove()
//        -> the start page wallpaper ('default', 'plain' or 'custom')
//
//    window.klorineStocks.quotes(symbols) / search(name)
//        -> the start page stock tracker: prices, and finding a stock by name
//
//    window.klorineWeather.searchPlaces(name) / get(latitude, longitude)
//        -> the weather widget: finding a place you type, its weather + AQI
//
//    window.klorineWidgets.load() / save(settings)
//        -> widget on/off switches, watchlist, weather place, units, positions
//
//    window.klorineBookmarks.findBrowsers() / readBrowser(id) / readFile()
//        -> importing bookmarks from other browsers or a file
//
//    window.klorineVault.status() / create() / unlock() / lock() / set() ...
//        -> the vault that keeps bookmarks and passwords behind a master password
//
//    window.klorinePasswords.list() / forTab() / fill() / savePending() ...
//        -> saved sign-ins: listing, filling into a page, saving, importing
//
//  main.js checks every request before acting on it.
// =============================================================================

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('shields', {
  getStatus: (tabNumber) => ipcRenderer.invoke('shields:status', tabNumber),
  setScriptsBlocked: (tabNumber, blocked) => ipcRenderer.invoke('shields:set-scripts', tabNumber, blocked === true),
  setShieldsDown: (tabNumber, down) => ipcRenderer.invoke('shields:set-down', tabNumber, down === true),
  wipeSiteData: (tabNumber) => ipcRenderer.invoke('shields:wipe-site', tabNumber),
});

contextBridge.exposeInMainWorld('klorineWallpaper', {
  load: () => ipcRenderer.invoke('wallpaper:load'),
  choose: (choice) => ipcRenderer.invoke('wallpaper:choose', String(choice)),
  save: (bytes) => ipcRenderer.invoke('wallpaper:save', bytes instanceof Uint8Array ? bytes : null),
  remove: () => ipcRenderer.invoke('wallpaper:remove'),
});

contextBridge.exposeInMainWorld('klorineStocks', {
  quotes: (symbols) => ipcRenderer.invoke('stocks:quotes', Array.isArray(symbols) ? symbols.map(String) : []),
  search: (text) => ipcRenderer.invoke('stocks:search', String(text).slice(0, 40)),
});

contextBridge.exposeInMainWorld('klorineWeather', {
  searchPlaces: (text) => ipcRenderer.invoke('weather:search', String(text).slice(0, 60)),
  get: (latitude, longitude) => ipcRenderer.invoke('weather:get', { latitude: Number(latitude), longitude: Number(longitude) }),
});

// All widget settings (main.js checks every value before saving).
contextBridge.exposeInMainWorld('klorineWidgets', {
  load: () => ipcRenderer.invoke('widgets:load'),
  save: (settings) => ipcRenderer.invoke('widgets:save', JSON.parse(JSON.stringify(settings || {}))),
});

// Bookmarks: importing them from other browsers or a file.
const plainBookmarks = (list) => (Array.isArray(list) ? list : []).slice(0, 5000).map((b) => ({
  title: String(b && b.title), url: String(b && b.url), folder: String((b && b.folder) || ''),
}));
contextBridge.exposeInMainWorld('klorineBookmarks', {
  findBrowsers: () => ipcRenderer.invoke('bookmarks:sources'),
  readBrowser: (id) => ipcRenderer.invoke('bookmarks:read-source', Number(id)),
  readFile: () => ipcRenderer.invoke('bookmarks:read-file'),
});

// The vault: saved passwords and bookmarks behind your master password.
contextBridge.exposeInMainWorld('klorineVault', {
  status: () => ipcRenderer.invoke('vault:status'),
  legacyBookmarks: () => ipcRenderer.invoke('vault:legacy-bookmarks'),
  create: (password, keepBookmarks, list) => ipcRenderer.invoke('vault:create', String(password), {
    keepBookmarks: keepBookmarks === true, bookmarks: plainBookmarks(list),
  }),
  unlock: (password) => ipcRenderer.invoke('vault:unlock', String(password)),
  lock: () => ipcRenderer.invoke('vault:lock'),
  changePassword: (current, next) => ipcRenderer.invoke('vault:change-password', String(current), String(next)),
  deleteVault: () => ipcRenderer.invoke('vault:delete'),
  set: (changes, list) => ipcRenderer.invoke('vault:set', JSON.parse(JSON.stringify(changes || {})), plainBookmarks(list)),
  saveBookmarks: (list) => ipcRenderer.invoke('vault:save-bookmarks', plainBookmarks(list)),
});

contextBridge.exposeInMainWorld('klorinePasswords', {
  list: () => ipcRenderer.invoke('passwords:list'),
  reveal: (id) => ipcRenderer.invoke('passwords:reveal', String(id)),
  copy: (id, what) => ipcRenderer.invoke('passwords:copy', String(id), what === 'username' ? 'username' : 'password'),
  remove: (id) => ipcRenderer.invoke('passwords:delete', String(id)),
  allowSite: (origin) => ipcRenderer.invoke('passwords:allow-site', String(origin)),
  forTab: (tabNumber) => ipcRenderer.invoke('passwords:for-tab', tabNumber),
  fill: (tabNumber, id) => ipcRenderer.invoke('passwords:fill', tabNumber, String(id)),
  savePending: (token) => ipcRenderer.invoke('passwords:save-pending', String(token)),
  dropPending: (token, never) => ipcRenderer.invoke('passwords:drop-pending', String(token), never === true),
  importCsv: () => ipcRenderer.invoke('passwords:import-csv'),
  deleteImportFile: () => ipcRenderer.invoke('passwords:delete-import-file'),
});

// Updates: looking for, downloading and installing new versions of Klorine.
contextBridge.exposeInMainWorld('klorineUpdates', {
  status: () => ipcRenderer.invoke('updates:status'),
  check: () => ipcRenderer.invoke('updates:check'),
  download: () => ipcRenderer.invoke('updates:download'),
  install: () => ipcRenderer.invoke('updates:install'),
});

// Your look: the theme or accent color, and light or dark.
contextBridge.exposeInMainWorld('klorineAppearance', {
  load: () => ipcRenderer.invoke('appearance:load'),
  save: (accent, theme) => ipcRenderer.invoke('appearance:save', { accent: String(accent), theme: theme === 'dark' ? 'dark' : 'light' }),
});

// Privacy settings: { hideTimezone }.
contextBridge.exposeInMainWorld('klorinePrivacy', {
  load: () => ipcRenderer.invoke('privacy:load'),
  setHideTimezone: (on) => ipcRenderer.invoke('privacy:set', { hideTimezone: on === true }),
});

contextBridge.exposeInMainWorld('klorineWindow', {
  setTitleBarLook: (look) => ipcRenderer.send('window:title-bar', {
    color: String(look && look.color),
    symbolColor: String(look && look.symbolColor),
    height: Number(look && look.height),
  }),
});