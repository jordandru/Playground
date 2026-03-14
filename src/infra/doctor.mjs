import { loadInfrastructureConfig } from "./policy.mjs";
import { collectInfrastructureReport } from "./report.mjs";

function buildFileAction(relativePath) {
  return {
    findingId: `file:${relativePath}`,
    priority: "required",
    title: `Create required file ${relativePath}`,
    rationale: `The policy requires \`${relativePath}\` to exist before the workspace is considered healthy.`,
    steps: [
      `Create \`${relativePath}\` in the workspace root.`,
      "Populate it with the baseline content your project expects.",
      "Re-run `npm run infra:check` to confirm the policy now passes."
    ]
  };
}

function buildDirectoryAction(relativePath) {
  return {
    findingId: `directory:${relativePath}`,
    priority: "required",
    title: `Create required directory ${relativePath}/`,
    rationale: `The policy requires the \`${relativePath}/\` directory to exist.`,
    steps: [
      `Create the \`${relativePath}/\` directory in the workspace root.`,
      "Add the files that belong there for your project baseline.",
      "Re-run `npm run infra:check` to confirm the policy now passes."
    ]
  };
}

function buildCiAction(relativePath) {
  return {
    findingId: "ci-workflow",
    priority: "required",
    title: "Add the required CI workflow",
    rationale: `The policy requires a workflow file at \`${relativePath}\`.`,
    steps: [
      `Create \`${relativePath}\` with the checks your repository should enforce in CI.`,
      "Commit the workflow once it reflects the baseline automation you want.",
      "Re-run `npm run infra:check` to confirm the policy now passes."
    ]
  };
}

function buildNodeAction(requiredMajor) {
  return {
    findingId: "node-major",
    priority: "required",
    title: `Upgrade Node.js to ${requiredMajor}+`,
    rationale: `The current policy requires Node major version ${requiredMajor} or newer.`,
    steps: [
      `Install or activate Node.js ${requiredMajor} or newer.`,
      "Open a fresh shell so the new Node version is on PATH.",
      "Re-run `node --version` and then `npm run infra:check`."
    ]
  };
}

function buildPackageScriptsAction(requiredScripts) {
  return {
    findingId: "package-json-scripts",
    priority: "required",
    title: "Add the required package.json scripts",
    rationale: "The current policy expects the infrastructure CLI scripts to be declared in package.json.",
    steps: [
      `Add these scripts under \`package.json > scripts\`: ${requiredScripts.map((scriptName) => `\`${scriptName}\``).join(", ")}.`,
      "Keep the script commands aligned with the files in the scripts/ directory.",
      "Re-run `npm run infra:check` to confirm the policy now passes."
    ]
  };
}

function buildPackageNodeEngineAction(requiredMajor) {
  return {
    findingId: "package-json-node-engine",
    priority: "required",
    title: "Align package.json engines.node with policy",
    rationale: "The package metadata should advertise the same minimum Node version that policy enforces.",
    steps: [
      `Set \`package.json > engines.node\` to \`>=${requiredMajor}\`.`,
      "Save package.json and reopen the shell if you are also changing your local Node version.",
      "Re-run `npm run infra:check` to confirm the policy now passes."
    ]
  };
}

function buildGitInitAction() {
  return {
    findingId: "git-exists",
    priority: "required",
    title: "Initialize Git for this workspace",
    rationale: "The current policy requires the workspace to be inside a Git repository.",
    steps: [
      "Run `git init` in the workspace root.",
      "Confirm `.git/` now exists and the repository is active.",
      "Re-run `npm run infra:check` to confirm the policy now passes."
    ]
  };
}

function buildCommitAction(required) {
  return {
    findingId: "git-commit",
    priority: required ? "required" : "suggested",
    title: required ? "Create the required initial commit" : "Create a baseline commit",
    rationale: required
      ? "The current policy requires the repository to have at least one commit."
      : "A first commit makes future infrastructure diffs easier to interpret and share.",
    steps: [
      "Stage the files that belong in the baseline.",
      "Run `git commit -m \"Initial baseline\"` or a message that matches your project.",
      "Re-run `npm run infra:check` after the commit is created."
    ]
  };
}

