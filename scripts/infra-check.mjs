import { runInfrastructureCheck } from "../src/infra/check.mjs";

const result = runInfrastructureCheck({
  cwd: process.cwd(),
  args: process.argv.slice(2)
});

console.log(result.output);

if (result.exitCode !== 0) {
  process.exit(result.exitCode);
}
