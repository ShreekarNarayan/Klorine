// =============================================================================
//  renderer.js — how the browser's user interface BEHAVES
// =============================================================================
//  This file runs inside the toolbar page (index.html). It has no access to
//  your computer; it only reacts to clicks and key presses and tells the
//  <webview> elements which pages to load.
//
//  Sections:
//    1. Settings you can safely edit
//    2. Finding the elements on the page
//    3. Small helpers
//    4. Tabs (create, switch, close) and split view
//    4b. Tab groups (colored groups of tabs)
//    5. Keeping the toolbar in sync with the active tab
//    6. Progress bar
//    7. Toolbar buttons and the address bar
//    8. Bookmarks
//    9. Reader mode
//   10. Theme switcher and accent color
//   11. Settings panel, sign-in dialog and the message bar
//   11b. Shields (blocked counts, JavaScript switch, wipe site data)
//   11c. Wallpaper
//   11d. Soundscapes (rain, wind and café sounds, made live)
//   11e. Start page widgets: shared parts (dragging, search boxes, settings)
//   11f. Stock tracker ("Markets" widget)
//   11g. Weather widget (with air quality)
//   12. Keyboard shortcuts and commands from main.js
//   13. Start-up
// =============================================================================

'use strict';


// =============================================================================
//  1. SETTINGS YOU CAN SAFELY EDIT
// =============================================================================

// Search engines offered in the settings panel. The words you type are added
// to the end of "search".
//
// DuckDuckGo searches go through noai.duckduckgo.com, DuckDuckGo's own
// version of its search with the AI extras (Ask AI, Duck.ai, AI answers)
// switched off. For the standard version, change the address below to
// 'https://duckduckgo.com/?q='.
const SEARCH_ENGINES = {
  duckduckgo: { search: 'https://noai.duckduckgo.com/?q=' },
  startpage:  { search: 'https://www.startpage.com/do/search?q=' },
  brave:      { search: 'https://search.brave.com/search?q=' },
};

// The address of an empty page. A tab showing it displays the browser's own
// built-in start page (a plain search box) instead of a website.
const START_PAGE = 'about:blank';

// Accent colors offered in the settings panel. Each number is a position on
// the color wheel (0-360); the whole palette is generated from it in styles.css.
// "Sage" is different: it uses the hand-picked Klorine sage and off-white
// colors (palette: 'sage' in styles.css) and is the default.
const ACCENT_HUES = [
  { name: 'Sage',   hue: 130, palette: 'sage', color: '#9CAF88' },
  { name: 'Purple', hue: 300 },
  { name: 'Blue',   hue: 255 },
  { name: 'Teal',   hue: 195 },
  { name: 'Green',  hue: 150 },
  { name: 'Orange', hue: 60 },
  { name: 'Rose',   hue: 10 },
];

// The current choices. These live in memory only, so they return to these
// defaults each time the browser starts.
//
// To make the browser always start with tabs on the side, change
// tabPosition: 'top' below to tabPosition: 'side'.
const settings = {
  searchEngine: 'duckduckgo',
  homePage: '',            // empty = the built-in start page
  accent: 'Sage',
  tabPosition: 'top',      // 'top' or 'side'
};

// Must match PRIVATE_PARTITION in main.js. (main.js forces it anyway.)
const PARTITION = 'incognito';

// On a Mac, shortcuts use the Cmd key instead of Ctrl.
const IS_MAC = navigator.platform.toLowerCase().includes('mac');

// The style sheet applied to a page when reader mode is on. It narrows the
// text column, enlarges the type, and hides common clutter. Only whole,
// exact names are matched (class "ad", not every class containing "ad"),
// so that real content is not hidden by accident.
const READER_CSS = `
  html { background: #f7f3ea !important; }
  body {
    max-width: 720px !important;
    margin: 0 auto !important;
    padding: 40px 24px !important;
    background: #f7f3ea !important;
    color: #222 !important;
    font-family: Georgia, "Times New Roman", serif !important;
    font-size: 19px !important;
    line-height: 1.7 !important;
  }
  p, li, blockquote { color: #222 !important; font-size: inherit !important; line-height: inherit !important; }
  a { color: #1a4fa0 !important; }
  img, video, figure { max-width: 100% !important; height: auto !important; }
  nav, aside, footer,
  [role="navigation"], [role="complementary"], [role="contentinfo"],
  ins.adsbygoogle, [id^="google_ads"],
  [class~="ad"], [class~="ads"], [class~="advert"], [class~="advertisement"],
  [class~="sidebar"], [id="sidebar"] {
    display: none !important;
  }
`;


// =============================================================================
//  2. FINDING THE ELEMENTS ON THE PAGE
// =============================================================================
// Each line grabs one element from index.html by its id="..." so the code
// below can use it.

const byId = (id) => document.getElementById(id);

const tabListEl      = byId('tab-list');
const newTabButton   = byId('new-tab-button');
const backButton     = byId('back-button');
const forwardButton  = byId('forward-button');
const reloadButton   = byId('reload-button');
const reloadIcon     = byId('reload-icon');
const homeButton     = byId('home-button');
const addressForm    = byId('address-form');
const addressInput   = byId('address-input');
const securityBadge  = byId('security-badge');
const securityIcon   = byId('security-icon');
const securityLabel  = byId('security-label');
const bookmarkButton = byId('bookmark-button');
const shieldsButton  = byId('shields-button');
const shieldsCount   = byId('shields-count');
const readerButton   = byId('reader-button');
const splitButton    = byId('split-button');
const themeButton    = byId('theme-button');
const themeIcon      = byId('theme-icon');
const settingsButton = byId('settings-button');
const progressBar    = byId('progress-bar');
const bookmarksBar   = byId('bookmarks-bar');
const pageArea       = byId('page-area');
const scrim          = byId('scrim');
const settingsPanel  = byId('settings-panel');
const swatchRow      = byId('swatch-row');
const homePageInput  = byId('home-page-input');
const snackbar       = byId('snackbar');
const loginScrim     = byId('login-scrim');
const loginForm      = byId('login-form');
const loginText      = byId('login-text');
const loginUser      = byId('login-user');
const loginPass      = byId('login-pass');
const loginCancel    = byId('login-cancel');


// =============================================================================
//  3. SMALL HELPERS
// =============================================================================

// Creates an icon element. "name" is a Material Symbols icon name.
function makeIcon(name, extraClass = '') {
  const icon = document.createElement('span');
  icon.className = ('material-symbols-rounded ' + extraClass).trim();
  icon.textContent = name;
  // Screen readers should skip icons; the button's label describes it.
  icon.setAttribute('aria-hidden', 'true');
  return icon;
}

// Sets a button's tooltip and its spoken label (for screen readers) together.
function setTip(element, text) {
  element.title = text;
  element.setAttribute('aria-label', text);
}

// How a shortcut is written in tooltips: "Ctrl+T", or "⌘T" on a Mac.
function shortcutLabel(key) {
  return IS_MAC ? '⌘' + key : 'Ctrl+' + key;
}

// Is this an ordinary web address?
function isWebUrl(text) {
  return text.startsWith('https://') || text.startsWith('http://');
}

// Builds a search address for some words, using your chosen search engine.
// encodeURIComponent makes the words safe to place inside a web address.
function toSearchAddress(text) {
  return SEARCH_ENGINES[settings.searchEngine].search + encodeURIComponent(text);
}

// Turns what you typed into a real web address:
//   "example.com"            -> "https://example.com"
//   "HTTPS://Example.com"    -> used as it is (capital letters are fine)
//   "localhost:3000"         -> "http://localhost:3000"   (your own computer)
//   "192.168.1.1"            -> "http://192.168.1.1"      (your home network)
//   "best pizza near me"     -> a search
//   "someone@example.com"    -> a search (it is an email, not a website)
function toWebAddress(typedText) {
  const text = typedText.trim();
  if (text === '') return null;

  // Anything with a space in it is a search.
  if (/\s/.test(text)) return toSearchAddress(text);

  // Already a full web address. new URL() tidies it (e.g. lower-case "http").
  if (/^https?:\/\//i.test(text)) {
    try { return new URL(text).href; } catch (error) { return toSearchAddress(text); }
  }

  // An email address is not a website.
  if (/^[^\/@]+@[^\/@]+$/.test(text)) return toSearchAddress(text);

  // Addresses on your own computer or local network. These are not sent to
  // a search engine, and they normally use plain http:
  //   localhost, localhost:3000, 192.168.1.1, [::1]:8080, myserver:8080,
  //   intranet/wiki
  const isLocal =
    /^localhost(:\d+)?(\/|$)/i.test(text) ||          // localhost
    /^\d{1,3}(\.\d{1,3}){3}(:\d+)?(\/|$)/.test(text) ||  // numeric address
    /^\[[0-9a-f:]+\](:\d+)?(\/|$)/i.test(text) ||    // [::1] style address
    /^[a-z0-9-]+:\d+(\/|$)/i.test(text) ||            // name:port
    /^[a-z0-9-]+\/\S*$/i.test(text);                 // name/path
  // A name with a dot in it ("wikipedia.org") is a website: use https.
  const looksLikeWebsite = /^[^\/:]+\.[^\/:]+/.test(text);

  if (isLocal || looksLikeWebsite) {
    const candidate = (isLocal ? 'http://' : 'https://') + text;
    try { return new URL(candidate).href; } catch (error) { /* fall through */ }
  }

  // Everything else (single words, "file:", "javascript:", ...) is a search.
  return toSearchAddress(text);
}

// Where new tabs and the Home button go: your chosen home page, or the
// built-in start page if you have not set one.
function homeAddress() {
  return settings.homePage || START_PAGE;
}

// The website name inside an address ("https://a.com/x" -> "a.com").
function hostOf(url) {
  try { return new URL(url).host; } catch (error) { return ''; }
}


// =============================================================================
//  4. TABS AND SPLIT VIEW
// =============================================================================
// Every tab is one entry in the "tabs" list. Each entry remembers its own
// webview (the page), its element in the tab strip, its title, address,
// icon, and whether it is loading or in reader mode.
//
// Which tabs are on screen is tracked by three numbers:
//   leftTabId   -> the tab shown in the page area (the left half in split view)
//   rightTabId  -> the tab shown in the right half; null when not in split view
//   activeTabId -> the tab the toolbar is controlling (always one of the two)

const tabs = [];
let leftTabId = null;
let rightTabId = null;
let activeTabId = null;
let nextTabId = 1;

function getTab(id) {
  return tabs.find((tab) => tab.id === id) || null;
}

function getActiveTab() {
  return getTab(activeTabId);
}

function isSplit() {
  return rightTabId !== null;
}

// Opens a new tab. By default it also switches to it.
function createTab(url = homeAddress(), activate = true) {
  // --- The page itself ---
  const webview = document.createElement('webview');
  webview.setAttribute('partition', PARTITION);   // memory-only private profile
  // Lets the page ASK to open a new window. No window is ever created:
  // main.js refuses every request and opens links you clicked as a new tab.
  // Without this, "open in new tab" links would silently do nothing.
  webview.setAttribute('allowpopups', '');
  webview.setAttribute('src', url);

  // --- The panel shown in place of the page if it fails or crashes ---
  const messageEl = document.createElement('div');
  messageEl.className = 'page-message';
  messageEl.hidden = true;
  const messageIcon = makeIcon('cloud_off', 'page-message-icon');
  const messageTitle = document.createElement('h2');
  const messageText = document.createElement('p');
  const retryButton = document.createElement('button');
  retryButton.className = 'filled-btn';
  retryButton.textContent = 'Try again';
  messageEl.append(messageIcon, messageTitle, messageText, retryButton);

  // --- The built-in start page: just a search box, nothing else ---
  const startEl = document.createElement('div');
  startEl.className = 'start-page';
  const startHeading = document.createElement('h1');
  startHeading.textContent = 'Klorine';
  const startForm = document.createElement('form');
  startForm.className = 'start-search';
  const startInput = document.createElement('input');
  startInput.type = 'text';
  startInput.placeholder = 'Search or type a web address';
  startInput.setAttribute('aria-label', 'Search or type a web address');
  startInput.autocomplete = 'off';
  startInput.spellcheck = false;
  startForm.append(makeIcon('search'), startInput);
  const startNote = document.createElement('p');
  startNote.textContent = 'Trackers are blocked. Your browsing is wiped when you close the window.';
  // The Klorine logo (the same picture as the app icon).
  const startLogo = document.createElement('img');
  startLogo.className = 'start-logo';
  startLogo.src = 'assets/icon.svg';
  startLogo.alt = '';
  // A soft frosted card holds everything, so it stays readable on any
  // wallpaper. (The wallpaper itself is the start page's background.)
  const startCard = document.createElement('div');
  startCard.className = 'start-card';
  startCard.append(startLogo, startHeading, startForm, startNote);
  // Floating over it, the Markets and Weather widgets (sections 11e-11g).
  startEl.append(startCard, makeStockWidget(), makeWeatherWidget());
  watchStartPage(startEl);

  // --- The tab in the tab strip ---
  const tabEl = document.createElement('div');
  tabEl.className = 'tab loading';
  tabEl.setAttribute('role', 'tab');
  tabEl.tabIndex = 0;   // lets the Tab key reach it

  // Two icons share one spot: a symbol (spinner / globe / error) and the
  // website's own icon. Only one is visible at a time.
  const iconEl = makeIcon('progress_activity', 'tab-icon');
  const faviconEl = document.createElement('img');
  faviconEl.className = 'tab-favicon';
  faviconEl.alt = '';
  faviconEl.hidden = true;
  faviconEl.referrerPolicy = 'no-referrer';   // do not tell the site who asked

  const titleEl = document.createElement('span');
  titleEl.className = 'tab-title';
  titleEl.textContent = 'New tab';

  const closeEl = document.createElement('button');
  closeEl.className = 'icon-btn tab-close';
  setTip(closeEl, 'Close tab (' + shortcutLabel('W') + ')');
  closeEl.appendChild(makeIcon('close'));

  tabEl.append(iconEl, faviconEl, titleEl, closeEl);

  // --- Remember everything about this tab ---
  const tab = {
    id: nextTabId++,
    webview,
    startEl,
    messageEl,
    messageIcon,
    messageTitle,
    messageText,
    tabEl,
    iconEl,
    faviconEl,
    titleEl,
    title: 'New tab',
    url: '',               // address of the page that is actually on screen
    pendingUrl: url === START_PAGE ? null : url,   // asked for, not arrived yet
    start: url === START_PAGE,   // showing the built-in start page?
    favicon: null,         // address of the website's icon, if it has one
    loading: true,
    failed: false,         // did the last page fail to load?
    errorText: '',         // the technical reason, shown in small print
    crashed: false,        // did the page stop working?
    ready: false,          // becomes true once the webview accepts commands
    reader: false,         // is reader mode switched on for this tab?
    readerCssKey: null,    // handle used to remove the reader style sheet
    group: null,           // the tab group this tab belongs to, if any
  };

  // If the website's icon cannot be loaded, fall back to the globe symbol.
  faviconEl.addEventListener('error', () => {
    tab.favicon = null;
    drawTabIcon(tab);
  });

  // Pressing Enter in the start page's search box.
  startForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const address = toWebAddress(startInput.value);
    if (!address) return;
    startInput.value = '';
    navigate(tab, address);
  });

  // "Try again" on the error panel.
  retryButton.addEventListener('click', () => {
    if (tab.crashed) tab.webview.reload(); else navigate(tab, tab.url);
  });

  // Clicking the tab switches to it (so does Enter or Space when it has the
  // keyboard focus); the X (or a middle-click) closes it.
  tabEl.addEventListener('click', () => activateTab(tab.id));
  tabEl.addEventListener('keydown', (event) => {
    if (event.target === tabEl && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault();
      activateTab(tab.id);
    }
  });
  tabEl.addEventListener('auxclick', (event) => {
    if (event.button === 1) closeTab(tab.id);
  });
  // Right-click (or the keyboard's menu key) opens the tab menu, which is
  // where tabs are put into colored groups.
  tabEl.addEventListener('contextmenu', (event) => {
    event.preventDefault();
    openTabMenu(tab, event);
  });
  closeEl.addEventListener('click', (event) => {
    event.stopPropagation();   // do not also trigger "switch to this tab"
    closeTab(tab.id);
  });

  connectWebviewEvents(tab);

  tabs.push(tab);
  pageArea.append(webview, startEl, messageEl);
  drawTabStrip();   // puts the new tab into the tab strip
  if (activate) activateTab(tab.id); else layoutPanes();
  return tab;
}

// The address to show in the address bar: the one you asked for while it is
// still on its way, otherwise the page that is actually on screen.
function shownUrl(tab) {
  return tab.pendingUrl !== null ? tab.pendingUrl : tab.url;
}

// Picks which icon a tab shows: spinner while loading, an error mark if the
// page failed or crashed, the website's own icon if it has one, otherwise a
// globe.
function drawTabIcon(tab) {
  const broken = tab.failed || tab.crashed;
  const showFavicon = !tab.loading && !broken && tab.favicon !== null;

  tab.faviconEl.hidden = !showFavicon;
  tab.iconEl.hidden = showFavicon;

  if (showFavicon) {
    if (tab.faviconEl.getAttribute('src') !== tab.favicon) tab.faviconEl.src = tab.favicon;
  } else {
    tab.iconEl.textContent = tab.loading ? 'progress_activity' : broken ? 'error' : 'public';
  }
  tab.tabEl.classList.toggle('loading', tab.loading);
}

// Shows or hides the panel that replaces a page which failed or crashed,
// so you are never left looking at a blank white area.
function drawPageMessage(tab) {
  const broken = tab.failed || tab.crashed;
  tab.messageEl.hidden = !broken;
  if (!broken) return;

  if (tab.crashed) {
    tab.messageIcon.textContent = 'sentiment_dissatisfied';
    tab.messageTitle.textContent = 'This page stopped working';
    tab.messageText.textContent = 'Something went wrong while showing this page.';
  } else {
    tab.messageIcon.textContent = 'cloud_off';
    tab.messageTitle.textContent = 'This page can\u2019t be reached';
    tab.messageText.textContent =
      (hostOf(tab.url) || 'The page') + ' could not be loaded. Check the address and your internet connection.' +
      (tab.errorText ? ' (' + tab.errorText + ')' : '');
  }
}

// Shows the built-in start page for a tab that has no website loaded.
function drawStartPage(tab) {
  tab.startEl.hidden = !tab.start || tab.failed || tab.crashed;
}

// If the keyboard focus was inside a page that has just been hidden (you
// switched tabs with a shortcut while typing in a page), move it to the tab
// now on screen. Otherwise your next key presses would go to the hidden page
// and seem to do nothing.
function moveFocusIfHidden(tab) {
  const focused = document.activeElement;
  if (!focused || focused.tagName !== 'WEBVIEW') return;
  if (focused.classList.contains('pane-left') || focused.classList.contains('pane-right')) return;

  if (tab.start || tab.failed || tab.crashed) {
    addressInput.focus();      // nothing to type into on those pages
  } else {
    tab.webview.focus();
  }
}

// Remembers which tab was active the last time the screen was laid out.
let lastLaidOutActiveId = null;

// Makes the screen match leftTabId / rightTabId / activeTabId: which pages
// are visible, which tab is highlighted, and whether split view is on.
function layoutPanes() {
  for (const tab of tabs) {
    const onLeft = tab.id === leftTabId;
    const onRight = tab.id === rightTabId;
    // The page, the start page and the error panel occupy the same spot.
    for (const element of [tab.webview, tab.startEl, tab.messageEl]) {
      element.classList.toggle('pane-left', onLeft);
      element.classList.toggle('pane-right', onRight);
    }
    tab.tabEl.classList.toggle('active', tab.id === activeTabId);
    tab.tabEl.classList.toggle('in-split', isSplit() && (onLeft || onRight));
    tab.tabEl.setAttribute('aria-selected', String(tab.id === activeTabId));
    drawStartPage(tab);
  }
  pageArea.classList.toggle('split', isSplit());
  pageArea.classList.toggle('focus-right', isSplit() && activeTabId === rightTabId);

  splitButton.classList.toggle('active', isSplit());
  setTip(splitButton, isSplit() ? 'Close split view' : 'Split view');

  const tab = getActiveTab();
  if (!tab) return;
  if (tab.loading) startProgress(); else resetProgress();

  // When a different tab becomes active, the address bar must switch to it
  // even if you were typing there; otherwise pressing Enter would load the
  // previous tab's address into this one.
  const switched = activeTabId !== lastLaidOutActiveId;
  lastLaidOutActiveId = activeTabId;
  if (switched) {
    tab.tabEl.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    moveFocusIfHidden(tab);
  }
  updateToolbar(switched);

  // A start page may have just come into view: bring its prices up to date.
  if (typeof refreshStocks === 'function') { refreshStocks(); refreshWeather(); }
}

// Switches to a tab.
//   - If the tab is already on screen (either half), the toolbar simply
//     starts controlling it.
//   - Otherwise it replaces the page in the half you are currently using.
function activateTab(id) {
  const target = getTab(id);
  if (!target) return;

  // Switching to a tab inside a collapsed group opens the group up again.
  if (target.group && target.group.collapsed) {
    target.group.collapsed = false;
    drawTabStrip();
  }

  if (id !== leftTabId && id !== rightTabId) {
    if (isSplit() && activeTabId === rightTabId) rightTabId = id; else leftTabId = id;
  }
  activeTabId = id;
  layoutPanes();
}

