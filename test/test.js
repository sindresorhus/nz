import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {typeTest, showConfig} from '../source/runner.js';
// eslint-disable-next-line node-test/no-import-test-files -- The test command skips the files that start with `_`.
import {
	fixturePath,
	typescript6,
	typescript7,
	assertionsPath,
	emptyPackage,
	withTemporaryPackage,
	withFixtureCopy,
	failures,
	failureLines,
	failuresOnBothCompilers,
} from './_utilities.js';

const execFileAsync = promisify(execFile);

const cliPath = path.join(import.meta.dirname, '..', 'source', 'cli.js');

// Asserts that `check` leaves none of the temporary directories behind in the `node_modules/.cache` of the package in `directory`, which every run has to clean up after itself. The package is outside the repository and has no `node_modules`, so the directories go in one that is made in the package, and no other run uses it.
async function assertNoTemporaryDirectoryIsLeft(directory, check) {
	await check();

	const cacheDirectory = path.join(directory, 'node_modules', '.cache');
	const entries = fs.existsSync(cacheDirectory) ? fs.readdirSync(cacheDirectory) : [];
	assert.deepEqual(entries.filter(entry => entry.startsWith('nz-')), []);
}

// Runs `check` with `NODE_OPTIONS` set to `value`, which the compiler process gets.
async function withNodeOptions(value, check) {
	const previous = process.env.NODE_OPTIONS;
	process.env.NODE_OPTIONS = value;

	try {
		await check();
	} finally {
		if (previous === undefined) {
			delete process.env.NODE_OPTIONS;
		} else {
			process.env.NODE_OPTIONS = previous;
		}
	}
}

// The failure for a run in which `tsc` did not type check, which comes before the failures with a location.
const typeCheckDidNotRun = {message: 'The type check did not run. A syntax error or an error in the compiler options stops it.'};

// The line of each failure, with a compiler error shortened to its code, which is all a test of where errors go needs.
const linesAndCodes = result => result.map(({line, message}) => ({line, message: message.startsWith('error TS') ? message.split(':', 1)[0] : message}));

// `GITHUB_ACTIONS` is cleared, so the output is the same when these tests run in GitHub Actions.

const runCli = async (name, arguments_ = [], environment = {}) => {
	try {
		const {stdout, stderr} = await execFileAsync(process.execPath, [cliPath, ...arguments_], {cwd: fixturePath(name), env: {...process.env, GITHUB_ACTIONS: '', ...environment}});
		return {stdout, stderr, exitCode: 0};
	} catch (error) {
		return {stdout: error.stdout, stderr: error.stderr, exitCode: error.code};
	}
};

test('the `expectError` declaration the scanner fixtures use is the real one', () => {
	// A test file cannot import the package it is checked with, so the fixtures declare their own `expectError`. If that drifts from the real one, the scanner is tested against a signature that nothing uses.
	const declaration = fs.readFileSync(fixturePath('expect-error.d.ts'), 'utf8').trim();
	assert.ok(
		fs.readFileSync(new URL('../source/index.d.ts', import.meta.url), 'utf8').includes(declaration),
		'`expectError` in index.d.ts has changed. Copy the declaration into test/fixtures/expect-error.d.ts.',
	);
});

test('passing package has no failures', async () => {
	assert.deepEqual(await failures('passing'), []);
});

test('reports compiler errors, `expectError` calls without an error, and unused `@ts-expect-error` directives', async () => {
	assert.deepEqual(await failures('failing'), [
		{
			file: 'index.test-d.ts',
			line: 4,
			column: 7,
			message: 'error TS2322: Type \'string\' is not assignable to type \'number\'.',
		},
		{
			file: 'index.test-d.ts',
			line: 6,
			column: 1,
			message: 'Expected an error, but found none.',
		},
		{
			file: 'index.test-d.ts',
			line: 8,
			column: 1,
			message: 'error TS2578: Unused \'@ts-expect-error\' directive.',
		},
	]);
});

test('a syntax error with a code outside TS1xxx in an `expectError` call is a failure', async () => {
	// The error in the next line is never reported, because the syntax error makes `tsc` skip the type check.
	const unaryExponentiationFailures = await failures('unary-exponentiation');
	assert.deepEqual(unaryExponentiationFailures.map(({file, line, message}) => ({file, line, code: message.split(':', 1)[0]})), [
		{file: undefined, line: undefined, code: typeCheckDidNotRun.message},
		{file: 'index.test-d.ts', line: 4, code: 'error TS17006'},
	]);
});

test('a name that does not exist does not satisfy an `expectError` call', async () => {
	// A typo in the call would otherwise pass it, whatever the type of the value is.
	const missingNameFailures = await failures('expect-error-missing-name');
	assert.deepEqual(missingNameFailures.map(({line, column, message}) => ({line, column, code: message.split(':', 1)[0]})), [
		{line: 4, column: 1, code: 'Expected an error, but found none.'},
		{line: 4, column: 13, code: 'error TS2552'},
		{line: 5, column: 1, code: 'Expected an error, but found none.'},
		{line: 5, column: 13, code: 'error TS2304'},
		{line: 9, column: 1, code: 'Expected an error, but found none.'},
		{line: 9, column: 19, code: 'error TS2592'},
		{line: 10, column: 1, code: 'Expected an error, but found none.'},
		{line: 10, column: 14, code: 'error TS18004'},
		{line: 11, column: 1, code: 'Expected an error, but found none.'},
		{line: 11, column: 18, code: 'error TS2503'},
	]);
});

test('reports the comments that hide failures', async () => {
	// Both make a failing check pass without a trace. They are read the way TypeScript reads them: `@ts-ignore` on the last line of a comment, and `@ts-nocheck` in a line comment before the first statement, so the ones TypeScript does not honor are not reported. A `@ts-ignore` in a declaration file is not reported either, because it is how a type from an optional dependency is imported.
	assert.deepEqual(await failureLines('suppression-comments'), [
		'index.d.ts:1:1  `@ts-nocheck` turns off the type check of the file. Remove it.',
		'index.test-d.ts:3:1  `@ts-ignore` hides a failure. Use `@ts-expect-error` instead, which fails when there is no error to hide.',
		'index.test-d.ts:6:1  `@ts-ignore` hides a failure. Use `@ts-expect-error` instead, which fails when there is no error to hide.',
		'index.test-d.ts:9:1  `@ts-ignore` hides a failure. Use `@ts-expect-error` instead, which fails when there is no error to hide.',
		'index.test-d.ts:13:1  `@ts-ignore` hides a failure. Use `@ts-expect-error` instead, which fails when there is no error to hide.',
		'index.test-d.ts:18:7  error TS2322: Type \'string\' is not assignable to type \'number\'.',
		'test-d/nocheck.ts:2:1  `@ts-nocheck` turns off the type check of the file. Remove it.',
		'test-d/shebang.ts:2:1  `@ts-nocheck` turns off the type check of the file. Remove it.',
		'test-d/upper-case.ts:1:1  `@ts-nocheck` turns off the type check of the file. Remove it.',
	]);
});

test('reports unchecked source helpers imported by type tests', async () => {
	// Helpers are not test files or published declarations, and a helper's `@ts-ignore` is left alone. The helpers come from the files the compiler lists, so both versions are checked.
	const expected = [
		'aliases/value.ts:1:1  `@ts-nocheck` turns off the type check of the file. Remove it.',
		'helper.ts:1:1  `@ts-nocheck` turns off the type check of the file. Remove it.',
		'nested-helper.ts:2:1  `@ts-nocheck` turns off the type check of the file. Remove it.',
	];
	assert.deepEqual(await failureLines('imported-helper-nocheck'), expected);
	assert.deepEqual(await failureLines('imported-helper-nocheck', {compilerPath: typescript6}), expected);
});

test('does not report `@ts-nocheck` in a JavaScript helper or a comment in a JSON file', async () => {
	// Without `checkJs`, a JavaScript file is not type checked, so the directive changes nothing, like a vendored file can have. A JSON file has no directives, so its comment is not one.
	const files = {
		...emptyPackage,
		'tsconfig.json': '{"compilerOptions": {"strict": true, "module": "nodenext", "types": [], "allowJs": true, "resolveJsonModule": true}}\n',
		'data.json': '// @ts-nocheck\n{"value": 1}\n',
		'helper.js': '// @ts-nocheck\n/** @type {string} */\nexport const value = 1;\n',
		'index.test-d.ts': [
			'import data from \'./data.json\' with {type: \'json\'};',
			'import {value} from \'./helper.js\';',
			`import {expectTypeOf} from ${JSON.stringify(assertionsPath)};`,
			'expectTypeOf(data.value).toBe<number>();',
			'expectTypeOf(value).toBe<string>();',
			'',
		].join('\n'),
	};

	await withTemporaryPackage(files, async directory => {
		assert.deepEqual(await failures(directory, {compilerPath: typescript7}), []);
	});
});

