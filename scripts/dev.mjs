#!/usr/bin/env node

import { spawn } from 'node:child_process';

const PORT = process.env.PORT ?? '3000';
const OPEN_PATH = process.env.DEV_OPEN_PATH ?? '/';

function openUrl(url) {
  const platform = process.platform;

  if (platform === 'win32') {
    spawn('cmd', ['/c', 'start', '', url], { stdio: 'ignore' });
    return;
  }

  if (platform === 'darwin') {
    spawn('open', [url], { stdio: 'ignore' });
    return;
  }

  spawn('xdg-open', [url], { stdio: 'ignore' });
}

const nextProc = spawn('npx', ['next', 'dev', '--port', PORT], {
  shell: true,
  stdio: ['inherit', 'pipe', 'pipe'],
  env: process.env,
});

let opened = false;

function maybeOpen(line) {
  if (opened) return;
  // Next.js prints "ready" or "✓ Ready" when the server is up.
  if (!line.toLowerCase().includes('ready')) return;
  opened = true;
  openUrl(`http://localhost:${PORT}${OPEN_PATH}`);
}

nextProc.stdout.on('data', (buf) => {
  const text = buf.toString('utf8');
  process.stdout.write(text);
  for (const line of text.split(/\r?\n/g)) {
    if (line.trim()) maybeOpen(line);
  }
});

nextProc.stderr.on('data', (buf) => {
  const text = buf.toString('utf8');
  process.stderr.write(text);
  for (const line of text.split(/\r?\n/g)) {
    if (line.trim()) maybeOpen(line);
  }
});

function shutdown(signal) {
  if (nextProc && !nextProc.killed) {
    nextProc.kill(signal);
  }
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

nextProc.on('exit', (code) => {
  process.exit(code ?? 0);
});
