import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { createNpmInvocation } from '../src/process/npm.js';

const root = join(import.meta.dirname, '..');
const packageJson = JSON.parse(
  readFileSync(join(root, 'package.json'), 'utf8'),
) as { name: string; version: string };

function runPackDryRun(command?: string, args?: readonly string[]) {
  const invocation = createNpmInvocation(
    args ?? ['pack', '--dry-run', '--json'],
  );
  const result = spawnSync(
    command ?? invocation.command,
    command ? (args ?? []) : invocation.args,
    {
      cwd: root,
      encoding: 'utf8',
      shell: false,
    },
  );
  if (result.error || result.status !== 0) {
    throw new Error(
      `npm pack --dry-run failed: ${result.error?.message || result.stderr || result.stdout || 'unknown spawn failure'}`,
    );
  }
  const [entry] = JSON.parse(result.stdout) as Array<{
    name: string;
    version: string;
    files: Array<{ path: string }>;
  }>;
  if (!entry) throw new Error('npm pack --dry-run returned no package entry.');
  return entry;
}

// SW-110: deterministic snapshot of what `npm pack --dry-run` would publish.
describe('npm pack content snapshot', () => {
  it('includes only intended publish artifacts and excludes dev-only paths', () => {
    const entry = runPackDryRun();
    const paths = entry.files.map((file) => file.path);

    expect(paths.some((path) => path.startsWith('dist/'))).toBe(true);
    expect(paths.some((path) => path.startsWith('templates/'))).toBe(true);
    expect(paths).toContain('package.json');

    for (const path of paths) {
      expect(path.startsWith('tests/')).toBe(false);
      expect(path.startsWith('.github/')).toBe(false);
      const basename = path.split('/').at(-1) ?? '';
      expect(
        basename === '.env.example' || !/^\.env(?:\..*)?$/.test(basename),
      ).toBe(true);
      expect(path).not.toBe('.npmrc');
    }
  });

  // SW-145: regression guard for the Smart Contract template publish artifact.
  // Confirms every required source file is present in the published package.
  //
  // templates/smart-contract/gitignore (no leading dot) is the renamed form of
  // .gitignore. npm-packlist always excludes .gitignore files regardless of the
  // package.json files field, so the file was renamed to avoid that exclusion.
  // template-generation.ts maps it back to .gitignore in generated projects.
  it('includes every required Smart Contract template file (SW-145)', () => {
    const entry = runPackDryRun();
    const paths = entry.files.map((file) => file.path);

    expect(paths).toContain('templates/smart-contract/Cargo.toml');
    expect(paths).toContain(
      'templates/smart-contract/contracts/hello/Cargo.toml',
    );
    expect(paths).toContain(
      'templates/smart-contract/contracts/hello/src/lib.rs',
    );
    expect(paths).toContain(
      'templates/smart-contract/contracts/hello/src/test.rs',
    );
    expect(paths).toContain('templates/smart-contract/README.md');
    expect(paths).toContain('templates/smart-contract/gitignore');
  });
});

// SW-111: asserts package identity/version on the dry-run artifact itself,
// and that inspecting it never performs a registry publish.
describe('release dry-run artifact assertions', () => {
  it('reports the expected package identity and version, with no publish side effect', () => {
    const entry = runPackDryRun();

    expect(entry.name).toBe(packageJson.name);
    expect(entry.version).toBe(packageJson.version);
    // `--dry-run` is what guarantees no registry publication occurs here;
    // this asserts the flag stays present in the release script contract.
    const releaseDryRunScript = (
      JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
        scripts: Record<string, string>;
      }
    ).scripts['release:dry-run'];
    expect(releaseDryRunScript).toContain('--dry-run');
  });

  it('fails actionably when the dry-run command itself is misconfigured', () => {
    expect(() =>
      runPackDryRun('stellarforge-command-that-does-not-exist'),
    ).toThrow(/npm pack --dry-run failed: .*ENOENT/i);
  });
});
