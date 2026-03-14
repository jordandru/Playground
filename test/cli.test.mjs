import assert from "node:assert/strict";

import { runInfrastructureCheck } from "../src/infra/check.mjs";
import { createTempWorkspace } from "./test-helpers.mjs";

export const cliTests = [
  {
    name: "infra:check emits the enriched JSON report",
    run() {
      const workspace = createTempWorkspace();

      try {
        const result = runInfrastructureCheck({
          cwd: workspace.root,
          args: ["--json"],
          config: workspace.config
        });
        const output = JSON.parse(result.output);

        assert.equal(result.exitCode, 0);
        assert.equal(output.summary.pass, true);
        assert.ok(Array.isArray(output.findings));
        assert.ok(output.findings.some((entry) => entry.id === "ci-workflow"));
      } finally {
        workspace.cleanup();
      }
    }
  },
  {
    name: "infra:check exits non-zero when policy errors exist",
    run() {
      const workspace = createTempWorkspace({
        missingFiles: ["README.md"]
      });

      try {
        const result = runInfrastructureCheck({
          cwd: workspace.root,
          args: ["--json"],
          config: workspace.config
        });
        const output = JSON.parse(result.output);

        assert.equal(result.exitCode, 1);
        assert.equal(output.summary.pass, false);
        assert.ok(
          output.findings.some(
            (entry) => entry.id === "file:README.md" && entry.status === "fail"
          )
        );
      } finally {
        workspace.cleanup();
      }
    }
  }
];
