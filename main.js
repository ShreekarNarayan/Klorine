// =============================================================================
//  main.js  —  the "brain" of the browser
// =============================================================================
//  Electron apps have two kinds of code:
//
//    1. The MAIN PROCESS (this file). It has full access to your computer, so
//       it is where we create windows and enforce all the security rules.
//
//    2. The RENDERER (index.html + renderer.js). It only draws the user
//       interface (tabs, address bar, buttons) and has NO access to your
//       computer.
//
//  Web pages you visit are shown inside <webview> tags. Each page runs in its
//  own locked-down box and cannot reach this file at all.
//
//  Sections:
//    1. Settings you can safely edit
//    2. Network privacy: ad & tracker blocking, tracking-link cleaning,
//       privacy headers, per-site JavaScript blocking
//    3. Refuse permission requests and device access
//    4. Wipe all browsing data (and one site's data, for Shields)
//    5. Talking to the user interface (and the Shields panel)
//    6. Application menu (Reload, Hard Reload, Developer Tools)
//    7. Create the browser window
//    8. Rules for every web page (pop-ups, navigation, keyboard shortcuts)
//    9. Password prompts from websites
//   10. App start-up and shut-down
// =============================================================================

// Pull in the pieces of Electron we need:
//   app           -> controls the life of the whole application (start, quit)
//   BrowserWindow -> creates a desktop window
//   Menu          -> the application menu and its keyboard shortcuts
//   session       -> a "browsing profile" (cookies, cache, network rules)
//   ipcMain       -> answers questions from the toolbar's Shields panel
//   webContents   -> finds a tab's page by its number
const { app, BrowserWindow, Menu, session, ipcMain, webContents, dialog, safeStorage, powerMonitor, clipboard } = require('electron');

// "path" is a built-in tool for building file locations that work on
// Windows, macOS and Linux alike. "fs" reads and writes files (used only
// for your wallpaper, see Section 5).
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');

// True when running on a Mac, where shortcuts use Cmd instead of Ctrl.
const isMac = process.platform === 'darwin';

// The one browser window. Filled in by createWindow() further down.
let mainWindow = null;

// The browser's name. Shown in the title bar, the taskbar and the Dock.
// Setting it here also names the folder where the operating system keeps
// the app's (wiped) working files, e.g. %APPDATA%\\Klorine on Windows.
const APP_NAME = 'Klorine';
app.setName(APP_NAME);

// On Windows, this ID makes the taskbar treat Klorine as its own app (with
// its own icon and name) instead of grouping it under "Electron".
if (process.platform === 'win32') {
  app.setAppUserModelId('com.klorine.browser');
}

// The app icon file for this operating system, in the "assets" folder:
//   Windows -> icon.ico  (Windows' own icon format, sharp at every size)
//   Mac     -> icon-macos.png (Mac icons sit inside a margin)
//   Linux   -> icon.png
const APP_ICON = path.join(__dirname, 'assets', {
  win32: 'icon.ico',
  darwin: 'icon-macos.png',
}[process.platform] || 'icon.png');


// =============================================================================
//  SECTION 1 — SETTINGS YOU CAN SAFELY EDIT
// =============================================================================

// The name of the private browsing profile that web pages will use.
//
// IMPORTANT: because this name does NOT start with "persist:", Electron keeps
// everything in this profile (cookies, cache, logins) in MEMORY ONLY. Nothing
// is written to your hard drive. This is what gives us "incognito" behavior.
//
// This name must match PARTITION in renderer.js.
const PRIVATE_PARTITION = 'incognito';

// A second memory-only profile, used only by our own toolbar page. The
// toolbar downloads its fonts and each tab's icon; keeping those in memory
// means no trace of the sites you visit is ever written to disk, even if the
// app crashes or the computer loses power.
const TOOLBAR_PARTITION = 'toolbar-ui';

// The only things a website may do without asking. Neither touches your
// hardware or location:
//   fullscreen                -> lets a video fill the window
//   clipboard-sanitized-write -> lets a "Copy" button put text on the
//                                clipboard (pages still cannot READ it)
// Everything else (camera, microphone, location, notifications, ...) is
// refused.
const ALLOWED_PERMISSIONS = ['fullscreen', 'clipboard-sanitized-write'];

// Permissions that are ALWAYS refused, even if someone later adds them to
// the list above by mistake: your location, camera and microphone, and
// devices plugged into or near your computer.
const NEVER_ALLOWED = [
  'geolocation',
  'media',               // camera and microphone
  'display-capture',     // recording your screen
  'mediaKeySystem',      // protected-video licences (a tracking signal)
  'bluetooth', 'usb', 'serial', 'hid', 'midi', 'midiSysex',
];

// Encrypted DNS ("DNS-over-HTTPS").
// Before visiting a site, a browser must look up its address (e.g. which
// server "goal.com" is). Normally that lookup is sent unencrypted to your
// internet provider, which can see every site you visit, and some providers
// or networks block sites by giving back a dead address (you then see
// "connection refused"). With this on, every lookup goes, encrypted, to
// these privacy-focused services instead:
//   Cloudflare (1.1.1.1) and Quad9 (9.9.9.9), neither of which keeps logs
//   that identify you.
//
// SECURE_DNS_MODE:
//   'off'       -> the normal way, through your internet provider (the
//                  default). Needed in places where providers host YouTube's
//                  video servers inside their own network (common in India):
//                  those servers can only be found through the provider's
//                  own DNS, so with encrypted DNS, YouTube videos stay stuck
//                  at 0:00.
//   'secure'    -> only encrypted lookups (most private). Try this if a site
//                  shows "connection refused" because your provider blocks it.
//   'automatic' -> encrypted first, the normal way if that fails.
const SECURE_DNS_MODE = 'off';
const SECURE_DNS_SERVERS = [
  'https://cloudflare-dns.com/dns-query',
  'https://dns.quad9.net/dns-query',
];

// Tracking codes that websites and ad networks stick onto links, for
// example "?utm_source=newsletter" or "?fbclid=...". They are removed from
// the address before the page is requested. Any name starting with "utm_"
// is removed too.
//
// Note: "ref" is also used by a few sites for real purposes (for example to
// pick a code branch on some developer sites). If a page stops working,
// delete 'ref' from this list.
const TRACKING_PARAMETERS = [
  'fbclid',                          // Facebook
  'gclid', 'gclsrc', 'dclid', 'gbraid', 'wbraid', '_ga', '_gl',  // Google
  'msclkid',                         // Microsoft / Bing
  'yclid',                           // Yandex
  'twclid',                          // Twitter / X
  'ttclid',                          // TikTok
  'li_fat_id',                       // LinkedIn
  'igshid', 'igsh',                  // Instagram
  'mc_cid', 'mc_eid',                // Mailchimp
  '_hsenc', '_hsmi', '__hssc', '__hstc', '__hsfp', 'hsctatracking',  // HubSpot
  'mkt_tok',                         // Marketo
  'oly_anon_id', 'oly_enc_id',       // Omeda
  'vero_id', 'vero_conv',            // Vero
  'rb_clickid',                      // Rakuten
  's_cid',                           // Adobe
  'srsltid',                         // Google shopping
  'ref',
];

// The list of advertising and tracking companies to block.
//
// How it works: if a web page tries to load anything from one of these
// domains (or any sub-domain of them), the request is cancelled before it
// ever leaves your computer.
//
// To block another domain, add a new line in the same style:   'example.com',
const BLOCKED_DOMAINS = [
  // --- Google advertising & analytics ---
  'doubleclick.net',
  'google-analytics.com',
  'googletagmanager.com',
  'googletagservices.com',
  'googlesyndication.com',
  'googleadservices.com',
  'adservice.google.com',

  // --- Facebook / Meta tracking ---
  'connect.facebook.net',
  'pixel.facebook.com',

  // --- Amazon, Microsoft, Twitter/X, LinkedIn, TikTok ads ---
  'amazon-adsystem.com',
  'bat.bing.com',
  'clarity.ms',
  'ads-twitter.com',
  'analytics.twitter.com',
  'ads.linkedin.com',
  'analytics.tiktok.com',

  // --- Large ad networks and data brokers ---
  'adnxs.com',
  'criteo.com',
  'criteo.net',
  'taboola.com',
  'outbrain.com',
  'pubmatic.com',
  'rubiconproject.com',
  'openx.net',
  'casalemedia.com',
  'adsrvr.org',
  'moatads.com',
  'scorecardresearch.com',
  'quantserve.com',
  'bluekai.com',
  'demdex.net',
  'omtrdc.net',

  // --- Session recorders & behavior analytics ---
  'hotjar.com',
  'fullstory.com',
  'mouseflow.com',
  'crazyegg.com',
  'mixpanel.com',
  'segment.io',
  'segment.com',
  'amplitude.com',
  'newrelic.com',
  'nr-data.net',
  'chartbeat.com',
  'optimizely.com',
];


// ---------- The big block lists: EasyList and EasyPrivacy ----------
// The short list above is Klorine's own. On top of it, every request from a
// web page is checked against the two block lists that most ad blockers use
// (uBlock Origin, Brave, Adblock Plus, Ghostery...):
//
//   filters/easylist.txt     -> advertising
//   filters/easyprivacy.txt  -> trackers, analytics, tracking pixels
//
// Together they hold tens of thousands of rules and are updated by their
// volunteers every few days. To bring Klorine's copies up to date (do this
// before each release), run:   npm run update-filters
//
// The rules are checked by Ghostery's open-source matching engine
// (@ghostery/adblocker). Reading the lists takes about a second, so the
// result is kept in Klorine's app folder (filter-cache.bin) and reused
// until the lists change: later starts take a few milliseconds.
//
// The lists are only used for things INSIDE web pages (scripts, images,
// frames...). A page you open yourself is never blocked by them.
const { FiltersEngine, Request: FilterRequest, ENGINE_VERSION } = require('@ghostery/adblocker');
const FILTER_LISTS = ['easylist.txt', 'easyprivacy.txt'];
let filterEngine = null;   // ready once loadFilterLists() has run

function loadFilterLists() {
  const started = Date.now();
  let text = '';
  for (const name of FILTER_LISTS) {
    try {
      text += fs.readFileSync(path.join(__dirname, 'filters', name), 'utf8') + '\n';
    } catch (error) {
      console.error('[FILTERS] Missing filters/' + name + ' (run: npm run update-filters)');
    }
  }
  if (!text.trim()) return null;

  // The cache is valid only for exactly these lists and this engine version.
  const fingerprint = crypto.createHash('sha256').update(String(ENGINE_VERSION)).update(text).digest('hex');
  const cacheFile = path.join(app.getPath('userData'), 'filter-cache.bin');
  try {
    const cached = fs.readFileSync(cacheFile);
    if (cached.subarray(0, 64).toString('latin1') === fingerprint) {
      const engine = FiltersEngine.deserialize(new Uint8Array(cached.subarray(64)));
      console.log('[FILTERS] Block lists ready (' + (Date.now() - started) + ' ms, from cache)');
      return engine;
    }
  } catch (error) {
    // no cache yet, or an old one: read the lists afresh below
  }

  try {
    const engine = FiltersEngine.parse(text, { loadCosmeticFilters: false, loadNetworkFilters: true, enableCompression: true });
    try {
      fs.mkdirSync(app.getPath('userData'), { recursive: true });
      fs.writeFileSync(cacheFile, Buffer.concat([Buffer.from(fingerprint, 'latin1'), Buffer.from(engine.serialize())]));
    } catch (error) { /* works without the cache, just slower to start */ }
    console.log('[FILTERS] Block lists ready (' + (Date.now() - started) + ' ms)');
    return engine;
  } catch (error) {
    console.error('[FILTERS] Could not read the block lists:', error.message);
    return null;
  }
}

// Does EasyList or EasyPrivacy block this request (from inside a page)?
function filterListBlocks(details) {
  if (!filterEngine || details.resourceType === 'mainFrame') return false;
  // Which page asked for it decides "first party" or "third party".
  let source = details.referrer || '';
  try { if (details.frame && details.frame.url) source = details.frame.url; } catch (error) { /* frame already gone */ }
  if (!source && details.webContentsId) {
    const contents = webContents.fromId(details.webContentsId);
    if (contents && !contents.isDestroyed()) source = contents.getURL();
  }
  try {
    return filterEngine.match(FilterRequest.fromRawDetails({
      url: details.url,
      sourceUrl: source,
      type: details.resourceType || 'other',
    })).match === true;
  } catch (error) {
    return false;
  }
}

// ---------- Looking exactly like Google Chrome ----------
// Besides the User-Agent text (Section 9), pages can ask for a list of
// "brands". Electron reports only "Chromium", while every real Chrome
// reports "Google Chrome" too, so a page could tell Klorine apart from the
// millions of Chrome users. This adds "Google Chrome" in the same order
// Chrome itself uses (the order depends on the version number).
function addChromeBrand(list) {
  if (!Array.isArray(list) || list.some((b) => b.brand === 'Google Chrome')) return list;
  const chromium = list.find((b) => b.brand === 'Chromium');
  const grease = list.find((b) => b.brand !== 'Chromium');
  if (!chromium || !grease) return list;
  const orders = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]];
  const order = orders[(parseInt(chromium.version, 10) || 0) % 6];
  const result = [];
  result[order[0]] = grease;
  result[order[1]] = chromium;
  result[order[2]] = { brand: 'Google Chrome', version: chromium.version };
  return result;
}

