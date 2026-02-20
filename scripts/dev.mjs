#!/usr/bin/env node

import { spawn } from 'node:child_process';

const APP_DEVSERVER_URL =
  process.env.APP_DEVSERVER_URL ?? 'http://localhost:3000';
const API_DEVSERVER_URL =
  process.env.API_DEVSERVER_URL ?? 'http://localhost:3000';
const SWA_PORT = process.env.SWA_PORT ?? '4280';

const LOGIN_PATH = '/.auth/login/aad';
const APP_PATH = process.env.SWA_OPEN_PATH ?? '/';

const emulatorBaseUrl = `http://localhost:${SWA_PORT}`;

function openUrl(url) {
  const platform = process.platform;

  if (platform === 'win32') {
    // Use cmd.exe so "start" is available.
    spawn('cmd', ['/c', 'start', '', url], { stdio: 'ignore' });
    return;
  }

  if (platform === 'darwin') {
    spawn('open', [url], { stdio: 'ignore' });
    return;
  }

  spawn('xdg-open', [url], { stdio: 'ignore' });
}

function isEmulatorReadyLine(line) {
  return (
    line.includes(`http://localhost:${SWA_PORT}`) ||
    line.includes(`https://localhost:${SWA_PORT}`)
  );
}

const swaArgs = [
  'swa',
  'start',
  APP_DEVSERVER_URL,
  '--api-devserver-url',
  API_DEVSERVER_URL,
  '--run',
  process.platform === 'win32' ? 'scripts/dev-next.cmd' : 'npm run dev:next',
];

const swaProc =
  process.platform === 'win32'
    ? spawn('cmd.exe', ['/c', 'npx', ...swaArgs], {
        stdio: ['inherit', 'pipe', 'pipe'],
        env: process.env,
      })
    : spawn('npx', swaArgs, {
        // Do not use a shell here: it can split the `--run` value at spaces,
        // turning it into just `npm` (which prints npm help and never starts
        // the Next dev server).
        shell: false,
        stdio: ['inherit', 'pipe', 'pipe'],
        env: process.env,
      });

let opened = false;

function maybeOpen(line) {
  if (opened) return;
  if (!isEmulatorReadyLine(line)) return;

  opened = true;

  // Open the role picker first, then the app.
  openUrl(`${emulatorBaseUrl}${LOGIN_PATH}`);
  setTimeout(() => {
    openUrl(`${emulatorBaseUrl}${APP_PATH}`);
  }, 750);
}

swaProc.stdout.on('data', (buf) => {
  const text = buf.toString('utf8');
  process.stdout.write(text);
  for (const line of text.split(/\r?\n/g)) {
    if (line.trim()) maybeOpen(line);
  }
});

swaProc.stderr.on('data', (buf) => {
  const text = buf.toString('utf8');
  process.stderr.write(text);
  for (const line of text.split(/\r?\n/g)) {
    if (line.trim()) maybeOpen(line);
  }
});

function shutdown(signal) {
  if (swaProc && !swaProc.killed) {
    swaProc.kill(signal);
  }
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

swaProc.on('exit', (code) => {
  process.exit(code ?? 0);
});
