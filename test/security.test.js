import test from 'node:test';
import assert from 'node:assert/strict';
import {
  hasNullByte,
  isWindowsReservedName,
  hasIllegalWindowsChars,
  detectTraversal,
  checkSafePath,
  isSafePath,
  assertSafePath,
  sanitize,
} from '../src/security.js';
import { PathTraversalError, InvalidPathError } from '../src/errors.js';

test('security - null byte detection', () => {
  assert.equal(hasNullByte('foo/bar'), false);
  assert.equal(hasNullByte('foo\0bar'), true);
  assert.equal(hasNullByte('foo%00bar'), true);
  assert.equal(hasNullByte('foo%00.png'), true);
});

test('security - Windows reserved device names', () => {
  assert.equal(isWindowsReservedName('CON'), true);
  assert.equal(isWindowsReservedName('con.txt'), true);
  assert.equal(isWindowsReservedName('PRN'), true);
  assert.equal(isWindowsReservedName('aux.tar.gz'), true);
  assert.equal(isWindowsReservedName('NUL'), true);
  assert.equal(isWindowsReservedName('com1'), true);
  assert.equal(isWindowsReservedName('LPT9.log'), true);
  assert.equal(isWindowsReservedName('regular_file.txt'), false);
  assert.equal(isWindowsReservedName('contact.json'), false);
});

test('security - illegal Windows characters', () => {
  assert.equal(hasIllegalWindowsChars('normal_name.txt'), false);
  assert.equal(hasIllegalWindowsChars('bad<name>'), true);
  assert.equal(hasIllegalWindowsChars('foo:stream'), true);
  assert.equal(hasIllegalWindowsChars('wildcard*'), true);
  assert.equal(hasIllegalWindowsChars('pipe|name'), true);
  assert.equal(hasIllegalWindowsChars('question?'), true);
  assert.equal(hasIllegalWindowsChars('quote"'), true);
});

test('security - detect traversal patterns', () => {
  assert.equal(detectTraversal('safe/path').hasTraversal, false);
  assert.equal(detectTraversal('safe/./path').hasTraversal, false);
  assert.equal(detectTraversal('safe/subdir/../file').hasTraversal, false);
  assert.equal(detectTraversal('../escape').hasTraversal, true);
  assert.equal(detectTraversal('a/../../b').hasTraversal, true);
  assert.equal(detectTraversal('..\\windows\\escape').hasTraversal, true);
  assert.equal(detectTraversal('foo/%2e%2e/bar').hasTraversal, true);
  assert.equal(detectTraversal('foo/\uFF0E\uFF0E/bar').hasTraversal, true);
});

test('security - checkSafePath and isSafePath', () => {
  assert.equal(isSafePath('docs/readme.md'), true);
  assert.equal(isSafePath('../docs/readme.md'), false);
  assert.equal(isSafePath('docs/aux.txt', { platform: 'win32' }), false);
  assert.equal(isSafePath('docs/normal.txt', { platform: 'win32' }), true);

  const checkFailTraversal = checkSafePath('../../etc/passwd');
  assert.equal(checkFailTraversal.safe, false);
  assert.equal(checkFailTraversal.code, 'ERR_PATH_TRAVERSAL');

  const checkFailNull = checkSafePath('foo\0bar');
  assert.equal(checkFailNull.safe, false);
  assert.equal(checkFailNull.code, 'ERR_NULL_BYTE');

  const checkFailReserved = checkSafePath('safe/dir/nul', { platform: 'win32' });
  assert.equal(checkFailReserved.safe, false);
  assert.equal(checkFailReserved.code, 'ERR_WINDOWS_RESERVED_NAME');
});

test('security - assertSafePath throws correct error types', () => {
  assert.doesNotThrow(() => assertSafePath('valid/relative/path.txt'));
  assert.throws(() => assertSafePath('../escaped.txt'), PathTraversalError);
  assert.throws(() => assertSafePath('file\0name.txt'), InvalidPathError);
  assert.throws(() => assertSafePath('path/to/con.txt', { platform: 'win32' }), InvalidPathError);
});

test('security - sanitize strips traversal and harmful segments', () => {
  assert.equal(sanitize('../../etc/passwd'), 'etc/passwd');
  assert.equal(sanitize('a/b/../../c'), 'a/b/c');
  assert.equal(sanitize('foo\0bar.txt'), 'foobar.txt');
  assert.equal(sanitize('bad:filename?.txt'), 'bad_filename_.txt');
  assert.equal(sanitize('path/to/con.txt'), 'path/to/_con.txt');
  assert.equal(sanitize('folder/trailing. '), 'folder/trailing');
  assert.equal(sanitize('C:\\Users\\test', { separator: 'win32' }), 'C:\\Users\\test');
  assert.equal(sanitize('/var/log/app.log'), '/var/log/app.log');
});
