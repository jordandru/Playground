import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

function readJson(filePath) {
  try {
    return JSON.parse(readFileSync(filePath, "utf8"));
  } catch (error) {
    throw new Error(`Unable to read infrastructure config at ${filePath}: ${error.message}`);
  }
}

function tryStat(filePath) {
  try {
    return statSync(filePath);
  } catch {
    return null;
  }
}

function pathExistsAs(filePath, type) {
  const stat = tryStat(filePath);

  if (!stat) {
    return false;
  }

  return type === "directory" ? stat.isDirectory() : stat.isFile();
}

function parseNodeMajor(version) {
  if (typeof version !== "string") {
    return null;
  }

  const match = version.match(/^v?(\d+)/);

  return match ? Number.parseInt(match[1], 10) : null;
}

function readPackageJson(cwd) {
  const packageJsonPath = path.join(cwd, "package.json");

  if (!existsSync(packageJsonPath)) {
    return null;
  }

  return readJson(packageJsonPath);
}

function finding({ id, severity, status, message }) {
  return { id, severity, status, message };
}

export function loadInfrastructureConfig({ cwd = process.cwd(), configPath } = {}) {
  const resolvedPath = configPath ?? path.join(cwd, "infra.config.json");

  if (!existsSync(resolvedPath)) {
    throw new Error(`Infrastructure config not found at ${resolvedPath}`);
  }

  return readJson(resolvedPath);
}

export function summarizeFindings(findings) {
  const counts = {
    errorCount: 0,
    warningCount: 0,
    infoCount: 0
  };

  for (const entry of findings) {
    if (entry.status !== "fail") {
      continue;
    }

    if (entry.severity === "error") {
      counts.errorCount += 1;
    } else if (entry.severity === "warn") {
      counts.warningCount += 1;
    } else if (entry.severity === "info") {
      counts.infoCount += 1;
    }
  }

  return {
    pass: counts.errorCount === 0,
    ...counts
  };
}

function evaluatePathRequirement(report, relativePath, type) {
  const absolutePath = path.join(report.workspaceRoot, relativePath);

  return pathExistsAs(absolutePath, type);
}

function expectedNodeEngine(requirements) {
  return `>=${requirements.nodeMajorGte}`;
}

function evaluatePackageScripts(packageJson, requiredScripts) {
  if (!packageJson) {
    return finding({
      id: "package-json-scripts",
      severity: "error",
      status: "fail",
      message: "package.json is missing, so required scripts cannot be validated."
    });
  }

  const scripts = packageJson.scripts ?? {};
  const missingScripts = requiredScripts.filter((scriptName) => typeof scripts[scriptName] !== "string");

  if (!missingScripts.length) {
    return finding({
      id: "package-json-scripts",
      severity: "error",
      status: "pass",
      message: "package.json contains all required infrastructure scripts."
    });
  }

  return finding({
    id: "package-json-scripts",
    severity: "error",
    status: "fail",
    message: `package.json is missing required scripts: ${missingScripts.map((scriptName) => `\`${scriptName}\``).join(", ")}.`
  });
}

function evaluatePackageNodeEngine(packageJson, requirements) {
  const expected = expectedNodeEngine(requirements);

  if (!packageJson) {
    return finding({
      id: "package-json-node-engine",
      severity: "error",
      status: "fail",
      message: "package.json is missing, so the Node engine requirement cannot be validated."
    });
  }

  const actual = packageJson.engines?.node ?? null;
  const pass = actual === expected;

  return finding({
    id: "package-json-node-engine",
    severity: "error",
    status: pass ? "pass" : "fail",
    message: pass
      ? `package.json declares the expected Node engine range \`${expected}\`.`
      : `package.json declares Node engine \`${actual ?? "missing"}\`, but policy expects \`${expected}\`.`
  });
}

