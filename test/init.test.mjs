import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { runInfrastructureInit } from "../src/infra/init.mjs";
import { collectInfrastructureReport } from "../src/infra/report.mjs";
import { readJson, writeGitMetadata } from "./test-helpers.mjs";

function withTempDir(run) {
  const root = mkdtempSync(path.join(os.tmpdir(), "playground-init-"));

  try {
    run(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

export const initTests = [
  {
    name: "infra init scaffolds the baseline into a fresh folder",
    run() {
      withTempDir((root) => {
        const result = runInfrastructureInit({
          cwd: root,
          args: ["My Infra App"]
        });
        const targetDir = path.join(root, "My Infra App");
        const packageJson = readJson(path.join(targetDir, "package.json"));
        const readme = readFileSync(path.join(targetDir, "README.md"), "utf8");

        assert.equal(result.exitCode, 0);
        assert.equal(packageJson.name, "my-infra-app");
        assert.match(readme, /^# My Infra App/m);
        assert.equal(existsSync(path.join(targetDir, "scripts", "infra-init.mjs")), true);
        assert.equal(existsSync(path.join(targetDir, "src", "infra", "init.mjs")), true);
        assert.equal(existsSync(path.join(targetDir, "reports", "infra", ".gitkeep")), true);
      });
    }
  },
  {
    name: "infra init honors an explicit package name override",
    run() {
      withTempDir((root) => {
        runInfrastructureInit({
          cwd: root,
          args: ["Scaffold Target", "--name", "custom-starter"]
        });

        const packageJson = readJson(path.join(root, "Scaffold Target", "package.json"));
        assert.equal(packageJson.name, "custom-starter");
      });
    }
  },
  {
    name: "infra init refuses non-empty targets unless forced",
    run() {
      withTempDir((root) => {
        const targetDir = path.join(root, "Busy Target");
        runInfrastructureInit({
          cwd: root,
          args: ["Busy Target"]
        });

        assert.throws(
          () => runInfrastructureInit({ cwd: root, args: ["Busy Target"] }),
          /not empty/
        );

        const packageJsonPath = path.join(targetDir, "package.json");
        const before = readJson(packageJsonPath);

        runInfrastructureInit({
          cwd: root,
          args: ["Busy Target", "--force", "--name", "forced-target"]
        });

        const after = readJson(packageJsonPath);
        assert.notEqual(before.name, after.name);
        assert.equal(after.name, "forced-target");
      });
    }
  },
  {
    name: "scaffolded baseline passes policy after git metadata is added",
    run() {
      withTempDir((root) => {
        runInfrastructureInit({
          cwd: root,
          args: ["Baseline Copy"]
        });

        const targetDir = path.join(root, "Baseline Copy");
        writeGitMetadata(targetDir, {
          withCommit: true,
          withRemote: true
        });

        const report = collectInfrastructureReport({ cwd: targetDir });

        assert.equal(report.summary.pass, true);
        assert.ok(
          report.findings.some(
            (finding) =>
              finding.id === "package-json-scripts" && finding.status === "pass"
          )
        );
      });
    }
  }
];
