import { InvalidPathError, PathTraversalError } from './errors.js';

// Windows reserved device names: CON, PRN, AUX, NUL, COM0-COM9, LPT0-LPT9
const WINDOWS_RESERVED_REGEX = /^(CON|PRN|AUX|NUL|COM[0-9]|LPT[0-9])(\..*)?$/i;

// Characters forbidden in Windows filenames: < > : " / \ | ? * and ASCII 0-31
const WINDOWS_ILLEGAL_CHARS_REGEX = /[<>:"|?*\x00-\x1F]/;

// Check for null bytes
const NULL_BYTE_REGEX = /\x00|%00/i;

// Encoded dot and slash patterns
const ENCODED_TRAVERSAL_REGEX = /(%2e|\uFF0E|\u2024)/i;

/**
 * Detects if a string contains null bytes.
 * @param {string} str
 * @returns {boolean}
 */
export function hasNullByte(str) {
  if (typeof str !== 'string') return false;
  return NULL_BYTE_REGEX.test(str);
}

/**
 * Checks if a filename or path segment is a Windows reserved device name.
 * e.g., 'CON', 'aux.txt', 'com1.json', 'nul'
 * @param {string} segment
 * @returns {boolean}
 */
export function isWindowsReservedName(segment) {
  if (typeof segment !== 'string') return false;
  const clean = segment.trim();
  return WINDOWS_RESERVED_REGEX.test(clean);
}

/**
 * Checks if a path segment contains illegal Windows filename characters.
 * @param {string} segment
 * @returns {boolean}
 */
export function hasIllegalWindowsChars(segment) {
  if (typeof segment !== 'string') return false;
  return WINDOWS_ILLEGAL_CHARS_REGEX.test(segment);
}

/**
 * Detects if a path has traversal patterns (e.g. '../', '..\', leading '..').
 * @param {string} inputPath
 * @returns {{ hasTraversal: boolean, reason?: string }}
 */
export function detectTraversal(inputPath) {
  if (typeof inputPath !== 'string') {
    return { hasTraversal: false };
  }

  if (hasNullByte(inputPath)) {
    return { hasTraversal: true, reason: 'Path contains forbidden null byte' };
  }

  // Check URL encoded or Unicode dots
  if (ENCODED_TRAVERSAL_REGEX.test(inputPath)) {
    return { hasTraversal: true, reason: 'Path contains encoded traversal sequence' };
  }

  // Normalize slashes for analysis
  const normalized = inputPath.replace(/\\/g, '/');
  const segments = normalized.split('/');

  let depth = 0;
  for (const seg of segments) {
    if (!seg || seg === '.') continue;
    if (seg === '..') {
      depth--;
      if (depth < 0) {
        return { hasTraversal: true, reason: 'Path contains directory traversal (..)' };
      }
    } else {
      depth++;
    }
  }

  return { hasTraversal: false };
}

/**
 * Inspects a path for safety.
 *
 * @param {string} inputPath
 * @param {object} [options]
 * @param {'auto'|'win32'|'posix'} [options.platform='auto']
 * @param {boolean} [options.allowAbsolute=true]
 * @param {boolean} [options.checkReservedNames=true]
 * @param {boolean} [options.checkIllegalChars=false]
 * @returns {{ safe: boolean, reason?: string, code?: string }}
 */
export function checkSafePath(inputPath, options = {}) {
  const {
    platform = 'auto',
    allowAbsolute = true,
    checkReservedNames = true,
    checkIllegalChars = false,
  } = options;

  if (typeof inputPath !== 'string') {
    return { safe: false, reason: 'Path must be a string', code: 'ERR_INVALID_TYPE' };
  }

  if (inputPath.length === 0) {
    return { safe: true };
  }

  if (hasNullByte(inputPath)) {
    return { safe: false, reason: 'Path contains forbidden null byte', code: 'ERR_NULL_BYTE' };
  }

  if (ENCODED_TRAVERSAL_REGEX.test(inputPath)) {
    return { safe: false, reason: 'Path contains encoded traversal sequence', code: 'ERR_ENCODED_TRAVERSAL' };
  }

  const isWin = platform === 'win32' || (platform === 'auto' && /^[a-zA-Z]:|[\\\/]{2}/.test(inputPath));

  // Traversal check
  const traversalResult = detectTraversal(inputPath);
  if (traversalResult.hasTraversal) {
    return { safe: false, reason: traversalResult.reason, code: 'ERR_PATH_TRAVERSAL' };
  }

  // Split segments
  const normalizedSlashes = inputPath.replace(/\\/g, '/');
  const isPosixAbsolute = normalizedSlashes.startsWith('/');
  const isWinDrive = /^[a-zA-Z]:/.test(inputPath);
  const isUNC = /^[\/\\]{2}[^\\\/]+[\/\\]+[^\\\/]+/.test(inputPath);

  const isAbs = isPosixAbsolute || isWinDrive || isUNC;

  if (!allowAbsolute && isAbs) {
    return { safe: false, reason: 'Absolute paths are not allowed', code: 'ERR_ABSOLUTE_NOT_ALLOWED' };
  }

  const parts = normalizedSlashes.split('/').filter(Boolean);

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];

    // If first part is drive letter like "C:", skip reserved name check on drive letter itself
    if (i === 0 && /^[a-zA-Z]:$/.test(part)) {
      continue;
    }

    if (checkReservedNames && (isWin || platform === 'win32')) {
      if (isWindowsReservedName(part)) {
        return {
          safe: false,
          reason: `Path segment "${part}" is a Windows reserved device name`,
          code: 'ERR_WINDOWS_RESERVED_NAME',
        };
      }
    }

    if (checkIllegalChars && (isWin || platform === 'win32')) {
      // Disallow NTFS alternate data streams or forbidden chars in segment
      if (hasIllegalWindowsChars(part)) {
        return {
          safe: false,
          reason: `Path segment "${part}" contains illegal Windows characters`,
          code: 'ERR_ILLEGAL_CHARS',
        };
      }
    }
  }

  return { safe: true };
}