// Closes a tab. Closing the last one opens a fresh tab so the window is
// never empty. Closing a tab that is part of split view ends split view.
function closeTab(id) {
  const index = tabs.findIndex((tab) => tab.id === id);
  if (index === -1) return;

  const [closed] = tabs.splice(index, 1);
  shieldCounts.delete(pageNumber(closed));   // forget its Shields counts
  closed.tabEl.remove();
  closed.webview.remove();   // this also stops the page and frees its memory
  closed.messageEl.remove();
  closed.startEl.remove();
  drawTabStrip();            // also removes a group label left with no tabs

  if (tabs.length === 0) {
    leftTabId = rightTabId = activeTabId = null;
    createTab();
    return;
  }

  if (id === rightTabId) {
    // The right half closed: the left page takes the whole area.
    rightTabId = null;
    activeTabId = leftTabId;
  } else if (id === leftTabId) {
    if (isSplit()) {
      // The left half closed: the right page takes the whole area.
      leftTabId = rightTabId;
      rightTabId = null;
    } else {
      // Show the nearest tab that is not hidden in a collapsed group.
      leftTabId = nearestVisibleTab(index).id;
    }
    activeTabId = leftTabId;
  }

  // The tab now showing must not be hidden inside a collapsed group.
  const shown = getActiveTab();
  if (shown && shown.group && shown.group.collapsed) {
    shown.group.collapsed = false;
    drawTabStrip();
  }
  layoutPanes();
}

// Turns split view on or off.
function toggleSplit() {
  if (isSplit()) {
    // Off: keep the page you were using, full width.
    leftTabId = activeTabId;
    rightTabId = null;
  } else if (tabs.length > 1) {
    // On: put the next tab in the right half (skipping tabs hidden in a
    // collapsed group, unless every other tab is hidden).
    const list = visibleTabs().length > 1 ? visibleTabs() : tabs;
    const index = list.findIndex((tab) => tab.id === activeTabId);
    rightTabId = list[(index + 1) % list.length].id;
  } else {
    // On, with only one tab open: open a new tab in the right half.
    const newTab = createTab(homeAddress(), false);
    rightTabId = newTab.id;
    activeTabId = newTab.id;
  }
  layoutPanes();
}

// Moves to the next (+1) or previous (-1) tab, wrapping around at the ends.
// Tabs hidden inside a collapsed group are skipped.
function cycleTabs(direction) {
  const list = visibleTabs();
  if (list.length < 2) return;
  const index = list.findIndex((tab) => tab.id === activeTabId);
  const next = (index + direction + list.length) % list.length;
  activateTab(list[next].id);
}

// =============================================================================
//  4b. TAB GROUPS
// =============================================================================
// Any tab can be put into a colored group by right-clicking it. A group has
// a label in the tab strip (its name, in its color), and every tab in it is
// marked with that color. Clicking the label folds the group away (collapse)
// or opens it again; right-clicking the label lets you rename it, change its
// color, ungroup it or close all of its tabs.
//
// The tabs of a group always sit next to each other. Groups, like
// everything else, are wiped when the window closes.

// The colors on offer. Each is a position on the color wheel (hue, 0-360);
// "chroma: 0" means no color at all (grey). styles.css turns these into
// shades that suit the light and dark themes.
const GROUP_COLORS = [
  { name: 'Grey',   hue: 260, chroma: 0 },
  { name: 'Blue',   hue: 255, chroma: 1 },
  { name: 'Red',    hue: 25,  chroma: 1 },
  { name: 'Yellow', hue: 85,  chroma: 1 },
  { name: 'Green',  hue: 150, chroma: 1 },
  { name: 'Pink',   hue: 350, chroma: 1 },
  { name: 'Purple', hue: 300, chroma: 1 },
  { name: 'Cyan',   hue: 200, chroma: 1 },
  { name: 'Orange', hue: 55,  chroma: 1 },
];

// Every group currently in use. Each entry:
//   { id, name, color (a position in GROUP_COLORS), collapsed, chipEl, ... }
const groups = [];
let nextGroupId = 1;

const tabMenu      = byId('tab-menu');
const groupEditor  = byId('group-editor');
const groupName    = byId('group-name-input');
const groupSwatches = byId('group-swatch-row');
const menuScrim    = byId('menu-scrim');

// The group currently open in the group editor, if any.
let editingGroup = null;

// The tabs you can see in the tab strip (those not folded away).
function visibleTabs() {
  return tabs.filter((tab) => !(tab.group && tab.group.collapsed));
}

// The visible tab nearest to a position in the tab list, looking right
// first, then left. If every tab is folded away, the nearest tab is used.
function nearestVisibleTab(index) {
  for (let i = index; i < tabs.length; i++) {
    if (!(tabs[i].group && tabs[i].group.collapsed)) return tabs[i];
  }
  for (let i = Math.min(index, tabs.length) - 1; i >= 0; i--) {
    if (!(tabs[i].group && tabs[i].group.collapsed)) return tabs[i];
  }
  return tabs[Math.min(index, tabs.length - 1)];
}

function groupTabs(group) {
  return tabs.filter((tab) => tab.group === group);
}

// Gives an element a group's color. styles.css reads these two values.
function paintGroupColor(element, group) {
  const color = GROUP_COLORS[group.color];
  element.style.setProperty('--g-hue', String(color.hue));
  element.style.setProperty('--g-c', String(color.chroma));
}

// The first color not already used by a group (grey is only used when all
// the others are taken).
function unusedColor() {
  for (let i = 1; i < GROUP_COLORS.length; i++) {
    if (!groups.some((group) => group.color === i)) return i;
  }
  return 1 + (groups.length % (GROUP_COLORS.length - 1));
}

// Builds the label shown at the start of a group in the tab strip.
function makeGroupChip(group) {
  const chip = document.createElement('button');
  chip.className = 'group-chip';

  const dot = document.createElement('span');
  dot.className = 'group-dot';
  const name = document.createElement('span');
  name.className = 'group-name';
  const count = document.createElement('span');
  count.className = 'group-count';

  chip.append(dot, name, count, makeIcon('expand_more', 'group-arrow'));

  chip.addEventListener('click', () => toggleGroupCollapsed(group));
  chip.addEventListener('contextmenu', (event) => {
    event.preventDefault();
    openGroupEditor(group);
  });

  group.chipEl = chip;
  group.nameEl = name;
  group.countEl = count;
}

// Brings a group's label up to date (name, color, folded or open).
function drawGroupChip(group) {
  const members = groupTabs(group).length;
  const label = group.name || 'Unnamed group';
  // textContent (not innerHTML) so a name can never inject code.
  group.nameEl.textContent = group.name;
  group.countEl.textContent = group.collapsed ? String(members) : '';
  group.chipEl.classList.toggle('unnamed', !group.name);
  group.chipEl.classList.toggle('collapsed', group.collapsed);
  group.chipEl.setAttribute('aria-expanded', String(!group.collapsed));
  paintGroupColor(group.chipEl, group);
  group.chipEl.title =
    label + ' \u2014 ' + members + (members === 1 ? ' tab' : ' tabs') +
    '. Click to ' + (group.collapsed ? 'expand' : 'collapse') + ', right-click to edit.';
  group.chipEl.setAttribute('aria-label', label + ' tab group, ' + members + (members === 1 ? ' tab' : ' tabs'));
}

// Lays out the tab strip from the "tabs" list: each group's label followed
// by its tabs, tabs of folded-away groups hidden. Called after anything
// that adds, removes, moves or groups tabs.
function drawTabStrip() {
  // Forget groups that no longer have any tabs.
  for (let i = groups.length - 1; i >= 0; i--) {
    if (!tabs.some((tab) => tab.group === groups[i])) {
      if (editingGroup === groups[i]) closeMenus();
      groups[i].chipEl.remove();
      groups.splice(i, 1);
    }
  }

  // The order the strip should have.
  const order = [];
  let previousGroup = null;
  for (const tab of tabs) {
    const group = tab.group;
    if (group && group !== previousGroup) order.push(group.chipEl);
    previousGroup = group;
    order.push(tab.tabEl);

    tab.tabEl.classList.toggle('grouped', group !== null);
    tab.tabEl.classList.toggle('collapsed', group !== null && group.collapsed);
    if (group) {
      paintGroupColor(tab.tabEl, group);
    } else {
      tab.tabEl.style.removeProperty('--g-hue');
      tab.tabEl.style.removeProperty('--g-c');
    }
  }

  // Move only the elements that are out of place (moving one that has the
  // keyboard focus would lose the focus).
  order.forEach((element, i) => {
    if (tabListEl.children[i] !== element) {
      tabListEl.insertBefore(element, tabListEl.children[i] || null);
    }
  });
  while (tabListEl.children.length > order.length) tabListEl.lastElementChild.remove();

  for (const group of groups) drawGroupChip(group);
}

// Moves a tab in the "tabs" list so that it sits just after the last tab of
// a group (keeping the group's tabs side by side).
function moveTabAfterGroup(tab, group) {
  tabs.splice(tabs.indexOf(tab), 1);
  let last = -1;
  tabs.forEach((other, i) => { if (other.group === group) last = i; });
  tabs.splice(last === -1 ? tabs.length : last + 1, 0, tab);
}

// Puts a tab into a brand-new group, then opens the editor to name it.
function addTabToNewGroup(tab) {
  if (tab.group) removeTabFromGroup(tab, false);

  const group = { id: nextGroupId++, name: '', color: unusedColor(), collapsed: false };
  makeGroupChip(group);
  groups.push(group);
  tab.group = group;
  drawTabStrip();
  openGroupEditor(group);
  return group;
}

// Puts a tab into an existing group (it moves to the end of that group).
function addTabToGroup(tab, group) {
  if (tab.group === group) return;
  moveTabAfterGroup(tab, group);
  tab.group = group;
  if (tab.id === activeTabId) group.collapsed = false;
  drawTabStrip();
  layoutPanes();
}

// Takes a tab out of its group. It moves to just after the group, so the
// group's other tabs stay side by side.
function removeTabFromGroup(tab, redraw = true) {
  const group = tab.group;
  if (!group) return;
  tab.group = null;
  moveTabAfterGroup(tab, group);
  if (redraw) { drawTabStrip(); layoutPanes(); }
}

// Dissolves a group: its tabs stay open but are no longer grouped.
function ungroup(group) {
  for (const tab of groupTabs(group)) tab.group = null;
  drawTabStrip();
  layoutPanes();
}

// Closes every tab in a group.
function closeGroup(group) {
  for (const tab of groupTabs(group)) closeTab(tab.id);
}

// Folds a group away, or opens it again. If the tab you are using is in a
// group being folded, the nearest tab outside it is shown instead (or a new
// tab, if there is no other).
function toggleGroupCollapsed(group) {
  group.collapsed = !group.collapsed;
  const active = getActiveTab();

  if (group.collapsed && active && active.group === group) {
    drawTabStrip();
    const outside = visibleTabs();
    if (outside.length > 0) {
      const index = tabs.indexOf(active);
      // The visible tab nearest to where you were.
      let best = outside[0];
      for (const tab of outside) {
        if (Math.abs(tabs.indexOf(tab) - index) < Math.abs(tabs.indexOf(best) - index)) best = tab;
      }
      activateTab(best.id);
    } else {
      createTab();
    }
  } else {
    drawTabStrip();
    layoutPanes();
  }
}

// ---------- The floating tab menu and group editor ----------

// Places a floating element at a point, keeping it inside the window.
function placeFloating(element, x, y) {
  element.hidden = false;
  menuScrim.hidden = false;
  const box = element.getBoundingClientRect();
  const left = Math.max(8, Math.min(x, window.innerWidth - box.width - 8));
  const top = Math.max(8, Math.min(y, window.innerHeight - box.height - 8));
  element.style.left = Math.round(left) + 'px';
  element.style.top = Math.round(top) + 'px';
}

// Where a menu for an element should appear: at the mouse pointer, or under
// the element when it was opened with the keyboard.
function menuPoint(event, element) {
  if (event && (event.clientX || event.clientY)) return [event.clientX, event.clientY];
  const box = element.getBoundingClientRect();
  return [box.left, box.bottom + 4];
}

function closeMenus() {
  tabMenu.hidden = true;
  groupEditor.hidden = true;
  shieldsPanel.hidden = true;
  shieldsButton.classList.remove('active-panel');
  soundPanel.hidden = true;
  soundButton.classList.remove('panel-open');
  byId('bookmarks-panel').hidden = true;
  byId('bookmarks-button').classList.remove('panel-open');
  byId('logins-menu').hidden = true;
  menuScrim.hidden = true;
  editingGroup = null;
}

function isMenuOpen() {
  return !tabMenu.hidden || !groupEditor.hidden || !shieldsPanel.hidden || !soundPanel.hidden || !byId('bookmarks-panel').hidden || !byId('logins-menu').hidden;
}

// Adds one line to the tab menu. "marker" is an icon name, or a group
// (shown as a dot in that group's color).
function addMenuEntry(text, marker, action) {
  const entry = document.createElement('button');
  entry.className = 'menu-entry';
  entry.setAttribute('role', 'menuitem');

  if (marker && typeof marker === 'object') {
    const dot = document.createElement('span');
    dot.className = 'menu-dot';
    paintGroupColor(dot, marker);
    entry.appendChild(dot);
  } else {
    entry.appendChild(makeIcon(marker || 'blank'));
  }
  const label = document.createElement('span');
  label.textContent = text;
  entry.appendChild(label);

  entry.addEventListener('click', () => {
    closeMenus();
    action();
  });
  tabMenu.appendChild(entry);
}

function addMenuDivider() {
  const line = document.createElement('div');
  line.className = 'menu-divider';
  tabMenu.appendChild(line);
}

// The menu shown when you right-click a tab.
function openTabMenu(tab, event) {
  closeMenus();
  tabMenu.replaceChildren();

  addMenuEntry('Add tab to new group', 'new_label', () => addTabToNewGroup(tab));

  const others = groups.filter((group) => group !== tab.group);
  if (others.length > 0) {
    const heading = document.createElement('div');
    heading.className = 'menu-heading';
    heading.textContent = 'Add to group';
    tabMenu.appendChild(heading);
    for (const group of others) {
      addMenuEntry(group.name || 'Unnamed group', group, () => addTabToGroup(tab, group));
    }
  }

  if (tab.group) {
    addMenuEntry('Remove from group', 'label_off', () => removeTabFromGroup(tab));
  }

  addMenuDivider();
  addMenuEntry('Close tab', 'close', () => closeTab(tab.id));

  const [x, y] = menuPoint(event, tab.tabEl);
  placeFloating(tabMenu, x, y);
  tabMenu.querySelector('.menu-entry').focus();
}

// The editor shown when you right-click a group's label (and straight after
// creating a group): name, color, and what to do with the whole group.
function openGroupEditor(group) {
  closeMenus();
  editingGroup = group;
  groupName.value = group.name;
  drawGroupSwatches();

  // Next to the label: below it when tabs are on top, beside it when tabs
  // are on the side.
  const box = group.chipEl.getBoundingClientRect();
  const side = document.body.classList.contains('vertical-tabs');
  placeFloating(groupEditor, side ? box.right + 8 : box.left, side ? box.top : box.bottom + 8);
  groupName.focus();
  groupName.select();
}

// Builds the row of color choices in the group editor.
function drawGroupSwatches() {
  groupSwatches.replaceChildren();
  GROUP_COLORS.forEach((color, index) => {
    const swatch = document.createElement('button');
    swatch.className = 'group-swatch';
    swatch.classList.toggle('selected', editingGroup && editingGroup.color === index);
    swatch.style.setProperty('--g-hue', String(color.hue));
    swatch.style.setProperty('--g-c', String(color.chroma));
    setTip(swatch, color.name);
    swatch.addEventListener('click', () => {
      if (!editingGroup) return;
      editingGroup.color = index;
      drawTabStrip();
      drawGroupSwatches();
    });
    groupSwatches.appendChild(swatch);
  });
}

// Typing a name renames the group straight away.
groupName.addEventListener('input', () => {
  if (!editingGroup) return;
  editingGroup.name = groupName.value.trim().slice(0, 40);
  drawGroupChip(editingGroup);
});
groupName.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') closeMenus();
});

// The three buttons at the bottom of the group editor.
byId('group-new-tab').addEventListener('click', () => {
  const group = editingGroup;
  closeMenus();
  if (group) addTabToGroup(createTab(), group);
});
byId('group-ungroup').addEventListener('click', () => {
  const group = editingGroup;
  closeMenus();
  if (group) ungroup(group);
});
byId('group-close').addEventListener('click', () => {
  const group = editingGroup;
  closeMenus();
  if (group) closeGroup(group);
});

// Clicking anywhere outside a menu closes it.
menuScrim.addEventListener('click', closeMenus);
menuScrim.addEventListener('contextmenu', (event) => {
  event.preventDefault();
  closeMenus();
});


// Sends a tab to a new address.
//
// The address is only remembered as "pending" here. tab.url (and with it the
// lock badge and bookmark star) changes only once the new page has really
// arrived, so the toolbar can never claim a page that is not on screen.
function navigate(tab, url) {
  // The built-in start page has no address to show while it loads.
  tab.pendingUrl = url === START_PAGE ? null : url;
  if (tab.ready) {
    // loadURL reports failures separately through "did-fail-load", so the
    // error here can be ignored.
    tab.webview.loadURL(url).catch(() => {});
  } else {
    tab.webview.setAttribute('src', url);
  }
  if (tab.id === activeTabId) updateToolbar();
}

// Listens to everything a tab's page reports and updates the interface.
function connectWebviewEvents(tab) {
  const { webview } = tab;

  // Redraws the toolbar, but only if this is the tab it is showing.
  const refresh = () => { if (tab.id === activeTabId) updateToolbar(); };

  // The webview has started up and can now accept commands.
  webview.addEventListener('dom-ready', () => {
    tab.ready = true;
    // A new page has no reader styling yet; apply it again if it is on.
    tab.readerCssKey = null;
    if (tab.reader) applyReaderCss(tab);
    refresh();
  });

  // A page began loading.
  webview.addEventListener('did-start-loading', () => {
    tab.loading = true;
    tab.failed = false;
    tab.crashed = false;
    drawTabIcon(tab);
    drawPageMessage(tab);
    drawStartPage(tab);
    if (tab.id === activeTabId) startProgress();
    refresh();
  });

  // Loading ended. If the page you asked for never arrived (it was blocked,
  // turned out to be a download, or you pressed Stop), the pending address
  // is dropped and the address bar goes back to the page still on screen.
  webview.addEventListener('did-stop-loading', () => {
    tab.loading = false;
    tab.pendingUrl = null;
    drawTabIcon(tab);
    if (tab.id === activeTabId) finishProgress();
    refresh();
  });

  // A new page has really arrived. Only now does the tab's address change.
  webview.addEventListener('did-navigate', (event) => {
    // The empty page means "show the built-in start page".
    tab.start = event.url === START_PAGE;
    const newUrl = tab.start ? '' : event.url;

    // Moving to a different website: forget the old site's icon.
    if (hostOf(newUrl) !== hostOf(tab.url)) tab.favicon = null;
    tab.url = newUrl;
    tab.pendingUrl = null;
    if (tab.start) {
      tab.title = 'New tab';
      tab.titleEl.textContent = tab.title;
      tab.tabEl.title = tab.title;
    }
    drawTabIcon(tab);
    drawStartPage(tab);
    refresh();
  });

  // The address changed without a full page load (common in web apps).
  webview.addEventListener('did-navigate-in-page', (event) => {
    if (!event.isMainFrame) return;
    tab.url = event.url;
    refresh();
  });

  // The page announced its title.
  webview.addEventListener('page-title-updated', (event) => {
    if (tab.start) return;   // the start page keeps the name "New tab"
    tab.title = event.title || 'Untitled';
    // textContent (not innerHTML) so a page title can never inject code.
    tab.titleEl.textContent = tab.title;
    tab.tabEl.title = tab.title;
    refresh();
  });

  // The page announced its icon (favicon). Only ordinary web addresses and
  // embedded images are accepted.
  webview.addEventListener('page-favicon-updated', (event) => {
    const icon = (event.favicons || []).find((url) => isWebUrl(url) || url.startsWith('data:image/'));
    tab.favicon = icon || null;
    drawTabIcon(tab);
  });

  // The page could not be loaded. Two codes are not real failures and are
  // skipped: -3 means "cancelled" (you clicked something else first) and
  // -20 means our own tracker blocker stopped it (main.js shows a message).
  webview.addEventListener('did-fail-load', (event) => {
    if (!event.isMainFrame || event.errorCode === -3 || event.errorCode === -20) return;
    tab.failed = true;
    tab.start = false;
    tab.errorText = event.errorDescription || '';
    tab.url = event.validatedURL || shownUrl(tab);
    tab.pendingUrl = null;
    tab.title = 'Page not available';
    tab.titleEl.textContent = tab.title;
    tab.tabEl.title = tab.title;
    drawTabIcon(tab);
    drawPageMessage(tab);
    drawStartPage(tab);
    refresh();
  });

  // The page's process crashed or was closed by the system.
  webview.addEventListener('render-process-gone', () => {
    tab.crashed = true;
    tab.loading = false;
    tab.pendingUrl = null;
    drawTabIcon(tab);
    drawPageMessage(tab);
    if (tab.id === activeTabId) resetProgress();
    refresh();
  });

  // A video (or anything else) on the page went full screen: hide the
  // toolbar and let that page fill the window. Escape leaves full screen.
  webview.addEventListener('enter-html-full-screen', () => {
    webview.classList.add('fullscreen');
    document.body.classList.add('page-fullscreen');
  });
  webview.addEventListener('leave-html-full-screen', () => {
    webview.classList.remove('fullscreen');
    document.body.classList.remove('page-fullscreen');
  });
}


