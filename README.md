# OSV Config Tool - TypeScript

Generate OSV-Scanner configuration from vulnerability scan.

## Description

Analyses vulnerabilities detected by osv-scanner and generates an `osv-scanner.toml` configuration file to ignore vulnerabilities after manual or AI validation.

## Prerequisites

**Required binaries:**
- `osv-scanner`: Vulnerability scanning tool
  ```bash
  go install github.com/google/osv-scanner/cmd/osv-scanner@latest
  ```
- `yarn`, `npm`, or `pnpm`: Node.js package manager (automatic detection)

## Environment Variables

**Optional - Required for AI suggestions:**
- `AZUREAI_API_KEY`: Azure OpenAI API key
- `AZUREAI_BASE_URL`: Azure OpenAI service URL (e.g., `https://your-resource.openai.azure.com`)
- `AZUREAI_API_VERSION`: API version (e.g., `2023-05-15`)
- `AZUREAI_DEPLOYMENT`: Azure OpenAI deployment name (e.g., `CommuniCity`)

**Note:** The script works without Azure AI variables, but automatic suggestions will not be available.

## Installation

### As a dependency in your project

```bash
npm install osv-config-tool --save-dev
# or
yarn add osv-config-tool --dev
# or
pnpm add osv-config-tool --save-dev
```

### For development

```bash
npm install
npm run build
```

## Usage

### Using as an installed dependency

After installing the package as a dependency, you can run it using npx or add it to your scripts:

```bash
# Using npx
npx generate-osv-config

# Or add to package.json scripts
{
  "scripts": {
    "check-vulnerabilities": "generate-osv-config",
    "check-vulnerabilities:dry-run": "generate-osv-config --dry-run"
  }
}
```

### Using in development mode

```bash
# Interactive normal mode
npm start

# Or use the built script directly
node dist/index.js

# Preview without creating files
npm start -- --dry-run

# Generate markdown report
npm start -- --report

# Both options
npm start -- --dry-run --report
```

## How It Works

1. Detects package manager (yarn/npm/pnpm) and its lockfile
2. Runs osv-scanner to identify vulnerabilities
3. For each detected vulnerability:
   - Extracts dependency chain (via 'yarn why', 'npm ls' or 'pnpm why')
   - Analyzes if it's a dev or production dependency
   - Asks AI for a suggestion (if configured)
   - Proposes 4 options to user:
     1. No fixed version available
     2. Dev dependency only
     3. Code not executed in production
     4. Requires manual action
4. Generates `osv-scanner.toml` file with ignored vulnerabilities
5. Verifies configuration by re-running osv-scanner

## Development

```bash
# Build TypeScript
npm run build

# Clean build artifacts
npm run clean

# Build and run
npm run dev
```

## Project Structure

```
typescript/
├── src/
│   ├── helpers/
│   │   ├── azureAi.ts      # Azure AI client
│   │   ├── console.ts       # Console utilities
│   │   └── httpClient.ts    # HTTP client
│   └── index.ts             # Main script
├── dist/                    # Compiled JavaScript (generated)
├── package.json
├── tsconfig.json
└── README.md
```

## License

MIT