// The same, for the "Sec-CH-UA" headers sent with requests:
//   "Not:A-Brand";v="8", "Chromium";v="156"
//   -> "Not:A-Brand";v="8", "Chromium";v="156", "Google Chrome";v="156"
function addChromeBrandToHeader(value) {
  if (typeof value !== 'string' || value.includes('Google Chrome')) return value;
  const list = [];
  const pattern = /"((?:[^"\\]|\\.)*)";v="([^"]*)"/g;
  let match;
  while ((match = pattern.exec(value))) list.push({ brand: match[1], version: match[2] });
  if (list.length !== 2) return value;
  return addChromeBrand(list).map((b) => '"' + b.brand + '";v="' + b.version + '"').join(', ');
}

// ---------- Fingerprint protection: a secret for this session ----------
// page-preload.js gives every site a slightly different, made-up
// "fingerprint" (see there). What it is made of comes from this random
// secret, mixed with the site's name: the same site gets the same made-up
// details until Klorine closes; a different site, or the next session, gets
// different ones. So sites cannot recognise you across sites or visits.
const FINGERPRINT_SECRET = crypto.randomBytes(32);

// ---------- Fingerprint protection: installed fonts ----------
// Sites can test which fonts are installed by drawing text in each named
// font and measuring it. Extra fonts that come with programs (Microsoft
// Office, Adobe...) make computers easy to tell apart. So pages are only
// allowed to see the fonts that come with the operating system itself;
// all other fonts that trackers commonly test for are hidden from them
// (text asked for in a hidden font is shown in a standard font instead).
//
// The fonts trackers test for: the 64 that the EFF's test uses, plus the
// extra ones in FingerprintJS (the most widely used fingerprinting kit).
const PROBED_FONTS = [
  'Andale Mono', 'Arial', 'Arial Black', 'Arial Hebrew', 'Arial MT', 'Arial Narrow', 'Arial Rounded MT Bold',
  'Arial Unicode MS', 'Bitstream Vera Sans Mono', 'Book Antiqua', 'Bookman Old Style', 'Calibri', 'Cambria',
  'Cambria Math', 'Century', 'Century Gothic', 'Century Schoolbook', 'Comic Sans', 'Comic Sans MS', 'Consolas',
  'Courier', 'Courier New', 'Geneva', 'Georgia', 'Helvetica', 'Helvetica Neue', 'Impact', 'Lucida Bright',
  'Lucida Calligraphy', 'Lucida Console', 'Lucida Fax', 'Lucida Grande', 'Lucida Handwriting', 'Lucida Sans',
  'Lucida Sans Typewriter', 'Lucida Sans Unicode', 'Microsoft Sans Serif', 'Monaco', 'Monotype Corsiva',
  'MS Gothic', 'MS Outlook', 'MS PGothic', 'MS Reference Sans Serif', 'MS Sans Serif', 'MS Serif', 'Myriad',
  'Myriad Pro', 'Palatino', 'Palatino Linotype', 'Segoe Print', 'Segoe Script', 'Segoe UI', 'Segoe UI Light',
  'Segoe UI Semibold', 'Segoe UI Symbol', 'Tahoma', 'Times', 'Times New Roman', 'Times New Roman PS',
  'Trebuchet MS', 'Verdana', 'Wingdings', 'Wingdings 2', 'Wingdings 3',
  // extra ones tested by FingerprintJS
  'Agency FB', 'Arabic Typesetting', 'Arno Pro', 'AvantGarde Bk BT', 'BankGothic Md BT', 'Batang', 'Clarendon',
  'Eurostile', 'Franklin Gothic', 'Futura Bk BT', 'Futura Md BT', 'Gotham', 'Gill Sans', 'Haettenschweiler',
  'Humanst521 BT', 'Leelawadee', 'Letter Gothic', 'Levenim MT', 'Menlo', 'Meiryo UI', 'Microsoft Uighur',
  'Minion Pro', 'MS Mincho', 'MS Reference Specialty', 'MS UI Gothic', 'MT Extra', 'Marlett', 'PMingLiU',
  'Pristina', 'Scriptina', 'Serifa', 'SimHei', 'Small Fonts', 'Staccato222 BT', 'Trajan Pro',
  'Univers CE 55 Medium', 'Vrinda', 'ZWAdobeF',
];
// Fonts every copy of the operating system has: these stay visible.
const SYSTEM_FONTS = {
  win32: [
    'Arial', 'Arial Black', 'Calibri', 'Cambria', 'Cambria Math', 'Comic Sans MS', 'Consolas', 'Courier',
    'Courier New', 'Georgia', 'Helvetica', 'Impact', 'Lucida Console', 'Lucida Sans Unicode', 'Marlett',
    'Microsoft Sans Serif', 'MS Gothic', 'MS PGothic', 'MS Sans Serif', 'MS Serif', 'MS UI Gothic',
    'Palatino Linotype', 'Segoe Print', 'Segoe Script', 'Segoe UI', 'Segoe UI Light', 'Segoe UI Semibold',
    'Segoe UI Symbol', 'Small Fonts', 'Tahoma', 'Times', 'Times New Roman', 'Trebuchet MS', 'Verdana', 'Wingdings',
  ],
  darwin: [
    'Andale Mono', 'Arial', 'Arial Black', 'Arial Hebrew', 'Arial Narrow', 'Arial Rounded MT Bold',
    'Arial Unicode MS', 'Comic Sans MS', 'Courier', 'Courier New', 'Geneva', 'Georgia', 'Helvetica',
    'Helvetica Neue', 'Impact', 'Lucida Grande', 'Menlo', 'Monaco', 'Palatino', 'Tahoma', 'Times',
    'Times New Roman', 'Trebuchet MS', 'Verdana', 'Wingdings', 'Wingdings 2', 'Wingdings 3',
  ],
  linux: [],
};
function hiddenFonts() {
  const keep = new Set((SYSTEM_FONTS[process.platform] || []).map((f) => f.toLowerCase()));
  return PROBED_FONTS.filter((font) => !keep.has(font.toLowerCase()));
}

// ---------- Fingerprint protection: time zone (optional) ----------
// Sites can read your time zone (e.g. "Asia/Calcutta"), which narrows down
// where you are. With Settings -> Privacy -> "Hide my time zone" switched
// on, every page is told it is in UTC (as Tor Browser does). The catch:
// sites then show times in UTC (5 h 30 min behind India), e.g. in email,
// calendars and timetables. Off by default. Saved in privacy.json.
const privacyFile = () => path.join(app.getPath('userData'), 'privacy.json');
const privacy = { hideTimezone: false };

function loadPrivacySettings() {
  try {
    const saved = JSON.parse(fs.readFileSync(privacyFile(), 'utf8'));
    privacy.hideTimezone = saved.hideTimezone === true;
  } catch (error) { /* nothing saved yet */ }
}

// Applies the time zone choice to one tab, using Chromium's built-in
// "emulation" feature (the same one its developer tools use).
function applyTimezone(contents) {
  if (!contents || contents.isDestroyed() || contents.getType() !== 'webview') return;
  try {
    if (privacy.hideTimezone) {
      if (!contents.debugger.isAttached()) contents.debugger.attach('1.3');
      contents.debugger.sendCommand('Emulation.setTimezoneOverride', { timezoneId: 'UTC' }).catch(() => {});
    } else if (contents.debugger.isAttached()) {
      contents.debugger.sendCommand('Emulation.setTimezoneOverride', { timezoneId: '' })
        .catch(() => {})
        .finally(() => { try { contents.debugger.detach(); } catch (error) { /* already gone */ } });
    }
  } catch (error) {
    console.error('[PRIVACY] Could not change the time zone for a tab:', error.message);
  }
}

function setUpPrivacyRequests() {
  loadPrivacySettings();
  // Every new tab gets the current choice before its first page loads.
  app.on('web-contents-created', (event, contents) => {
    if (contents.getType() === 'webview') applyTimezone(contents);
  });
  ipcMain.handle('privacy:load', (event) => (fromOurToolbar(event) ? { ...privacy } : null));
  ipcMain.handle('privacy:set', (event, changes) => {
    if (!fromOurToolbar(event) || !changes || typeof changes.hideTimezone !== 'boolean') return null;
    privacy.hideTimezone = changes.hideTimezone;
    try {
      fs.mkdirSync(app.getPath('userData'), { recursive: true });
      fs.writeFileSync(privacyFile(), JSON.stringify(privacy, null, 2));
    } catch (error) { /* still applied for this session */ }
    for (const contents of webContents.getAllWebContents()) applyTimezone(contents);
    return { ...privacy };
  });
}

// "news.bbc.co.uk" -> "bbc.co.uk", "www.google.com" -> "google.com"
function siteKey(hostname) {
  if (!hostname || /^[\d.]+$/.test(hostname) || hostname.includes(':')) return hostname || '';
  const labels = hostname.split('.');
  const shortSecondLevel = ['co', 'com', 'net', 'org', 'gov', 'edu', 'ac', 'gen', 'firm', 'ind', 'nic', 'res', 'ne', 'or', 'go'];
  const keep = labels.length >= 3 && labels[labels.length - 1].length === 2 && shortSecondLevel.includes(labels[labels.length - 2]) ? 3 : 2;
  return labels.slice(-keep).join('.');
}


// =============================================================================
//  SECTION 2 — NETWORK PRIVACY
// =============================================================================
//  Every request a page makes passes through here before it is sent:
//    - requests to ad and tracking companies are cancelled
//    - tracking codes are removed from the addresses of pages you open
//    - "do not track me" signals are added
//    - JavaScript is blocked on sites where you switched it off in Shields
//
//  Electron allows only ONE function per kind of check on each profile, so
//  blocking and link cleaning share a single function (a second one would
//  silently replace the first).
// =============================================================================

// Decides whether a web address belongs to a blocked domain.
// Returns true (block it) or false (let it through).
function isBlockedUrl(urlString) {
  try {
    // Pull just the host name out of the full address.
    // Example: "https://stats.g.doubleclick.net/collect?x=1"
    //          -> "stats.g.doubleclick.net"
    const hostname = new URL(urlString).hostname.toLowerCase();

    // It is a match if it is exactly the blocked domain, OR ends with
    // ".blockeddomain" (a sub-domain). The leading dot matters: it stops
    // "notdoubleclick.net" from matching.
    return BLOCKED_DOMAINS.some(
      (domain) => hostname === domain || hostname.endsWith('.' + domain)
    );
  } catch (error) {
    // If the address could not be understood, do not block it.
    return false;
  }
}

// Is this the name of a tracking code (see TRACKING_PARAMETERS)?
function isTrackingParameter(name) {
  const lower = name.toLowerCase();
  return lower.startsWith('utm_') || TRACKING_PARAMETERS.includes(lower);
}

// Returns the address with its tracking codes removed, or null if it had
// none. The rest of the address is kept exactly as it was, character for
// character, because some sites sign their links and would reject a link
// that had been re-written in any other way.
function stripTrackingParameters(urlString) {
  const queryStart = urlString.indexOf('?');
  if (queryStart === -1) return null;

  const hashStart = urlString.indexOf('#', queryStart);
  const query = urlString.slice(queryStart + 1, hashStart === -1 ? undefined : hashStart);
  const hash = hashStart === -1 ? '' : urlString.slice(hashStart);

  const parts = query.split('&');
  const kept = parts.filter((part) => {
    let name = part.split('=')[0];
    try { name = decodeURIComponent(name.replace(/\+/g, ' ')); } catch (error) { /* keep raw */ }
    return !isTrackingParameter(name);
  });
  if (kept.length === parts.length) return null;   // nothing to remove

  const base = urlString.slice(0, queryStart);
  return base + (kept.length > 0 ? '?' + kept.join('&') : '') + hash;
}

// ---------- Counts for the Shields panel ----------
// For each tab (identified by its page number), how many requests were
// blocked and how many links were cleaned since its current page started
// loading. The toolbar is told about changes a few times a second at most.
const shieldStats = new Map();       // page number -> { blocked, stripped }
const justCleaned = new Set();       // tabs whose next page load is the cleaned link
const pendingUpdates = new Map();    // page number -> timer

function statsFor(id) {
  if (!shieldStats.has(id)) shieldStats.set(id, { blocked: 0, stripped: 0 });
  return shieldStats.get(id);
}

function reportStats(id) {
  if (pendingUpdates.has(id)) return;
  pendingUpdates.set(id, setTimeout(() => {
    pendingUpdates.delete(id);
    callInterface('shieldsUpdate', { id, ...statsFor(id) });
  }, 250));
}

// Installs the blocker and the link cleaner on one browsing profile.
// useLists: also check EasyList / EasyPrivacy (only for the websites
// profile; Klorine's own interface makes just a few known requests).
function enableAdAndTrackerBlocking(targetSession, useLists = false) {
  // onBeforeRequest runs for EVERY network request (pages, images, scripts...)
  // BEFORE it is sent. It can cancel the request or send it elsewhere.
  targetSession.webRequest.onBeforeRequest((details, callback) => {
    const tabId = details.webContentsId;   // which tab asked (may be missing)
    const isPage = details.resourceType === 'mainFrame';

    // 0) Shields are off for this site (switched off in the Shields panel,
    //    because the site would not work with them): let everything through.
    if (shieldsDownSites.size > 0 && shieldsDownSites.has(siteOfRequest(details))) {
      if (isPage && tabId) {
        shieldStats.set(tabId, { blocked: 0, stripped: 0 });
        reportStats(tabId);
      }
      callback({});
      return;
    }

    // 1) Ads and trackers: cancel.
    if (isBlockedUrl(details.url) || (useLists && filterListBlocks(details))) {
      // Print a note in the terminal so you can watch the blocker working.
      console.log('[BLOCKED]', details.url);

      if (isPage) {
        // It was the page you were trying to OPEN (not something hidden
        // inside a page): say so on screen instead of silently doing nothing.
        const host = new URL(details.url).hostname;
        callInterface('notify', `${host} is on this browser's tracker block list, so it was not opened.`);
      } else if (tabId) {
        statsFor(tabId).blocked += 1;
        reportStats(tabId);
      }
      callback({ cancel: true });
      return;
    }

    // 2) Tracking codes in the address of a page or embedded frame: remove
    //    them and request the clean address instead. Only for ordinary page
    //    visits (GET): changing a form submission could break it.
    const isFrame = isPage || details.resourceType === 'subFrame';
    const cleaned = isFrame && details.method === 'GET' ? stripTrackingParameters(details.url) : null;
    if (cleaned) {
      console.log('[CLEANED]', details.url, '->', cleaned);
      if (tabId) {
        if (isPage) {
          // A new page: start its counts afresh, with this one clean-up.
          shieldStats.set(tabId, { blocked: 0, stripped: 1 });
          justCleaned.add(tabId);
        } else {
          statsFor(tabId).stripped += 1;
        }
        reportStats(tabId);
      }
      callback({ redirectURL: cleaned });
      return;
    }

    // 3) A new page is starting in a tab: reset its counts (unless this is
    //    the cleaned address requested just above).
    if (isPage && tabId) {
      if (justCleaned.has(tabId)) {
        justCleaned.delete(tabId);
      } else {
        shieldStats.set(tabId, { blocked: 0, stripped: 0 });
        reportStats(tabId);
      }
    }
    callback({});
  });
}

// Adds the "do not sell or share my data" signal to every request: "Global
// Privacy Control" (Sec-GPC), which some laws (e.g. California's) require
// sites to respect. Brave, Firefox and DuckDuckGo send it too.
//
// The older "Do Not Track" (DNT) header is NOT sent: sites ignore it, and
// since Chrome does not send it, it only made Klorine easier to pick out
// (the EFF's test measured it as 2 bits of identifying information).
function addPrivacyHeaders(targetSession) {
  targetSession.webRequest.onBeforeSendHeaders((details, callback) => {
    details.requestHeaders['Sec-GPC'] = '1';
    delete details.requestHeaders['DNT'];
    // Report the "Google Chrome" brand like real Chrome (see addChromeBrand).
    for (const name of Object.keys(details.requestHeaders)) {
      const lower = name.toLowerCase();
      if (lower === 'sec-ch-ua' || lower === 'sec-ch-ua-full-version-list') {
        details.requestHeaders[name] = addChromeBrandToHeader(details.requestHeaders[name]);
      }
    }
    callback({ requestHeaders: details.requestHeaders });
  });
}

// ---------- Sites with Shields off (from the Shields panel) ----------
// Some sites will not work properly while their trackers and ads are blocked.
// For the sites listed here, nothing is blocked and no links are cleaned.
// Kept in memory only, so it resets when the browser closes. (Everything
// else, like wiping data when you close, still applies.)
const shieldsDownSites = new Set();

// The site a request belongs to: for a page being opened, its own host; for
// anything inside a page (images, scripts, frames), the host of that page.
function siteOfRequest(details) {
  if (details.resourceType === 'mainFrame') {
    try { return new URL(details.url).hostname; } catch (error) { return ''; }
  }
  if (!details.webContentsId) return '';
  const contents = webContents.fromId(details.webContentsId);
  return contents ? tabHost(contents) : '';
}

// ---------- Per-site JavaScript blocking (from the Shields panel) ----------
// The sites (host names) where you switched JavaScript off. Kept in memory
// only, so it resets when the browser closes.
const scriptBlockedSites = new Set();

// The host name of the page shown in a tab, or '' if it is not a website.
function tabHost(contents) {
  try {
    const url = new URL(contents.getURL());
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.hostname : '';
  } catch (error) {
    return '';
  }
}

// Electron cannot switch JavaScript off for a page that is already open, so
// it is done with a security rule instead: every page (and frame inside it)
// of a blocked site is delivered with the instruction "script-src 'none'",
// meaning "run no scripts at all". Browsers obey this strictly. The page
// is then reloaded so the rule takes effect.
function enableScriptBlocking(targetSession) {
  targetSession.webRequest.onHeadersReceived((details, callback) => {
    const type = details.resourceType;
    if (type !== 'mainFrame' && type !== 'subFrame') return callback({});

    // Which site is this for? For the page itself, its own address; for a
    // frame inside a page, the site of the page around it.
    let host = '';
    if (type === 'mainFrame') {
      try { host = new URL(details.url).hostname; } catch (error) { /* none */ }
    } else if (details.webContentsId) {
      const contents = webContents.fromId(details.webContentsId);
      if (contents) host = tabHost(contents);
    }
    if (!scriptBlockedSites.has(host)) return callback({});

    // Add the rule next to any the site already has (all of them apply).
    const headers = { ...details.responseHeaders };
    const existing = Object.keys(headers).find((name) => name.toLowerCase() === 'content-security-policy');
    const key = existing || 'Content-Security-Policy';
    headers[key] = [...(headers[key] || []), "script-src 'none'"];
    callback({ responseHeaders: headers });
  });
}


// =============================================================================
//  SECTION 3 — REFUSE PERMISSION REQUESTS AND DEVICE ACCESS
// =============================================================================
//  Websites can ask for your camera, microphone, location, notifications,
//  clipboard contents, screen sharing, USB and Bluetooth devices and more.
//  All of it is refused automatically, with no pop-up. The only exceptions
//  are the two harmless items in ALLOWED_PERMISSIONS (see Section 1), and
//  anything in NEVER_ALLOWED is refused no matter what.
// =============================================================================

function isAllowed(permission) {
  return ALLOWED_PERMISSIONS.includes(permission) && !NEVER_ALLOWED.includes(permission);
}

function denyAllPermissions(targetSession) {
  // 1) A website ASKS for a permission. callback(false) means "denied".
  targetSession.setPermissionRequestHandler((contents, permission, callback) => {
    const allowed = isAllowed(permission);
    if (!allowed) console.log('[PERMISSION DENIED]', permission);
    callback(allowed);
  });

  // 2) A website quietly CHECKS whether it already has a permission. Saying
  //    no also hides the names and details of your cameras, microphones and
  //    speakers from pages that list them (a common fingerprinting trick).
  targetSession.setPermissionCheckHandler((contents, permission) => isAllowed(permission));

  // 3) A website asks to talk to physical devices plugged into your computer
  //    (USB, serial ports, game controllers, Bluetooth). Always refuse.
  targetSession.setDevicePermissionHandler(() => false);

  // 4) A website asks you to PICK a USB, HID or serial device. Electron
  //    would otherwise choose one automatically; we choose none.
  targetSession.on('select-usb-device', (event, details, callback) => {
    event.preventDefault();
    callback();
  });
  targetSession.on('select-hid-device', (event, details, callback) => {
    event.preventDefault();
    callback();
  });
  targetSession.on('select-serial-port', (event, portList, contents, callback) => {
    event.preventDefault();
    callback('');
  });

  // 5) A website asks to record or share your screen. Refused.
  targetSession.setDisplayMediaRequestHandler((request, callback) => {
    console.log('[PERMISSION DENIED] screen sharing');
    callback({});
  });
}


// =============================================================================
//  SECTION 4 — WIPE ALL BROWSING DATA
// =============================================================================
//  Called when the app starts (to clean up after a crash) and again when the
//  window closes.
// =============================================================================

// Erases everything stored in one browsing profile.
async function wipeSession(targetSession) {
  // Cookies, website storage, databases, saved offline data, service workers.
  await targetSession.clearStorageData();

  // Cached copies of pages, images and scripts.
  await targetSession.clearCache();

  // Remembered usernames/passwords for sites using basic login pop-ups.
  await targetSession.clearAuthCache();

  // Remembered lookups of website names -> internet addresses.
  await targetSession.clearHostResolverCache();
}

// Erases every profile: the private one that web pages use, the toolbar's
// own, and Electron's default one (unused, but cleaned to be thorough).
//
// About browsing HISTORY: this browser never saves a history list to disk.
// The back/forward list lives only in memory, so it disappears the moment
// the window closes.
async function wipeAllData() {
  try {
    await wipeSession(session.fromPartition(PRIVATE_PARTITION));
    await wipeSession(session.fromPartition(TOOLBAR_PARTITION));
    await wipeSession(session.defaultSession);
    console.log('[PRIVACY] Cookies, cache and site data cleared.');
  } catch (error) {
    console.error('[PRIVACY] Problem while clearing data:', error);
  }
}


// Erases what ONE website has stored (for the Shields panel's "Wipe site
// data & reload"): its cookies and its storage (local storage, databases,
// offline data, service workers). Cookies a site shares between its own
// sub-domains (www.example.com and mail.example.com) are removed too.
// The page is then reloaded without using saved copies.
async function wipeSiteData(contents) {
  const url = new URL(contents.getURL());
  const targetSession = contents.session;

  // Storage belongs to the exact origin, e.g. "https://www.example.com".
  await targetSession.clearStorageData({ origin: url.origin });

  // Cookies can belong to the site's wider domain (".example.com").
  const site = url.hostname.replace(/^www\./, '');
  const cookies = await targetSession.cookies.get({});
  for (const cookie of cookies) {
    const domain = (cookie.domain || '').replace(/^\./, '');
    const belongs = domain === site || domain.endsWith('.' + site) || site.endsWith('.' + domain);
    if (!belongs) continue;
    const cookieUrl = (cookie.secure ? 'https://' : 'http://') + domain + (cookie.path || '/');
    await targetSession.cookies.remove(cookieUrl, cookie.name);
  }

  console.log('[PRIVACY] Site data wiped for', url.hostname);
  contents.reloadIgnoringCache();
}


// =============================================================================
//  SECTION 5 — TALKING TO THE USER INTERFACE
// =============================================================================
//  The user interface (renderer.js) owns the tabs, so when the menu or a
//  keyboard shortcut needs something done, this file asks renderer.js to do
//  it. renderer.js exposes a small object called "browserBridge" for this.
//
//  JSON.stringify turns each value into a safe piece of text, so nothing a
//  website supplies (such as a link address) can ever be run as code.
// =============================================================================

function callInterface(method, argument) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const code =
    `window.browserBridge && window.browserBridge.${method}(${JSON.stringify(argument)})`;
  mainWindow.webContents.executeJavaScript(code).catch(() => {});
}

