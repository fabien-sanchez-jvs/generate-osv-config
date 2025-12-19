import * as fs from 'fs';
import { PackageManager } from './packageManager.js';
import { YarnPackageManager } from './yarn.js';
import { NpmPackageManager } from './npm.js';
import { PnpmPackageManager } from './pnpm.js';

interface PackageJson {
  packageManager?: string;
}

/**
 * Detect the package manager used by the project
 * @returns PackageManager instance or null if not detected
 */
export function detectPackageManager(): PackageManager | null {
  const yarn = new YarnPackageManager();
  const npm = new NpmPackageManager();
  const pnpm = new PnpmPackageManager();

  // Try to read packageManager from package.json
  try {
    const content = fs.readFileSync('package.json', 'utf-8');
    const packageJson: PackageJson = JSON.parse(content);
    if (packageJson.packageManager) {
      const pmString = packageJson.packageManager;
      if (pmString.startsWith('yarn')) return yarn;
      if (pmString.startsWith('npm')) return npm;
      if (pmString.startsWith('pnpm')) return pnpm;
    }
  } catch {
    // Ignore
  }

  // Check for lock files
  if (fs.existsSync(yarn.lockfile)) return yarn;
  if (fs.existsSync(npm.lockfile)) return npm;
  if (fs.existsSync(pnpm.lockfile)) return pnpm;

  return null;
}
