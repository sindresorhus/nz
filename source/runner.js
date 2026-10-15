import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {createRequire} from 'node:module';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {scanSource, readTypeArgument, lineStartOffsets} from './scanner.js';
import {
	findDeclarationFiles,
	findEntryPoints,
	findExportsMistakes,
	findUndeclaredDependencies,
	findUnpublishedDeclarationFiles,
} from './package-checks.js';

const execFileAsync = promisify(execFile);

// Used when the package has no `tsconfig.json`, and to write the declarations of its JavaScript files.
const defaultCompilerArguments = [
	'--ignoreConfig',
	'--strict',
	'--module',
	'nodenext',
	'--moduleResolution',
	'nodenext',
	'--target',
	'esnext',
	'--lib',
	'esnext,dom',
];

const testDirectories = ['test-d', 'typetests'];

const diagnosticPattern = /^(?<file>.+?)\((?<line>\d+),(?<column>\d+)\): (?<message>error TS\d+: .*)$/v;

// The expected type of a failed `expectTypeOf()` assertion, in each of the ways TypeScript words one: a constraint, a missing symbol property (TypeScript 7, for an object), and a `this` context (TypeScript 6, for guarded expected types).
const expectedTypePattern = /^error TS\d+: (?:Type|Property '\[\w+\]' is missing in type|The 'this' context of type) '(?<expected>.*?)' (?:does not satisfy|but required|is not assignable)/v;

// The marker type of a failed `expectTypeOf()` assertion, which holds the actual type.
const markerTypePattern = /'(?<marker>ActualTypeIs\w*)<(?<actual>.*)>'\.$/v;

// The type check file: a module with a known type error on line 2, which `tsc` only reports when it type checks.
const typeCheckSource = 'export {};\nconst typeCheck: string = 0;\n';

// The names that a declaration file exports and its JavaScript file does not, from the check in the type check file.
const missingExportsPattern = /^error TS2344: Type '(?<names>"[^"]*"(?: \| "[^"]*")*)' does not satisfy the constraint 'never'\./v;

// The `tsd` assertions that take any value, so they pass with `tsc`, and only `tsd` itself checks them. Each has the assertion to use instead, if there is one.
const uncheckedTsdAssertions = new Map([
	['expectNotType', 'expectTypeOf(value).not.toBe<Type>()'],
	['expectNotAssignable', 'expectTypeOf(value).not.toBeAssignableTo<Type>()'],
	['expectDeprecated', undefined],
	['expectNotDeprecated', undefined],
	['expectDocCommentIncludes', undefined],
	['printType', undefined],
]);

const callNames = new Set(['expectError', ...uncheckedTsdAssertions.keys()]);

// A diagnostic without a location, like a configuration error, still has the code in it.
const compilerDiagnosticPattern = /error TS\d+:/v;

// A byte order mark is skipped, like npm, bun and TypeScript do, so a file written by one of them has to work. TypeScript does not count it as a column either.
function readText(file) {
	return fs.readFileSync(file, 'utf8').replace(/^\u{FEFF}/v, '');
}

// The locale is fixed, or the order would depend on the machine.
const compareText = new Intl.Collator('en').compare;

function readPackageJson(root) {
	const packageJsonPath = path.join(root, 'package.json');

	try {
		return JSON.parse(readText(packageJsonPath));
	} catch (error) {
		if (error.code === 'ENOENT') {
			throw new Error(`No package.json in ${root}`, {cause: error});
		}

		// The `SyntaxError` names a position in the text, which says nothing about which file it is in.
		if (error instanceof SyntaxError) {
			throw new Error(`Invalid JSON in ${packageJsonPath}: ${error.message}`, {cause: error});
		}

		throw error;
	}
}

/*
Whether a directory entry is a file, which is what a type test file has to be.

A symlink is followed, so one that points at a directory is not a file. One that points at nothing is left in, so that reading it fails the way reading a missing file does.
*/
function isFileEntry(entry) {
	if (entry.isFile()) {
		return true;
	}

	if (!entry.isSymbolicLink()) {
		return false;
	}

	try {
		return fs.statSync(path.join(entry.parentPath, entry.name)).isFile();
	} catch {
		return true;
	}
}

/*
The files under a directory, and under the directories in it, without following a symlinked directory.

`readdirSync` with `recursive: true` follows one, so a link to a directory of shared tests reports every file under it a second time, and a link to a parent never ends.
*/
function findFiles(directory) {
	const files = [];

	for (const entry of fs.readdirSync(directory, {withFileTypes: true})) {
		const entryPath = path.join(directory, entry.name);

		if (entry.isDirectory()) {
			// A `node_modules` directory is never a type test file, and it can be large.
			if (entry.name !== 'node_modules') {
				files.push(...findFiles(entryPath));
			}
		} else if (isFileEntry(entry)) {
			files.push(entryPath);
		}
	}

	return files;
}