// ---------- Questions from the Shields panel ----------
// The other direction: the toolbar asks this file for things it cannot do
// itself (it has no access to cookies or profiles). These arrive through
// preload.js. Every request is checked:
//   - it must come from our own toolbar page, not from a website
//   - the tab it names must really be one of our tabs
// The site is always worked out here from the tab itself, never taken
// from the request, so the toolbar cannot be tricked into wiping or
// changing a different site.

function fromOurToolbar(event) {
  return Boolean(mainWindow) && !mainWindow.isDestroyed() &&
    event.sender === mainWindow.webContents &&
    event.senderFrame === mainWindow.webContents.mainFrame;
}

function ourTab(id) {
  if (!Number.isInteger(id)) return null;
  const contents = webContents.fromId(id);
  if (!contents || contents.isDestroyed() || contents.getType() !== 'webview') return null;
  if (contents.hostWebContents !== mainWindow.webContents) return null;
  return contents;
}

// What the Shields panel shows for a tab.
function shieldsStatus(contents) {
  const host = tabHost(contents);
  return {
    host,
    ...statsFor(contents.id),
    scriptsBlocked: host !== '' && scriptBlockedSites.has(host),
    shieldsDown: host !== '' && shieldsDownSites.has(host),
  };
}

// ---------- The title bar buttons' colors ----------
// renderer.js sends the colors of the current theme (and the height of the
// top bar) whenever they change. Values are checked before use.
function setUpTitleBarRequests() {
  ipcMain.on('window:title-bar', (event, look) => {
    if (isMac || !fromOurToolbar(event) || !look || typeof look !== 'object') return;
    const isHex = (value) => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);
    if (!isHex(look.color) || !isHex(look.symbolColor)) return;
    const height = Math.round(Number(look.height));
    if (!(height >= 24 && height <= 120)) return;
    try {
      mainWindow.setTitleBarOverlay({ color: look.color, symbolColor: look.symbolColor, height });
    } catch (error) {
      // Older systems without this feature keep the default colors.
    }
  });
}

// ---------- Your wallpaper ----------
// The start page shows the Klorine wallpaper, no wallpaper ("plain"), or an
// image you uploaded. Unlike your browsing, this choice IS kept between
// sessions: it is your own setting, not a record of what you did. It lives
// in Klorine's app folder (on Windows: %APPDATA%\\Klorine\\wallpaper):
//   choice.json -> which of the three you picked
//   custom.webp -> your image
//
// Your image arrives already re-drawn by the toolbar as a fresh WebP picture,
// which removes hidden photo details such as the GPS location a phone camera
// stores. It is still checked here before being saved.

const WALLPAPER_CHOICES = ['default', 'plain', 'custom'];
const MAX_WALLPAPER_BYTES = 20 * 1024 * 1024;   // 20 MB

function wallpaperFile(name) {
  return path.join(app.getPath('userData'), 'wallpaper', name);
}

// Is this really a WebP picture? (It must start with "RIFF....WEBP".)
function isWebp(bytes) {
  return bytes.length > 12 &&
    String.fromCharCode(...bytes.subarray(0, 4)) === 'RIFF' &&
    String.fromCharCode(...bytes.subarray(8, 12)) === 'WEBP';
}

function readWallpaperChoice() {
  try {
    const saved = JSON.parse(fs.readFileSync(wallpaperFile('choice.json'), 'utf8'));
    return WALLPAPER_CHOICES.includes(saved.choice) ? saved.choice : 'default';
  } catch (error) {
    return 'default';   // nothing saved yet
  }
}

function writeWallpaperChoice(choice) {
  fs.mkdirSync(path.dirname(wallpaperFile('choice.json')), { recursive: true });
  fs.writeFileSync(wallpaperFile('choice.json'), JSON.stringify({ choice }));
}

// What the start page should show: the choice, and your image (as a
// "data:" address the toolbar can display) if you have one.
function wallpaperStatus() {
  let image = null;
  try {
    image = 'data:image/webp;base64,' + fs.readFileSync(wallpaperFile('custom.webp')).toString('base64');
  } catch (error) {
    // no image uploaded
  }
  let choice = readWallpaperChoice();
  if (choice === 'custom' && !image) choice = 'default';
  return { choice, image };
}

function setUpWallpaperRequests() {
  ipcMain.handle('wallpaper:load', (event) => (fromOurToolbar(event) ? wallpaperStatus() : null));

  ipcMain.handle('wallpaper:choose', (event, choice) => {
    if (!fromOurToolbar(event) || !WALLPAPER_CHOICES.includes(choice)) return null;
    writeWallpaperChoice(choice);
    return wallpaperStatus();
  });

  ipcMain.handle('wallpaper:save', (event, bytes) => {
    if (!fromOurToolbar(event) || !(bytes instanceof Uint8Array)) return null;
    if (bytes.length > MAX_WALLPAPER_BYTES || !isWebp(bytes)) return null;
    fs.mkdirSync(path.dirname(wallpaperFile('custom.webp')), { recursive: true });
    fs.writeFileSync(wallpaperFile('custom.webp'), bytes);
    writeWallpaperChoice('custom');
    return wallpaperStatus();
  });

  ipcMain.handle('wallpaper:remove', (event) => {
    if (!fromOurToolbar(event)) return null;
    fs.rmSync(wallpaperFile('custom.webp'), { force: true });
    writeWallpaperChoice('default');
    return wallpaperStatus();
  });
}

// ---------- Stock tracker widget ----------
// The start page can show a small watchlist of stocks and indices. Prices
// come from Yahoo Finance's public chart data, which needs no account or key
// and covers Indian (NSE ".NS", BSE ".BO") and international markets.
//
// Privacy: the prices are fetched HERE, from Klorine's memory-only toolbar
// profile, with no cookies sent and the usual "do not track" signals. Yahoo
// still sees which symbols you ask about and your internet address; that
// cannot be avoided when fetching live prices. Switch the widget off in
// Settings and no requests are made at all.

const STOCK_SOURCE = 'https://query1.finance.yahoo.com/v8/finance/chart/';
const STOCK_SYMBOL = /^[A-Za-z0-9.^=&-]{1,20}$/;   // e.g. AAPL, TCS.NS, ^NSEI, M&M.NS
const MAX_STOCKS = 8;
const STOCK_CACHE_MS = 30 * 1000;   // ask Yahoo for the same symbol at most twice a minute
const stockCache = new Map();       // symbol -> { time, quote }

// What the widgets look like the very first time (before you change anything).
//   layout -> where each widget sits on the start page, as fractions:
//             x 0 = left edge ... 1 = right edge; y 0 = top ... 1 = bottom.
const DEFAULT_WIDGETS = {
  stocks: { enabled: true, symbols: ['^NSEI', '^BSESN', 'RELIANCE.NS', 'AAPL'] },
  weather: { enabled: true, place: null, unit: 'c', aqi: 'auto' },
  layout: { stocks: { x: 1, y: 0 }, weather: { x: 0, y: 0 } },
};

function finite(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

// Asks Yahoo for one symbol's price today. Returns either a quote:
//   { symbol, name, exchange, currency, isIndex, price, previousClose, time, points }
// or { symbol, error: 'not-found' | 'unavailable' }.
async function fetchQuote(symbol) {
  const cached = stockCache.get(symbol);
  if (cached && Date.now() - cached.time < STOCK_CACHE_MS) return cached.quote;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);   // give up after 8 s
  let quote;
  try {
    const response = await session.fromPartition(TOOLBAR_PARTITION).fetch(
      STOCK_SOURCE + encodeURIComponent(symbol) + '?range=1d&interval=5m',
      { signal: controller.signal, credentials: 'omit', headers: { Accept: 'application/json' } }
    );
    const data = await response.json().catch(() => null);
    const result = data && data.chart && Array.isArray(data.chart.result) ? data.chart.result[0] : null;
    const meta = result && result.meta;

    if (!meta || !finite(meta.regularMarketPrice)) {
      quote = { symbol, error: response.status === 404 || (data && data.chart && data.chart.error) ? 'not-found' : 'unavailable' };
    } else {
      // Today's prices, every 5 minutes, for the little chart (at most 60).
      const series = result.indicators && result.indicators.quote && result.indicators.quote[0];
      const closes = (series && Array.isArray(series.close) ? series.close : []).filter(finite);
      const step = Math.max(1, Math.ceil(closes.length / 60));
      const previous = finite(meta.previousClose) ? meta.previousClose : meta.chartPreviousClose;

      quote = {
        symbol: STOCK_SYMBOL.test(String(meta.symbol)) ? String(meta.symbol) : symbol,
        name: String(meta.shortName || meta.longName || meta.symbol || symbol).slice(0, 60),
        exchange: String(meta.fullExchangeName || meta.exchangeName || '').slice(0, 30),
        currency: /^[A-Z]{3}$/.test(meta.currency) ? meta.currency : '',
        isIndex: meta.instrumentType === 'INDEX' || symbol.startsWith('^'),
        price: meta.regularMarketPrice,
        previousClose: finite(previous) ? previous : null,
        time: finite(meta.regularMarketTime) ? meta.regularMarketTime : 0,
        points: closes.filter((value, i) => i % step === 0),
      };
    }
  } catch (error) {
    quote = { symbol, error: 'unavailable' };   // no connection, timed out...
  } finally {
    clearTimeout(timer);
  }
  if (quote.error !== 'unavailable') stockCache.set(symbol, { time: Date.now(), quote });
  return quote;
}

// ---- Finding a stock by its NAME -------------------------------------------
// You type "reliance" or "apple"; Yahoo's search tells us which stocks match,
// e.g. RELIANCE.NS (Reliance Industries, NSE) and RELIANCE.BO (same, on BSE).
const STOCK_SEARCH = 'https://query1.finance.yahoo.com/v1/finance/search';
const SEARCH_TYPES = new Set(['EQUITY', 'ETF', 'INDEX', 'MUTUALFUND']);   // skip news, futures, crypto...
const searchCache = new Map();   // typed text -> { time, results }

