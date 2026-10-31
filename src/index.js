/**
 * pathsafe - Zero-dependency cross-platform path normalization, comparison,
 * and traversal security library for Node.js.
 */

export {
  normalize,
  toPosix,
  toWin32,
  toNative,
} from './normalize.js';

export {
  resolveSafe,
  tryResolveSafe,
} from './resolve.js';

export {
  areEqual,
  isWithin,
  isSubpath,
  contains,
  relative,
} from './compare.js';

export {
  detectTraversal,
  checkSafePath,
  isSafePath,
  assertSafePath,
  sanitize,
  hasNullByte,
  isWindowsReservedName,
  hasIllegalWindowsChars,
} from './security.js';

export {
  PathTraversalError,
  RootBreakoutError,
  InvalidPathError,
} from './errors.js';
