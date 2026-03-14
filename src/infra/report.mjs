import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  evaluateInfrastructurePolicy,
  loadInfrastructureConfig
} from "./policy.mjs";

function readTextIfExists(filePath) {
  try {
    return readFileSync(filePath, "utf8");
  } catch {
    return null;
  }
}

function collectNodeDetails() {
  return {
    available: true,
    command: process.execPath,
    version: process.version
  };
}

function collectNpmDetails() {
  const npmUserAgent = process.env.npm_config_user_agent ?? "";
  const match = npmUserAgent.match(/\bnpm\/([^\s]+)/);

  return {
    available: Boolean(process.env.npm_execpath || match),
    command: process.env.npm_execpath ?? (process.platform === "win32" ? "npm.cmd" : "npm"),
    version: match?.[1] ?? null
  };
}

function resolveGitDir(cwd) {
  const dotGit = path.join(cwd, ".git");

  if (!existsSync(dotGit)) {
    return null;
  }

  try {
    if (statSync(dotGit).isDirectory()) {
      return dotGit;
    }
  } catch {
    return null;
  }

  const pointer = readTextIfExists(dotGit);
  const match = pointer?.match(/^gitdir:\s*(.+)$/m);

  return match ? path.resolve(cwd, match[1].trim()) : null;
}

