import { loadCases } from './cases';

const { loaded, errors } = loadCases();
let bad = errors.length;

for (const { file, slug, result } of loaded) {
  if (result.ok) {
    console.log(`✓ ${slug.padEnd(28)} ${result.data.difficulty.padEnd(7)} ${result.data.evidence.length} files · ${result.data.causes.length} causes · par ${result.data.par}`);
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
