import path from 'node:path';
import process from 'node:process';
import {createRequire} from 'node:module';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {expectTypeOf, expectError} from '../source/index.js';

const execFileAsync = promisify(execFile);
const require = createRequire(import.meta.url);

const fixturesPath = path.join(import.meta.dirname, 'fixtures', 'assertions');

const compilerPath = packageName => path.join(path.dirname(require.resolve(`${packageName}/package.json`)), 'bin/tsc');

const typescript7 = compilerPath('@typescript/native');
const typescript6 = compilerPath('typescript');

const compilerFlags = ['--noEmit', '--ignoreConfig', '--pretty', 'false', '--strict', '--module', 'nodenext', '--target', 'esnext'];

const compile = async (compiler, file, flags = []) => {
	try {
		await execFileAsync(process.execPath, [compiler, ...compilerFlags, ...flags, file], {cwd: fixturesPath});
		return '';
	} catch (error) {
		return error.stdout;
	}
};

// The location of each diagnostic and the failure alias it names.
const aliasPattern = /'(?<alias>ActualTypeIs\w*<.*?>)'/gv;

const summarize = output => output.split('\n').filter(line => /^\S/v.test(line)).map(line => {
	const [location] = line.split(': ', 1);
	const alias = line.matchAll(aliasPattern).toArray().at(-1)?.groups.alias;
	return `${location} ${alias}`;
});

test('passing assertions report nothing on either TypeScript version', async () => {
	// The readme says both versions are supported, so the assertions that must pass are checked on both, not only the ones that must fail.
	assert.equal(await compile(typescript7, 'passing.ts'), '');
	assert.equal(await compile(typescript6, 'passing.ts'), '');
});

test('failure messages name the actual type', async () => {
	assert.equal(await compile(typescript7, 'failures.ts'), `failures.ts(9,28): error TS2344: Type 'string' does not satisfy the constraint 'ActualTypeIs<number>'.
failures.ts(10,26): error TS2344: Type 'string' does not satisfy the constraint 'ActualTypeIs<any>'.
failures.ts(11,26): error TS2344: Type 'string' does not satisfy the constraint 'ActualTypeIs<"a" | "b">'.
failures.ts(12,32): error TS2741: Property '[actualTypeIs]' is missing in type '{ name: string; age: number; }' but required in type 'ActualTypeIs<{ name: string; }>'.
failures.ts(13,1): error TS2741: Property '[actualTypeIs]' is missing in type 'ExpectTypeOf<number>' but required in type 'ActualTypeIs<number>'.
failures.ts(14,1): error TS2741: Property '[actualTypeIs]' is missing in type 'ExpectTypeOf<number>' but required in type 'ActualTypeIs<number>'.
failures.ts(15,30): error TS2344: Type '(name: string) => string' does not satisfy the constraint 'ActualTypeIsIdentical<(name: string) => string>'.
failures.ts(16,40): error TS2344: Type 'string' does not satisfy the constraint 'ActualTypeIsNotAssignable<number>'.
failures.ts(17,34): error TS2344: Type 'number' does not satisfy the constraint 'ActualTypeIs<string>'.
failures.ts(18,1): error TS2741: Property '[actualTypeIs]' is missing in type 'ExpectTypeOf<unknown>' but required in type 'ActualTypeIs<unknown>'.
failures.ts(20,1): error TS2741: Property '[actualTypeIsIdentical]' is missing in type 'Negated<any>' but required in type 'ActualTypeIsIdentical<any>'.
failures.ts(22,29): error TS2344: Type 'number' does not satisfy the constraint 'ActualTypeIs<string>'.
failures.ts(23,45): error TS2344: Type 'number' does not satisfy the constraint 'ActualTypeIs<string>'.
failures.ts(24,37): error TS2741: Property '[actualTypeIs]' is missing in type '[name: number]' but required in type 'ActualTypeIs<[name: string]>'.
failures.ts(25,44): error TS2344: Type 'string | number' does not satisfy the constraint 'ActualTypeIsAssignable<number>'.
  Type 'string' is not assignable to type 'ActualTypeIsAssignable<number>'.
failures.ts(27,1): error TS2741: Property '[actualTypeIsAssignable]' is missing in type 'Negated<number>' but required in type 'ActualTypeIsAssignable<number>'.
failures.ts(30,38): error TS2344: Type 'string' does not satisfy the constraint 'ActualTypeIsNotAssignable<any>'.
failures.ts(31,39): error TS2344: Type 'string' does not satisfy the constraint 'ActualTypeIsNotAssignable<never>'.
failures.ts(33,1): error TS2741: Property '[actualTypeIs]' is missing in type 'ExpectTypeOf<number>' but required in type 'ActualTypeIs<number>'.
failures.ts(34,1): error TS2741: Property '[actualTypeIsNotAssignable]' is missing in type 'ExpectTypeOf<number>' but required in type 'ActualTypeIsNotAssignable<number>'.
failures.ts(36,28): error TS2741: Property '[actualTypeIs]' is missing in type '{ actualTypeIs: number; }' but required in type 'ActualTypeIs<number>'.
`);
});

test('failure messages are the same on TypeScript 6', async () => {
	assert.deepEqual(
		summarize(await compile(typescript6, 'failures.ts')),
		summarize(await compile(typescript7, 'failures.ts')),
	);
});

test('`toBe()` with `exactOptionalPropertyTypes`', async () => {
	const output = await compile(typescript7, 'exact-optional.ts', ['--exactOptionalPropertyTypes']);
	assert.equal(output, `exact-optional.ts(7,26): error TS2741: Property '[actualTypeIs]' is missing in type '{ name?: string | undefined; }' but required in type 'ActualTypeIs<{ name?: string; }>'.
`);
});

test('runtime calls do nothing', () => {
	assert.equal(expectTypeOf(1).toBe(), undefined);
	assert.equal(expectTypeOf(1).not.toBe(), undefined);
	assert.equal(expectTypeOf(1).toBeAssignableTo(), undefined);
	assert.equal(expectTypeOf(() => 1).returns.toBe(), undefined);
	assert.equal(expectTypeOf(1).not.toBeAssignableTo(), undefined);
	assert.equal(expectTypeOf(() => 1).parameters.toBe(), undefined);
	assert.equal(expectTypeOf(Promise.resolve(1)).resolves.toBe(), undefined);
	assert.equal(expectTypeOf().toBe(), undefined);
	assert.equal(expectError(1), undefined);
});
