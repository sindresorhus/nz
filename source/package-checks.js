import fs from 'node:fs';
import path from 'node:path';
import {isBuiltin} from 'node:module';

// `.mjs` and `.d.mts` are ES modules, `.cjs` and `.d.cts` are CommonJS, and `.js` and `.d.ts` are the format of the `type` of the package.
function moduleFormat(packageJson, file) {
	if (/\.m[jt]s$/v.test(file)) {
		return 'module';
	}

	if (/\.c[jt]s$/v.test(file)) {
		return 'commonjs';
	}

	return packageJson.type === 'module' ? 'module' : 'commonjs';
}

// Each value in `exports`, with the keys that lead to it.
function * exportsEntries(value, keys = []) {
	yield {value, keys};

	if (typeof value === 'object' && value !== null) {
		for (const [key, nestedValue] of Object.entries(value)) {
			yield * exportsEntries(nestedValue, [...keys, key]);
		}
	}
}

// Whether a value in `exports` is a conditions object with a `types` condition. A subpath map has no `types` key.
const hasTypesCondition = value => typeof value === 'object' && value !== null && Object.hasOwn(value, 'types');

/*
The declaration files of the package, the first of these that it has: every path under a `types` key in `exports`, also when the `types` condition has conditions of its own, `types`, `typings`, the `.d.ts` file next to `main`, or `index.d.ts`.

A subpath pattern like `./*.d.ts` cannot be passed to tsc, so it is left out.
*/
export function findDeclarationFiles(root, packageJson) {
	const exportTypes = exportsEntries(packageJson.exports)
		.filter(({value, keys}) => typeof value === 'string' && keys.includes('types') && !value.includes('*'))
		.map(({value}) => path.normalize(value))
		.toArray();

	if (exportTypes.length > 0) {
		return [...new Set(exportTypes)];
	}

	const types = [packageJson.types, packageJson.typings].find(value => typeof value === 'string');
	if (types !== undefined) {
		return [path.normalize(types)];
	}

	const candidates = [];

	if (typeof packageJson.main === 'string') {
		const {dir, name} = path.parse(packageJson.main);
		candidates.push(path.join(dir, `${name}.d.ts`));
	}

	candidates.push('index.d.ts');

	const existing = candidates.find(candidate => fs.existsSync(path.join(root, candidate)));
	return existing ? [existing] : [];
}

// Returns a failure for each conditions object in `exports` where `types` comes after `default`, `import`, `require` or `node`, and for each where the `types` file is not the same format as a JavaScript file next to it.
export function findExportsMistakes(packageJson) {
	const failures = [];
	const formatOf = file => moduleFormat(packageJson, file);
	const formatNames = {module: 'an ES module', commonjs: 'a CommonJS'};
	const declarationExtensions = {module: '`.d.mts`', commonjs: '`.d.cts`'};

	for (const {value, keys} of exportsEntries(packageJson.exports)) {
		if (!hasTypesCondition(value)) {
			continue;
		}

		const location = `exports${keys.map(key => key.startsWith('.') ? `[${JSON.stringify(key)}]` : `.${key}`).join('')}`;
		const conditions = Object.keys(value);

		// An earlier condition with conditions of its own has its own `types`, so only a path is a problem.
		const earlierCondition = conditions.slice(0, conditions.indexOf('types')).find(key => ['default', 'import', 'require', 'node'].includes(key) && typeof value[key] === 'string');
		if (earlierCondition) {
			failures.push({message: `In \`${location}\` in package.json, \`types\` has to come before \`${earlierCondition}\`, or TypeScript only finds it through a fallback.`});
		}

		const {types} = value;
		const mismatchedCondition = typeof types === 'string' && ['import', 'require', 'default'].find(condition => typeof value[condition] === 'string'
			&& /\.[cm]?js$/v.test(value[condition])
			&& formatOf(value[condition]) !== formatOf(types));

		if (!mismatchedCondition) {
			continue;
		}

		const typesFormat = formatNames[formatOf(types)];
		const targetFormat = formatOf(value[mismatchedCondition]);
		const advice = `Use a declaration file for each format, like ${declarationExtensions[targetFormat]}.`;
		failures.push({message: `In \`${location}\` in package.json, \`types\` is ${typesFormat} file, but \`${mismatchedCondition}\` is ${formatNames[targetFormat]} file. ${advice}`});
	}

	return failures;
}

