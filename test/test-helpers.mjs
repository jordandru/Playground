import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export const DEFAULT_INFRA_CONFIG = {
  requirements: {
    nodeMajorGte: 24,
    files: ["README.md", ".gitignore", ".editorconfig", ".gitattributes", "infra.config.json"],
    directories: ["src", "test"],
    ciWorkflow: ".github/workflows/ci.yml",
    packageJson: {
      requiredScripts: ["infra:check", "infra:doctor", "infra:snapshot", "test", "check"]
    },
    git: {
      mustExist: true,
      mustHaveCommit: false,
      mustHaveRemote: false
    }
  }
};

function ensureDirectory(directoryPath) {
  mkdirSync(directoryPath, { recursive: true });
}

function writeWorkspaceFile(root, relativePath, content) {
  const absolutePath = path.join(root, relativePath);
  ensureDirectory(path.dirname(absolutePath));
  writeFileSync(absolutePath, content);
}

function createPackageJsonContent(config, options) {
  const missingScripts = new Set(options.missingScripts ?? []);
  const requiredScripts = config.requirements.packageJson.requiredScripts;
  const scripts = {};

  for (const scriptName of requiredScripts) {
    if (!missingScripts.has(scriptName)) {
      scripts[scriptName] = "node -e \"process.exit(0)\"";
    }
  }

  if (options.extraScripts) {
    Object.assign(scripts, options.extraScripts);
  }

  return `${JSON.stringify(
    {
      name: "temp-workspace",
      private: true,
      type: "module",
      engines: {
        node: options.packageNodeEngine ?? `>=${config.requirements.nodeMajorGte}`
      },
      scripts
    },
    null,
    2
  )}\n`;
}

export function createTempWorkspace(options = {}) {
  const root = mkdtempSync(path.join(os.tmpdir(), "playground-infra-"));
  const missingFiles = new Set(options.missingFiles ?? []);
  const missingDirectories = new Set(options.missingDirectories ?? []);
  const config = options.config
    ? JSON.parse(JSON.stringify(options.config))
    : JSON.parse(JSON.stringify(DEFAULT_INFRA_CONFIG));

  if (options.writeConfig !== false && !missingFiles.has("infra.config.json")) {
    writeWorkspaceFile(root, "infra.config.json", `${JSON.stringify(config, null, 2)}\n`);
  }

  const rootFiles = {
    "README.md": "# Temp Workspace\n",
    ".gitignore": "node_modules/\n",
    ".editorconfig": "root = true\n",
    ".gitattributes": "* text=auto\n",
    "package.json": createPackageJsonContent(config, options)
  };

  for (const [relativePath, content] of Object.entries(rootFiles)) {
    if (!missingFiles.has(relativePath)) {
      writeWorkspaceFile(root, relativePath, content);
    }
  }

  for (const relativePath of ["src", "test"]) {
    if (!missingDirectories.has(relativePath)) {
      ensureDirectory(path.join(root, relativePath));
    }
  }

  if (options.withCi !== false) {
    writeWorkspaceFile(root, ".github/workflows/ci.yml", "name: CI\n");
  }

  if (options.withGit !== false) {
    writeWorkspaceFile(root, ".git/HEAD", "ref: refs/heads/master\n");

    const configLines = [
      "[core]",
      "\trepositoryformatversion = 0",
      "\tfilemode = false",
      "\tbare = false"
    ];

    if (options.withRemote) {
      configLines.push("", "[remote \"origin\"]", "\turl = https://example.com/repo.git");
    }

    writeWorkspaceFile(root, ".git/config", `${configLines.join("\n")}\n`);

    if (options.withCommit) {
      writeWorkspaceFile(
        root,
        ".git/refs/heads/master",
        "1111111111111111111111111111111111111111\n"
      );
    }
  }

  return {
    root,
    config,
    cleanup() {
      rmSync(root, { recursive: true, force: true });
    }
  };
}

export function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

export function repoPath(...segments) {
  return path.join(repoRoot, ...segments);
}