// Returns up to 7 matches: [{ symbol, name, exchange, type }], or null when
// Yahoo cannot be reached.
async function searchStocks(text) {
  // Only plain text, at most 40 characters.
  const query = String(text || '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 40);
  if (query.length < 1) return [];
  const key = query.toLowerCase();
  const cached = searchCache.get(key);
  if (cached && Date.now() - cached.time < 5 * 60 * 1000) return cached.results;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const url = STOCK_SEARCH + '?q=' + encodeURIComponent(query) +
      '&quotesCount=10&newsCount=0&listsCount=0&enableFuzzyQuery=false';
    const response = await session.fromPartition(TOOLBAR_PARTITION).fetch(url, {
      signal: controller.signal, credentials: 'omit', headers: { Accept: 'application/json' },
    });
    const data = await response.json().catch(() => null);
    const quotes = data && Array.isArray(data.quotes) ? data.quotes : [];
    const results = [];
    for (const item of quotes) {
      const symbol = String(item.symbol || '').toUpperCase();
      if (!STOCK_SYMBOL.test(symbol) || !SEARCH_TYPES.has(item.quoteType)) continue;
      if (results.some((r) => r.symbol === symbol)) continue;
      results.push({
        symbol,
        name: String(item.longname || item.shortname || symbol).slice(0, 60),
        exchange: String(item.exchDisp || item.exchange || '').slice(0, 30),
        type: item.quoteType === 'INDEX' ? 'Index' : item.quoteType === 'ETF' ? 'ETF'
          : item.quoteType === 'MUTUALFUND' ? 'Fund' : 'Stock',
      });
      if (results.length >= 7) break;
    }
    if (searchCache.size > 100) searchCache.clear();   // keep the memory small
    searchCache.set(key, { time: Date.now(), results });
    return results;
  } catch (error) {
    return null;   // no connection or timed out
  } finally {
    clearTimeout(timer);
  }
}

// The widget settings (on/off, the watchlist, your weather place and units,
// and where each widget sits), kept between sessions in Klorine's app folder
// like the wallpaper: widgets.json.
//
// cleanWidgets() checks EVERYTHING before it is used or saved: anything
// missing or odd is replaced by the default, so a damaged file (or a bad
// request) can never break the start page.
function cleanWidgets(input) {
  const d = DEFAULT_WIDGETS;
  const given = input && typeof input === 'object' ? input : {};
  const stocks = given.stocks && typeof given.stocks === 'object' ? given.stocks : {};
  const weather = given.weather && typeof given.weather === 'object' ? given.weather : {};
  const layout = given.layout && typeof given.layout === 'object' ? given.layout : {};

  const position = (pos, fallback) => {
    const ok = (n) => typeof n === 'number' && Number.isFinite(n);
    return pos && ok(pos.x) && ok(pos.y)
      ? { x: Math.min(1, Math.max(0, pos.x)), y: Math.min(1, Math.max(0, pos.y)) }
      : { ...fallback };
  };

  return {
    stocks: {
      enabled: typeof stocks.enabled === 'boolean' ? stocks.enabled : d.stocks.enabled,
      symbols: Array.isArray(stocks.symbols) ? cleanSymbols(stocks.symbols) : [...d.stocks.symbols],
    },
    weather: {
      enabled: typeof weather.enabled === 'boolean' ? weather.enabled : d.weather.enabled,
      place: cleanPlace(weather.place),
      unit: weather.unit === 'f' ? 'f' : 'c',
      aqi: ['auto', 'us', 'in'].includes(weather.aqi) ? weather.aqi : 'auto',
    },
    layout: {
      stocks: position(layout.stocks, d.layout.stocks),
      weather: position(layout.weather, d.layout.weather),
    },
  };
}

function readWidgets() {
  try {
    return cleanWidgets(JSON.parse(fs.readFileSync(path.join(app.getPath('userData'), 'widgets.json'), 'utf8')));
  } catch (error) {
    return cleanWidgets(null);   // nothing saved yet
  }
}

function cleanSymbols(list) {
  const seen = new Set();
  for (const item of Array.isArray(list) ? list : []) {
    const symbol = String(item).trim().toUpperCase();
    if (STOCK_SYMBOL.test(symbol)) seen.add(symbol);
    if (seen.size >= MAX_STOCKS) break;
  }
  return [...seen];
}

function setUpStockRequests() {
  ipcMain.handle('widgets:load', (event) => (fromOurToolbar(event) ? readWidgets() : null));

  ipcMain.handle('widgets:save', (event, widgets) => {
    if (!fromOurToolbar(event) || !widgets || typeof widgets !== 'object') return null;
    const clean = cleanWidgets(widgets);
    fs.mkdirSync(app.getPath('userData'), { recursive: true });
    fs.writeFileSync(path.join(app.getPath('userData'), 'widgets.json'), JSON.stringify(clean));
    return clean;
  });

  // Prices for a list of symbols, fetched one after another (with a short
  // pause between, so Yahoo is not flooded with requests).
  ipcMain.handle('stocks:quotes', async (event, symbols) => {
    if (!fromOurToolbar(event)) return null;
    const quotes = [];
    for (const symbol of cleanSymbols(symbols)) {
      const cachedBefore = stockCache.has(symbol);
      quotes.push(await fetchQuote(symbol));
      if (!cachedBefore) await new Promise((resolve) => setTimeout(resolve, 150));
    }
    return quotes;
  });

  // Matching stocks for what you typed in "Add a stock".
  ipcMain.handle('stocks:search', async (event, text) => {
    if (!fromOurToolbar(event) || typeof text !== 'string') return null;
    return searchStocks(text);
  });

  // Weather: find a place by name, then fetch its weather and air quality.
  ipcMain.handle('weather:search', async (event, text) => {
    if (!fromOurToolbar(event) || typeof text !== 'string') return null;
    return searchPlaces(text);
  });

  ipcMain.handle('weather:get', async (event, where) => {
    if (!fromOurToolbar(event) || !where) return null;
    const { latitude, longitude } = where;
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) ||
        Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
    return fetchWeather(latitude, longitude);
  });
}

// ---------- Weather widget ----------
// Klorine NEVER asks for your location (websites and Klorine itself are
// refused it). Instead you type a place name; Open-Meteo's free public
// services turn it into coordinates and give the weather and air quality.
// No account or key, and no cookies are sent. Open-Meteo sees the place's
// coordinates (rounded to about 1 km) and your internet address.
//
// Note: Open-Meteo's free service is meant for non-commercial use. If you
// ever sell Klorine, check their terms (open-meteo.com) for a paid plan.

const PLACE_SEARCH = 'https://geocoding-api.open-meteo.com/v1/search';
const WEATHER_SOURCE = 'https://api.open-meteo.com/v1/forecast';
const AIR_SOURCE = 'https://air-quality-api.open-meteo.com/v1/air-quality';
const WEATHER_CACHE_MS = 10 * 60 * 1000;   // the same place at most every 10 minutes
const weatherCache = new Map();
const placeCache = new Map();

// Fetches a web address from the memory-only toolbar profile (no cookies)
// and reads the JSON answer. Returns null if it fails or takes over 10 s.
async function getJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await session.fromPartition(TOOLBAR_PARTITION).fetch(url, {
      signal: controller.signal, credentials: 'omit', headers: { Accept: 'application/json' },
    });
    if (!response.ok) return null;
    return await response.json();
  } catch (error) {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

const shortText = (value, max) => (typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max) : '');

