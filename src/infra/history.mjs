import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync
} from "node:fs";
import path from "node:path";

import { collectInfrastructureReport, formatMarkdownReport } from "./report.mjs";

function readJsonIfExists(filePath) {
  try {
    return JSON.parse(readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function ensureDirectory(directoryPath) {
  mkdirSync(directoryPath, { recursive: true });
}

function safeTimestamp(isoString) {
  return isoString.replace(/[:.]/g, "-");
}

function entryNames(report) {
  return report.topLevelEntries.map((entry) => `${entry.name}${entry.type === "dir" ? "/" : ""}`);
}

function compareScalar(changes, label, previousValue, currentValue) {
  if (previousValue === currentValue) {
    return;
  }

  changes.push({
    type: "changed",
    label,
    before: previousValue,
    after: currentValue
  });
}

function compareArraySet(changes, label, previousValues, currentValues) {
  const previous = new Set(previousValues);
  const current = new Set(currentValues);

  for (const value of currentValues) {
    if (!previous.has(value)) {
      changes.push({
        type: "added",
        label,
        value
      });
    }
  }

  for (const value of previousValues) {
    if (!current.has(value)) {
      changes.push({
        type: "removed",
        label,
        value
      });
    }
  }
}

function findingSignature(entry) {
  return `${entry.status}|${entry.severity}|${entry.message}`;
}

function compareFindings(changes, previousReport, currentReport) {
  const previousFindings = new Map(
    (previousReport.findings ?? []).map((entry) => [entry.id, entry])
  );
  const currentFindings = new Map(
    (currentReport.findings ?? []).map((entry) => [entry.id, entry])
  );

  for (const [id, entry] of currentFindings) {
    const previous = previousFindings.get(id);

    if (!previous) {
      changes.push({
        type: "added",
        label: "Policy finding",
        value: `${id}: ${findingSignature(entry)}`
      });
      continue;
    }

    if (findingSignature(previous) !== findingSignature(entry)) {
      changes.push({
        type: "changed",
        label: `Policy finding: ${id}`,
        before: findingSignature(previous),
        after: findingSignature(entry)
      });
    }
  }

  for (const [id, entry] of previousFindings) {
    if (!currentFindings.has(id)) {
      changes.push({
        type: "removed",
        label: "Policy finding",
        value: `${id}: ${findingSignature(entry)}`
      });
    }
  }
}

export function diffReports(previousReport, currentReport) {
  const changes = [];
  const previousSummary = previousReport.summary ?? {};
  const currentSummary = currentReport.summary ?? {};

  compareScalar(changes, "Host platform", previousReport.host.platform, currentReport.host.platform);
  compareScalar(changes, "Host architecture", previousReport.host.arch, currentReport.host.arch);
  compareScalar(changes, "OS release", previousReport.host.release, currentReport.host.release);
  compareScalar(changes, "CPU count", previousReport.host.cpuCount, currentReport.host.cpuCount);

  compareScalar(
    changes,
    "Node version",
    previousReport.tools.node.version,
    currentReport.tools.node.version
  );
  compareScalar(
    changes,
    "npm version",
    previousReport.tools.npm.version,
    currentReport.tools.npm.version
  );
  compareScalar(changes, "Git branch", previousReport.git.branch, currentReport.git.branch);
  compareScalar(
    changes,
    "Repository has commits",
    previousReport.git.hasCommits,
    currentReport.git.hasCommits
  );
  compareScalar(changes, "Health pass", previousSummary.pass, currentSummary.pass);
  compareScalar(changes, "Health error count", previousSummary.errorCount, currentSummary.errorCount);
  compareScalar(
    changes,
    "Health warning count",
    previousSummary.warningCount,
    currentSummary.warningCount
  );
  compareScalar(changes, "Health info count", previousSummary.infoCount, currentSummary.infoCount);

  compareArraySet(
    changes,
    "Git remote",
    previousReport.git.remotes,
    currentReport.git.remotes
  );

  for (const [key, currentValue] of Object.entries(currentReport.project)) {
    compareScalar(
      changes,
      `Project signal: ${key}`,
      previousReport.project[key],
      currentValue
    );
  }

  compareArraySet(
    changes,
    "Top-level entry",
    entryNames(previousReport),
    entryNames(currentReport)
  );
  compareFindings(changes, previousReport, currentReport);

  return changes;
}

function formatValue(value) {
  if (value === null) {
    return "null";
  }

  if (typeof value === "boolean") {
    return value ? "yes" : "no";
  }

  return String(value);
}

export function formatMarkdownDiff(comparison) {
  const { previousReport, currentReport, changes } = comparison;
  const lines = [
    "# Infrastructure Diff",
    "",
    `Previous snapshot: \`${previousReport.generatedAt}\``,
    `Current snapshot: \`${currentReport.generatedAt}\``,
    ""
  ];

  if (!changes.length) {
    lines.push("No structural changes detected.");
    return lines.join("\n");
  }

  lines.push("## Changes");

  for (const change of changes) {
    if (change.type === "changed") {
      lines.push(
        `- ${change.label}: \`${formatValue(change.before)}\` -> \`${formatValue(change.after)}\``
      );
    } else if (change.type === "added") {
      lines.push(`- ${change.label} added: \`${change.value}\``);
    } else if (change.type === "removed") {
      lines.push(`- ${change.label} removed: \`${change.value}\``);
    }
  }

  return lines.join("\n");
}

export function compareCurrentToLatest({
  cwd = process.cwd(),
  latestPath,
  config,
  configPath
} = {}) {
  const resolvedLatestPath =
    latestPath ?? path.join(cwd, "reports", "infra", "latest.json");
  const previousReport = readJsonIfExists(resolvedLatestPath);
  const currentReport = collectInfrastructureReport({ cwd, config, configPath });

  return {
    previousReport,
    currentReport,
    changes: previousReport ? diffReports(previousReport, currentReport) : [],
    latestPath: resolvedLatestPath
  };
}

export function snapshotInfrastructureReport({
  cwd = process.cwd(),
  outputDir,
  config,
  configPath
} = {}) {
  const resolvedOutputDir = outputDir ?? path.join(cwd, "reports", "infra");
  const historyDir = path.join(resolvedOutputDir, "history");
  ensureDirectory(resolvedOutputDir);
  ensureDirectory(historyDir);
  const latestJsonPath = path.join(resolvedOutputDir, "latest.json");
  const latestMarkdownPath = path.join(resolvedOutputDir, "latest.md");
  const previousReport = readJsonIfExists(latestJsonPath);
  const currentReport = collectInfrastructureReport({ cwd, config, configPath });
  const changes = previousReport ? diffReports(previousReport, currentReport) : [];
  const timestamp = safeTimestamp(currentReport.generatedAt);
  const historyJsonPath = path.join(historyDir, `${timestamp}.json`);
  const historyMarkdownPath = path.join(historyDir, `${timestamp}.md`);
  const latestDiffPath = previousReport ? path.join(resolvedOutputDir, "latest-diff.md") : null;
  const historyDiffPath = previousReport ? path.join(historyDir, `${timestamp}-diff.md`) : null;

  writeFileSync(latestJsonPath, `${JSON.stringify(currentReport, null, 2)}\n`);
  writeFileSync(latestMarkdownPath, `${formatMarkdownReport(currentReport)}\n`);
  writeFileSync(historyJsonPath, `${JSON.stringify(currentReport, null, 2)}\n`);
  writeFileSync(historyMarkdownPath, `${formatMarkdownReport(currentReport)}\n`);

  if (previousReport && latestDiffPath && historyDiffPath) {
    const diffMarkdown = `${formatMarkdownDiff({
      previousReport,
      currentReport,
      changes
    })}\n`;

    writeFileSync(latestDiffPath, diffMarkdown);
    writeFileSync(historyDiffPath, diffMarkdown);
  }

  return {
    currentReport,
    previousReport,
    changes,
    outputDir: resolvedOutputDir,
    latestJsonPath,
    latestMarkdownPath,
    latestDiffPath,
    historyJsonPath,
    historyMarkdownPath,
    historyDiffPath
  };
}
