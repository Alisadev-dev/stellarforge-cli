import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ValidationCliError } from '../src/errors/errors.js';
import { generateProjectFromTemplate } from '../src/generator/template-generation.js';
import type { GenerationContext } from '../src/generator/types.js';
import { withTempDirectory } from './helpers/index.js';

function context(root: string): GenerationContext {
  return {
    input: {
      projectName: 'demo-app',
      cwd: root,
      templateId: 'basic-app',
    },
    destination: {
      projectName: 'demo-app',
      destination: join(root, 'demo-app'),
    },
    template: {
      templateId: 'basic-app',
    },
  };
}

describe('template generation', () => {
  it('copies trusted files and performs only allowlisted deterministic substitutions', () =>
    withTempDirectory((root) => {
      const templateRoot = join(root, 'template');
      mkdirSync(join(templateRoot, 'src'), { recursive: true });
      writeFileSync(
        join(templateRoot, 'package.json'),
        '{"name":"{{projectName}}","template":"{{templateId}}"}\n',
      );
      writeFileSync(
        join(templateRoot, 'src', 'index.ts'),
        'export const app = "{{projectName}}";\n',
      );

      const result = generateProjectFromTemplate(context(root), {
        templateRoot,
      });

      expect(result).toEqual({
        projectName: 'demo-app',
        destination: join(root, 'demo-app'),
        templateId: 'basic-app',
      });
      expect(readFileSync(join(root, 'demo-app', 'package.json'), 'utf8')).toBe(
        '{"name":"demo-app","template":"basic-app"}\n',
      );
      expect(
        readFileSync(join(root, 'demo-app', 'src', 'index.ts'), 'utf8'),
      ).toBe('export const app = "demo-app";\n');
    }));

  it('preserves binary file bytes without substitution', () =>
    withTempDirectory((root) => {
      const templateRoot = join(root, 'template');
      mkdirSync(templateRoot);
      const binary = Buffer.from([
        0, 123, 123, 112, 114, 111, 106, 101, 99, 116, 78, 97, 109, 101, 125,
        125, 255,
      ]);
      writeFileSync(join(templateRoot, 'asset.bin'), binary);

      generateProjectFromTemplate(context(root), { templateRoot });

      expect(readFileSync(join(root, 'demo-app', 'asset.bin'))).toEqual(binary);
    }));

  it('cleans staging output and leaves no partial project when rendering fails', () =>
    withTempDirectory((root) => {
      const templateRoot = join(root, 'template');
      mkdirSync(templateRoot);
      writeFileSync(join(templateRoot, 'a-good.txt'), 'created first');
      writeFileSync(join(templateRoot, 'z-bad.txt'), '{{unsupportedToken}}');

      expect(() =>
        generateProjectFromTemplate(context(root), { templateRoot }),
      ).toThrow(
        "Template contains unsupported substitution token '{{unsupportedToken}}'.",
      );

      expect(existsSync(join(root, 'demo-app'))).toBe(false);
      expect(
        readdirSync(root).filter((name) =>
          name.startsWith('.stellarforge-demo-app-'),
        ),
      ).toEqual([]);
    }));

  it('preserves pre-existing user content and an empty destination after partial failure', () =>
    withTempDirectory((root) => {
      const templateRoot = join(root, 'template');
      const destination = join(root, 'demo-app');
      const userFile = join(root, 'user-notes.txt');
      mkdirSync(templateRoot);
      mkdirSync(destination);
      writeFileSync(userFile, 'keep this content');
      writeFileSync(join(templateRoot, 'a-good.txt'), 'created first');
      writeFileSync(join(templateRoot, 'z-bad.txt'), '{{unsupportedToken}}');

      expect(() =>
        generateProjectFromTemplate(context(root), { templateRoot }),
      ).toThrow(ValidationCliError);

      expect(readdirSync(destination)).toEqual([]);
      expect(readFileSync(userFile, 'utf8')).toBe('keep this content');
      expect(
        readdirSync(root).filter((name) =>
          name.startsWith('.stellarforge-demo-app-'),
        ),
      ).toEqual([]);
    }));

  it('refuses to overwrite a non-empty destination', () =>
    withTempDirectory((root) => {
      const templateRoot = join(root, 'template');
      mkdirSync(templateRoot);
      writeFileSync(join(templateRoot, 'README.md'), 'safe');
      mkdirSync(join(root, 'demo-app'));
      writeFileSync(join(root, 'demo-app', 'existing.txt'), 'keep me');

      expect(() =>
        generateProjectFromTemplate(context(root), { templateRoot }),
      ).toThrow('must be empty');
      expect(readFileSync(join(root, 'demo-app', 'existing.txt'), 'utf8')).toBe(
        'keep me',
      );
    }));

  it('rejects template symbolic links instead of following paths outside the trusted root', () =>
    withTempDirectory((root) => {
      const templateRoot = join(root, 'template');
      mkdirSync(templateRoot);
      const outside = join(root, 'outside.txt');
      writeFileSync(outside, 'outside');
      symlinkSync(outside, join(templateRoot, 'escape.txt'));

      expect(() =>
        generateProjectFromTemplate(context(root), { templateRoot }),
      ).toThrow('symbolic links are not supported');
      expect(existsSync(join(root, 'demo-app'))).toBe(false);
    }));
});

