import fs from 'node:fs';
import path from 'node:path';

/**
 * Metro tries every platform for one extension before the next extension: for `x`, it looks
 * for x.ios.ts, x.native.ts and x.ts before x.ios.tsx. So a platform file must not have a later
 * extension than the shared file next to it, or the shared file wins on that platform. That is
 * how iPhones ran the stub `live-timers.ts` instead of `live-timers.ios.tsx` (#49).
 */
const EXTENSIONS = ['ts', 'tsx', 'js', 'jsx'];
const PLATFORM = /^(.*)\.(ios|android|native|web)\.(tsx?|jsx?)$/;

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : sourceFiles(full);
    return [full];
  });
}

it('has no platform file that a shared file next to it hides', () => {
  const root = path.join(__dirname, '..', '..');
  const files = [...sourceFiles(path.join(root, 'src')), ...sourceFiles(path.join(root, 'modules'))];
  const present = new Set(files);
  const hidden = files.flatMap((file) => {
    const match = PLATFORM.exec(file);
    if (!match) return [];
    const [, base, , ext] = match;
    const earlier = EXTENSIONS.slice(0, EXTENSIONS.indexOf(ext));
    return earlier
      .map((e) => `${base}.${e}`)
      .filter((shared) => present.has(shared))
      .map((shared) => `${path.relative(root, file)} is hidden by ${path.relative(root, shared)}`);
  });
  expect(hidden).toEqual([]);
});
