import { spawnSync } from "node:child_process";

const steps = [
  {
    label: "Running tests",
    command: process.execPath,
    args: ["./test/run-tests.mjs"]
  },
  {
    label: "Running infrastructure check",
    command: process.execPath,
    args: ["./scripts/infra-check.mjs", "--json"]
  }
];

for (const step of steps) {
  console.log(`\n== ${step.label} ==`);

  const result = spawnSync(step.command, step.args, {
    cwd: process.cwd(),
    stdio: "inherit"
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