describe('template generation budget limits (SW-199)', () => {
  it('fails with an aggregate-safe message when the template exceeds the file count', () =>
    withTempDirectory((root) => {
      const templateRoot = join(root, 'template');
      mkdirSync(templateRoot, { recursive: true });
      for (let i = 0; i < 257; i++) {
        writeFileSync(join(templateRoot, `file-${i}.txt`), 'x');
      }

      expect(() =>
        generateProjectFromTemplate(context(root), { templateRoot }),
      ).toThrow('256-file generation limit');

      // Nothing is written when the budget is exceeded first.
      expect(existsSync(join(root, 'demo-app'))).toBe(false);
      expect(
        readdirSync(root).some((entry) =>
          entry.startsWith('.stellarforge-demo-app-'),
        ),
      ).toBe(false);
    }));

  it('accepts a template with exactly the maximum file count', () =>
    withTempDirectory((root) => {
      const templateRoot = join(root, 'template');
      mkdirSync(templateRoot);
      for (let i = 0; i < 256; i++) {
        writeFileSync(join(templateRoot, `file-${i}.txt`), 'x');
      }

      expect(() =>
        generateProjectFromTemplate(context(root), { templateRoot }),
      ).not.toThrow();
      expect(existsSync(join(root, 'demo-app', 'file-255.txt'))).toBe(true);
    }));

  it('fails when a single file exceeds the per-file byte limit', () =>
    withTempDirectory((root) => {
      const templateRoot = join(root, 'template');
      mkdirSync(templateRoot);
      writeFileSync(join(templateRoot, 'big.bin'), 'a'.repeat(256 * 1024 + 1));

      expect(() =>
        generateProjectFromTemplate(context(root), { templateRoot }),
      ).toThrow('per-file limit');
      expect(existsSync(join(root, 'demo-app'))).toBe(false);
    }));

  it('accepts a file at exactly the per-file byte limit', () =>
    withTempDirectory((root) => {
      const templateRoot = join(root, 'template');
      mkdirSync(templateRoot);
      writeFileSync(join(templateRoot, 'big.bin'), 'a'.repeat(256 * 1024));

      expect(() =>
        generateProjectFromTemplate(context(root), { templateRoot }),
      ).not.toThrow();
    }));

  it('fails when the aggregate size exceeds the total byte limit', () =>
    withTempDirectory((root) => {
      const templateRoot = join(root, 'template');
      mkdirSync(templateRoot, { recursive: true });
      // 9 files of 128 KiB comfortably exceed the 1 MiB aggregate limit.
      for (let i = 0; i < 9; i++) {
        writeFileSync(join(templateRoot, `chunk-${i}.bin`), 'a'.repeat(128 * 1024));
      }

      expect(() =>
        generateProjectFromTemplate(context(root), { templateRoot }),
      ).toThrow('byte generation limit');
      expect(existsSync(join(root, 'demo-app'))).toBe(false);
    }));

  it('accepts a template at exactly the total byte limit', () =>
    withTempDirectory((root) => {
      const templateRoot = join(root, 'template');
      mkdirSync(templateRoot, { recursive: true });
      // 8 files of exactly 128 KiB = 1 MiB exactly.
      for (let i = 0; i < 8; i++) {
        writeFileSync(join(templateRoot, `chunk-${i}.bin`), 'a'.repeat(128 * 1024));
      }

      expect(() =>
        generateProjectFromTemplate(context(root), { templateRoot }),
      ).not.toThrow();
    }));

  it('checks the budget before substitution, even for invalid template content', () =>
    withTempDirectory((root) => {
      const templateRoot = join(root, 'template');
      mkdirSync(templateRoot);
      // A valid but over-budget token set also fails on budget, not on token.
      writeFileSync(join(templateRoot, 'huge.bin'), 'a'.repeat(256 * 1024 + 1));

      expect(() =>
        generateProjectFromTemplate(context(root), { templateRoot }),
      ).toThrow('per-file limit');
    }));

  it('never exposes the absolute template path in budget error messages', () =>
    withTempDirectory((root) => {
      const templateRoot = join(root, 'template');
      mkdirSync(templateRoot, { recursive: true });
      for (let i = 0; i < 257; i++) {
        writeFileSync(join(templateRoot, `file-${i}.txt`), 'x');
      }

      try {
        generateProjectFromTemplate(context(root), { templateRoot });
        throw new Error('expected budget rejection');
      } catch (error) {
        const message = (error as Error).message;
        expect(message).not.toContain(templateRoot);
        expect(message).not.toContain('file-0');
      }
    }));
});