function findTestFiles(root, declarationFiles) {
	const testFiles = [];

	const declarationDirectories = new Set(declarationFiles.map(file => path.dirname(file)));
	for (const directory of declarationDirectories) {
		let files;
		try {
			files = fs.readdirSync(path.join(root, directory), {withFileTypes: true});
		} catch {
			continue;
		}

		for (const file of files) {
			// A directory is never a type test file, whatever it is called.
			if (isFileEntry(file) && file.name.endsWith('.test-d.ts')) {
				testFiles.push(path.join(directory, file.name));
			}
		}
	}

	for (const directory of testDirectories) {
		let files;
		try {
			files = findFiles(path.join(root, directory));
		} catch {
			continue;
		}

		for (const file of files) {
			if (file.endsWith('.ts')) {
				testFiles.push(path.relative(root, file));
			}
		}
	}

	return [...new Set(testFiles)].toSorted(compareText);
}

function resolveFromRoot(root, specifier) {
	const require = createRequire(path.join(root, 'package.json'));

	try {
		return require.resolve(specifier);
	} catch (error) {
		// A package that is not installed is the answer the caller is after. Anything else, like an `exports` map that does not include the file, is a problem the user has to see, or they are told to install a package they already have.
		if (error.code !== 'MODULE_NOT_FOUND') {
			throw new Error(`Could not resolve \`${specifier}\` from ${root}: ${error.message}`, {cause: error});
		}

		return undefined;
	}
}

/*
The directory the temporary files go in: `.cache` in the first `node_modules` from the package up, or in a new one in the package when there is none.

TypeScript resolves `types`, `typeRoots` and packages from the directory holding the config, by looking in each `node_modules` from there up. From here, it finds the same ones as from the package, because there is no `node_modules` between the package and this one.
*/
function findCacheDirectory(root) {
	for (let directory = root; ; directory = path.dirname(directory)) {
		const nodeModulesDirectory = path.join(directory, 'node_modules');
		if (fs.existsSync(nodeModulesDirectory)) {
			return path.join(nodeModulesDirectory, '.cache');
		}

		if (path.dirname(directory) === directory) {
			return path.join(root, 'node_modules', '.cache');
		}
	}
}

/*
Writes the files the check adds to the ones of the package, in a new directory in `findCacheDirectory()`. The caller removes the directory.

The type check file has the known error that tells whether the type check ran. It is a module, so its name is not a global in the package.

TypeScript refuses to combine a config with files on the command line (TS5112), so checking files the tool picked itself needs a config when the package has one. This writes one that extends the package `tsconfig.json` and overrides only the file list, so every compiler option, the `extends` chain, and `paths` stay the package's own.
*/
function writeTemporaryFiles(root, files, hasConfig) {
	const cacheDirectory = findCacheDirectory(root);
	fs.mkdirSync(cacheDirectory, {recursive: true});

	// The real path, so it is the same as the path `tsc` reports a file in it with.
	const directory = fs.realpathSync(fs.mkdtempSync(path.join(cacheDirectory, 'nz-')));
	const typeCheckPath = path.join(directory, 'nz-type-check.ts');
	const configPath = path.join(directory, '.nz-tsconfig.json');

	try {
		fs.writeFileSync(typeCheckPath, typeCheckSource);
		// An ES module, so that it can import the types of an ES module with every `module` setting, like `node16`, where a CommonJS file cannot without an attribute.
		fs.writeFileSync(path.join(directory, 'package.json'), '{"type": "module"}\n');

		if (hasConfig) {
			fs.writeFileSync(configPath, JSON.stringify({
				extends: path.join(root, 'tsconfig.json'),
				files: [...files, typeCheckPath],
				// `include` is inherited from the base config, and it would add its files to the ones above. Only `files` should be checked.
				include: [],
			}, undefined, '\t'));
		}
	} catch (error) {
		fs.rmSync(directory, {recursive: true, force: true});
		throw error;
	}

	return {directory, typeCheckPath, configPath};
}

// `@typescript/native` is the name TypeScript recommends for TypeScript 7 when `typescript` is aliased to `@typescript/typescript6`, which has a `tsc6` binary.
function resolveCompilerPath(root) {
	const typescriptPackageJsonPath = resolveFromRoot(root, '@typescript/native/package.json') ?? resolveFromRoot(root, 'typescript/package.json');
	if (!typescriptPackageJsonPath) {
		throw new Error('Could not find the `typescript` package. Install it with `npm install --save-dev typescript`.');
	}

	const {bin, version} = JSON.parse(fs.readFileSync(typescriptPackageJsonPath, 'utf8'));

	// The command passes `--ignoreConfig`, which TypeScript added in 6.0. An older one rejects it, type checks nothing, and every assertion is then reported as failing.
	if (Number(/^\d+/v.exec(version)?.[0]) < 6) {
		throw new Error(`The \`typescript\` package this package resolves is ${version}, and \`nz\` needs 6.0 or later, for \`--ignoreConfig\`.`);
	}

	// A package with a single binary is allowed to have `bin` be the path itself.
	const binary = typeof bin === 'string' ? bin : (bin?.tsc ?? bin?.tsc6);
	if (typeof binary !== 'string') {
		// eslint-disable-next-line unicorn/prefer-type-error -- The check above is on what `bin` holds, not on a type.
		throw new Error(`The \`typescript\` package at ${typescriptPackageJsonPath} has no \`tsc\` binary.`);
	}

	return path.join(path.dirname(typescriptPackageJsonPath), binary);
}