// =============================================================================
//  5. KEEPING THE TOOLBAR IN SYNC WITH THE ACTIVE TAB
// =============================================================================
// Called whenever anything changes. It redraws every part of the toolbar
// from the active tab's current state.

function updateToolbar(forceAddress = false) {
  const tab = getActiveTab();
  if (!tab) return;
  const broken = tab.failed || tab.crashed;

  // --- Back / forward: greyed out when there is nowhere to go ---
  backButton.disabled    = !(tab.ready && tab.webview.canGoBack());
  forwardButton.disabled = !(tab.ready && tab.webview.canGoForward());

  // --- Reload turns into Stop while the page is loading ---
  reloadIcon.textContent = tab.loading ? 'close' : 'refresh';
  setTip(reloadButton, tab.loading ? 'Stop loading' : 'Reload (' + shortcutLabel('R') + ')');

  // --- Address bar ---
  // Left alone while you are typing in it, unless you just switched tabs
  // (forceAddress), in which case it must show the new tab's address.
  if (forceAddress || document.activeElement !== addressInput) {
    addressInput.value = shownUrl(tab);
    if (document.activeElement === addressInput) addressInput.select();
  }

  // --- Security badge ---
  // Describes the page that is actually on screen (tab.url). While a new
  // address is still on its way there is nothing to vouch for yet, so the
  // badge stays neutral.
  securityBadge.classList.remove('secure', 'insecure');
  securityLabel.textContent = '';
  if (broken) {
    securityIcon.textContent = 'error';
    securityBadge.title = 'This page could not be shown';
  } else if (tab.pendingUrl !== null) {
    securityIcon.textContent = 'public';
    securityBadge.title = 'Loading\u2026';
  } else if (tab.url.startsWith('https://')) {
    securityBadge.classList.add('secure');
    securityIcon.textContent = 'lock';
    securityBadge.title = 'Secure connection (HTTPS)';
  } else if (tab.url.startsWith('http://')) {
    securityBadge.classList.add('insecure');
    securityIcon.textContent = 'warning';
    securityLabel.textContent = 'Not secure';
    securityBadge.title = 'This connection is not encrypted (HTTP)';
  } else {
    securityIcon.textContent = 'search';
    securityBadge.title = '';
  }

  // --- Bookmark star ---
  const bookmarked = isBookmarked(tab.url);
  bookmarkButton.classList.toggle('bookmarked', bookmarked);
  setTip(bookmarkButton, bookmarked ? 'Remove bookmark' : 'Bookmark this page');

  // --- Key button (saved passwords) ---
  drawKeyButton(tab);

  // --- Shields button ---
  drawShieldsButton(tab);

  // --- Reader mode button ---
  readerButton.classList.toggle('active', tab.reader);
  setTip(readerButton, tab.reader ? 'Turn off reader mode' : 'Reader mode');

  // --- Window title ---
  document.title = tab.title + ' \u2014 Klorine';
}


// =============================================================================
//  6. PROGRESS BAR
// =============================================================================
// Pages do not report an exact percentage, so the bar creeps toward 90%
// while loading and snaps to 100% when done. The movement itself is defined
// in styles.css; this code only switches between the states.

function resetProgress() {
  progressBar.classList.remove('loading', 'done');
}

function startProgress() {
  resetProgress();
  // Reading a size forces the browser to notice the reset before the
  // animation is switched back on; without it the bar would not restart.
  void progressBar.offsetWidth;
  progressBar.classList.add('loading');
}

function finishProgress() {
  progressBar.classList.remove('loading');
  progressBar.classList.add('done');
}


// =============================================================================
//  7. TOOLBAR BUTTONS AND THE ADDRESS BAR
// =============================================================================

// Puts the cursor in the address bar with everything selected.
function focusAddressBar() {
  addressInput.focus();
  addressInput.select();
}

// Opens a new tab, ready to type an address straight away.
function openNewTab() {
  createTab();
  focusAddressBar();
}

// Reloads the active page. A "hard" reload ignores saved copies and
// downloads everything again.
function reloadActiveTab(hard = false) {
  const tab = getActiveTab();
  if (!tab || !tab.ready) return;
  if (hard) tab.webview.reloadIgnoringCache(); else tab.webview.reload();
}

newTabButton.addEventListener('click', openNewTab);

backButton.addEventListener('click', () => {
  const tab = getActiveTab();
  if (tab && tab.ready && tab.webview.canGoBack()) tab.webview.goBack();
});

forwardButton.addEventListener('click', () => {
  const tab = getActiveTab();
  if (tab && tab.ready && tab.webview.canGoForward()) tab.webview.goForward();
});

// Reload, or Stop if the page is still loading.
reloadButton.addEventListener('click', () => {
  const tab = getActiveTab();
  if (!tab || !tab.ready) return;
  if (tab.loading) tab.webview.stop(); else tab.webview.reload();
});

homeButton.addEventListener('click', () => {
  const tab = getActiveTab();
  if (tab) navigate(tab, homeAddress());
});

splitButton.addEventListener('click', toggleSplit);

// Pressing Enter in the address bar.
addressForm.addEventListener('submit', (event) => {
  event.preventDefault();   // stop the form from reloading the toolbar page
  const tab = getActiveTab();
  const url = toWebAddress(addressInput.value);
  if (tab && url) {
    addressInput.blur();
    navigate(tab, url);
  }
});

// Clicking in the address bar selects everything, ready to type over.
addressInput.addEventListener('focus', () => addressInput.select());

// Escape cancels your typing and shows the current address again.
addressInput.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    addressInput.blur();
    updateToolbar();
  }
});

// Leaving the address bar without pressing Enter restores the real address.
addressInput.addEventListener('blur', () => updateToolbar());


// =============================================================================
//  8. BOOKMARKS
// =============================================================================
// Bookmarks normally live in memory only, so they are gone when the window
// closes (in keeping with the browser wiping everything on exit). If you
// switch on Settings -> Saved data -> "Keep bookmarks in the vault", they
// are stored in the vault behind your master password (section 8b), and
// appear once you unlock it.
//
// Where they show up:
//   - the bookmarks BAR under the toolbar: pages you starred yourself
//   - the bookmarks PANEL (toolbar button): everything, in folders, with a
//     search box, remove buttons and "Import"
//
// Imported bookmarks keep their folders, under the name of the browser they
// came from, e.g. "Chrome / Bookmarks bar / News".

const bookmarks = [];   // each entry: { title, url, folder }  (folder '' = on the bar)

const bookmarksButton = byId('bookmarks-button');
const bookmarksPanel  = byId('bookmarks-panel');
const bookmarksList   = byId('bookmarks-list');
const bookmarksSearch = byId('bookmarks-search');
const bookmarksNote   = byId('bookmarks-note');
const importScrim   = byId('import-scrim');
const importText    = byId('import-text');
const importSources = byId('import-sources');
const importActions = byId('import-actions');
const importKeepRow = byId('import-keep-row');
const importKeep    = byId('import-keep');

const openFolders = new Set(['']);   // which folders are unfolded in the panel
let folderToRemove = null;           // a folder whose "remove all" awaits a second click

function isBookmarked(url) {
  return bookmarks.some((bookmark) => bookmark.url === url);
}

// Call after ANY change to the list: redraws everything and, if saving is
// switched on, writes the encrypted file.
function bookmarksChanged() {
  drawBookmarksBar();
  if (!bookmarksPanel.hidden) drawBookmarksPanel();
  updateToolbar();
  if (bookmarksKept()) {
    window.klorineVault.saveBookmarks(bookmarks).then((ok) => {
      if (!ok && bookmarksKept()) showSnackbar('Could not save your bookmarks to the vault.');
    }).catch(() => {});
  }
}

// Opens a bookmark: in this tab, or in a new tab with Ctrl/Cmd or the
// middle mouse button.
function openBookmark(bookmark, event) {
  const newTab = event && (event.ctrlKey || event.metaKey || event.button === 1);
  const tab = getActiveTab();
  if (newTab || !tab) createTab(bookmark.url);
  else navigate(tab, bookmark.url);
}

// The star button: adds the current page, or removes it if already saved.
bookmarkButton.addEventListener('click', () => {
  const tab = getActiveTab();
  if (!tab || !isWebUrl(tab.url) || tab.failed || tab.crashed) return;

  const index = bookmarks.findIndex((bookmark) => bookmark.url === tab.url);
  if (index === -1) {
    bookmarks.push({ title: tab.title, url: tab.url, folder: '' });
    showSnackbar(bookmarksKept() ? 'Bookmark added' : 'Bookmark added (until Klorine closes)');
  } else {
    bookmarks.splice(index, 1);
    showSnackbar('Bookmark removed');
  }
  bookmarksChanged();
});

// Rebuilds the row of bookmark chips under the toolbar: the pages you
// starred yourself (imported ones are in the panel, in their folders).
function drawBookmarksBar() {
  bookmarksBar.replaceChildren();
  const onBar = bookmarks.filter((bookmark) => bookmark.folder === '');
  for (const bookmark of onBar) {
    const chip = document.createElement('button');
    chip.className = 'bookmark-chip';
    chip.title = bookmark.url;

    const label = document.createElement('span');
    label.textContent = bookmark.title;

    chip.append(makeIcon('star'), label);
    chip.addEventListener('click', (event) => openBookmark(bookmark, event));
    chip.addEventListener('auxclick', (event) => { if (event.button === 1) openBookmark(bookmark, event); });
    bookmarksBar.appendChild(chip);
  }
  // Hide the whole bar when there is nothing in it.
  bookmarksBar.hidden = onBar.length === 0;
}

// ---------- The bookmarks panel ----------

// A short site name for lists: "bbc.com" for https://www.bbc.com/news.
function bookmarkHost(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch (error) { return url; }
}

// One line in the panel: the bookmark (click to open) and a remove button.
function makeBookmarkRow(bookmark) {
  const row = document.createElement('div');
  row.className = 'bookmark-row';

  const open = document.createElement('button');
  open.type = 'button';
  open.className = 'bookmark-open';
  open.title = bookmark.title + '\n' + bookmark.url;
  const text = document.createElement('span');
  text.className = 'bookmark-text';
  const title = document.createElement('span');
  title.className = 'bookmark-title';
  title.textContent = bookmark.title;
  const host = document.createElement('span');
  host.className = 'bookmark-host';
  host.textContent = bookmarkHost(bookmark.url);
  text.append(title, host);
  open.append(makeIcon(bookmark.folder === '' ? 'star' : 'public'), text);
  const go = (event) => { closeMenus(); openBookmark(bookmark, event); };
  open.addEventListener('click', go);
  open.addEventListener('auxclick', (event) => { if (event.button === 1) go(event); });

  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'icon-btn small bookmark-remove';
  setTip(remove, 'Remove this bookmark');
  remove.appendChild(makeIcon('close'));
  remove.addEventListener('click', () => {
    const index = bookmarks.indexOf(bookmark);
    if (index !== -1) bookmarks.splice(index, 1);
    bookmarksChanged();
  });

  row.append(open, remove);
  return row;
}

function drawBookmarksPanel() {
  bookmarksList.replaceChildren();
  const query = bookmarksSearch.value.trim().toLowerCase();

  if (bookmarks.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'bookmarks-empty';
    empty.textContent = 'No bookmarks yet. Click the star in the address bar to add a page, or use Import to bring them in from another browser.';
    bookmarksList.appendChild(empty);
  } else if (query) {
    // Searching: one flat list of matches (title or address).
    const matches = bookmarks.filter((b) => b.title.toLowerCase().includes(query) || b.url.toLowerCase().includes(query));
    for (const bookmark of matches.slice(0, 200)) bookmarksList.appendChild(makeBookmarkRow(bookmark));
    if (matches.length === 0 || matches.length > 200) {
      const info = document.createElement('p');
      info.className = 'bookmarks-empty';
      info.textContent = matches.length === 0 ? 'No bookmarks match “' + bookmarksSearch.value.trim() + '”.'
        : 'Showing the first 200 of ' + matches.length + ' matches. Type more to narrow it down.';
      bookmarksList.appendChild(info);
    }
  } else {
    // Grouped by folder; the bar's bookmarks first, then folders A to Z.
    const groups = new Map();
    for (const bookmark of bookmarks) {
      if (!groups.has(bookmark.folder)) groups.set(bookmark.folder, []);
      groups.get(bookmark.folder).push(bookmark);
    }
    const folders = [...groups.keys()].sort((a, b) => (a === '' ? -1 : b === '' ? 1 : a.localeCompare(b)));
    for (const folder of folders) {
      const items = groups.get(folder);
      const isOpen = openFolders.has(folder);

      const head = document.createElement('div');
      head.className = 'bookmark-folder';
      const toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.className = 'bookmark-folder-toggle';
      toggle.setAttribute('aria-expanded', String(isOpen));
      // The folder's own name, with where it sits in smaller text below:
      //   News
      //   Chrome > Bookmarks bar
      const parts = folder.split('/');
      const name = document.createElement('span');
      name.className = 'bookmark-folder-name';
      const own = document.createElement('span');
      own.className = 'bookmark-folder-own';
      own.textContent = folder === '' ? 'On the bookmarks bar' : parts[parts.length - 1];
      name.appendChild(own);
      if (parts.length > 1) {
        const where = document.createElement('span');
        where.className = 'bookmark-folder-where';
        where.textContent = parts.slice(0, -1).join(' › ');
        name.appendChild(where);
      }
      name.title = folder === '' ? own.textContent : parts.join(' › ');
      const count = document.createElement('span');
      count.className = 'bookmark-folder-count';
      count.textContent = String(items.length);
      toggle.append(makeIcon(isOpen ? 'expand_more' : 'chevron_right'), name, count);
      toggle.addEventListener('click', () => {
        if (isOpen) openFolders.delete(folder); else openFolders.add(folder);
        folderToRemove = null;
        drawBookmarksPanel();
      });

      // Remove a whole folder: needs a second click, to be safe.
      const removeAll = document.createElement('button');
      removeAll.type = 'button';
      if (folderToRemove === folder) {
        removeAll.className = 'text-btn bookmark-folder-confirm';
        removeAll.textContent = 'Remove ' + items.length + '?';
      } else {
        removeAll.className = 'icon-btn small bookmark-folder-remove';
        setTip(removeAll, 'Remove all ' + items.length + ' in this folder');
        removeAll.appendChild(makeIcon('delete'));
      }
      removeAll.addEventListener('click', () => {
        if (folderToRemove !== folder) { folderToRemove = folder; drawBookmarksPanel(); return; }
        folderToRemove = null;
        for (let i = bookmarks.length - 1; i >= 0; i--) if (bookmarks[i].folder === folder) bookmarks.splice(i, 1);
        showSnackbar('Removed ' + items.length + (items.length === 1 ? ' bookmark' : ' bookmarks'));
        bookmarksChanged();
      });

      head.append(toggle, removeAll);
      bookmarksList.appendChild(head);
      if (isOpen) for (const bookmark of items) bookmarksList.appendChild(makeBookmarkRow(bookmark));
    }
  }

  // The note at the bottom: are these bookmarks being kept?
  bookmarksNote.replaceChildren();
  if (bookmarksKept()) {
    bookmarksNote.textContent = 'Kept in your vault on this computer. Never sent anywhere.';
  } else if (vaultState.exists && vaultState.keepBookmarks) {
    bookmarksNote.append('Your kept bookmarks are locked in the vault. ',
      makeTextButton('Unlock…', () => unlockVaultFlow('Enter your master password to load your bookmarks.')));
  } else {
    bookmarksNote.textContent = 'Forgotten when Klorine closes. To keep them, see Settings → Saved data.';
  }
}

function openBookmarksPanel() {
  closeMenus();
  folderToRemove = null;
  bookmarksSearch.value = '';
  drawBookmarksPanel();
  bookmarksPanel.hidden = false;
  const box = bookmarksButton.getBoundingClientRect();
  placeFloating(bookmarksPanel, box.right - bookmarksPanel.offsetWidth, box.bottom + 10);
  bookmarksButton.classList.add('panel-open');
  bookmarksSearch.focus();
}

bookmarksButton.addEventListener('click', () => {
  if (!bookmarksPanel.hidden) closeMenus(); else openBookmarksPanel();
});
bookmarksSearch.addEventListener('input', drawBookmarksPanel);

// ---------- Importing bookmarks ----------
// Step 1: choose a browser found on this computer, or a bookmarks file.
// Step 2: Klorine shows how many bookmarks it found; nothing is added
//         until you press "Import".

function closeImportDialog() {
  importScrim.hidden = true;
}

function importButton(label, className, onClick) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className;
  button.textContent = label;
  button.addEventListener('click', onClick);
  return button;
}

async function showImportChoices() {
  closeMenus();
  importScrim.hidden = false;
  importKeepRow.hidden = true;
  importText.textContent = 'Looking for other browsers on this computer…';
  importSources.replaceChildren();
  importActions.replaceChildren(importButton('Cancel', 'text-btn', closeImportDialog));

  let found = [];
  try { found = (await window.klorineBookmarks.findBrowsers()) || []; } catch (error) { found = []; }
  if (importScrim.hidden) return;   // cancelled meanwhile

  importText.textContent = 'Where should Klorine bring bookmarks in from? Only bookmarks are read – never passwords, history or cookies – and nothing is added until you confirm.';
  const addSource = (icon, title, detail, onClick) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'import-source';
    const text = document.createElement('span');
    text.className = 'import-source-text';
    const name = document.createElement('span');
    name.className = 'import-source-name';
    name.textContent = title;
    const more = document.createElement('span');
    more.className = 'import-source-detail';
    more.textContent = detail;
    text.append(name, more);
    button.append(makeIcon(icon), text);
    button.addEventListener('click', onClick);
    importSources.appendChild(button);
  };
  for (const source of found) {
    addSource('public', source.name, 'Found on this computer', () => readImport(source.name, () => window.klorineBookmarks.readBrowser(source.id)));
  }
  addSource('upload_file', 'A bookmarks file…', 'The .html file made by any browser’s “Export bookmarks”', () => readImport(null, () => window.klorineBookmarks.readFile()));
  const first = importSources.querySelector('button');
  if (first) first.focus();
}