// A saved place, checked: { name, region, country, countryCode, latitude, longitude }.
function cleanPlace(place) {
  if (!place || typeof place !== 'object') return null;
  const lat = Number(place.latitude), lon = Number(place.longitude);
  const name = shortText(place.name, 80);
  if (!name || !Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return {
    name,
    region: shortText(place.region, 80),
    country: shortText(place.country, 60),
    countryCode: /^[A-Z]{2}$/.test(place.countryCode) ? place.countryCode : '',
    latitude: Math.round(lat * 100) / 100,     // about 1 km: enough for weather
    longitude: Math.round(lon * 100) / 100,
  };
}

// "Kochi" -> up to 6 matching places, or null if Open-Meteo can't be reached.
async function searchPlaces(text) {
  const query = shortText(text, 60);
  if (query.length < 2) return [];
  const key = query.toLowerCase();
  const cached = placeCache.get(key);
  if (cached) return cached;

  const data = await getJson(PLACE_SEARCH + '?name=' + encodeURIComponent(query) + '&count=6&language=en&format=json');
  if (!data) return null;
  const places = (Array.isArray(data.results) ? data.results : []).map((r) => cleanPlace({
    name: r.name, region: r.admin1, country: r.country,
    countryCode: typeof r.country_code === 'string' ? r.country_code.toUpperCase() : '',
    latitude: r.latitude, longitude: r.longitude,
  })).filter(Boolean);
  if (placeCache.size > 100) placeCache.clear();
  placeCache.set(key, places);
  return places;
}

// ---- India's National Air Quality Index (CPCB), estimated ----
// India's AQI uses 24-hour averages (8-hour for ozone and carbon monoxide)
// of each pollutant, turns each into a "sub-index" with the official
// breakpoints below, and reports the WORST one. We do the same with
// Open-Meteo's hourly model data, so it is a close estimate, not an
// official station reading.
const INDIA_BANDS = [[0, 50], [51, 100], [101, 200], [201, 300], [301, 400], [401, 500]];
const INDIA_POLLUTANTS = {
  //                 hours  concentration ranges for each band (µg/m³; CO in mg/m³)
  pm2_5:            { label: 'PM2.5', hours: 24, ranges: [[0, 30], [30, 60], [60, 90], [90, 120], [120, 250], [250, 500]] },
  pm10:             { label: 'PM10',  hours: 24, ranges: [[0, 50], [50, 100], [100, 250], [250, 350], [350, 430], [430, 600]] },
  nitrogen_dioxide: { label: 'NO\u2082', hours: 24, ranges: [[0, 40], [40, 80], [80, 180], [180, 280], [280, 400], [400, 800]] },
  sulphur_dioxide:  { label: 'SO\u2082', hours: 24, ranges: [[0, 40], [40, 80], [80, 380], [380, 800], [800, 1600], [1600, 2400]] },
  ozone:            { label: 'O\u2083',  hours: 8,  ranges: [[0, 50], [50, 100], [100, 168], [168, 208], [208, 748], [748, 1000]] },
  carbon_monoxide:  { label: 'CO',    hours: 8,  ranges: [[0, 1], [1, 2], [2, 10], [10, 17], [17, 34], [34, 50]], scale: 1 / 1000 },
};

function indiaSubIndex(value, ranges) {
  for (let i = 0; i < ranges.length; i++) {
    const [low, high] = ranges[i];
    if (value <= high) {
      const [bandLow, bandHigh] = INDIA_BANDS[i];
      return Math.round(bandLow + ((value - low) / (high - low)) * (bandHigh - bandLow));
    }
  }
  return 500;   // beyond the scale
}

// hourly: Open-Meteo's hourly lists; now: the index of the current hour.
function indiaAqi(hourly, now) {
  let worst = null;
  let counted = 0;
  for (const [key, rule] of Object.entries(INDIA_POLLUTANTS)) {
    const list = Array.isArray(hourly[key]) ? hourly[key] : [];
    const recent = list.slice(Math.max(0, now - rule.hours + 1), now + 1).filter(finite);
    if (recent.length < Math.ceil(rule.hours * 2 / 3)) continue;   // too little data
    const average = (recent.reduce((a, b) => a + b, 0) / recent.length) * (rule.scale || 1);
    const index = indiaSubIndex(Math.max(0, average), rule.ranges);
    counted++;
    if (!worst || index > worst.value) worst = { value: index, main: rule.label };
  }
  // The official rules need at least 3 pollutants, one of them PM2.5 or PM10.
  const hasPm = ['pm2_5', 'pm10'].some((k) => Array.isArray(hourly[k]) && finite(hourly[k][now]));
  return counted >= 3 && hasPm ? worst : null;
}

// Weather + air quality for one place. Temperatures are in °C and wind in
// km/h; the widget converts them if you chose °F.
async function fetchWeather(latitude, longitude) {
  const lat = Math.round(latitude * 100) / 100;
  const lon = Math.round(longitude * 100) / 100;
  const key = lat + ',' + lon;
  const cached = weatherCache.get(key);
  if (cached && Date.now() - cached.time < WEATHER_CACHE_MS) return cached.data;

  const where = '?latitude=' + lat + '&longitude=' + lon + '&timezone=auto';
  const [weather, air] = await Promise.all([
    getJson(WEATHER_SOURCE + where +
      '&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,weather_code,wind_speed_10m' +
      '&daily=weather_code,temperature_2m_max,temperature_2m_min&forecast_days=4'),
    getJson(AIR_SOURCE + where +
      '&current=us_aqi,pm2_5,pm10' +
      '&hourly=pm2_5,pm10,nitrogen_dioxide,sulphur_dioxide,ozone,carbon_monoxide&past_days=1&forecast_days=1'),
  ]);

  const now = weather && weather.current;
  if (!now || !finite(now.temperature_2m)) return { error: 'unavailable' };

  const daily = weather.daily || {};
  const days = (Array.isArray(daily.time) ? daily.time : []).slice(0, 4).map((date, i) => ({
    date: /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : '',
    code: finite(daily.weather_code && daily.weather_code[i]) ? daily.weather_code[i] : null,
    max: finite(daily.temperature_2m_max && daily.temperature_2m_max[i]) ? daily.temperature_2m_max[i] : null,
    min: finite(daily.temperature_2m_min && daily.temperature_2m_min[i]) ? daily.temperature_2m_min[i] : null,
  })).filter((d) => d.date);

  // Air quality (it is a separate service; the weather still shows if it fails).
  let airQuality = null;
  if (air && air.current) {
    const hourly = air.hourly || {};
    const times = Array.isArray(hourly.time) ? hourly.time : [];
    // The last hour that is not in the future ("2026-11-14T19:00" style text sorts by time).
    let nowIndex = -1;
    for (let i = 0; i < times.length; i++) if (times[i] <= air.current.time) nowIndex = i;
    airQuality = {
      us: finite(air.current.us_aqi) ? Math.round(air.current.us_aqi) : null,
      india: nowIndex >= 0 ? indiaAqi(hourly, nowIndex) : null,
      pm2_5: finite(air.current.pm2_5) ? Math.round(air.current.pm2_5) : null,
      pm10: finite(air.current.pm10) ? Math.round(air.current.pm10) : null,
    };
  }

  const data = {
    current: {
      temperature: now.temperature_2m,
      feelsLike: finite(now.apparent_temperature) ? now.apparent_temperature : null,
      humidity: finite(now.relative_humidity_2m) ? Math.round(now.relative_humidity_2m) : null,
      wind: finite(now.wind_speed_10m) ? now.wind_speed_10m : null,
      code: finite(now.weather_code) ? now.weather_code : null,
      isDay: now.is_day !== 0,
    },
    days,
    air: airQuality,
  };
  if (weatherCache.size > 20) weatherCache.clear();
  weatherCache.set(key, { time: Date.now(), data });
  return data;
}

// ---------- Bookmarks: checking and importing ----------
// By default bookmarks live in memory only and vanish when Klorine closes,
// like everything else. If you switch on "Keep bookmarks in the vault" in
// Settings, they are stored inside the vault (see "The vault" below),
// behind your master password.
//
// (An earlier version kept them in a file called bookmarks.bin, protected
// by Windows only. If that file exists it is moved into the vault when you
// create one, and then deleted.)
//
// Importing reads bookmarks ONLY (never passwords, history or cookies), and
// only after you click a browser or pick a file yourself:
//   - Chrome, Edge, Brave: their "Bookmarks" file (plain JSON text)
//   - Firefox: its "places.sqlite" database (we read a temporary copy)
//   - any browser: the "bookmarks.html" file made by its Export feature

const MAX_BOOKMARKS = 5000;
const bookmarksFile = () => path.join(app.getPath('userData'), 'bookmarks.bin');

// Checks a list of bookmarks: web addresses only, sensible lengths, no
// duplicates. Each entry becomes { title, url, folder }.
function cleanBookmarks(list) {
  const seen = new Set();
  const clean = [];
  for (const item of Array.isArray(list) ? list : []) {
    if (!item || typeof item.url !== 'string' || item.url.length > 2000) continue;
    let url;
    try { url = new URL(item.url); } catch (error) { continue; }
    if (url.protocol !== 'https:' && url.protocol !== 'http:') continue;
    if (seen.has(url.href)) continue;
    seen.add(url.href);
    clean.push({
      title: shortText(item.title, 200) || url.hostname,
      url: url.href,
      folder: shortText(item.folder, 200),
    });
    if (clean.length >= MAX_BOOKMARKS) break;
  }
  return clean;
}

async function canEncrypt() {
  try { return await safeStorage.isAsyncEncryptionAvailable(); } catch (error) { return false; }
}

// Returns the saved list, or null if the file is damaged / cannot be decrypted.
async function readSavedBookmarks() {
  try {
    const { result } = await safeStorage.decryptStringAsync(fs.readFileSync(bookmarksFile()));
    return cleanBookmarks(JSON.parse(result).bookmarks);
  } catch (error) {
    return null;
  }
}

// ---- Where other browsers keep their bookmarks ----
function otherBrowserFolders() {
  const home = os.homedir();
  if (process.platform === 'win32') {
    const local = process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local');
    const roaming = process.env.APPDATA || path.join(home, 'AppData', 'Roaming');
    return {
      chromium: [
        ['Chrome', path.join(local, 'Google', 'Chrome', 'User Data')],
        ['Edge', path.join(local, 'Microsoft', 'Edge', 'User Data')],
        ['Brave', path.join(local, 'BraveSoftware', 'Brave-Browser', 'User Data')],
      ],
      firefox: path.join(roaming, 'Mozilla', 'Firefox', 'Profiles'),
    };
  }
  if (process.platform === 'darwin') {
    const support = path.join(home, 'Library', 'Application Support');
    return {
      chromium: [
        ['Chrome', path.join(support, 'Google', 'Chrome')],
        ['Edge', path.join(support, 'Microsoft Edge')],
        ['Brave', path.join(support, 'BraveSoftware', 'Brave-Browser')],
      ],
      firefox: path.join(support, 'Firefox', 'Profiles'),
    };
  }
  const config = path.join(home, '.config');
  return {
    chromium: [
      ['Chrome', path.join(config, 'google-chrome')],
      ['Edge', path.join(config, 'microsoft-edge')],
      ['Brave', path.join(config, 'BraveSoftware', 'Brave-Browser')],
    ],
    firefox: path.join(home, '.mozilla', 'firefox'),
  };
}

const listFolders = (folder) => {
  try {
    return fs.readdirSync(folder, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);
  } catch (error) { return []; }
};

// Looks for other browsers on this computer. This only checks whether
// their bookmark files EXIST; nothing is read until you choose one.
// Returns [{ kind, name, file }].
function findBookmarkSources() {
  const folders = otherBrowserFolders();
  const sources = [];

  for (const [browser, root] of folders.chromium) {
    const profiles = listFolders(root)
      .filter((name) => name === 'Default' || /^Profile \d+$/.test(name))
      .filter((name) => fs.existsSync(path.join(root, name, 'Bookmarks')))
      .slice(0, 6);
    // People's own names for their profiles ("Work", "Personal") are in "Local State".
    let names = {};
    if (profiles.length > 1) {
      try {
        names = JSON.parse(fs.readFileSync(path.join(root, 'Local State'), 'utf8')).profile.info_cache || {};
      } catch (error) { /* use the folder names */ }
    }
    for (const profile of profiles) {
      const label = names[profile] && typeof names[profile].name === 'string' ? names[profile].name : profile;
      sources.push({
        kind: 'chromium',
        name: profiles.length > 1 ? browser + ' (' + shortText(label, 40) + ')' : browser,
        file: path.join(root, profile, 'Bookmarks'),
      });
    }
  }

  const firefoxProfiles = listFolders(folders.firefox)
    .filter((name) => fs.existsSync(path.join(folders.firefox, name, 'places.sqlite')))
    .slice(0, 6);
  for (const profile of firefoxProfiles) {
    sources.push({
      kind: 'firefox',
      name: firefoxProfiles.length > 1 ? 'Firefox (' + shortText(profile.replace(/^[^.]*\./, ''), 40) + ')' : 'Firefox',
      file: path.join(folders.firefox, profile, 'places.sqlite'),
    });
  }
  return sources;
}

const joinFolder = (parent, name) => [parent, shortText(name, 80).replace(/\//g, '-')].filter(Boolean).join('/');

// Chrome, Edge and Brave: a JSON file with three top folders.
function readChromiumBookmarks(file) {
  if (fs.statSync(file).size > 50 * 1024 * 1024) throw new Error('too big');
  const roots = JSON.parse(fs.readFileSync(file, 'utf8')).roots || {};
  const found = [];
  const walk = (node, folder, depth) => {
    if (!node || depth > 30 || found.length > MAX_BOOKMARKS * 2) return;
    if (node.type === 'url') found.push({ title: node.name, url: node.url, folder });
    for (const child of Array.isArray(node.children) ? node.children : []) {
      walk(child, child.type === 'folder' ? joinFolder(folder, child.name) : folder, depth + 1);
    }
  };
  for (const [key, label] of [['bookmark_bar', 'Bookmarks bar'], ['other', 'Other bookmarks'], ['synced', 'Mobile bookmarks']]) {
    if (roots[key]) walk({ children: roots[key].children }, label, 0);
  }
  return found;
}

// Firefox: a SQLite database. Firefox keeps it locked while running, so we
// read a temporary copy and delete the copy straight afterwards.
function readFirefoxBookmarks(file) {
  const { DatabaseSync } = require('node:sqlite');
  const folder = fs.mkdtempSync(path.join(app.getPath('temp'), 'klorine-import-'));
  let database = null;
  try {
    const copy = path.join(folder, 'places.sqlite');
    fs.copyFileSync(file, copy);
    // Recent changes may still be in the "-wal" side file.
    if (fs.existsSync(file + '-wal')) fs.copyFileSync(file + '-wal', copy + '-wal');
    database = new DatabaseSync(copy);
    const rows = database.prepare(
      'SELECT b.id AS id, b.type AS type, b.parent AS parent, b.title AS title, b.guid AS guid, p.url AS url ' +
      'FROM moz_bookmarks b LEFT JOIN moz_places p ON b.fk = p.id ORDER BY b.parent, b.position'
    ).all();

    const TOP = {
      'menu________': 'Bookmarks menu', 'toolbar_____': 'Bookmarks toolbar',
      'unfiled_____': 'Other bookmarks', 'mobile______': 'Mobile bookmarks',
    };
    const byId = new Map(rows.map((row) => [row.id, row]));
    // The folder path of a row, e.g. "Bookmarks toolbar/News" (null = skip it).
    const folderOf = (row, depth = 0) => {
      if (!row || depth > 30) return null;
      if (row.guid === 'tags________') return null;          // tags are not folders
      if (TOP[row.guid]) return TOP[row.guid];
      if (row.guid === 'root________') return '';
      const parent = folderOf(byId.get(row.parent), depth + 1);
      return parent === null ? null : joinFolder(parent, row.title || 'Folder');
    };
    const found = [];
    for (const row of rows) {
      if (row.type !== 1 || typeof row.url !== 'string') continue;   // 1 = a bookmark
      const parent = folderOf(byId.get(row.parent));
      if (parent !== null) found.push({ title: row.title, url: row.url, folder: parent });
    }
    return found;
  } finally {
    try { if (database) database.close(); } catch (error) { /* already closed */ }
    fs.rmSync(folder, { recursive: true, force: true });
  }
}

// An exported "bookmarks.html" file. Every browser writes the same simple
// layout:  <H3>Folder</H3> <DL> ... <A HREF="address">Title</A> ... </DL>
function readHtmlBookmarks(html) {
  const decode = (text) => text
    .replace(/&#(\d+);/g, (m, n) => String.fromCodePoint(Math.min(Number(n), 0x10ffff)))
    .replace(/&#x([0-9a-f]+);/gi, (m, n) => String.fromCodePoint(Math.min(parseInt(n, 16), 0x10ffff)))
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, '&');
  const found = [];
  const stack = [];          // the folders we are inside right now
  let nextFolder = null;     // the <H3> title waiting for its <DL>
  const tags = /<(\/?)(DL|H3|A)\b([^>]*)>([^<]*)/gi;
  let match;
  while ((match = tags.exec(html)) && found.length <= MAX_BOOKMARKS * 2) {
    const [, closing, tag, attributes, text] = match;
    const name = tag.toUpperCase();
    if (name === 'H3' && !closing) nextFolder = decode(text).trim();
    else if (name === 'DL' && !closing) { stack.push(nextFolder || ''); nextFolder = null; }
    else if (name === 'DL' && closing) stack.pop();
    else if (name === 'A' && !closing) {
      const href = /\bHREF\s*=\s*"([^"]*)"/i.exec(attributes);
      if (href) {
        found.push({
          title: decode(text).trim(),
          url: decode(href[1]),
          folder: stack.filter(Boolean).reduce((a, b) => joinFolder(a, b), ''),
        });
      }
    }
  }
  return found;
}

function setUpBookmarkRequests() {
  let sources = [];   // what "Import" last found: the page can only pick from this list

  // Which other browsers are on this computer? (Only checks; reads nothing.)
  ipcMain.handle('bookmarks:sources', (event) => {
    if (!fromOurToolbar(event)) return null;
    sources = findBookmarkSources();
    return sources.map((source, id) => ({ id, name: source.name }));
  });

  // Read the bookmarks of the browser you clicked.
  ipcMain.handle('bookmarks:read-source', (event, id) => {
    if (!fromOurToolbar(event)) return null;
    const source = Number.isInteger(id) ? sources[id] : null;
    if (!source) return { error: 'not-found' };
    try {
      const found = source.kind === 'firefox' ? readFirefoxBookmarks(source.file) : readChromiumBookmarks(source.file);
      return { name: source.name, bookmarks: cleanBookmarks(found) };
    } catch (error) {
      console.error('[BOOKMARKS] Could not read ' + source.name + ':', error.message);
      return { name: source.name, error: 'unreadable' };
    }
  });

  // Let you pick an exported bookmarks.html file, and read it.
  ipcMain.handle('bookmarks:read-file', async (event) => {
    if (!fromOurToolbar(event)) return null;
    const choice = await dialog.showOpenDialog(mainWindow, {
      title: 'Choose a bookmarks file',
      buttonLabel: 'Import',
      filters: [{ name: 'Bookmarks file (HTML)', extensions: ['html', 'htm'] }],
      properties: ['openFile'],
    });
    if (choice.canceled || choice.filePaths.length === 0) return null;
    const file = choice.filePaths[0];
    try {
      if (fs.statSync(file).size > 50 * 1024 * 1024) return { name: path.basename(file), error: 'unreadable' };
      return { name: path.basename(file), bookmarks: cleanBookmarks(readHtmlBookmarks(fs.readFileSync(file, 'utf8'))) };
    } catch (error) {
      return { name: path.basename(file), error: 'unreadable' };
    }
  });
}

// ---------- The vault: saved passwords and bookmarks ----------
// Nothing is saved unless you set up the vault yourself (Settings -> Saved
// data). The vault is ONE file in Klorine's app folder, vault.bin, protected
// twice over:
//
//   1. Your MASTER PASSWORD. It is stretched into a 256-bit key with
//      "scrypt" (deliberately slow, so guessing is expensive) and the
//      contents are locked with AES-256-GCM (which also detects tampering).
//      The master password itself is never stored anywhere.
//   2. Windows' own protection for your user account (DPAPI), wrapped
//      around the result, so the file is useless on another account or PC.
//
// While unlocked, the key and contents exist only in this program's memory.
// The vault locks itself when you have been away from the computer for a
// while, when Windows is locked or goes to sleep, and when Klorine closes.
//
// There is NO recovery: without the master password the vault cannot be
// opened by anyone, including us. It can only be deleted and started again.
//
// Nothing here ever leaves the computer: no account, no sync, no server.

const VAULT_VERSION = 1;
const VAULT_LABEL = Buffer.from('klorine-vault-v1');   // mixed into the encryption as a label
const SCRYPT_COST = { N: 131072, r: 8, p: 1, maxmem: 256 * 1024 * 1024 };   // about half a second, 128 MB
const MIN_MASTER_LENGTH = 8;
const MAX_LOGINS = 2000;
const AUTO_LOCK_CHOICES = [5, 15, 60, 0];     // minutes away from the computer; 0 = only when Klorine closes
const vaultFile = () => path.join(app.getPath('userData'), 'vault.bin');

const vault = {
  key: null,          // the 256-bit key (only while unlocked)
  salt: null,         // random bytes that make your key unique
  data: null,         // { logins: [...], never: [...], bookmarks: [...] } (only while unlocked)
  meta: null,         // { keepBookmarks, offerSave, autoLockMinutes } (not secret; readable while locked)
  exists: false,
  failures: 0,        // wrong master passwords in a row
  blockedUntil: 0,    // after 3 wrong tries, each next try must wait
};

const DEFAULT_VAULT_META = { keepBookmarks: false, offerSave: true, autoLockMinutes: 15 };
function cleanVaultMeta(meta) {
  const given = meta && typeof meta === 'object' ? meta : {};
  return {
    keepBookmarks: given.keepBookmarks === true,
    offerSave: given.offerSave !== false,
    autoLockMinutes: AUTO_LOCK_CHOICES.includes(given.autoLockMinutes) ? given.autoLockMinutes : DEFAULT_VAULT_META.autoLockMinutes,
  };
}

// A website's "origin": https://example.com (scheme + exact host + port).
// Passwords are saved for, and filled on, exactly one origin. Only secure
// (https) sites qualify; plain http is allowed just for this computer
// itself (localhost), which developers use.
function loginOrigin(url) {
  try {
    const parsed = new URL(url);
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname);
    if (parsed.protocol === 'https:' || (parsed.protocol === 'http:' && local)) return parsed.origin;
  } catch (error) { /* not a web address */ }
  return null;
}

function cleanLogin(item) {
  if (!item || typeof item !== 'object') return null;
  const origin = loginOrigin(String(item.origin || ''));
  const password = typeof item.password === 'string' ? item.password : '';
  if (!origin || password.length < 1 || password.length > 1000) return null;
  const now = Date.now();
  return {
    id: /^[0-9a-f-]{36}$/.test(item.id) ? item.id : crypto.randomUUID(),
    origin,
    username: typeof item.username === 'string' ? item.username.slice(0, 300) : '',
    password,
    created: Number.isFinite(item.created) ? item.created : now,
    updated: Number.isFinite(item.updated) ? item.updated : now,
  };
}

function cleanVaultData(data) {
  const given = data && typeof data === 'object' ? data : {};
  return {
    logins: (Array.isArray(given.logins) ? given.logins : []).map(cleanLogin).filter(Boolean).slice(0, MAX_LOGINS),
    never: [...new Set((Array.isArray(given.never) ? given.never : []).map((o) => loginOrigin(String(o))).filter(Boolean))].slice(0, 500),
    bookmarks: cleanBookmarks(given.bookmarks),
  };
}

// Master password -> key. Slow on purpose.
function deriveVaultKey(password, salt) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(Buffer.from(password.normalize('NFKC'), 'utf8'), salt, 32, SCRYPT_COST, (error, key) => {
      if (error) reject(error); else resolve(key);
    });
  });
}

// Reads the file's outer layer (Windows' protection). Returns the parts,
// or null if there is no file or it cannot be read.
async function readVaultFile() {
  try {
    const { result } = await safeStorage.decryptStringAsync(fs.readFileSync(vaultFile()));
    const outer = JSON.parse(result);
    if (outer.version !== VAULT_VERSION) return null;
    return {
      salt: Buffer.from(outer.salt, 'base64'),
      iv: Buffer.from(outer.iv, 'base64'),
      tag: Buffer.from(outer.tag, 'base64'),
      sealed: Buffer.from(outer.sealed, 'base64'),
      meta: cleanVaultMeta(outer.meta),
    };
  } catch (error) {
    return null;
  }
}

