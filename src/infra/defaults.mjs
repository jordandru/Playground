export const DEFAULT_PACKAGE_SCRIPTS = {
  "infra:init": "node ./scripts/infra-init.mjs",
  "infra:report": "node ./scripts/infra-report.mjs",
  "infra:check": "node ./scripts/infra-check.mjs",
  "infra:doctor": "node ./scripts/infra-doctor.mjs",
  "infra:fix": "node ./scripts/infra-fix.mjs",
  "infra:snapshot": "node ./scripts/infra-snapshot.mjs",
  "infra:diff": "node ./scripts/infra-diff.mjs",
  "test": "node ./test/run-tests.mjs",
  "check": "node ./scripts/check.mjs"
};

export const DEFAULT_INFRA_CONFIG = {
  requirements: {
    nodeMajorGte: 24,
    files: ["README.md", ".gitignore", ".editorconfig", ".gitattributes", "infra.config.json"],
    directories: ["src", "test"],
    ciWorkflow: ".github/workflows/ci.yml",
    packageJson: {
      requiredScripts: ["infra:check", "infra:doctor", "infra:fix", "infra:init", "infra:snapshot", "test", "check"]
    },
    git: {
      mustExist: true,
      mustHaveCommit: false,
      mustHaveRemote: false
    }
  }
};

export const DEFAULT_EDITORCONFIG = `root = true

[*.{js,mjs,cjs,json,md,yml,yaml}]
charset = utf-8
end_of_line = lf
insert_final_newline = true
indent_style = space
indent_size = 2
trim_trailing_whitespace = true

[*.md]
trim_trailing_whitespace = false
`;

export const DEFAULT_GITATTRIBUTES = "* text=auto eol=lf\n";

export const DEFAULT_GITIGNORE = `node_modules/
coverage/
dist/
*.log
*.tmp
infra-report.json
reports/infra/*
!reports/infra/.gitkeep
`;

export const DEFAULT_CI_WORKFLOW = `name: CI

on:
  push:
  pull_request:

jobs:
  verify:
    name: Verify on \${{ matrix.os }}
    runs-on: \${{ matrix.os }}
    strategy:
      fail-fast: false
      matrix:
        os:
          - ubuntu-latest
          - windows-latest
        node:
          - 24

    steps:
      - name: Check out repository
        uses: actions/checkout@v6

      - name: Set up Node.js
        uses: actions/setup-node@v6
        with:
          node-version: \${{ matrix.node }}

      - name: Run test suite
        run: npm test

      - name: Check infrastructure policy
        run: npm run infra:check

      - name: Snapshot infrastructure
        run: npm run infra:snapshot

      - name: Upload infrastructure artifact
        uses: actions/upload-artifact@v6
        with:
          name: infra-\${{ matrix.os }}
          path: reports/infra
`;

export function cloneDefaultInfraConfig() {
  return JSON.parse(JSON.stringify(DEFAULT_INFRA_CONFIG));
}

export function normalizePackageName(rawName) {
  const normalized = rawName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");

  return normalized || "playground";
}

export function toTitle(rawName) {
  return rawName
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim() || "Playground";
}

export function createDefaultPackageManifest({
  packageName = "playground",
  nodeMajorGte = DEFAULT_INFRA_CONFIG.requirements.nodeMajorGte,
  description = "Zero-dependency Node starter with infrastructure assessment tooling."
} = {}) {
  return {
    name: packageName,
    version: "0.1.0",
    private: true,
    description,
    type: "module",
    engines: {
      node: `>=${nodeMajorGte}`
    },
    scripts: { ...DEFAULT_PACKAGE_SCRIPTS }
  };
}

export function createDefaultPackageJson(options = {}) {
  return `${JSON.stringify(createDefaultPackageManifest(options), null, 2)}\n`;
}

export function createDefaultReadme(title = "Playground") {
  return `# ${title}

This repository uses the infrastructure-first Node scaffold.

## Core Scripts

- \`npm test\`
- \`npm run infra:check\`
- \`npm run infra:doctor\`
- \`npm run infra:fix\`
- \`npm run infra:init -- <target-directory>\`
`;
}
