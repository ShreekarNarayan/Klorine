// =============================================================================
//  update-filters.js  —  downloads the latest EasyList and EasyPrivacy
// =============================================================================
//  Run it with:   npm run update-filters
//
//  It replaces filters/easylist.txt and filters/easyprivacy.txt with the
//  newest versions. Do this before every release of Klorine, so people get
//  up-to-date blocking. (Klorine itself never downloads anything by
//  itself: it only uses the copies in the filters folder.)
//
//  The lists are made by the EasyList volunteers (https://easylist.to) and
//  are free to share under the GNU GPL v3 or Creative Commons BY-SA 3.0.
// =============================================================================

const fs = require('fs');
const path = require('path');

// Each list: the official address first, then a mirror kept by uBlock Origin.
const LISTS = {
  'easylist.txt': [
    'https://easylist.to/easylist/easylist.txt',
    'https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/thirdparties/easylist/easylist.txt',
  ],
  'easyprivacy.txt': [
    'https://easylist.to/easylist/easyprivacy.txt',
    'https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/thirdparties/easylist/easyprivacy.txt',
  ],
};

async function download(urls) {
  for (const url of urls) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(60000) });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      const text = await response.text();
      // A real list starts with this line and is large.
      if (!text.startsWith('[Adblock Plus') || text.length < 100000) throw new Error('not a filter list');
      return { url, text };
    } catch (error) {
      console.log('  could not use ' + url + ' (' + error.message + ')');
    }
  }
  return null;
}

(async () => {
  const folder = path.join(__dirname, 'filters');
  fs.mkdirSync(folder, { recursive: true });
  let failed = false;
  for (const [name, urls] of Object.entries(LISTS)) {
    console.log('Downloading ' + name + ' ...');
    const result = await download(urls);
    if (!result) { failed = true; console.log('  FAILED: kept the old ' + name); continue; }
    fs.writeFileSync(path.join(folder, name), result.text);
    console.log('  done: ' + result.text.split('\n').length.toLocaleString() + ' lines from ' + result.url);
  }
  console.log(failed ? 'Some lists could not be updated.' : 'All lists updated. Klorine uses them the next time it starts.');
  process.exitCode = failed ? 1 : 0;
})();