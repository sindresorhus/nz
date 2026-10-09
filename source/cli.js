#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {parseArgs} from 'node:util';
import {typeTest, showConfig} from './runner.js';

const help = `
	Type check the package declaration files together with the type test files

	Usage
	  $ nz

	Options
	  --show-config  Print the tsc command and the resolved configuration

	Run it in the package root. It uses the tsconfig.json there if there is one. It finds the declaration files from package.json, and the type test files:
	  *.test-d.ts   Next to the declaration file
	  test-d/       All .ts files
	  typetests/    All .ts files
`;

// Each failure starts with `file:line:column`, which terminals and editors turn into a link to the location. The ones without a file come first, because runner.js sorts them first.
function formatFailures(failures) {
	const lines = failures.map(failure => failure.file === undefined
		? failure.message
		: `${failure.file}:${failure.line}:${failure.column}  ${failure.message.replaceAll('\n', '\n  ')}`);

	const count = failures.length;
	return `${lines.join('\n')}\n\n${count} ${count === 1 ? 'failure' : 'failures'}`;
}

/*
GitHub Actions turns these lines on stdout into annotations on the failing lines in a pull request. The path is from the root of the repository, which is not the package root in a monorepo.

An annotation is one line, so the line breaks in a message are escaped, and so is `%`, which starts an escape. In a property, `:` and `,` are escaped too, because they separate the properties.
*/
function formatGitHubAnnotations(failures) {
	const escapeData = value => value.replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A');
	const escapeProperty = value => escapeData(value).replaceAll(':', '%3A').replaceAll(',', '%2C');
	const workspace = process.env.GITHUB_WORKSPACE || process.cwd();

	return failures.map(failure => {
		if (failure.file === undefined) {
			return `::error::${escapeData(failure.message)}`;
		}

		const file = path.relative(workspace, path.resolve(failure.file)).replaceAll(path.sep, '/');
		return `::error file=${escapeProperty(file)},line=${failure.line},col=${failure.column}::${escapeData(failure.message)}`;
	}).join('\n');
}

let values;
try {
	({values} = parseArgs({
		options: {
			'show-config': {type: 'boolean'},
			help: {type: 'boolean'},
			version: {type: 'boolean'},
		},
	}));
} catch (error) {
	console.error(error.message);
	process.exit(2);
}

if (values.help) {
	console.log(help);
	process.exit(0);
}

if (values.version) {
	const {version} = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
	console.log(version);
	process.exit(0);
}

try {
	if (values['show-config']) {
		console.log(await showConfig());
	} else {
		const {failures} = await typeTest();
		if (failures.length > 0) {
			console.error(formatFailures(failures));

			if (process.env.GITHUB_ACTIONS === 'true') {
				console.log(formatGitHubAnnotations(failures));
			}

			process.exitCode = 1;
		}
	}
} catch (error) {
	console.error(error.message);
	process.exitCode = 1;
}
