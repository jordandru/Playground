import {
  collectInfrastructureReport,
  formatMarkdownReport
} from "./report.mjs";

export function runInfrastructureCheck({
  cwd = process.cwd(),
  args = [],
  config,
  configPath
} = {}) {
  const json = new Set(args).has("--json");
  const report = collectInfrastructureReport({ cwd, config, configPath });
  const output = json
    ? JSON.stringify(report, null, 2)
    : formatMarkdownReport(report);

  return {
    report,
    output,
    exitCode: report.summary.errorCount > 0 ? 1 : 0
  };
}