// Locks the current contents with the key and writes the file.
async function writeVaultFile() {
  if (!vault.key || !vault.data) throw new Error('vault is locked');
  const iv = crypto.randomBytes(12);   // a fresh random start for every save
  const cipher = crypto.createCipheriv('aes-256-gcm', vault.key, iv);
  cipher.setAAD(VAULT_LABEL);
  const sealed = Buffer.concat([cipher.update(JSON.stringify(vault.data), 'utf8'), cipher.final()]);
  const outer = JSON.stringify({
    version: VAULT_VERSION,
    salt: vault.salt.toString('base64'),
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    sealed: sealed.toString('base64'),
    meta: vault.meta,
  });
  const wrapped = await safeStorage.encryptStringAsync(outer);
  fs.mkdirSync(app.getPath('userData'), { recursive: true });
  // Write to a spare file first, then swap, so a crash cannot corrupt it.
  fs.writeFileSync(vaultFile() + '.tmp', wrapped);
  fs.renameSync(vaultFile() + '.tmp', vaultFile());
  vault.exists = true;
}

// Should pages be watched for sign-in forms? Only once a vault exists and
// "Offer to save passwords" is on.
function captureEnabled() {
  return vault.exists && Boolean(vault.meta && vault.meta.offerSave);
}

// Tells every open page whether to watch for sign-in forms.
function tellPagesAboutCapture() {
  for (const contents of webContents.getAllWebContents()) {
    if (!contents.isDestroyed() && contents.getType() === 'webview') {
      try { contents.send('page:capture', captureEnabled()); } catch (error) { /* page is closing */ }
    }
  }
}

function vaultStatus() {
  return {
    exists: vault.exists,
    unlocked: Boolean(vault.key),
    keepBookmarks: Boolean(vault.meta && vault.meta.keepBookmarks),
    offerSave: Boolean(vault.meta && vault.meta.offerSave),
    autoLockMinutes: vault.meta ? vault.meta.autoLockMinutes : DEFAULT_VAULT_META.autoLockMinutes,
    logins: vault.data ? vault.data.logins.length : null,
  };
}

// Sign-ins waiting for you to answer "Save password?". Kept in memory for
// at most 3 minutes, then forgotten.
const pendingLogins = new Map();   // token -> { tabId, origin, username, password, time }
const PENDING_LOGIN_MS = 3 * 60 * 1000;
let clipboardTimer = null;
let lastImportFile = null;

function lockVault(reason) {
  if (!vault.key) return;
  vault.key.fill(0);      // overwrite the key in memory
  vault.key = null;
  vault.data = null;
  pendingLogins.clear();
  callInterface('vaultLocked', { reason: String(reason || 'manual') });
}

// Reads the vault's (non-secret) settings when Klorine starts.
async function loadVaultInfo() {
  vault.exists = fs.existsSync(vaultFile());
  vault.meta = { ...DEFAULT_VAULT_META };
  const outer = vault.exists ? await readVaultFile() : null;
  if (outer) vault.meta = outer.meta;
}

function setUpVault() {
  const vaultReady = loadVaultInfo();

  // Lock when you have been away, when Windows locks, or on sleep.
  setInterval(() => {
    const minutes = vault.meta ? vault.meta.autoLockMinutes : 0;
    if (vault.key && minutes > 0 && powerMonitor.getSystemIdleTime() >= minutes * 60) lockVault('idle');
  }, 20 * 1000);
  powerMonitor.on('lock-screen', () => lockVault('screen-locked'));
  powerMonitor.on('suspend', () => lockVault('sleep'));
  app.on('before-quit', () => lockVault('quit'));

  const fromToolbar = (handler) => async (event, ...args) => (fromOurToolbar(event) ? handler(...args) : null);
  const validMaster = (text) => typeof text === 'string' && text.length >= MIN_MASTER_LENGTH && text.length <= 256;

  ipcMain.handle('vault:status', fromToolbar(async () => {
    await vaultReady;
    return { ...vaultStatus(), canEncrypt: await canEncrypt(), legacyBookmarks: !vault.exists && fs.existsSync(bookmarksFile()) };
  }));

  // Bookmarks saved by the earlier version (before the vault existed).
  ipcMain.handle('vault:legacy-bookmarks', fromToolbar(async () => (await readSavedBookmarks()) || []));

  // Create the vault with a new master password.
  ipcMain.handle('vault:create', fromToolbar(async (password, options) => {
    if (vault.exists) return { ok: false, error: 'exists' };
    if (!validMaster(password)) return { ok: false, error: 'too-short' };
    if (!(await canEncrypt())) return { ok: false, error: 'no-encryption' };
    try {
      const keep = Boolean(options && options.keepBookmarks);
      vault.salt = crypto.randomBytes(16);
      vault.key = await deriveVaultKey(password, vault.salt);
      vault.data = cleanVaultData({ bookmarks: keep ? options.bookmarks : [] });
      vault.meta = cleanVaultMeta({ ...DEFAULT_VAULT_META, keepBookmarks: keep });
      await writeVaultFile();
      fs.rmSync(bookmarksFile(), { force: true });    // the old unprotected-by-password file
      vault.failures = 0;
      tellPagesAboutCapture();
      return { ok: true, status: vaultStatus() };
    } catch (error) {
      vault.key = null; vault.data = null;
      return { ok: false, error: 'failed' };
    }
  }));

  // Unlock with the master password.
  ipcMain.handle('vault:unlock', fromToolbar(async (password) => {
    if (vault.key) return { ok: true, status: vaultStatus(), bookmarks: vault.data.bookmarks };
    const wait = Math.ceil((vault.blockedUntil - Date.now()) / 1000);
    if (wait > 0) return { ok: false, error: 'wait', seconds: wait };
    if (typeof password !== 'string' || password.length < 1 || password.length > 256) return { ok: false, error: 'wrong' };
    const outer = await readVaultFile();
    if (!outer) return { ok: false, error: vault.exists ? 'damaged' : 'missing' };
    try {
      const key = await deriveVaultKey(password, outer.salt);
      const decipher = crypto.createDecipheriv('aes-256-gcm', key, outer.iv);
      decipher.setAAD(VAULT_LABEL);
      decipher.setAuthTag(outer.tag);
      const plain = Buffer.concat([decipher.update(outer.sealed), decipher.final()]).toString('utf8');   // throws if the password is wrong
      vault.key = key;
      vault.salt = outer.salt;
      vault.data = cleanVaultData(JSON.parse(plain));
      vault.meta = outer.meta;
      vault.failures = 0;
      return { ok: true, status: vaultStatus(), bookmarks: vault.data.bookmarks };
    } catch (error) {
      // Wrong password. After 3 misses, make each further try wait longer
      // (2 s, 4 s, 8 s ... up to 1 minute).
      vault.failures++;
      if (vault.failures >= 3) vault.blockedUntil = Date.now() + Math.min(60, 2 ** (vault.failures - 2)) * 1000;
      return { ok: false, error: 'wrong' };
    }
  }));

  ipcMain.handle('vault:lock', fromToolbar(() => { lockVault('manual'); return vaultStatus(); }));

  // Change the master password (needs the current one again).
  ipcMain.handle('vault:change-password', fromToolbar(async (current, next) => {
    if (!vault.key) return { ok: false, error: 'locked' };
    if (!validMaster(next)) return { ok: false, error: 'too-short' };
    if (typeof current !== 'string') return { ok: false, error: 'wrong' };
    const check = await deriveVaultKey(current, vault.salt);
    if (!crypto.timingSafeEqual(check, vault.key)) return { ok: false, error: 'wrong' };
    const oldKey = vault.key, oldSalt = vault.salt;
    try {
      vault.salt = crypto.randomBytes(16);
      vault.key = await deriveVaultKey(next, vault.salt);
      await writeVaultFile();
      oldKey.fill(0);
      return { ok: true };
    } catch (error) {
      vault.key = oldKey; vault.salt = oldSalt;
      return { ok: false, error: 'failed' };
    }
  }));

  // Delete the vault and everything in it (also the way out if the master
  // password is forgotten).
  ipcMain.handle('vault:delete', fromToolbar(() => {
    lockVault('deleted');
    for (const file of [vaultFile(), vaultFile() + '.tmp', bookmarksFile(), bookmarksFile() + '.tmp']) fs.rmSync(file, { force: true });
    vault.exists = false;
    vault.meta = { ...DEFAULT_VAULT_META };
    vault.failures = 0; vault.blockedUntil = 0;
    tellPagesAboutCapture();
    return vaultStatus();
  }));

  // Change a setting: { keepBookmarks, offerSave, autoLockMinutes }.
  ipcMain.handle('vault:set', fromToolbar(async (changes, bookmarks) => {
    if (!vault.key || !changes || typeof changes !== 'object') return null;
    const next = cleanVaultMeta({ ...vault.meta, ...changes });
    if (next.keepBookmarks && !vault.meta.keepBookmarks) vault.data.bookmarks = cleanBookmarks(bookmarks);
    if (!next.keepBookmarks) vault.data.bookmarks = [];
    vault.meta = next;
    await writeVaultFile();
    tellPagesAboutCapture();
    return vaultStatus();
  }));

  ipcMain.handle('vault:save-bookmarks', fromToolbar(async (list) => {
    if (!vault.key || !vault.meta.keepBookmarks) return false;
    vault.data.bookmarks = cleanBookmarks(list);
    try { await writeVaultFile(); return true; } catch (error) { return false; }
  }));

  // ---- The saved passwords list (for the "Passwords" window) ----
  // The list never includes the passwords themselves; those are fetched one
  // at a time, when you click "show" or "copy".
  const findLogin = (id) => (vault.data ? vault.data.logins.find((login) => login.id === id) : null);

  ipcMain.handle('passwords:list', fromToolbar(() => {
    if (!vault.key) return null;
    return {
      logins: vault.data.logins.map(({ id, origin, username, updated }) => ({ id, origin, username, updated })),
      never: vault.data.never,
    };
  }));

  ipcMain.handle('passwords:reveal', fromToolbar((id) => {
    const login = findLogin(id);
    return login ? login.password : null;
  }));

  // Copies a username or password. A copied password is wiped from the
  // clipboard after 30 seconds (unless you copied something else meanwhile).
  ipcMain.handle('passwords:copy', fromToolbar((id, what) => {
    const login = findLogin(id);
    if (!login) return false;
    const text = what === 'username' ? login.username : login.password;
    clipboard.writeText(text);
    clearTimeout(clipboardTimer);
    if (what !== 'username') {
      clipboardTimer = setTimeout(() => {
        if (clipboard.readText() === text) clipboard.clear();
      }, 30 * 1000);
    }
    return true;
  }));

  ipcMain.handle('passwords:delete', fromToolbar(async (id) => {
    if (!vault.key) return false;
    vault.data.logins = vault.data.logins.filter((login) => login.id !== id);
    await writeVaultFile();
    return true;
  }));

  ipcMain.handle('passwords:allow-site', fromToolbar(async (origin) => {
    if (!vault.key) return false;
    vault.data.never = vault.data.never.filter((o) => o !== origin);
    await writeVaultFile();
    return true;
  }));

  // ---- Passwords for the page in a tab ----
  // What the key button shows: which saved sign-ins match this exact site.
  ipcMain.handle('passwords:for-tab', fromToolbar((tabId) => {
    const contents = ourTab(tabId);
    const origin = contents ? loginOrigin(contents.getURL()) : null;
    if (!origin) return { origin: null, logins: [], locked: !vault.key };
    return {
      origin,
      locked: !vault.key,
      logins: vault.key ? vault.data.logins.filter((l) => l.origin === origin).map(({ id, username }) => ({ id, username })) : [],
    };
  }));

  // Fill a saved sign-in into the page. Only ever done because you clicked
  // it, and only if the page is still exactly the site it was saved for.
  ipcMain.handle('passwords:fill', fromToolbar(async (tabId, id) => {
    const contents = ourTab(tabId);
    const login = findLogin(id);
    if (!contents || !login) return 'unavailable';
    if (loginOrigin(contents.getURL()) !== login.origin || contents.mainFrame.origin !== login.origin) return 'wrong-site';
    const code = '(' + fillLoginInPage.toString() + ')(' +
      JSON.stringify(login.origin) + ',' + JSON.stringify(login.username) + ',' + JSON.stringify(login.password) + ')';
    try {
      // Runs in the page's top document only: never inside embedded frames.
      return await contents.mainFrame.executeJavaScript(code, true);
    } catch (error) {
      return 'failed';
    }
  }));

  // ---- "Save password?" ----
  // You answered Save: store the waiting sign-in (the vault must be unlocked).
  ipcMain.handle('passwords:save-pending', fromToolbar(async (token) => {
    const pending = pendingLogins.get(token);
    if (!pending || Date.now() - pending.time > PENDING_LOGIN_MS) { pendingLogins.delete(token); return { ok: false, error: 'expired' }; }
    if (!vault.key) return { ok: false, error: 'locked' };
    pendingLogins.delete(token);
    const existing = vault.data.logins.find((l) => l.origin === pending.origin && l.username === pending.username);
    if (existing) {
      existing.password = pending.password;
      existing.updated = Date.now();
    } else {
      if (vault.data.logins.length >= MAX_LOGINS) return { ok: false, error: 'full' };
      vault.data.logins.push(cleanLogin(pending));
    }
    await writeVaultFile();
    return { ok: true, updated: Boolean(existing) };
  }));

  // You answered Not now (never = false) or Never for this site (true).
  ipcMain.handle('passwords:drop-pending', fromToolbar(async (token, never) => {
    const pending = pendingLogins.get(token);
    pendingLogins.delete(token);
    if (never === true && pending && vault.key && !vault.data.never.includes(pending.origin)) {
      vault.data.never.push(pending.origin);
      await writeVaultFile();
    }
    return true;
  }));

  // ---- Importing passwords from a CSV file ----
  // Other browsers and password managers can export a ".csv" file. That
  // file is NOT encrypted, so afterwards Klorine offers to delete it.
  ipcMain.handle('passwords:import-csv', fromToolbar(async () => {
    if (!vault.key) return { error: 'locked' };
    const choice = await dialog.showOpenDialog(mainWindow, {
      title: 'Choose a passwords file',
      buttonLabel: 'Import',
      filters: [{ name: 'Passwords file (CSV)', extensions: ['csv'] }],
      properties: ['openFile'],
    });
    if (choice.canceled || choice.filePaths.length === 0) return null;
    const file = choice.filePaths[0];
    try {
      if (fs.statSync(file).size > 20 * 1024 * 1024) return { name: path.basename(file), error: 'unreadable' };
      const found = readCsvLogins(fs.readFileSync(file, 'utf8'));
      if (found === null) return { name: path.basename(file), error: 'unreadable' };
      let added = 0, skipped = 0;
      for (const item of found) {
        const login = cleanLogin(item);
        if (!login) { skipped++; continue; }
        const same = vault.data.logins.find((l) => l.origin === login.origin && l.username === login.username);
        if (same || vault.data.logins.length >= MAX_LOGINS) { skipped++; continue; }
        vault.data.logins.push(login);
        added++;
      }
      if (added > 0) await writeVaultFile();
      lastImportFile = file;
      return { name: path.basename(file), added, skipped };
    } catch (error) {
      return { name: path.basename(file), error: 'unreadable' };
    }
  }));

  // Deletes the CSV file you just imported (only that file).
  ipcMain.handle('passwords:delete-import-file', fromToolbar(() => {
    if (!lastImportFile) return false;
    try { fs.rmSync(lastImportFile, { force: true }); lastImportFile = null; return true; } catch (error) { return false; }
  }));

  // ---- Messages from web pages (through page-preload.js) ----
  // A page's helper may only say three things, all checked here:
  //   "is watching switched on?", "this page has a password box" and
  //   "the user just submitted this sign-in".
  const pageTab = (event) => {
    const contents = ourTab(event.sender.id);
    return contents && event.senderFrame === contents.mainFrame ? contents : null;
  };

  ipcMain.handle('page:capture-enabled', (event) => Boolean(pageTab(event)) && captureEnabled());

  ipcMain.on('page:password-field', (event, has) => {
    const contents = pageTab(event);
    if (contents && captureEnabled()) callInterface('passwordField', { id: contents.id, has: has === true });
  });

  ipcMain.on('page:login', (event, details) => {
    const contents = pageTab(event);
    if (!contents || !captureEnabled() || !details) return;
    const origin = loginOrigin(event.senderFrame.url);
    const { username, password } = details;
    if (!origin || typeof password !== 'string' || password.length < 1 || password.length > 1000) return;
    const name = typeof username === 'string' ? username.slice(0, 300) : '';

    let update = false;
    if (vault.key) {
      if (vault.data.never.includes(origin)) return;                        // you said "never" here
      const existing = vault.data.logins.find((l) => l.origin === origin && l.username === name);
      if (existing && existing.password === password) return;               // already saved
      update = Boolean(existing);
    }
    // Replace any earlier question still waiting for this tab.
    for (const [token, pending] of pendingLogins) {
      if (pending.tabId === contents.id || Date.now() - pending.time > PENDING_LOGIN_MS) pendingLogins.delete(token);
    }
    const token = crypto.randomUUID();
    pendingLogins.set(token, { tabId: contents.id, origin, username: name, password, time: Date.now() });
    setTimeout(() => pendingLogins.delete(token), PENDING_LOGIN_MS);
    callInterface('offerSave', { id: contents.id, token, host: new URL(origin).host, username: name, update });
  });
}

