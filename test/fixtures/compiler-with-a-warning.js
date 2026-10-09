// Stands in for a compiler, or a launcher around one, that writes a warning to stderr while the check passes.
// It reports only the error in the type check file, which is the last file in the generated config, so the run counts as type checked, and it exits the way `tsc` does when it reports an error.
import fs from 'node:fs';
import process from 'node:process';

const {files} = JSON.parse(fs.readFileSync(process.argv[process.argv.indexOf('--project') + 1], 'utf8'));
process.stdout.write(`${files.at(-1)}(2,7): error TS2322: Type 'number' is not assignable to type 'string'.\n`);
process.stderr.write('a warning that is not a type error\n');
process.exitCode = 2;
