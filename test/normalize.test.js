import test from 'node:test';
import assert from 'node:assert/strict';
import { normalize, toPosix, toWin32, toNative } from '../src/normalize.js';
import { InvalidPathError } from '../src/errors.js';

test('normalize - basic paths and separators', () => {
  assert.equal(normalize('a/b/c'), 'a/b/c');
  assert.equal(normalize('a\\b\\c'), 'a/b/c');
  assert.equal(normalize('a///b\\\\c'), 'a/b/c');
  assert.equal(normalize('a\\b/c//d'), 'a/b/c/d');
});

test('normalize - target separator styles', () => {
  assert.equal(normalize('a/b/c', { separator: 'posix' }), 'a/b/c');
  assert.equal(normalize('a/b/c', { separator: 'win32' }), 'a\\b\\c');
  assert.equal(toPosix('a\\b\\c'), 'a/b/c');
  assert.equal(toWin32('a/b/c'), 'a\\b\\c');

  const nativeExpected = process.platform === 'win32' ? 'a\\b\\c' : 'a/b/c';
  assert.equal(toNative('a/b/c'), nativeExpected);
});

test('normalize - dot and double-dot resolution', () => {
  assert.equal(normalize('a/./b/./c'), 'a/b/c');
  assert.equal(normalize('a/b/../c'), 'a/c');
  assert.equal(normalize('a/b/../../c'), 'c');
  assert.equal(normalize('a/b/../../../c'), '../c');
  assert.equal(normalize('./foo/bar'), 'foo/bar');
  assert.equal(normalize('foo/bar/.'), 'foo/bar');
  assert.equal(normalize('foo/..'), '.');
  assert.equal(normalize(''), '.');
  assert.equal(normalize('', { allowEmpty: true }), '');
});

test('normalize - absolute POSIX paths', () => {
  assert.equal(normalize('/'), '/');
  assert.equal(normalize('/a/b/c'), '/a/b/c');
  assert.equal(normalize('/a/../b'), '/b');
  assert.equal(normalize('/a/../../b'), '/b'); // Cannot escape past root
  assert.equal(normalize('///a//b///'), '/a/b/');
});

test('normalize - Windows drive letters', () => {
  assert.equal(normalize('c:\\foo\\bar'), 'C:/foo/bar');
  assert.equal(normalize('C:/foo/../bar'), 'C:/bar');
  assert.equal(normalize('d:\\a\\..\\..\\b'), 'D:/b'); // Cannot escape drive root
  assert.equal(normalize('c:\\foo', { separator: 'win32' }), 'C:\\foo');
  assert.equal(normalize('c:', { separator: 'win32' }), 'C:');
  assert.equal(normalize('C:\\'), 'C:/');
});

test('normalize - UNC network paths', () => {
  assert.equal(normalize('\\\\server\\share\\foo\\bar'), '//server/share/foo/bar');
  assert.equal(normalize('//server/share/foo/../bar'), '//server/share/bar');
  assert.equal(normalize('\\\\server\\share\\foo', { separator: 'win32' }), '\\\\server\\share\\foo');
});

test('normalize - trailing slash policies', () => {
  assert.equal(normalize('foo/bar/', { trailingSlash: 'preserve' }), 'foo/bar/');
  assert.equal(normalize('foo/bar', { trailingSlash: 'preserve' }), 'foo/bar');
  assert.equal(normalize('foo/bar/', { trailingSlash: 'strip' }), 'foo/bar');
  assert.equal(normalize('foo/bar', { trailingSlash: 'force' }), 'foo/bar/');
  assert.equal(normalize('/', { trailingSlash: 'strip' }), '/');
});

test('normalize - case policies', () => {
  assert.equal(normalize('Foo/Bar/Baz.Txt', { casePolicy: 'preserve' }), 'Foo/Bar/Baz.Txt');
  assert.equal(normalize('Foo/Bar/Baz.Txt', { casePolicy: 'lower' }), 'foo/bar/baz.txt');
  assert.equal(normalize('Foo/Bar/Baz.Txt', { casePolicy: 'upper' }), 'FOO/BAR/BAZ.TXT');
  assert.equal(normalize('c:/foo/bar', { casePolicy: 'driveUpper' }), 'C:/foo/bar');
});

test('normalize - error cases', () => {
  assert.throws(() => normalize(null), InvalidPathError);
  assert.throws(() => normalize(123), InvalidPathError);
  assert.throws(() => normalize('foo\0bar'), InvalidPathError);
});
