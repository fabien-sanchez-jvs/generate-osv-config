/**
 * Common interface for package managers
 */
export interface PackageManager {
  /** Name of the package manager */
  name: string;

  /** Lockfile name */
  lockfile: string;

  /** Get package manager version */
  getVersion(): string | null;

  /** Update packages */
  update(): boolean;

  /** Get dependency chain for a package */
  getDependencyChain(packageName: string, version: string): string;
}
