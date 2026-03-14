import assert from "node:assert/strict";

import {
  createInfrastructureStatus,
  formatMarkdownStatus
} from "../src/infra/status.mjs";
import { createTempWorkspace } from "./test-helpers.mjs";

export const statusTests = [
  {
    name: "status reports healthy when no actions remain",
    run() {
      const workspace = createTempWorkspace({
        withCommit: true,
        withRemote: true
      });

      try {
        const status = createInfrastructureStatus({
          cwd: workspace.root,
          config: workspace.config
        });

        assert.equal(status.summary.status, "healthy");
        assert.equal(status.summary.nextCommand, null);
        assert.equal(status.summary.policyPass, true);
      } finally {
        workspace.cleanup();
      }
    }
  },
  {
    name: "status reports healthy-with-suggestions when only optional guidance remains",
    run() {
      const workspace = createTempWorkspace({
        withCommit: true,
        withRemote: false
      });

      try {
        const status = createInfrastructureStatus({
          cwd: workspace.root,
          config: workspace.config
        });

        assert.equal(status.summary.status, "healthy-with-suggestions");
        assert.equal(status.summary.nextCommand, "npm run infra:doctor");
        assert.ok(status.highlights.some((item) => item.includes("Git remote")));
      } finally {
        workspace.cleanup();
      }
    }
  },
  {
    name: "status reports needs-attention when auto-fixes are available",
    run() {
      const workspace = createTempWorkspace({
        missingFiles: ["README.md", "package.json"],
        withCommit: true,
        withRemote: true
      });

      try {
        const status = createInfrastructureStatus({
          cwd: workspace.root,
          config: workspace.config
        });

        assert.equal(status.summary.status, "needs-attention");
        assert.equal(status.summary.nextCommand, "npm run infra:fix");
        assert.ok(status.summary.fixableCount > 0);
      } finally {
        workspace.cleanup();
      }
    }
  },
  {
    name: "status markdown stays compact and readable",
    run() {
      const markdown = formatMarkdownStatus({
        summary: {
          status: "healthy",
          headline: "Workspace is healthy and ready.",
          policyPass: true,
          branch: "master",
          remotes: ["origin"],
          fixableCount: 0,
          requiredCount: 0,
          suggestedCount: 0,
          nextCommand: null
        },
        highlights: ["All required policy checks are passing."]
      });

      assert.match(markdown, /# Infrastructure Status/);
      assert.match(markdown, /Workspace is healthy and ready/);
      assert.match(markdown, /No action needed right now/);
    }
  }
];