test('checks the assertions in a test file that another test file imports', async () => {
	// It has the name or the directory of a test file. A helper with an assertion is not a test file, so its call is not checked. The files come from the files the compiler lists, so both versions are checked.
	const expected = [
		'imported.test-d.tsx:4:1  Expected an error, but found none.',
		'nested/imported.test-d.ts:4:1  Expected an error, but found none.',
		'test-d/view.tsx:4:1  Expected an error, but found none.',
		'typetests/unchecked.tsx:3:1  `@ts-ignore` hides a failure. Use `@ts-expect-error` instead, which fails when there is no error to hide.',
		'typetests/unchecked.tsx:6:1  `printType` from `tsd` does nothing here, because only `tsd` checks it. Remove it.',
	];
	assert.deepEqual(await failureLines('imported-assertion-tsx'), expected);
	assert.deepEqual(await failureLines('imported-assertion-tsx', {compilerPath: typescript6}), expected);
});

test('does not check the assertions in a test file of a dependency', async () => {
	// The test file of a dependency is not the package's own, even when a test file imports it.
	const files = {
		...emptyPackage,
		'index.test-d.ts': 'import \'dependency/index.test-d.js\';\n',
		'node_modules/dependency/package.json': '{"name": "dependency", "type": "module"}\n',
		'node_modules/dependency/index.test-d.ts': `import {expectError} from ${JSON.stringify(assertionsPath)};\n\nexpectError(1);\n`,
	};

	await withTemporaryPackage(files, async directory => {
		assert.deepEqual(await failures(directory, {compilerPath: typescript7}), []);
	});
});

test('does not report `@ts-nocheck` in a dependency that a test file imports', async () => {
	// A dependency can publish TypeScript source with the directive, and it is not a file of the package.
	const files = {
		...emptyPackage,
		'index.test-d.ts': 'import {value} from \'dependency\';\n\nexport const count: number = value;\n',
		'node_modules/dependency/package.json': '{"name": "dependency", "type": "module", "exports": {"types": "./index.ts"}}\n',
		'node_modules/dependency/index.ts': '// @ts-nocheck\nexport const value: number = 1;\n',
	};

	await withTemporaryPackage(files, async directory => {
		assert.deepEqual(await failures(directory, {compilerPath: typescript7}), []);
	});
});

test('honors a `@ts-check` that turns the check back on after `@ts-nocheck`', async () => {
	// TypeScript takes the last of the two, in a test file, a declaration file, an imported test file, and a helper alike.
	assert.deepEqual(await failures('overridden-nocheck'), []);
	assert.deepEqual(await failures('overridden-nocheck', {compilerPath: typescript6}), []);
});

test('an `expectError` call with a message only passes for an error that includes it', async () => {
	// An error that does not include the message is reported, so the failure shows what the error was. Each form of a string literal is read, which a message that does not match proves. Anything else is not a message, so those calls take any error.
	assert.deepEqual(await failureLines('expect-error-message'), [
		'index.test-d.ts:5:1  Expected an error that includes “Argument of type \'string\'”, but found none.',
		'index.test-d.ts:5:19  error TS2345: Argument of type \'number\' is not assignable to parameter of type \'string\'.',
		'index.test-d.ts:6:1  Expected an error that includes “is not a function”, but found none.',
		'index.test-d.ts:6:19  error TS2345: Argument of type \'number\' is not assignable to parameter of type \'string\'.',
		'index.test-d.ts:7:1  Expected an error that includes “not assignable to type”, but found none.',
		'index.test-d.ts:7:19  error TS2345: Argument of type \'number\' is not assignable to parameter of type \'string\'.',
		'index.test-d.ts:8:1  Expected an error that includes “anything”, but found none.',
		'index.test-d.ts:9:1  Expected an error that includes “It\'s not”, but found none.',
		'index.test-d.ts:9:19  error TS2345: Argument of type \'number\' is not assignable to parameter of type \'string\'.',
	]);
});

test('an error in the type argument of an `expectError` call satisfies it, except a name that does not exist', async () => {
	// A type argument that does not satisfy its constraint is a normal thing to test. A name that does not exist is a typo, so it is a failure of its own, also in the type argument.
	assert.deepEqual(await failureLines('type-argument'), [
		'index.test-d.ts:5:13  error TS2304: Cannot find name \'Missing\'.',
	]);
});

test('a syntax error in an `expectError` call is a failure', async () => {
	// A syntax error makes `tsc` skip the type check of the whole program, so if it satisfied the call, the run would pass with nothing checked. No call is reported as one that found no error, because nothing was checked.
	assert.deepEqual(await failureLines('syntax-error'), [
		typeCheckDidNotRun.message,
		'index.test-d.ts:4:23  error TS1109: Expression expected.',
	]);
});

test('reports a long type in full', async () => {
	// `tsc` cuts a long type to `... 12 more ...` by default, and the type is what a failure is about.
	const [failure] = await failures('long-type');
	assert.match(failure.message, /property30: string/v);
	assert.doesNotMatch(failure.message, /more \.\.\./v);
});

test('describes a failed assertion in one line, the same on TypeScript 6 and 7', async () => {
	// TypeScript words the same failure in several ways, and TypeScript 7 in other ones than TypeScript 6. The marker types are the tool's own, so it can read the types from any of them.
	const expected = [
		{line: 6, message: 'Expected type \'string\', but the actual type is \'number\'.'},
		{line: 7, message: 'Expected type \'{name: string; age: number}\', but the actual type is \'{ name: string; }\'.'},
		{line: 8, message: 'Expected the type argument (\'never\' without one), but the actual type is \'number\'.'},
		{line: 9, message: 'Expected a type other than \'number\', but the actual type is identical.'},
		{line: 10, message: 'Expected a type assignable to \'string\', but the actual type is \'number\'.'},
		{line: 11, message: 'Expected a type not assignable to \'number | string\', but the actual type is \'number\'.'},
		{line: 12, message: 'Expected a type not assignable to the type argument, but the actual type is \'number\'.'},
		// TypeScript widens a literal in the message, so the expected type is the one written in the test.
		{line: 14, message: 'Expected type \'"a"\', but the actual type is \'"b"\'.'},
		{line: 16, message: 'Expected a type other than \'"b"\', but the actual type is identical.'},
		{line: 19, message: 'Expected type \'"it\'s" | "y\'s"\', but the actual type is \'"it\'s"\'.'},
	];

	const typescript7Failures = await failures('assertion-messages');
	assert.deepEqual(typescript7Failures.map(({line, message}) => ({line, message})), expected);

	const typescript6Failures = await failures('assertion-messages', {compilerPath: typescript6});
	assert.deepEqual(typescript6Failures.map(({line, message}) => ({line, message})), expected);
});

test('expected assertion object types are not confused with guarded expected types', async () => {
	const expected = [
		{line: 3, message: 'Expected type \'ExpectTypeOf<string>\', but the actual type is \'number\'.'},
		{line: 4, message: 'Expected a type assignable to \'ExpectTypeOf<string>\', but the actual type is \'number\'.'},
		{line: 5, message: 'Expected a type other than \'ExpectTypeOf<string>\', but the actual type is identical.'},
		{line: 8, message: 'Expected type \'Negated<string>\', but the actual type is \'number\'.'},
		{line: 9, message: 'Expected a type assignable to \'Negated<string>\', but the actual type is \'number\'.'},
		{line: 10, message: 'Expected a type other than \'Negated<string>\', but the actual type is identical.'},
		{line: 13, message: 'Expected the type argument (\'never\' without one), but the actual type is \'ExpectTypeOf<string>\'.'},
		{line: 14, message: 'Expected the type argument (\'never\' without one), but the actual type is \'Negated<string>\'.'},
	];
	const results = await failuresOnBothCompilers('assertion-expectation-types');
	assert.deepEqual(results.map(result => result.map(({line, message}) => ({line, message}))), [expected, expected]);
});

