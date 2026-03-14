import {
  collectInfrastructureReport,
  formatMarkdownReport
} from "../src/infra/report.mjs";

const args = new Set(process.argv.slice(2));
const report = collectInfrastructureReport({ cwd: process.cwd() });

if (args.has("--json")) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(formatMarkdownReport(report));
}