function gitRefExists(gitDir, ref) {
  if (existsSync(path.join(gitDir, ref))) {
    return true;
  }

  const packedRefs = readTextIfExists(path.join(gitDir, "packed-refs")) ?? "";
  const pattern = new RegExp(`^[0-9a-f]{40} ${ref.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "m");

  return pattern.test(packedRefs);
}

function collectGitDetails(cwd) {
  const gitDir = resolveGitDir(cwd);

  if (!gitDir) {
    return {
      available: false,
      insideWorkTree: false,
      branch: null,
      hasCommits: false,
      remotes: [],
      statusLines: [],
      statusInspected: false
    };
  }

  const head = readTextIfExists(path.join(gitDir, "HEAD"))?.trim() ?? "";
  let branch = null;
  let hasCommits = false;

  if (head.startsWith("ref: ")) {
    const ref = head.slice(5).trim();
    branch = ref.startsWith("refs/heads/") ? ref.slice("refs/heads/".length) : ref;
    hasCommits = gitRefExists(gitDir, ref);
  } else if (/^[0-9a-f]{40}$/i.test(head)) {
    branch = "detached";
    hasCommits = true;
  }

  const config = readTextIfExists(path.join(gitDir, "config")) ?? "";
  const remotes = Array.from(
    config.matchAll(/^\[remote "([^"]+)"\]/gm),
    (match) => match[1]
  );

  return {
    available: true,
    insideWorkTree: true,
    branch,
    hasCommits,
    remotes,
    statusLines: [],
    statusInspected: false
  };
}

function collectTopLevelEntries(cwd) {
  return readdirSync(cwd, { withFileTypes: true })
    .filter((entry) => entry.name !== ".git")
    .map((entry) => ({
      name: entry.name,
      type: entry.isDirectory() ? "dir" : "file"
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

function collectProjectSignals(cwd) {
  return {
    infraConfig: existsSync(path.join(cwd, "infra.config.json")),
    packageJson: existsSync(path.join(cwd, "package.json")),
    readme: existsSync(path.join(cwd, "README.md")),
    gitignore: existsSync(path.join(cwd, ".gitignore")),
    editorconfig: existsSync(path.join(cwd, ".editorconfig")),
    gitattributes: existsSync(path.join(cwd, ".gitattributes")),
    sourceDirectory: existsSync(path.join(cwd, "src")),
    testDirectory: existsSync(path.join(cwd, "test")),
    ciWorkflow: existsSync(path.join(cwd, ".github", "workflows", "ci.yml"))
  };
}

export function deriveObservations(report) {
  const observations = [];

  if (report.tools.node.available && report.tools.npm.available) {
    observations.push(
      "The workspace is aligned to a Node.js workflow with no extra runtime dependencies required."
    );
  }

  if (report.git.available && !report.git.hasCommits) {
    observations.push(
      "The Git repository is initialized but still has no commits, so structural changes are especially cheap right now."
    );
  }

  if (report.project.ciWorkflow) {
    observations.push(
      "Continuous integration is already wired in, which gives future code a place to prove it still works."
    );
  }

  if (report.project.sourceDirectory && report.project.testDirectory) {
    observations.push(
      "Source and test directories exist from the start, which keeps later application code from being the first thing to define project layout."
    );
  }

  if (!observations.length) {
    observations.push("The workspace is still sparse, so conventions have not solidified yet.");
  }

  return observations;
}

export function deriveRecommendations(report) {
  const recommendations = [];

  if (!report.git.hasCommits) {
    recommendations.push("Review the scaffold and make the first commit once the baseline feels right.");
  }

  recommendations.push(
    "Extend the infrastructure report with domain-specific checks as new tooling or services are introduced."
  );

  if (report.git.statusLines.length) {
    recommendations.push("Use the current working tree as a checklist before you lock the repository shape in.");
  }

  return recommendations;
}

export function collectInfrastructureReport({
  cwd = process.cwd(),
  config,
  configPath
} = {}) {
  const policyConfig = config ?? loadInfrastructureConfig({ cwd, configPath });
  const report = {
    generatedAt: new Date().toISOString(),
    workspaceRoot: cwd,
    host: {
      platform: process.platform,
      arch: os.arch(),
      release: os.release(),
      cpuCount: os.cpus().length
    },
    tools: {
      node: collectNodeDetails(),
      npm: collectNpmDetails()
    },
    git: collectGitDetails(cwd),
    project: collectProjectSignals(cwd),
    topLevelEntries: collectTopLevelEntries(cwd)
  };

  const policy = evaluateInfrastructurePolicy(report, policyConfig);
  report.summary = policy.summary;
  report.findings = policy.findings;
  report.observations = deriveObservations(report);
  report.recommendations = deriveRecommendations(report);

  return report;
}

function yesNo(value) {
  return value ? "yes" : "no";
}

export function formatMarkdownReport(report) {
  const summary = report.summary ?? {
    pass: true,
    errorCount: 0,
    warningCount: 0,
    infoCount: 0
  };
  const findings = report.findings ?? [];
  const entries = report.topLevelEntries.length
    ? report.topLevelEntries
        .map((entry) => `\`${entry.name}${entry.type === "dir" ? "/" : ""}\``)
        .join(", ")
    : "None";

  const remotes = report.git.remotes.length
    ? report.git.remotes.map((remote) => `\`${remote}\``).join(", ")
    : "none";

  const status = report.git.statusLines.length
    ? report.git.statusLines.map((line) => `\`${line}\``).join(", ")
    : report.git.statusInspected
      ? "clean"
      : "not evaluated (filesystem-only mode)";

  return [
    "# Infrastructure Report",
    "",
    `Generated: \`${report.generatedAt}\``,
    "",
    "## Host",
    `- Workspace: \`${report.workspaceRoot}\``,
    `- Platform: \`${report.host.platform}\` (\`${report.host.arch}\`)`,
    `- OS release: \`${report.host.release}\``,
    `- CPU count: \`${report.host.cpuCount}\``,
    `- Node: ${report.tools.node.version ? `\`${report.tools.node.version}\`` : "unavailable"}`,
    `- npm: ${report.tools.npm.version ? `\`${report.tools.npm.version}\`` : "unavailable"}`,
    "",
    "## Repository",
    `- Git available: ${yesNo(report.git.available)}`,
    `- Inside work tree: ${yesNo(report.git.insideWorkTree)}`,
    `- Branch: ${report.git.branch ? `\`${report.git.branch}\`` : "unknown"}`,
    `- Has commits: ${yesNo(report.git.hasCommits)}`,
    `- Remotes: ${remotes}`,
    `- Working tree: ${status}`,
    "",
    "## Project Signals",
    `- infra.config.json: ${yesNo(report.project.infraConfig)}`,
    `- package.json: ${yesNo(report.project.packageJson)}`,
    `- README.md: ${yesNo(report.project.readme)}`,
    `- .gitignore: ${yesNo(report.project.gitignore)}`,
    `- .editorconfig: ${yesNo(report.project.editorconfig)}`,
    `- .gitattributes: ${yesNo(report.project.gitattributes)}`,
    `- src/: ${yesNo(report.project.sourceDirectory)}`,
    `- test/: ${yesNo(report.project.testDirectory)}`,
    `- CI workflow: ${yesNo(report.project.ciWorkflow)}`,
    `- Top-level entries: ${entries}`,
    "",
    "## Health",
    `- Overall: ${summary.pass ? "pass" : "fail"}`,
    `- Error findings: \`${summary.errorCount}\``,
    `- Warning findings: \`${summary.warningCount}\``,
    `- Info findings: \`${summary.infoCount}\``,
    ...(findings.length
      ? findings.map((finding) => {
          const label = finding.status === "pass"
            ? "PASS"
            : `FAIL ${finding.severity.toUpperCase()}`;

          return `- ${label}: ${finding.message}`;
        })
      : ["- No policy findings recorded."]),
    "",
    "## Observations",
    ...report.observations.map((observation) => `- ${observation}`),
    "",
    "## Recommendations",
    ...report.recommendations.map((recommendation) => `- ${recommendation}`)
  ].join("\n");
}
