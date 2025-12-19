import { spawnSync } from "child_process";
import { PackageManager } from "./packageManager.js";

/**
 * Yarn Package Manager implementation
 */
export class YarnPackageManager implements PackageManager {
  readonly name = "yarn";
  readonly lockfile = "yarn.lock";

  getVersion(): string | null {
    try {
      const result = spawnSync("yarn", ["--version"], { encoding: "utf-8" });
      return result.status === 0 ? result.stdout.trim() : null;
    } catch {
      return null;
    }
  }

  update(): boolean {
    try {
      const result = spawnSync("yarn", ["upgrade"], { stdio: "inherit" });
      return result.status === 0;
    } catch {
      return false;
    }
  }

  getDependencyChain(packageName: string, version: string): string {
    try {
      const result = spawnSync("yarn", ["why", "--json", packageName], {
        encoding: "utf-8",
        maxBuffer: 10 * 1024 * 1024,
      });

      if (result.stdout) {
        return this.parseYarnWhyOutput(result.stdout, version);
      }

      return "Unable to determine dependency chain";
    } catch {
      return "Unable to determine dependency chain";
    }
  }

  private parseYarnWhyOutput(output: string, version: string): string {
    const lines = output.trim().split("\n");

    const versionLines = this.extractVersionLines(lines, version);

    const dependencyChains = this.extractDependencyChains(versionLines);

    if (dependencyChains.length > 0) {
      return dependencyChains.slice(0, 5).join(" | ");
    }

    return "Unable to parse yarn output";
  }

  private extractVersionLines(lines: string[], version: string): any[] {
    const versionBlocks: any[][] = [];
    let currentBlock: any[] = [];
    let inVersionBlock = false;

    for (const line of lines) {
      try {
        const data = JSON.parse(line);

        if (data.type === "info") {
          const info = data.data || "";
          if (info.includes("=> Found") && info.includes(`@${version}`)) {
            if (currentBlock.length > 0) {
              versionBlocks.push(currentBlock);
            }
            currentBlock = [];
            inVersionBlock = true;
          } else if (info.includes("=> Found")) {
            if (inVersionBlock && currentBlock.length > 0) {
              versionBlocks.push(currentBlock);
            }
            inVersionBlock = false;
            currentBlock = [];
          }
        }

        if (inVersionBlock) {
          currentBlock.push(data);
        }
      } catch {
        continue;
      }
    }

    if (inVersionBlock && currentBlock.length > 0) {
      versionBlocks.push(currentBlock);
    }

    const allVersionLines: any[] = [];
    for (const block of versionBlocks) {
      allVersionLines.push(...block);
    }
    
    return allVersionLines;
  }

  private extractDependencyChains(versionLines: any[]): string[] {
    const chains: string[] = [];

    for (const data of versionLines) {
      const dataType = data.type;

      if (dataType === "list" && data.data?.type === "reasons") {
        const items = data.data.items || [];
        for (const item of items) {
          let chain = item
            .replace(/^"/, "")
            .replace(/"$/, "")
            .replace("_project_#", "");
          if (
            chain &&
            !(
              chain.includes("workspace aggregator") ||
              chain.includes("workspace-aggregator")
            )
          ) {
            chains.push(chain);
          }
        }
      } else if (dataType === "tree") {
        const trees = data.data?.trees || [];
        for (const tree of trees) {
          const chain = this.extractChainFromTree(tree);
          if (chain) {
            chains.push(chain);
          }
        }
      } else if (dataType === "info") {
        // Extract chain from "This module exists because..." or "depends on it" messages
        const info = data.data || "";
        const dependsMatch = info.match(/"([^"]+)" depends on it/);
        const existsMatch = info.match(
          /exists because "([^"]+)" depends on it/
        );

        if (dependsMatch && dependsMatch[1]) {
          const chain = dependsMatch[1].replace("_project_#", "");
          if (
            chain &&
            !(
              chain.includes("workspace aggregator") ||
              chain.includes("workspace-aggregator")
            )
          ) {
            chains.push(chain);
          }
        } else if (existsMatch && existsMatch[1]) {
          const chain = existsMatch[1].replace("_project_#", "");
          if (
            chain &&
            !(
              chain.includes("workspace aggregator") ||
              chain.includes("workspace-aggregator")
            )
          ) {
            chains.push(chain);
          }
        }
      }
    }

    // Remove duplicates
    const seen = new Set<string>();
    const uniqueChains: string[] = [];
    for (const chain of chains) {
      if (!seen.has(chain)) {
        seen.add(chain);
        uniqueChains.push(chain);
      }
    }
    
    return uniqueChains;
  }

  private extractChainFromTree(
    tree: any,
    parentChain: string = ""
  ): string | null {
    if (!tree || typeof tree !== "object") return null;

    const name = tree.name || "";
    const currentChain = parentChain ? `${parentChain} → ${name}` : name;

    if (tree.children && tree.children.length > 0) {
      return this.extractChainFromTree(tree.children[0], currentChain);
    }

    return currentChain;
  }
}
