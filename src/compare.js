import { normalize } from './normalize.js';
import { hasNullByte } from './security.js';
import { InvalidPathError } from './errors.js';

/**
 * Determines whether the comparison should be case-sensitive.
 * @param {'auto'|'sensitive'|'insensitive'} policy
 * @param {string} pathA
 * @param {string} pathB
 * @param {'auto'|'win32'|'posix'} platform
 * @returns {boolean}
 */
function isCaseSensitive(policy, pathA, pathB, platform) {
  if (policy === 'sensitive') return true;
  if (policy === 'insensitive') return false;

  // policy === 'auto'
  if (platform === 'win32') return false;
  if (platform === 'posix') return true;

  // Auto detect: if either has a Windows drive or UNC, or OS is Windows
  const hasWinIndicator = /^[a-zA-Z]:|[\\\/]{2}/.test(pathA) || /^[a-zA-Z]:|[\\\/]{2}/.test(pathB);
  if (hasWinIndicator || process.platform === 'win32') {
    return false;
  }
  return true;
}

/**
 * Compares two paths for semantic equivalence.
 *
 * @param {string} pathA
 * @param {string} pathB
 * @param {object} [options]
 * @param {'auto'|'sensitive'|'insensitive'} [options.casePolicy='auto']
 * @param {'auto'|'win32'|'posix'} [options.platform='auto']
 * @returns {boolean}
 */
export function areEqual(pathA, pathB, options = {}) {
  const { casePolicy = 'auto', platform = 'auto' } = options;

  if (typeof pathA !== 'string' || typeof pathB !== 'string') {
    return false;
  }

  if (hasNullByte(pathA) || hasNullByte(pathB)) {
    return false;
  }

  const normA = normalize(pathA, { separator: 'posix', trailingSlash: 'strip', platform });
  const normB = normalize(pathB, { separator: 'posix', trailingSlash: 'strip', platform });

  const sensitive = isCaseSensitive(casePolicy, normA, normB, platform);

  if (sensitive) {
    return normA === normB;
  }
  return normA.toLowerCase() === normB.toLowerCase();
}

/**
 * Checks if a target path is inside (or optionally equal to) a base path.
 *
 * @param {string} basePath
 * @param {string} targetPath
 * @param {object} [options]
 * @param {'auto'|'sensitive'|'insensitive'} [options.casePolicy='auto']
 * @param {boolean} [options.allowEqual=true] Whether exact match with base is considered "within"
 * @param {'auto'|'win32'|'posix'} [options.platform='auto']
 * @returns {boolean}
 */
export function isWithin(basePath, targetPath, options = {}) {
  const {
    casePolicy = 'auto',
    allowEqual = true,
    platform = 'auto',
  } = options;

  if (typeof basePath !== 'string' || typeof targetPath !== 'string') {
    return false;
  }

  if (hasNullByte(basePath) || hasNullByte(targetPath)) {
    return false;
  }

  const normBase = normalize(basePath, { separator: 'posix', trailingSlash: 'strip', platform });
  const normTarget = normalize(targetPath, { separator: 'posix', trailingSlash: 'strip', platform });

  const sensitive = isCaseSensitive(casePolicy, normBase, normTarget, platform);

  const baseToCompare = sensitive ? normBase : normBase.toLowerCase();
  const targetToCompare = sensitive ? normTarget : normTarget.toLowerCase();

  // Check drive letter compatibility on Windows
  const baseDriveMatch = baseToCompare.match(/^([a-z]:)/);
  const targetDriveMatch = targetToCompare.match(/^([a-z]:)/);

  if (baseDriveMatch || targetDriveMatch) {
    if (!baseDriveMatch || !targetDriveMatch) {
      // One has drive letter, one does not
      return false;
    }
    if (baseDriveMatch[1] !== targetDriveMatch[1]) {
      // Different drives (e.g. C: vs D:)
      return false;
    }
  }

  if (baseToCompare === targetToCompare) {
    return allowEqual;
  }

  // Ensure boundary check with trailing separator
  const baseWithSlash = baseToCompare.endsWith('/') ? baseToCompare : `${baseToCompare}/`;

  return targetToCompare.startsWith(baseWithSlash);
}

/**
 * Checks if childPath is strictly a subpath of parentPath (excluding equal).
 *
 * @param {string} parentPath
 * @param {string} childPath
 * @param {object} [options]
 * @returns {boolean}
 */
export function isSubpath(parentPath, childPath, options = {}) {
  return isWithin(parentPath, childPath, { ...options, allowEqual: false });
}

/**
 * Alias for isWithin.
 */
export const contains = isWithin;

/**
 * Computes the relative path from basePath to targetPath safely.
 *
 * @param {string} basePath
 * @param {string} targetPath
 * @param {object} [options]
 * @param {'posix'|'win32'|'native'} [options.separator='posix']
 * @param {boolean} [options.allowOutside=false]
 * @param {'auto'|'sensitive'|'insensitive'} [options.casePolicy='auto']
 * @returns {string} Relative path
 */
export function relative(basePath, targetPath, options = {}) {
  const {
    separator = 'posix',
    allowOutside = false,
    casePolicy = 'auto',
  } = options;

  if (typeof basePath !== 'string' || typeof targetPath !== 'string') {
    throw new InvalidPathError('Both basePath and targetPath must be strings');
  }

  const normBase = normalize(basePath, { separator: 'posix', trailingSlash: 'strip' });
  const normTarget = normalize(targetPath, { separator: 'posix', trailingSlash: 'strip' });

  if (!allowOutside && !isWithin(normBase, normTarget, { casePolicy, allowEqual: true })) {
    throw new InvalidPathError(`Target path "${targetPath}" is outside base directory "${basePath}"`);
  }

  const sensitive = isCaseSensitive(casePolicy, normBase, normTarget, 'auto');

  const baseParts = normBase === '.' || normBase === '' ? [] : normBase.split('/').filter(Boolean);
  const targetParts = normTarget === '.' || normTarget === '' ? [] : normTarget.split('/').filter(Boolean);

  let commonLength = 0;
  const maxCommon = Math.min(baseParts.length, targetParts.length);

  for (let i = 0; i < maxCommon; i++) {
    const b = sensitive ? baseParts[i] : baseParts[i].toLowerCase();
    const t = sensitive ? targetParts[i] : targetParts[i].toLowerCase();
    if (b === t) {
      commonLength++;
    } else {
      break;
    }
  }

  const upCount = baseParts.length - commonLength;
  const relativeParts = [];

  for (let i = 0; i < upCount; i++) {
    relativeParts.push('..');
  }

  for (let i = commonLength; i < targetParts.length; i++) {
    relativeParts.push(targetParts[i]);
  }

  const result = relativeParts.length > 0 ? relativeParts.join('/') : '.';

  return normalize(result, { separator });
}
