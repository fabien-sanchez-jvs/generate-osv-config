#!/usr/bin/env node

/**
 * generate-osv-config - Generate OSV-Scanner configuration from vulnerability scan
 *
 * DESCRIPTION:
 *     Analyses vulnerabilities detected by osv-scanner and generates an
 *     osv-scanner.toml configuration file to ignore vulnerabilities after
 *     manual or AI validation.
 *
 * PREREQUISITES:
 *     Required binaries:
 *     - osv-scanner: Vulnerability scanning tool (go install github.com/google/osv-scanner/cmd/osv-scanner@latest)
 *     - yarn, npm or pnpm: Node.js package manager (automatic detection)
 *
 * ENVIRONMENT VARIABLES:
 *     Required for AI suggestions (optional):
 *     - AZUREAI_API_KEY: Azure OpenAI API key
 *     - AZUREAI_BASE_URL: Azure OpenAI service URL (e.g., https://your-resource.openai.azure.com)
 *     - AZUREAI_API_VERSION: API version (e.g., 2023-05-15)
 *     - AZUREAI_DEPLOYMENT: Azure OpenAI deployment name (e.g., CommuniCity)
 *
 * FUNCTIONALITY:
 *     1. Detects package manager (yarn/npm/pnpm) and its lockfile
 *     2. Runs osv-scanner to identify vulnerabilities
 *     3. For each detected vulnerability:
 *        - Extracts dependency chain (via 'yarn why', 'npm ls' or 'pnpm why')
 *        - Analyzes if it's a dev or production dependency
 *        - Asks AI for a suggestion (if configured)
 *        - Proposes 4 options to user:
 *          1. No fixed version available
 *          2. Dev dependency only
 *          3. Code not executed in production
 *          4. Requires manual action
 *     4. Generates osv-scanner.toml file with ignored vulnerabilities
 *     5. Verifies configuration by re-running osv-scanner
 *
 * USAGE:
 *     ./generate-osv-config              # Interactive normal mode
 *     ./generate-osv-config --dry-run    # Preview without creating files
 *     ./generate-osv-config --report     # Also generates markdown report
 *
 * NOTE:
 *     The script works without Azure AI variables, but automatic suggestions
 *     will not be available. User will need to make all choices manually.
 */

import { program } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import { spawnSync } from 'child_process';
import chalk from 'chalk';
import { question } from './helpers/console.js';
import { AzureAIClient } from './helpers/azureAi.js';
import { PackageManager } from './helpers/packageManager.js';
import { detectPackageManager } from './helpers/packageManagerDetector.js';

interface Vulnerability {
  name: string;
  version: string;
  vulnerability_ids: string[];
  severities: string[];
  dependency_chain: string;
  reason: string;
  show_alternatives: boolean;
}

interface PackageJson {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  workspaces?: string[] | { packages: string[] };
  packageManager?: string;
}

// Print utilities
function printError(message: string): void {
  console.error(chalk.red(`❌  ${message}`));
}

function printSuccess(message: string): void {
  console.log(chalk.green(`✅  ${message}`));
}

function printInfo(message: string): void {
  console.log(chalk.blue(`ℹ️  ${message}`));
}

function printWarning(message: string): void {
  console.log(chalk.yellow(`⚠️  ${message}`));
}

async function askConfirmation(prompt: string, defaultValue: boolean = false): Promise<boolean> {
  const suffix = defaultValue ? ' (O/n)' : ' (o/N)';
  while (true) {
    const response = (await question(prompt + suffix)).toLowerCase();
    if (!response) {
      return defaultValue;
    }
    if (['o', 'oui', 'y', 'yes'].includes(response)) {
      return true;
    }
    if (['n', 'non', 'no'].includes(response)) {
      return false;
    }
    console.log("Veuillez répondre par 'o' (oui) ou 'n' (non)");
  }
}

// Check if osv-scanner is installed
function checkOsvScanner(): boolean {
  try {
    const result = spawnSync('osv-scanner', ['--version'], { encoding: 'utf-8' });
    return result.status === 0;
  } catch {
    return false;
  }
}

// Check if package.json exists
function checkPackageJson(): boolean {
  return fs.existsSync('package.json');
}

// Extract dependencies from package.json
function extractDependenciesFromPackageJson(packageJsonPath: string): [Set<string>, Set<string>] {
  try {
    const content = fs.readFileSync(packageJsonPath, 'utf-8');
    const packageJson: PackageJson = JSON.parse(content);
    const deps = new Set(Object.keys(packageJson.dependencies || {}));
    const devDeps = new Set(Object.keys(packageJson.devDependencies || {}));
    return [deps, devDeps];
  } catch {
    return [new Set(), new Set()];
  }
}

