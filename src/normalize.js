import { hasNullByte } from './security.js';
import { InvalidPathError } from './errors.js';

/**
 * Normalizes a path string across Windows and POSIX systems.
 *
 * @param {string} inputPath
 * @param {object} [options]
 * @param {'posix'|'win32'|'native'} [options.separator='posix'] Target separator style
 * @param {'preserve'|'lower'|'upper'|'driveUpper'} [options.casePolicy='preserve'] Case transformation policy
 * @param {'preserve'|'strip'|'force'} [options.trailingSlash='preserve'] Trailing slash policy
 * @param {boolean} [options.allowEmpty=false] Whether to allow empty string return instead of '.'
 * @param {'auto'|'win32'|'posix'} [options.platform='auto'] Platform context
 * @returns {string} Normalized path
 */
export function normalize(inputPath, options = {}) {
  const {
    separator = 'posix',
    casePolicy = 'preserve',
    trailingSlash = 'preserve',
    allowEmpty = false,
    platform = 'auto',
  } = options;

  if (typeof inputPath !== 'string') {
    throw new InvalidPathError('Expected path to be a string', { input: inputPath });
  }

  if (hasNullByte(inputPath)) {
    throw new InvalidPathError('Path contains null bytes', { input: inputPath });
  }

  if (inputPath.length === 0) {
    return allowEmpty ? '' : '.';
  }

  const targetSep = separator === 'win32'
    ? '\\'
    : separator === 'native'
      ? (process.platform === 'win32' ? '\\' : '/')
      : '/';

  // Check if original had trailing slash before manipulation
  const hadTrailingSlash = inputPath.length > 1 && /[\\\/]$/.test(inputPath);

  // Unify separators to forward slash for uniform processing
  let working = inputPath.replace(/\\/g, '/');

  // Detect root/prefix
  let prefix = '';
  let isAbsolute = false;
  let isUNC = false;

  // Check for UNC path: //server/share or \\server\share
  const uncMatch = working.match(/^(\/{2}[^\/]+(?:\/[^\/]+)?)(.*)/);
  // Check for Windows drive letter: C: or c:/...
  const driveMatch = working.match(/^([a-zA-Z]:)(.*)/);

  if (driveMatch && (platform === 'auto' || platform === 'win32')) {
    const driveLetter = driveMatch[1];
    prefix = (casePolicy === 'lower')
      ? driveLetter.toLowerCase()
      : driveLetter.toUpperCase(); // normalize C: by default to uppercase
    working = driveMatch[2];
    if (working.startsWith('/')) {
      prefix += '/';
      working = working.replace(/^\/+/, '');
      isAbsolute = true;
    }
  } else if (uncMatch && (platform === 'auto' || platform === 'win32')) {
    prefix = uncMatch[1];
    working = uncMatch[2] || '';
    isUNC = true;
    isAbsolute = true;
    if (working.startsWith('/')) {
      prefix += '/';
      working = working.replace(/^\/+/, '');
    }
  } else if (working.startsWith('/')) {
    isAbsolute = true;
    prefix = '/';
    working = working.replace(/^\/+/, '');
  }

  // Split remainder into segments
  const rawSegments = working.split('/');
  const resolvedSegments = [];

  for (const seg of rawSegments) {
    if (!seg || seg === '.') {
      continue;
    }
    if (seg === '..') {
      if (resolvedSegments.length > 0 && resolvedSegments[resolvedSegments.length - 1] !== '..') {
        resolvedSegments.pop();
      } else if (!isAbsolute) {
        resolvedSegments.push('..');
      }
      // If isAbsolute and resolvedSegments is empty, .. is ignored at root level
    } else {
      resolvedSegments.push(seg);
    }
  }

  let body = resolvedSegments.join('/');

  // Re-assemble
  let result = '';
  if (prefix) {
    if (isUNC) {
      result = prefix + body;
    } else if (prefix.endsWith('/')) {
      result = prefix + body;
    } else if (prefix.endsWith(':')) {
      result = body ? `${prefix}${body}` : prefix;
    } else {
      result = prefix + body;
    }
  } else {
    result = body || (allowEmpty ? '' : '.');
  }

  // Handle trailing slash
  if (result && result !== '/' && result !== '\\' && !result.endsWith(':')) {
    const shouldHaveTrailing = (trailingSlash === 'force') || (trailingSlash === 'preserve' && hadTrailingSlash);
    const endsWithSlash = result.endsWith('/') || result.endsWith('\\');

    if (trailingSlash === 'strip' && endsWithSlash) {
      result = result.replace(/[\\\/]+$/, '');
    } else if (shouldHaveTrailing && !endsWithSlash && result !== '.') {
      result += '/';
    }
  }

  // Apply case policy
  if (casePolicy === 'lower') {
    result = result.toLowerCase();
  } else if (casePolicy === 'upper') {
    result = result.toUpperCase();
  } else if (casePolicy === 'driveUpper' && driveMatch) {
    result = result.charAt(0).toUpperCase() + result.slice(1);
  }

  // Replace with target separator
  if (targetSep !== '/') {
    result = result.replace(/\//g, targetSep);
  }

  return result;
}

/**
 * Normalizes to POSIX style (forward slashes).
 * @param {string} inputPath
 * @param {object} [options]
 * @returns {string}
 */
export function toPosix(inputPath, options = {}) {
  return normalize(inputPath, { ...options, separator: 'posix' });
}

/**
 * Normalizes to Windows style (backslashes).
 * @param {string} inputPath
 * @param {object} [options]
 * @returns {string}
 */
export function toWin32(inputPath, options = {}) {
  return normalize(inputPath, { ...options, separator: 'win32' });
}

/**
 * Normalizes to the native host OS separator.
 * @param {string} inputPath
 * @param {object} [options]
 * @returns {string}
 */
export function toNative(inputPath, options = {}) {
  return normalize(inputPath, { ...options, separator: 'native' });
}
