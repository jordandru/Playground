import {
  createInfrastructureDoctor,
  formatMarkdownDoctor
} from "../src/infra/doctor.mjs";

const args = new Set(process.argv.slice(2));
const doctor = createInfrastructureDoctor({ cwd: process.cwd() });

if (args.has("--json")) {
  console.log(JSON.stringify(doctor, null, 2));
} else {
  console.log(formatMarkdownDoctor(doctor));
}