// Get workspace paths from patterns
function getWorkspacePaths(workspaces: string[]): string[] {
  const workspacePaths: string[] = [];

  for (const workspacePattern of workspaces) {
    if (workspacePattern.includes('*')) {
      const baseDir = workspacePattern.replace('/*', '');
      if (fs.existsSync(baseDir) && fs.statSync(baseDir).isDirectory()) {
        const dirs = fs.readdirSync(baseDir);
        for (const dir of dirs) {
          const pkgJson = path.join(baseDir, dir, 'package.json');
          if (fs.existsSync(pkgJson)) {
            workspacePaths.push(pkgJson);
          }
        }
      }
    } else {
      const pkgJson = path.join(workspacePattern, 'package.json');
      if (fs.existsSync(pkgJson)) {
        workspacePaths.push(pkgJson);
      }
    }
  }

  return workspacePaths;
}

// Get all dependencies from root and workspaces
function getDependencies(): [Set<string>, Set<string>] {
  const allDeps = new Set<string>();
  const allDevDeps = new Set<string>();

  // Extract from root package.json
  const [deps, devDeps] = extractDependenciesFromPackageJson('package.json');
  deps.forEach((d) => allDeps.add(d));
  devDeps.forEach((d) => allDevDeps.add(d));

  // Check for workspaces
  try {
    const content = fs.readFileSync('package.json', 'utf-8');
    const packageJson: PackageJson = JSON.parse(content);
    let workspaces = packageJson.workspaces || [];

    // Handle workspaces as object
    if (typeof workspaces === 'object' && !Array.isArray(workspaces)) {
      workspaces = (workspaces as any).packages || [];
    }

    // Get all workspace paths
    const workspacePaths = getWorkspacePaths(workspaces as string[]);

    // Extract dependencies from each workspace
    for (const workspacePkg of workspacePaths) {
      const [wDeps, wDevDeps] = extractDependenciesFromPackageJson(workspacePkg);
      wDeps.forEach((d) => allDeps.add(d));
      wDevDeps.forEach((d) => allDevDeps.add(d));
    }
  } catch {
    // Ignore errors
  }

  return [allDeps, allDevDeps];
}

// Update packages (wrapper function for backwards compatibility)
function updatePackages(packageManager: PackageManager): boolean {
  try {
    printInfo(`Mise à jour des packages avec ${packageManager.name}...`);
    return packageManager.update();
  } catch {
    printError('Erreur lors de la mise à jour des packages');
    return false;
  }
}

// Run osv-scanner
function runOsvScan(lockfile: string): any | null {
  try {
    printInfo(`Analyse avec osv-scanner (lockfile: ${lockfile})...`);
    const result = spawnSync(
      'osv-scanner',
      [`--lockfile=${lockfile}`, '--format=json', '--config=/dev/null'],
      { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 }
    );

    if (result.stdout) {
      return JSON.parse(result.stdout);
    }
    return null;
  } catch (error) {
    printError('Erreur lors du parsing du résultat JSON');
    return null;
  }
}



// Extract package names from chain
function extractPackageNamesFromChain(depChain: string): string[] {
  const packages: string[] = [];
  const parts = depChain.includes(' | ') ? depChain.split(' | ') : depChain.split(' → ');

  for (const part of parts) {
    const cleaned = part.trim();
    const match = cleaned.match(/^(@?[^@\s]+)/);
    if (match) {
      packages.push(match[1]);
    }
  }

  return packages;
}

// Get dependency chain (wrapper function for backwards compatibility)
function getDependencyChain(packageManager: PackageManager, packageName: string, version: string): string {
  return packageManager.getDependencyChain(packageName, version);
}

// Ask AI for suggestion
async function askAiForSuggestion(
  pkgName: string,
  pkgVersion: string,
  vulnIds: string[],
  severities: string[],
  depChain: string,
  isDevDependency: boolean,
  dependencies: Set<string>,
  devDependencies: Set<string>
): Promise<[string, string] | null> {
  try {
    const client = new AzureAIClient();

    const prompt = `Tu es un expert en sécurité des applications Node.js. Analyse cette vulnérabilité et recommande une action.

Package: ${pkgName}@${pkgVersion}
Vulnerability IDs: ${vulnIds.join(', ')}
Severities: ${severities.join(', ')}
Is dev dependency: ${isDevDependency ? 'Yes' : 'No'}
Dependency chain: ${depChain}

Production dependencies: ${Array.from(dependencies).join(', ')}
Dev dependencies: ${Array.from(devDependencies).join(', ')}

Réponds UNIQUEMENT avec un JSON dans ce format exact:
{
  "choice": "1" ou "2" ou "3" ou "4",
  "justification": "courte explication"
}

Légende des choix:
1. Aucune version corrigée disponible
2. Dépendance de développement uniquement
3. Code non exécuté en production
4. Nécessite action manuelle`;

    const response = await client.askQuestion(prompt, 'gpt-4', 2000, 0.3);

    if (response) {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return [parsed.choice, parsed.justification];
      }
    }

    return null;
  } catch (error: any) {
    printWarning(`Erreur IA: ${error.message}`);
    return null;
  }
}