test('describes a failed assertion whose expected type satisfies the constraint', async () => {
	// Without `strictNullChecks`, `null` and `undefined` satisfy every constraint, like `any` and `never` do, and so does a failure type taken from an assertion. Without a type argument, the expected type is `never`.
	const expected = [
		[3, 'Expected the type argument (\'never\' without one), but the actual type is \'number\'.'],
		[4, 'Expected the type argument (\'never\' without one), but the actual type is \'number\'.'],
		[5, 'Expected the type argument (\'never\' without one), but the actual type is \'any\'.'],
		[6, 'Expected the type argument (\'never\' without one), but the actual type is \'never\'.'],
		[7, 'Expected a type other than the type argument, but the actual type is identical.'],
		[8, 'Expected a type other than the type argument, but the actual type is identical.'],
		[9, 'Expected a type assignable to the type argument (\'never\' without one), but the actual type is \'number\'.'],
		[10, 'Expected a type assignable to the type argument (\'never\' without one), but the actual type is \'any\'.'],
		[11, 'Expected a type not assignable to the type argument, but the actual type is \'null\'.'],
		[12, 'Expected a type not assignable to the type argument, but the actual type is \'undefined\'.'],
		[17, 'Expected the type argument (\'never\' without one), but the actual type is \'number\'.'],
		[20, 'Expected a type assignable to the type argument (\'never\' without one), but the actual type is \'number\'.'],
		[24, 'Expected the type argument (\'never\' without one), but the actual type is \'any\'.'],
		[26, 'Expected the type argument (\'never\' without one), but the actual type is \'number\'.'],
		[27, 'Expected a type assignable to the type argument (\'never\' without one), but the actual type is \'number\'.'],
	].map(([line, message]) => ({line, message}));
	const results = await failuresOnBothCompilers('assertion-nullable-guards');
	assert.deepEqual(results.map(result => result.map(({line, message}) => ({line, message}))), [expected, expected]);
});

test('shows the control characters in a failure message as escapes', async () => {
	// A literal type or a message filter can hold a character that controls the terminal. The description of a failed assertion comes from the compiler's message, so both versions are checked.
	const controlType = JSON.stringify('\u{9B}31m');
	const files = {
		...emptyPackage,
		'index.test-d.ts': [
			`import {expectTypeOf, expectError} from ${JSON.stringify(assertionsPath)};`,
			`expectTypeOf<number>().toBe<${controlType}>();`,
			'expectTypeOf<number>().toBe<`line\nbreak`>();',
			`expectTypeOf<${controlType}>().not.toBe<${controlType}>();`,
			`expectError(1, ${JSON.stringify('\u{1B}[31mcolor')});`,
			`expectError(1, ${JSON.stringify('\u{0}nul\ttab')});`,
			'',
		].join('\n'),
	};

	await withTemporaryPackage(files, async directory => {
		const expected = [
			String.raw`index.test-d.ts:2:29  Expected type '"\u009b31m"', but the actual type is 'number'.`,
			'index.test-d.ts:3:29  Expected type \'`line\\u000abreak`\', but the actual type is \'number\'.',
			String.raw`index.test-d.ts:5:33  Expected a type other than '"\u009b31m"', but the actual type is identical.`,
			String.raw`index.test-d.ts:6:1  Expected an error that includes “\u001b[31mcolor”, but found none.`,
			String.raw`index.test-d.ts:7:1  Expected an error that includes “\u0000nul\u0009tab”, but found none.`,
		];
		assert.deepEqual(await failureLines(directory, {compilerPath: typescript7}), expected);
		assert.deepEqual(await failureLines(directory, {compilerPath: typescript6}), expected);
	});
});

test('a message filter with a line break matches the continuation lines of an error', async () => {
	const files = {
		...emptyPackage,
		'index.test-d.ts': [
			`import {expectError} from ${JSON.stringify(assertionsPath)};`,
			'declare function takesObject(value: {value: number}): void;',
			'declare const wrong: {value: string};',
			String.raw`expectError(takesObject(wrong), "\n  Types of property 'value'");`,
			String.raw`expectError(takesObject(wrong), "different\nmessage");`,
			'',
		].join('\n'),
	};

	await withTemporaryPackage(files, async directory => {
		assert.deepEqual(linesAndCodes(await failures(directory, {compilerPath: typescript7})), [
			{line: 5, message: String.raw`Expected an error that includes “different\u000amessage”, but found none.`},
			{line: 5, message: 'error TS2345'},
		]);
	});
});

test('reports errors in the declaration file', async () => {
	assert.deepEqual(await failureLines('declaration-error'), [
		'index.d.ts:1:38  error TS2304: Cannot find name \'Missing\'.',
	]);
});

test('`expectError` calls with parentheses in strings, comments, template literals, and regexes, and a regex after a keyword', async () => {
	assert.deepEqual(await failures('scanner'), []);
});

test('an `expectError` call does not hide nested assertions or suppression directives', async () => {
	// A genuine error in the outer call would otherwise make all three kinds of hidden failure pass.
	assert.deepEqual(await failureLines('expect-error-nested-content'), [
		'index.test-d.ts:6:24  Expected an error, but found none.',
		'index.test-d.ts:11:2  `@ts-ignore` hides a failure. Use `@ts-expect-error` instead, which fails when there is no error to hide.',
		'index.test-d.ts:16:24  `printType` from `tsd` does nothing here, because only `tsd` checks it. Remove it.',
		'index.test-d.ts:23:24  Expected an error that includes “wrong message”, but found none.',
		'index.test-d.ts:23:42  error TS2345: Argument of type \'number\' is not assignable to parameter of type \'string\'.',
	]);
});

test('nested assertion filters do not hide errors rejected by another filter', async () => {
	// An error is only left out when every call around it accepts it.
	assert.deepEqual(linesAndCodes(await failures('expect-error-nested-messages')), [
		{line: 5, message: 'Expected an error that includes “wrong inner message”, but found none.'},
		{line: 5, message: 'error TS2345'},
		{line: 6, message: 'Expected an error that includes “wrong outer message”, but found none.'},
		{line: 6, message: 'error TS2345'},
		{line: 7, message: 'Expected an error that includes “wrong outer message”, but found none.'},
		{line: 7, message: 'Expected an error that includes “wrong inner message”, but found none.'},
		{line: 7, message: 'error TS2345'},
		{line: 17, message: 'error TS2345'},
		{line: 20, message: 'error TS2345'},
	]);
});

test('an unused `@ts-expect-error` directive does not satisfy an `expectError` call', async () => {
	// The directive is a mistake in the test, like a name that does not exist, so it stays a failure, also inside a call.
	assert.deepEqual(linesAndCodes(await failures('expect-error-unused-directives')), [
		{line: 4, message: 'Expected an error, but found none.'},
		{line: 5, message: 'error TS2578'},
		{line: 9, message: 'Expected an error, but found none.'},
		{line: 15, message: 'error TS2578'},
		{line: 21, message: 'Expected an error that includes “Unused \'@ts-expect-error\' directive”, but found none.'},
		{line: 22, message: 'error TS2578'},
		{line: 27, message: 'error TS2578'},
		{line: 31, message: 'Expected an error that includes “Unused \'@ts-expect-error\' directive”, but found none.'},
		{line: 31, message: 'Expected an error, but found none.'},
		{line: 32, message: 'error TS2578'},
		{line: 40, message: 'error TS2578'},
	]);
});

test('reports the `tsd` assertions that pass with any value, only in a file that imports `tsd`', async () => {
	assert.deepEqual(await failureLines('tsd-assertions'), [
		'index.test-d.ts:10:1  `expectNotType` from `tsd` does nothing here, because only `tsd` checks it. Use `expectTypeOf(value).not.toBe<Type>()` instead.',
		'index.test-d.ts:11:1  `expectNotAssignable` from `tsd` does nothing here, because only `tsd` checks it. Use `expectTypeOf(value).not.toBeAssignableTo<Type>()` instead.',
		'index.test-d.ts:12:1  `expectDeprecated` from `tsd` does nothing here, because only `tsd` checks it. Remove it.',
		'index.test-d.ts:13:1  `expectNotDeprecated` from `tsd` does nothing here, because only `tsd` checks it. Remove it.',
		'index.test-d.ts:14:1  `printType` from `tsd` does nothing here, because only `tsd` checks it. Remove it.',
		'index.test-d.ts:15:1  `expectDocCommentIncludes` from `tsd` does nothing here, because only `tsd` checks it. Remove it.',
	]);
});

