// Copies the web app (one folder up) into ./www so Electron can package it
const fs = require('fs'), path = require('path');
const src = path.join(__dirname, '..'), dst = path.join(__dirname, 'www');
fs.rmSync(dst, { recursive: true, force: true });
fs.mkdirSync(dst, { recursive: true });
for (const f of ['index.html', 'manifest.json', 'css', 'js', 'assets']) {
  if (fs.existsSync(path.join(src, f))) fs.cpSync(path.join(src, f), path.join(dst, f), { recursive: true });
}
console.log('Web files copied to desktop/www');
