// Stands in for a compiler on Windows, which ends its lines with `\r\n`. It reports the error in the type check file, which is the last file on the command line, and one error with a continuation line.
import process from 'node:process';

process.stdout.write(`${process.argv.at(-1)}(2,7): error TS2322: Type 'number' is not assignable to type 'string'.\r\nindex.test-d.ts(3,1): error TS2345: Argument of type 'number' is not assignable to parameter of type 'string'.\r\n  Type 'number' is not assignable to type 'string'.\r\n`);
process.exitCode = 2;
