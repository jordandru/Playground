import assert from "node:assert/strict";

import {
  buildDoctorActions,
  createInfrastructureDoctor,
  formatMarkdownDoctor
} from "../src/infra/doctor.mjs";
import { collectInfrastructureReport } from "../src/infra/report.mjs";
import { createTempWorkspace } from "./test-helpers.mjs";

export const doctorTests = [
  {
    name: "doctor suggests adding a remote on an otherwise healthy workspace",
    run() {
      const workspace = createTempWorkspace({
        withCommit: true,
        withRemote: false
      });

      try {
        const doctor = createInfrastructureDoctor({
          cwd: workspace.root,
          config: workspace.config
        });

        assert.equal(doctor.summary.status, "healthy");
        assert.ok(
          doctor.actions.some(
            (action) =>
              action.findingId === "git-remote" && action.priority === "suggested"
          )
        );
      } finally {
        workspace.cleanup();
      }
    }
  },
  {
    name: "doctor turns failing findings into required actions",
    run() {
      const workspace = createTempWorkspace({
        missingFiles: ["README.md"],
        withGit: false
      });

      try {
        const report = collectInfrastructureReport({
          cwd: workspace.root,
          config: workspace.config
        });
        const actions = buildDoctorActions(report, workspace.config);

        assert.ok(
          actions.some(
            (action) =>
              action.findingId === "file:README.md" && action.priority === "required"
          )
        );
        assert.ok(
          actions.some(
            (action) =>
              action.findingId === "git-exists" && action.priority === "required"
          )
        );
        assert.equal(
          actions.some((action) => action.findingId === "git-remote"),
          false
        );
      } finally {
        workspace.cleanup();
      }
    }
  },
  {
    name: "doctor markdown renders action details",
    run() {
      const markdown = formatMarkdownDoctor({
        summary: {
          status: "needs-attention",
          requiredCount: 1,
          suggestedCount: 1
        },
        actions: [
          {
            findingId: "file:README.md",
            priority: "required",
            title: "Create required file README.md",
            rationale: "README.md is required.",
            steps: ["Create the file.", "Run infra check again."]
          }
        ]
      });

      assert.match(markdown, /# Infrastructure Doctor/);
      assert.match(markdown, /Create required file README.md/);
      assert.match(markdown, /Rationale:/);
      assert.match(markdown, /Step:/);
    }
  }
];
