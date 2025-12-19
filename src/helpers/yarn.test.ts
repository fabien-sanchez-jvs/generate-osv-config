/**
 * Unit tests for Yarn Package Manager
 */

import { spawnSync } from "child_process";
import { YarnPackageManager } from "./yarn";

// Mock child_process
jest.mock("child_process");
const mockSpawnSync = spawnSync as jest.MockedFunction<typeof spawnSync>;

const realYarnWhyCrossSpawnOutput = `
{"type":"step","data":{"message":"Why do we have the module \\"cross-spawn\\"?","current":1,"total":4}}
{"type":"step","data":{"message":"Initialising dependency graph","current":2,"total":4}}
{"type":"step","data":{"message":"Finding dependency","current":3,"total":4}}
{"type":"step","data":{"message":"Calculating file sizes","current":4,"total":4}}
{"type":"info","data":"\\r=> Found \\"cross-spawn@7.0.6\\""}
{"type":"info","data":"Has been hoisted to \\"cross-spawn\\""}
{"type":"info","data":"Reasons this module exists"}
{"type":"list","data":{"type":"reasons","items":["\\"workspace-aggregator-0b89a0ba-b5d2-4e9b-b3c1-943ea9360c55\\" depends on it","Hoisted from \\"_project_#execa#cross-spawn\\"","Hoisted from \\"_project_#frontend#patch-package#cross-spawn\\"","Hoisted from \\"_project_#backend#argon2#cross-env#cross-spawn\\"","Hoisted from \\"_project_#backend#@nestjs-modules#mailer#glob#foreground-child#cross-spawn\\""]}}
{"type":"info","data":"Disk size without dependencies: \\"92KB\\""}
{"type":"info","data":"Disk size with unique dependencies: \\"156KB\\""}
{"type":"info","data":"Disk size with transitive dependencies: \\"216KB\\""}
{"type":"info","data":"Number of shared dependencies: 5"}
{"type":"info","data":"\\r=> Found \\"@prisma/generator-helper#cross-spawn@7.0.3\\""}
{"type":"info","data":"This module exists because \\"_project_#backend#prisma-dbml-generator#@prisma#generator-helper\\" depends on it."}
{"type":"info","data":"Disk size without dependencies: \\"68KB\\""}
{"type":"info","data":"Disk size with unique dependencies: \\"132KB\\""}
{"type":"info","data":"Disk size with transitive dependencies: \\"192KB\\""}
{"type":"info","data":"Number of shared dependencies: 5"}
{"type":"info","data":"\\r=> Found \\"run-applescript#cross-spawn@6.0.6\\""}
{"type":"info","data":"Reasons this module exists"}
{"type":"list","data":{"type":"reasons","items":["\\"_project_#backend#@nestjs-modules#mailer#preview-email#display-notification#run-applescript#execa\\" depends on it","Hoisted from \\"_project_#backend#@nestjs-modules#mailer#preview-email#display-notification#run-applescript#execa#cross-spawn\\""]}}
{"type":"info","data":"Disk size without dependencies: \\"68KB\\""}
{"type":"info","data":"Disk size with unique dependencies: \\"440KB\\""}
{"type":"info","data":"Disk size with transitive dependencies: \\"500KB\\""}
{"type":"info","data":"Number of shared dependencies: 7"}
`;

