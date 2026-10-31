import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  normalize,
  resolveSafe,
  checkSafePath,
  areEqual,
  isWithin,
  sanitize,
} from '../src/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const cliPath = join(__dirname, '../bin/pathsafe.js');

function runBin(args = [], options = {}) {
  try {
    const stdout = execFileSync(process.execPath, [cliPath, ...args], {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      ...options,
    });
    return { status: 0, stdout: stdout.trim(), stderr: '' };
  } catch (err) {
    return {
      status: err.status,
      stdout: (err.stdout || '').toString().trim(),
      stderr: (err.stderr || '').toString().trim(),
    };
  }
}

test('cli - help and version flags', () => {
  const helpRes = runBin(['--help']);
  assert.equal(helpRes.status, 0);
  assert(helpRes.stdout.includes('Usage:'));

  const verRes = runBin(['--version']);
  assert.equal(verRes.status, 0);
  assert(/^\d+\.\d+\.\d+/.test(verRes.stdout));
});

test('cli normalize - parity with library normalize', () => {
  const input = 'a//b\\c/../d';
  const libResult = normalize(input);

  const cliRes = runBin(['normalize', input]);
  assert.equal(cliRes.status, 0);
  assert.equal(cliRes.stdout, libResult);

  // With --json
  const jsonRes = runBin(['normalize', input, '--json']);
  assert.equal(jsonRes.status, 0);
  const parsed = JSON.parse(jsonRes.stdout);
  assert.equal(parsed.normalized, libResult);

  // Target separator
  const winLib = normalize(input, { separator: 'win32' });
  const cliWin = runBin(['normalize', input, '--to', 'win32']);
  assert.equal(cliWin.status, 0);
  assert.equal(cliWin.stdout, winLib);
});

test('cli resolve - parity with library resolveSafe', () => {
  const base = '/var/www';
  const untrustedSafe = 'images/logo.png';
  const libSafe = resolveSafe(base, untrustedSafe);

  const cliSafe = runBin(['resolve', base, untrustedSafe]);
  assert.equal(cliSafe.status, 0);
  assert.equal(cliSafe.stdout, libSafe);

  // Root breakout detection
  const untrustedAttack = '../../etc/passwd';
  const cliAttack = runBin(['resolve', base, untrustedAttack]);
  assert.equal(cliAttack.status, 1);
  assert(cliAttack.stderr.toLowerCase().includes('traversal'));

  // Root breakout with --json
  const cliJsonAttack = runBin(['resolve', base, untrustedAttack, '--json']);
  assert.equal(cliJsonAttack.status, 1);
  const parsed = JSON.parse(cliJsonAttack.stdout);
  assert.equal(parsed.success, false);
  assert.equal(parsed.code, 'ERR_ROOT_BREAKOUT');
});

test('cli check - parity with library checkSafePath', () => {
  const safePath = 'safe/docs/readme.md';
  const libSafe = checkSafePath(safePath);
  const cliSafe = runBin(['check', safePath, '--json']);
  assert.equal(cliSafe.status, 0);
  const parsedSafe = JSON.parse(cliSafe.stdout);
  assert.equal(parsedSafe.safe, libSafe.safe);

  const attackPath = '../../etc/shadow';
  const libAttack = checkSafePath(attackPath);
  const cliAttack = runBin(['check', attackPath, '--json']);
  assert.equal(cliAttack.status, 1);
  const parsedAttack = JSON.parse(cliAttack.stdout);
  assert.equal(parsedAttack.safe, libAttack.safe);
  assert.equal(parsedAttack.code, libAttack.code);
});

test('cli compare - parity with library areEqual', () => {
  const p1 = 'foo/bar/baz';
  const p2 = 'foo\\bar\\baz';
  const libEqual = areEqual(p1, p2);

  const cliEqual = runBin(['compare', p1, p2]);
  assert.equal(cliEqual.status, 0);
  assert.equal(cliEqual.stdout, 'EQUAL');

  const cliJson = runBin(['compare', p1, p2, '--json']);
  const parsed = JSON.parse(cliJson.stdout);
  assert.equal(parsed.equal, libEqual);

  const cliDiff = runBin(['compare', 'foo/a', 'foo/b']);
  assert.equal(cliDiff.status, 1);
  assert.equal(cliDiff.stdout, 'NOT_EQUAL');
});

test('cli contains - parity with library isWithin', () => {
  const parent = '/workspace/project';
  const child = '/workspace/project/src/index.js';
  const libInside = isWithin(parent, child);

  const cliContained = runBin(['contains', parent, child]);
  assert.equal(cliContained.status, 0);
  assert.equal(cliContained.stdout, 'CONTAINS');

  const cliJson = runBin(['contains', parent, child, '--json']);
  const parsed = JSON.parse(cliJson.stdout);
  assert.equal(parsed.contains, libInside);

  const cliOutside = runBin(['contains', parent, '/etc/passwd']);
  assert.equal(cliOutside.status, 1);
  assert.equal(cliOutside.stdout, 'NOT_CONTAINS');
});

test('cli sanitize - parity with library sanitize', () => {
  const dirty = 'dir/..\\..\\bad<file>:stream.txt';
  const libClean = sanitize(dirty);

  const cliRes = runBin(['sanitize', dirty]);
  assert.equal(cliRes.status, 0);
  assert.equal(cliRes.stdout, libClean);
});

test('cli - missing argument returns exit code 2', () => {
  const noArgs = runBin(['normalize']);
  assert.equal(noArgs.status, 2);

  const unknown = runBin(['unknowncmd']);
  assert.equal(unknown.status, 2);
});
