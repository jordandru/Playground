import assert from "node:assert/strict";
import path from "node:path";

import {
  compareCurrentToLatest,
  diffReports,
  formatMarkdownDiff,
  snapshotInfrastructureReport
} from "../src/infra/history.mjs";
import { createTempWorkspace, readJson } from "./test-helpers.mjs";

function makeReport(overrides = {}) {
  return {
    generatedAt: "2026-03-13T00:00:00.000Z",
    host: {
      platform: "win32",
      arch: "x64",
      release: "10.0.26200",
      cpuCount: 12
    },
    tools: {
      node: { version: "v24.13.1" },
      npm: { version: "11.8.0" }
    },
    git: {
      branch: "master",
      hasCommits: false,
      remotes: []
    },
    summary: {
      pass: true,
      errorCount: 0,
      warningCount: 0,
      infoCount: 0
    },
    findings: [
      {
        id: "node-major",
        severity: "error",
        status: "pass",
        message: "Node major version 24 satisfies the minimum requirement of 24."
      }
    ],
    project: {
      packageJson: true,
      readme: true,
      gitignore: true,
      editorconfig: true,
      gitattributes: true,
      sourceDirectory: true,
      testDirectory: true,
      ciWorkflow: true
    },
    topLevelEntries: [
      { name: "README.md", type: "file" },
      { name: "src", type: "dir" }
    ],
    ...overrides
  };
}

export const historyTests = [
  {
    name: "diffReports captures scalar and set changes",
    run() {
      const previous = makeReport();
      const current = makeReport({
        tools: {
          node: { version: "v24.14.0" },
          npm: { version: "11.8.0" }
        },
        git: {
          branch: "codex/infra",
          hasCommits: true,
          remotes: ["origin"]
        },
        topLevelEntries: [
          { name: "README.md", type: "file" },
          { name: "scripts", type: "dir" }
        ]
      });

      const changes = diffReports(previous, current);

      assert.ok(changes.some((change) => change.label === "Node version"));
      assert.ok(changes.some((change) => change.label === "Git branch"));
      assert.ok(changes.some((change) => change.label === "Git remote"));
      assert.ok(changes.some((change) => change.label === "Top-level entry"));
    }
  },
  {
    name: "formatMarkdownDiff renders a stable summary",
    run() {
      const markdown = formatMarkdownDiff({
        previousReport: makeReport(),
        currentReport: makeReport({
          generatedAt: "2026-03-14T00:00:00.000Z"
        }),
        changes: [
          {
            type: "changed",
            label: "Node version",
            before: "v24.13.1",
            after: "v24.14.0"
          },
          {
            type: "added",
            label: "Git remote",
            value: "origin"
          }
        ]
      });

      assert.match(markdown, /# Infrastructure Diff/);
      assert.match(markdown, /Node version/);
      assert.match(markdown, /Git remote added/);
    }
  },
  {
    name: "snapshot and diff retain health data",
    run() {
      const workspace = createTempWorkspace();

      try {
        const outputDir = path.join(workspace.root, "reports", "infra");
        const snapshot = snapshotInfrastructureReport({
          cwd: workspace.root,
          outputDir,
          config: workspace.config
        });
        const saved = readJson(snapshot.latestJsonPath);
        const comparison = compareCurrentToLatest({
          cwd: workspace.root,
          latestPath: snapshot.latestJsonPath,
          config: workspace.config
        });

        assert.equal(typeof saved.summary.pass, "boolean");
        assert.equal(Array.isArray(saved.findings), true);
        assert.equal(comparison.changes.length, 0);
        assert.equal(Array.isArray(comparison.currentReport.findings), true);
      } finally {
        workspace.cleanup();
      }
    }
  }
];
