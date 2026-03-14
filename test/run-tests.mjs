import { cliTests } from "./cli.test.mjs";
import { doctorTests } from "./doctor.test.mjs";
import { historyTests } from "./history.test.mjs";
import { policyTests } from "./policy.test.mjs";
import { reportTests } from "./report.test.mjs";

const tests = [...reportTests, ...policyTests, ...historyTests, ...doctorTests, ...cliTests];
let passed = 0;

for (const testCase of tests) {
  try {
    testCase.run();
    passed += 1;
    console.log(`PASS ${testCase.name}`);
  } catch (error) {
    console.error(`FAIL ${testCase.name}`);
    console.error(error instanceof Error ? error.stack : error);
    process.exit(1);
  }
}

console.log(`\n${passed}/${tests.length} tests passed`);