// Suggest reason
async function suggestReason(
  pkgName: string,
  pkgVersion: string,
  vulnIds: string[],
  severities: string[],
  depChain: string,
  dependencies: Set<string>,
  devDependencies: Set<string>
): Promise<[string, boolean]> {
  // Auto-detect if dev dependency
  let isDevDependency = false;
  const packagesInChain = extractPackageNamesFromChain(depChain);

  for (const pkg of packagesInChain) {
    if (devDependencies.has(pkg)) {
      isDevDependency = true;
      break;
    }
  }

  if (depChain.toLowerCase().includes('devdependencies') || depChain.toLowerCase().includes('dev-dep')) {
    isDevDependency = true;
  }

  // Ask AI for suggestion
  const aiSuggestion = await askAiForSuggestion(
    pkgName,
    pkgVersion,
    vulnIds,
    severities,
    depChain,
    isDevDependency,
    dependencies,
    devDependencies
  );

  // Interactive form
  console.log(`\n${chalk.cyan('═'.repeat(70))}`);
  console.log(`${chalk.cyan('VULNÉRABILITÉ DÉTECTÉE')}`);
  console.log(`${chalk.cyan('═'.repeat(70))}`);
  console.log(`\n📦 ${chalk.yellow('Package:')} ${pkgName}@${pkgVersion}`);
  console.log(`🔍 ${chalk.yellow('Vulnérabilité IDs:')} ${vulnIds.join(', ')}`);

  const severityStr = severities.length > 0 ? severities.join(', ') : 'UNKNOWN';
  const severityColor = severities.some((s) => ['CRITICAL', 'HIGH'].includes(s)) ? chalk.red : chalk.yellow;
  console.log(`⚡ ${chalk.yellow('Sévérité:')} ${severityColor(severityStr)}`);

  console.log(`\n${chalk.yellow('Utilisé par:')}`);
  const depLines = depChain.includes(' | ') ? depChain.split(' | ') : depChain.split(' → ');
  for (const depLine of depLines.slice(0, 5)) {
    console.log(`  ${depLine}`);
  }

  if (isDevDependency) {
    console.log(`\n${chalk.green('✓ Détecté comme dépendance de développement')}`);
  }

  // Display AI suggestion
  if (aiSuggestion) {
    const [choice, justification] = aiSuggestion;
    console.log(`\n${chalk.magenta('🤖 Suggestion IA:')}`);
    console.log(`   Choix recommandé: ${chalk.cyan(choice)}`);
    console.log(`   ${chalk.gray(justification)}`);
  }

  console.log(`\n${chalk.cyan('Choisissez la raison pour ignorer cette vulnérabilité:')}`);
  console.log(`\n  ${chalk.cyan('1.')} 🚨 Aucune version corrigée disponible`);
  console.log(
    `  ${isDevDependency ? chalk.green('2.') : chalk.cyan('2.')} ⚠️  Dépendance de développement uniquement${isDevDependency ? chalk.green(' (suggéré)') : ''}`
  );
  console.log(`  ${chalk.cyan('3.')} ⚠️  Code non exécuté en production`);
  console.log(`  ${chalk.cyan('4.')} ⚠️  Nécessite action manuelle`);

  while (true) {
    const choice = await question('\nVotre choix (1-4)');

    if (choice === '1') {
      return ['🚨 No fix available', false];
    } else if (choice === '2') {
      return ['⚠️ Dev dependency only - not in production', false];
    } else if (choice === '3') {
      return ['⚠️ Not accessible in production', false];
    } else if (choice === '4') {
      return ['⚠️ Requires manual review', true];
    } else {
      console.log(chalk.red('Choix invalide, veuillez entrer un nombre entre 1 et 4'));
    }
  }
}