async function readImport(name, read) {
  importText.textContent = name ? 'Reading bookmarks from ' + name + '…' : 'Waiting for you to choose a file…';
  importSources.replaceChildren();
  importActions.replaceChildren(importButton('Cancel', 'text-btn', closeImportDialog));

  let answer = null;
  try { answer = await read(); } catch (error) { answer = { error: 'unreadable' }; }
  if (importScrim.hidden) return;
  if (answer === null) { showImportChoices(); return; }   // file picker cancelled

  const source = answer.name || name || 'the file';
  const back = importButton('Back', 'text-btn', showImportChoices);
  if (answer.error || !Array.isArray(answer.bookmarks)) {
    importText.textContent = 'Klorine couldn’t read bookmarks from ' + source + '. ' +
      (name ? 'Try closing that browser first, or export its bookmarks to a file and import the file.' : 'Make sure it is a bookmarks file exported from a browser.');
    importActions.replaceChildren(back, importButton('Close', 'filled-btn', closeImportDialog));
    return;
  }

  const fresh = answer.bookmarks.filter((b) => !isBookmarked(b.url));
  const room = 5000 - bookmarks.length;
  const adding = fresh.slice(0, Math.max(0, room));
  if (adding.length === 0) {
    importText.textContent = answer.bookmarks.length === 0
      ? 'No bookmarks were found in ' + source + '.'
      : 'All ' + answer.bookmarks.length + ' bookmarks from ' + source + ' are already in Klorine.';
    importActions.replaceChildren(back, importButton('Close', 'filled-btn', closeImportDialog));
    return;
  }

  importText.textContent = 'Found ' + answer.bookmarks.length + (answer.bookmarks.length === 1 ? ' bookmark' : ' bookmarks') + ' in ' + source +
    (adding.length < answer.bookmarks.length ? ' (' + adding.length + (adding.length === 1 ? ' is new).' : ' are new).') : '.') +
    ' They will appear in the bookmarks panel, in their folders.';
  // Offer to keep bookmarks, if you are not keeping them yet.
  importKeepRow.hidden = (vaultState.exists && vaultState.keepBookmarks) || !vaultState.canEncrypt;
  importKeep.checked = false;

  const confirm = importButton('Import ' + adding.length, 'filled-btn', async () => {
    // Put them under the source's name: "Chrome/Bookmarks bar/News".
    const top = (name || 'Imported').replace(/\//g, '-');
    for (const bookmark of adding) {
      bookmarks.push({ title: bookmark.title, url: bookmark.url, folder: [top, bookmark.folder].filter(Boolean).join('/') });
    }
    const keep = !importKeepRow.hidden && importKeep.checked;
    closeImportDialog();
    if (keep) await setBookmarkSaving(true);
    bookmarksChanged();
    showSnackbar('Imported ' + adding.length + (adding.length === 1 ? ' bookmark' : ' bookmarks') + ' from ' + source +
      (bookmarksKept() ? '.' : ' (until Klorine closes).'));
    openBookmarksPanel();
  });
  importActions.replaceChildren(back, confirm);
  confirm.focus();
}

byId('bookmarks-import').addEventListener('click', () => {
  if (window.klorineBookmarks) showImportChoices();
});
// Clicking the dark area around the dialog closes it.
importScrim.addEventListener('click', (event) => {
  if (event.target === importScrim) closeImportDialog();
});


// =============================================================================
//  8b. THE VAULT: MASTER PASSWORD, SAVED PASSWORDS, KEPT BOOKMARKS
// =============================================================================
// The vault is an encrypted file on this computer, opened with your master
// password (main.js does all the encryption; see "The vault" there).
// It is OPTIONAL: until you set it up in Settings -> Saved data, nothing
// is saved and web pages are not watched for sign-ins.
//
// This section is the part you see:
//   - dialogs: create the vault, unlock it, change the master password
//   - Settings -> Saved data: its switches and buttons
//   - the key button in the address bar: fill a saved sign-in (only when
//     you click it) and the "Save password?" question after you sign in
//   - the "Saved passwords" window: search, show, copy, delete, import
//
// The toolbar never holds passwords: it asks main.js for one only when you
// click "show", and filling goes straight from main.js into the page.

const vaultState = {
  exists: false,          // has a vault been created?
  unlocked: false,
  keepBookmarks: false,   // are bookmarks stored in the vault?
  offerSave: true,        // ask "Save password?" after sign-ins
  autoLockMinutes: 15,
  logins: null,           // how many passwords are saved (known while unlocked)
  canEncrypt: false,      // can this computer protect files at all?
  legacyBookmarks: false, // bookmarks kept by the earlier version, not yet in a vault
};

const hasVaultTools = () => Boolean(window.klorineVault && window.klorinePasswords);

// Are bookmarks being saved right now? (Vault open, and the switch on.)
function bookmarksKept() {
  return vaultState.unlocked && vaultState.keepBookmarks;
}

function applyVaultStatus(status) {
  if (!status) return;
  for (const key of Object.keys(vaultState)) if (key in status) vaultState[key] = status[key];
  drawVaultSettings();
  updateToolbar();
  if (!bookmarksPanel.hidden) drawBookmarksPanel();
}

// ---------- A general dialog: words, some boxes, two buttons ----------
// askDialog({...}) shows it and returns a promise: the typed values when
// confirmed, or null when cancelled. "onSubmit" can check the values and
// return an error message to keep the dialog open.

const askScrim   = byId('ask-scrim');
const askForm    = byId('ask-form');
const askTitle   = byId('ask-title');
const askText    = byId('ask-text');
const askFields  = byId('ask-fields');
const askError   = byId('ask-error');
const askActions = byId('ask-actions');
let finishAsk = null;

function askDialog({ title, text, fields = [], confirm = 'OK', cancel = 'Cancel', danger = false, extra = null, onSubmit = null }) {
  return new Promise((resolve) => {
    if (finishAsk) finishAsk(null);       // only one at a time
    closeMenus();
    closeSettings();

    askTitle.textContent = title;
    askText.textContent = text;
    askError.hidden = true;
    askFields.replaceChildren();
    const inputs = {};
    for (const field of fields) {
      const wrap = document.createElement('label');
      wrap.className = 'ask-field';
      const caption = document.createElement('span');
      caption.className = 'ask-label';
      caption.textContent = field.label;
      const row = document.createElement('span');
      row.className = 'ask-input-row';
      const input = document.createElement('input');
      input.className = 'text-field';
      input.type = field.type || 'text';
      input.autocomplete = field.type === 'password' ? 'new-password' : 'off';
      input.spellcheck = false;
      input.maxLength = 256;
      row.appendChild(input);
      if (field.type === 'password') {
        // An eye button to check what you typed.
        const eye = document.createElement('button');
        eye.type = 'button';
        eye.className = 'icon-btn small';
        setTip(eye, 'Show or hide what you typed');
        const eyeIcon = makeIcon('visibility');
        eye.appendChild(eyeIcon);
        eye.addEventListener('click', () => {
          input.type = input.type === 'password' ? 'text' : 'password';
          eyeIcon.textContent = input.type === 'password' ? 'visibility' : 'visibility_off';
        });
        row.appendChild(eye);
      }
      wrap.append(caption, row);
      askFields.appendChild(wrap);
      inputs[field.name] = input;
    }

    const cancelButton = document.createElement('button');
    cancelButton.type = 'button';
    cancelButton.className = 'text-btn';
    cancelButton.textContent = cancel;
    const confirmButton = document.createElement('button');
    confirmButton.type = 'submit';
    confirmButton.className = 'filled-btn' + (danger ? ' danger-btn' : '');
    confirmButton.textContent = confirm;
    askActions.replaceChildren();
    if (extra) {
      const extraButton = document.createElement('button');
      extraButton.type = 'button';
      extraButton.className = 'text-btn ask-extra';
      extraButton.textContent = extra.label;
      extraButton.addEventListener('click', () => { finishAsk(null); extra.onClick(); });
      askActions.appendChild(extraButton);
    }
    askActions.append(cancelButton, confirmButton);

    let busy = false;
    finishAsk = (result) => {
      finishAsk = null;
      askScrim.hidden = true;
      for (const input of Object.values(inputs)) input.value = '';   // do not leave passwords in the page
      askForm.onsubmit = null;
      resolve(result);
    };
    cancelButton.addEventListener('click', () => finishAsk(null));
    askForm.onsubmit = async (event) => {
      event.preventDefault();
      if (busy) return;
      const values = {};
      for (const [name, input] of Object.entries(inputs)) values[name] = input.value;
      busy = true;
      confirmButton.disabled = true;
      let problem = null;
      try { problem = onSubmit ? await onSubmit(values) : null; } catch (error) { problem = 'Something went wrong. Please try again.'; }
      busy = false;
      confirmButton.disabled = false;
      if (!finishAsk) return;              // closed meanwhile
      if (problem) {
        askError.textContent = problem;
        askError.hidden = false;
        const first = Object.values(inputs)[0];
        if (first) { first.focus(); first.select(); }
        return;
      }
      finishAsk(values);
    };

    askScrim.hidden = false;
    const first = Object.values(inputs)[0];
    (first || confirmButton).focus();
  });
}

// ---------- Creating, unlocking, locking ----------

// keepBookmarks: also start keeping bookmarks in the new vault.
async function createVaultFlow(keepBookmarks, why = '') {
  if (!hasVaultTools()) return false;
  if (!vaultState.canEncrypt) {
    showSnackbar('This computer can’t protect files right now, so the vault is unavailable.');
    return false;
  }
  // Bookmarks kept by the earlier version always move into the new vault.
  keepBookmarks = keepBookmarks || vaultState.legacyBookmarks;
  const done = await askDialog({
    title: 'Create your vault',
    text: (why ? why + ' ' : '') + 'Choose a master password. It locks your saved passwords and bookmarks on this computer. ' +
      'It cannot be recovered: if you forget it, the vault can only be deleted and started again.',
    fields: [
      { name: 'password', label: 'Master password (8 or more characters)', type: 'password' },
      { name: 'again', label: 'Type it again', type: 'password' },
    ],
    confirm: 'Create vault',
    onSubmit: async (values) => {
      if (values.password.length < 8) return 'Use at least 8 characters. Three or four random words make a strong password that is easy to remember.';
      if (values.password !== values.again) return 'The two passwords don’t match.';
      const answer = await window.klorineVault.create(values.password, keepBookmarks, bookmarks);
      if (!answer || !answer.ok) return 'The vault could not be created.';
      vaultState.legacyBookmarks = false;
      applyVaultStatus(answer.status);
      return null;
    },
  });
  if (done) showSnackbar('Vault created. Don’t forget your master password: it cannot be recovered.');
  return Boolean(done);
}

// Called when the vault has just been opened: brings in the kept bookmarks.
function vaultOpened(answer) {
  applyVaultStatus(answer.status);
  if (vaultState.keepBookmarks) {
    // Kept bookmarks first, then any you added this session before unlocking.
    const session = bookmarks.splice(0, bookmarks.length);
    for (const bookmark of answer.bookmarks || []) bookmarks.push(bookmark);
    let added = false;
    for (const bookmark of session) if (!isBookmarked(bookmark.url)) { bookmarks.push(bookmark); added = true; }
    drawBookmarksBar();
    if (!bookmarksPanel.hidden) drawBookmarksPanel();
    updateToolbar();
    if (added) window.klorineVault.saveBookmarks(bookmarks).catch(() => {});
  }
}

async function unlockVaultFlow(why = '', cancelLabel = 'Cancel') {
  if (!hasVaultTools()) return false;
  const done = await askDialog({
    title: 'Unlock your vault',
    text: why || 'Enter your master password.',
    fields: [{ name: 'password', label: 'Master password', type: 'password' }],
    confirm: 'Unlock',
    cancel: cancelLabel,
    extra: { label: 'Forgot it?', onClick: () => deleteVaultFlow(true) },
    onSubmit: async (values) => {
      const answer = await window.klorineVault.unlock(values.password);
      if (answer && answer.ok) { vaultOpened(answer); return null; }
      if (answer && answer.error === 'wait') return 'Too many wrong tries. Wait ' + answer.seconds + (answer.seconds === 1 ? ' second' : ' seconds') + ' and try again.';
      if (answer && (answer.error === 'damaged' || answer.error === 'missing')) return 'The vault file is missing or damaged and cannot be opened.';
      return 'That is not the master password.';
    },
  });
  return Boolean(done);
}

// Makes sure the vault exists and is open, asking you as needed.
// Returns true once it is open.
async function ensureVaultOpen(why = '') {
  if (!hasVaultTools()) return false;
  if (!vaultState.exists) return createVaultFlow(false, why);
  if (!vaultState.unlocked) return unlockVaultFlow(why);
  return true;
}

async function deleteVaultFlow(forgot = false) {
  const done = await askDialog({
    title: 'Delete the vault?',
    text: (forgot ? 'A forgotten master password cannot be recovered. The only way forward is to delete the vault and start again. ' : '') +
      'This permanently deletes every saved password and saved bookmark on this computer. It cannot be undone.',
    fields: [{ name: 'word', label: 'Type DELETE to confirm', type: 'text' }],
    confirm: 'Delete everything',
    danger: true,
    onSubmit: async (values) => {
      if (values.word.trim().toUpperCase() !== 'DELETE') return 'Type the word DELETE to confirm.';
      applyVaultStatus(await window.klorineVault.deleteVault());
      return null;
    },
  });
  if (done) showSnackbar('Vault deleted. Nothing is saved on this computer any more.');
}

async function changeMasterPasswordFlow() {
  if (!(await ensureVaultOpen())) return;
  const done = await askDialog({
    title: 'Change master password',
    text: 'Enter your current master password, then the new one.',
    fields: [
      { name: 'current', label: 'Current master password', type: 'password' },
      { name: 'password', label: 'New master password (8 or more characters)', type: 'password' },
      { name: 'again', label: 'Type the new one again', type: 'password' },
    ],
    confirm: 'Change',
    onSubmit: async (values) => {
      if (values.password.length < 8) return 'Use at least 8 characters for the new password.';
      if (values.password !== values.again) return 'The two new passwords don’t match.';
      const answer = await window.klorineVault.changePassword(values.current, values.password);
      if (answer && answer.ok) return null;
      return answer && answer.error === 'wrong' ? 'The current master password is not right.' : 'The master password could not be changed.';
    },
  });
  if (done) showSnackbar('Master password changed.');
}

// main.js locked the vault (you were away, Windows locked, or "Lock now").
function vaultWasLocked(reason) {
  vaultState.unlocked = false;
  vaultState.logins = null;
  if (vaultState.keepBookmarks) {           // kept bookmarks go back behind the lock
    bookmarks.length = 0;
    drawBookmarksBar();
  }
  for (const tab of tabs) tab.pendingSave = null;
  hideSavePrompt();
  closePasswordsWindow();
  closeMenus();
  applyVaultStatus({});
  if (reason === 'idle') showSnackbar('Vault locked because you were away.');
  else if (reason === 'screen-locked' || reason === 'sleep') showSnackbar('Vault locked.');
  else if (reason === 'manual') showSnackbar('Vault locked.');
}

// ---------- Keeping bookmarks in the vault ----------

async function setBookmarkSaving(on) {
  if (!hasVaultTools()) return false;
  if (!vaultState.exists) {
    if (!on) return true;
    return createVaultFlow(true, 'To keep bookmarks after Klorine closes, they go into a vault.');
  }
  if (!(await ensureVaultOpen(on ? 'Unlock your vault to keep bookmarks in it.' : 'Unlock your vault to change this.'))) return false;
  let status = null;
  try { status = await window.klorineVault.set({ keepBookmarks: on }, bookmarks); } catch (error) { status = null; }
  if (!status) { showSnackbar('That could not be changed.'); return false; }
  applyVaultStatus(status);
  return true;
}

// ---------- Settings -> Saved data ----------

const vaultSettings = byId('vault-settings');

function makeSwitchRow(label, hint, checked, onChange) {
  const row = document.createElement('label');
  row.className = 'switch-row';
  const text = document.createElement('span');
  text.className = 'switch-text';
  const name = document.createElement('span');
  name.className = 'switch-label';
  name.textContent = label;
  const more = document.createElement('span');
  more.className = 'switch-hint';
  more.textContent = hint;
  text.append(name, more);
  const input = document.createElement('input');
  input.className = 'switch';
  input.type = 'checkbox';
  input.setAttribute('role', 'switch');
  input.checked = checked;
  input.addEventListener('change', async () => {
    const wanted = input.checked;
    input.checked = !wanted;          // only flips once the change really happened
    await onChange(wanted);
  });
  row.append(text, input);
  return row;
}

function makeTextButton(label, onClick, className = 'text-btn') {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className;
  button.textContent = label;
  button.addEventListener('click', onClick);
  return button;
}

function drawVaultSettings() {
  vaultSettings.replaceChildren();
  const hint = (text) => {
    const p = document.createElement('p');
    p.className = 'setting-hint';
    p.textContent = text;
    return p;
  };

  if (!hasVaultTools()) { vaultSettings.appendChild(hint('Saving is unavailable.')); return; }

  if (!vaultState.exists) {
    vaultSettings.append(
      hint('Nothing is saved right now. To keep bookmarks or passwords after Klorine closes, set up a vault: an encrypted file on this computer, opened with a master password only you know. Nothing is ever sent anywhere.'),
      makeTextButton('Set up vault…', () => createVaultFlow(false), 'tonal-btn'),
    );
    return;
  }

  // Locked or unlocked, with a button to change that.
  const state = document.createElement('div');
  state.className = 'vault-state';
  const stateText = document.createElement('span');
  stateText.className = 'vault-state-text';
  stateText.append(makeIcon(vaultState.unlocked ? 'lock_open' : 'lock'),
    document.createTextNode(vaultState.unlocked ? 'Vault is unlocked' : 'Vault is locked'));
  state.append(stateText, vaultState.unlocked
    ? makeTextButton('Lock now', async () => { await window.klorineVault.lock(); })
    : makeTextButton('Unlock…', () => unlockVaultFlow()));
  vaultSettings.appendChild(state);

  const changeSetting = async (changes) => {
    if (!(await ensureVaultOpen('Unlock your vault to change this.'))) return;
    applyVaultStatus(await window.klorineVault.set(changes, bookmarks));
  };

  vaultSettings.append(
    makeSwitchRow('Keep bookmarks in the vault',
      'Off: bookmarks are forgotten when Klorine closes. On: they are kept and appear after you unlock.',
      vaultState.keepBookmarks, async (on) => {
        if (await setBookmarkSaving(on)) showSnackbar(on ? 'Bookmarks are now kept in your vault.' : 'Kept bookmarks deleted from the vault. They stay until Klorine closes.');
      }),
    makeSwitchRow('Offer to save passwords',
      'Asks after you sign in to a site. Nothing is saved unless you say yes.',
      vaultState.offerSave, (on) => changeSetting({ offerSave: on })),
  );

  const lockLabel = document.createElement('div');
  lockLabel.className = 'setting-sublabel';
  lockLabel.textContent = 'Lock the vault when I’m away for';
  const chips = document.createElement('div');
  chips.className = 'chip-row';
  for (const [minutes, label] of [[5, '5 min'], [15, '15 min'], [60, '1 hour'], [0, 'Never']]) {
    const chip = document.createElement('label');
    chip.className = 'choice-chip';
    const radio = document.createElement('input');
    radio.type = 'radio';
    radio.name = 'auto-lock';
    radio.checked = vaultState.autoLockMinutes === minutes;
    radio.addEventListener('change', () => changeSetting({ autoLockMinutes: minutes }).then(drawVaultSettings));
    const text = document.createElement('span');
    text.textContent = label;
    chip.append(radio, text);
    chips.appendChild(chip);
  }
  vaultSettings.append(lockLabel, chips,
    hint('It also locks when Windows is locked or sleeps, and whenever Klorine closes.'));

  const buttons = document.createElement('div');
  buttons.className = 'vault-buttons';
  buttons.append(
    makeTextButton('Manage passwords…', openPasswordsWindow),
    makeTextButton('Change master password…', changeMasterPasswordFlow),
    makeTextButton('Delete vault…', () => deleteVaultFlow(false), 'text-btn danger-text'),
  );
  vaultSettings.appendChild(buttons);
}

// ---------- The key button: fill a saved sign-in ----------

const keyButton  = byId('key-button');
const loginsMenu = byId('logins-menu');

// Called by updateToolbar() for the tab shown in the toolbar.
function drawKeyButton(tab) {
  const isSite = isWebUrl(tab.url) && !tab.failed && !tab.crashed && !tab.start;
  const show = vaultState.exists && isSite && Boolean(tab.hasPasswordBox || tab.pendingSave);
  keyButton.hidden = !show;
  keyButton.classList.toggle('attention', Boolean(tab.pendingSave));
  setTip(keyButton, tab.pendingSave ? 'Save this password?' : 'Fill a saved password');
  if (savePromptTab && savePromptTab !== tab) hideSavePrompt();   // you switched tabs
}

const FILL_MESSAGES = {
  'filled': 'Filled in. Check it, then sign in.',
  'username-only': 'Username filled in. Click the key again when the password box appears.',
  'no-form': 'Klorine couldn’t find a sign-in box on this page.',
  'wrong-site': 'This page is not the site that password was saved for.',
};

async function openLoginsMenu() {
  const tab = getActiveTab();
  const id = pageNumber(tab);
  if (!tab || id === null) return;
  if (!(await ensureVaultOpen('Unlock your vault to fill a saved password.'))) return;

  const info = await window.klorinePasswords.forTab(id);
  closeMenus();
  loginsMenu.replaceChildren();
  const entry = (icon, text, onClick) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'menu-entry';
    button.setAttribute('role', 'menuitem');
    const label = document.createElement('span');
    label.className = 'menu-entry-label';
    label.textContent = text;
    button.append(makeIcon(icon), label);
    button.addEventListener('click', () => { closeMenus(); onClick(); });
    loginsMenu.appendChild(button);
    return button;
  };

  if (!info || !info.origin) {
    const none = document.createElement('p');
    none.className = 'menu-note';
    none.textContent = 'Passwords are only filled on secure (https) pages.';
    loginsMenu.appendChild(none);
  } else if (info.logins.length === 0) {
    const none = document.createElement('p');
    none.className = 'menu-note';
    none.textContent = 'No saved password for this site yet. Sign in and Klorine will offer to save it.';
    loginsMenu.appendChild(none);
  } else {
    for (const login of info.logins) {
      entry('person', login.username || '(no username)', async () => {
        const result = await window.klorinePasswords.fill(id, login.id);
        showSnackbar(FILL_MESSAGES[result] || 'The password could not be filled in.');
      });
    }
  }
  entry('key', 'Manage passwords…', openPasswordsWindow);

  loginsMenu.hidden = false;
  const box = keyButton.getBoundingClientRect();
  placeFloating(loginsMenu, box.right - loginsMenu.offsetWidth, box.bottom + 10);
  const first = loginsMenu.querySelector('button');
  if (first) first.focus();
}

keyButton.addEventListener('click', () => {
  const tab = getActiveTab();
  if (!tab) return;
  if (!loginsMenu.hidden) { closeMenus(); return; }
  if (tab.pendingSave) showSavePrompt(tab); else openLoginsMenu();
});

// ---------- "Save password?" ----------

const savePrompt     = byId('save-prompt');
const savePromptText = byId('save-prompt-text');
let savePromptTab = null;    // the tab the visible question belongs to

function hideSavePrompt() {
  savePrompt.hidden = true;
  savePromptTab = null;
}

function showSavePrompt(tab) {
  const pending = tab.pendingSave;
  if (!pending) return;
  savePromptTab = tab;
  savePromptText.replaceChildren();
  const strong = (text) => { const b = document.createElement('strong'); b.textContent = text; return b; };
  savePromptText.append(
    pending.update ? 'Update the saved password for ' : 'Save the password for ',
    strong(pending.username || '(no username)'), ' on ', strong(pending.host), '?');
  byId('save-yes').textContent = pending.update ? 'Update' : 'Save';
  savePrompt.hidden = false;
  // Just below the key button, lined up with its right-hand edge.
  const box = keyButton.getBoundingClientRect();
  if (box.width > 0) {
    savePrompt.style.top = Math.round(box.bottom + 12) + 'px';
    savePrompt.style.right = Math.max(8, Math.round(window.innerWidth - box.right - 8)) + 'px';
  }
}

// main.js: you just signed in on the page in this tab.
function offerToSavePassword(offer) {
  const tab = tabs.find((t) => pageNumber(t) === offer.id);
  if (!tab || typeof offer.token !== 'string') return;
  tab.pendingSave = { token: offer.token, host: String(offer.host), username: String(offer.username || ''), update: offer.update === true };
  // main.js forgets the sign-in after 3 minutes; so do we.
  setTimeout(() => {
    if (tab.pendingSave && tab.pendingSave.token === offer.token) {
      tab.pendingSave = null;
      if (savePromptTab === tab) hideSavePrompt();
      updateToolbar();
    }
  }, 3 * 60 * 1000);
  updateToolbar();                       // shows the key button first
  if (tab === getActiveTab()) showSavePrompt(tab);
}

