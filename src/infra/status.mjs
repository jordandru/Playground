import { createInfrastructureDoctor } from "./doctor.mjs";
import { runInfrastructureFix } from "./fix.mjs";

function pluralize(count, singular, plural = `${singular}s`) {
  return count === 1 ? singular : plural;
}

function buildHighlights(doctor, fixPreview) {
  if (doctor.summary.requiredCount > 0) {
    return doctor.actions
      .filter((action) => action.priority === "required")
      .slice(0, 3)
      .map((action) => action.title);
  }

  if (doctor.summary.suggestedCount > 0) {
    return doctor.actions
      .filter((action) => action.priority === "suggested")
      .slice(0, 3)
      .map((action) => action.title);
  }

  if (fixPreview.result.operations.length > 0) {
    return fixPreview.result.operations
      .slice(0, 3)
      .map((operation) => operation.description);
  }

  return [
    "All required policy checks are passing.",
    doctor.report.git.remotes.length
      ? "Git remote is configured."
      : "No Git remote is configured, but policy does not require one."
  ];
}

function createSummary(doctor, fixPreview) {
  const fixableCount = fixPreview.result.operations.length;
  const requiredCount = doctor.summary.requiredCount;
  const suggestedCount = doctor.summary.suggestedCount;

  if (requiredCount > 0) {
    return {
      status: "needs-attention",
      headline: fixableCount > 0
        ? `Workspace needs attention; ${fixableCount} automatic ${pluralize(fixableCount, "fix")} available.`
        : "Workspace needs attention and requires manual fixes.",
      nextCommand: fixableCount > 0 ? "npm run infra:fix" : "npm run infra:doctor",
      fixableCount,
      requiredCount,
      suggestedCount
    };
  }

  if (suggestedCount > 0) {
    return {
      status: "healthy-with-suggestions",
      headline: `Workspace is healthy with ${suggestedCount} suggested ${pluralize(suggestedCount, "improvement")}.`,
      nextCommand: "npm run infra:doctor",
      fixableCount,
      requiredCount,
      suggestedCount
    };
  }

  return {
    status: "healthy",
    headline: "Workspace is healthy and ready.",
    nextCommand: null,
    fixableCount,
    requiredCount,
    suggestedCount
  };
}

export function createInfrastructureStatus({
  cwd = process.cwd(),
  config,
  configPath
} = {}) {
  const doctor = createInfrastructureDoctor({
    cwd,
    config,
    configPath
  });
  const fixPreview = runInfrastructureFix({
    cwd,
    args: ["--dry-run", "--json"],
    config,
    configPath
  });
  const summary = createSummary(doctor, fixPreview);
  const highlights = buildHighlights(doctor, fixPreview);

  return {
    report: doctor.report,
    doctorSummary: doctor.summary,
    fixPreview: {
      operationCount: fixPreview.result.operations.length,
      usedDefaultConfig: fixPreview.result.summary.usedDefaultConfig
    },
    summary: {
      ...summary,
      policyPass: doctor.report.summary.pass,
      branch: doctor.report.git.branch,
      remotes: doctor.report.git.remotes
    },
    highlights
  };
}

export function formatMarkdownStatus(status) {
  const remotes = status.summary.remotes.length
    ? status.summary.remotes.map((remote) => `\`${remote}\``).join(", ")
    : "none";

  return [
    "# Infrastructure Status",
    "",
    `Status: \`${status.summary.status}\``,
    `Headline: ${status.summary.headline}`,
    `Policy: \`${status.summary.policyPass ? "pass" : "fail"}\``,
    `Branch: ${status.summary.branch ? `\`${status.summary.branch}\`` : "unknown"}`,
    `Remotes: ${remotes}`,
    `Auto-fixable items: \`${status.summary.fixableCount}\``,
    `Required actions: \`${status.summary.requiredCount}\``,
    `Suggested actions: \`${status.summary.suggestedCount}\``,
    "",
    "## Highlights",
    ...status.highlights.map((item) => `- ${item}`),
    "",
    "## Next Step",
    status.summary.nextCommand
      ? `- Run \`${status.summary.nextCommand}\`.`
      : "- No action needed right now."
  ].join("\n");
}

export function runInfrastructureStatus({
  cwd = process.cwd(),
  args = [],
  config,
  configPath
} = {}) {
  const json = new Set(args).has("--json");
  const status = createInfrastructureStatus({
    cwd,
    config,
    configPath
  });

  return {
    status,
    output: json
      ? JSON.stringify(status, null, 2)
      : formatMarkdownStatus(status),
    exitCode: 0
  };
}
