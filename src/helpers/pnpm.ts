import { spawnSync } from 'child_process';
import { PackageManager } from './packageManager.js';

/**
 * PNPM Package Manager implementation
 */
export class PnpmPackageManager implements PackageManager {
  readonly name = 'pnpm';
  readonly lockfile = 'pnpm-lock.yaml';

  getVersion(): string | null {
    try {
      const result = spawnSync('pnpm', ['--version'], { encoding: 'utf-8' });
      return result.status === 0 ? result.stdout.trim() : null;
    } catch {
      return null;
    }
  }

  update(): boolean {
    try {
      const result = spawnSync('pnpm', ['update'], { stdio: 'inherit' });
      return result.status === 0;
    } catch {
      return false;
    }
  }

  getDependencyChain(packageName: string, version: string): string {
    try {
      const result = spawnSync('pnpm', ['why', `${packageName}@${version}`], {
        encoding: 'utf-8',
        maxBuffer: 10 * 1024 * 1024,
      });

      return result.stdout ? result.stdout.trim() : 'Unable to determine dependency chain';
    } catch {
      return 'Unable to determine dependency chain';
    }
  }
}