async function answerSavePrompt(choice) {
  const tab = savePromptTab;
  const pending = tab && tab.pendingSave;
  hideSavePrompt();
  if (!pending) return;

  if (choice === 'save') {
    if (!(await ensureVaultOpen('Unlock your vault to save this password.'))) { updateToolbar(); return; }   // still waiting; the key stays lit
    const answer = await window.klorinePasswords.savePending(pending.token);
    tab.pendingSave = null;
    if (answer && answer.ok) showSnackbar(answer.updated ? 'Password updated in your vault.' : 'Password saved in your vault.');
    else showSnackbar(answer && answer.error === 'expired' ? 'That sign-in is no longer available. Sign in again to save it.' : 'The password could not be saved.');
  } else {
    tab.pendingSave = null;
    await window.klorinePasswords.dropPending(pending.token, choice === 'never');
    if (choice === 'never') {
      showSnackbar(vaultState.unlocked ? 'Klorine won’t ask again for ' + pending.host + '.' : 'Not saved. (Unlock the vault first to switch off asking for a site.)');
    }
  }
  updateToolbar();
}
byId('save-yes').addEventListener('click', () => answerSavePrompt('save'));
byId('save-later').addEventListener('click', () => answerSavePrompt('later'));
byId('save-never').addEventListener('click', () => answerSavePrompt('never'));

// main.js: the page in this tab has (or no longer has) a password box.
function notePasswordBox(update) {
  const tab = tabs.find((t) => pageNumber(t) === update.id);
  if (!tab) return;
  tab.hasPasswordBox = update.has === true;
  if (tab === getActiveTab()) updateToolbar();
}

// ---------- The "Saved passwords" window ----------

const passwordsScrim  = byId('passwords-scrim');
const passwordsList   = byId('passwords-list');
const passwordsSearch = byId('passwords-search');
let savedLogins = { logins: [], never: [] };   // sites and usernames only, never the passwords
let loginToDelete = null;                      // a delete button awaiting its second click

function closePasswordsWindow() {
  passwordsScrim.hidden = true;
  passwordsList.replaceChildren();             // also removes any password being shown
  savedLogins = { logins: [], never: [] };
}

async function refreshPasswordsWindow() {
  const answer = await window.klorinePasswords.list();
  if (!answer) { closePasswordsWindow(); return; }
  savedLogins = answer;
  vaultState.logins = answer.logins.length;
  drawPasswordsWindow();
}

function drawPasswordsWindow() {
  passwordsList.replaceChildren();
  const query = passwordsSearch.value.trim().toLowerCase();
  const shown = savedLogins.logins
    .filter((login) => !query || login.origin.toLowerCase().includes(query) || login.username.toLowerCase().includes(query))
    .sort((a, b) => bookmarkHost(a.origin).localeCompare(bookmarkHost(b.origin)) || a.username.localeCompare(b.username));

  if (shown.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'bookmarks-empty';
    empty.textContent = savedLogins.logins.length === 0
      ? 'No passwords saved yet. Sign in to a site and Klorine will offer to save it, or use Import CSV to bring them in from another browser or password manager.'
      : 'Nothing matches “' + passwordsSearch.value.trim() + '”.';
    passwordsList.appendChild(empty);
  }

  for (const login of shown) {
    const row = document.createElement('div');
    row.className = 'password-row';
    const text = document.createElement('div');
    text.className = 'password-text';
    const site = document.createElement('span');
    site.className = 'password-site';
    site.textContent = bookmarkHost(login.origin);
    site.title = login.origin;
    const user = document.createElement('span');
    user.className = 'password-user';
    user.textContent = login.username || '(no username)';
    const secret = document.createElement('span');
    secret.className = 'password-secret';
    secret.textContent = '••••••••';
    text.append(site, user, secret);

    const tool = (icon, tip, onClick) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'icon-btn small';
      setTip(button, tip);
      button.appendChild(makeIcon(icon));
      button.addEventListener('click', () => onClick(button));
      return button;
    };
    let showing = false;
    const show = tool('visibility', 'Show password', async (button) => {
      showing = !showing;
      const password = showing ? await window.klorinePasswords.reveal(login.id) : null;
      secret.textContent = showing && password !== null ? password : '••••••••';
      secret.classList.toggle('revealed', showing && password !== null);
      button.firstChild.textContent = showing ? 'visibility_off' : 'visibility';
      setTip(button, showing ? 'Hide password' : 'Show password');
    });
    const copyUser = tool('person', 'Copy username', async () => {
      if (await window.klorinePasswords.copy(login.id, 'username')) showSnackbar('Username copied.');
    });
    const copyPass = tool('content_copy', 'Copy password', async () => {
      if (await window.klorinePasswords.copy(login.id, 'password')) showSnackbar('Password copied. It will be cleared from the clipboard in 30 seconds.');
    });
    const confirming = loginToDelete === login.id;
    const remove = confirming
      ? makeTextButton('Delete?', async () => { loginToDelete = null; await window.klorinePasswords.remove(login.id); showSnackbar('Password deleted.'); refreshPasswordsWindow(); }, 'text-btn danger-text')
      : tool('delete', 'Delete this password', () => { loginToDelete = login.id; drawPasswordsWindow(); });

    const tools = document.createElement('div');
    tools.className = 'password-tools';
    tools.append(show, copyUser, copyPass, remove);
    row.append(text, tools);
    passwordsList.appendChild(row);
  }

  // Sites where you chose "Never for this site".
  if (savedLogins.never.length > 0 && !query) {
    const head = document.createElement('div');
    head.className = 'setting-sublabel';
    head.textContent = 'Never ask to save on';
    passwordsList.appendChild(head);
    for (const origin of savedLogins.never) {
      const row = document.createElement('div');
      row.className = 'password-row';
      const site = document.createElement('span');
      site.className = 'password-site';
      site.textContent = bookmarkHost(origin);
      row.append(site, makeTextButton('Ask again', async () => { await window.klorinePasswords.allowSite(origin); refreshPasswordsWindow(); }));
      passwordsList.appendChild(row);
    }
  }
}

async function openPasswordsWindow() {
  if (!(await ensureVaultOpen('Unlock your vault to see your saved passwords.'))) return;
  closeMenus();
  closeSettings();
  loginToDelete = null;
  passwordsSearch.value = '';
  passwordsScrim.hidden = false;
  await refreshPasswordsWindow();
  passwordsSearch.focus();
}

passwordsSearch.addEventListener('input', () => { loginToDelete = null; drawPasswordsWindow(); });
byId('passwords-close').addEventListener('click', closePasswordsWindow);
passwordsScrim.addEventListener('click', (event) => {
  if (event.target === passwordsScrim) closePasswordsWindow();
});

// Import passwords from a CSV file exported by another browser or manager.
byId('passwords-import').addEventListener('click', async () => {
  const result = await window.klorinePasswords.importCsv();
  if (result === null) return;                       // you cancelled the file picker
  if (result.error) {
    showSnackbar(result.error === 'locked' ? 'Unlock your vault first.'
      : 'Klorine couldn’t read passwords from ' + (result.name || 'that file') + '. It needs columns named url, username and password.');
    return;
  }
  await refreshPasswordsWindow();
  const wasOpen = !passwordsScrim.hidden;
  const remove = await askDialog({
    title: 'Passwords imported',
    text: 'Imported ' + result.added + (result.added === 1 ? ' password' : ' passwords') + ' from ' + result.name +
      (result.skipped ? ' (' + result.skipped + ' skipped: already saved, or not a secure web address)' : '') + '. ' +
      'That file still holds your passwords with no protection at all. Deleting it now is the safe choice.',
    confirm: 'Delete the file',
    cancel: 'Keep the file',
    danger: true,
  });
  if (remove) showSnackbar((await window.klorinePasswords.deleteImportFile()) ? 'The file was deleted.' : 'The file could not be deleted. Please delete it yourself.');
  if (wasOpen) openPasswordsWindow();
});

// ---------- Start-up ----------
// Finds out whether a vault exists; if so, asks for the master password so
// your kept bookmarks and passwords are ready. ("Not now" skips it.)
async function loadVault() {
  if (!hasVaultTools()) { drawVaultSettings(); return; }
  let status = null;
  try { status = await window.klorineVault.status(); } catch (error) { status = null; }
  applyVaultStatus(status);
  if (!status) return;

  if (status.legacyBookmarks) {
    // Bookmarks kept by the earlier version, before the vault existed.
    try {
      for (const bookmark of await window.klorineVault.legacyBookmarks()) if (!isBookmarked(bookmark.url)) bookmarks.push(bookmark);
    } catch (error) { /* none */ }
    drawBookmarksBar();
    updateToolbar();
    createVaultFlow(true, 'Your kept bookmarks now go into a vault, behind a master password.').then((created) => {
      if (!created) showSnackbar('Bookmark changes are not saved until you create the vault (Settings → Saved data).');
    });
  } else if (status.exists && !status.unlocked) {
    unlockVaultFlow(status.keepBookmarks
      ? 'Enter your master password to load your bookmarks and saved passwords.'
      : 'Enter your master password to use your saved passwords.', 'Not now');
  }
}


// =============================================================================
//  9. READER MODE
// =============================================================================
// A simple reading view: it restyles the current page with READER_CSS (see
// the top of this file). It stays on for that tab as you move between pages.

async function applyReaderCss(tab) {
  try {
    tab.readerCssKey = await tab.webview.insertCSS(READER_CSS);
  } catch (error) {
    tab.readerCssKey = null;
  }
}

readerButton.addEventListener('click', async () => {
  const tab = getActiveTab();
  if (!tab || !tab.ready) return;

  tab.reader = !tab.reader;
  if (tab.reader) {
    await applyReaderCss(tab);
  } else if (tab.readerCssKey) {
    await tab.webview.removeInsertedCSS(tab.readerCssKey).catch(() => {});
    tab.readerCssKey = null;
  }
  updateToolbar();
});


// =============================================================================
//  10. THEME SWITCHER AND ACCENT COLOR
// =============================================================================
// The theme is stored as data-theme="light" or "dark" on the <html> element.
// styles.css defines a full color palette for each value, so changing this
// one attribute recolors the whole interface instantly.

function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  // The button shows the theme you would switch TO.
  const goingDark = theme === 'light';
  themeIcon.textContent = goingDark ? 'dark_mode' : 'light_mode';
  setTip(themeButton, goingDark ? 'Switch to dark theme' : 'Switch to light theme');
  syncTitleBar();
}

// ---------- Title bar (Windows, Linux) ----------
// The window has no normal title bar (see main.js): the tab strip is the top
// of the window, and Windows draws only the minimize / maximize / close
// buttons. This tells main.js which colors and height those buttons should
// have, so they always match the theme and the top bar.
const CUSTOM_TITLE_BAR = !IS_MAC;
if (CUSTOM_TITLE_BAR) document.body.classList.add('custom-titlebar');

// Turns any CSS color into "#rrggbb" (the format main.js accepts) by
// painting it onto a tiny invisible canvas and reading the pixel back.
const colorCanvas = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
colorCanvas.canvas.width = colorCanvas.canvas.height = 1;
function toHex(cssColor) {
  colorCanvas.clearRect(0, 0, 1, 1);
  colorCanvas.fillStyle = '#000';
  colorCanvas.fillStyle = cssColor;
  colorCanvas.fillRect(0, 0, 1, 1);
  const [r, g, b] = colorCanvas.getImageData(0, 0, 1, 1).data;
  return '#' + [r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('');
}

function syncTitleBar() {
  if (!CUSTOM_TITLE_BAR || !window.klorineWindow) return;
  // Wait one frame so the new layout has been applied.
  requestAnimationFrame(() => {
    // The theme's own color values (read directly, not from the screen,
    // where colors fade over a quarter of a second when the theme changes).
    const theme = getComputedStyle(document.documentElement);
    // The buttons are as tall as the top bar: the tab strip, or the toolbar
    // when tabs are on the side.
    const topBar = document.body.classList.contains('vertical-tabs')
      ? document.querySelector('.toolbar')
      : document.querySelector('.tab-strip');
    window.klorineWindow.setTitleBarLook({
      color: toHex(theme.getPropertyValue('--app-bg').trim()),
      symbolColor: toHex(theme.getPropertyValue('--on-surface').trim()),
      height: Math.round(topBar.getBoundingClientRect().bottom),
    });
  });
}

themeButton.addEventListener('click', () => {
  const current = document.documentElement.dataset.theme;
  setTheme(current === 'dark' ? 'light' : 'dark');
});

// Changes the accent color: sets the --hue variable from styles.css, and
// switches to the hand-picked Klorine palette for Sage.
function setAccent(name) {
  const accent = ACCENT_HUES.find((a) => a.name === name) || ACCENT_HUES[0];
  settings.accent = accent.name;
  document.documentElement.style.setProperty('--hue', String(accent.hue));
  if (accent.palette) {
    document.documentElement.dataset.palette = accent.palette;
  } else {
    delete document.documentElement.dataset.palette;
  }
  for (const swatch of swatchRow.children) {
    swatch.classList.toggle('selected', swatch.dataset.accent === accent.name);
  }
  syncTitleBar();
}

// Builds the row of color swatches in the settings panel.
function drawSwatches() {
  for (const accent of ACCENT_HUES) {
    const swatch = document.createElement('button');
    swatch.className = 'swatch';
    setTip(swatch, accent.name + ' accent color');
    swatch.dataset.accent = accent.name;
    swatch.style.setProperty('--swatch-hue', String(accent.hue));
    if (accent.color) swatch.style.setProperty('--swatch-color', accent.color);
    swatch.addEventListener('click', () => setAccent(accent.name));
    swatchRow.appendChild(swatch);
  }
}


// =============================================================================
//  11. SETTINGS PANEL, SIGN-IN DIALOG AND THE MESSAGE BAR
// =============================================================================

function closeSettings() {
  settingsPanel.hidden = true;
  scrim.hidden = true;
  settingsButton.classList.remove('active');
}

// Places the settings panel just below the settings button, wherever the
// toolbar currently is.
function positionSettingsPanel() {
  const buttonBottom = settingsButton.getBoundingClientRect().bottom;
  settingsPanel.style.top = (buttonBottom + 8) + 'px';
  settingsPanel.style.maxHeight = 'calc(100vh - ' + (buttonBottom + 24) + 'px)';
}

settingsButton.addEventListener('click', () => {
  if (!settingsPanel.hidden) { closeSettings(); return; }
  homePageInput.value = settings.homePage;
  positionSettingsPanel();
  settingsPanel.hidden = false;
  scrim.hidden = false;
  settingsButton.classList.add('active');
});

// Clicking outside the panel closes it. (Escape is handled in section 12.)
scrim.addEventListener('click', closeSettings);

// --- Tab position: along the top, or down the side ---
// styles.css does the actual rearranging when <body> has the class
// "vertical-tabs".
function setTabPosition(position) {
  settings.tabPosition = position === 'side' ? 'side' : 'top';
  document.body.classList.toggle('vertical-tabs', settings.tabPosition === 'side');

  // Tick the matching choice in the settings panel.
  for (const radio of document.querySelectorAll('input[name="tab-position"]')) {
    radio.checked = radio.value === settings.tabPosition;
  }

  // The toolbar may have moved, so move the settings panel with it.
  if (!settingsPanel.hidden) positionSettingsPanel();

  // Keep the active tab in view after the layout changes.
  const tab = getActiveTab();
  if (tab) tab.tabEl.scrollIntoView({ block: 'nearest', inline: 'nearest' });

  // The top bar changed: resize the title bar buttons to match.
  syncTitleBar();
}

document.querySelectorAll('input[name="tab-position"]').forEach((radio) => {
  radio.addEventListener('change', () => setTabPosition(radio.value));
});

// When the window is resized, keep the active tab in view in the tab strip
// or sidebar (it could otherwise end up scrolled out of sight).
window.addEventListener('resize', () => {
  const tab = getActiveTab();
  if (tab) tab.tabEl.scrollIntoView({ block: 'nearest', inline: 'nearest' });
});

// Choosing a search engine.
document.querySelectorAll('input[name="search-engine"]').forEach((radio) => {
  radio.addEventListener('change', () => {
    settings.searchEngine = radio.value;
  });
});

// Changing the home page (applied when you press Enter or click away).
// Left empty, new tabs and the Home button show the built-in start page.
homePageInput.addEventListener('change', () => {
  const text = homePageInput.value.trim();
  if (text === '') {
    settings.homePage = '';
  } else {
    // Understand it the same way as the address bar ("localhost:3000" works
    // too). If it does not look like an address at all, assume a website.
    const address = toWebAddress(text);
    const isSearch = address.startsWith(SEARCH_ENGINES[settings.searchEngine].search);
    settings.homePage = isSearch ? 'https://' + text : address;
  }
  homePageInput.value = settings.homePage;
});

// --- Sign-in dialog ---
// Shown when a website asks for a username and password with the browser's
// built-in prompt. main.js calls askLogin() and waits for the answer:
// { username, password }, or null if you cancel.
let finishLogin = null;   // set while the dialog is open

function askLogin(info) {
  if (finishLogin) return Promise.resolve(null);   // only one dialog at a time

  loginText.textContent = String(info && info.host) + ' is asking for a username and password.';
  loginUser.value = '';
  loginPass.value = '';
  loginScrim.hidden = false;
  loginUser.focus();

  return new Promise((resolve) => {
    finishLogin = (answer) => {
      finishLogin = null;
      loginScrim.hidden = true;
      loginPass.value = '';
      resolve(answer);
    };
  });
}

loginForm.addEventListener('submit', (event) => {
  event.preventDefault();
  if (finishLogin) finishLogin({ username: loginUser.value, password: loginPass.value });
});

loginCancel.addEventListener('click', () => {
  if (finishLogin) finishLogin(null);
});

// --- Message bar ---
let snackbarTimer = null;

function showSnackbar(message) {
  snackbar.textContent = message;
  snackbar.classList.add('visible');
  clearTimeout(snackbarTimer);
  snackbarTimer = setTimeout(() => snackbar.classList.remove('visible'), 3500);
}


// =============================================================================
//  11b. SHIELDS
// =============================================================================
// The shield button in the address bar shows how many ad and tracker
// requests were blocked on the current page. Clicking it opens the Shields
// panel, which also shows how many tracking links were cleaned and offers:
//   - a switch to block JavaScript on this site
//   - a button to wipe this site's cookies and saved data, then reload
//
// The counting and the work happen in main.js. This page receives the
// counts through browserBridge.shieldsUpdate() and asks for changes through
// window.shields, which preload.js provides.

const shieldsPanel   = byId('shields-panel');
const shieldsHost    = byId('shields-host');
const shieldsBlocked = byId('shields-blocked');
const shieldsStripped = byId('shields-stripped');
const shieldsJs      = byId('shields-js');
const shieldsOn      = byId('shields-on');
const shieldsOnHint  = byId('shields-on-hint');
const shieldsWipe    = byId('shields-wipe');

// Latest counts from main.js, by page number: { blocked, stripped }.
const shieldCounts = new Map();

// Sites where JavaScript is switched off, and where Shields are off (copies
// of main.js's lists, kept up to date from its answers; used to mark the
// shield button).
const scriptsOffSites = new Set();
const shieldsDownHosts = new Set();

// A tab's page number, or null before the page has started.
function pageNumber(tab) {
  return tab && tab.ready ? tab.webview.getWebContentsId() : null;
}

// Updates the shield button for the tab shown in the toolbar.
function drawShieldsButton(tab) {
  const isSite = isWebUrl(tab.url) && !tab.failed && !tab.crashed && !tab.start;
  const counts = shieldCounts.get(pageNumber(tab)) || { blocked: 0, stripped: 0 };
  const host = hostOf(tab.url).replace(/:\d+$/, '');
  const scriptsOff = isSite && scriptsOffSites.has(host);

  shieldsButton.disabled = !isSite;
  shieldsButton.classList.toggle('working', isSite && counts.blocked > 0);
  shieldsButton.classList.toggle('scripts-off', scriptsOff);
  const down = isSite && shieldsDownHosts.has(host);
  shieldsButton.classList.toggle('shields-down', down);
  shieldsButton.querySelector('.material-symbols-rounded').textContent = down ? 'remove_moderator' : 'shield';
  shieldsCount.textContent = isSite && counts.blocked > 0 ? String(counts.blocked) : '';

  let tip = 'Shields';
  if (down) {
    tip += ': off for this site';
  } else if (isSite) {
    tip += ': ' + counts.blocked + (counts.blocked === 1 ? ' tracker' : ' trackers') + ' blocked';
    if (scriptsOff) tip += ', JavaScript off';
  }
  setTip(shieldsButton, tip);
}

// Fills the open panel with a tab's current status.
function drawShieldsPanel(status) {
  shieldsHost.textContent = status.host;
  shieldsBlocked.textContent = String(status.blocked);
  shieldsStripped.textContent = String(status.stripped);
  shieldsJs.checked = status.scriptsBlocked;
  if (status.scriptsBlocked) scriptsOffSites.add(status.host); else scriptsOffSites.delete(status.host);

  shieldsOn.checked = !status.shieldsDown;
  shieldsOnHint.textContent = status.shieldsDown
    ? 'Off for this site: nothing is blocked here.'
    : 'Blocking trackers & ads here. Turn off if this site doesn\u2019t work.';
  shieldsPanel.classList.toggle('shields-down', status.shieldsDown);
  if (status.shieldsDown) shieldsDownHosts.add(status.host); else shieldsDownHosts.delete(status.host);
}

// preload.js missing (for example, the file was not copied): explain it
// instead of failing silently.
function shieldsAvailable() {
  if (window.shields) return true;
  showSnackbar('Shields need the file preload.js next to main.js.');
  return false;
}

async function openShields() {
  const tab = getActiveTab();
  const id = pageNumber(tab);
  if (id === null || !shieldsAvailable()) return;

  const status = await window.shields.getStatus(id);
  if (!status) return;
  closeMenus();
  drawShieldsPanel(status);

  // Below the button, lined up with its right-hand edge.
  shieldsPanel.hidden = false;
  const box = shieldsButton.getBoundingClientRect();
  placeFloating(shieldsPanel, box.right - shieldsPanel.offsetWidth, box.bottom + 10);
  shieldsButton.classList.add('active-panel');
  shieldsJs.focus();
}

shieldsButton.addEventListener('click', () => {
  if (!shieldsPanel.hidden) closeMenus(); else openShields();
});

// The JavaScript switch.
shieldsJs.addEventListener('change', async () => {
  const id = pageNumber(getActiveTab());
  if (id === null || !shieldsAvailable()) return;
  const status = await window.shields.setScriptsBlocked(id, shieldsJs.checked);
  if (!status) return;
  drawShieldsPanel(status);
  updateToolbar();
  showSnackbar('JavaScript ' + (status.scriptsBlocked ? 'blocked' : 'allowed') + ' on ' + status.host + '. Reloading\u2026');
});

// The Shields on/off switch for this site.
shieldsOn.addEventListener('change', async () => {
  const id = pageNumber(getActiveTab());
  if (id === null || !shieldsAvailable()) return;
  if (!window.shields.setShieldsDown) {
    showSnackbar('Please update preload.js to use this switch.');
    shieldsOn.checked = true;
    return;
  }
  const status = await window.shields.setShieldsDown(id, !shieldsOn.checked);
  if (!status) return;
  drawShieldsPanel(status);
  updateToolbar();
  showSnackbar('Shields ' + (status.shieldsDown ? 'off' : 'on') + ' for ' + status.host + '. Reloading\u2026');
});

// The wipe button.
shieldsWipe.addEventListener('click', async () => {
  const tab = getActiveTab();
  const id = pageNumber(tab);
  if (id === null || !shieldsAvailable()) return;
  const host = hostOf(tab.url).replace(/:\d+$/, '');
  shieldsWipe.disabled = true;
  const done = await window.shields.wipeSiteData(id);
  shieldsWipe.disabled = false;
  closeMenus();
  showSnackbar(done ? 'Cookies and saved data for ' + host + ' wiped. Reloading\u2026' : 'Nothing to wipe on this page.');
});

// New counts from main.js (a few times a second at most).
function receiveShieldCounts(update) {
  if (!update || !Number.isInteger(update.id)) return;
  shieldCounts.set(update.id, { blocked: update.blocked | 0, stripped: update.stripped | 0 });

  const tab = getActiveTab();
  if (pageNumber(tab) !== update.id) return;
  drawShieldsButton(tab);
  if (!shieldsPanel.hidden) {
    shieldsBlocked.textContent = String(update.blocked | 0);
    shieldsStripped.textContent = String(update.stripped | 0);
  }
}


// =============================================================================
//  11c. WALLPAPER
// =============================================================================
// The start page can show:
//   'default' -> the Klorine wallpaper (sage hills; a night version in Forest)
//   'plain'   -> no wallpaper
//   'custom'  -> an image you uploaded
// The choice is set as data-wallpaper on the page, and styles.css does the
// rest. Your image is saved by main.js (through window.klorineWallpaper) so
// it is still there next time.

const wallpaperTiles  = document.querySelectorAll('.wallpaper-tile');
const wallpaperInput  = byId('wallpaper-input');
const wallpaperUpload = byId('wallpaper-upload');
const wallpaperRemove = byId('wallpaper-remove');
const customThumb     = byId('wallpaper-custom-thumb');

// Uploaded images larger than this (on their longest side) are scaled down.
// 3840 pixels is "4K": sharp on any screen, without wasting memory.
const MAX_WALLPAPER_SIDE = 3840;
const MAX_UPLOAD_BYTES = 40 * 1024 * 1024;   // refuse files over 40 MB

// Shows a wallpaper status from main.js: { choice, image }.
function showWallpaper(status) {
  if (!status) return;
  const root = document.documentElement;
  root.dataset.wallpaper = status.choice;

  if (status.image) {
    root.style.setProperty('--custom-wallpaper', 'url("' + status.image + '")');
  } else {
    root.style.removeProperty('--custom-wallpaper');
  }
  customThumb.classList.toggle('has-image', Boolean(status.image));
  wallpaperRemove.hidden = !status.image;

  for (const tile of wallpaperTiles) {
    const selected = tile.dataset.wallpaper === status.choice;
    tile.classList.toggle('selected', selected);
    tile.setAttribute('aria-checked', String(selected));
  }
}

// Reads a picked file and re-draws it as a fresh WebP picture, which removes
// hidden photo details (GPS location, camera, date) and scales down very
// large images. Returns the new picture's bytes.
function prepareWallpaper(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('read'));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error('not an image'));
      image.onload = () => {
        const scale = Math.min(1, MAX_WALLPAPER_SIDE / Math.max(image.naturalWidth, image.naturalHeight));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
        canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((blob) => {
          if (!blob) return reject(new Error('encode'));
          blob.arrayBuffer().then((buffer) => resolve(new Uint8Array(buffer)), reject);
        }, 'image/webp', 0.9);
      };
      image.src = reader.result;   // a "data:" address of the file
    };
    reader.readAsDataURL(file);
  });
}

