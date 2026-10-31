import test from 'node:test';
import assert from 'node:assert/strict';
import { areEqual, isWithin, isSubpath, contains, relative } from '../src/compare.js';
import { InvalidPathError } from '../src/errors.js';

test('compare - areEqual basic and cross-platform separators', () => {
  assert.equal(areEqual('foo/bar', 'foo\\bar'), true);
  assert.equal(areEqual('foo///bar//baz', 'foo/bar/baz'), true);
  assert.equal(areEqual('foo/./bar/../baz', 'foo/baz'), true);
  assert.equal(areEqual('/var/log/', '/var/log'), true);
  assert.equal(areEqual('foo/bar', 'foo/other'), false);
});

test('compare - areEqual case policies', () => {
  // Sensitive
  assert.equal(areEqual('foo/bar', 'FOO/BAR', { casePolicy: 'sensitive' }), false);
  assert.equal(areEqual('foo/bar', 'foo/bar', { casePolicy: 'sensitive' }), true);

  // Insensitive
  assert.equal(areEqual('foo/bar', 'FOO/BAR', { casePolicy: 'insensitive' }), true);
  assert.equal(areEqual('C:\\Foo\\Bar', 'c:/foo/bar', { casePolicy: 'insensitive' }), true);

  // Auto detects Windows drive as insensitive
  assert.equal(areEqual('C:\\Foo\\Bar', 'c:/foo/bar', { casePolicy: 'auto' }), true);
});

test('compare - isWithin and contains hierarchy check', () => {
  assert.equal(isWithin('/var/www', '/var/www/site/index.html'), true);
  assert.equal(contains('/var/www', '/var/www/site/index.html'), true);
  assert.equal(isWithin('/var/www', '/var/www'), true); // allowEqual defaults to true
  assert.equal(isWithin('/var/www', '/var/www', { allowEqual: false }), false);
  assert.equal(isSubpath('/var/www', '/var/www'), false); // strict subpath

  // Path boundary checking (must not match partial prefix)
  assert.equal(isWithin('/var/www', '/var/www-secret/index.html'), false);
  assert.equal(isWithin('app', 'app_data/file.txt'), false);

  // Outside check
  assert.equal(isWithin('/var/www', '/etc/passwd'), false);
  assert.equal(isWithin('/var/www', '/var/www/../outside'), false);
});

test('compare - isWithin Windows drives and case sensitivity', () => {
  assert.equal(isWithin('C:/app', 'C:\\app\\data\\db.sqlite'), true);
  assert.equal(isWithin('c:/app', 'C:/APP/data/db.sqlite', { casePolicy: 'insensitive' }), true);

  // Cross drive is always false
  assert.equal(isWithin('C:/app', 'D:/app/data'), false);
});

test('compare - relative path computation', () => {
  assert.equal(relative('/var/www', '/var/www/images/photo.png'), 'images/photo.png');
  assert.equal(relative('C:/app', 'C:/app/src/index.js'), 'src/index.js');
  assert.equal(relative('/var/www', '/var/www'), '.');

  // Relative with separator style
  assert.equal(relative('C:/app', 'C:/app/src/index.js', { separator: 'win32' }), 'src\\index.js');

  // Outside without allowOutside throws
  assert.throws(() => relative('/var/www', '/etc/passwd'), InvalidPathError);

  // Outside with allowOutside allowed
  assert.equal(relative('/var/www', '/var/log/app.log', { allowOutside: true }), '../log/app.log');
});
