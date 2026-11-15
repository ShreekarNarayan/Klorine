// =============================================================================
//  scripts/make-latest-yml.js  —  writes "latest.yml" for a finished installer
// =============================================================================
//  The installed Klorine finds updates by reading a small file, latest.yml,
//  from the GitHub release. It lists the new version, the installer's file
//  name, its size, and its SHA-512 fingerprint (which Klorine checks after
//  downloading, so a damaged or swapped file is refused).
//
//  Signing an installer changes its contents, and so its fingerprint. This
//  script therefore runs AFTER signing and writes latest.yml for the final
//  file. It is used by the release workflow (.github/workflows/release.yml):
//
//      node scripts/make-latest-yml.js <folder containing the installer>
// =============================================================================

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const folder = path.resolve(process.argv[2] || 'dist');
const version = require('../package.json').version;
const fileName = 'Klorine-Setup-' + version + '.exe';
const file = path.join(folder, fileName);

if (!fs.existsSync(file)) {
  console.error('Not found: ' + file);
  console.error('The installer must be named ' + fileName + ' (the version comes from package.json).');
  process.exit(1);
}

const bytes = fs.readFileSync(file);
const sha512 = crypto.createHash('sha512').update(bytes).digest('base64');

const yml = [
  'version: ' + version,
  'files:',
  '  - url: ' + fileName,
  '    sha512: ' + sha512,
  '    size: ' + bytes.length,
  'path: ' + fileName,
  'sha512: ' + sha512,
  "releaseDate: '" + new Date().toISOString() + "'",
  '',
].join('\n');

fs.writeFileSync(path.join(folder, 'latest.yml'), yml);
console.log('Wrote latest.yml for ' + fileName + ' (' + bytes.length.toLocaleString() + ' bytes)');