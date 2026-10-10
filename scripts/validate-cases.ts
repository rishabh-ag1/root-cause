import { loadCases } from './cases';

const { loaded, errors } = loadCases();
let bad = errors.length;

for (const { file, result } of loaded) {
  if (result.ok) {
    console.log(`✓ ${file}  (#${result.data.case_number}, ${result.data.evidence.length} files, par ${result.data.par})`);
  } else {
    bad++;
    console.log(`✗ ${file}`);
    for (const e of result.errors) console.log(`    ${e}`);
  }
}
for (const e of errors) console.log(`✗ ${e}`);

if (!loaded.length) {
  console.log('No case files found in cases/.');
  process.exit(1);
}
console.log(bad ? `\n${bad} problem(s).` : `\nAll ${loaded.length} case file(s) valid.`);
process.exit(bad ? 1 : 0);