function resolveCommand({cwd = process.cwd(), compilerPath} = {}) {
	// Read before the real path is resolved, so a directory that does not exist is reported as one without a package.json.
	const packageDirectory = path.resolve(cwd);
	const packageJson = readPackageJson(packageDirectory);

	// `tsc` runs in the real path of the package, and it reports every file relative to that, so the root and the files have to be real paths too. The native one has the case on disk, like the path `tsc` lists a file it reached through a symlink with.
	const root = fs.realpathSync.native(packageDirectory);

	const declarationFiles = findDeclarationFiles(root, packageJson);
	if (declarationFiles.length === 0) {
		throw new Error('Could not find a declaration file. Add a `types` entry to package.json, or add an `index.d.ts` file.');
	}

	const testFiles = findTestFiles(root, declarationFiles);
	if (testFiles.length === 0) {
		throw new Error('Could not find type test files. Add an `index.test-d.ts` file next to the declaration file, or put them in a `test-d` or `typetests` directory.');
	}

	// Absolute roots make every `--listFiles` entry an absolute path on both compilers, and a file name that starts with `@` or `-` is not read as a response file or an option.
	const files = [...new Set([...declarationFiles, ...testFiles])].map(file => path.resolve(root, file));

	// Resolved before the temporary files are written, so a package without TypeScript leaves no temp directory behind. A given path is relative to the current directory, not to the package, where the compiler runs.
	compilerPath = compilerPath === undefined ? resolveCompilerPath(root) : path.resolve(compilerPath);

	// The package config decides everything but the file list, so it is the one to check against.
	const hasConfig = fs.existsSync(path.join(root, 'tsconfig.json'));

	// Without a config, `@types/node` is loaded, which is the only `@types` package a test file is likely to need the globals of. A package config keeps its own `types`, so the check loads the same globals as the package's own `tsc`. Passing `--types node` when `@types/node` is missing is itself an error.
	const typeArguments = !hasConfig && resolveFromRoot(root, '@types/node/package.json') ? ['--types', 'node'] : [];

	// `--noErrorTruncation`, because a failure is about a type, and `tsc` cuts a long one to `... 12 more ...`.
	const compilerArguments = ['--noEmit', '--listFiles', '--pretty', 'false', '--locale', 'en', '--noErrorTruncation', ...typeArguments];
	const {directory, typeCheckPath, configPath} = writeTemporaryFiles(root, files, hasConfig);

	if (hasConfig) {
		compilerArguments.push(
			'--project',
			configPath,
			// Keep build info out of the package. `composite` implies `incremental`, so both have to be off.
			'--incremental',
			'false',
			'--composite',
			'false',
			// `composite` also implied `declaration`, which these need (`mapRoot` needs `declarationMap`), or they are an error. Nothing is emitted, so they do not matter, and turning `declaration` on would report declaration errors for what a test file exports.
			'--emitDeclarationOnly',
			'false',
			'--declarationMap',
			'false',
			'--isolatedDeclarations',
			'false',
			'--declarationDir',
			'null',
			'--mapRoot',
			'null',
			// Checking is what the tool is for.
			'--noCheck',
			'false',
			// Keep debugging output out of the diagnostic and file-list stream.
			'--diagnostics',
			'false',
			'--extendedDiagnostics',
			'false',
			'--traceResolution',
			'false',
			'--explainFiles',
			'false',
			// The config is in `node_modules/.cache`, so an `outDir` would infer a `rootDir` that leaves out the package. The root of the file system also lets a test file import a file from outside the package.
			'--rootDir',
			path.parse(root).root,
		);
	} else {
		compilerArguments.push(...defaultCompilerArguments, ...files, typeCheckPath);
	}

	return {
		root,
		packageJson,
		compilerPath,
		compilerArguments,
		temporaryDirectory: directory,
		typeCheckPath,
		declarationFiles,
		testFiles,
	};
}

