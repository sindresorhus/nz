import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import {typeTest} from '../source/runner.js';

// Uses `path.resolve`, so the absolute path of a temporary package works as a name too.
export const fixturePath = name => path.resolve(import.meta.dirname, 'fixtures', name);

// Resolved, so a missing compiler throws instead of a test that compares its empty output passing.
const require = createRequire(import.meta.url);
const resolveCompiler = packageName => path.join(path.dirname(require.resolve(`${packageName}/package.json`)), 'bin', 'tsc');

export const typescript6 = resolveCompiler('typescript');
export const typescript7 = resolveCompiler('@typescript/native');

// A test file in a temporary package is outside the repository, so it imports the assertions by their absolute path.
export const assertionsPath = path.join(import.meta.dirname, '..', 'source', 'index.js');

// The files of a package that exports nothing, for `withTemporaryPackage()`.
export const emptyPackage = {
	'package.json': '{"type": "module", "types": "index.d.ts"}\n',
	'index.d.ts': 'export {};\n',
};

// Writes `files` to a directory in the temp directory. It is outside the repository, so for a package in it, the walk up does not find the `typescript` this repository has.
export async function withTemporaryPackage(files, check) {
	const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'package-'));

	try {
		for (const [file, contents] of Object.entries(files)) {
			fs.mkdirSync(path.dirname(path.join(directory, file)), {recursive: true});
			fs.writeFileSync(path.join(directory, file), contents);
		}

		await check(directory);
	} finally {
		fs.rmSync(directory, {recursive: true, force: true});
	}
}

// Copies a fixture to a temporary package, so its temporary files do not go in the `node_modules` of this repository.
export async function withFixtureCopy(name, check) {
	await withTemporaryPackage({}, async directory => {
		fs.cpSync(fixturePath(name), directory, {recursive: true, verbatimSymlinks: true});
		await check(directory);
	});
}

export const failures = async (name, options) => {
	const result = await typeTest({cwd: fixturePath(name), ...options});
	return result.failures;
};

// The failures the way the CLI prints them, which is shorter to compare than the objects.
export const failureLines = async (name, options) => {
	const result = await failures(name, options);
	return result.map(({file, line, column, message}) => file === undefined ? message : `${file}:${line}:${column}  ${message}`);
};

// The failures on TypeScript 6 and on TypeScript 7, for a check of what the two word or print differently.
export const failuresOnBothCompilers = name => Promise.all([typescript6, typescript7].map(compilerPath => failures(name, {compilerPath})));