// Clicking a tile picks that wallpaper. "Your image" with nothing uploaded
// yet opens the file picker instead.
for (const tile of wallpaperTiles) {
  tile.addEventListener('click', async () => {
    if (!window.klorineWallpaper) return;
    const choice = tile.dataset.wallpaper;
    if (choice === 'custom' && !customThumb.classList.contains('has-image')) {
      wallpaperInput.click();
      return;
    }
    showWallpaper(await window.klorineWallpaper.choose(choice));
  });
}

wallpaperUpload.addEventListener('click', () => wallpaperInput.click());

// A file was picked.
wallpaperInput.addEventListener('change', async () => {
  const file = wallpaperInput.files && wallpaperInput.files[0];
  wallpaperInput.value = '';   // lets you pick the same file again later
  if (!file || !window.klorineWallpaper) return;

  if (!/^image\/(png|jpeg|webp|gif|avif)$/.test(file.type)) {
    showSnackbar('Please choose a PNG, JPEG, WebP, GIF or AVIF image.');
    return;
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    showSnackbar('That image is too large (the limit is 40 MB).');
    return;
  }

  wallpaperUpload.disabled = true;
  try {
    const bytes = await prepareWallpaper(file);
    const status = await window.klorineWallpaper.save(bytes);
    if (!status) throw new Error('save');
    showWallpaper(status);
    showSnackbar('Wallpaper updated.');
  } catch (error) {
    showSnackbar('That image could not be used. Please try a different one.');
  } finally {
    wallpaperUpload.disabled = false;
  }
});

wallpaperRemove.addEventListener('click', async () => {
  if (!window.klorineWallpaper) return;
  showWallpaper(await window.klorineWallpaper.remove());
  showSnackbar('Your image was removed. Back to the Klorine wallpaper.');
});

// Show the saved wallpaper when the browser starts.
async function loadWallpaper() {
  if (!window.klorineWallpaper) return;
  try {
    showWallpaper(await window.klorineWallpaper.load());
  } catch (error) {
    // keep the default
  }
}


// =============================================================================
//  11d. SOUNDSCAPES
// =============================================================================
// The headphones button opens the Soundscapes panel. Each sound (rain, wind,
// café) has an on/off button and its own volume, so they can be mixed; one
// more slider sets the overall volume. The sounds themselves are made by
// soundscapes.js.
//
// Browsers only allow sound to start after you click something, so the
// audio system is created on your first click, and paused (using no
// processor time) whenever nothing is playing.

const soundButton = byId('sound-button');
const soundIcon   = byId('sound-icon');
const soundPanel  = byId('sound-panel');
const soundRows   = document.querySelectorAll('.sound-row');
const soundMaster = byId('sound-master');
const soundStop   = byId('sound-stop');

let soundEngine = null;   // created on first use
let soundTimer = null;    // schedules raindrops, gusts, chatter...

function getSoundEngine() {
  if (soundEngine) return soundEngine;

  // soundscapes.js missing (for example, the file was not copied).
  if (typeof createSoundscapeEngine !== 'function') {
    throw new Error('Soundscapes need the file soundscapes.js next to renderer.js.');
  }

  // The audio system. Two settings keep it light on any computer:
  //   sampleRate 48000 -> always make sound at 48,000 samples per second.
  //       Some sound cards run at 96,000 or 192,000, which would make the
  //       computer do two to four times the work for no audible difference;
  //       Windows converts the rate for the speakers.
  //   latencyHint 'playback' -> work in larger, steadier chunks. Right for
  //       background sound, and much less likely to stutter or drop out.
  let context;
  try {
    context = new AudioContext({ sampleRate: 48000, latencyHint: 'playback' });
  } catch (error) {
    context = new AudioContext();   // a sound card that refuses those settings
  }
  soundEngine = createSoundscapeEngine(context);
  return soundEngine;
}

// Waits until the screen has redrawn (so a button you clicked shows its new
// state straight away, before any heavier work begins).
function nextFrame() {
  return new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));
}

// Slider positions (0-100) to volume (0-1). Squared, because our ears hear
// loudness that way: the low half of the slider gets fine control.
function sliderVolume(slider) {
  return (Number(slider.value) / 100) ** 2;
}

// Keeps the button, the panel and the background scheduling in step with
// what is playing.
function drawSoundState() {
  const engine = soundEngine;
  const anyOn = Boolean(engine && engine.anyPlaying());

  for (const row of soundRows) {
    const on = Boolean(engine && engine.isPlaying(row.dataset.scene));
    row.classList.toggle('on', on);
    row.querySelector('.sound-toggle').setAttribute('aria-pressed', String(on));
  }
  soundStop.disabled = !anyOn;
  soundButton.classList.toggle('playing', anyOn);
  soundIcon.textContent = anyOn ? 'graphic_eq' : 'headphones';
  const names = [...soundRows].filter((row) => row.classList.contains('on'))
    .map((row) => row.querySelector('.sound-name').textContent);
  setTip(soundButton, anyOn ? 'Soundscapes: playing ' + names.join(' + ') : 'Soundscapes');

  if (anyOn && !soundTimer) {
    // A few times a second, schedule the next stretch of random events.
    soundTimer = setInterval(() => {
      soundEngine.pump(soundEngine.context.currentTime + 0.4);
    }, 100);
    soundEngine.pump(soundEngine.context.currentTime + 0.4);
  } else if (!anyOn && soundTimer) {
    clearInterval(soundTimer);
    soundTimer = null;
  }
}

async function toggleSound(row) {
  const name = row.dataset.scene;
  const toggle = row.querySelector('.sound-toggle');
  if (toggle.disabled) return;   // still starting from the last click

  try {
    // Switching off.
    if (soundEngine && soundEngine.isPlaying(name)) {
      soundEngine.stop(name);
      drawSoundState();
      // When the last sound has faded out, pause the audio system.
      setTimeout(() => {
        if (!soundEngine.anyPlaying()) soundEngine.context.suspend().catch(() => {});
      }, 1800);
      return;
    }

    // Switching on: show it at once, then do the work.
    toggle.disabled = true;
    row.classList.add('starting');
    await nextFrame();

    const engine = getSoundEngine();
    await engine.prepare();   // the first time: calculate the noise, in small steps
    await engine.context.resume();
    if (engine.context.state !== 'running') {
      throw new Error('Windows did not let sound start. Check that a speaker or headphones are connected and not muted.');
    }
    engine.setMasterVolume(sliderVolume(soundMaster));
    engine.start(name, sliderVolume(row.querySelector('.sound-volume')));

    // For troubleshooting (Ctrl+Shift+I, then the Console tab).
    const ctx = engine.context;
    console.info(`[Soundscapes] ${name} started. Audio: ${ctx.state}, ${ctx.sampleRate} Hz, ` +
      `latency ${Math.round((ctx.baseLatency + (ctx.outputLatency || 0)) * 1000)} ms, clock ${ctx.currentTime.toFixed(2)} s`);
    setTimeout(() => {
      console.info(`[Soundscapes] 2 s later: audio ${ctx.state}, clock ${ctx.currentTime.toFixed(2)} s ` +
        '(if the clock has not moved, sound is not reaching Windows)');
    }, 2000);
  } catch (error) {
    // Say what went wrong instead of failing silently.
    showSnackbar(error && error.message ? error.message : 'Sound could not start.');
  } finally {
    toggle.disabled = false;
    row.classList.remove('starting');
    drawSoundState();
  }
}

for (const row of soundRows) {
  row.querySelector('.sound-toggle').addEventListener('click', () => toggleSound(row));
  row.querySelector('.sound-volume').addEventListener('input', (event) => {
    if (soundEngine) soundEngine.setVolume(row.dataset.scene, sliderVolume(event.target));
  });
}

soundMaster.addEventListener('input', () => {
  if (soundEngine) soundEngine.setMasterVolume(sliderVolume(soundMaster));
});

soundStop.addEventListener('click', () => {
  if (!soundEngine) return;
  for (const name of soundEngine.sceneNames) {
    if (soundEngine.isPlaying(name)) soundEngine.stop(name);
  }
  drawSoundState();
  setTimeout(() => {
    if (!soundEngine.anyPlaying()) soundEngine.context.suspend().catch(() => {});
  }, 1800);
});

// The headphones button opens (or closes) the panel, below the button.
soundButton.addEventListener('click', () => {
  if (!soundPanel.hidden) { closeMenus(); return; }
  closeMenus();
  soundPanel.hidden = false;
  const box = soundButton.getBoundingClientRect();
  placeFloating(soundPanel, box.right - soundPanel.offsetWidth, box.bottom + 10);
  soundButton.classList.add('panel-open');
  soundPanel.querySelector('.sound-toggle').focus();
});


// =============================================================================
//  11e. START PAGE WIDGETS: the shared parts
// =============================================================================
// The start page can show small floating "widgets": Markets (a stock
// tracker, 11f) and Weather (11g). Each one:
//   - floats over the start page and can be DRAGGED anywhere by its title
//     bar (or moved with the arrow keys when its title has the focus);
//   - remembers where you put it, as a fraction of the page ("70% across,
//     10% down"), so it stays in a sensible spot when the window is resized;
//   - can be switched off in Settings -> Start page widgets.
// All widget settings are saved by main.js in widgets.json.

const WIDGET_MARGIN = 16;                       // gap kept from the page edges
const DEFAULT_LAYOUT = { stocks: { x: 1, y: 0 }, weather: { x: 0, y: 0 } };
let widgetLayout = JSON.parse(JSON.stringify(DEFAULT_LAYOUT));
const floatingWidgets = new Set();              // every widget on every start page
let widgetLayer = 10;                           // the last one moved goes on top

// Whenever a start page or a widget changes size (window resized, tab shown,
// prices arrived...), put every widget back in its remembered spot.
const widgetResizeWatcher = new ResizeObserver(() => placeAllWidgets());
function watchStartPage(page) {
  widgetResizeWatcher.observe(page);
}

// Saves everything; saves are done one after another so they never mix up.
let widgetSaveQueue = Promise.resolve();
function saveWidgetSettings() {
  widgetSaveQueue = widgetSaveQueue.then(async () => {
    if (!window.klorineWidgets) return;
    try {
      const saved = await window.klorineWidgets.save({
        stocks: { enabled: stocks.enabled, symbols: stocks.symbols },
        weather: { enabled: weather.enabled, place: weather.place, unit: weather.unit, aqi: weather.aqi },
        layout: widgetLayout,
      });
      if (saved) stocks.symbols = saved.stocks.symbols;
    } catch (error) { /* keep going; it is saved next time */ }
  });
  return widgetSaveQueue;
}

// Builds the frame every widget shares:
//   [ grip: icon + title ]  [ tools: buttons ]
//   [ body                                   ]
// kind is 'stocks' or 'weather'.
function makeFloatingWidget(kind, title, icon) {
  const widget = document.createElement('section');
  widget.className = 'widget widget-' + kind;
  widget.dataset.kind = kind;
  widget.setAttribute('aria-label', title);

  const head = document.createElement('div');
  head.className = 'widget-head';
  const grip = document.createElement('div');
  grip.className = 'widget-grip';
  grip.tabIndex = 0;
  grip.setAttribute('role', 'button');
  setTip(grip, 'Move ' + title + ': drag it, or use the arrow keys');
  const name = document.createElement('span');
  name.className = 'widget-title';
  name.textContent = title;
  grip.append(makeIcon(icon), name);
  const tools = document.createElement('div');
  tools.className = 'widget-tools';
  head.append(grip, tools);

  const body = document.createElement('div');
  body.className = 'widget-body';
  widget.append(head, body);

  enableWidgetMoving(widget, head, grip);
  floatingWidgets.add(widget);
  widgetResizeWatcher.observe(widget);
  return { widget, tools, body };
}

// How far a widget can move on its start page (null if the page is hidden).
function widgetRoom(widget) {
  const page = widget.parentElement;
  if (!page || page.clientWidth === 0 || widget.offsetWidth === 0) return null;
  return {
    maxLeft: Math.max(0, page.clientWidth - widget.offsetWidth - 2 * WIDGET_MARGIN),
    maxTop: Math.max(0, page.clientHeight - widget.offsetHeight - 2 * WIDGET_MARGIN),
  };
}

const clampNumber = (value, low, high) => Math.min(high, Math.max(low, value));

function placeWidget(widget) {
  const room = widgetRoom(widget);
  if (!room) return;
  const spot = widgetLayout[widget.dataset.kind] || { x: 0, y: 0 };
  widget.style.left = Math.round(WIDGET_MARGIN + spot.x * room.maxLeft) + 'px';
  widget.style.top = Math.round(WIDGET_MARGIN + spot.y * room.maxTop) + 'px';
}

function placeAllWidgets() {
  for (const widget of floatingWidgets) {
    if (!widget.isConnected) {                 // its tab was closed
      floatingWidgets.delete(widget);
      widgetResizeWatcher.unobserve(widget);
      continue;
    }
    if (!widget.classList.contains('dragging')) placeWidget(widget);
  }
}

// Turns where a widget now is into fractions, then moves the same widget on
// every other tab's start page to match, and saves.
function rememberWidgetSpot(widget) {
  const room = widgetRoom(widget);
  if (!room) return;
  widgetLayout[widget.dataset.kind] = {
    x: room.maxLeft ? clampNumber((widget.offsetLeft - WIDGET_MARGIN) / room.maxLeft, 0, 1) : 0,
    y: room.maxTop ? clampNumber((widget.offsetTop - WIDGET_MARGIN) / room.maxTop, 0, 1) : 0,
  };
  placeAllWidgets();
  saveWidgetSettings();
}

function enableWidgetMoving(widget, head, grip) {
  let drag = null;

  // Dragging with the mouse (or a finger or pen) by the title bar. Buttons
  // and boxes in the title bar still work normally.
  head.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || event.target.closest('button, input, a')) return;
    const room = widgetRoom(widget);
    if (!room) return;
    event.preventDefault();
    drag = {
      pointer: event.pointerId,
      startX: event.clientX, startY: event.clientY,
      left: widget.offsetLeft, top: widget.offsetTop,
      room,
    };
    head.setPointerCapture(event.pointerId);
    widget.classList.add('dragging');
    widget.style.zIndex = String(++widgetLayer);
  });

  head.addEventListener('pointermove', (event) => {
    if (!drag || event.pointerId !== drag.pointer) return;
    const left = clampNumber(drag.left + event.clientX - drag.startX, WIDGET_MARGIN, WIDGET_MARGIN + drag.room.maxLeft);
    const top = clampNumber(drag.top + event.clientY - drag.startY, WIDGET_MARGIN, WIDGET_MARGIN + drag.room.maxTop);
    widget.style.left = left + 'px';
    widget.style.top = top + 'px';
  });

  const finish = (event) => {
    if (!drag || event.pointerId !== drag.pointer) return;
    drag = null;
    widget.classList.remove('dragging');
    rememberWidgetSpot(widget);
  };
  head.addEventListener('pointerup', finish);
  head.addEventListener('pointercancel', finish);

  // Moving with the keyboard: arrow keys move 16 px, Shift + arrow 64 px.
  grip.addEventListener('keydown', (event) => {
    const steps = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    const step = steps[event.key];
    const room = step && widgetRoom(widget);
    if (!room) return;
    event.preventDefault();
    const size = event.shiftKey ? 64 : 16;
    widget.style.left = clampNumber(widget.offsetLeft + step[0] * size, WIDGET_MARGIN, WIDGET_MARGIN + room.maxLeft) + 'px';
    widget.style.top = clampNumber(widget.offsetTop + step[1] * size, WIDGET_MARGIN, WIDGET_MARGIN + room.maxTop) + 'px';
    widget.style.zIndex = String(++widgetLayer);
    rememberWidgetSpot(widget);
  });
}

