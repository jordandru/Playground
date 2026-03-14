import assert from "node:assert/strict";

import { collectInfrastructureReport } from "../src/infra/report.mjs";
import { evaluateInfrastructurePolicy } from "../src/infra/policy.mjs";
import { createTempWorkspace } from "./test-helpers.mjs";

export const policyTests = [
  {
    name: "policy passes on the current baseline shape",
    run() {
      const workspace = createTempWorkspace();

      try {
        const report = collectInfrastructureReport({
          cwd: workspace.root,
          config: workspace.config
        });

        assert.equal(report.summary.pass, true);
        assert.equal(report.summary.errorCount, 0);
        assert.ok(report.findings.some((entry) => entry.id === "node-major"));
      } finally {
        workspace.cleanup();
      }
    }
  },
  {
    name: "policy flags missing required files",
    run() {
      const workspace = createTempWorkspace({
        missingFiles: ["README.md", "infra.config.json"]
      });

      try {
        const report = collectInfrastructureReport({
          cwd: workspace.root,
          config: workspace.config
        });
        const result = evaluateInfrastructurePolicy(report, workspace.config);
        const finding = result.findings.find((entry) => entry.id === "file:README.md");
        const configFinding = result.findings.find((entry) => entry.id === "file:infra.config.json");

        assert.equal(result.summary.pass, false);
        assert.equal(finding?.status, "fail");
        assert.equal(configFinding?.status, "fail");
      } finally {
        workspace.cleanup();
      }
    }
  },
  {
    name: "policy flags missing required directories",
    run() {
      const workspace = createTempWorkspace({
        missingDirectories: ["test"]
      });

      try {
        const report = collectInfrastructureReport({
          cwd: workspace.root,
          config: workspace.config
        });
        const result = evaluateInfrastructurePolicy(report, workspace.config);
        const finding = result.findings.find((entry) => entry.id === "directory:test");

        assert.equal(result.summary.pass, false);
        assert.equal(finding?.status, "fail");
      } finally {
        workspace.cleanup();
      }
    }
  },
  {
    name: "policy fails when Node is below the configured minimum",
    run() {
      const workspace = createTempWorkspace();

      try {
        const report = collectInfrastructureReport({
          cwd: workspace.root,
          config: workspace.config
        });

        report.tools.node.version = "v22.0.0";

        const result = evaluateInfrastructurePolicy(report, workspace.config);
        const finding = result.findings.find((entry) => entry.id === "node-major");

        assert.equal(result.summary.pass, false);
        assert.equal(finding?.status, "fail");
      } finally {
        workspace.cleanup();
      }
    }
  },
  {
    name: "policy fails when Git is missing",
    run() {
      const workspace = createTempWorkspace({
        withGit: false
      });

      try {
        const report = collectInfrastructureReport({
          cwd: workspace.root,
          config: workspace.config
        });
        const result = evaluateInfrastructurePolicy(report, workspace.config);
        const finding = result.findings.find((entry) => entry.id === "git-exists");

        assert.equal(result.summary.pass, false);
        assert.equal(finding?.status, "fail");
      } finally {
        workspace.cleanup();
      }
    }
  },
  {
    name: "optional commit and remote checks stay non-failing",
    run() {
      const workspace = createTempWorkspace({
        withCommit: false,
        withRemote: false
      });

      try {
        const report = collectInfrastructureReport({
          cwd: workspace.root,
          config: workspace.config
        });
        const result = evaluateInfrastructurePolicy(report, workspace.config);
        const commitFinding = result.findings.find((entry) => entry.id === "git-commit");
        const remoteFinding = result.findings.find((entry) => entry.id === "git-remote");

        assert.equal(result.summary.pass, true);
        assert.equal(commitFinding?.status, "pass");
        assert.equal(remoteFinding?.status, "pass");
      } finally {
        workspace.cleanup();
      }
    }
  },
  {
    name: "policy fails when required package scripts are missing",
    run() {
      const workspace = createTempWorkspace({
        missingScripts: ["infra:doctor", "infra:fix", "check"]
      });

      try {
        const report = collectInfrastructureReport({
          cwd: workspace.root,
          config: workspace.config
        });
        const result = evaluateInfrastructurePolicy(report, workspace.config);
        const finding = result.findings.find((entry) => entry.id === "package-json-scripts");

        assert.equal(result.summary.pass, false);
        assert.equal(finding?.status, "fail");
        assert.match(finding?.message ?? "", /infra:doctor/);
        assert.match(finding?.message ?? "", /infra:fix/);
        assert.match(finding?.message ?? "", /check/);
      } finally {
        workspace.cleanup();
      }
    }
  },
  {
    name: "policy fails when package.json engines.node drifts from policy",
    run() {
      const workspace = createTempWorkspace({
        packageNodeEngine: ">=22"
      });

      try {
        const report = collectInfrastructureReport({
          cwd: workspace.root,
          config: workspace.config
        });
        const result = evaluateInfrastructurePolicy(report, workspace.config);
        const finding = result.findings.find((entry) => entry.id === "package-json-node-engine");

        assert.equal(result.summary.pass, false);
        assert.equal(finding?.status, "fail");
        assert.match(finding?.message ?? "", />=24/);
      } finally {
        workspace.cleanup();
      }
    }
  }
];