async function runCompiler({root, compilerPath, compilerArguments}) {
	try {
		const {stdout} = await execFileAsync(process.execPath, [compilerPath, ...compilerArguments], {
			cwd: root,
			// TypeScript 7 takes its working directory from `PWD` when that is the same directory, and the shell sets it to the path it was entered through, which can have a symlink in it. The paths `tsc` reports are relative to its working directory, so it has to be the real path, like `root`.
			// TypeScript 6 runs in Node.js, and a large package, like `type-fest`, needs more than the default heap of about 4 GB. Node.js takes the last of a repeated option, so a heap size the user sets in `NODE_OPTIONS` still wins, which it would not over a command-line option.
			env: {
				...process.env,
				PWD: root,
				NODE_OPTIONS: `--max-old-space-size=8192 ${process.env.NODE_OPTIONS ?? ''}`.trim(),
			},
			maxBuffer: 256 * 1024 * 1024,
		});

		return stdout;
	} catch (error) {
		// TypeScript 6 runs in Node.js, which aborts with a long native stack trace when the heap is full. That says nothing useful, so the message says how to give it more memory. The abort is a signal on macOS and Linux, and an exit code on Windows.
		if (error.stderr?.includes('JavaScript heap out of memory')) {
			throw new Error('The TypeScript compiler ran out of memory. Give it more than the 8 GB it gets with `NODE_OPTIONS=--max-old-space-size=16384 nz`.', {cause: error});
		}

		// A numeric code is the compiler exit code. Anything else (signal, spawn failure, buffer overflow) is a real error.
		if (typeof error.code !== 'number') {
			// eslint-disable-next-line unicorn/prefer-type-error -- The code is an exit code, not a type.
			throw new Error(`Could not run the TypeScript compiler at ${compilerPath}: ${error.message}`, {cause: error});
		}

		// `tsc` writes its diagnostics to stdout. A run that ended with an exit code and no diagnostic in it did not get as far as reporting type errors, so what it wrote to stderr is the reason instead.
		if (!compilerDiagnosticPattern.test(error.stdout)) {
			const reason = (error.stderr || error.stdout).trim() || `it exited with ${error.code} and wrote nothing`;
			throw new Error(`Could not run the TypeScript compiler at ${compilerPath}, ${reason}`, {cause: error});
		}

		return error.stdout;
	}
}

// Every way out of a run has to remove the temporary files, including the ones that throw before the compiler starts.
async function withCommand(options, run) {
	const command = resolveCommand(options);

	try {
		return await run(command);
	} finally {
		fs.rmSync(command.temporaryDirectory, {recursive: true, force: true});
	}
}

function parseCompilerOutput(output) {
	const diagnostics = [];
	const checkedFiles = new Set();

	for (const line of output.split(/\r?\n/v)) {
		if (line.trim() === '') {
			continue;
		}

		// A located diagnostic comes first, so one in a file whose name starts with whitespace is not read as a continuation, and one whose whole line is an existing path is not read as a file.
		const match = diagnosticPattern.exec(line);
		if (match) {
			diagnostics.push({
				// `tsc` writes the separator of the platform it runs on, and the paths a failure is reported with are all `/`, or the same file comes out as two.
				file: match.groups.file.replaceAll(path.sep, '/'),
				line: Number(match.groups.line),
				column: Number(match.groups.column),
				message: match.groups.message,
			});
			continue;
		}

		// `--listFiles` prints the absolute path of each file in the program after the diagnostics, including the local files a test imports.
		if (path.isAbsolute(line) && fs.existsSync(line)) {
			checkedFiles.add(path.resolve(line));
			continue;
		}

		// Indented lines continue the previous diagnostic.
		if (/^\s/v.test(line) && diagnostics.length > 0) {
			diagnostics.at(-1).message += `\n${line}`;
			continue;
		}

		// Never drop a line that cannot be parsed, for example a diagnostic without a location.
		diagnostics.push({message: line});
	}

	return {diagnostics, checkedFiles};
}

// Keep terminal controls visible in the tool's own assertion descriptions.
function escapeControlCharacters(message) {
	return message.replaceAll(/\p{Control}/gv, character => String.raw`\u${character.codePointAt(0).toString(16).padStart(4, '0')}`);
}

/*
Describes a failed `expectTypeOf()` assertion in one line, the same on TypeScript 6 and 7, or returns the message as is when it is not one. `writtenType` is the expected type as the test has it, if the failure is at a type argument.

When the expected type satisfies the constraint, the check is repeated on `this`, so the other type is the assertion object, like `ExpectTypeOf<number>`. The diagnostic does not name the expected type, which is `never` without a type argument.
*/
function describeAssertionFailure(message, writtenType) {
	const firstLine = message.split('\n', 1)[0];
	const expectedMatch = expectedTypePattern.exec(firstLine);
	const markerMatch = markerTypePattern.exec(firstLine);
	if (!expectedMatch || !markerMatch) {
		return message;
	}

	const {marker, actual} = markerMatch.groups;
	const isThisGuard = writtenType === undefined && /^(?:ExpectTypeOf|Negated)<.*>$/sv.test(expectedMatch.groups.expected);
	const expected = isThisGuard ? 'the type argument' : `'${writtenType ?? expectedMatch.groups.expected}'`;
	const typePrefix = isThisGuard ? '' : 'type ';
	// Only the assertions that are not negated default the expected type to `never`. The negated ones pass without a type argument.
	const defaultNote = isThisGuard ? ' (\'never\' without one)' : '';

	const descriptions = {
		ActualTypeIs: `Expected ${typePrefix}${expected}${defaultNote}, but the actual type is '${actual}'.`,
		ActualTypeIsIdentical: `Expected a type other than ${expected}, but the actual type is identical.`,
		ActualTypeIsNotAssignable: `Expected a type assignable to ${expected}${defaultNote}, but the actual type is '${actual}'.`,
		ActualTypeIsAssignable: `Expected a type not assignable to ${expected}, but the actual type is '${actual}'.`,
	};

	const description = descriptions[marker];
	return description === undefined ? message : escapeControlCharacters(description);
}

