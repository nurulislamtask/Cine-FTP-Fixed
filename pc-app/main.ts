/**
 * CineFTP PC App — a real Windows program (.exe via pkg).
 * Starts the full CineFTP server on this PC, then opens the app window
 * (Chrome app mode, or the default browser). Playback uses the in-app
 * "Play in VLC" button, which launches VLC on this PC with the DhakaFlix
 * address — every format plays.
 */
import express from 'express';
import path from 'path';
import { execSync, spawn } from 'child_process';
import { existsSync } from 'fs';
import { app } from '../api/index';

const PORT = 3000;

// If an older CineFTP copy is still holding port 3000, close it first —
// otherwise Windows keeps serving the OLD version and fixes never apply.
function freePort(port: number) {
  if (process.platform !== 'win32') return;
  try {
    const out = execSync('netstat -aon -p TCP', { encoding: 'utf8' });
    const pids = new Set<string>();
    for (const line of out.split(/\r?\n/)) {
      if (!line.includes(':' + port) || !/LISTENING/i.test(line)) continue;
      const m = line.match(/LISTENING\s+(\d+)/i);
      if (m && m[1] !== String(process.pid)) pids.add(m[1]);
    }
    for (const pid of pids) {
      try {
        execSync(`taskkill /PID ${pid} /F`, { stdio: 'ignore' });
        console.log(`Purono server (PID ${pid}) bondho kore dilam.`);
      } catch {}
    }
    if (pids.size > 0) execSync('ping -n 2 127.0.0.1 >nul');
  } catch {}
}

function openAppWindow(url: string) {
  const chromeCandidates = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    path.join(
      process.env.LOCALAPPDATA || '',
      'Google\\Chrome\\Application\\chrome.exe'
    ),
  ];
  const chrome = chromeCandidates.find((p) => {
    try {
      return p && existsSync(p);
    } catch {
      return false;
    }
  });
  try {
    if (chrome) {
      const child = spawn(chrome, [`--app=${url}`], {
        detached: true,
        stdio: 'ignore',
      });
      child.on('error', () => {});
      child.unref();
    } else if (process.platform === 'win32') {
      const child = spawn('cmd', ['/c', 'start', '', url], {
        detached: true,
        stdio: 'ignore',
      });
      child.on('error', () => {});
      child.unref();
    }
  } catch {}
}

process.env.NODE_ENV = 'production';
freePort(PORT);

// Serve the web UI. Inside the single-file .exe (Node SEA) the dist files
// are embedded as SEA assets; in plain-node mode they are read from disk.
let seaApi: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  seaApi = require('node:sea');
} catch {}
if (seaApi?.isSea?.()) {
  const keys: string[] = seaApi.getAssetKeys();
  const mime: Record<string, string> = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.ico': 'image/x-icon',
    '.json': 'application/json',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.webp': 'image/webp',
    '.txt': 'text/plain',
  };
  app.use((req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    let p = req.path;
    try {
      p = decodeURIComponent(p);
    } catch {}
    if (p === '/') p = '/index.html';
    const key = 'dist' + p;
    const assetKey = keys.includes(key) ? key : 'dist/index.html';
    try {
      const buf = Buffer.from(seaApi.getAsset(assetKey));
      const ext = path.extname(assetKey).toLowerCase();
      res.setHeader('Content-Type', mime[ext] || 'application/octet-stream');
      if (assetKey.endsWith('index.html'))
        res.setHeader('Cache-Control', 'no-cache');
      res.send(buf);
    } catch {
      next();
    }
  });
} else {
  const distPath = path.join(__dirname, 'dist');
  app.use(express.static(distPath));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

app.listen(PORT, '0.0.0.0', () => {
  console.log('====================================================');
  console.log('  CineFTP App cholche!');
  console.log(`  Ei PC te:  http://localhost:${PORT}`);
  console.log('  Movie khule "Play in VLC" chaplei VLC te cholbe.');
  console.log('  Ei window bondho korle app bondho hoye jabe.');
  console.log('====================================================');
  setTimeout(() => openAppWindow(`http://localhost:${PORT}`), 900);
});
