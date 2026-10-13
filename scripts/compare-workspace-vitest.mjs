import { readFileSync } from "node:fs";

const [headFile, baseFile] = process.argv.slice(2);
if (!headFile || !baseFile) {
  throw new Error("Expected HEAD and main Vitest JSON report paths.");
}

function loadReport(file) {
  const report = JSON.parse(readFileSync(file, "utf8"));
  if (!Array.isArray(report.testResults)) {
    throw new Error(`Vitest report is missing testResults: ${file}`);
  }
  const failures = new Set();
  for (const testFile of report.testResults) {
    const name = String(testFile.name ?? "").replace(/^.*[\\/]__tests__[\\/]/, "__tests__/");
    for (const result of testFile.assertionResults ?? []) {
      if (result.status === "failed") failures.add(`${name} :: ${result.fullName}`);
    }
    if (testFile.status === "failed" && !(testFile.assertionResults ?? []).length) {
      failures.add(`${name} :: suite failed before test execution`);
    }
  }
  return { report, failures };
}

const head = loadReport(headFile);
const base = loadReport(baseFile);
const introduced = [...head.failures].filter((name) => !base.failures.has(name)).sort();
const resolved = [...base.failures].filter((name) => !head.failures.has(name)).sort();

console.log(`Workspace suite vs main: baseline failed=${base.failures.size}, PR failed=${head.failures.size}, new=${introduced.length}, resolved=${resolved.length}`);
if (resolved.length) console.log("Resolved baseline failures:\n"+resolved.join("\n"));
if (introduced.length) {
  console.error("NEW WORKSPACE FAILURES:\n"+introduced.join("\n"));
  process.exitCode = 1;
} else {
  console.log("PASS: No new Workspace test failures compared with main.");
}
