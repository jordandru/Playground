import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import path from "node:path";

import { runInfrastructureFix } from "../src/infra/fix.mjs";
import { readJson } from "./test-helpers.mjs";
import { createTempWorkspace } from "./test-helpers.mjs";

export const fixTests = [
  {
    name: "infra fix repairs safe filesystem and package drift",
    run() {
      const workspace = createTempWorkspace({
        missingFiles: ["README.md", ".editorconfig", "infra.config.json", "package.json"],
        missingDirectories: ["src"],
        withCi: false,
        withCommit: true,
        withRemote: true
      });

      try {
        const result = runInfrastructureFix({
          cwd: workspace.root
        });
        const packageJson = readJson(path.join(workspace.root, "package.json"));

        assert.equal(result.exitCode, 0);
        assert.equal(result.result.after.summary.pass, true);
        assert.equal(existsSync(path.join(workspace.root, "README.md")), true);
        assert.equal(existsSync(path.join(workspace.root, ".editorconfig")), true);
        assert.equal(existsSync(path.join(workspace.root, "infra.config.json")), true);
        assert.equal(existsSync(path.join(workspace.root, "src")), true);
        assert.equal(existsSync(path.join(workspace.root, ".github", "workflows", "ci.yml")), true);
        assert.equal(packageJson.engines.node, ">=24");
        assert.equal(typeof packageJson.scripts["infra:fix"], "string");
      } finally {
        workspace.cleanup();
      }
    }
  },
  {
    name: "infra fix dry-run reports changes without mutating files",
    run() {
      const workspace = createTempWorkspace({
        missingFiles: ["README.md", "package.json"],
        withCommit: true,
        withRemote: true
      });

      try {
        const result = runInfrastructureFix({
          cwd: workspace.root,
          args: ["--dry-run"]
        });

        assert.equal(result.exitCode, 1);
        assert.equal(result.result.summary.mode, "dry-run");
        assert.ok(result.result.operations.length > 0);
        assert.equal(existsSync(path.join(workspace.root, "README.md")), false);
        assert.equal(existsSync(path.join(workspace.root, "package.json")), false);
      } finally {
        workspace.cleanup();
      }
    }
  },
  {
    name: "infra fix leaves manual git work when auto-fixes are not enough",
    run() {
      const workspace = createTempWorkspace({
        missingFiles: ["README.md"],
        withGit: false
      });

      try {
        const result = runInfrastructureFix({
          cwd: workspace.root
        });

        assert.equal(result.exitCode, 1);
        assert.ok(
          result.result.remainingActions.some(
            (action) => action.findingId === "git-exists"
          )
        );
        assert.equal(existsSync(path.join(workspace.root, "README.md")), true);
      } finally {
        workspace.cleanup();
      }
    }
  }
];