test('checks every `types` entry in a subpath exports map', async () => {
	assert.deepEqual(await failureLines('subpath-exports'), [
		'extra.d.ts:1:21  error TS2304: Cannot find name \'Missing\'.',
	]);
});

test('skips a subpath pattern in `exports`', async () => {
	// `./*.d.ts` is a pattern, not a file, so passing it to `tsc` would report a file that does not exist.
	assert.deepEqual(await failures('exports-pattern'), []);
});

test('checks a `types` condition that has conditions of its own', async () => {
	assert.deepEqual(await failureLines('types-conditions'), [
		'greet.d.ts:1:38  error TS2304: Cannot find name \'Missing\'.',
	]);
});

test('finds test files in the `test-d` directory', async () => {
	assert.deepEqual(await failureLines('test-d-directory'), [
		'test-d/nested/greet.ts:3:7  error TS2322: Type \'string\' is not assignable to type \'number\'.',
	]);
});

test('finds test files in a directory in `test-d` whose name ends in `.ts`', async () => {
	// The directory is not a test file, so reading it must not fail, and the files in it are still found.
	assert.deepEqual(await failureLines('test-d-directory-with-subdirectory'), [
		'test-d/fixtures.ts/nested.ts:3:14  error TS2322: Type \'string\' is not assignable to type \'number\'.',
	]);
});

test('finds symlinked test files', async () => {
	assert.deepEqual(await failureLines('symlinked-test-file'), [
		'index.test-d.ts:3:7  error TS2322: Type \'string\' is not assignable to type \'number\'.',
	]);
});

test('finds the test files and their positions in a file with Unicode line separators', async () => {
	// TypeScript counts a Unicode line separator as a line terminator, so the comment and the two calls after it are found.
	assert.deepEqual(await failures('unicode-line-break'), []);
});

test('finds the calls after a string with a line continuation in a file with Windows line breaks', async () => {
	// The escaped line break is `\r\n`, so stepping over only the `\r` ended the string at the `\n`, and the scan stopped there.
	assert.deepEqual(await failures('crlf-line-continuation'), []);
});

test('ignores `node_modules` in the `test-d` directory', async () => {
	assert.deepEqual(await failureLines('test-d-node-modules'), [
		'test-d/greet.ts:3:14  error TS2322: Type \'string\' is not assignable to type \'number\'.',
	]);
});

test('finds test files in the `test-d` directory of a package with a tsconfig.json', async () => {
	// The generated config lists the files it found, so the files in `test-d` have to be in it.
	assert.deepEqual(await failureLines('tsconfig-test-d'), [
		'test-d/greet.ts:3:14  error TS2322: Type \'string\' is not assignable to type \'number\'.',
	]);
});

test('finds test files in the `test-d` and `typetests` directories', async () => {
	assert.deepEqual(await failureLines('typetests'), [
		'test-d/greet.ts:3:14  error TS2322: Type \'string\' is not assignable to type \'number\'.',
		'typetests/greet.ts:3:14  error TS2322: Type \'string\' is not assignable to type \'number\'.',
	]);
});

test('finds the declaration file from `typings`', async () => {
	assert.deepEqual(await failureLines('typings'), [
		'index.test-d.ts:3:7  error TS2345: Argument of type \'number\' is not assignable to parameter of type \'string\'.',
	]);
});

test('does not follow a symlink to a directory in `test-d`', async () => {
	// Reading the directory as a test file fails with `EISDIR`, which names no file and loses every other failure in the package.
	assert.deepEqual(await failureLines('test-d-symlinked-directory'), [
		'test-d/greet.ts:3:14  error TS2322: Type \'string\' is not assignable to type \'number\'.',
		'test-d/shared/nested.ts:3:14  error TS2322: Type \'string\' is not assignable to type \'number\'.',
	]);
});

test('finds the declaration file from `main`', async () => {
	assert.deepEqual(await failureLines('main-fallback'), [
		'lib/main.test-d.ts:3:7  error TS2322: Type \'string\' is not assignable to type \'number\'.',
	]);
});

test('reports positions in a test file with a byte order mark', async () => {
	// TypeScript skips the byte order mark but does not count it as a column, so the scanner has to skip it too.
	assert.deepEqual(await failureLines('bom'), [
		'index.test-d.ts:1:1  Expected an error, but found none.',
	]);
});

test('reads a package.json with a byte order mark', async () => {
	// `JSON.parse` does not, but npm, bun and TypeScript all do, so a package.json written by one of them has to work.
	assert.deepEqual(await failures('package-json-bom'), []);
});

test('throws when there are no test files', async () => {
	// All three places the test files can be are named, because the message is what the user acts on.
	await assert.rejects(failures('no-tests'), /Could not find type test files\. Add an `index\.test-d\.ts` file next to the declaration file, or put them in a `test-d` or `typetests` directory\./v);
});

test('ignores what the compiler writes to stderr', async () => {
	// `tsc` writes its diagnostics to stdout, so a warning on stderr is not a type error, and it used to be parsed as one.
	// The fixture has no `expectError` calls, because this compiler reports only the error in the type check file.
	const compilerPath = fixturePath('compiler-with-a-warning.js');
	assert.deepEqual(await typeTest({cwd: fixturePath('tsconfig-types'), compilerPath}), {failures: []});
});

test('reads compiler output with Windows line breaks', async () => {
	// A `\r` left at the end of a line would stop the line from matching as a diagnostic, so the type check would look like it did not run.
	assert.deepEqual(await typeTest({cwd: fixturePath('declaration-error'), compilerPath: fixturePath('compiler-with-crlf.js')}), {
		failures: [
			{
				file: 'index.test-d.ts',
				line: 3,
				column: 1,
				message: 'error TS2345: Argument of type \'number\' is not assignable to parameter of type \'string\'.\n  Type \'number\' is not assignable to type \'string\'.',
			},
		],
	});
});

test('throws when the compiler cannot be run', async () => {
	// A compiler that did not run is not a list of type failures.
	await assert.rejects(
		typeTest({cwd: fixturePath('passing'), compilerPath: fixturePath('compiler-that-fails.js')}),
		/the compiler could not start/v,
	);

	await assert.rejects(
		typeTest({cwd: fixturePath('passing'), compilerPath: fixturePath('missing-compiler.js')}),
		/Could not run the TypeScript compiler/v,
	);

	// Nothing was written anywhere, so the exit code is the only reason there is.
	await assert.rejects(
		typeTest({cwd: fixturePath('passing'), compilerPath: fixturePath('compiler-without-output.js')}),
		/it exited with 2 and wrote nothing/v,
	);
});

test('gives the compiler more memory than the Node.js default, unless `NODE_OPTIONS` sets it', async () => {
	// A large package, like `type-fest`, needs more than the default heap of about 4 GB with TypeScript 6.
	const heapLimit = async () => {
		const error = await typeTest({cwd: fixturePath('passing'), compilerPath: fixturePath('compiler-heap-limit.js')}).catch(error_ => error_);
		return Number(/heap limit (?<limit>\d+) MB/v.exec(error.message).groups.limit);
	};

	assert.ok(await heapLimit() >= 8192);

	await withNodeOptions('--max-old-space-size=12000', async () => {
		assert.ok(await heapLimit() >= 12_000);
	});
});

test('throws a short error with the fix when the compiler runs out of memory', async () => {
	// The stack trace V8 writes says nothing that helps, and it hides how to give the compiler more memory.
	await assert.rejects(
		typeTest({cwd: fixturePath('passing'), compilerPath: fixturePath('compiler-out-of-memory.js')}),
		error => {
			assert.match(error.message, /ran out of memory/v);
			assert.match(error.message, /NODE_OPTIONS=--max-old-space-size=/v);
			assert.doesNotMatch(error.message, /Native stack trace/v);
			return true;
		},
	);
});

