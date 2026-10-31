/**
 * Custom error thrown when a path traversal attempt is detected.
 */
export class PathTraversalError extends Error {
  /**
   * @param {string} message
   * @param {object} [details]
   */
  constructor(message, details = {}) {
    super(message);
    this.name = 'PathTraversalError';
    this.code = 'ERR_PATH_TRAVERSAL';
    this.details = details;
  }
}

/**
 * Custom error thrown when a resolved path escapes its designated root/base directory.
 */
export class RootBreakoutError extends PathTraversalError {
  /**
   * @param {string} message
   * @param {object} [details]
   */
  constructor(message, details = {}) {
    super(message, details);
    this.name = 'RootBreakoutError';
    this.code = 'ERR_ROOT_BREAKOUT';
  }
}

/**
 * Custom error thrown when an input path is malformed or contains invalid characters/device names.
 */
export class InvalidPathError extends Error {
  /**
   * @param {string} message
   * @param {object} [details]
   */
  constructor(message, details = {}) {
    super(message);
    this.name = 'InvalidPathError';
    this.code = 'ERR_INVALID_PATH';
    this.details = details;
  }
}