function evaluateGitPresence(report, required) {
  const present = report.git.available && report.git.insideWorkTree;

  if (required) {
    return finding({
      id: "git-exists",
      severity: "error",
      status: present ? "pass" : "fail",
      message: present
        ? "Git repository is available for this workspace."
        : "Workspace is not inside a Git repository, but current policy requires one."
    });
  }

  return finding({
    id: "git-exists",
    severity: "info",
    status: "pass",
    message: present
      ? "Git repository is available, although current policy does not require it."
      : "Git repository is not required by the current policy."
  });
}

function evaluateGitCommit(report, required) {
  const hasCommit = report.git.hasCommits;

  if (required) {
    return finding({
      id: "git-commit",
      severity: "error",
      status: hasCommit ? "pass" : "fail",
      message: hasCommit
        ? "Repository has at least one commit."
        : "Repository has no commits, but current policy requires an initialized history."
    });
  }

  return finding({
    id: "git-commit",
    severity: "info",
    status: "pass",
    message: hasCommit
      ? "Repository already has at least one commit; current policy does not require this yet."
      : "Repository has no commits yet; current policy allows this."
  });
}

function evaluateGitRemote(report, required) {
  const hasRemote = report.git.remotes.length > 0;

  if (required) {
    return finding({
      id: "git-remote",
      severity: "error",
      status: hasRemote ? "pass" : "fail",
      message: hasRemote
        ? "Repository has at least one configured remote."
        : "Repository has no configured remote, but current policy requires one."
    });
  }

  return finding({
    id: "git-remote",
    severity: "info",
    status: "pass",
    message: hasRemote
      ? "Repository already has a configured remote; current policy does not require this yet."
      : "Repository has no configured remote yet; current policy allows this."
  });
}

export function evaluateInfrastructurePolicy(report, config) {
  const requirements = config.requirements ?? config;
  const findings = [];
  const nodeMajor = parseNodeMajor(report.tools.node.version);
  const nodeRequirement = requirements.nodeMajorGte;
  const nodePass = nodeMajor !== null && nodeMajor >= nodeRequirement;
  const packageJson = readPackageJson(report.workspaceRoot);

  findings.push(
    finding({
      id: "node-major",
      severity: "error",
      status: nodePass ? "pass" : "fail",
      message: nodePass
        ? `Node major version ${nodeMajor} satisfies the minimum requirement of ${nodeRequirement}.`
        : `Node version ${report.tools.node.version ?? "unavailable"} does not satisfy the minimum major version ${nodeRequirement}.`
    })
  );

  for (const relativePath of requirements.files) {
    const present = evaluatePathRequirement(report, relativePath, "file");

    findings.push(
      finding({
        id: `file:${relativePath}`,
        severity: "error",
        status: present ? "pass" : "fail",
        message: present
          ? `Required file \`${relativePath}\` exists.`
          : `Required file \`${relativePath}\` is missing.`
      })
    );
  }

  for (const relativePath of requirements.directories) {
    const present = evaluatePathRequirement(report, relativePath, "directory");

    findings.push(
      finding({
        id: `directory:${relativePath}`,
        severity: "error",
        status: present ? "pass" : "fail",
        message: present
          ? `Required directory \`${relativePath}/\` exists.`
          : `Required directory \`${relativePath}/\` is missing.`
      })
    );
  }

  const ciPresent = evaluatePathRequirement(report, requirements.ciWorkflow, "file");
  findings.push(
    finding({
      id: "ci-workflow",
      severity: "error",
      status: ciPresent ? "pass" : "fail",
      message: ciPresent
        ? `CI workflow \`${requirements.ciWorkflow}\` exists.`
        : `CI workflow \`${requirements.ciWorkflow}\` is missing.`
    })
  );

  findings.push(
    evaluatePackageScripts(packageJson, requirements.packageJson.requiredScripts)
  );
  findings.push(
    evaluatePackageNodeEngine(packageJson, requirements)
  );

  findings.push(evaluateGitPresence(report, requirements.git.mustExist));
  findings.push(evaluateGitCommit(report, requirements.git.mustHaveCommit));
  findings.push(evaluateGitRemote(report, requirements.git.mustHaveRemote));

  return {
    summary: summarizeFindings(findings),
    findings
  };
}
