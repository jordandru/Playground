import { runInfrastructureFix } from "../src/infra/fix.mjs";

try {
  const result = runInfrastructureFix({
    cwd: process.cwd(),
    args: process.argv.slice(2)
  });

  console.log(result.output);

  if (result.exitCode !== 0) {
    process.exit(result.exitCode);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
