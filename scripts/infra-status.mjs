import { runInfrastructureStatus } from "../src/infra/status.mjs";

try {
  const result = runInfrastructureStatus({
    cwd: process.cwd(),
    args: process.argv.slice(2)
  });

  console.log(result.output);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
