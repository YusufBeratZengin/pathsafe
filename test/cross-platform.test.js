import test from 'node:test';
import assert from 'node:assert/strict';
import { normalize, toPosix, toWin32 } from '../src/normalize.js';
import { areEqual, isWithin, contains } from '../src/compare.js';
import { resolveSafe } from '../src/resolve.js';
import { checkSafePath, sanitize } from '../src/security.js';
import { RootBreakoutError, InvalidPathError } from '../src/errors.js';

test('cross-platform - mixed separator handling in normalize', () => {
  const mixed = 'folder\\sub/nested\\file.txt';
  assert.equal(toPosix(mixed), 'folder/sub/nested/file.txt');
  assert.equal(toWin32(mixed), 'folder\\sub\\nested\\file.txt');

  const redundant = 'foo///bar\\\\\\baz//file.js';
  assert.equal(toPosix(redundant), 'foo/bar/baz/file.js');
  assert.equal(toWin32(redundant), 'foo\\bar\\baz\\file.js');
});

test('cross-platform - case policy differences', () => {
  // On POSIX (case-sensitive), Foo and foo are different files
  assert.equal(areEqual('var/log/app.log', 'var/log/APP.log', { casePolicy: 'sensitive' }), false);
  assert.equal(isWithin('var/log', 'var/LOG/app.log', { casePolicy: 'sensitive' }), false);

  // On Windows (case-insensitive), Foo and foo refer to the same file
  assert.equal(areEqual('C:\\Projects\\App', 'c:/projects/app', { casePolicy: 'insensitive' }), true);
  assert.equal(isWithin('C:/projects', 'c:\\PROJECTS\\app\\index.js', { casePolicy: 'insensitive' }), true);
  assert.equal(contains('C:/projects', 'c:\\PROJECTS\\app\\index.js', { casePolicy: 'insensitive' }), true);
});

test('cross-platform - root breakout with alternating slashes', () => {
  const attack1 = '..\\..//..\\etc/passwd';
  const check1 = checkSafePath(attack1);
  assert.equal(check1.safe, false);

  assert.throws(
    () => resolveSafe('/app/data', attack1),
    RootBreakoutError
  );

  const attack2 = 'sub/dir/..\\..\\..\\secret.key';
  assert.throws(
    () => resolveSafe('C:/app/data', attack2),
    RootBreakoutError
  );
});

test('cross-platform - Windows drive boundary isolation', () => {
  // Attempting to jump from C: drive to D: drive
  assert.throws(
    () => resolveSafe('C:\\workspace', 'D:\\workspace\\secret.txt'),
    RootBreakoutError
  );

  assert.equal(isWithin('C:\\workspace', 'D:\\workspace\\secret.txt'), false);
  assert.equal(areEqual('C:\\workspace', 'D:\\workspace'), false);
});

test('cross-platform - Windows reserved names regardless of host OS', () => {
  const reservedFiles = ['con', 'CON.txt', 'nul.json', 'aux.tar.gz', 'com1.log', 'lpt9'];

  for (const file of reservedFiles) {
    const res = checkSafePath(`data/${file}`, { platform: 'win32' });
    assert.equal(res.safe, false, `Expected ${file} to be flagged as unsafe on win32`);
    assert.equal(res.code, 'ERR_WINDOWS_RESERVED_NAME');

    assert.throws(
      () => resolveSafe('C:\\app', `uploads/${file}`),
      InvalidPathError
    );
  }
});

test('cross-platform - UNC path validation', () => {
  const unc = '\\\\host\\share\\path\\to\\file';
  assert.equal(toPosix(unc), '//host/share/path/to/file');
  assert.equal(toWin32(unc), '\\\\host\\share\\path\\to\\file');

  // UNC paths should not allow escaping the share
  assert.throws(
    () => resolveSafe('\\\\host\\share\\dir', '..\\..\\outside'),
    RootBreakoutError
  );
});

test('cross-platform - sanitize produces valid path for any OS', () => {
  const toxicWin = 'bad<dir>|name/CON.txt:hidden?*';
  const safe = sanitize(toxicWin);
  assert.equal(safe.includes('<'), false);
  assert.equal(safe.includes('>'), false);
  assert.equal(safe.includes(':'), false);
  assert.equal(safe.includes('|'), false);
  assert.equal(safe.includes('?'), false);
  assert.equal(safe.includes('*'), false);
  assert.equal(safe.toLowerCase().includes('/_con.txt'), true);
});