// ---- A search box with a list of matches under it ---------------------------
// Used for "Add a stock" and for the weather place. You type; after a short
// pause the matches appear; click one, or use the arrow keys and Enter.
// Pressing Enter straight away picks the first match.
//
// options:
//   label, placeholder      -> what the box says
//   search(text)            -> a list of matches, or null if offline
//   describe(item)          -> { title, detail, disabled } for one match
//   choose(item)            -> called with the match you picked
//   chooseDisabled(item)    -> called if you pick a greyed-out match
//   blocked()               -> a message if adding is not possible now
//   noneText(text), offlineText
//   onEscape()              -> Escape pressed with no list open
function makeSuggestBox(options) {
  const box = document.createElement('div');
  box.className = 'widget-finder';

  const form = document.createElement('form');
  form.className = 'widget-search';
  form.setAttribute('role', 'search');
  const input = document.createElement('input');
  input.type = 'text';
  input.maxLength = 60;
  input.autocomplete = 'off';
  input.spellcheck = false;
  input.placeholder = options.placeholder;
  input.setAttribute('role', 'combobox');
  input.setAttribute('aria-autocomplete', 'list');
  input.setAttribute('aria-expanded', 'false');
  input.setAttribute('aria-label', options.label);
  form.append(makeIcon(options.icon || 'search'), input);

  const list = document.createElement('div');
  list.className = 'widget-suggest';
  list.setAttribute('role', 'listbox');
  list.hidden = true;
  const listId = 'suggest-' + Math.random().toString(36).slice(2);
  list.id = listId;
  input.setAttribute('aria-controls', listId);
  box.append(form, list);

  let results = [];      // the matches being shown
  let highlighted = -1;  // which one the arrow keys are on
  let timer = null;
  let asked = 0;         // numbers each search, so a slow old answer is ignored
  let lastText = '';     // the text the shown results belong to

  function close() {
    list.hidden = true;
    list.replaceChildren();
    results = [];
    highlighted = -1;
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
  }

  // If the list opened below the bottom of the widget or window, scroll it into sight.
  function reveal() {
    requestAnimationFrame(() => list.scrollIntoView({ block: 'nearest', behavior: 'smooth' }));
  }

  function message(text) {
    list.replaceChildren();
    const note = document.createElement('div');
    note.className = 'widget-suggest-msg';
    note.textContent = text;
    list.appendChild(note);
    list.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    reveal();
  }

  function show() {
    list.replaceChildren();
    results.forEach((item, i) => {
      const about = options.describe(item);
      const option = document.createElement('button');
      option.type = 'button';
      option.className = 'widget-option';
      option.id = listId + '-' + i;
      option.setAttribute('role', 'option');
      option.tabIndex = -1;
      option.setAttribute('aria-selected', String(i === highlighted));
      if (i === highlighted) option.classList.add('active');
      if (about.disabled) option.classList.add('added');
      const title = document.createElement('span');
      title.className = 'widget-option-name';
      title.textContent = about.title;
      const detail = document.createElement('span');
      detail.className = 'widget-option-detail';
      detail.textContent = about.detail;
      option.append(title, detail);
      // mousedown (not click) so the box keeps the focus.
      option.addEventListener('mousedown', (event) => {
        event.preventDefault();
        choose(i);
      });
      list.appendChild(option);
    });
    list.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    if (highlighted >= 0) input.setAttribute('aria-activedescendant', listId + '-' + highlighted);
    else input.removeAttribute('aria-activedescendant');
    reveal();
  }

  async function search(text) {
    const number = ++asked;
    message('Searching…');
    let found = null;
    try {
      found = await options.search(text);
    } catch (error) { found = null; }
    if (number !== asked) return undefined;   // you kept typing; a newer search is on its way
    lastText = text;
    if (!Array.isArray(found)) {
      results = [];
      message(options.offlineText);
    } else if (found.length === 0) {
      results = [];
      message(options.noneText(text));
    } else {
      results = found;
      // Start on the first match that can actually be picked.
      highlighted = Math.max(0, found.findIndex((item) => !options.describe(item).disabled));
      show();
    }
    return found;
  }

  async function choose(i) {
    const item = results[i];
    if (!item) return;
    if (options.describe(item).disabled) {
      if (options.chooseDisabled) options.chooseDisabled(item);
      return;
    }
    input.value = '';
    close();
    await options.choose(item);
  }

  input.addEventListener('input', () => {
    clearTimeout(timer);
    const text = input.value.trim();
    if (text.length < 2) { asked++; close(); return; }
    timer = setTimeout(() => search(text), 300);   // wait until you pause typing
  });

  input.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (results.length === 0) return;
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      highlighted = (highlighted + step + results.length) % results.length;
      show();
    } else if (event.key === 'Escape') {
      if (!list.hidden) {
        event.preventDefault();
        event.stopPropagation();
        close();
      } else if (options.onEscape) {
        event.preventDefault();
        event.stopPropagation();
        options.onEscape();
      }
    }
  });

  // Enter: pick the highlighted match (searching first if needed).
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    const problem = options.blocked && options.blocked();
    if (problem) { showSnackbar(problem); return; }
    clearTimeout(timer);
    if (text !== lastText || results.length === 0) {
      const found = await search(text);
      if (!found || found.length === 0) return;
    }
    choose(highlighted >= 0 ? highlighted : 0);
  });

  // Clicking elsewhere closes the list.
  input.addEventListener('blur', () => setTimeout(() => {
    if (document.activeElement !== input) close();
  }, 150));

  return {
    element: box,
    input,
    close,
    setState(placeholder, disabled) {
      input.placeholder = placeholder;
      input.disabled = disabled;
      if (disabled) close();
    },
  };
}

// Is a start page showing right now (so fresh data is worth fetching)?
function startPageVisible() {
  return [...document.querySelectorAll('.start-page')].some((page) => page.getClientRects().length > 0);
}

function makeToolButton(icon, tip, onClick) {
  const button = document.createElement('button');
  button.className = 'icon-btn small';
  button.type = 'button';
  setTip(button, tip);
  button.appendChild(makeIcon(icon));
  button.addEventListener('click', onClick);
  return button;
}


// =============================================================================
//  11f. STOCK TRACKER ("Markets")
// =============================================================================
// A small watchlist: each stock's price, today's change and a tiny chart of
// the day. Prices are fetched by main.js (through window.klorineStocks)
// about once a minute, and only while a start page is actually on screen.
//
// To add a stock you type its NAME ("Reliance", "Apple", "Nifty"); a list of
// matching stocks appears and you pick one. Behind the scenes each stock is
// kept by its Yahoo Finance symbol:
//   AAPL, MSFT        -> US stocks
//   RELIANCE.NS       -> NSE (India);   RELIANCE.BO -> BSE (India)
//   ^NSEI, ^BSESN     -> the Nifty 50 and Sensex indices

const MAX_STOCKS = 8;
const STOCK_SYMBOL = /^[A-Za-z0-9.^=&-]{1,20}$/;
const STOCK_REFRESH_MS = 60 * 1000;

const stocks = {
  enabled: true,
  symbols: [],
  quotes: new Map(),   // symbol -> latest quote from main.js
  updated: 0,          // when prices last arrived
  loading: false,
};
const stockWidgets = new Set();   // one per start page (one per tab)
const stocksSwitch = byId('stocks-enabled');

// Creates the Markets widget for a new tab's start page.
function makeStockWidget() {
  const { widget, tools, body } = makeFloatingWidget('stocks', 'Markets', 'monitoring');

  const list = document.createElement('div');
  list.className = 'stock-list';

  // "Add a stock": search by name. Built ONCE, so what you are typing is
  // not wiped out when prices refresh.
  const adder = makeSuggestBox({
    icon: 'add',
    label: 'Add a stock: type its name',
    placeholder: 'Add a stock, e.g. Reliance',
    search: (text) => (window.klorineStocks ? window.klorineStocks.search(text) : null),
    describe: (item) => {
      const added = stocks.symbols.includes(item.symbol);
      return {
        title: item.name,
        detail: item.symbol + (item.exchange ? ' · ' + item.exchange : '') + ' · ' + item.type + (added ? ' · already added' : ''),
        disabled: added,
      };
    },
    choose: (item) => addStock(item.symbol, item.name),
    chooseDisabled: (item) => showSnackbar(item.name + ' is already on your watchlist.'),
    blocked: () => (stocks.symbols.length >= MAX_STOCKS
      ? 'Your watchlist is full (' + MAX_STOCKS + ' stocks). Remove one first.' : null),
    noneText: (text) => 'No stocks found for “' + text + '”. Try another spelling.',
    offlineText: 'Can’t reach Yahoo Finance right now.',
  });

  const note = document.createElement('p');
  note.className = 'widget-note';
  note.textContent = 'Yahoo Finance · may be delayed';

  body.append(list, adder.element, note);
  widget.parts = { tools, list, adder };
  stockWidgets.add(widget);
  drawStockWidget(widget);
  return widget;
}

// Numbers in your computer's own style (e.g. 24,350.10 or 24.350,10).
function formatPrice(quote) {
  const options = { minimumFractionDigits: 2, maximumFractionDigits: 2 };
  if (quote.currency && !quote.isIndex) {
    try {
      return new Intl.NumberFormat(undefined, { ...options, style: 'currency', currency: quote.currency }).format(quote.price);
    } catch (error) { /* unknown currency: plain number */ }
  }
  return new Intl.NumberFormat(undefined, options).format(quote.price);
}

// A tiny line chart of the day's prices, drawn as an SVG picture, with a
// dotted line at yesterday's closing price.
function makeSparkline(quote, direction) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 80 28');
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('class', 'stock-spark ' + direction);
  svg.setAttribute('aria-hidden', 'true');
  const points = quote.points || [];
  if (points.length < 2) return svg;

  const values = quote.previousClose !== null ? [...points, quote.previousClose] : points;
  const low = Math.min(...values), high = Math.max(...values);
  const span = high - low || 1;
  const y = (value) => (26 - ((value - low) / span) * 24).toFixed(1);

  if (quote.previousClose !== null) {
    const base = document.createElementNS(ns, 'line');
    base.setAttribute('x1', '0'); base.setAttribute('x2', '80');
    base.setAttribute('y1', y(quote.previousClose)); base.setAttribute('y2', y(quote.previousClose));
    base.setAttribute('class', 'stock-spark-base');
    svg.appendChild(base);
  }
  const line = document.createElementNS(ns, 'polyline');
  line.setAttribute('points', points.map((value, i) => (i * 80 / (points.length - 1)).toFixed(1) + ',' + y(value)).join(' '));
  svg.appendChild(line);
  return svg;
}

// Builds one row of the watchlist.
function makeStockRow(symbol) {
  const quote = stocks.quotes.get(symbol);
  const row = document.createElement('div');
  row.className = 'stock-row';

  // The main part opens the stock's Yahoo Finance page in a new tab.
  const open = document.createElement('button');
  open.className = 'stock-open';
  open.type = 'button';

  const label = document.createElement('span');
  label.className = 'stock-label';
  const name = document.createElement('span');
  name.className = 'stock-name';
  const detail = document.createElement('span');
  detail.className = 'stock-symbol';
  label.append(name, detail);

  const value = document.createElement('span');
  value.className = 'stock-value';

  if (!quote) {
    name.textContent = symbol;
    detail.textContent = 'Loading…';
    open.append(label);
  } else if (quote.error) {
    name.textContent = symbol;
    detail.textContent = quote.error === 'not-found' ? 'Not found' : 'Price unavailable';
    row.classList.add('stock-error');
    open.append(label);
  } else {
    const change = quote.previousClose !== null ? quote.price - quote.previousClose : 0;
    const percent = quote.previousClose ? (change / quote.previousClose) * 100 : 0;
    const direction = change > 0 ? 'up' : change < 0 ? 'down' : 'flat';

    name.textContent = quote.name;
    detail.textContent = quote.symbol + (quote.exchange ? ' · ' + quote.exchange : '');

    const price = document.createElement('span');
    price.className = 'stock-price';
    price.textContent = formatPrice(quote);
    // The change, with an arrow and a sign (so it does not rely on color).
    const pill = document.createElement('span');
    pill.className = 'stock-change ' + direction;
    const arrow = direction === 'up' ? '▲ +' : direction === 'down' ? '▼ −' : '';
    pill.textContent = arrow + Math.abs(percent).toFixed(2) + '%';
    value.append(price, pill);

    open.append(label, makeSparkline(quote, direction), value);
    open.title = quote.name + ': ' + formatPrice(quote) + ', ' + (change >= 0 ? 'up ' : 'down ') +
      Math.abs(percent).toFixed(2) + '% today. Click to open on Yahoo Finance.';
  }
  open.addEventListener('click', () => {
    createTab('https://finance.yahoo.com/quote/' + encodeURIComponent(symbol));
  });

  // The remove (x) button, shown when you point at the row.
  const remove = makeToolButton('close', 'Remove ' + (quote && quote.name ? quote.name : symbol), () => removeStock(symbol));
  remove.classList.add('stock-remove');

  row.append(open, remove);
  return row;
}

// Redraws one Markets widget from the current state.
function drawStockWidget(widget) {
  const { tools, list, adder } = widget.parts;

  // Title bar: time of the last update and a refresh button.
  const updated = document.createElement('span');
  updated.className = 'widget-updated';
  updated.textContent = stocks.loading ? 'Updating…'
    : stocks.updated ? new Date(stocks.updated).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
  const refresh = makeToolButton('refresh', 'Refresh prices', () => refreshStocks(true));
  refresh.disabled = stocks.loading;
  tools.replaceChildren(updated, refresh);

  list.replaceChildren();
  for (const symbol of stocks.symbols) list.appendChild(makeStockRow(symbol));
  if (stocks.symbols.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'widget-empty';
    empty.textContent = 'Your watchlist is empty. Add a stock below.';
    list.appendChild(empty);
  }

  const full = stocks.symbols.length >= MAX_STOCKS;
  adder.setState(full ? 'Watchlist full (' + MAX_STOCKS + ' stocks)' : 'Add a stock, e.g. Reliance', full);
}

function drawAllStockWidgets() {
  for (const widget of stockWidgets) {
    if (!widget.isConnected) { stockWidgets.delete(widget); continue; }   // its tab was closed
    drawStockWidget(widget);
  }
  document.documentElement.dataset.stocks = stocks.enabled ? 'on' : 'off';
}

// Fetches fresh prices. Without "force", only if the widget is on, a start
// page is showing and the prices are more than a minute old.
async function refreshStocks(force = false) {
  if (!window.klorineStocks || !stocks.enabled || stocks.loading || stocks.symbols.length === 0) return;
  if (!force && (!startPageVisible() || Date.now() - stocks.updated < STOCK_REFRESH_MS)) return;

  stocks.loading = true;
  drawAllStockWidgets();
  try {
    const quotes = await window.klorineStocks.quotes(stocks.symbols);
    for (const quote of quotes || []) stocks.quotes.set(quote.symbol.toUpperCase(), quote);
    stocks.updated = Date.now();
  } catch (error) {
    // keep showing the previous prices
  } finally {
    stocks.loading = false;
    drawAllStockWidgets();
  }
}

// Adds a stock chosen from the search list (symbol = e.g. "RELIANCE.NS").
async function addStock(symbol, name) {
  symbol = String(symbol).trim().toUpperCase();
  if (!STOCK_SYMBOL.test(symbol)) return;
  if (stocks.symbols.includes(symbol)) {
    showSnackbar((name || symbol) + ' is already on your watchlist.');
    return;
  }
  if (stocks.symbols.length >= MAX_STOCKS) return;
  stocks.symbols.push(symbol);
  drawAllStockWidgets();
  await saveWidgetSettings();
  showSnackbar('Added ' + (name || symbol) + '.');
  await refreshStocks(true);
}

async function removeStock(symbol) {
  stocks.symbols = stocks.symbols.filter((s) => s !== symbol);
  stocks.quotes.delete(symbol);
  drawAllStockWidgets();
  await saveWidgetSettings();
}

// The switch in Settings.
stocksSwitch.addEventListener('change', async () => {
  stocks.enabled = stocksSwitch.checked;
  drawAllStockWidgets();
  await saveWidgetSettings();
  if (stocks.enabled) refreshStocks(true);
});


// =============================================================================
//  11g. WEATHER (with air quality)
// =============================================================================
// Klorine never asks for your location. Instead you TYPE a place ("Kochi",
// "Bengaluru", "London") and pick it from the list; its weather, a 4-day
// outlook and the air quality index (AQI) are then shown. Data comes from
// Open-Meteo (free, no account); main.js fetches it, about every 15 minutes
// while a start page is showing.
//
// AQI scales (Settings -> Start page widgets):
//   Automatic -> India's scale for places in India, the US scale elsewhere
//   US        -> the US EPA AQI (also used by many weather apps)
//   India     -> India's National AQI (CPCB), estimated from the same data

const WEATHER_REFRESH_MS = 15 * 60 * 1000;

const weather = {
  enabled: true,
  place: null,      // { name, region, country, countryCode, latitude, longitude }
  unit: 'c',        // 'c' or 'f'
  aqi: 'auto',      // 'auto', 'us' or 'in'
  data: null,       // the latest answer from main.js
  updated: 0,
  loading: false,
  failed: false,
  editing: false,   // the "change place" box is open
};
const weatherWidgets = new Set();
const weatherSwitch = byId('weather-enabled');

// Weather codes (the WMO standard Open-Meteo uses) -> words and icons.
// [text, daytime icon, night icon]
const WEATHER_CODES = {
  0: ['Clear sky', 'sunny', 'clear_night'],
  1: ['Mainly clear', 'sunny', 'clear_night'],
  2: ['Partly cloudy', 'partly_cloudy_day', 'partly_cloudy_night'],
  3: ['Overcast', 'cloud'],
  45: ['Fog', 'foggy'], 48: ['Freezing fog', 'foggy'],
  51: ['Light drizzle', 'rainy'], 53: ['Drizzle', 'rainy'], 55: ['Heavy drizzle', 'rainy'],
  56: ['Freezing drizzle', 'rainy'], 57: ['Freezing drizzle', 'rainy'],
  61: ['Light rain', 'rainy'], 63: ['Rain', 'rainy'], 65: ['Heavy rain', 'rainy'],
  66: ['Freezing rain', 'rainy'], 67: ['Freezing rain', 'rainy'],
  71: ['Light snow', 'weather_snowy'], 73: ['Snow', 'weather_snowy'], 75: ['Heavy snow', 'weather_snowy'],
  77: ['Snow grains', 'weather_snowy'],
  80: ['Light showers', 'rainy'], 81: ['Showers', 'rainy'], 82: ['Heavy showers', 'rainy'],
  85: ['Snow showers', 'weather_snowy'], 86: ['Heavy snow showers', 'weather_snowy'],
  95: ['Thunderstorm', 'thunderstorm'], 96: ['Thunderstorm, hail', 'thunderstorm'], 99: ['Thunderstorm, hail', 'thunderstorm'],
};
function describeWeather(code, isDay = true) {
  const entry = WEATHER_CODES[code] || ['Unknown', 'cloud'];
  return { text: entry[0], icon: !isDay && entry[2] ? entry[2] : entry[1] };
}

// AQI bands: [highest value, name, color, text color on that color].
const AQI_SCALES = {
  us: {
    name: 'US AQI',
    bands: [
      [50, 'Good', '#00E400', '#1B1B1B'],
      [100, 'Moderate', '#FFFF00', '#1B1B1B'],
      [150, 'Unhealthy for sensitive groups', '#FF7E00', '#1B1B1B'],
      [200, 'Unhealthy', '#FF0000', '#FFFFFF'],
      [300, 'Very unhealthy', '#8F3F97', '#FFFFFF'],
      [Infinity, 'Hazardous', '#7E0023', '#FFFFFF'],
    ],
  },
  in: {
    name: 'India AQI (est.)',
    bands: [
      [50, 'Good', '#00B050', '#1B1B1B'],
      [100, 'Satisfactory', '#92D050', '#1B1B1B'],
      [200, 'Moderate', '#FFFF00', '#1B1B1B'],
      [300, 'Poor', '#FF9900', '#1B1B1B'],
      [400, 'Very poor', '#FF0000', '#FFFFFF'],
      [Infinity, 'Severe', '#C00000', '#FFFFFF'],
    ],
  },
};

function temperatureText(celsius) {
  if (celsius === null || celsius === undefined) return '–';
  return Math.round(weather.unit === 'f' ? celsius * 9 / 5 + 32 : celsius) + '°';
}
function windText(kmh) {
  return weather.unit === 'f' ? Math.round(kmh * 0.621371) + ' mph' : Math.round(kmh) + ' km/h';
}
function placeText(place) {
  return [place.region, place.country].filter(Boolean).join(', ');
}

// Creates the Weather widget for a new tab's start page.
function makeWeatherWidget() {
  const { widget, tools, body } = makeFloatingWidget('weather', 'Weather', 'partly_cloudy_day');

  const content = document.createElement('div');
  content.className = 'wx-content';

  // Typing a place. Only the name you type is sent, never your location.
  const finder = makeSuggestBox({
    icon: 'location_on',
    label: 'Weather place: type a city or town',
    placeholder: 'Type a city, e.g. Kochi',
    search: (text) => (window.klorineWeather ? window.klorineWeather.searchPlaces(text) : null),
    describe: (place) => ({ title: place.name, detail: placeText(place), disabled: false }),
    choose: (place) => setWeatherPlace(place),
    noneText: (text) => 'No place called “' + text + '” found. Check the spelling.',
    offlineText: 'Can’t reach the weather service right now.',
    onEscape: () => {
      if (weather.place && weather.editing) { weather.editing = false; drawAllWeatherWidgets(); }
    },
  });

  const note = document.createElement('p');
  note.className = 'widget-note';

  body.append(content, finder.element, note);
  widget.parts = { tools, content, finder, note };
  weatherWidgets.add(widget);
  drawWeatherWidget(widget);
  return widget;
}

