// Builds sea-config.json with every dist file embedded as a SEA asset.
const fs = require('fs');
const path = require('path');

const distDir = path.join(__dirname, 'dist');
const assets = {};
function walk(dir, rel) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const r = rel ? rel + '/' + name : name;
    if (fs.statSync(full).isDirectory()) walk(full, r);
    else assets['dist/' + r] = 'dist/' + r;
  }
}
walk(distDir, '');
const cfg = {
  main: 'main.cjs',
  output: 'sea-prep.blob',
  disableExperimentalSEAWarning: true,
  useSnapshot: false,
  useCodeCache: false,
  assets,
};
fs.writeFileSync(
  path.join(__dirname, 'sea-config.json'),
  JSON.stringify(cfg, null, 2)
);
console.log('sea-config.json written with', Object.keys(assets).length, 'assets');
