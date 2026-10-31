#!/usr/bin/env node

import {
  normalize,
  resolveSafe,
  checkSafePath,
  areEqual,
  isWithin,
  sanitize,
} from '../src/index.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function getVersion() {
  try {
    const pkg = JSON.parse(readFileSync(join(__dirname, '../package.json'), 'utf8'));
    return pkg.version;
  } catch {
    return '1.0.0';
  }
}

function printHelp() {
  console.log(`
pathsafe - Cross-platform path normalization, comparison & traversal security CLI

Usage:
  pathsafe <command> [arguments] [options]

Commands:
  normalize <path>              Normalize separators, dots, and trailing slashes
  resolve <base> <untrusted>    Safely resolve untrusted path within base root
  check <path>                  Inspect path for traversal, reserved names & safety
  compare <pathA> <pathB>       Compare paths for semantic equality
  contains <parent> <child>     Check if parent contains child path
  sanitize <path>               Strip traversal sequences and illegal characters

Options:
  --to <posix|win32|native>     Output separator style (default: posix)
  --case <policy>               Case policy: preserve|lower|upper|driveUpper|auto|sensitive|insensitive
  --trailing <policy>           Trailing slash policy: preserve|strip|force
  --allow-outside               Allow resolving outside base directory
  --allow-absolute              Allow absolute paths as untrusted input
  --treat-as-relative           Strip root/drive from untrusted path and treat as relative
  --platform <auto|win32|posix> Explicit platform context
  --json                        Output result as JSON
  -v, --version                 Show version number
  -h, --help                    Show this help message

Exit Codes:
  0 - Success / Safe / Equal / Contained
  1 - Unsafe / Not Equal / Not Contained / Traversal Violation
  2 - Invalid Arguments / CLI Error
`);
}

function parseArgs(args) {
  const flags = {};
  const positional = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '-h' || arg === '--help') {
      flags.help = true;
    } else if (arg === '-v' || arg === '--version') {
      flags.version = true;
    } else if (arg === '--json') {
      flags.json = true;
    } else if (arg === '--allow-outside') {
      flags.allowOutside = true;
    } else if (arg === '--allow-absolute') {
      flags.allowAbsolute = true;
    } else if (arg === '--treat-as-relative') {
      flags.treatAsRelative = true;
    } else if (arg === '--to') {
      flags.to = args[++i];
    } else if (arg.startsWith('--to=')) {
      flags.to = arg.slice(5);
    } else if (arg === '--case') {
      flags.case = args[++i];
    } else if (arg.startsWith('--case=')) {
      flags.case = arg.slice(7);
    } else if (arg === '--trailing') {
      flags.trailing = args[++i];
    } else if (arg.startsWith('--trailing=')) {
      flags.trailing = arg.slice(11);
    } else if (arg === '--platform') {
      flags.platform = args[++i];
    } else if (arg.startsWith('--platform=')) {
      flags.platform = arg.slice(11);
    } else if (arg === '--replacement') {
      flags.replacement = args[++i];
    } else if (arg.startsWith('--replacement=')) {
      flags.replacement = arg.slice(14);
    } else if (arg.startsWith('-')) {
      flags[arg.replace(/^-+/, '')] = true;
    } else {
      positional.push(arg);
    }
  }

  return { flags, positional };
}