test('throws when the `typescript` package cannot be resolved', async () => {
	// The package is installed, so telling the user to install it is the wrong advice. Its `exports` map is the reason it cannot be read.
	const files = {
		'package.json': JSON.stringify({exports: {types: './index.d.ts'}}),
		'index.d.ts': 'export function greet(name: string): string;\n',
		'index.test-d.ts': 'greet(1);\n',
		'node_modules/typescript/package.json': JSON.stringify({name: 'typescript', version: '7.0.2', exports: {'.': './index.js'}}),
		'node_modules/typescript/index.js': 'module.exports = {};\n',
	};

	await withTemporaryPackage(files, async directory => {
		// The reason is in the message, because the CLI prints only the message.
		await assert.rejects(typeTest({cwd: directory}), /Could not resolve `typescript\/package\.json` from .+: Package subpath '\.\/package\.json' is not defined by "exports"/v);
	});
});

test('uses the `bin` of the `@typescript/native` package when it is a path', async () => {
	// A package with a single binary is allowed to have `bin` be the path itself. The stub reports only the error in the type check file, and the fixture has no `expectError` calls. It is `@typescript/native`, because that is looked for first, and the walk up would find the one this repository has.
	assert.deepEqual(await typeTest({cwd: fixturePath('typescript-string-bin')}), {failures: []});
});

test('uses the `tsc6` binary of a `typescript` package aliased to TypeScript 6', async () => {
	// TypeScript recommends `typescript` as an alias of `@typescript/typescript6` next to TypeScript 7, and that package names its binary `tsc6`. The stub reports the error in the type check file, which is the last argument, and one of its own.
	const files = {
		'package.json': JSON.stringify({type: 'module', types: './index.d.ts'}),
		'index.d.ts': 'export function greet(name: string): string;\n',
		'index.test-d.ts': 'greet(\'World\');\n',
		'node_modules/typescript/package.json': JSON.stringify({name: '@typescript/typescript6', version: '6.0.3', bin: {tsc6: './bin/tsc6'}}),
		// eslint-disable-next-line no-template-curly-in-string -- It is the source of the stub.
		'node_modules/typescript/bin/tsc6': 'process.stdout.write(`${process.argv.at(-1)}(2,7): error TS2322: Known.\\nindex.test-d.ts(1,1): error TS2322: From tsc6.\\n`);\nprocess.exitCode = 2;\n',
	};

	await withTemporaryPackage(files, async directory => {
		assert.deepEqual(await typeTest({cwd: directory}), {
			failures: [
				{
					file: 'index.test-d.ts',
					line: 1,
					column: 1,
					message: 'error TS2322: From tsc6.',
				},
			],
		});
	});
});

test('throws when the `typescript` package is too old', async () => {
	// An older `tsc` rejects `--ignoreConfig` and type checks nothing, so every assertion came out as a failure with the one reason on top.
	await assert.rejects(failures('old-typescript'), /is 5\.9\.3, and `nz` needs 6\.0 or later/v);
});

test('throws when there is no package.json', async () => {
	await assert.rejects(failures('.'), /No package\.json/v);

	// A directory that does not exist has no package.json either, and that is the reason to give, not the error from reading the path.
	await assert.rejects(failures('missing-directory'), /No package\.json in .+missing-directory/v);
});

test('names the file in a JSON error', async () => {
	// The `SyntaxError` only has a position in the text, which says nothing about which file it is in.
	await assert.rejects(failures('invalid-package-json'), /Invalid JSON in .*invalid-package-json.+package\.json/v);
});

test('uses the project tsconfig.json', async () => {
	// The fixture turns `strict` off, lists a `files` entry that does not exist, and points `tsBuildInfoFile` into the package. All three are the package's choice and none of them is checked or written.
	assert.deepEqual(await failures('tsconfig-used'), []);
});

test('uses the `extends` chain of the project tsconfig.json', async () => {
	// `strict` is in the base config, so the error is only reported when the chain is followed.
	assert.deepEqual(await failureLines('tsconfig-extends'), [
		'index.test-d.ts:5:7  error TS2345: Argument of type \'string | undefined\' is not assignable to parameter of type \'string\'.\n  Type \'undefined\' is not assignable to type \'string\'.',
	]);
});

for (const extendsPath of ['../base.json', './node_modules/shared-config/base.json']) {
	test(`reports an invalid option in a config that the project tsconfig.json extends from a parent directory or a dependency: ${extendsPath}`, async () => {
		// The config is not one of the files the compiler checks, so its error is not noise from a file outside the package. It is still a failure, also when the config is in `node_modules`.
		const files = {
			'package/package.json': emptyPackage['package.json'],
			'package/index.d.ts': emptyPackage['index.d.ts'],
			'package/index.test-d.ts': 'export {};\n',
			'package/tsconfig.json': JSON.stringify({extends: extendsPath}),
			[path.join('package', extendsPath)]: '{\n\t"compilerOptions": {\n\t\t"strict": true,\n\t\t"aNonexistentCompilerOption": true\n\t}\n}\n',
		};

		await withTemporaryPackage(files, async directory => {
			const expected = [`${extendsPath.replace(/^\.\//v, '')}:4:3  error TS5023: Unknown compiler option 'aNonexistentCompilerOption'.`];
			assert.deepEqual(await failureLines(path.join(directory, 'package'), {compilerPath: typescript7}), expected);
			assert.deepEqual(await failureLines(path.join(directory, 'package'), {compilerPath: typescript6}), expected);
		});
	});
}

test('finds `@types/node` when the package has a tsconfig.json', async () => {
	// TypeScript finds a `types` entry from the directory holding the config, so the generated config has to be where it sees the package `node_modules`.
	assert.deepEqual(await failures('tsconfig-types'), []);
});

test('uses the `types` of the package tsconfig.json', async () => {
	// The package leaves out the Node.js globals on purpose, so a test that uses one has to fail, like it does with the package's own `tsc`.
	const lines = await failureLines('tsconfig-types-empty');
	assert.deepEqual(lines.map(line => line.split(':', 3).join(':')), [
		'index.test-d.ts:3:7  error TS2591',
	]);
});

test('finds a `types` entry in each `node_modules/@types` above the package', async () => {
	// In a monorepo, `@types/node` can be hoisted to the root while another `@types` package is installed in the package, and the package's own `tsc` finds both.
	const files = {
		'node_modules/@types/node/package.json': '{"name": "@types/node", "types": "index.d.ts"}\n',
		'node_modules/@types/node/index.d.ts': 'declare var hoistedGlobal: string;\n',
		'packages/package/node_modules/@types/local/package.json': '{"name": "@types/local", "types": "index.d.ts"}\n',
		'packages/package/node_modules/@types/local/index.d.ts': 'declare var localGlobal: string;\n',
		'packages/package/package.json': JSON.stringify({type: 'module', types: './index.d.ts'}),
		'packages/package/index.d.ts': 'export function greet(name: string): string;\n',
		'packages/package/index.test-d.ts': 'import {greet} from \'./index.js\';\n\ngreet(hoistedGlobal);\ngreet(localGlobal);\n',
		'packages/package/tsconfig.json': '{"compilerOptions": {"strict": true, "module": "nodenext", "types": ["node", "local"]}}\n',
	};

	await withTemporaryPackage(files, async directory => {
		assert.deepEqual(await typeTest({cwd: path.join(directory, 'packages', 'package'), compilerPath: typescript7}), {failures: []});
	});
});

test('finds a `types` entry that is not an `@types` package', async () => {
	// Like `vitest/globals`, which TypeScript resolves as a package from the directory holding the config. A custom `typeRoots` is the package's own too.
	const files = {
		'node_modules/globals-package/package.json': JSON.stringify({name: 'globals-package', exports: {'./globals': {types: './globals.d.ts'}}}),
		'node_modules/globals-package/globals.d.ts': 'declare var packageGlobal: string;\n',
		'typings/custom/index.d.ts': 'declare var customGlobal: string;\n',
		'package.json': JSON.stringify({type: 'module', types: './index.d.ts'}),
		'index.d.ts': 'export function greet(name: string): string;\n',
		'index.test-d.ts': 'import {greet} from \'./index.js\';\n\ngreet(packageGlobal);\n',
		'tsconfig.json': '{"compilerOptions": {"strict": true, "module": "nodenext", "types": ["globals-package/globals"]}}\n',
		'custom/package.json': JSON.stringify({type: 'module', types: './index.d.ts'}),
		'custom/index.d.ts': 'export function greet(name: string): string;\n',
		'custom/index.test-d.ts': 'import {greet} from \'./index.js\';\n\ngreet(customGlobal);\n',
		'custom/tsconfig.json': '{"compilerOptions": {"strict": true, "module": "nodenext", "types": ["custom"], "typeRoots": ["../typings"]}}\n',
	};

	await withTemporaryPackage(files, async directory => {
		assert.deepEqual(await typeTest({cwd: directory, compilerPath: typescript7}), {failures: []});
		assert.deepEqual(await typeTest({cwd: path.join(directory, 'custom'), compilerPath: typescript7}), {failures: []});
	});
});