describe("YarnPackageManager", () => {
  let yarnManager: YarnPackageManager;

  beforeEach(() => {
    yarnManager = new YarnPackageManager();
    mockSpawnSync.mockClear();
  });

  describe("properties", () => {
    it("should have correct name", () => {
      expect(yarnManager.name).toBe("yarn");
    });

    it("should have correct lockfile", () => {
      expect(yarnManager.lockfile).toBe("yarn.lock");
    });
  });

  describe("getVersion", () => {
    it("should return version when yarn is available", () => {
      mockSpawnSync.mockReturnValue({
        status: 0,
        stdout: "1.22.19\n",
        stderr: "",
        pid: 1234,
        output: ["1.22.19\n"],
        signal: null,
      } as any);

      const version = yarnManager.getVersion();
      expect(version).toBe("1.22.19");
      expect(mockSpawnSync).toHaveBeenCalledWith("yarn", ["--version"], {
        encoding: "utf-8",
      });
    });

    it("should return null when yarn command fails", () => {
      mockSpawnSync.mockReturnValue({
        status: 1,
        stdout: "",
        stderr: "command not found",
        pid: 1234,
        output: [],
        signal: null,
      } as any);

      const version = yarnManager.getVersion();
      expect(version).toBeNull();
    });

    it("should return null when yarn throws error", () => {
      mockSpawnSync.mockImplementation(() => {
        throw new Error("Command not found");
      });

      const version = yarnManager.getVersion();
      expect(version).toBeNull();
    });
  });

  describe("update", () => {
    it("should return true when update succeeds", () => {
      mockSpawnSync.mockReturnValue({
        status: 0,
        stdout: "",
        stderr: "",
        pid: 1234,
        output: [],
        signal: null,
      } as any);

      const result = yarnManager.update();
      expect(result).toBe(true);
      expect(mockSpawnSync).toHaveBeenCalledWith("yarn", ["upgrade"], {
        stdio: "inherit",
      });
    });

    it("should return false when update fails", () => {
      mockSpawnSync.mockReturnValue({
        status: 1,
        stdout: "",
        stderr: "error",
        pid: 1234,
        output: [],
        signal: null,
      } as any);

      const result = yarnManager.update();
      expect(result).toBe(false);
    });

    it("should return false when update throws error", () => {
      mockSpawnSync.mockImplementation(() => {
        throw new Error("Update failed");
      });

      const result = yarnManager.update();
      expect(result).toBe(false);
    });
  });

  describe("getDependencyChain", () => {
    it("should parse real yarn why output for cross-spawn", () => {
      // Real output from yarn why cross-spawn (from yarn-why.json)
      const realYarnOutput = realYarnWhyCrossSpawnOutput;

      mockSpawnSync.mockReturnValue({
        status: 0,
        stdout: realYarnOutput,
        stderr: "",
        pid: 1234,
        output: [realYarnOutput],
        signal: null,
      } as any);

      const chain = yarnManager.getDependencyChain("cross-spawn", "7.0.3");

      // Should extract the chains and clean up _project_# prefix
      expect(chain).toContain("generator-helper");
      expect(chain).not.toContain("_project_#");

      // Should separate multiple reasons with |
      const chains = chain.split(" | ");
      expect(chains.length).toBeGreaterThan(0);

      expect(mockSpawnSync).toHaveBeenCalledWith(
        "yarn",
        ["why", "--json", "cross-spawn"],
        {
          encoding: "utf-8",
          maxBuffer: 10 * 1024 * 1024,
        }
      );
    });

    it("should return dependency chain with reasons when version not specified", () => {
      const mockOutput = `{"type":"info","data":"\\r=> Found \\"package-a@1.0.0\\""}\n{"type":"list","data":{"type":"reasons","items":["_project_#package-a","package-b#package-a"]}}
{"type":"info","data":"Done"}`;

      mockSpawnSync.mockReturnValue({
        status: 0,
        stdout: mockOutput,
        stderr: "",
        pid: 1234,
        output: [mockOutput],
        signal: null,
      } as any);

      const chain = yarnManager.getDependencyChain("package-a", "1.0.0");
      expect(chain).toBe("package-a | package-b#package-a");
      expect(mockSpawnSync).toHaveBeenCalledWith(
        "yarn",
        ["why", "--json", "package-a"],
        {
          encoding: "utf-8",
          maxBuffer: 10 * 1024 * 1024,
        }
      );
    });

    it("should return parsed chain with version-specific data", () => {
      const mockOutput = `{"type":"info","data":"\\r=> Found \\"package-a@1.0.0\\""}
{"type":"info","data":"=> Found package-a@1.0.0"}
{"type":"list","data":{"type":"reasons","items":["project#package-a@1.0.0"]}}
{"type":"tree","data":{"trees":[{"name":"package-a@1.0.0","children":[{"name":"package-b@2.0.0"}]}]}}`;

      mockSpawnSync.mockReturnValue({
        status: 0,
        stdout: mockOutput,
        stderr: "",
        pid: 1234,
        output: [mockOutput],
        signal: null,
      } as any);

      const chain = yarnManager.getDependencyChain("package-a", "1.0.0");
      expect(chain).toContain("package-a@1.0.0");
    });

    it("should clean up project prefix from reasons", () => {
      const mockOutput = `{"type":"info","data":"\\r=> Found \\"package-a@1.0.0\\""}
{"type":"list","data":{"type":"reasons","items":["\\"_project_#package-a\\""]}}`;

      mockSpawnSync.mockReturnValue({
        status: 0,
        stdout: mockOutput,
        stderr: "",
        pid: 1234,
        output: [mockOutput],
        signal: null,
      } as any);

      const chain = yarnManager.getDependencyChain("package-a", "1.0.0");
      expect(chain).toBe("package-a");
      expect(chain).not.toContain("_project_#");
    });

    it("should filter out workspace aggregator entries", () => {
      const mockOutput = `{"type":"info","data":"=> Found package-a@1.0.0"}
{"type":"list","data":{"type":"reasons","items":["workspace aggregator of package-a","project#package-a"]}}`;

      mockSpawnSync.mockReturnValue({
        status: 0,
        stdout: mockOutput,
        stderr: "",
        pid: 1234,
        output: [mockOutput],
        signal: null,
      } as any);

      const chain = yarnManager.getDependencyChain("package-a", "1.0.0");
      expect(chain).toContain("package-a");
      expect(chain).not.toContain("workspace aggregator");
    });

    it("should handle tree structure with nested children", () => {
      const mockOutput = `{"type":"info","data":"=> Found package-a@1.0.0"}
{"type":"tree","data":{"trees":[{"name":"root","children":[{"name":"package-b","children":[{"name":"package-a@1.0.0"}]}]}]}}`;

      mockSpawnSync.mockReturnValue({
        status: 0,
        stdout: mockOutput,
        stderr: "",
        pid: 1234,
        output: [mockOutput],
        signal: null,
      } as any);

      const chain = yarnManager.getDependencyChain("package-a", "1.0.0");
      expect(chain).toContain("root → package-b → package-a@1.0.0");
    });

    it("should remove duplicate chains", () => {
      const mockOutput = `{"type":"info","data":"=> Found package-a@1.0.0"}
{"type":"list","data":{"type":"reasons","items":["package-b#package-a","package-b#package-a","package-c#package-a"]}}`;

      mockSpawnSync.mockReturnValue({
        status: 0,
        stdout: mockOutput,
        stderr: "",
        pid: 1234,
        output: [mockOutput],
        signal: null,
      } as any);

      const chain = yarnManager.getDependencyChain("package-a", "1.0.0");
      const chains = chain.split(" | ");
      expect(chains.length).toBe(2);
      expect(chains).toContain("package-b#package-a");
      expect(chains).toContain("package-c#package-a");
    });

    it("should limit results to 5 chains", () => {
      const mockOutput = `{"type":"info","data":"=> Found package-a@1.0.0"}
{"type":"list","data":{"type":"reasons","items":["chain1","chain2","chain3","chain4","chain5","chain6","chain7"]}}`;

      mockSpawnSync.mockReturnValue({
        status: 0,
        stdout: mockOutput,
        stderr: "",
        pid: 1234,
        output: [mockOutput],
        signal: null,
      } as any);

      const chain = yarnManager.getDependencyChain("package-a", "1.0.0");
      const chains = chain.split(" | ");
      expect(chains.length).toBeLessThanOrEqual(5);
    });

    it("should handle multiple version blocks", () => {
      const mockOutput = `{"type":"info","data":"=> Found package-a@1.0.0"}
{"type":"list","data":{"type":"reasons","items":["version-1.0.0"]}}
{"type":"info","data":"=> Found package-a@2.0.0"}
{"type":"list","data":{"type":"reasons","items":["version-2.0.0"]}}
{"type":"info","data":"=> Found package-a@1.0.0"}
{"type":"list","data":{"type":"reasons","items":["another-1.0.0"]}}`;

      mockSpawnSync.mockReturnValue({
        status: 0,
        stdout: mockOutput,
        stderr: "",
        pid: 1234,
        output: [mockOutput],
        signal: null,
      } as any);

      const chain = yarnManager.getDependencyChain("package-a", "1.0.0");
      expect(chain).toContain("version-1.0.0");
      expect(chain).toContain("another-1.0.0");
      expect(chain).not.toContain("version-2.0.0");
    });

    it("should handle invalid JSON lines gracefully", () => {
      const mockOutput = `{"type":"info","data":"=> Found package-a@1.0.0"}
{"type":"list","data":{"type":"reasons","items":["valid-chain"]}}
invalid json line
{"type":"info","data":"Done"}`;

      mockSpawnSync.mockReturnValue({
        status: 0,
        stdout: mockOutput,
        stderr: "",
        pid: 1234,
        output: [mockOutput],
        signal: null,
      } as any);

      const chain = yarnManager.getDependencyChain("package-a", "1.0.0");
      expect(chain).toBe("valid-chain");
    });

    it("should handle empty stdout", () => {
      mockSpawnSync.mockReturnValue({
        status: 0,
        stdout: "",
        stderr: "",
        pid: 1234,
        output: [],
        signal: null,
      } as any);

      const chain = yarnManager.getDependencyChain("package-a", "1.0.0");
      expect(chain).toBe("Unable to determine dependency chain");
    });

    it("should handle null stdout", () => {
      mockSpawnSync.mockReturnValue({
        status: 0,
        stdout: null,
        stderr: "",
        pid: 1234,
        output: [],
        signal: null,
      } as any);

      const chain = yarnManager.getDependencyChain("package-a", "1.0.0");
      expect(chain).toBe("Unable to determine dependency chain");
    });

    it("should return error message when parsing fails", () => {
      const mockOutput = `{"type":"unknown","data":"something"}`;

      mockSpawnSync.mockReturnValue({
        status: 0,
        stdout: mockOutput,
        stderr: "",
        pid: 1234,
        output: [mockOutput],
        signal: null,
      } as any);

      const chain = yarnManager.getDependencyChain("package-a", "1.0.0");
      expect(chain).toBe("Unable to parse yarn output");
    });

    it("should return error message when command throws error", () => {
      mockSpawnSync.mockImplementation(() => {
        throw new Error("Command failed");
      });

      const chain = yarnManager.getDependencyChain("package-a", "1.0.0");
      expect(chain).toBe("Unable to determine dependency chain");
    });

    it("should handle tree with null or undefined values", () => {
      const mockOutput = `{"type":"info","data":"=> Found package-a@1.0.0"}
{"type":"tree","data":{"trees":[null,{"name":"valid-package"}]}}`;

      mockSpawnSync.mockReturnValue({
        status: 0,
        stdout: mockOutput,
        stderr: "",
        pid: 1234,
        output: [mockOutput],
        signal: null,
      } as any);

      const chain = yarnManager.getDependencyChain("package-a", "1.0.0");
      expect(chain).toContain("valid-package");
    });

    it("should handle tree with no children", () => {
      const mockOutput = `{"type":"info","data":"=> Found package-a@1.0.0"}
{"type":"tree","data":{"trees":[{"name":"package-a@1.0.0"}]}}`;

      mockSpawnSync.mockReturnValue({
        status: 0,
        stdout: mockOutput,
        stderr: "",
        pid: 1234,
        output: [mockOutput],
        signal: null,
      } as any);

      const chain = yarnManager.getDependencyChain("package-a", "1.0.0");
      expect(chain).toBe("package-a@1.0.0");
    });

    it("should handle mixed reasons and trees", () => {
      const mockOutput = `{"type":"info","data":"=> Found package-a@1.0.0"}
{"type":"list","data":{"type":"reasons","items":["reason-chain"]}}
{"type":"tree","data":{"trees":[{"name":"tree-chain"}]}}`;

      mockSpawnSync.mockReturnValue({
        status: 0,
        stdout: mockOutput,
        stderr: "",
        pid: 1234,
        output: [mockOutput],
        signal: null,
      } as any);

      const chain = yarnManager.getDependencyChain("package-a", "1.0.0");
      expect(chain).toContain("reason-chain");
      expect(chain).toContain("tree-chain");
    });

    it("should handle empty items array", () => {
      const mockOutput = `{"type":"list","data":{"type":"reasons","items":[]}}`;

      mockSpawnSync.mockReturnValue({
        status: 0,
        stdout: mockOutput,
        stderr: "",
        pid: 1234,
        output: [mockOutput],
        signal: null,
      } as any);

      const chain = yarnManager.getDependencyChain("package-a", "1.0.0");
      expect(chain).toBe("Unable to parse yarn output");
    });

    it("should handle empty trees array", () => {
      const mockOutput = `{"type":"info","data":"=> Found package-a@1.0.0"}
{"type":"tree","data":{"trees":[]}}`;

      mockSpawnSync.mockReturnValue({
        status: 0,
        stdout: mockOutput,
        stderr: "",
        pid: 1234,
        output: [mockOutput],
        signal: null,
      } as any);

      const chain = yarnManager.getDependencyChain("package-a", "1.0.0");
      expect(chain).toBe("Unable to parse yarn output");
    });
  });

  describe("extractVersionLines (private method)", () => {
    it("should extract only lines for version 7.0.3 from cross-spawn output", () => {
      // Real output from yarn why cross-spawn with multiple versions
      const realYarnOutput = realYarnWhyCrossSpawnOutput;

      const lines = realYarnOutput.trim().split("\n");

      // Access private method using TypeScript type assertion
      const extractVersionLines = (yarnManager as any).extractVersionLines.bind(
        yarnManager
      );
      const versionLines = extractVersionLines(lines, "7.0.3");
      // Should only include lines from the 7.0.3 block
      expect(versionLines.length).toBeGreaterThan(0);

      // Check that it contains the info line about 7.0.3
      const hasCorrectVersion = versionLines.some(
        (line: any) =>
          line.type === "info" &&
          line.data &&
          line.data.includes("cross-spawn@7.0.3")
      );
      expect(hasCorrectVersion).toBe(true);

      // Check that it contains the dependency info for 7.0.3
      const hasDependencyInfo = versionLines.some(
        (line: any) =>
          line.type === "info" &&
          line.data &&
          line.data.includes("generator-helper")
      );
      expect(hasDependencyInfo).toBe(true);

      // Should NOT include data from 7.0.6 or 6.0.6 versions
      const has706Data = versionLines.some(
        (line: any) =>
          line.type === "list" &&
          line.data?.items?.some((item: string) =>
            item.includes("workspace-aggregator")
          )
      );
      expect(has706Data).toBe(false);

      const has606Data = versionLines.some(
        (line: any) =>
          line.type === "info" &&
          line.data &&
          line.data.includes("run-applescript")
      );
      expect(has606Data).toBe(false);
    });

    it("should extract lines for version 7.0.6 from cross-spawn output", () => {
      const realYarnOutput = `
{"type":"info","data":"\\r=> Found \\"cross-spawn@7.0.6\\""}
{"type":"info","data":"Has been hoisted to \\"cross-spawn\\""}
{"type":"info","data":"Reasons this module exists"}
{"type":"list","data":{"type":"reasons","items":["Hoisted from \\"_project_#execa#cross-spawn\\""]}}
{"type":"info","data":"\\r=> Found \\"@prisma/generator-helper#cross-spawn@7.0.3\\""}
{"type":"info","data":"This module exists because \\"_project_#backend#prisma-dbml-generator#@prisma#generator-helper\\" depends on it."}
`;

      const lines = realYarnOutput.trim().split("\n");
      const extractVersionLines = (yarnManager as any).extractVersionLines.bind(
        yarnManager
      );
      const versionLines = extractVersionLines(lines, "7.0.6");

      // Should include the 7.0.6 block but not 7.0.3
      const has706 = versionLines.some(
        (line: any) =>
          line.type === "info" &&
          line.data &&
          line.data.includes("cross-spawn@7.0.6")
      );
      expect(has706).toBe(true);

      const has706Reasons = versionLines.some(
        (line: any) =>
          line.type === "list" &&
          line.data?.items?.some((item: string) => item.includes("execa"))
      );
      expect(has706Reasons).toBe(true);

      // Should not include 7.0.3 data
      const has703 = versionLines.some(
        (line: any) =>
          line.type === "info" &&
          line.data &&
          line.data.includes("generator-helper")
      );
      expect(has703).toBe(false);
    });

    it("should handle multiple occurrences of same version", () => {
      const output = `
{"type":"info","data":"=> Found package-a@1.0.0"}
{"type":"list","data":{"type":"reasons","items":["first-occurrence"]}}
{"type":"info","data":"=> Found package-a@2.0.0"}
{"type":"list","data":{"type":"reasons","items":["version-2"]}}
{"type":"info","data":"=> Found package-a@1.0.0"}
{"type":"list","data":{"type":"reasons","items":["second-occurrence"]}}
`;

      const lines = output.trim().split("\n");
      const extractVersionLines = (yarnManager as any).extractVersionLines.bind(
        yarnManager
      );
      const versionLines = extractVersionLines(lines, "1.0.0");

      // Should include both occurrences of 1.0.0
      const reasons = versionLines.filter(
        (line: any) => line.type === "list" && line.data?.type === "reasons"
      );

      const allItems = reasons.flatMap((r: any) => r.data.items);
      expect(allItems).toContain("first-occurrence");
      expect(allItems).toContain("second-occurrence");
      expect(allItems).not.toContain("version-2");
    });
  });

  describe("extractDependencyChains (private method)", () => {
    let extractDependencyChains: (
      versionLines: Record<string, any>[]
    ) => string[];

    beforeEach(() => {
      extractDependencyChains = (
        yarnManager as any
      ).extractDependencyChains.bind(yarnManager);
    });

    it("should extract chains from cross-spawn 7.0.6 version lines", () => {
      // Simulated versionLines as returned by extractVersionLines for cross-spawn@7.0.6
      const versionLines = [
        { type: "info", data: '\r=> Found "cross-spawn@7.0.6"' },
        { type: "info", data: 'Has been hoisted to "cross-spawn"' },
        { type: "info", data: "Reasons this module exists" },
        {
          type: "list",
          data: {
            type: "reasons",
            items: [
              '"workspace-aggregator-0b89a0ba-b5d2-4e9b-b3c1-943ea9360c55" depends on it',
              'Hoisted from "_project_#execa#cross-spawn"',
              'Hoisted from "_project_#frontend#patch-package#cross-spawn"',
              'Hoisted from "_project_#backend#argon2#cross-env#cross-spawn"',
              'Hoisted from "_project_#backend#@nestjs-modules#mailer#glob#foreground-child#cross-spawn"',
            ],
          },
        },
        { type: "info", data: 'Disk size without dependencies: "92KB"' },
        { type: "info", data: 'Disk size with unique dependencies: "156KB"' },
        {
          type: "info",
          data: 'Disk size with transitive dependencies: "216KB"',
        },
        { type: "info", data: "Number of shared dependencies: 5" },
      ];
    });

    it("should extract chains from cross-spawn 7.0.3 version lines", () => {
      // Simulated versionLines as returned by extractVersionLines for cross-spawn@7.0.3
      const versionLines = [
        {
          type: "info",
          data: '\r=> Found "@prisma/generator-helper#cross-spawn@7.0.3"',
        },
        {
          type: "info",
          data: 'This module exists because "_project_#backend#prisma-dbml-generator#@prisma#generator-helper" depends on it.',
        },
        {
          type: "info",
          data: 'Disk size without dependencies: "68KB"',
        },
        {
          type: "info",
          data: 'Disk size with unique dependencies: "132KB"',
        },
        {
          type: "info",
          data: 'Disk size with transitive dependencies: "192KB"',
        },
        {
          type: "info",
          data: "Number of shared dependencies: 5",
        },
      ];

      const chains = extractDependencyChains(versionLines);

      // Should extract the generator-helper chain
      expect(chains.length).toBeGreaterThan(0);
      expect(chains).toContain(
        "backend#prisma-dbml-generator#@prisma#generator-helper"
      );

      // Should have cleaned up _project_# prefix
      chains.forEach((chain) => {
        expect(chain).not.toContain("_project_#");
      });
    });

    it("should extract chains from cross-spawn 7.0.6 version lines with list reasons", () => {
      // Simulated versionLines for cross-spawn@7.0.6 with list of reasons
      const versionLines = [
        { type: "info", data: '\r=> Found "cross-spawn@7.0.6"' },
        { type: "info", data: 'Has been hoisted to "cross-spawn"' },
        { type: "info", data: "Reasons this module exists" },
        {
          type: "list",
          data: {
            type: "reasons",
            items: [
              '"workspace-aggregator-0b89a0ba-b5d2-4e9b-b3c1-943ea9360c55" depends on it',
              'Hoisted from "_project_#execa#cross-spawn"',
              'Hoisted from "_project_#frontend#patch-package#cross-spawn"',
              'Hoisted from "_project_#backend#argon2#cross-env#cross-spawn"',
              'Hoisted from "_project_#backend#@nestjs-modules#mailer#glob#foreground-child#cross-spawn"',
            ],
          },
        },
        { type: "info", data: 'Disk size without dependencies: "92KB"' },
        { type: "info", data: 'Disk size with unique dependencies: "156KB"' },
        {
          type: "info",
          data: 'Disk size with transitive dependencies: "216KB"',
        },
        { type: "info", data: "Number of shared dependencies: 5" },
      ];

      const chains = extractDependencyChains(versionLines);

      // Should extract multiple chains
      expect(chains.length).toBeGreaterThan(1);

      // Should contain the expected chains
      expect(chains.join(" ")).toContain("execa#cross-spawn");
      expect(chains.join(" ")).toContain("frontend#patch-package#cross-spawn");
      expect(chains.join(" ")).toContain(
        "backend#argon2#cross-env#cross-spawn"
      );
      expect(chains.join(" ")).toContain(
        "backend#@nestjs-modules#mailer#glob#foreground-child#cross-spawn"
      );

      // Should NOT contain workspace aggregator
      chains.forEach((chain) => {
        expect(chain).not.toContain("workspace aggregator");
      });

      // Should have cleaned up _project_# prefix
      chains.forEach((chain) => {
        expect(chain).not.toContain("_project_#");
      });
    });

    it("should extract chains from cross-spawn 6.0.6 version lines", () => {
      // Simulated versionLines for cross-spawn@6.0.6
      const versionLines = [
        {
          type: "info",
          data: '\r=> Found "run-applescript#cross-spawn@6.0.6"',
        },
        {
          type: "info",
          data: "Reasons this module exists",
        },
        {
          type: "list",
          data: {
            type: "reasons",
            items: [
              '"_project_#backend#@nestjs-modules#mailer#preview-email#display-notification#run-applescript#execa" depends on it',
              'Hoisted from "_project_#backend#@nestjs-modules#mailer#preview-email#display-notification#run-applescript#execa#cross-spawn"',
            ],
          },
        },
      ];

      const chains = extractDependencyChains(versionLines);

      // Should extract the chains
      expect(chains.length).toBeGreaterThan(0);
      expect(chains.join(" ")).toContain(
        "backend#@nestjs-modules#mailer#preview-email#display-notification#run-applescript#execa"
      );
      expect(chains.join(" ")).toContain(
        "backend#@nestjs-modules#mailer#preview-email#display-notification#run-applescript#execa#cross-spawn"
      );

      // Should have cleaned up _project_# prefix
      chains.forEach((chain) => {
        expect(chain).not.toContain("_project_#");
      });
    });

    it("should handle mixed list and info type dependency declarations", () => {
      const versionLines = [
        {
          type: "info",
          data: '\r=> Found "package@1.0.0"',
        },
        {
          type: "list",
          data: {
            type: "reasons",
            items: [
              'Hoisted from "_project_#dep-a#package"',
              'Hoisted from "_project_#dep-b#package"',
            ],
          },
        },
        {
          type: "info",
          data: '\r=> Found "another-package#package@1.0.1"',
        },
        {
          type: "info",
          data: 'This module exists because "_project_#dep-c#another-package" depends on it.',
        },
      ];

      const chains = extractDependencyChains(versionLines);

      // Should extract chains from both list and info types
      expect(chains.join(" ")).toContain("dep-a#package");
      expect(chains.join(" ")).toContain("dep-b#package");
      expect(chains.join(" ")).toContain("dep-c#another-package");
    });

    it("should remove duplicate chains", () => {
      const versionLines = [
        {
          type: "list",
          data: {
            type: "reasons",
            items: [
              '"_project_#dep-a#package"',
              '"_project_#dep-a#package"',
              '"_project_#dep-b#package"',
            ],
          },
        },
      ];

      const chains = extractDependencyChains(versionLines);

      // Should have only unique chains
      expect(chains.length).toBe(2);
      expect(chains).toContain("dep-a#package");
      expect(chains).toContain("dep-b#package");
    });

    it("should handle tree structures if present", () => {
      const versionLines = [
        {
          type: "tree",
          data: {
            trees: [
              {
                name: "root-package",
                children: [
                  {
                    name: "intermediate-package",
                    children: [
                      {
                        name: "target-package@1.0.0",
                      },
                    ],
                  },
                ],
              },
            ],
          },
        },
      ];

      const chains = extractDependencyChains(versionLines);

      expect(chains.length).toBe(1);
      expect(chains[0]).toBe(
        "root-package → intermediate-package → target-package@1.0.0"
      );
    });

    it("should return empty array when no valid chains found", () => {
      const versionLines = [
        {
          type: "info",
          data: "Some unrelated info",
        },
        {
          type: "step",
          data: { message: "Some step" },
        },
      ];

      const chains = extractDependencyChains(versionLines);

      expect(chains).toEqual([]);
    });
  });
});
