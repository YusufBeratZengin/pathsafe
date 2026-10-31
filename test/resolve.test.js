import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveSafe, tryResolveSafe } from '../src/resolve.js';
import { RootBreakoutError, InvalidPathError, PathTraversalError } from '../src/errors.js';

test('resolveSafe - basic safe resolutions', () => {
  assert.equal(resolveSafe('/var/www', 'images/photo.png'), '/var/www/images/photo.png');
  assert.equal(resolveSafe('/var/www', 'site/../images/photo.png'), '/var/www/images/photo.png');
  assert.equal(resolveSafe('C:/app', 'src/index.js'), 'C:/app/src/index.js');
  assert.equal(resolveSafe('C:/app', 'src\\index.js', { separator: 'win32' }), 'C:\\app\\src\\index.js');
});

test('resolveSafe - root breakout attempts throw RootBreakoutError', () => {
  assert.throws(
    () => resolveSafe('/var/www', '../../etc/passwd'),
    RootBreakoutError
  );

  assert.throws(
    () => resolveSafe('/var/www', 'sub/../../etc/passwd'),
    RootBreakoutError
  );

  assert.throws(
    () => resolveSafe('C:/app', '..\\secret.txt'),
    RootBreakoutError
  );

  assert.throws(
    () => resolveSafe('C:/app', 'D:/other/secret.txt'),
    RootBreakoutError
  );
});

test('resolveSafe - absolute path policy', () => {
  // Absolute disallowed by default
  assert.throws(
    () => resolveSafe('/var/www', '/etc/shadow'),
    RootBreakoutError
  );

  // Absolute allowed if it actually stays within base
  assert.equal(
    resolveSafe('/var/www', '/var/www/site/index.html', { allowAbsolute: true }),
    '/var/www/site/index.html'
  );

  // Absolute disallowed even if within base when allowAbsolute is false
  assert.throws(
    () => resolveSafe('/var/www', '/var/www/site/index.html', { allowAbsolute: false }),
    RootBreakoutError
  );

  // treatAbsoluteAsRelative strips root and resolves safely inside base
  assert.equal(
    resolveSafe('/var/www', '/images/logo.png', { treatAbsoluteAsRelative: true }),
    '/var/www/images/logo.png'
  );

  assert.equal(
    resolveSafe('C:/app', 'C:\\data\\config.json', { treatAbsoluteAsRelative: true }),
    'C:/app/data/config.json'
  );
});

test('resolveSafe - reserved device names blocked on Windows/auto', () => {
  assert.throws(
    () => resolveSafe('C:/app', 'safe/con.txt'),
    InvalidPathError
  );

  assert.throws(
    () => resolveSafe('C:/app', 'nul'),
    InvalidPathError
  );

  // Can be disabled explicitly if desired
  assert.equal(
    resolveSafe('/var/www', 'nul', { checkReservedNames: false, platform: 'posix' }),
    '/var/www/nul'
  );
});

test('resolveSafe - throwOnError: false returns null instead of throwing', () => {
  const result = resolveSafe('/var/www', '../../outside', { throwOnError: false });
  assert.equal(result, null);
});

test('resolveSafe - tryResolveSafe returns status object', () => {
  const ok = tryResolveSafe('/var/www', 'index.html');
  assert.equal(ok.success, true);
  assert.equal(ok.path, '/var/www/index.html');

  const fail = tryResolveSafe('/var/www', '../../outside');
  assert.equal(fail.success, false);
  assert(fail.error instanceof RootBreakoutError);
});