function makeAqiRow(air) {
  // Which scale? "Automatic" uses India's for places in India.
  let scaleKey = weather.aqi === 'auto'
    ? (weather.place && weather.place.countryCode === 'IN' ? 'in' : 'us')
    : weather.aqi;
  let value = scaleKey === 'in' ? air.india && air.india.value : air.us;
  if (value === null || value === undefined) {          // fall back to the other scale
    scaleKey = scaleKey === 'in' ? 'us' : 'in';
    value = scaleKey === 'in' ? air.india && air.india.value : air.us;
  }
  if (value === null || value === undefined) return null;

  const scale = AQI_SCALES[scaleKey];
  const band = scale.bands.find((b) => value <= b[0]);

  const row = document.createElement('div');
  row.className = 'wx-aqi';
  const badge = document.createElement('span');
  badge.className = 'wx-aqi-badge';
  badge.style.background = band[2];
  badge.style.color = band[3];
  badge.textContent = String(value);
  const text = document.createElement('span');
  text.className = 'wx-aqi-text';
  const name = document.createElement('span');
  name.className = 'wx-aqi-name';
  name.textContent = band[1];
  const detail = document.createElement('span');
  detail.className = 'wx-aqi-detail';
  const parts = [scale.name];
  if (scaleKey === 'in' && air.india && air.india.main) parts.push('mainly ' + air.india.main);
  if (air.pm2_5 !== null) parts.push('PM2.5 ' + air.pm2_5 + ' µg/m³');
  detail.textContent = parts.join(' · ');
  text.append(name, detail);
  row.append(badge, text);
  row.title = 'Air quality index ' + value + ' (' + band[1] + ') on the ' + scale.name + ' scale.' +
    (scaleKey === 'in' ? ' Estimated from 24-hour pollutant averages, so it may differ a little from official station readings.' : '') +
    ' From Open-Meteo / Copernicus model data.';
  return row;
}

// Redraws one Weather widget from the current state.
function drawWeatherWidget(widget) {
  const { tools, content, finder, note } = widget.parts;
  const data = weather.data;

  // Title bar buttons (only once a place is chosen).
  tools.replaceChildren();
  if (weather.place) {
    const refresh = makeToolButton('refresh', 'Refresh weather', () => refreshWeather(true));
    refresh.disabled = weather.loading;
    const change = makeToolButton('edit_location_alt', weather.editing ? 'Keep this place' : 'Change place', () => {
      weather.editing = !weather.editing;
      drawAllWeatherWidgets();
      if (weather.editing) widget.parts.finder.input.focus();
    });
    tools.append(refresh, change);
  }

  content.replaceChildren();
  if (!weather.place) {
    const intro = document.createElement('p');
    intro.className = 'widget-empty';
    intro.textContent = 'Type a place to see its weather and air quality. Klorine never asks for your location.';
    content.appendChild(intro);
  } else if (!data) {
    const wait = document.createElement('p');
    wait.className = 'widget-empty';
    wait.textContent = weather.failed
      ? 'Weather for ' + weather.place.name + ' is unavailable right now.'
      : 'Getting the weather for ' + weather.place.name + '…';
    content.appendChild(wait);
  } else {
    // Now: icon, temperature, place and conditions.
    const look = describeWeather(data.current.code, data.current.isDay);
    const now = document.createElement('div');
    now.className = 'wx-now';
    const icon = makeIcon(look.icon, 'wx-icon');
    const temp = document.createElement('span');
    temp.className = 'wx-temp';
    temp.textContent = temperatureText(data.current.temperature);
    const about = document.createElement('div');
    about.className = 'wx-about';
    const place = document.createElement('span');
    place.className = 'wx-place';
    place.textContent = weather.place.name;
    place.title = weather.place.name + (placeText(weather.place) ? ', ' + placeText(weather.place) : '');
    const condition = document.createElement('span');
    condition.className = 'wx-condition';
    condition.textContent = look.text;
    about.append(place, condition);
    now.append(icon, temp, about);

    // Feels like, humidity, wind.
    const details = document.createElement('div');
    details.className = 'wx-details';
    const bits = [];
    if (data.current.feelsLike !== null) bits.push('Feels ' + temperatureText(data.current.feelsLike));
    if (data.current.humidity !== null) bits.push(data.current.humidity + '% humidity');
    if (data.current.wind !== null) bits.push('Wind ' + windText(data.current.wind));
    details.textContent = bits.join(' · ');

    content.append(now, details);

    // Air quality.
    const aqiRow = data.air ? makeAqiRow(data.air) : null;
    if (aqiRow) content.appendChild(aqiRow);
    else {
      const noAir = document.createElement('p');
      noAir.className = 'widget-empty';
      noAir.textContent = 'Air quality unavailable right now.';
      content.appendChild(noAir);
    }

    // The next few days.
    if (data.days.length > 0) {
      const days = document.createElement('div');
      days.className = 'wx-days';
      data.days.forEach((day, i) => {
        const [y, m, d] = day.date.split('-').map(Number);
        const cell = document.createElement('div');
        cell.className = 'wx-day';
        const name = document.createElement('span');
        name.className = 'wx-day-name';
        name.textContent = i === 0 ? 'Today' : new Date(y, m - 1, d).toLocaleDateString([], { weekday: 'short' });
        const dayLook = describeWeather(day.code, true);
        const dayIcon = makeIcon(dayLook.icon, 'wx-day-icon');
        const range = document.createElement('span');
        range.className = 'wx-day-range';
        range.textContent = temperatureText(day.max) + ' ' + temperatureText(day.min);
        cell.title = name.textContent + ': ' + dayLook.text + ', high ' + temperatureText(day.max) + ', low ' + temperatureText(day.min);
        cell.append(name, dayIcon, range);
        days.appendChild(cell);
      });
      content.appendChild(days);
    }
  }

  // The place box shows when no place is chosen, or while changing it.
  finder.element.hidden = Boolean(weather.place) && !weather.editing;

  note.textContent = 'Open-Meteo' + (weather.loading ? ' · updating…'
    : weather.updated ? ' · ' + new Date(weather.updated).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '');
}

function drawAllWeatherWidgets() {
  for (const widget of weatherWidgets) {
    if (!widget.isConnected) { weatherWidgets.delete(widget); continue; }
    drawWeatherWidget(widget);
  }
  document.documentElement.dataset.weather = weather.enabled ? 'on' : 'off';
}

async function setWeatherPlace(place) {
  weather.place = place;
  weather.editing = false;
  weather.data = null;
  weather.updated = 0;
  weather.failed = false;
  drawAllWeatherWidgets();
  await saveWidgetSettings();
  refreshWeather(true);
}

// Fetches fresh weather. Without "force", only if the widget is on, a start
// page is showing and the last update is over 15 minutes old.
async function refreshWeather(force = false) {
  if (!window.klorineWeather || !weather.enabled || !weather.place || weather.loading) return;
  if (!force && (!startPageVisible() || Date.now() - weather.updated < WEATHER_REFRESH_MS)) return;

  const place = weather.place;
  weather.loading = true;
  drawAllWeatherWidgets();
  try {
    const data = await window.klorineWeather.get(place.latitude, place.longitude);
    if (weather.place !== place) return;         // you picked another place meanwhile
    if (data && !data.error) {
      weather.data = data;
      weather.updated = Date.now();
      weather.failed = false;
    } else {
      weather.failed = true;                     // keep showing the last data, if any
    }
  } catch (error) {
    weather.failed = true;
  } finally {
    weather.loading = false;
    drawAllWeatherWidgets();
  }
}

// Settings: the on/off switch, °C/°F and the AQI scale.
weatherSwitch.addEventListener('change', async () => {
  weather.enabled = weatherSwitch.checked;
  drawAllWeatherWidgets();
  await saveWidgetSettings();
  if (weather.enabled) refreshWeather(true);
});
for (const radio of document.querySelectorAll('input[name="temperature-unit"]')) {
  radio.addEventListener('change', () => {
    weather.unit = radio.value === 'f' ? 'f' : 'c';
    drawAllWeatherWidgets();
    saveWidgetSettings();
  });
}
for (const radio of document.querySelectorAll('input[name="aqi-scale"]')) {
  radio.addEventListener('change', () => {
    weather.aqi = ['us', 'in'].includes(radio.value) ? radio.value : 'auto';
    drawAllWeatherWidgets();
    saveWidgetSettings();
  });
}
byId('reset-widgets').addEventListener('click', () => {
  widgetLayout = JSON.parse(JSON.stringify(DEFAULT_LAYOUT));
  placeAllWidgets();
  saveWidgetSettings();
  showSnackbar('Widgets moved back to their usual places.');
});

// Load the saved settings, then keep the data fresh while a start page shows.
async function loadWidgets() {
  if (window.klorineWidgets) {
    try {
      const saved = await window.klorineWidgets.load();
      if (saved) {
        stocks.enabled = saved.stocks.enabled;
        stocks.symbols = saved.stocks.symbols;
        weather.enabled = saved.weather.enabled;
        weather.place = saved.weather.place;
        weather.unit = saved.weather.unit;
        weather.aqi = saved.weather.aqi;
        widgetLayout = saved.layout;
      }
    } catch (error) { /* keep defaults */ }
  }
  stocksSwitch.checked = stocks.enabled;
  weatherSwitch.checked = weather.enabled;
  for (const radio of document.querySelectorAll('input[name="temperature-unit"]')) radio.checked = radio.value === weather.unit;
  for (const radio of document.querySelectorAll('input[name="aqi-scale"]')) radio.checked = radio.value === weather.aqi;
  drawAllStockWidgets();
  drawAllWeatherWidgets();
  placeAllWidgets();
  refreshStocks();
  refreshWeather();
  // Check every 15 s; each fetches only when its data is old enough.
  setInterval(() => { refreshStocks(); refreshWeather(); }, 15 * 1000);
}


// =============================================================================
//  11h. PRIVACY SETTINGS
// =============================================================================
// Settings -> Privacy -> "Hide my time zone" (main.js does the work).
const hideTimezoneSwitch = byId('hide-timezone');

async function loadPrivacySettings() {
  if (!window.klorinePrivacy) { hideTimezoneSwitch.disabled = true; return; }
  try {
    const saved = await window.klorinePrivacy.load();
    hideTimezoneSwitch.checked = Boolean(saved && saved.hideTimezone);
  } catch (error) { /* leave it off */ }
}

hideTimezoneSwitch.addEventListener('change', async () => {
  const wanted = hideTimezoneSwitch.checked;
  let saved = null;
  try { saved = await window.klorinePrivacy.setHideTimezone(wanted); } catch (error) { saved = null; }
  hideTimezoneSwitch.checked = Boolean(saved && saved.hideTimezone);
  if (saved) {
    showSnackbar(saved.hideTimezone
      ? 'Time zone hidden. Reload open pages for it to take effect.'
      : 'Websites can see your time zone again. Reload open pages for it to take effect.');
  }
});


// =============================================================================
//  11i. UPDATES
// =============================================================================
// Settings -> About and updates. main.js looks for new versions (section
// "Updates" there) and reports here; this part shows the news and offers
// one button whose job changes with the situation:
//   Check for updates -> Download update -> Restart and install
// A small dot appears on the Settings button while an update is waiting.
const updateVersion = byId('update-version');
const updateStatus  = byId('update-status');
const updateAction  = byId('update-action');
const updateBar     = byId('update-bar');
const updateBarFill = byId('update-bar-fill');
let updateState = { status: 'idle', current: '', version: null, percent: 0, checked: 0 };
let updateAnnounced = null;   // the version we already showed a message for

function drawUpdates(state, fromUser = false) {
  if (!state) return;
  const before = updateState.status;
  updateState = state;
  updateVersion.textContent = 'Klorine ' + state.current;
  const when = state.checked ? ' Last checked ' + new Date(state.checked).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + '.' : '';

  const looks = {
    idle:        ['', 'Check for updates', false],
    checking:    ['Looking for updates\u2026', 'Check for updates', true],
    none:        ['You have the latest version.' + when, 'Check for updates', false],
    available:   [state.downloadFailed ? 'The download of version ' + state.version + ' did not finish. Check your connection and try again.'
      : 'Version ' + state.version + ' is available.', state.downloadFailed ? 'Try again' : 'Download update', false],
    downloading: ['Downloading version ' + state.version + '\u2026 ' + state.percent + '%', 'Downloading\u2026', true],
    ready:       ['Version ' + state.version + ' is ready. It installs when Klorine restarts or closes.', 'Restart and install', false],
    error:       ['Couldn\u2019t check for updates. Check your connection and try again.' + when, 'Check for updates', false],
    unsupported: ['Updates work in the installed version of Klorine (not when started with npm start).', 'Check for updates', true],
    store:       ['Updates are delivered by the Microsoft Store.', 'Check for updates', true],
  };
  const [text, label, disabled] = looks[state.status] || looks.idle;
  updateStatus.textContent = text;
  updateAction.textContent = label;
  updateAction.disabled = disabled;
  updateBar.hidden = state.status !== 'downloading';
  updateBarFill.style.width = state.percent + '%';

  // A dot on the Settings button while an update is waiting for you.
  const waiting = state.status === 'available' || state.status === 'ready';
  settingsButton.classList.toggle('has-update', waiting);

  // Say it once per new version (and once more when it is ready).
  if (state.status === 'available' && updateAnnounced !== state.version) {
    updateAnnounced = state.version;
    showSnackbar('Klorine ' + state.version + ' is available. Open Settings to download it.');
  } else if (state.status === 'ready' && before === 'downloading') {
    showSnackbar('Update downloaded. Restart Klorine from Settings to install it.');
  } else if (fromUser && state.status === 'none' && before === 'checking') {
    showSnackbar('Klorine is up to date.');
  }
}

let updateCheckAsked = false;   // true while a check YOU started is running
updateAction.addEventListener('click', async () => {
  if (!window.klorineUpdates) return;
  if (updateState.status === 'available') drawUpdates(await window.klorineUpdates.download());
  else if (updateState.status === 'ready') {
    updateAction.disabled = true;
    updateStatus.textContent = 'Closing Klorine to install the update\u2026';
    await window.klorineUpdates.install();
  } else {
    updateCheckAsked = true;
    drawUpdates(await window.klorineUpdates.check());
  }
});

async function loadUpdates() {
  if (!window.klorineUpdates) { updateAction.disabled = true; return; }
  try { drawUpdates(await window.klorineUpdates.status()); } catch (error) { /* leave the section as it is */ }
}


// =============================================================================
//  12. KEYBOARD SHORTCUTS AND COMMANDS FROM main.js
// =============================================================================
// Shortcuts arrive by two routes, and both end up in handleShortcut():
//
//   a) You press a key while the TOOLBAR has the focus. The "keydown"
//      listener below catches it directly.
//
//   b) You press a key while a WEB PAGE has the focus. Those key presses
//      never reach this file on their own, so main.js catches them and
//      passes them in through browserBridge.key().
//
// Reload (Ctrl+R), hard reload (Ctrl+Shift+R) and developer tools (F12) are
// menu shortcuts defined in main.js; they arrive through
// browserBridge.command().

// Decides what a key press means. "keys" describes the press:
//   { key, code, ctrl, meta, shift, alt }
// "key" is the character produced; "code" names the physical key.
// Returns true if it was one of our shortcuts (so the caller can stop the
// key from doing anything else).
function handleShortcut(keys) {
  const key = keys.key.toLowerCase();

  // Ctrl+Tab / Ctrl+Shift+Tab: next / previous tab (Ctrl on every system).
  if (keys.ctrl && key === 'tab') {
    cycleTabs(keys.shift ? -1 : 1);
    return true;
  }

  // Everything else needs Cmd (Mac) or Ctrl (Windows/Linux), alone.
  const modifier = IS_MAC ? keys.meta : keys.ctrl;
  if (!modifier || keys.alt || keys.shift) return false;

  if (key === 'l') { focusAddressBar(); return true; }
  if (key === 't') { openNewTab(); return true; }
  if (key === 'w') { closeTab(activeTabId); return true; }

  // Ctrl+1 ... Ctrl+9: jump to that tab, if there is one in that position.
  // The physical key is checked first, so this also works on keyboards
  // where the digits need Shift (French AZERTY, for example).
  const digit = /^Digit([1-9])$/.exec(keys.code || '') || /^([1-9])$/.exec(key);
  if (digit) {
    // Counts only the tabs you can see (not those in a collapsed group).
    const tab = visibleTabs()[Number(digit[1]) - 1];
    if (tab) activateTab(tab.id);
    return true;
  }

  return false;
}

// Route (a): keys pressed while the toolbar has the focus.
document.addEventListener('keydown', (event) => {
  // Escape cancels the sign-in dialog, closes a tab menu or group editor,
  // or closes the settings panel.
  if (event.key === 'Escape' && isMenuOpen()) {
    closeMenus();
    return;
  }
  if (event.key === 'Escape' && finishAsk) {
    finishAsk(null);
    return;
  }
  if (event.key === 'Escape' && !passwordsScrim.hidden) {
    closePasswordsWindow();
    return;
  }
  if (event.key === 'Escape' && !importScrim.hidden) {
    closeImportDialog();
    return;
  }
  if (event.key === 'Escape' && finishLogin) {
    finishLogin(null);
    return;
  }
  if (event.key === 'Escape' && !settingsPanel.hidden) {
    closeSettings();
    return;
  }

  const handled = handleShortcut({
    key: event.key,
    code: event.code,
    ctrl: event.ctrlKey,
    meta: event.metaKey,
    shift: event.shiftKey,
    alt: event.altKey,
  });
  if (handled) event.preventDefault();
});

// Named commands sent by the menu in main.js.
function runCommand(name) {
  const tab = getActiveTab();
  switch (name) {
    case 'reload':
      reloadActiveTab(false);
      break;
    case 'hard-reload':
      reloadActiveTab(true);
      break;
    case 'toggle-devtools':
      // Opens (or closes) the inspection tools for the page in the active tab.
      if (tab && tab.ready) {
        if (tab.webview.isDevToolsOpened()) tab.webview.closeDevTools();
        else tab.webview.openDevTools();
      }
      break;
  }
}

// The small set of things main.js is allowed to ask this page to do.
// Route (b) above and the menu commands both come in through here.
window.browserBridge = {
  // A browser shortcut was pressed while a web page had the focus.
  key(keys) {
    handleShortcut(keys);
  },

  // A menu item was chosen (or its shortcut pressed).
  command(name) {
    runCommand(name);
  },

  // You clicked a link that wants a new tab. "background" is set for
  // middle-click and Ctrl+click, which open the tab without switching to it.
  // A link opened from a tab in a group joins the same group.
  openTab(request) {
    if (request && typeof request.url === 'string' && isWebUrl(request.url)) {
      // Which tab the link was clicked in (main.js sends the page's number).
      const opener = tabs.find((t) => t.ready && t.webview.getWebContentsId() === request.openerId);
      const newTab = createTab(request.url, !request.background);
      if (opener && opener.group) addTabToGroup(newTab, opener.group);
    }
  },

  // News about updates (looking, available, downloading, ready...).
  updateStatus(state) {
    const fromUser = updateCheckAsked;
    if (state && state.status !== 'checking') updateCheckAsked = false;
    drawUpdates(state, fromUser);
  },

  // The vault was locked (you were away, Windows locked, or "Lock now").
  vaultLocked(info) {
    vaultWasLocked(info && info.reason);
  },

  // The page in a tab has (or no longer has) a password box.
  passwordField(update) {
    if (update) notePasswordBox(update);
  },

  // You just signed in on a page: ask whether to save the password.
  offerSave(offer) {
    if (offer) offerToSavePassword(offer);
  },

  // New Shields counts for a tab.
  shieldsUpdate(update) {
    receiveShieldCounts(update);
  },

  // main.js has something to tell you (a download or pop-up was blocked...).
  notify(message) {
    if (typeof message === 'string') showSnackbar(message);
  },

  // A website wants a username and password. Returns a promise.
  askLogin(info) {
    return askLogin(info);
  },

  // You clicked inside a web page. In split view, this makes the toolbar
  // control whichever of the two pages you clicked. main.js identifies the
  // page by a number that each webview can also report about itself.
  pageFocused(webContentsId) {
    const tab = tabs.find((t) => t.ready && t.webview.getWebContentsId() === webContentsId);
    if (tab && tab.id !== activeTabId && (tab.id === leftTabId || tab.id === rightTabId)) {
      activateTab(tab.id);
    }
  },
};


// =============================================================================
//  13. START-UP
// =============================================================================

// Start in the light Sage & Off-White look. (The moon button switches to the
// dark "Forest" version.)
setTheme('light');

drawSwatches();
setAccent(settings.accent);
loadWallpaper();
loadWidgets();
loadVault();
loadPrivacySettings();
loadUpdates();

// Give every button a spoken label for screen readers (the same text as its
// tooltip), and show Mac key names on a Mac.
for (const button of document.querySelectorAll('button[title]')) {
  if (IS_MAC) button.title = button.title.replace('Ctrl+', '\u2318');
  button.setAttribute('aria-label', button.title);
}
if (IS_MAC) {
  for (const keyName of document.querySelectorAll('.shortcut-list dt')) {
    // Ctrl+Tab stays Ctrl on a Mac; the others use the Cmd key.
    if (!keyName.textContent.includes('Tab')) {
      keyName.textContent = keyName.textContent.replace('Ctrl+', '\u2318');
    }
  }
}

// The tab strip and bookmarks bar scroll sideways when they are too full to
// fit. This lets an ordinary (vertical) mouse wheel do that scrolling.
// (Not for the tab sidebar, which already scrolls up and down normally.)
for (const strip of [tabListEl, bookmarksBar]) {
  strip.addEventListener('wheel', (event) => {
    if (event.deltaY === 0) return;
    if (strip === tabListEl && settings.tabPosition === 'side') return;
    strip.scrollLeft += event.deltaY;
    event.preventDefault();
  }, { passive: false });
}

// Open the first tab, with tabs in the chosen position.
createTab();
setTabPosition(settings.tabPosition);