// This function is sent INTO the web page to type a saved sign-in. It fills
// only boxes you can actually see, in the page itself (not embedded frames),
// and double-checks the site first.
function fillLoginInPage(origin, username, password) {
  if (location.origin !== origin) return 'wrong-site';
  const visible = (el) => {
    const box = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    return box.width > 8 && box.height > 8 && style.visibility !== 'hidden' && style.display !== 'none' &&
      Number(style.opacity) > 0.1 && !el.disabled && !el.readOnly;
  };
  const type = (el, value) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    el.focus();
    setter.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  };
  const isNameBox = (el) => ['text', 'email', 'tel'].includes(el.type);
  const inputs = Array.from(document.querySelectorAll('input')).filter(visible);
  const active = document.activeElement;
  const passBox = active && active.type === 'password' && inputs.includes(active) ? active : inputs.find((el) => el.type === 'password');

  let nameBox = null;
  if (passBox) {
    const scope = passBox.form ? inputs.filter((el) => el.form === passBox.form) : inputs;
    const before = scope.slice(0, scope.indexOf(passBox)).filter(isNameBox);
    nameBox = before[before.length - 1] || null;
  } else {
    // A sign-in spread over two pages: only the username box is here.
    nameBox = inputs.find((el) => isNameBox(el) &&
      /user|email|login|account|identifier/i.test([el.autocomplete, el.name, el.id].join(' '))) || null;
  }
  if (nameBox && username) type(nameBox, username);
  if (passBox) { type(passBox, password); return 'filled'; }
  return nameBox && username ? 'username-only' : 'no-form';
}

// Reads a passwords CSV exported by Chrome, Edge, Brave, Firefox, Bitwarden
// and similar. Returns [{ origin, username, password }] or null if the file
// has no recognisable columns.
function readCsvLogins(text) {
  // Split into rows and cells, honouring "quoted, cells" and "" inside quotes.
  const rows = [];
  let row = [], cell = '', quoted = false;
  const source = text.replace(/^﻿/, '');
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (quoted) {
      if (ch === '"' && source[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && source[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some((c) => c !== '')) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c !== '')) rows.push(row);
  if (rows.length < 2) return null;

  const header = rows[0].map((name) => name.trim().toLowerCase());
  const column = (...names) => header.findIndex((name) => names.includes(name));
  const urlAt = column('url', 'login_uri', 'website', 'origin', 'web site', 'hostname');
  const userAt = column('username', 'login_username', 'user', 'login', 'email');
  const passAt = column('password', 'login_password');
  if (urlAt === -1 || passAt === -1) return null;

  return rows.slice(1).map((cells) => ({
    origin: /^https?:\/\//i.test(cells[urlAt] || '') ? cells[urlAt] : 'https://' + (cells[urlAt] || ''),
    username: userAt === -1 ? '' : (cells[userAt] || ''),
    password: cells[passAt] || '',
  }));
}

// page-preload.js asks this (once per page or frame, as it starts):
// "which made-up fingerprint should this site get?" The answer is a code
// made from the session secret and the site of the TAB (so an advert frame
// gets a different one on every site). Empty = no protection (Shields off
// for this site, or not a website). It also passes on WEBSITE_LANGUAGES,
// so what pages read matches what every request says.
function setUpFingerprintSeeds() {
  ipcMain.on('page:shield-seed', (event) => {
    let seed = '';
    try {
      if (ourTab(event.sender.id)) {
        const top = event.senderFrame && event.senderFrame.top ? event.senderFrame.top.url : event.sender.getURL();
        const url = new URL(top);
        if ((url.protocol === 'https:' || url.protocol === 'http:') && !shieldsDownSites.has(url.hostname)) {
          seed = crypto.createHmac('sha256', FINGERPRINT_SECRET).update(siteKey(url.hostname)).digest('hex').slice(0, 32);
        }
      }
    } catch (error) {
      seed = '';
    }
    event.returnValue = { seed, languages: WEBSITE_LANGUAGES, hiddenFonts: seed ? hiddenFonts() : [] };
  });
}

// ---------- Updates ----------
// A browser must get security fixes quickly, so the installed Klorine looks
// for new versions by itself: 15 seconds after starting, then every 6 hours.
//
//   Where it looks: the "Releases" page of Klorine's GitHub repository (set
//   in package.json -> "build" -> "publish"). That one request tells GitHub
//   only that some copy of Klorine checked for updates: no account, no ID.
//
//   What happens: NOTHING is downloaded or installed without you. Klorine
//   only tells you a new version exists; you click "Download update" in
//   Settings -> About and updates, and then "Restart and install".
//   (If you download but don't restart, it installs when Klorine closes.)
//
//   Safety: the download comes over HTTPS from GitHub and is checked
//   against the fingerprint (SHA-512) published with the release before it
//   is installed.
//
// Updates only work in the INSTALLED Klorine (made with "npm run dist"),
// not when it is started with "npm start".
//
// The Microsoft Store edition never looks for updates itself: the Store
// delivers them, so all of this is switched off there.
const UPDATE_CHECK_EVERY_MS = 6 * 60 * 60 * 1000;
const updates = {
  status: 'idle',     // idle, checking, none, available, downloading, ready, error, unsupported, store
  current: app.getVersion(),
  version: null,      // the new version, when there is one
  percent: 0,         // download progress
  checked: 0,         // when Klorine last looked
  downloadFailed: false,   // the last download did not finish
};

function setUpUpdates() {
  const tell = (changes) => {
    Object.assign(updates, changes);
    callInterface('updateStatus', { ...updates });
  };

  let autoUpdater = null;
  try {
    ({ autoUpdater } = require('electron-updater'));
  } catch (error) {
    autoUpdater = null;    // not installed: Klorine still works, without updates
  }
  const fromStore = process.windowsStore === true;     // installed from the Microsoft Store
  const usable = () => Boolean(autoUpdater) && app.isPackaged && !fromStore;
  if (fromStore) updates.status = 'store';
  else if (!usable()) updates.status = 'unsupported';

  if (autoUpdater) {
    autoUpdater.autoDownload = false;           // ask first
    autoUpdater.autoInstallOnAppQuit = true;    // a downloaded update installs when Klorine closes
    autoUpdater.allowDowngrade = false;
    autoUpdater.logger = null;

    autoUpdater.on('checking-for-update', () => tell({ status: 'checking' }));
    autoUpdater.on('update-not-available', () => tell({ status: 'none', version: null, checked: Date.now() }));
    autoUpdater.on('update-available', (info) => tell({
      status: 'available', version: String(info && info.version || '').slice(0, 30), checked: Date.now(),
    }));
    autoUpdater.on('download-progress', (progress) => tell({
      status: 'downloading', percent: Math.max(0, Math.min(100, Math.round(progress && progress.percent || 0))),
    }));
    autoUpdater.on('update-downloaded', () => tell({ status: 'ready', percent: 100 }));
    autoUpdater.on('error', (error) => {
      console.error('[UPDATES]', error && error.message);
      if (updates.status === 'ready') return;                 // already downloaded: nothing lost
      if (updates.status === 'downloading') {
        tell({ status: 'available', downloadFailed: true });  // still on offer: you can try again
      } else if (updates.status !== 'available') {
        tell({ status: 'error', checked: Date.now() });
      }
    });
  }

  const check = () => {
    if (!usable() || ['checking', 'downloading', 'ready'].includes(updates.status)) return;
    autoUpdater.checkForUpdates().catch(() => {});
  };
  setTimeout(check, 15 * 1000);
  setInterval(check, UPDATE_CHECK_EVERY_MS);

  ipcMain.handle('updates:status', (event) => (fromOurToolbar(event) ? { ...updates } : null));
  ipcMain.handle('updates:check', (event) => {
    if (!fromOurToolbar(event)) return null;
    check();
    return { ...updates };
  });
  ipcMain.handle('updates:download', (event) => {
    if (!fromOurToolbar(event)) return null;
    if (usable() && updates.status === 'available') {
      tell({ status: 'downloading', percent: 0, downloadFailed: false });
      autoUpdater.downloadUpdate().catch(() => {});
    }
    return { ...updates };
  });
  // Close Klorine (wiping everything as usual), install, and start again.
  ipcMain.handle('updates:install', (event) => {
    if (!fromOurToolbar(event)) return null;
    if (usable() && updates.status === 'ready') setImmediate(() => autoUpdater.quitAndInstall(false, true));
    return { ...updates };
  });
}

function setUpShieldsRequests() {
  ipcMain.handle('shields:status', (event, id) => {
    const contents = fromOurToolbar(event) && ourTab(id);
    return contents ? shieldsStatus(contents) : null;
  });

  ipcMain.handle('shields:set-scripts', (event, id, blocked) => {
    const contents = fromOurToolbar(event) && ourTab(id);
    if (!contents) return null;
    const host = tabHost(contents);
    if (host === '') return shieldsStatus(contents);

    if (blocked === true) scriptBlockedSites.add(host); else scriptBlockedSites.delete(host);
    console.log('[SHIELDS] JavaScript', blocked === true ? 'blocked' : 'allowed', 'on', host);
    contents.reload();   // the change applies when the page loads again
    return shieldsStatus(contents);
  });

  ipcMain.handle('shields:set-down', (event, id, down) => {
    const contents = fromOurToolbar(event) && ourTab(id);
    if (!contents) return null;
    const host = tabHost(contents);
    if (host === '') return shieldsStatus(contents);

    if (down === true) shieldsDownSites.add(host); else shieldsDownSites.delete(host);
    console.log('[SHIELDS]', down === true ? 'off' : 'on', 'for', host);
    contents.reload();   // the change applies when the page loads again
    return shieldsStatus(contents);
  });

  ipcMain.handle('shields:wipe-site', async (event, id) => {
    const contents = fromOurToolbar(event) && ourTab(id);
    if (!contents || tabHost(contents) === '') return false;
    await wipeSiteData(contents);
    return true;
  });
}


// =============================================================================
//  SECTION 6 — APPLICATION MENU
// =============================================================================
//  Electron's built-in menu has shortcuts that are wrong for a browser: its
//  Ctrl+R would reload our whole toolbar (losing every tab) and its Ctrl+W
//  would close the window. This replaces it with our own.
//
//  "CmdOrCtrl" means Cmd on a Mac and Ctrl on Windows/Linux. Menu shortcuts
//  work no matter where the keyboard focus is, even inside a web page.
// =============================================================================

function buildApplicationMenu() {
  const template = [
    // Macs expect a first menu named after the app (About, Quit, ...).
    ...(isMac ? [{ role: 'appMenu' }] : []),

    // Standard Undo / Cut / Copy / Paste / Select All.
    { role: 'editMenu' },

    {
      label: 'View',
      submenu: [
        {
          label: 'Reload Page',
          accelerator: 'CmdOrCtrl+R',
          click: () => callInterface('command', 'reload'),
        },
        {
          // A hard reload ignores cached copies and downloads the page afresh.
          label: 'Hard Reload Page',
          accelerator: 'CmdOrCtrl+Shift+R',
          click: () => callInterface('command', 'hard-reload'),
        },
        { type: 'separator' },
        {
          // Opens the inspection tools for the page in the active tab.
          label: 'Toggle Developer Tools',
          accelerator: 'F12',
          click: () => callInterface('command', 'toggle-devtools'),
        },
        {
          // Prints a health report in the terminal (see "Diagnostics").
          label: 'Print Diagnostics',
          accelerator: 'CmdOrCtrl+Shift+D',
          click: () => printDiagnostics(),
        },
        {
          // Developer tools for Klorine's OWN toolbar (not the web page):
          // useful for seeing why a Klorine feature is not working.
          label: 'Toggle Klorine Developer Tools',
          accelerator: 'CmdOrCtrl+Shift+I',
          click: () => {
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.toggleDevTools();
            }
          },
        },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}


// =============================================================================
//  SECTION 7 — CREATE THE BROWSER WINDOW
// =============================================================================

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 720,
    minHeight: 480,
    title: APP_NAME,

    // The app icon shown on the window and in the taskbar (Windows, Linux).
    // macOS uses the Dock instead, which is set at start-up.
    icon: APP_ICON,

    // --- Our own title bar (Windows, Linux) ---
    // Windows paints the normal title bar in your system accent color (often
    // blue), and apps cannot recolor it. So, like Chrome and Edge, we hide it:
    // the tab strip becomes the top of the window, and Windows draws only the
    // minimize / maximize / close buttons, in colors we choose. renderer.js
    // keeps those colors in step with the theme (see Section 5).
    // macOS keeps its normal title bar, which is never blue.
    ...(isMac ? {} : {
      titleBarStyle: 'hidden',
      titleBarOverlay: { color: '#9CAF88', symbolColor: '#1E2618', height: 52 },
    }),

    // webPreferences are the security settings for OUR user interface page.
    webPreferences: {
      // Keep the toolbar's own data (fonts, tab icons) in memory only.
      partition: TOOLBAR_PARTITION,

      // preload.js gives the toolbar (and ONLY the toolbar) three narrow
      // functions for the Shields panel. Web pages never get it (see
      // "will-attach-webview" below).
      preload: path.join(__dirname, 'preload.js'),

      // The page cannot use Node.js (the tools that reach your files and
      // operating system). This is the single most important safety switch.
      nodeIntegration: false,

      // Keeps Electron's internal code in a separate "world" from page code,
      // so a page can never tamper with or borrow Electron's powers.
      contextIsolation: true,

      // Runs the page inside Chromium's operating-system sandbox, the same
      // protection Chrome uses.
      sandbox: true,

      // Enforces normal web security rules. (On by default; stated for clarity.)
      webSecurity: true,

      // Never load insecure (http) content inside a secure (https) page.
      allowRunningInsecureContent: false,

      // Allows the <webview> tag. It is off by default, and we need it
      // because it is the element that displays websites.
      webviewTag: true,

      // Turn off the built-in spell checker so that no dictionary files are
      // downloaded from the internet.
      spellcheck: false,
    },
  });

  // Hide the menu bar (Windows and Linux) for a clean look. Its keyboard
  // shortcuts keep working while it is hidden.
  mainWindow.setMenuBarVisibility(false);

  // Load our user interface.
  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  // --- Guard every <webview> before it is created ---------------------------
  // This runs just before a tab's webview comes to life. We overwrite its
  // settings here so that, whatever the interface says, it is locked down.
  mainWindow.webContents.on('will-attach-webview', (event, webPreferences, params) => {
    // Whatever the interface asked for, every page gets exactly ONE helper
    // script, chosen here: page-preload.js. It gives the PAGE nothing at
    // all; it only notices sign-in forms so Klorine can offer to save a
    // password (and does nothing unless you have set up the vault).
    webPreferences.preload = path.join(__dirname, 'page-preload.js');
    // ...in every frame inside the page too (adverts, embedded videos...),
    // so fingerprint protection covers them. This gives frames no extra
    // powers: nodeIntegration stays off and every frame stays sandboxed.
    webPreferences.nodeIntegrationInSubFrames = true;

    // The same strict rules as the main window.
    webPreferences.nodeIntegration = false;
    webPreferences.contextIsolation = true;
    webPreferences.sandbox = true;
    webPreferences.webSecurity = true;
    webPreferences.allowRunningInsecureContent = false;

    // No spell checker inside web pages either (see Section 10).
    webPreferences.spellcheck = false;

    // Force the memory-only private profile.
    params.partition = PRIVATE_PARTITION;
  });

  // Our toolbar page must never navigate away from index.html.
  mainWindow.webContents.on('will-navigate', (event) => {
    event.preventDefault();
  });

  // Our toolbar page must never open extra windows.
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}