function buildRemoteAction(required) {
  return {
    findingId: "git-remote",
    priority: required ? "required" : "suggested",
    title: required ? "Configure the required Git remote" : "Add a Git remote",
    rationale: required
      ? "The current policy requires at least one configured remote."
      : "A remote lets CI, collaboration, and off-machine backups become real instead of local-only.",
    steps: [
      "Create the repository on your Git hosting provider if it does not exist yet.",
      "Run `git remote add origin <repo-url>` with the repository URL.",
      "Push the current branch once the remote is configured."
    ]
  };
}

export function buildDoctorActions(report, config) {
  const requirements = config.requirements ?? config;
  const actions = [];
  const findingsById = new Map(report.findings.map((finding) => [finding.id, finding]));
  const remoteFinding = findingsById.get("git-remote");

  if (findingsById.get("node-major")?.status === "fail") {
    actions.push(buildNodeAction(requirements.nodeMajorGte));
  }

  for (const relativePath of requirements.files) {
    if (findingsById.get(`file:${relativePath}`)?.status === "fail") {
      actions.push(buildFileAction(relativePath));
    }
  }

  for (const relativePath of requirements.directories) {
    if (findingsById.get(`directory:${relativePath}`)?.status === "fail") {
      actions.push(buildDirectoryAction(relativePath));
    }
  }

  if (findingsById.get("ci-workflow")?.status === "fail") {
    actions.push(buildCiAction(requirements.ciWorkflow));
  }

  if (findingsById.get("package-json-scripts")?.status === "fail") {
    actions.push(buildPackageScriptsAction(requirements.packageJson.requiredScripts));
  }

  if (findingsById.get("package-json-node-engine")?.status === "fail") {
    actions.push(buildPackageNodeEngineAction(requirements.nodeMajorGte));
  }

  if (findingsById.get("git-exists")?.status === "fail") {
    actions.push(buildGitInitAction());
  }

  if (
    report.git.available &&
    !report.git.hasCommits &&
    (requirements.git.mustHaveCommit || report.summary.pass)
  ) {
    actions.push(buildCommitAction(requirements.git.mustHaveCommit));
  }

  if (
    report.git.available &&
    (
      (requirements.git.mustHaveRemote && remoteFinding?.status === "fail") ||
      (!requirements.git.mustHaveRemote && report.summary.pass && !report.git.remotes.length)
    )
  ) {
    actions.push(buildRemoteAction(requirements.git.mustHaveRemote));
  }

  return actions;
}

export function createInfrastructureDoctor({
  cwd = process.cwd(),
  config,
  configPath
} = {}) {
  const resolvedConfig = config ?? loadInfrastructureConfig({ cwd, configPath });
  const report = collectInfrastructureReport({
    cwd,
    config: resolvedConfig,
    configPath
  });
  const actions = buildDoctorActions(report, resolvedConfig);
  const requiredCount = actions.filter((action) => action.priority === "required").length;
  const suggestedCount = actions.length - requiredCount;

  return {
    report,
    actions,
    summary: {
      status: requiredCount > 0 ? "needs-attention" : "healthy",
      requiredCount,
      suggestedCount
    }
  };
}

export function formatMarkdownDoctor(doctor) {
  const lines = [
    "# Infrastructure Doctor",
    "",
    `Status: \`${doctor.summary.status}\``,
    `Required actions: \`${doctor.summary.requiredCount}\``,
    `Suggested actions: \`${doctor.summary.suggestedCount}\``,
    ""
  ];

  if (!doctor.actions.length) {
    lines.push("No actions needed. The workspace matches policy and has no outstanding suggestions.");
    return lines.join("\n");
  }

  lines.push("## Actions");

  for (const action of doctor.actions) {
    lines.push(`- [${action.priority}] ${action.title}`);
    lines.push(`  Rationale: ${action.rationale}`);

    for (const step of action.steps) {
      lines.push(`  Step: ${step}`);
    }
  }

  return lines.join("\n");
}