/*
Returns a failure for each of the package's own declaration files that the `files` field in package.json leaves out. Like npm, a pattern that matches a directory includes everything in it, a leading `/` or `./` is the package root, and a pattern that starts with `!` leaves files out again.
*/
export function findUnpublishedDeclarationFiles(packageJson, sourceFiles) {
	if (!Array.isArray(packageJson.files)) {
		return [];
	}

	const isPublished = file => {
		// The file, and each directory it is in.
		const paths = file.split('/').map((part, index, parts) => parts.slice(0, index + 1).join('/'));
		let isIncluded = false;

		for (const entry of packageJson.files) {
			const isNegated = entry.startsWith('!');
			const pattern = entry.slice(isNegated ? 1 : 0).replace(/^\.?\//v, '').replace(/\/$/v, '');
			if (paths.some(candidate => path.matchesGlob(candidate, pattern))) {
				isIncluded = !isNegated;
			}
		}

		return isIncluded;
	};

	return sourceFiles.values()
		.filter(({file, isTestFile}) => !isTestFile && !isPublished(file))
		.map(({file}) => ({
			file,
			line: 1,
			column: 1,
			message: 'The declaration file is not in `files` in package.json, so it is not published.',
		}))
		.toArray();
}

/*
The ES module entry points of the package: a declaration file, and the JavaScript file it types. From each conditions object in `exports` that has both, or else from `types` or `typings` with `main`, an `exports` path, or `index.js`. A JavaScript file that does not exist, like one that is only there after a build, is left out.
*/
export function findEntryPoints(root, packageJson) {
	const isModule = file => typeof file === 'string' && !file.includes('*') && moduleFormat(packageJson, file) === 'module';

	const entryPoints = exportsEntries(packageJson.exports)
		.filter(({value}) => hasTypesCondition(value))
		.map(({value}) => ({
			declarationFile: value.types,
			javaScriptFile: ['import', 'node', 'default'].map(condition => value[condition]).find(target => typeof target === 'string' && /\.m?js$/v.test(target)),
		}))
		.filter(({declarationFile, javaScriptFile}) => isModule(declarationFile) && isModule(javaScriptFile))
		.toArray();

	const types = [packageJson.types, packageJson.typings].find(value => typeof value === 'string');
	const main = packageJson.main ?? (typeof packageJson.exports === 'string' ? packageJson.exports : 'index.js');
	if (entryPoints.length === 0 && isModule(types) && isModule(main)) {
		entryPoints.push({declarationFile: types, javaScriptFile: main});
	}

	return entryPoints.filter(({javaScriptFile}) => fs.existsSync(path.join(root, javaScriptFile)));
}

/*
Returns a failure for each import of a package in a declaration file that the users of the package do not get: one that is only in `devDependencies`, or not listed at all. A built-in module, the package itself, and a package whose types come from an `@types` package that is listed are fine.
*/
export function findUndeclaredDependencies(packageJson, sourceFiles) {
	const declared = new Set(['dependencies', 'peerDependencies', 'optionalDependencies'].flatMap(field => Object.keys(packageJson[field] ?? {})));
	const developmentOnly = new Set(Object.keys(packageJson.devDependencies ?? {}));
	const failures = [];

	const imports = sourceFiles.values().flatMap(({file, imports}) => imports.map(entry => ({...entry, file}))).toArray();

	for (const {file, specifier, line, column} of imports) {
		if (specifier.startsWith('.') || isBuiltin(specifier)) {
			continue;
		}

		const name = specifier.split('/').slice(0, specifier.startsWith('@') ? 2 : 1).join('/');
		const typesName = `@types/${name.startsWith('@') ? name.slice(1).replace('/', '__') : name}`;
		if (name === packageJson.name || declared.has(name) || declared.has(typesName)) {
			continue;
		}

		const isDevelopmentOnly = developmentOnly.has(name) || developmentOnly.has(typesName);
		failures.push({
			file,
			line,
			column,
			message: isDevelopmentOnly
				? `'${name}' is only in \`devDependencies\`, but a declaration file imports it, so users do not get it. Move it to \`dependencies\` or \`peerDependencies\`.`
				: `'${name}' is not in \`dependencies\`, but a declaration file imports it, so users do not get it. Add it to \`dependencies\` or \`peerDependencies\`.`,
		});
	}

	return failures;
}