// Parse vulnerabilities
async function parseVulnerabilities(scanResult: any, packageManager: PackageManager): Promise<Vulnerability[]> {
  const vulnerabilities: Vulnerability[] = [];

  if (!scanResult || !scanResult.results) {
    return vulnerabilities;
  }

  const [dependencies, devDependencies] = getDependencies();

  for (const result of scanResult.results) {
    if (!result.packages) continue;

    for (const pkg of result.packages) {
      const pkgName = pkg.package?.name || 'unknown';
      const pkgVersion = pkg.package?.version || 'unknown';

      const vulnIds: string[] = [];
      const severities: string[] = [];

      if (pkg.vulnerabilities) {
        for (const vuln of pkg.vulnerabilities) {
          vulnIds.push(vuln.id || 'unknown');

          if (vuln.database_specific) {
            const severity = vuln.database_specific.severity || 'UNKNOWN';
            severities.push(severity);
          }
        }
      }

      if (vulnIds.length > 0) {
        const depChain = getDependencyChain(packageManager, pkgName, pkgVersion);

        const [reason, showAlternatives] = await suggestReason(
          pkgName,
          pkgVersion,
          vulnIds,
          severities,
          depChain,
          dependencies,
          devDependencies
        );

        vulnerabilities.push({
          name: pkgName,
          version: pkgVersion,
          vulnerability_ids: vulnIds,
          severities,
          dependency_chain: depChain,
          reason,
          show_alternatives: showAlternatives,
        });
      }
    }
  }

  return vulnerabilities;
}

// Generate TOML config
function generateTomlConfig(vulnerabilities: Vulnerability[], packageManager: PackageManager): [string, Vulnerability[]] {
  const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);

  let config = `# Generated by generate-osv-config
# Date: ${timestamp}
# Package Manager: ${packageManager.name}
# Total vulnerabilities ignored: ${vulnerabilities.length}

`;

  const sortedVulns = [...vulnerabilities].sort((a, b) => {
    if (a.name !== b.name) return a.name.localeCompare(b.name);
    return a.version.localeCompare(b.version);
  });

  for (const vuln of sortedVulns) {
    const depLines = vuln.dependency_chain.includes(' | ')
      ? vuln.dependency_chain.split(' | ')
      : vuln.dependency_chain.split(' → ');
    const depComment = depLines.join('\n#   ');

    let alternativeReasons = '';
    if (vuln.show_alternatives) {
      alternativeReasons = `#
# Alternative reasons to consider:
#   1. 🚨 No fix available
#   2. ⚠️ Dev dependency only - not in production
#   3. ⚠️ Not accessible in production
`;
    }

    config += `[[PackageOverrides]]
# Used by:
#   ${depComment}
# Vulnerability IDs: ${vuln.vulnerability_ids.join(', ')}
# Severity: ${vuln.severities.length > 0 ? vuln.severities.join(', ') : 'UNKNOWN'}
${alternativeReasons}ecosystem = "npm"
name = "${vuln.name}"
version = "${vuln.version}"
ignore = true
reason = "${vuln.reason}"

`;
  }

  return [config, vulnerabilities];
}

// Verify config
function verifyConfig(lockfile: string): boolean {
  try {
    printInfo('Vérification de la configuration...');
    const result = spawnSync('osv-scanner', [`--lockfile=${lockfile}`, '--config=osv-scanner.toml'], {
      encoding: 'utf-8',
    });

    if (result.status === 0) {
      printSuccess('Aucune vulnérabilité détectée avec la nouvelle configuration');
      return true;
    } else {
      printWarning('Certaines vulnérabilités sont encore présentes');
      return false;
    }
  } catch {
    printError('Erreur lors de la vérification');
    return false;
  }
}

// Generate report
function generateReport(vulnerabilities: Vulnerability[], outputFile: string = 'osv-scanner-report.md'): void {
  const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);

  let report = `# OSV-Scanner Vulnerability Report

**Generated:** ${timestamp}  
**Total vulnerabilities ignored:** ${vulnerabilities.length}

## Summary by Severity

`;

  const severityCounts: Record<string, number> = {};
  for (const vuln of vulnerabilities) {
    for (const severity of vuln.severities) {
      severityCounts[severity] = (severityCounts[severity] || 0) + 1;
    }
  }

  for (const [severity, count] of Object.entries(severityCounts).sort()) {
    report += `- **${severity}**: ${count}\n`;
  }

  report += '\n## Ignored Vulnerabilities\n\n';

  const sortedVulns = [...vulnerabilities].sort((a, b) => {
    if (a.name !== b.name) return a.name.localeCompare(b.name);
    return a.version.localeCompare(b.version);
  });

  for (const vuln of sortedVulns) {
    report += `### ${vuln.name}@${vuln.version}\n\n`;
    report += `- **Vulnerability IDs:** ${vuln.vulnerability_ids.join(', ')}\n`;
    report += `- **Severity:** ${vuln.severities.length > 0 ? vuln.severities.join(', ') : 'UNKNOWN'}\n`;
    report += `- **Reason:** ${vuln.reason}\n`;
    report += `- **Used by:** ${vuln.dependency_chain}\n\n`;
  }

  report += '\n## Recommendations\n\n';
  report += '- Review this configuration in 30 days\n';
  report += '- Monitor for new vulnerabilities regularly\n';
  report += '- Update dependencies when fixes become available\n';

  fs.writeFileSync(outputFile, report, 'utf-8');
  printSuccess(`Rapport généré: ${outputFile}`);
}