/**
 * Returns true if the path is safe according to the options.
 * @param {string} inputPath
 * @param {object} [options]
 * @returns {boolean}
 */
export function isSafePath(inputPath, options = {}) {
  return checkSafePath(inputPath, options).safe;
}

/**
 * Asserts that a path is safe, throwing an error if it is not.
 * @param {string} inputPath
 * @param {object} [options]
 */
export function assertSafePath(inputPath, options = {}) {
  const result = checkSafePath(inputPath, options);
  if (!result.safe) {
    if (result.code === 'ERR_PATH_TRAVERSAL' || result.code === 'ERR_ENCODED_TRAVERSAL') {
      throw new PathTraversalError(result.reason, { code: result.code, path: inputPath });
    }
    throw new InvalidPathError(result.reason, { code: result.code, path: inputPath });
  }
}

/**
 * Sanitizes a path string by removing traversal sequences, null bytes,
 * and dangerous patterns, returning a safe normalized relative or absolute path.
 *
 * @param {string} inputPath
 * @param {object} [options]
 * @param {'posix'|'win32'|'native'} [options.separator='posix']
 * @param {string} [options.replacement='_']
 * @returns {string}
 */
export function sanitize(inputPath, options = {}) {
  const { separator = 'posix', replacement = '_' } = options;
  if (typeof inputPath !== 'string') return '';

  // Remove null bytes
  let cleaned = inputPath.replace(/\x00|%00/gi, '');

  // Decode basic encoded dots
  cleaned = cleaned.replace(/%2e/gi, '.');

  // Convert all backslashes to forward slashes for uniform segment processing
  cleaned = cleaned.replace(/\\/g, '/');

  // Preserve leading drive letter if present
  let prefix = '';
  const driveMatch = cleaned.match(/^([a-zA-Z]:)(\/.*|$)/);
  if (driveMatch) {
    prefix = driveMatch[1];
    cleaned = driveMatch[2];
  } else if (cleaned.startsWith('//')) {
    // UNC root
    prefix = '//';
    cleaned = cleaned.slice(2);
  } else if (cleaned.startsWith('/')) {
    prefix = '/';
    cleaned = cleaned.slice(1);
  }

  const rawSegments = cleaned.split('/');
  const safeSegments = [];

  for (const raw of rawSegments) {
    let seg = raw.trim();
    if (!seg || seg === '.') continue;
    if (seg === '..') {
      // Skip traversal segments
      continue;
    }

    // Sanitize illegal chars
    seg = seg.replace(/[<>:"|?*]/g, replacement);

    // If reserved Windows name, prefix or suffix to neutralize
    if (isWindowsReservedName(seg)) {
      seg = `${replacement}${seg}`;
    }

    // Strip trailing dots and spaces (Windows issue)
    seg = seg.replace(/[. ]+$/, '');

    if (seg) {
      safeSegments.push(seg);
    }
  }

  const sep = separator === 'win32' ? '\\' : separator === 'native' ? (process.platform === 'win32' ? '\\' : '/') : '/';
  const joined = safeSegments.join(sep);

  if (!prefix) {
    return joined || '.';
  }

  if (prefix.endsWith(':')) {
    return joined ? `${prefix}${sep}${joined}` : `${prefix}${sep}`;
  }

  if (prefix === '//') {
    return joined ? `${sep}${sep}${joined}` : `${sep}${sep}`;
  }

  return joined ? `${sep}${joined}` : sep;
}
