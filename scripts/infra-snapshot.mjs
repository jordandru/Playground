import path from "node:path";

import { snapshotInfrastructureReport } from "../src/infra/history.mjs";

const outputDir = path.join(process.cwd(), "reports", "infra");
const snapshot = snapshotInfrastructureReport({ cwd: process.cwd(), outputDir });

console.log(`Saved infrastructure snapshot to ${snapshot.latestJsonPath}`);
console.log(`Saved markdown report to ${snapshot.latestMarkdownPath}`);

if (snapshot.latestDiffPath) {
  console.log(`Saved diff against previous snapshot to ${snapshot.latestDiffPath}`);
} else {
  console.log("No previous snapshot was available, so no diff was generated.");
}