test('checks a package that sets `outDir`, `declarationDir` and `composite`', async () => {
	// TypeScript infers `rootDir` from the directory holding the config, so without the tool setting it the whole check fails with TS6059.
	assert.deepEqual(await failures('tsconfig-build'), []);
});

test('writes no build output for a package that sets `outDir` and `composite`', async () => {
	const directory = fixturePath('tsconfig-build');
	const before = fs.readdirSync(directory);

	await failures('tsconfig-build');

	assert.deepEqual(fs.readdirSync(directory), before);
});

test('checks a package that sets `composite` and options that need `declaration`', async () => {
	// The tool turns `composite` off, which also turns off the `declaration` it implies. Without `declaration`, these options are an error that stops the whole type check.
	assert.deepEqual(await failureLines('tsconfig-composite'), [
		'index.test-d.ts:5:7  error TS2322: Type \'string\' is not assignable to type \'number\'.',
	]);
});

test('reports the failures of a symlinked package root with the paths in the package', async () => {
	// `tsc` runs in the real path of the package, so the files in the generated config have to be real paths too, or every diagnostic is reported through `..`.
	assert.deepEqual(await failureLines('symlinked-root'), [
		'index.test-d.ts:4:7  error TS2345: Argument of type \'string | undefined\' is not assignable to parameter of type \'string\'.\n  Type \'undefined\' is not assignable to type \'string\'.',
	]);
});

test('finds a declaration file in a subdirectory with a tsconfig.json', async () => {
	// A wrong path in the generated config would report the file as missing instead.
	assert.deepEqual(await failureLines('tsconfig-nested'), [
		'lib/main.test-d.ts:3:7  error TS2322: Type \'string\' is not assignable to type \'number\'.',
	]);
});

test('leaves the package untouched when it uses a tsconfig.json', async () => {
	const directory = fixturePath('tsconfig-used');
	const before = fs.readdirSync(directory);

	await failures('tsconfig-used');

	assert.deepEqual(fs.readdirSync(directory), before);
});

test('writes the temporary files to `node_modules/.cache`', async () => {
	// It is a package without a `node_modules`, so one is made in it.
	await withFixtureCopy('tsconfig-used', async directory => {
		const output = await showConfig({cwd: directory, compilerPath: typescript7});
		assert.match(output, /node_modules[\/\\]\.cache[\/\\]nz-[^\/\\]+[\/\\]\.nz-tsconfig\.json/v);
	});
});

test('removes the temporary directory', async () => {
	await withFixtureCopy('tsconfig-used', async directory => {
		await assertNoTemporaryDirectoryIsLeft(directory, async () => {
			assert.deepEqual(await typeTest({cwd: directory, compilerPath: typescript7}), {failures: []});
		});
	});
});

test('removes the temporary directory when the compiler cannot be run', async () => {
	// The temporary files are written before the compiler is started, so a compiler that does not run still has to leave nothing behind.
	const compilerPath = fixturePath('compiler-that-fails.js');
	await withFixtureCopy('tsconfig-used', async directory => {
		await assertNoTemporaryDirectoryIsLeft(directory, async () => {
			await assert.rejects(typeTest({cwd: directory, compilerPath}), /Could not run the TypeScript compiler/v);
		});
	});
});

test('leaves no temp directory when the check cannot run', async () => {
	// A package outside the repo cannot resolve `typescript`, so the check throws before the temporary files are written.
	const files = {
		'package.json': JSON.stringify({exports: {types: './index.d.ts'}}),
		'index.d.ts': 'export function greet(name: string): string;\n',
		'index.test-d.ts': 'import {greet} from \'./index.js\';\n\ngreet(\'World\');\n',
		'tsconfig.json': '{"compilerOptions": {"strict": true}}\n',
	};

	await withTemporaryPackage(files, async directory => {
		await assertNoTemporaryDirectoryIsLeft(directory, async () => {
			await assert.rejects(typeTest({cwd: directory}), /Could not find the `typescript` package/v);
		});
	});
});

test('leaves no temp directory when a test file cannot be read', async () => {
	// The fixture has a dangling symlink in `test-d`, so reading the test files throws after the temporary files are written.
	await withFixtureCopy('tsconfig-unreadable', async directory => {
		await assertNoTemporaryDirectoryIsLeft(directory, async () => {
			await assert.rejects(typeTest({cwd: directory, compilerPath: typescript7}), {code: 'ENOENT'});
		});
	});
});

test('reports a declaration file that imports a package its users do not get', async () => {
	// It works in the package itself, where the package is installed, and fails for users. A built-in module, an `@types` package, and the package itself are fine.
	assert.deepEqual(await failureLines('undeclared-dependency'), [
		'index.d.ts:2:46  \'dev-only\' is only in `devDependencies`, but a declaration file imports it, so users do not get it. Move it to `dependencies` or `peerDependencies`.',
		'index.d.ts:7:35  \'undeclared\' is not in `dependencies`, but a declaration file imports it, so users do not get it. Add it to `dependencies` or `peerDependencies`.',
		'index.d.ts:9:111  \'undeclared\' is not in `dependencies`, but a declaration file imports it, so users do not get it. Add it to `dependencies` or `peerDependencies`.',
		'types/helper.d.ts:1:26  \'other-undeclared\' is not in `dependencies`, but a declaration file imports it, so users do not get it. Add it to `dependencies` or `peerDependencies`.',
	]);
});

test('accepts a dependency that a scoped `@types` package types', async () => {
	// The types of `@scope/typed` are in `@types/scope__typed`.
	assert.deepEqual(await failures('types-scoped-dependency'), []);
});

test('reports the package.json mistakes that break the types for users', async () => {
	// `./nested` has `types` after `import`, which is fine, because the one for `import` is in its own conditions.
	assert.deepEqual(await failureLines('package-json-checks'), [
		'In `exports["."]` in package.json, `types` has to come before `default`, or TypeScript only finds it through a fallback.',
		'In `exports["./dual"]` in package.json, `types` is an ES module file, but `require` is a CommonJS file. Use a declaration file for each format, like `.d.cts`.',
		'In `exports["./nested-mismatch"].import` in package.json, `types` is a CommonJS file, but `default` is an ES module file. Use a declaration file for each format, like `.d.mts`.',
		'In `exports["./node-first"]` in package.json, `types` has to come before `node`, or TypeScript only finds it through a fallback.',
		'split.d.cts:1:1  The declaration file is not in `files` in package.json, so it is not published.',
		'types/helper.d.ts:1:1  The declaration file is not in `files` in package.json, so it is not published.',
	]);
});

test('reports values that a declaration file exports and the JavaScript file does not', async () => {
	// Importing one type checks, and throws at runtime. The entry that re-exports everything with `export *` is not checked, because its names cannot always be read.
	assert.deepEqual(await failureLines('runtime-exports'), [
		'index.d.ts:1:1  Exports values that index.js does not export, so importing them throws at runtime: MergedStream, listenerAdded.',
	]);
});

test('checks a package whose path has a quote in it', async () => {
	// The path is in the imports of the type check file, where a quote ended the string, and the syntax error that caused was taken as the type check having run.
	const name = 'it\'s';
	const files = {
		[`${name}/package.json`]: JSON.stringify({type: 'module', exports: {types: './index.d.ts', default: './index.js'}}),
		[`${name}/index.d.ts`]: 'export function greet(name: string): string;\n',
		[`${name}/index.js`]: 'export function greet(name) {\n\treturn name;\n}\n',
		[`${name}/index.test-d.ts`]: 'import {greet} from \'./index.js\';\n\nconst count: number = greet(\'World\');\n',
	};

	await withTemporaryPackage(files, async directory => {
		const {failures: quoteFailures} = await typeTest({cwd: path.join(directory, name), compilerPath: typescript7});
		assert.deepEqual(quoteFailures.map(({file, line, message}) => ({file, line, code: message.split(':', 1)[0]})), [
			{file: 'index.test-d.ts', line: 3, code: 'error TS2322'},
		]);
	});
});

