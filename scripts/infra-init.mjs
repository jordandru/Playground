import { runInfrastructureInit } from "../src/infra/init.mjs";

try {
  const result = runInfrastructureInit({
    cwd: process.cwd(),
    args: process.argv.slice(2)
  });

  console.log(result.output);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
