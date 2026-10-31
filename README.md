# pathsafe

> Zero-dependency, pure ESM cross-platform path normalization, comparison, and traversal security library & CLI for Node.js.

[![CI](https://github.com/YusufBeratZengin/pathsafe/actions/workflows/ci.yml/badge.svg)](https://github.com/YusufBeratZengin/pathsafe/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg)](https://nodejs.org)

`pathsafe` provides deterministic, security-first path utilities designed to handle differences between Windows and POSIX operating systems. It defends against path traversal attacks, root breakouts, NTFS Alternate Data Streams, Windows reserved device collisions (`CON`, `PRN`, `AUX`, `NUL`), and null-byte injection.

---

## Features

- **Zero Runtime Dependencies**: Built entirely with Node.js built-ins.
- **Pure ECMAScript Module (ESM)**: Native `import` support for modern Node.js applications.
- **Cross-Platform Parity**: Normalizes and compares Windows (`\`) and POSIX (`/`) paths seamlessly on any host operating system.
- **Path Traversal & Root Breakout Defense**: Validates and confines untrusted inputs within trusted root directories (`resolveSafe`).
- **Device & Stream Protection**: Detects Windows reserved device names (`CON`, `NUL`, `AUX`, `COM1-9`, `LPT1-9`) and NTFS ADS injection (`:`).
- **Flexible Case Policies**: Configurable case handling (`auto`, `sensitive`, `insensitive`, `preserve`, `lower`, `upper`).
- **Complete CLI & Library Parity**: Every library feature is available via the command-line interface with standard exit codes and `--json` support.

---

## Installation

```bash
# Install locally
npm install pathsafe

# Or run CLI directly via npx
npx pathsafe --help
```

---

## Quickstart

### Library

```javascript
import {
  normalize,
  resolveSafe,
  areEqual,
  isWithin,
  checkSafePath,
  sanitize,
} from 'pathsafe';

// 1. Cross-platform separator normalization
normalize('a///b\\\\c/../d');
// => "a/b/d"

// 2. Safe resolution confining untrusted input within a base directory
try {
  const safePath = resolveSafe('/var/www', '../../etc/passwd');
} catch (err) {
  console.error(err.name); // "RootBreakoutError"
  console.error(err.code); // "ERR_ROOT_BREAKOUT"
}

// 3. Semantic comparison with case policies
areEqual('C:\\Foo\\Bar', 'c:/foo/bar', { casePolicy: 'insensitive' });
// => true

// 4. Boundary and subpath checks
isWithin('/var/www', '/var/www/site/index.html');
// => true
isWithin('/var/www', '/var/www-secret');
// => false (safely checks path boundary)

// 5. Sanitize dangerous paths
sanitize('dirty/../bad<file>:stream.txt');
// => "dirty/bad_file_stream.txt"
```

---

## CLI Usage

```bash
pathsafe <command> [arguments] [options]
```

### Commands

| Command | Description |
| :--- | :--- |
| `normalize <path>` | Normalize separators, redundant slashes, and dot-segments |
| `resolve <base> <untrusted>` | Safely resolve untrusted path inside base root |
| `check <path>` | Inspect path for traversal, reserved names, and dangerous characters |
| `compare <pathA> <pathB>` | Check two paths for semantic equality |
| `contains <parent> <child>` | Check if parent path contains child path |
| `sanitize <path>` | Strip traversal sequences and illegal characters |

### CLI Options

- `--to <posix|win32|native>`: Target separator style (default: `posix`).
- `--case <preserve|lower|upper|driveUpper|auto|sensitive|insensitive>`: Case transformation policy.
- `--trailing <preserve|strip|force>`: Trailing slash policy.
- `--allow-outside`: Allow resolving outside base directory.
- `--allow-absolute`: Allow absolute paths as untrusted input.
- `--treat-as-relative`: Strip root/drive from untrusted path and treat as relative.
- `--platform <auto|win32|posix>`: Explicit platform context.
- `--json`: Output machine-readable JSON.
- `-v, --version`: Print version.
- `-h, --help`: Print help.

### Exit Codes

- `0`: Success / Safe / Equal / Contained.
- `1`: Unsafe / Not Equal / Not Contained / Traversal Violation.
- `2`: Invalid Arguments / CLI Error.

### CLI Examples

```bash
# Normalize mixed slashes
pathsafe normalize "foo\\bar//baz/../qux"
# => foo/bar/qux

# Check for path traversal attacks
pathsafe check "../../etc/shadow"
# => UNSAFE: Path contains directory traversal (..) (ERR_PATH_TRAVERSAL)
# Exit code: 1

# Machine-readable output
pathsafe resolve /var/www safe/index.html --json
# Output:
# {
#   "success": true,
#   "base": "/var/www",
#   "untrusted": "safe/index.html",
#   "resolved": "/var/www/safe/index.html"
# }
```

---

## API Reference

### `normalize(inputPath, [options])`

Normalizes a path string across Windows and POSIX systems.

- **Options**:
  - `separator`: `'posix'` (`/`), `'win32'` (`\`), or `'native'` (default: `'posix'`).
  - `casePolicy`: `'preserve'`, `'lower'`, `'upper'`, or `'driveUpper'` (default: `'preserve'`).
  - `trailingSlash`: `'preserve'`, `'strip'`, or `'force'` (default: `'preserve'`).
  - `allowEmpty`: `boolean` (default: `false` -> returns `.` when empty).
  - `platform`: `'auto'`, `'win32'`, or `'posix'` (default: `'auto'`).

### `resolveSafe(basePath, untrustedPath, [options])`

Safely resolves an untrusted path against a trusted root/base directory.

- **Options**:
  - `allowOutside`: `boolean` (default: `false`). Throws `RootBreakoutError` if path escapes base.
  - `allowAbsolute`: `boolean` (default: `false`). Rejects absolute inputs unless allowed.
  - `treatAbsoluteAsRelative`: `boolean` (default: `false`). Strips leading root/drive to resolve safely inside base.
  - `checkReservedNames`: `boolean` (default: `true`). Rejects Windows reserved device names (`CON`, `PRN`, `AUX`, `NUL`, `COM1-9`, `LPT1-9`).
  - `separator`: `'posix'`, `'win32'`, or `'native'` (default: `'posix'`).
  - `casePolicy`: `'auto'`, `'sensitive'`, or `'insensitive'` (default: `'auto'`).
  - `throwOnError`: `boolean` (default: `true`). Returns `null` on failure when set to `false`.

### `tryResolveSafe(basePath, untrustedPath, [options])`

Non-throwing alternative to `resolveSafe`. Returns `{ success: true, path }` or `{ success: false, error }`.

### `areEqual(pathA, pathB, [options])`

Compares two paths for semantic equivalence, taking into account separator differences, redundant slashes, and case policies.

### `isWithin(basePath, targetPath, [options])`

Checks whether `targetPath` resides within `basePath`. Avoids partial prefix matching bugs (e.g. `/base` does not match `/base-dir`).
Alias: `contains`.

### `isSubpath(parentPath, childPath, [options])`

Strict check whether `childPath` is inside `parentPath` (excluding exact equality).

### `relative(basePath, targetPath, [options])`

Computes the relative path from `basePath` to `targetPath`. Throws `InvalidPathError` if target is outside base unless `allowOutside: true` is passed.

### `checkSafePath(inputPath, [options])`

Inspects a path for null bytes, directory traversal patterns, and reserved names. Returns `{ safe: boolean, reason?: string, code?: string }`.

### `isSafePath(inputPath, [options])`

Returns `true` if the path contains no traversal, null-bytes, or forbidden device names.

### `assertSafePath(inputPath, [options])`

Throws `PathTraversalError` or `InvalidPathError` if the path is unsafe.

### `sanitize(inputPath, [options])`

Sanitizes dangerous paths by stripping traversal patterns, null bytes, and illegal characters.

---

## Security Error Hierarchy

```
Error
├── InvalidPathError (code: 'ERR_INVALID_PATH')
└── PathTraversalError (code: 'ERR_PATH_TRAVERSAL')
    └── RootBreakoutError (code: 'ERR_ROOT_BREAKOUT')
```

---

## License

[MIT](LICENSE) © 2026 Yusuf Berat Zengin