// =============================================================================
//  SECTION 8 — RULES FOR EVERY WEB PAGE
// =============================================================================
//  This fires for every piece of web content the app creates. We only act on
//  webviews (the visited websites).
// =============================================================================

// Is this key press one of the browser's own shortcuts?
// (What each shortcut DOES is decided in renderer.js; this only recognizes
// them so they can be taken away from the web page and passed along.)
function isBrowserShortcut(input) {
  if (input.type !== 'keyDown') return false;
  const key = input.key.toLowerCase();

  // Ctrl+Tab and Ctrl+Shift+Tab: switch tabs (Ctrl on every system).
  if (input.control && key === 'tab') return true;

  // Everything else needs Cmd (Mac) or Ctrl (Windows/Linux), alone.
  const modifier = isMac ? input.meta : input.control;
  if (!modifier || input.alt || input.shift) return false;

  // L = address bar, T = new tab, W = close tab.
  if (key === 'l' || key === 't' || key === 'w') return true;

  // 1-9 = jump to tab. "code" names the physical key, so this also works on
  // keyboards where the digits need Shift (French AZERTY, for example).
  return /^Digit[1-9]$/.test(input.code);
}

// When each web page last received a real click or key press from you.
// Used to tell "you clicked a link" apart from "the page is opening
// pop-ups by itself".
const lastUserAction = new WeakMap();

// Avoids repeating the "pop-up blocked" message many times in a row.
let lastPopupNotice = 0;

app.on('web-contents-created', (event, contents) => {
  if (contents.getType() !== 'webview') return;

  // --- WebRTC (video calls, peer-to-peer) ---
  // Without this, any page can use WebRTC to discover your computer's
  // addresses on your home network, and your real internet address even
  // behind some VPNs, without asking. This policy stops WebRTC from making
  // direct connections at all; it may only go through a proxy.
  // Trade-off: video calls in the browser (Meet, Zoom web, Discord...) may
  // not connect. For calls that work but still hide your home-network
  // addresses, change it to 'default_public_interface_only'.
  contents.setWebRTCIPHandlingPolicy('disable_non_proxied_udp');

  // --- Tidying up ---
  // When a tab closes, forget its Shields counts.
  const id = contents.id;
  contents.once('destroyed', () => {
    shieldStats.delete(id);
    justCleaned.delete(id);
    clearTimeout(pendingUpdates.get(id));
    pendingUpdates.delete(id);
  });

  // --- Bluetooth ---
  // A page asked you to pick a Bluetooth device. Choose none.
  contents.on('select-bluetooth-device', (btEvent, devices, callback) => {
    btEvent.preventDefault();
    callback('');
  });

  // --- Pop-ups and "open in new tab" links ---
  // Never create a separate window. An ordinary web link opens as a new tab,
  // but only if you clicked or pressed a key in that page within the last
  // second, and only one tab per click. Pop-ups a page tries to open by
  // itself are refused.
  contents.setWindowOpenHandler(({ url, disposition }) => {
    const isWebLink = url.startsWith('https://') || url.startsWith('http://');
    const youJustActed = Date.now() - (lastUserAction.get(contents) || 0) < 1000;

    if (isWebLink && youJustActed) {
      lastUserAction.set(contents, 0);   // one tab per click
      // Middle-click and Ctrl+click ask for a "background" tab.
      // openerId says which tab the link was in, so the new tab can join
      // that tab's group.
      callInterface('openTab', {
        url,
        background: disposition === 'background-tab',
        openerId: contents.id,
      });
    } else if (Date.now() - lastPopupNotice > 3000) {
      lastPopupNotice = Date.now();
      callInterface('notify', 'A pop-up from this page was blocked.');
    }
    return { action: 'deny' };
  });

  // --- "Are you sure you want to leave?" ---
  // A page can ask to stop you leaving it. Without this, such a page would
  // silently block the address bar, the Home button and Reload. Calling
  // preventDefault here means "leave anyway".
  contents.on('will-prevent-unload', (unloadEvent) => {
    unloadEvent.preventDefault();
  });

  // --- Navigation ---
  // Only allow ordinary web addresses. This stops a page from sending you to
  // local files (file://) or other unusual address types.
  contents.on('will-navigate', (navEvent, url) => {
    if (!url.startsWith('https://') && !url.startsWith('http://')) {
      navEvent.preventDefault();
    }
  });

  // --- Clicking into a page ---
  // Tells the interface which page was just clicked, so that in split view
  // the toolbar follows the page you are using. Also notes the time of the
  // click for the pop-up rule above.
  contents.on('before-mouse-event', (mouseEvent, mouse) => {
    if (mouse.type === 'mouseDown') callInterface('pageFocused', contents.id);
    if (mouse.type === 'mouseDown' || mouse.type === 'mouseUp') {
      lastUserAction.set(contents, Date.now());
    }
  });

  // --- Keyboard shortcuts pressed while a web page has the focus ---
  // Key presses inside a web page normally never reach our toolbar. This
  // catches the browser's shortcuts first, keeps them from the page, and
  // hands them to renderer.js.
  contents.on('before-input-event', (inputEvent, input) => {
    if (input.type === 'keyDown') lastUserAction.set(contents, Date.now());
    if (!isBrowserShortcut(input)) return;
    inputEvent.preventDefault();
    callInterface('key', {
      key: input.key,
      code: input.code,
      ctrl: input.control,
      meta: input.meta,
      shift: input.shift,
      alt: input.alt,
    });
  });
});


// =============================================================================
//  SECTION 9 — PASSWORD PROMPTS FROM WEBSITES
// =============================================================================
//  Some sites (routers, staging servers) ask for a username and password
//  with a built-in browser prompt. Electron has no such prompt, so we ask
//  the user interface to show one and pass the answer back.
// =============================================================================

app.on('login', (event, webContents, details, authInfo, callback) => {
  // Only for web pages in a tab, and never for proxy servers. In every
  // other case Electron's default applies, which is to cancel.
  const fromTab = webContents && webContents.getType() === 'webview';
  if (!fromTab || authInfo.isProxy || !mainWindow || mainWindow.isDestroyed()) return;

  event.preventDefault();   // "we will answer this ourselves"

  const question = JSON.stringify({ host: authInfo.host, realm: authInfo.realm || '' });
  mainWindow.webContents
    .executeJavaScript(`window.browserBridge.askLogin(${question})`)
    .then((answer) => {
      if (answer && typeof answer.username === 'string') {
        callback(answer.username, String(answer.password || ''));
      } else {
        callback();   // cancelled
      }
    })
    .catch(() => callback());
});


// =============================================================================
//  SECTION 10 — APP START-UP AND SHUT-DOWN
// =============================================================================

// The label ("User-Agent") the browser shows every website.
//
// It is the exact label that current Google Chrome itself sends: Chrome
// deliberately "freezes" most of it (the version always ends in .0.0.0 and
// each operating system has one fixed description), so hundreds of millions
// of browsers send this same text and it reveals almost nothing about you.
//
// It keeps your real type of operating system (Windows, Mac or Linux). Sites
// can also find that out in other ways, and a label that disagreed with
// them would make you stand OUT rather than blend in.
// The languages websites are told you prefer, most preferred first. This
// is what an English (US) Chrome says, the most common setting of all.
const WEBSITE_LANGUAGES = ['en-US', 'en'];

function standardUserAgent() {
  const chromeMajor = process.versions.chrome.split('.')[0];
  const platform = {
    win32: 'Windows NT 10.0; Win64; x64',
    darwin: 'Macintosh; Intel Mac OS X 10_15_7',
    linux: 'X11; Linux x86_64',
  }[process.platform] || 'X11; Linux x86_64';
  return `Mozilla/5.0 (${platform}) AppleWebKit/537.36 (KHTML, like Gecko) ` +
    `Chrome/${chromeMajor}.0.0.0 Safari/537.36`;
}

// ---------- Diagnostics ----------
// Electron runs several helper processes in the background: one plays all
// sound (the "audio service"), one draws graphics and decodes video (the
// "GPU process"), one per web page, and so on. If one of them fails, the
// symptoms can be puzzling (silent sound, videos stuck at 0:00), so every
// failure is printed in the terminal, and Ctrl+Shift+D prints a report.

const processFailures = [];

app.on('child-process-gone', (event, details) => {
  const what = details.serviceName || details.name || details.type;
  const line = `${details.type} (${what}) stopped: ${details.reason}, exit code ${details.exitCode}`;
  processFailures.push(new Date().toLocaleTimeString() + '  ' + line);
  console.log('[PROCESS GONE]', line);
});

app.on('render-process-gone', (event, contents, details) => {
  const line = `page process (${contents.getType()}) stopped: ${details.reason}, exit code ${details.exitCode}`;
  processFailures.push(new Date().toLocaleTimeString() + '  ' + line);
  console.log('[PROCESS GONE]', line);
});

function printDiagnostics() {
  const lines = [];
  lines.push('================ KLORINE DIAGNOSTICS ================');
  lines.push(`Electron ${process.versions.electron}, Chrome ${process.versions.chrome}, ${process.platform} ${process.arch}`);

  // Every helper process now running, with its memory use.
  lines.push('Running processes:');
  for (const metric of app.getAppMetrics()) {
    const name = metric.serviceName || metric.name || '';
    lines.push(`  - ${metric.type}${name ? ' (' + name + ')' : ''}  ${Math.round((metric.memory?.workingSetSize || 0) / 1024)} MB`);
  }
  const audioRunning = app.getAppMetrics().some((m) => /audio/i.test(m.serviceName || m.name || ''));
  lines.push(`Audio service running: ${audioRunning ? 'yes' : 'NO'}`);

  // Whether graphics and video decoding use the graphics card.
  const gpu = app.getGPUFeatureStatus();
  lines.push(`Graphics: gpu_compositing=${gpu.gpu_compositing}, video_decode=${gpu.video_decode}, webgl=${gpu.webgl}`);

  lines.push('Helper process failures since start:');
  if (processFailures.length === 0) lines.push('  (none)');
  for (const failure of processFailures) lines.push('  ' + failure);
  lines.push('=====================================================');
  console.log(lines.join('\n'));
}

// "whenReady" fires once Electron has finished starting. Sessions can only
// be used after this point, so all set-up happens here.
app.whenReady().then(async () => {
  // The browsing profiles this app uses.
  const privateSession = session.fromPartition(PRIVATE_PARTITION); // websites
  const toolbarSession = session.fromPartition(TOOLBAR_PARTITION); // our toolbar
  const defaultSession = session.defaultSession;                   // unused spare
  const allSessions = [privateSession, toolbarSession, defaultSession];

  // --- Encrypted DNS (see SECURE_DNS_MODE in Section 1) ---
  // When it is 'off', nothing is changed at all: lookups work exactly as in
  // any normal browser setup.
  if (SECURE_DNS_MODE !== 'off') try {
    app.configureHostResolver({
      enableBuiltInResolver: true,   // needed for encrypted lookups
      secureDnsMode: SECURE_DNS_MODE,
      secureDnsServers: SECURE_DNS_SERVERS,
    });
    console.log('[PRIVACY] Encrypted DNS:', SECURE_DNS_MODE);
  } catch (error) {
    console.error('[PRIVACY] Could not set up encrypted DNS:', error);
  }

  // --- The block lists (EasyList + EasyPrivacy) ---
  filterEngine = loadFilterLists();

  // --- The standard label every request carries ---
  // Applied to every profile, and to any profile created later.
  const userAgent = standardUserAgent();
  app.userAgentFallback = userAgent;

  for (const oneSession of allSessions) {
    // Apply the standard Chrome label, and the most common language
    // setting ("English (US), then English"), exactly as Chrome sends it.
    // To prefer another language for websites, change WEBSITE_LANGUAGES
    // (Section 9), but fewer people share other settings.
    oneSession.setUserAgent(userAgent, WEBSITE_LANGUAGES.join(','));

    // Block ads and trackers, and clean tracking codes out of links.
    enableAdAndTrackerBlocking(oneSession, oneSession === privateSession);

    // Ask every website not to track you.
    addPrivacyHeaders(oneSession);

    // Refuse camera, microphone, location, notifications etc.
    denyAllPermissions(oneSession);

    // Switch the spell checker fully off. Left on, Electron downloads a
    // dictionary file from a Google server every time the app starts.
    oneSession.setSpellCheckerEnabled(false);
    try {
      oneSession.setSpellCheckerLanguages([]);
    } catch (error) {
      // Not supported on macOS, which uses its own built-in spell checker.
    }
  }

  // Switch JavaScript off on the sites you chose in the Shields panel.
  enableScriptBlocking(privateSession);

  // Let the Shields panel ask for counts and changes, and let the toolbar
  // color the title bar buttons.
  setUpShieldsRequests();
  setUpTitleBarRequests();
  setUpWallpaperRequests();
  setUpStockRequests();
  setUpBookmarkRequests();
  setUpVault();
  setUpFingerprintSeeds();
  setUpPrivacyRequests();
  setUpUpdates();

  // Start clean, in case the app crashed last time before it could clean up.
  await wipeAllData();

  // Refuse all file downloads. Remove this block if you want downloads.
  privateSession.on('will-download', (downloadEvent) => {
    downloadEvent.preventDefault();
    console.log('[DOWNLOAD BLOCKED]');
    callInterface('notify', 'Downloads are switched off in this browser.');
  });

  // On a Mac, show our icon in the Dock instead of Electron's default one
  // while running with "npm start". (A packaged app uses assets/icon.icns.)
  if (isMac && app.dock) {
    app.dock.setIcon(APP_ICON);
  }

  // Install our menu and its shortcuts, then open the window.
  buildApplicationMenu();
  createWindow();
});

// --- Shutting down ---
// Everything is erased before the app exits, whichever way you leave:
//   - closing the window                 -> "window-all-closed"
//   - Quit from the menu, Cmd+Q on a Mac -> "before-quit"
// (On macOS, apps normally stay open after their window closes; a private
// browser should not, so we quit there too.)
let wipeStarted = false;
let wipeFinished = false;

async function wipeThenQuit() {
  if (wipeStarted) return;   // make sure this only runs once
  wipeStarted = true;

  await wipeAllData();
  wipeFinished = true;
  app.quit();
}

app.on('window-all-closed', wipeThenQuit);

app.on('before-quit', (quitEvent) => {
  if (wipeFinished) return;      // already clean: let the app exit
  quitEvent.preventDefault();    // not yet: hold the exit, wipe, then quit
  wipeThenQuit();
});