test('reads `files` in package.json like npm does', async () => {
	// A pattern that matches a directory includes everything in it, and a leading slash is the package root.
	assert.deepEqual(await failures('files-patterns'), []);
});

test('compares the exports of an entry point from `types` and `main`, and of a `.mjs` one', async () => {
	assert.deepEqual(await failureLines('runtime-exports-main'), [
		'index.d.ts:1:1  Exports values that index.js does not export, so importing them throws at runtime: missing.',
	]);

	assert.deepEqual(await failureLines('runtime-exports-mjs'), [
		'index.d.mts:1:1  Exports values that index.mjs does not export, so importing them throws at runtime: missing.',
	]);
});

test('type checks the package when the declarations written for the comparison are broken', async () => {
	// TypeScript 7 writes a syntax error for a property set on a default export class, and a syntax error anywhere stops the type check. The comparison is left out then, so the package is still checked.
	assert.deepEqual(await failureLines('runtime-exports-broken-emit'), [
		'index.test-d.ts:3:7  error TS2322: Type \'Stream\' is not assignable to type \'string\'.',
	]);
});

test('skips a comparison of exports that cannot run', async () => {
	// A declaration file without `export` is not a module, like the one of a package that only sets globals, so the comparison cannot import it.
	assert.deepEqual(await failures('runtime-exports-script'), []);
});

test('compares the exports of a package whose tsconfig.json sets `module` to `node16`', async () => {
	// The type check file is in the temp directory, where it was a CommonJS file, which cannot import the types of an ES module without an attribute in `node16`.
	assert.deepEqual(await failures('runtime-exports-node16'), []);
});

test('ignores errors in dependencies', async () => {
	assert.deepEqual(await failures('dependency-error'), []);
});

test('ignores errors in a symlinked dependency when the package path has another case than on disk', async t => {
	// TypeScript lists a file it reached through a symlink with the case on disk, so the package root has to have that case too.
	const files = {
		'package/package.json': emptyPackage['package.json'],
		'package/index.d.ts': emptyPackage['index.d.ts'],
		'package/index.test-d.ts': 'import type {Broken} from \'dependency\';\n\nexport type Value = Broken;\n',
		'dependency/package.json': '{"name": "dependency", "type": "module", "types": "index.d.ts"}\n',
		'dependency/index.d.ts': 'export type Broken = Missing;\n',
	};

	await withTemporaryPackage(files, async directory => {
		fs.mkdirSync(path.join(directory, 'package', 'node_modules'));
		fs.symlinkSync(path.join(directory, 'dependency'), path.join(directory, 'package', 'node_modules', 'dependency'), 'junction');

		// The directory that both are in, so the case also differs in the path of the dependency.
		const otherCasePath = path.join(path.dirname(directory), path.basename(directory).toUpperCase(), 'package');
		if (!fs.existsSync(otherCasePath)) {
			t.skip('The file system is case sensitive.');
			return;
		}

		t.assert.deepStrictEqual(await failures(otherCasePath, {compilerPath: typescript7}), []);
		t.assert.deepStrictEqual(await failures(otherCasePath, {compilerPath: typescript6}), []);
	});
});

test('type checks a package whose tsconfig.json turns the type check off', async () => {
	// `noCheck` makes `tsc` report nothing, and checking is what the tool is for.
	assert.deepEqual(await failureLines('tsconfig-no-check'), [
		'index.test-d.ts:3:7  error TS2322: Type \'string\' is not assignable to type \'number\'.',
	]);
});

test('reports a syntax error in a dependency', async () => {
	// A syntax error makes `tsc` skip the type check, so the error in the test file is never reported. Ignoring the syntax error like any other error in a dependency would pass the run with nothing checked.
	assert.deepEqual(await failureLines('dependency-syntax-error'), [
		typeCheckDidNotRun.message,
		'node_modules/broken-dependency/index.d.ts:2:42  error TS1144: \'{\' or \';\' expected.',
		'node_modules/broken-dependency/index.d.ts:2:43  error TS1109: Expression expected.',
	]);
});

test('ignores an error that the type check reports in a dependency', async () => {
	// The legacy `module` keyword has a TS1xxx code, like most syntax errors, but the type check reports it, so it is noise like any other error in a dependency.
	assert.deepEqual(await failures('dependency-legacy-module'), []);
});

test('checks a test file that imports a file from outside the package', async () => {
	// The files outside the package root were not under the `rootDir` the tool set, which was an error. The error in the imported file is not the package's own, like one in a symlinked workspace package, so it is ignored.
	assert.deepEqual(await failureLines('outside-root/package'), [
		'index.test-d.ts:3:7  error TS2322: Type \'string\' is not assignable to type \'number\'.',
	]);
});

test('reports errors in a file whose name starts with two dots', async () => {
	// The check for a path outside the package is a segment check, not a string prefix, or this error would be hidden.
	assert.deepEqual(await failureLines('dot-prefixed'), [
		'..internal.test-d.ts:1:7  error TS2322: Type \'string\' is not assignable to type \'number\'.',
	]);
});

test('reports diagnostics without a location', async () => {
	// A missing root file stops the type check too.
	const missingFile = path.join(fixturePath('missing-types-file'), 'missing.d.ts').replaceAll(path.sep, '/');
	assert.deepEqual(await failureLines('missing-types-file'), [
		`error TS6053: File '${missingFile}' not found.\n  The file is in the program because:\n    Root file specified for compilation`,
		typeCheckDidNotRun.message,
	]);
});

test('ignores the debugging output that compiler options turn on', async () => {
	// The options print lines that are not diagnostics, which would be reported as failures without a location. Both versions print them differently.
	const files = {
		...emptyPackage,
		'tsconfig.json': '{"compilerOptions": {"strict": true, "module": "nodenext", "types": [], "diagnostics": true, "extendedDiagnostics": true, "traceResolution": true, "explainFiles": true}}\n',
		'index.test-d.ts': [
			`import {expectTypeOf, expectError} from ${JSON.stringify(assertionsPath)};`,
			'declare function takesString(value: string): void;',
			'expectError(takesString(1), \'not assignable\');',
			'expectTypeOf<number>().toBe<string>();',
			'',
		].join('\n'),
	};

	await withTemporaryPackage(files, async directory => {
		const expected = ['index.test-d.ts:4:29  Expected type \'string\', but the actual type is \'number\'.'];
		assert.deepEqual(await failureLines(directory, {compilerPath: typescript7}), expected);
		assert.deepEqual(await failureLines(directory, {compilerPath: typescript6}), expected);
	});
});

test('reads a diagnostic in a file whose name starts with whitespace', async () => {
	// The line of the second error starts with whitespace, like the continuation of the first one.
	const files = {
		...emptyPackage,
		' leading.test-d.ts': [
			`import {expectError} from ${JSON.stringify(assertionsPath)};`,
			'declare function greet(value: string): void;',
			'greet(1);',
			'expectError(greet(1));',
			'declare function takesObject(value: {value: number}): void;',
			'declare const wrong: {value: string};',
			'expectError(takesObject(wrong), "Types of property \'value\' are incompatible");',
			'',
		].join('\n'),
	};

	await withTemporaryPackage(files, async directory => {
		const expected = [' leading.test-d.ts:3:7  error TS2345: Argument of type \'number\' is not assignable to parameter of type \'string\'.'];
		assert.deepEqual(await failureLines(directory, {compilerPath: typescript7}), expected);
		assert.deepEqual(await failureLines(directory, {compilerPath: typescript6}), expected);
	});
});

for (const declarationFile of ['@types/index.d.ts', '-index.d.ts']) {
	test(`checks a package whose file name starts with a character that \`tsc\` reads as a flag: ${declarationFile}`, async () => {
		// Without a tsconfig.json, the files are arguments of `tsc`, which reads one that starts with `@` as a response file, and one that starts with `-` as an option.
		const testFile = declarationFile.replace(/\.d\.ts$/v, '.test-d.ts');
		const files = {
			'package.json': JSON.stringify({type: 'module', types: `./${declarationFile}`}),
			[declarationFile]: 'export {};\n',
			[testFile]: 'export const value: number = \'text\';\n',
		};

		await withTemporaryPackage(files, async directory => {
			const expected = [`${testFile}:1:14  error TS2322: Type 'string' is not assignable to type 'number'.`];
			assert.deepEqual(await failureLines(directory, {compilerPath: typescript7}), expected);
			assert.deepEqual(await failureLines(directory, {compilerPath: typescript6}), expected);
		});
	});
}