function isOwnFile(root, file) {
	const relativePath = path.relative(root, path.resolve(root, file));

	// `..` on its own, or as a path segment, is how a path leaves the root. A file name that merely starts with two dots is still in the root.
	const isOutsideRoot = relativePath === '..' || relativePath.startsWith(`..${path.sep}`);

	return !isOutsideRoot
		&& !path.isAbsolute(relativePath)
		&& !relativePath.split(path.sep).includes('node_modules');
}

// The line and column of `offset` in a file that starts its lines at `lineStarts`.
function locate(lineStarts, offset) {
	const lineIndex = lineStarts.findLastIndex(lineStart => lineStart <= offset);
	return {line: lineIndex + 1, column: offset - lineStarts[lineIndex] + 1};
}

const noCheckMessage = '`@ts-nocheck` turns off the type check of the file. Remove it.';

// The failure of an `expectError` call that no error satisfied.
function describeUnmatchedCall({message}) {
	return message === undefined ? 'Expected an error, but found none.' : `Expected an error that includes “${escapeControlCharacters(message)}”, but found none.`;
}

// The failure of a `tsd` assertion that would pass without a trace.
function describeUncheckedCall({name}) {
	const replacement = uncheckedTsdAssertions.get(name);
	return `\`${name}\` from \`tsd\` does nothing here, because only \`tsd\` checks it. ${replacement === undefined ? 'Remove it.' : `Use \`${replacement}\` instead.`}`;
}

// The package's own declaration file that a relative import in a declaration file points at, if there is one. `./x.js` is typed by `./x.d.ts`, and `./x` by `./x.d.ts` or `./x/index.d.ts`.
function resolveDeclarationImport(root, file, specifier) {
	const base = path.join(path.dirname(file), specifier);
	const javaScriptExtension = /\.(?<format>[cm]?)js$/v.exec(base);

	let candidates;
	if (javaScriptExtension) {
		candidates = [`${base.slice(0, javaScriptExtension.index)}.d.${javaScriptExtension.groups.format}ts`];
	} else if (/\.d\.[cm]?ts$/v.test(base)) {
		candidates = [base];
	} else {
		candidates = [`${base}.d.ts`, path.join(base, 'index.d.ts')];
	}

	return candidates.find(candidate => isOwnFile(root, candidate) && fs.existsSync(path.join(root, candidate)));
}

/*
Reads the `expectError` calls, the calls to the `tsd` assertions that only `tsd` checks, the `@ts-ignore` and `@ts-nocheck` comments, and the imports of the files the check runs on. The declaration files that the declaration files import are read too, because they are checked with them.

A declaration file has no calls. Its `@ts-ignore` comments are left out, because a `@ts-ignore` is how a declaration file imports a type from an optional dependency. Only the imports of declaration files matter, because only they reach the users of the package.
*/
function readSourceFiles(root, declarationFiles, testFiles) {
	const sourceFiles = new Map();

	const read = (file, isTestFile) => {
		const source = readText(path.join(root, file));
		const lineStarts = lineStartOffsets(source);
		const {calls, directives, imports} = scanSource(source, callNames);

		// The other names are only the `tsd` assertions in a file that imports `tsd`, and anywhere else they can be the test's own functions.
		const isUsingTsd = imports.some(entry => entry.specifier === 'tsd');
		const expectErrorCalls = calls.filter(call => call.name === 'expectError');
		const uncheckedCalls = isTestFile && isUsingTsd ? calls.filter(call => call.name !== 'expectError') : [];

		const sourceFile = {
			// The failures are reported with `/`, whatever the platform.
			file: file.replaceAll(path.sep, '/'),
			isTestFile,
			source,
			lineStarts,
			calls: isTestFile ? expectErrorCalls.map(call => ({...call, ...locate(lineStarts, call.start), isMatched: false})) : [],
			uncheckedCalls: uncheckedCalls.map(call => ({...call, ...locate(lineStarts, call.start)})),
			directives: directives
				.filter(directive => isTestFile || directive.name === 'nocheck')
				.map(directive => ({...directive, ...locate(lineStarts, directive.start)})),
			imports: isTestFile ? [] : imports.map(entry => ({...entry, ...locate(lineStarts, entry.start)})),
		};

		sourceFiles.set(path.resolve(root, file), sourceFile);
		return sourceFile;
	};

	for (const file of testFiles) {
		read(file, true);
	}

	const queue = [...declarationFiles];
	while (queue.length > 0) {
		const file = queue.shift();
		// A declaration file that does not exist is reported by `tsc`, with the reason it is in the program.
		if (sourceFiles.has(path.resolve(root, file)) || !fs.existsSync(path.join(root, file))) {
			continue;
		}

		for (const {specifier} of read(file, false).imports) {
			const importedFile = specifier.startsWith('.') ? resolveDeclarationImport(root, file, specifier) : undefined;
			if (importedFile) {
				queue.push(importedFile);
			}
		}
	}

	return sourceFiles;
}

/*
Returns a failure for each `@ts-nocheck` in the other files of the package that the compiler read, like a helper a test file imports. `checkedFiles` are their paths, and `sourceFiles` are the files `readSourceFiles()` already read, which are left out.

The helpers are not added to `sourceFiles`, because they are neither test files nor declaration files that users of the package get.
*/
function findUncheckedSourceFailures(root, checkedFiles, sourceFiles) {
	const failures = [];

	for (const file of checkedFiles) {
		// A JavaScript file is only type checked with `checkJs`, which the tool does not know, so a vendored file with the directive would fail the run for nothing. Data inputs such as JSON do not have pragmas.
		if (!/\.(?:[cm]?ts|tsx)$/v.test(file) || !isOwnFile(root, file) || sourceFiles.has(file)) {
			continue;
		}

		const source = readText(file);
		const noCheckDirective = scanSource(source, new Set()).directives.find(({name}) => name === 'nocheck');
		if (noCheckDirective) {
			failures.push({
				file: path.relative(root, file).replaceAll(path.sep, '/'),
				...locate(lineStartOffsets(source), noCheckDirective.start),
				message: noCheckMessage,
			});
		}
	}

	return failures;
}

/*
Checks that each value an entry point's declaration file exports is also exported by its JavaScript file, or importing it type checks and throws at runtime.

TypeScript writes declarations for the JavaScript files to the directory of the temporary files, and a line in the type check file compares the value names of the two: the ones only the declaration file has do not satisfy `never`. Returns the entry point of each of those lines, by line number.

An entry point whose JavaScript file re-exports everything (`export *`) is left out, because the re-exported module is not always written there, and then all its names would look missing. So is an entry point whose declarations could not be written.
*/
async function writeRuntimeExportChecks(command, entryPoints) {
	const {root, compilerPath, temporaryDirectory, typeCheckPath} = command;
	const outputDirectory = path.join(temporaryDirectory, 'runtime');
	// TypeScript writes the declarations of a JavaScript file outside `rootDir` next to the file, where they are left behind, and the program can have one from outside the package, like one that an entry point imports. With the root of the file system, each one is written to the output directory, at its absolute path. That path has the package path in it twice, so for a package path of about 500 characters, it is too long, and the comparison is left out.
	const rootDirectory = path.parse(root).root;
	const checks = new Map();

	if (entryPoints.length === 0) {
		return checks;
	}

	try {
		await runCompiler({
			root,
			compilerPath,
			compilerArguments: [
				// Absolute, so a file name that starts with `@` or `-` is not read as a response file or an option.
				...new Set(entryPoints.map(({javaScriptFile}) => path.resolve(root, javaScriptFile))),
				'--allowJs',
				'--declaration',
				'--emitDeclarationOnly',
				'--noCheck',
				...defaultCompilerArguments,
				'--rootDir',
				rootDirectory,
				'--outDir',
				outputDirectory,
				'--pretty',
				'false',
			],
		});
	} catch {
		// Without the declarations, there is nothing to compare with, and the check is left out.
		return checks;
	}

	// An import of `x.js` or `x.mjs` finds the declaration file next to it, which is written by the package for its own file, and by TypeScript for the other one.
	const importPath = file => file.replace(/\.d\.(?<format>m?)ts$/v, '.$<format>js').replaceAll(path.sep, '/');

	const lines = ['declare function exportsMissingAtRuntime<Names extends never>(): void;'];
	for (const [index, entryPoint] of entryPoints.entries()) {
		const outputFile = path.join(outputDirectory, path.relative(rootDirectory, path.resolve(root, entryPoint.javaScriptFile))).replace(/\.(?<format>m?)js$/v, '.d.$<format>ts');
		if (!fs.existsSync(outputFile) || /^export \* from /mv.test(fs.readFileSync(outputFile, 'utf8'))) {
			continue;
		}

		const declarationPath = importPath(path.join(root, entryPoint.declarationFile));
		lines.push(
			`import type * as declared${index} from ${JSON.stringify(declarationPath)};`,
			`import type * as runtime${index} from ${JSON.stringify(importPath(outputFile))};`,
			`exportsMissingAtRuntime<Exclude<keyof typeof declared${index}, keyof typeof runtime${index}>>();`,
		);

		// The type check file has two lines before these.
		checks.set(lines.length + 2, entryPoint);
	}

	fs.appendFileSync(typeCheckPath, `${lines.join('\n')}\n`);
	return checks;
}

/*
Returns the failure for an error on the line of a check that `writeRuntimeExportChecks()` wrote, which `checks` has by line number: the names that the declaration file exports and the JavaScript file does not.

Any other error means that the comparison could not run, like for a declaration file that is not a module, which a package that only sets globals has, and then there is no failure. The comparison is a best effort.
*/
function describeRuntimeExportCheck(diagnostic, checks) {
	const entryPoint = checks.get(diagnostic.line);
	const names = missingExportsPattern.exec(diagnostic.message)?.groups.names;
	if (entryPoint === undefined || names === undefined) {
		return undefined;
	}

	const javaScriptFile = path.posix.normalize(entryPoint.javaScriptFile);
	const missingNames = names.split(' | ').map(name => name.slice(1, -1)).join(', ');

	return {
		file: path.posix.normalize(entryPoint.declarationFile),
		line: 1,
		column: 1,
		message: `Exports values that ${javaScriptFile} does not export, so importing them throws at runtime: ${missingNames}.`,
	};
}

function compareFailures(first, second) {
	return compareText(first.file ?? '', second.file ?? '')
		|| (first.line ?? 0) - (second.line ?? 0)
		|| (first.column ?? 0) - (second.column ?? 0);
}

/*
Runs the compiler with the export comparison, and returns whether the type check ran, the diagnostics of the package, and the failures of the comparison.

The known error in the type check file is only reported when the type check ran, and a syntax error in that file is reported there too, so only that error counts. When the check ran, the type check file is the tool's own, and its diagnostics are left out.

TypeScript can write declarations with a syntax error, like TypeScript 7 does for a property set on a default export class, and that stops the type check. The comparison must never stop it, so then the compiler runs once more without it.
*/
async function runTypeCheck(command, entryPoints) {
	const {root, typeCheckPath, temporaryDirectory} = command;
	const resolve = diagnostic => diagnostic.file === undefined ? undefined : path.resolve(root, diagnostic.file);
	const isInTypeCheckFile = diagnostic => resolve(diagnostic) === typeCheckPath;
	const isTypeCheckError = diagnostic => isInTypeCheckFile(diagnostic) && diagnostic.line === 2 && diagnostic.message.startsWith('error TS2322:');
	const isInWrittenDeclarations = diagnostic => !isInTypeCheckFile(diagnostic) && resolve(diagnostic)?.startsWith(`${temporaryDirectory}${path.sep}`);

	let runtimeExportChecks = await writeRuntimeExportChecks(command, entryPoints);
	let {diagnostics, checkedFiles} = parseCompilerOutput(await runCompiler(command));

	if (runtimeExportChecks.size > 0 && diagnostics.every(diagnostic => !isTypeCheckError(diagnostic)) && diagnostics.some(diagnostic => isInWrittenDeclarations(diagnostic))) {
		fs.writeFileSync(typeCheckPath, typeCheckSource);
		runtimeExportChecks = new Map();
		({diagnostics, checkedFiles} = parseCompilerOutput(await runCompiler(command)));
	}

	const isTypeChecked = diagnostics.some(diagnostic => isTypeCheckError(diagnostic));
	if (!isTypeChecked) {
		return {
			isTypeChecked,
			diagnostics,
			checkedFiles,
			runtimeExportFailures: [],
		};
	}

	return {
		isTypeChecked,
		checkedFiles,
		diagnostics: diagnostics.filter(diagnostic => !isInTypeCheckFile(diagnostic)),
		runtimeExportFailures: diagnostics
			.filter(diagnostic => isInTypeCheckFile(diagnostic))
			.map(diagnostic => describeRuntimeExportCheck(diagnostic, runtimeExportChecks))
			.filter(Boolean),
	};
}

/**
Type checks the package in `cwd`, checks it for the mistakes that break its types for users, and returns the failures.

The package `tsconfig.json` is used when there is one, so the check runs against the options the package actually builds with. Otherwise a default set of options is used.

@param {object} [options] - The check to run.
@param {string} [options.cwd] - The package root. It must contain a `package.json`.
@param {string} [options.compilerPath] - Path to the `tsc` script. Defaults to the one of the `@typescript/native` package that the package resolves, or else the one of the `typescript` package.
@returns {Promise<{failures: Array<{file?: string, line?: number, column?: number, message: string}>}>} The failures, sorted by file, line, and column.
*/
export async function typeTest(options) {
	return withCommand(options, async command => {
		const {root, packageJson, declarationFiles} = command;
		const testFiles = new Set(command.testFiles);

		const {isTypeChecked, diagnostics, checkedFiles, runtimeExportFailures} = await runTypeCheck(command, findEntryPoints(root, packageJson));

		// Imported tests participate in assertions when they use the same test names or directories as discovered roots.
		for (const file of checkedFiles) {
			const relativeFile = path.relative(root, file);
			const isTestFile = /\.test-d\.tsx?$/v.test(relativeFile) || (relativeFile.endsWith('.tsx') && testDirectories.some(directory => relativeFile.startsWith(`${directory}${path.sep}`)));
			if (isTestFile && isOwnFile(root, file)) {
				testFiles.add(relativeFile);
			}
		}

		const sourceFiles = readSourceFiles(root, declarationFiles, testFiles);
		const failures = [...runtimeExportFailures, ...findUncheckedSourceFailures(root, checkedFiles, sourceFiles)];

		for (const diagnostic of diagnostics) {
			// When the type check did not run, the errors are syntax errors or errors in the compiler options. None of them can be the error a call expects, and one in a dependency is not noise, or the run would pass with nothing checked.
			if (!isTypeChecked || diagnostic.file === undefined) {
				failures.push(diagnostic);
				continue;
			}

			// Errors in compiler inputs outside the package, like dependencies or a symlinked workspace package, are environment noise. Diagnostics outside the input graph, including configuration errors, remain failures.
			if (!isOwnFile(root, diagnostic.file) && checkedFiles.has(path.resolve(root, diagnostic.file))) {
				continue;
			}

			// A name that does not exist is a typo in the test, not the error it expects, so it never satisfies a call. TypeScript has several codes for it, all worded as a name or a namespace it cannot find (the locale is English), and one for a shorthand property. A property that does not exist still satisfies a call, because that is a normal thing to test. An unused `@ts-expect-error` directive is also a mistake in the test, so it must remain a failure.
			const isTestMistake = /^error TS(?:\d+: Cannot find (?:name|namespace) '|(?:18004|2578):)/v.test(diagnostic.message);

			const sourceFile = sourceFiles.get(path.resolve(root, diagnostic.file));
			const offset = sourceFile ? sourceFile.lineStarts[diagnostic.line - 1] + diagnostic.column - 1 : undefined;

			if (sourceFile && !isTestMistake) {
				// A call passes when there is a type error after its name, in its type argument or inside its parentheses, like with `tsd`, so an error on the name itself is a failure of its own. A call with a message only takes an error that includes it, and an error that does not is a failure, so it shows what the error was. Every enclosing call must accept an error before it can be left out.
				const containingCalls = sourceFile.calls.filter(call => offset >= call.nameEnd && offset < call.end);
				const matchingCalls = containingCalls.filter(call => call.message === undefined || diagnostic.message.includes(call.message));

				for (const call of matchingCalls) {
					call.isMatched = true;
				}

				if (containingCalls.length > 0 && matchingCalls.length === containingCalls.length) {
					continue;
				}
			}

			const writtenType = sourceFile ? readTypeArgument(sourceFile.source, offset) : undefined;
			failures.push({...diagnostic, message: describeAssertionFailure(diagnostic.message, writtenType)});
		}

		// With no other error, nothing would say that nothing was checked.
		if (!isTypeChecked) {
			failures.push({message: 'The type check did not run. A syntax error or an error in the compiler options stops it.'});
		}

		for (const {file, calls, uncheckedCalls, directives} of sourceFiles.values()) {
			// When nothing was checked, no call found an error, and saying so for each of them is noise.
			for (const call of calls) {
				if (isTypeChecked && !call.isMatched) {
					failures.push({
						file,
						line: call.line,
						column: call.column,
						message: describeUnmatchedCall(call),
					});
				}
			}

			// Both make a failing check pass without a trace.
			for (const directive of directives) {
				failures.push({
					file,
					line: directive.line,
					column: directive.column,
					message: directive.name === 'nocheck'
						? noCheckMessage
						: '`@ts-ignore` hides a failure. Use `@ts-expect-error` instead, which fails when there is no error to hide.',
				});
			}

			for (const call of uncheckedCalls) {
				failures.push({
					file,
					line: call.line,
					column: call.column,
					message: describeUncheckedCall(call),
				});
			}
		}

		failures.push(
			...findUndeclaredDependencies(packageJson, sourceFiles),
			...findExportsMistakes(packageJson),
			...findUnpublishedDeclarationFiles(packageJson, sourceFiles),
		);

		return {failures: failures.toSorted(compareFailures)};
	});
}

/**
Returns the `tsc` command and the resolved compiler configuration for the package in `cwd`.

@param {object} [options] - Same as for `typeTest()`.
@returns {Promise<string>} The `tsc` command, a blank line, and the compiler configuration it resolved.
*/
export async function showConfig(options) {
	// An argument with a character that the shell treats as special, like a space, a quote or a `$`, is not the same argument when the printed command is pasted into a shell, so it is quoted, and a quote inside it is closed, escaped and opened again. This is the rule of Python's `shlex.quote()`.
	const quote = argument => /[^\w%+,\-.\/:=@]/v.test(argument) ? `'${argument.replaceAll('\'', String.raw`'\''`)}'` : argument;

	return withCommand(options, async command => {
		const output = await runCompiler({...command, compilerArguments: [...command.compilerArguments, '--showConfig']});

		return [
			[process.execPath, command.compilerPath, ...command.compilerArguments].map(argument => quote(argument)).join(' '),
			'',
			output.trim(),
		].join('\n');
	});
}
