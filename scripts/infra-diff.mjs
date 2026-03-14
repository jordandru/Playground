import path from "node:path";

import { compareCurrentToLatest, formatMarkdownDiff } from "../src/infra/history.mjs";

const args = process.argv.slice(2);
const json = args.includes("--json");
const latestPath = path.join(process.cwd(), "reports", "infra", "latest.json");
const comparison = compareCurrentToLatest({ cwd: process.cwd(), latestPath });

if (!comparison.previousReport) {
  const message = `No saved snapshot found at ${latestPath}. Run "npm run infra:snapshot" first.`;

  if (json) {
    console.log(
      JSON.stringify(
        {
          ok: false,
          message,
          latestPath
        },
        null,
        2
      )
    );
  } else {
    console.log(message);
  }

  process.exit(1);
}

if (json) {
  console.log(JSON.stringify(comparison, null, 2));
} else {
  console.log(formatMarkdownDiff(comparison));
}