test('checks with Node.js resolution when there is no tsconfig.json', async () => {
	// `export =` in an ESM package is an error under Node.js resolution, and the fixture package is ESM.
	const exportEqualsFailures = await failures('export-equals');
	assert.deepEqual(exportEqualsFailures.map(({file, line, message}) => ({file, line, code: message.split(':', 1)[0]})), [
		{file: 'index.d.ts', line: 3, code: 'error TS1203'},
		{file: 'index.test-d.ts', line: 1, code: 'error TS1192'},
	]);
});

test('showConfig', async () => {
	const output = await showConfig({cwd: fixturePath('passing')});
	assert.match(output, /--ignoreConfig/v);
	assert.match(output, /--types node/v);
	assert.match(output, /"moduleResolution": "nodenext"/v);
	assert.match(output, /"\.\/index\.test-d\.ts"/v);
});

test('showConfig quotes a path with a space or a shell character in it', async () => {
	// The printed command is the one the user pastes into a shell, where a space would split the path in two, and `$(…)` would run a command.
	await withTemporaryPackage({'compiler (1).js': '', 'compiler$(x).js': ''}, async directory => {
		const spacePath = path.join(directory, 'compiler (1).js');
		const spaceOutput = await showConfig({cwd: fixturePath('passing'), compilerPath: spacePath});
		assert.ok(spaceOutput.includes(` '${spacePath}' `));

		const shellCharacterPath = path.join(directory, 'compiler$(x).js');
		const shellCharacterOutput = await showConfig({cwd: fixturePath('passing'), compilerPath: shellCharacterPath});
		assert.ok(shellCharacterOutput.includes(` '${shellCharacterPath}' `));
	});
});

test('showConfig shows the options of the package tsconfig.json', async () => {
	// The fixture turns `strict` off, and the generated config extends it.
	const output = await showConfig({cwd: fixturePath('tsconfig-used')});
	assert.match(output, /--project /v);
	assert.match(output, /"strict": false/v);
});

test('CLI prints failures and exits with 1', async () => {
	const {stdout, stderr, exitCode} = await runCli('failing');
	assert.equal(exitCode, 1);
	assert.equal(stdout, '');
	assert.equal(stderr, `index.test-d.ts:4:7  error TS2322: Type 'string' is not assignable to type 'number'.
index.test-d.ts:6:1  Expected an error, but found none.
index.test-d.ts:8:1  error TS2578: Unused '@ts-expect-error' directive.

3 failures
`);
});

test('CLI indents continuation lines and lists diagnostics without a location first', async () => {
	const {stderr: continuationOutput} = await runCli('tsconfig-strict');
	assert.equal(continuationOutput, `index.test-d.ts:4:7  error TS2345: Argument of type 'string | undefined' is not assignable to parameter of type 'string'.
    Type 'undefined' is not assignable to type 'string'.

1 failure
`);

	const {stderr: locationlessOutput} = await runCli('missing-types-file');
	const missingFile = path.join(fixturePath('missing-types-file'), 'missing.d.ts').replaceAll(path.sep, '/');
	assert.equal(locationlessOutput, `error TS6053: File '${missingFile}' not found.
  The file is in the program because:
    Root file specified for compilation
The type check did not run. A syntax error or an error in the compiler options stops it.

2 failures
`);
});

test('CLI reports the paths in the package when the shell entered it through a symlink', async () => {
	// The shell sets `PWD` to the path with the symlink in it. TypeScript 7 takes its working directory from `PWD` when it is the same directory, so it has to be the real path too.
	const {stderr} = await runCli('symlinked-root', [], {PWD: fixturePath('symlinked-root')});
	assert.equal(stderr, `index.test-d.ts:4:7  error TS2345: Argument of type 'string | undefined' is not assignable to parameter of type 'string'.
    Type 'undefined' is not assignable to type 'string'.

1 failure
`);
});

test('CLI reports the same failures in the same order in every locale', async () => {
	// `ä` and `ae` are in a different order in Swedish, so the output would move between machines.
	const {stderr, exitCode} = await runCli('locale-order', [], {LC_ALL: 'sv_SE.UTF-8', LANG: 'sv_SE.UTF-8'});
	assert.equal(exitCode, 1);
	assert.equal(stderr, `test-d/ä.ts:3:14  error TS2322: Type 'string' is not assignable to type 'number'.
test-d/ae.ts:3:14  error TS2322: Type 'string' is not assignable to type 'number'.

2 failures
`);
});

test('CLI adds GitHub Actions annotations', async () => {
	// GitHub reads the paths from the root of the repository, and a message has its line breaks escaped, because an annotation is one line.
	const environment = {GITHUB_ACTIONS: 'true', GITHUB_WORKSPACE: path.join(import.meta.dirname, '..')};

	const {stdout: failingOutput} = await runCli('failing', [], environment);
	assert.equal(failingOutput, `::error file=test/fixtures/failing/index.test-d.ts,line=4,col=7::error TS2322: Type 'string' is not assignable to type 'number'.
::error file=test/fixtures/failing/index.test-d.ts,line=6,col=1::Expected an error, but found none.
::error file=test/fixtures/failing/index.test-d.ts,line=8,col=1::error TS2578: Unused '@ts-expect-error' directive.
`);

	const {stdout: locationlessOutput} = await runCli('missing-types-file', [], environment);
	const missingFile = path.join(fixturePath('missing-types-file'), 'missing.d.ts').replaceAll(path.sep, '/');
	assert.equal(locationlessOutput, `::error::error TS6053: File '${missingFile}' not found.%0A  The file is in the program because:%0A    Root file specified for compilation
::error::The type check did not run. A syntax error or an error in the compiler options stops it.
`);

	// `%` starts an escape, and in a property, `,` separates the properties.
	const {stdout: escapingOutput} = await runCli('annotation-escaping', [], environment);
	assert.equal(escapingOutput, `::error file=test/fixtures/annotation-escaping/test-d/greet%2Cagain.ts,line=1,col=7::error TS2322: Type '"nope"' is not assignable to type '"100%25"'.
`);
});

test('CLI is silent and exits with 0 when everything passes', async () => {
	assert.deepEqual(await runCli('passing'), {stdout: '', stderr: '', exitCode: 0});
});

test('CLI prints why the check could not run and exits with 1', async () => {
	assert.deepEqual(await runCli('no-tests'), {
		stdout: '',
		stderr: 'Could not find type test files. Add an `index.test-d.ts` file next to the declaration file, or put them in a `test-d` or `typetests` directory.\n',
		exitCode: 1,
	});
});

test('CLI annotates relative to the package without `GITHUB_WORKSPACE`', async () => {
	// An `undefined` value leaves the variable out of the environment of the child process.
	const {stdout} = await runCli('failing', [], {GITHUB_ACTIONS: 'true', GITHUB_WORKSPACE: undefined});
	assert.match(stdout, /^::error file=index\.test-d\.ts,line=4,col=7::/v);
});

test('CLI rejects unknown flags', async () => {
	const {stderr, exitCode} = await runCli('passing', ['--unknown']);
	assert.equal(exitCode, 2);
	assert.match(stderr, /Unknown option '--unknown'/v);
});

test('CLI prints the help and the version without checking anything', async () => {
	const help = await runCli('passing', ['--help']);
	assert.equal(help.exitCode, 0);
	assert.equal(help.stderr, '');
	assert.match(help.stdout, /\$ nz/v);
	assert.match(help.stdout, /--show-config/v);

	const {version} = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
	const printed = await runCli('passing', ['--version']);
	assert.equal(printed.exitCode, 0);
	assert.equal(printed.stderr, '');
	assert.equal(printed.stdout, `${version}\n`);
});

test('CLI does not take positional arguments', async () => {
	// The check is the only thing the CLI does, so a path passed to it would be silently ignored.
	const {stderr, exitCode} = await runCli('passing', ['index.d.ts']);
	assert.equal(exitCode, 2);
	assert.match(stderr, /Unexpected argument 'index\.d\.ts'/v);
});
