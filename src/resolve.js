import { normalize } from './normalize.js';
import { isWithin } from './compare.js';
import { hasNullByte, isWindowsReservedName, checkSafePath } from './security.js';
import { InvalidPathError, PathTraversalError, RootBreakoutError } from './errors.js';

/**
 * Safely resolves an untrusted path against a base/root directory,
 * preventing directory traversal attacks, root breakout, and reserved device abuse.
 *
 * @param {string} basePath Trusted directory root
 * @param {string} untrustedPath Untrusted relative or absolute path input
 * @param {object} [options]
 * @param {boolean} [options.allowOutside=false] Allow resolving outside base root
 * @param {boolean} [options.allowAbsolute=false] Allow absolute paths as untrusted input
 * @param {boolean} [options.treatAbsoluteAsRelative=false] Strip root/drive and treat as relative
 * @param {boolean} [options.checkReservedNames=true] Reject Windows reserved names (CON, NUL, AUX, etc.)
 * @param {'posix'|'win32'|'native'} [options.separator='posix']
 * @param {'auto'|'sensitive'|'insensitive'} [options.casePolicy='auto']
 * @param {'auto'|'win32'|'posix'} [options.platform='auto']
 * @param {boolean} [options.throwOnError=true] Whether to throw or return null on failure
 * @returns {string|null} Resolved safe path or null if throwOnError is false
 */
export function resolveSafe(basePath, untrustedPath, options = {}) {
  const {
    allowOutside = false,
    allowAbsolute = false,
    treatAbsoluteAsRelative = false,
    checkReservedNames = true,
    separator = 'posix',
    casePolicy = 'auto',
    platform = 'auto',
    throwOnError = true,
  } = options;

  function fail(ErrorClass, message, code) {
    if (throwOnError) {
      throw new ErrorClass(message, { code, basePath, untrustedPath });
    }
    return null;
  }

  if (typeof basePath !== 'string') {
    return fail(InvalidPathError, 'Base path must be a string', 'ERR_INVALID_BASE');
  }

  if (typeof untrustedPath !== 'string') {
    return fail(InvalidPathError, 'Untrusted path must be a string', 'ERR_INVALID_PATH');
  }

  if (hasNullByte(basePath) || hasNullByte(untrustedPath)) {
    return fail(PathTraversalError, 'Path contains forbidden null byte', 'ERR_NULL_BYTE');
  }

  let cleanUntrusted = untrustedPath.trim();

  // Normalize slashes for analysis
  const normalizedSlashes = cleanUntrusted.replace(/\\/g, '/');

  // Detect if untrusted path is absolute (POSIX /..., Windows C:/..., or UNC //...)
  const isPosixAbsolute = normalizedSlashes.startsWith('/');
  const isWinDrive = /^[a-zA-Z]:/.test(cleanUntrusted);
  const isUNC = /^[\/\\]{2}/.test(cleanUntrusted);
  const isAbsolute = isPosixAbsolute || isWinDrive || isUNC;

  if (isAbsolute) {
    if (treatAbsoluteAsRelative) {
      // Strip leading drive letter or leading slashes
      cleanUntrusted = normalizedSlashes
        .replace(/^[a-zA-Z]:/, '')
        .replace(/^\/+/, '');
    } else if (!allowAbsolute) {
      return fail(
        RootBreakoutError,
        `Untrusted path "${untrustedPath}" is absolute and not allowed`,
        'ERR_ABSOLUTE_NOT_ALLOWED'
      );
    }
  }

  // Check safe path tokens
  const safeCheck = checkSafePath(cleanUntrusted, {
    platform,
    allowAbsolute: allowAbsolute || treatAbsoluteAsRelative,
    checkReservedNames,
  });

  if (!safeCheck.safe) {
    if (safeCheck.code === 'ERR_WINDOWS_RESERVED_NAME') {
      return fail(InvalidPathError, safeCheck.reason, safeCheck.code);
    }
    return fail(RootBreakoutError, safeCheck.reason, safeCheck.code);
  }

  // Join basePath and cleanUntrusted
  const normBase = normalize(basePath, { separator: 'posix', trailingSlash: 'strip', platform });
  let candidate;

  if (isAbsolute && !treatAbsoluteAsRelative) {
    candidate = normalize(cleanUntrusted, { separator: 'posix', trailingSlash: 'preserve', platform });
  } else {
    const combined = normBase === '.' || normBase === ''
      ? cleanUntrusted
      : `${normBase}/${cleanUntrusted}`;
    candidate = normalize(combined, { separator: 'posix', trailingSlash: 'preserve', platform });
  }

  // Root breakout verification
  if (!allowOutside) {
    const isInside = isWithin(normBase, candidate, { casePolicy, allowEqual: true, platform });
    if (!isInside) {
      return fail(
        RootBreakoutError,
        `Path traversal detected: "${untrustedPath}" escapes base directory "${basePath}"`,
        'ERR_ROOT_BREAKOUT'
      );
    }
  }

  // Windows reserved device check on all candidate segments
  if (checkReservedNames) {
    const segments = candidate.replace(/^[a-zA-Z]:\/?/, '').split('/').filter(Boolean);
    for (const seg of segments) {
      if (isWindowsReservedName(seg)) {
        return fail(
          InvalidPathError,
          `Path segment "${seg}" contains a Windows reserved device name`,
          'ERR_WINDOWS_RESERVED_NAME'
        );
      }
    }
  }

  return normalize(candidate, { separator });
}

/**
 * Safe resolve returning a result object instead of throwing.
 *
 * @param {string} basePath
 * @param {string} untrustedPath
 * @param {object} [options]
 * @returns {{ success: boolean, path?: string, error?: Error }}
 */
export function tryResolveSafe(basePath, untrustedPath, options = {}) {
  try {
    const resolved = resolveSafe(basePath, untrustedPath, { ...options, throwOnError: true });
    return { success: true, path: resolved };
  } catch (err) {
    return { success: false, error: err };
  }
}
