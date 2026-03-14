import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { createInfrastructureDoctor } from "./doctor.mjs";
import {
  cloneDefaultInfraConfig,
  createDefaultPackageManifest,
  createDefaultReadme,
  DEFAULT_CI_WORKFLOW,
  DEFAULT_EDITORCONFIG,
  DEFAULT_GITATTRIBUTES,
  DEFAULT_GITIGNORE,
  DEFAULT_PACKAGE_SCRIPTS,
  normalizePackageName,
  toTitle
} from "./defaults.mjs";
import { loadInfrastructureConfig } from "./policy.mjs";
import { collectInfrastructureReport } from "./report.mjs";

function ensureDirectory(directoryPath) {
  mkdirSync(directoryPath, { recursive: true });
}

function parseFixArgs(args) {
  const parsed = {
    dryRun: false,
    json: false
  };

  for (const arg of args) {
    if (arg === "--dry-run") {
      parsed.dryRun = true;
    } else if (arg === "--json") {
      parsed.json = true;
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  return parsed;
}

function resolveConfig({ cwd, config, configPath }) {
  if (config) {
    return {
      config,
      usedDefaultConfig: false
    };
  }

  try {
    return {
      config: loadInfrastructureConfig({ cwd, configPath }),
      usedDefaultConfig: false
    };
  } catch (error) {
    if (error instanceof Error && error.message.includes("Infrastructure config not found")) {
      return {
        config: cloneDefaultInfraConfig(),
        usedDefaultConfig: true
      };
    }

    throw error;
  }
}

function writeTextFile(cwd, relativePath, content, dryRun, operations, description) {
  const absolutePath = path.join(cwd, relativePath);

  if (!dryRun) {
    ensureDirectory(path.dirname(absolutePath));
    writeFileSync(absolutePath, content);
  }

  operations.push({
    id: relativePath,
    kind: "file",
    path: relativePath,
    description
  });
}

function createMissingFiles(cwd, config, findingsById, dryRun, operations) {
  const title = toTitle(path.basename(cwd));
  const fileTemplates = {
    "README.md": createDefaultReadme(title),
    ".gitignore": DEFAULT_GITIGNORE,
    ".editorconfig": DEFAULT_EDITORCONFIG,
    ".gitattributes": DEFAULT_GITATTRIBUTES,
    "infra.config.json": `${JSON.stringify(config, null, 2)}\n`
  };

  for (const relativePath of config.requirements.files) {
    if (findingsById.get(`file:${relativePath}`)?.status !== "fail") {
      continue;
    }

    const template = fileTemplates[relativePath];

    if (template) {
      writeTextFile(
        cwd,
        relativePath,
        template,
        dryRun,
        operations,
        `Created ${relativePath} from the default baseline.`
      );
    }
  }
}

function createMissingDirectories(cwd, config, findingsById, dryRun, operations) {
  for (const relativePath of config.requirements.directories) {
    if (findingsById.get(`directory:${relativePath}`)?.status !== "fail") {
      continue;
    }

    if (!dryRun) {
      ensureDirectory(path.join(cwd, relativePath));
    }

    operations.push({
      id: relativePath,
      kind: "directory",
      path: relativePath,
      description: `Created ${relativePath}/.`
    });
  }
}

function createMissingWorkflow(cwd, config, findingsById, dryRun, operations) {
  if (findingsById.get("ci-workflow")?.status !== "fail") {
    return;
  }

  writeTextFile(
    cwd,
    config.requirements.ciWorkflow,
    DEFAULT_CI_WORKFLOW,
    dryRun,
    operations,
    `Created ${config.requirements.ciWorkflow} from the default CI baseline.`
  );
}

function loadPackageJson(cwd) {
  const packageJsonPath = path.join(cwd, "package.json");

  if (!existsSync(packageJsonPath)) {
    return null;
  }

  try {
    return JSON.parse(readFileSync(packageJsonPath, "utf8"));
  } catch (error) {
    throw new Error(`package.json could not be parsed at ${packageJsonPath}: ${error.message}`);
  }
}

function repairPackageJson(cwd, config, findingsById, dryRun, operations) {
  const scriptsFindingFailed = findingsById.get("package-json-scripts")?.status === "fail";
  const engineFindingFailed = findingsById.get("package-json-node-engine")?.status === "fail";

  if (!scriptsFindingFailed && !engineFindingFailed) {
    return;
  }

  const packageJsonPath = path.join(cwd, "package.json");
  const expectedEngine = `>=${config.requirements.nodeMajorGte}`;
  const existingPackageJson = loadPackageJson(cwd);
  const packageJson = existingPackageJson ?? createDefaultPackageManifest({
    packageName: normalizePackageName(path.basename(cwd)),
    nodeMajorGte: config.requirements.nodeMajorGte
  });
  let created = false;
  let scriptsAdded = [];
  let engineAligned = false;

  if (!existingPackageJson) {
    created = true;
  }

  if (!packageJson.scripts || typeof packageJson.scripts !== "object" || Array.isArray(packageJson.scripts)) {
    packageJson.scripts = {};
  }

  if (scriptsFindingFailed) {
    scriptsAdded = config.requirements.packageJson.requiredScripts.filter(
      (scriptName) => typeof packageJson.scripts[scriptName] !== "string"
    );

    for (const scriptName of scriptsAdded) {
      packageJson.scripts[scriptName] = DEFAULT_PACKAGE_SCRIPTS[scriptName];
    }
  }

  if (!packageJson.engines || typeof packageJson.engines !== "object" || Array.isArray(packageJson.engines)) {
    packageJson.engines = {};
  }

  if (engineFindingFailed && packageJson.engines.node !== expectedEngine) {
    packageJson.engines.node = expectedEngine;
    engineAligned = true;
  }

  if (created || scriptsAdded.length || engineAligned) {
    if (!dryRun) {
      writeFileSync(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`);
    }
  }

  if (created) {
    operations.push({
      id: "package.json",
      kind: "file",
      path: "package.json",
      description: "Created package.json with the default infrastructure baseline."
    });
  }

  if (scriptsAdded.length) {
    operations.push({
      id: "package-json-scripts",
      kind: "package-json",
      path: "package.json",
      description: `Added missing package.json scripts: ${scriptsAdded.map((scriptName) => `\`${scriptName}\``).join(", ")}.`
    });
  }

  if (engineAligned) {
    operations.push({
      id: "package-json-node-engine",
      kind: "package-json",
      path: "package.json",
      description: `Aligned package.json engines.node to \`${expectedEngine}\`.`
    });
  }
}

function applyAutomaticFixes(cwd, config, beforeReport, dryRun) {
  const findingsById = new Map(beforeReport.findings.map((finding) => [finding.id, finding]));
  const operations = [];

  createMissingFiles(cwd, config, findingsById, dryRun, operations);
  createMissingDirectories(cwd, config, findingsById, dryRun, operations);
  createMissingWorkflow(cwd, config, findingsById, dryRun, operations);
  repairPackageJson(cwd, config, findingsById, dryRun, operations);

  return operations;
}

export function runInfrastructureFix({
  cwd = process.cwd(),
  args = [],
  config,
  configPath
} = {}) {
  const parsed = parseFixArgs(args);
  const resolved = resolveConfig({ cwd, config, configPath });
  const beforeReport = collectInfrastructureReport({
    cwd,
    config: resolved.config,
    configPath
  });
  const operations = applyAutomaticFixes(
    cwd,
    resolved.config,
    beforeReport,
    parsed.dryRun
  );
  const afterReport = parsed.dryRun
    ? beforeReport
    : collectInfrastructureReport({
        cwd,
        config: resolved.config,
        configPath
      });
  const doctor = createInfrastructureDoctor({
    cwd,
    config: resolved.config,
    configPath
  });

  const summary = {
    mode: parsed.dryRun ? "dry-run" : "apply",
    pass: afterReport.summary.pass,
    operationCount: operations.length,
    remainingRequiredCount: doctor.summary.requiredCount,
    remainingSuggestedCount: doctor.summary.suggestedCount,
    usedDefaultConfig: resolved.usedDefaultConfig
  };

  const result = {
    before: beforeReport,
    after: afterReport,
    operations,
    remainingActions: doctor.actions,
    summary
  };

  return {
    result,
    output: parsed.json
      ? JSON.stringify(result, null, 2)
      : formatMarkdownFix(result),
    exitCode: afterReport.summary.pass ? 0 : 1
  };
}

export function formatMarkdownFix(result) {
  const lines = [
    "# Infrastructure Fix",
    "",
    `Mode: \`${result.summary.mode}\``,
    `Automatic changes: \`${result.summary.operationCount}\``,
    `Remaining required actions: \`${result.summary.remainingRequiredCount}\``,
    `Remaining suggested actions: \`${result.summary.remainingSuggestedCount}\``,
    `Policy after fix: \`${result.summary.pass ? "pass" : "fail"}\``,
    ""
  ];

  if (result.summary.usedDefaultConfig) {
    lines.push("Used the built-in default infrastructure config because `infra.config.json` was missing.");
    lines.push("");
  }

  if (result.operations.length) {
    lines.push("## Automatic Changes");
    lines.push(...result.operations.map((operation) => `- ${operation.description}`));
    lines.push("");
  } else {
    lines.push("No automatic fixes were needed.");
    lines.push("");
  }

  if (result.remainingActions.length) {
    lines.push("## Remaining Actions");
    for (const action of result.remainingActions) {
      lines.push(`- [${action.priority}] ${action.title}`);
      lines.push(`  Rationale: ${action.rationale}`);
    }
  } else {
    lines.push("No remaining actions.");
  }

  return lines.join("\n");
}