// Main function
async function main() {
  program
    .name('generate-osv-config')
    .description('Generate OSV-Scanner configuration from vulnerability scan')
    .option('-d, --dry-run', 'Show what would be done without creating files')
    .option('-r, --report', 'Generate a markdown report')
    .parse(process.argv);

  const options = program.opts();

  // 1. Validate environment
  printInfo('Validation de l\'environnement...');

  if (!checkOsvScanner()) {
    printError('osv-scanner n\'est pas installé');
    printInfo('Installation: go install github.com/google/osv-scanner/cmd/osv-scanner@latest');
    process.exit(1);
  }

  if (!checkPackageJson()) {
    printError('Aucun projet Node.js détecté (package.json absent)');
    process.exit(1);
  }

  // Check osv-scanner.toml
  const configExists = fs.existsSync('osv-scanner.toml');
  if (configExists) {
    if (!options.dryRun) {
      if (await askConfirmation('Un fichier osv-scanner.toml existe déjà. Voulez-vous le sauvegarder ?', true)) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19).replace('T', '_');
        const backupName = `osv-scanner.toml.backup.${timestamp}`;
        fs.renameSync('osv-scanner.toml', backupName);
        printSuccess(`Sauvegarde créée: ${backupName}`);
      }
    }
  } else {
    const currentDir = process.cwd();
    printInfo(`Répertoire courant: ${chalk.cyan(currentDir)}`);
    if (!options.dryRun) {
      if (!(await askConfirmation('Créer le fichier osv-scanner.toml ?', false))) {
        printInfo('Opération annulée');
        process.exit(0);
      }
    }
  }

  // 2. Detect package manager
  const packageManager = detectPackageManager();
  if (!packageManager) {
    printError('Impossible de détecter le package manager');
    process.exit(1);
  }

  const pmVersion = packageManager.getVersion();

  if (!pmVersion) {
    printError(`${packageManager.name} n'est pas installé ou accessible`);
    process.exit(1);
  }

  console.log(`📦 Package manager détecté: ${chalk.cyan(packageManager.name)} v${pmVersion}`);

  // 3. Update packages (optional)
  if (!options.dryRun) {
    updatePackages(packageManager);
  }

  // 4. Run OSV-Scanner
  const scanResult = runOsvScan(packageManager.lockfile);
  if (!scanResult) {
    printWarning('Aucune vulnérabilité détectée ou erreur lors du scan');
    process.exit(0);
  }

  // 5. Parse vulnerabilities
  const vulnerabilities = await parseVulnerabilities(scanResult, packageManager);

  if (vulnerabilities.length === 0) {
    printSuccess('Aucune vulnérabilité à traiter');
    process.exit(0);
  }

  const uniquePackages = new Set(vulnerabilities.map((v) => `${v.name}@${v.version}`)).size;
  console.log(`🔍 ${vulnerabilities.length} vulnérabilités détectées dans ${uniquePackages} packages`);

  // 6. Generate configuration file
  if (options.dryRun) {
    printInfo('Mode dry-run: aucun fichier ne sera créé');
    const [configContent] = generateTomlConfig(vulnerabilities, packageManager);
    console.log('\n--- Contenu du fichier osv-scanner.toml ---');
    console.log(configContent);
  } else {
    const [configContent, filteredVulns] = generateTomlConfig(vulnerabilities, packageManager);
    fs.writeFileSync('osv-scanner.toml', configContent, 'utf-8');
    printSuccess(`Fichier osv-scanner.toml créé avec ${filteredVulns.length} vulnérabilités ignorées`);

    // 7. Verify configuration
    verifyConfig(packageManager.lockfile);

    // 8. Generate report
    if (options.report) {
      generateReport(filteredVulns);
    }
  }

  process.exit(0);
}

// Run main
main().catch((error) => {
  printError(`Erreur fatale: ${error.message}`);
  process.exit(1);
});
