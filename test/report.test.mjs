import assert from "node:assert/strict";

import {
  collectInfrastructureReport,
  deriveObservations,
  deriveRecommendations,
  formatMarkdownReport
} from "../src/infra/report.mjs";

export const reportTests = [
  {
    name: "collectInfrastructureReport returns the expected top-level shape",
    run() {
      const report = collectInfrastructureReport({ cwd: process.cwd() });

      assert.equal(typeof report.generatedAt, "string");
      assert.equal(report.workspaceRoot, process.cwd());
      assert.equal(typeof report.host.platform, "string");
      assert.equal(typeof report.tools.node.available, "boolean");
      assert.equal(typeof report.git.hasCommits, "boolean");
      assert.equal(Array.isArray(report.topLevelEntries), true);
      assert.equal(typeof report.summary.pass, "boolean");
      assert.equal(Array.isArray(report.findings), true);
      assert.equal(Array.isArray(report.observations), true);
      assert.equal(Array.isArray(report.recommendations), true);
    }
  },
  {
    name: "derivation helpers surface expected guidance",
    run() {
      const report = {
        tools: {
          node: { available: true },
          npm: { available: true }
        },
        git: {
          available: true,
          hasCommits: false,
          statusLines: ["?? package.json"]
        },
        project: {
          ciWorkflow: true,
          sourceDirectory: true,
          testDirectory: true
        }
      };

      assert.ok(
        deriveObservations(report).some((entry) => entry.includes("Node.js workflow"))
      );
      assert.ok(
        deriveRecommendations(report).some((entry) => entry.includes("first commit"))
      );
    }
  },
  {
    name: "formatMarkdownReport renders key sections",
    run() {
      const markdown = formatMarkdownReport({
        generatedAt: "2026-03-13T00:00:00.000Z",
        workspaceRoot: "C:/workspace",
        host: {
          platform: "win32",
          arch: "x64",
          release: "10.0.26100",
          cpuCount: 12
        },
        tools: {
          node: { version: "v24.13.1" },
          npm: { version: "11.8.0" }
        },
        git: {
          available: true,
          insideWorkTree: true,
          branch: "master",
          hasCommits: false,
          remotes: [],
          statusLines: ["?? package.json"]
        },
        project: {
          infraConfig: true,
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
          { name: ".github", type: "dir" },
          { name: "package.json", type: "file" }
        ],
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
          },
          {
            id: "package-json-scripts",
            severity: "error",
            status: "pass",
            message: "package.json contains all required infrastructure scripts."
          }
        ],
        observations: ["Observation one"],
        recommendations: ["Recommendation one"]
      });

      assert.match(markdown, /# Infrastructure Report/);
      assert.match(markdown, /## Host/);
      assert.match(markdown, /## Health/);
      assert.match(markdown, /Observation one/);
      assert.match(markdown, /Recommendation one/);
    }
  }
];