export function runCLI(argv = process.argv.slice(2)) {
  const { flags, positional } = parseArgs(argv);

  if (flags.help || (positional.length === 0 && !flags.version)) {
    printHelp();
    return 0;
  }

  if (flags.version) {
    console.log(getVersion());
    return 0;
  }

  const command = positional[0];

  try {
    switch (command) {
      case 'normalize': {
        const inputPath = positional[1];
        if (typeof inputPath === 'undefined') {
          console.error('Error: "normalize" command requires a <path> argument');
          return 2;
        }

        const normalized = normalize(inputPath, {
          separator: flags.to || 'posix',
          casePolicy: flags.case || 'preserve',
          trailingSlash: flags.trailing || 'preserve',
          platform: flags.platform || 'auto',
        });

        if (flags.json) {
          console.log(JSON.stringify({ input: inputPath, normalized }, null, 2));
        } else {
          console.log(normalized);
        }
        return 0;
      }

      case 'resolve': {
        const base = positional[1];
        const untrusted = positional[2];
        if (typeof base === 'undefined' || typeof untrusted === 'undefined') {
          console.error('Error: "resolve" command requires <base> and <untrusted> arguments');
          return 2;
        }

        try {
          const resolved = resolveSafe(base, untrusted, {
            allowOutside: Boolean(flags.allowOutside),
            allowAbsolute: Boolean(flags.allowAbsolute),
            treatAbsoluteAsRelative: Boolean(flags.treatAsRelative),
            separator: flags.to || 'posix',
            casePolicy: flags.case || 'auto',
            platform: flags.platform || 'auto',
          });

          if (flags.json) {
            console.log(JSON.stringify({ success: true, base, untrusted, resolved }, null, 2));
          } else {
            console.log(resolved);
          }
          return 0;
        } catch (err) {
          if (flags.json) {
            console.log(JSON.stringify({
              success: false,
              base,
              untrusted,
              error: err.message,
              code: err.code || 'ERR_RESOLVE_FAILED',
            }, null, 2));
          } else {
            console.error(`Error: ${err.message}`);
          }
          return 1;
        }
      }

      case 'check':
      case 'is-safe': {
        const inputPath = positional[1];
        if (typeof inputPath === 'undefined') {
          console.error('Error: "check" command requires a <path> argument');
          return 2;
        }

        const result = checkSafePath(inputPath, {
          platform: flags.platform || 'auto',
          allowAbsolute: Boolean(flags.allowAbsolute),
        });

        if (flags.json) {
          console.log(JSON.stringify({ path: inputPath, ...result }, null, 2));
        } else {
          if (result.safe) {
            console.log(`SAFE: "${inputPath}" is safe`);
          } else {
            console.log(`UNSAFE: ${result.reason} (${result.code})`);
          }
        }
        return result.safe ? 0 : 1;
      }

      case 'compare': {
        const pathA = positional[1];
        const pathB = positional[2];
        if (typeof pathA === 'undefined' || typeof pathB === 'undefined') {
          console.error('Error: "compare" command requires <pathA> and <pathB> arguments');
          return 2;
        }

        const equal = areEqual(pathA, pathB, {
          casePolicy: flags.case || 'auto',
          platform: flags.platform || 'auto',
        });

        if (flags.json) {
          console.log(JSON.stringify({ pathA, pathB, equal }, null, 2));
        } else {
          console.log(equal ? 'EQUAL' : 'NOT_EQUAL');
        }
        return equal ? 0 : 1;
      }

      case 'contains': {
        const parent = positional[1];
        const child = positional[2];
        if (typeof parent === 'undefined' || typeof child === 'undefined') {
          console.error('Error: "contains" command requires <parent> and <child> arguments');
          return 2;
        }

        const inside = isWithin(parent, child, {
          casePolicy: flags.case || 'auto',
          platform: flags.platform || 'auto',
        });

        if (flags.json) {
          console.log(JSON.stringify({ parent, child, contains: inside }, null, 2));
        } else {
          console.log(inside ? 'CONTAINS' : 'NOT_CONTAINS');
        }
        return inside ? 0 : 1;
      }

      case 'sanitize': {
        const inputPath = positional[1];
        if (typeof inputPath === 'undefined') {
          console.error('Error: "sanitize" command requires a <path> argument');
          return 2;
        }

        const sanitized = sanitize(inputPath, {
          separator: flags.to || 'posix',
          replacement: flags.replacement || '_',
        });

        if (flags.json) {
          console.log(JSON.stringify({ input: inputPath, sanitized }, null, 2));
        } else {
          console.log(sanitized);
        }
        return 0;
      }

      default:
        console.error(`Unknown command: "${command}". Run "pathsafe --help" for usage.`);
        return 2;
    }
  } catch (err) {
    if (flags.json) {
      console.log(JSON.stringify({ error: err.message, stack: err.stack }, null, 2));
    } else {
      console.error(`Error: ${err.message}`);
    }
    return 2;
  }
}

// Execute if run directly from CLI
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const code = runCLI();
  if (code !== 0) {
    process.exit(code);
  }
}
