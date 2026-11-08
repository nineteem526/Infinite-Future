#!/usr/bin/env node
/**
 * Cross-platform regression-check runner.
 *
 * Bundles a TypeScript check entry with the project's locally installed
 * rolldown CLI into a temporary directory, then executes it with Node. No
 * network access and no dependencies outside node_modules are used.
 *
 * Usage: node src/dev/runCheck.mjs [src/dev/causalityCheck.ts]
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const cwd = process.cwd();
const entry = process.argv[2] ?? 'src/dev/causalityCheck.ts';
const rolldownCli = resolve(cwd, 'node_modules', 'rolldown', 'bin', 'cli.mjs');
const outDir = mkdtempSync(join(tmpdir(), 'infinite-future-check-'));
const outFile = join(outDir, 'check.mjs');

let status = 1;
try {
  const bundle = spawnSync(
    process.execPath,
    [rolldownCli, entry, '-o', outFile, '-f', 'esm', '-p', 'node'],
    { cwd, stdio: 'inherit' },
  );
  if (bundle.status !== 0) {
    status = bundle.status ?? 1;
  } else {
    const run = spawnSync(process.execPath, [outFile], { cwd, stdio: 'inherit' });
    status = run.status ?? 1;
  }
} finally {
  rmSync(outDir, { recursive: true, force: true });
}

process.exit(status);
