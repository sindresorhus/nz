import {test} from 'node:test';
import assert from 'node:assert/strict';
import {scanSource, readTypeArgument} from '../source/scanner.js';

const findCalls = (source, names = ['expectError']) => scanSource(source, new Set(names)).calls;

const callStarts = source => findCalls(source).map(({start}) => start);

const findImports = source => scanSource(source, new Set()).imports;

const findDirectives = source => scanSource(source, new Set()).directives;

// The message of the one call in `source`, or `false` when it is not one call that ends at the last character before the `;`, like when a regex or a string in it ended the call early.
function readWholeCall(source) {
	const calls = findCalls(source);
	return calls.length === 1 && calls[0].end === source.length - 1 ? calls[0].message : false;
}

for (const [type, expected] of [
	['\'a  b\'', '"a  b"'],
	['"  a  "', '"  a  "'],
	['`a  b`', '`a  b`'],
	['`a\nb`', '`a\nb`'],
	['`  a\t\nb  `', '`  a\t\nb  `'],
	[String.raw`'a\u2028b\u2029c'`, '"a\u{2028}b\u{2029}c"'],
	['\'a /* comment */  b\'', '"a /* comment */  b"'],
	// The interpolation is TypeScript source, not JavaScript interpolation.
	// eslint-disable-next-line no-template-curly-in-string
	['`a  ${string}\n b`', '`a  ${string}\n b`'],
	['{ value: \'a  b\'; other: `c  d` }', '{ value: "a  b"; other: `c  d` }'],
	['\n\t\'a  b\'\n\t| /* comment */ \'c  d\'\n', '"a  b" | "c  d"'],
]) {
	test(`expected type preserves whitespace inside literals: ${JSON.stringify(type)}`, () => {
		const source = `expectTypeOf<string>().toBe<${type}>();`;
		assert.equal(readTypeArgument(source, source.lastIndexOf('<') + 1), expected);
	});
}

for (const [type, expected] of [
	['  \n\tstring  \r\n |\t number  ', 'string | number'],
	['/* before */ string /* between */ | // after\n number /* end */', 'string | number'],
	['keyof/* separator */typeof value', 'keyof typeof value'],
	['Promise<\n\t{\n\t\tvalue:\tstring;\n\t}\n>', 'Promise< { value: string; } >'],
]) {
	test(`expected type collapses whitespace between tokens: ${JSON.stringify(type)}`, () => {
		const source = `expectTypeOf<string>().toBe<${type}>();`;
		assert.equal(readTypeArgument(source, source.indexOf('.toBe<') + '.toBe<'.length), expected);
	});
}

// Without the fix, this never ends, so the run hangs instead of failing.
test('a `<` comparison before a control head with a regex is not a type argument', () => {
	const source = 'for (let index = 0; index < missing; index++) {\n\tif (value) /["\']/.test(value);\n}\nconst isPositive = count > 0;\n';
	assert.equal(readTypeArgument(source, source.indexOf('missing')), undefined);
});

for (const head of [
	'expectError?.',
	'expectError!',
	'expectError!!',
	'expectError!?.',
	'expectError?.<number>',
	'expectError!<number>',
	'expectError<number>?.',
	'expectError! /* qualifier */ <number>',
	'expectError /* qualifier */ ! /* optional */ ?. /* type argument */ <number> /* argument */ ',
]) {
	test(`assertion calls with a qualified head are found: ${head}`, () => {
		const source = `${head}(value, 'not assignable');`;
		assert.equal(findCalls(source)[0]?.start, 0);
		assert.equal(readWholeCall(source), 'not assignable');
	});
}

test('a relational expression with a non-null operand is not an assertion call', () => {
	// TypeScript reads this as a comparison to the value `number`, not type arguments followed by a call.
	assert.deepEqual(findCalls('expectError<number>!(value);'), []);
});

test('standalone instantiation references are not assertion calls', () => {
	assert.deepEqual(findCalls('const assert = expectError<number>; const definitelyAssert = expectError!;'), []);
});

test('qualifiers do not turn a property or declaration into an assertion call', () => {
	const source = 'declare function expectError<Type>(value: Type): void; api.expectError?.(value); api.expectError!(value); this.#expectError!(value); expectError?.(value);';
	assert.deepEqual(callStarts(source), [source.lastIndexOf('expectError')]);
});

for (const gap of ['\n', '\r\n', '\u{2028}', '/* comment\n */', '// comment\n']) {
	test(`a line break before a non-null assertion ends the call head: ${JSON.stringify(gap)}`, () => {
		assert.deepEqual(findCalls(`expectError${gap}!(greet(1));`), []);
		assert.deepEqual(findCalls(`expectError!${gap}!(greet(1));`), []);
	});

	test(`a line break before an optional call or after a non-null assertion preserves the call head: ${JSON.stringify(gap)}`, () => {
		assert.equal(readWholeCall(`expectError${gap}?.(greet(1), 'not assignable');`), 'not assignable');
		assert.equal(readWholeCall(`expectError!${gap}(greet(1), 'not assignable');`), 'not assignable');
	});
}

for (const name of [
	'caféexpectError',
	'中expectError',
	'expectErroré',
	'expectError中',
	'a\u{200C}expectError',
	'a\u{200D}expectError',
	'e\u{301}expectError',
	'𝒜expectError',
	'expectError\u{200C}',
	'expectError\u{200D}',
	'expectError\u{301}',
	'expectError𝒜',
	'$expectError',
	'_expectError',
	'expectError2',
	'expectError_',
]) {
	test(`only a complete assertion identifier is matched: ${JSON.stringify(name)}`, () => {
		const source = `declare function ${name}(value: number): void; ${name}(1); expectError(1);`;
		assert.deepEqual(callStarts(source), [source.lastIndexOf('expectError(1)')]);
	});
}

for (const message of [
	'\'wrong message\'[0]',
	'\'wrong message\'[\'slice\'](0)',
	'\'wrong message\'.slice(0)',
	'(\'wrong message\')',
	'\'wrong message\' as string',
	'\'wrong message\' + suffix',
	'prefix + \'wrong message\'',
	'\'wrong message\'[0],',
	'\'wrong message\' /* index */ [0]',
	'[\'wrong message\'][0]',
	'String(\'wrong message\')',
	'(prefix, \'wrong message\')',
	'\'wrong message\'[({index: 0}).index]',
]) {
	test(`a nonliteral message is ignored: ${message}`, () => {
		assert.equal(readWholeCall(`expectError(greet(1), ${message});`), undefined);
	});
}

for (const source of [
	'expectError(greet(1), \'needle\');',
	'expectError(greet(1), /* before */ \'needle\' /* after */,);',
	'expectError([greet(1), {nested: [1, 2]}], \'needle\');',
	'expectError(() => { if (condition) /[),]/.test(\'\'); greet(1); }, \'needle\');',
]) {
	test(`a literal message is preserved after nested expressions: ${source}`, () => {
		assert.equal(readWholeCall(source), 'needle');
	});
}

for (const head of ['if (condition)', 'while (condition)', 'for (; condition;)', 'if ((condition))', 'if (test(/[)]/))', 'for (const entry of entries)', 'for await (const entry of entries)', 'if (condition) while (condition)']) {
	test(`assertion range includes a regex after a control head: ${head}`, () => {
		assert.equal(readWholeCall(`expectError(() => { ${head} /[)]/.test(''); greet(1); }, 'not assignable');`), 'not assignable');
	});
}

test('a regex after a `for await` head does not extend the assertion range over later code', () => {
	// Read as a division, the closing `/` of the regex starts a regex that runs to the next `/`.
	const call = 'expectError(async () => { for await (const entry of entries) / /.test(entry); })';
	assert.deepEqual(findCalls(`${call}; const half = total / 2;`).map(({end}) => end), [call.length]);
});

for (const regex of ['/[()]/', String.raw`/\)/`, '/[),]/']) {
	test(`assertion range includes a regex after a control head: ${regex}`, () => {
		assert.equal(readWholeCall(`expectError(() => { if (condition) ${regex}.test(''); greet(1); }, 'not assignable');`), 'not assignable');
	});
}

for (const separator of [' ', '\n', ' /* denominator */ ', ' // denominator\n']) {
	test(`a division denominator can start with a regex literal: ${JSON.stringify(separator)}`, () => {
		const source = `const value = 10 /${separator}/[']/.source.length; expectError(value);`;
		assert.deepEqual(callStarts(source), [source.indexOf('expectError')]);
	});
}

for (const expression of [
	'10 / 2 / 5',
	'10 / /* expectError(ignored); */ 2 / 5',
	'10 / // expectError(ignored);\n 2 / 5',
	'10 / /[\']/.source.length / 2',
	'10 / /=/.source.length',
	'10 / /[/\'"]/.source.length',
	'10 / /expectError(value)/.source.length',
]) {
	test(`a division expression preserves subsequent assertions: ${JSON.stringify(expression)}`, () => {
		const source = `let value = ${expression}; value /= /[']/.source.length; expectError(value);`;
		assert.deepEqual(callStarts(source), [source.lastIndexOf('expectError')]);
	});
}

test('a regex denominator preserves assertion ranges and messages', () => {
	assert.equal(readWholeCall('expectError(greet(1) / /[)]/.source.length, \'not assignable\');'), 'not assignable');

	const source = 'expectError(expectError(greet(1) / /[)]/.source.length, \'not assignable\'), \'not assignable\');';
	const calls = findCalls(source);
	assert.deepEqual(calls.map(({end}) => end), [source.length - 1, source.lastIndexOf(', \'not assignable\'')]);
	assert.deepEqual(calls.map(({message}) => message), ['not assignable', 'not assignable']);
});

for (const operator of ['+', '-']) {
	for (const separator of [' ', '\n', '/* separate operators */']) {
		test(`binary and unary ${operator} operators keep a following regex literal: ${JSON.stringify(separator)}`, () => {
			const source = `const value = 1 ${operator}${separator}${operator}/[']/.source.length; expectError(value);`;
			assert.deepEqual(callStarts(source), [source.indexOf('expectError')]);
		});
	}

	test(`a regex after separate ${operator} operators cannot create a fake assertion`, () => {
		const source = `const value = 1 ${operator} ${operator}/expectError(value)/.source.length; expectError(value);`;
		assert.deepEqual(callStarts(source), [source.lastIndexOf('expectError')]);
	});

	test(`a regex after separate ${operator} operators preserves assertion ranges`, () => {
		assert.equal(readWholeCall(`expectError(greet(1) ${operator} /* separate operators */ ${operator}/[)]/.source.length, 'not assignable');`), 'not assignable');

		const source = `expectError(expectError(greet(1) ${operator} ${operator}/[)]/.source.length, 'not assignable'), 'not assignable');`;
		assert.deepEqual(findCalls(source).map(({end}) => end), [source.length - 1, source.lastIndexOf(', \'not assignable\'')]);
	});
}

for (const quote of ['\'', '"']) {
	for (const separator of ['\u{2028}', '\u{2029}']) {
		test(`a raw Unicode separator does not end a string: ${JSON.stringify([quote, separator])}`, () => {
			const source = `const value = ${quote}a${separator}b${quote}; expectError(value);`;
			assert.deepEqual(callStarts(source), [source.indexOf('expectError')]);
			assert.equal(readWholeCall(`expectError(greet(1), ${quote}a${separator}b${quote});`), `a${separator}b`);
		});
	}

	for (const separator of ['\n', '\r', '\r\n']) {
		test(`raw CR and LF still end a quoted string: ${JSON.stringify([quote, separator])}`, () => {
			assert.deepEqual(findCalls(`const value = ${quote}a${separator}b${quote}; expectError(value);`), []);
		});
	}

	for (const separator of ['\n', '\r\n', '\u{2028}']) {
		test(`a string with an escaped line continuation ends at its quote: ${JSON.stringify([quote, separator])}`, () => {
			const literal = [quote, 'a', '\\', separator, 'b', quote].join('');
			const source = `const value = ${literal}; expectError(value);`;
			assert.deepEqual(callStarts(source), [source.indexOf('expectError')]);
			assert.equal(readWholeCall(`expectError(greet(1), ${literal});`), 'ab');
		});
	}
}

for (const separator of ['\u{2028}', '\u{2029}']) {
	test(`Unicode separators still end a line comment and a regex literal: ${JSON.stringify(separator)}`, () => {
		const source = `// expectError(ignored);${separator}expectError(value);`;
		assert.deepEqual(callStarts(source), [source.lastIndexOf('expectError')]);
		assert.deepEqual(findCalls(`const pattern = /a${separator}b/; expectError(value);`), []);
	});
}

for (const head of [
	'expectError',
	'expectError!',
	'expectError?.',
	'expectError<number>',
	'expectError?.<number>',
	'expectError /* non-null */ ! /* type */ <number>',
]) {
	for (const gap of ['', ' /* spread */ ', '\n']) {
		const call = `${head}(value, 'needle')`;
		test(`spread retains qualified named calls through whitespace and comments: ${JSON.stringify([head, gap])}`, () => {
			const sources = [`const value = [...${gap}${call}];`, `const value = {...${gap}${call}};`, `consume(...${gap}${call});`];
			const expected = sources.map(source => {
				const start = source.indexOf('expectError');
				return [{
					name: 'expectError', start, nameEnd: start + 'expectError'.length, end: start + call.length, message: 'needle',
				}];
			});
			assert.deepEqual(sources.map(source => findCalls(source)), expected);
		});
	}
}

test('spread does not turn member calls or names in regex literals into named assertions', () => {
	const sources = [
		'const value = [...api.expectError(value)];',
		'const value = {...api.expectError?.(value)};',
		'consume(...this.#expectError(value));',
		'const value = [.../[)\']expectError(fake)/.source];',
		'const value = {.../[)\']expectError(fake)/.exec(\'\')};',
		'consume(.../[)\']expectError(fake)/.source);',
	];
	assert.deepEqual(sources.map(source => findCalls(source)), sources.map(() => []));
});

test('spread also retains unchecked tsd assertion names from the supplied set', () => {
	const call = 'printType(value)';
	const source = `consume(...${call});`;
	const start = source.indexOf('printType');
	assert.deepEqual(findCalls(source, ['printType']), [{
		name: 'printType', start, nameEnd: start + 'printType'.length, end: start + call.length, message: undefined,
	}]);
});

test('constructor targets are not assertion calls, through qualifiers, comments, and newlines', () => {
	const sources = [
		'new expectError(value);',
		'new expectError!<number>(value);',
		'new /* constructor */ expectError<number>(value);',
		'new\nexpectError(value);',
	];
	assert.deepEqual(sources.map(source => findCalls(source)), sources.map(() => []));
});

test('member methods named new retain real calls in their arguments', () => {
	const call = 'expectError(value)';
	const source = `factory.new(${call}); factory?.new(${call});`;
	assert.deepEqual(callStarts(source), [source.indexOf(call), source.lastIndexOf(call)]);
});

test('an unchecked tsd constructor name is excluded while a real call in its arguments remains', () => {
	const call = 'printType(value)';
	const source = `new printType(${call});`;
	const start = source.indexOf(call);
	assert.deepEqual(findCalls(source, ['printType']), [{
		name: 'printType', start, nameEnd: start + 'printType'.length, end: start + call.length, message: undefined,
	}]);
});

test('a regex after `new` does not end the call and preserves subsequent calls', () => {
	const source = 'expectError(new /[)\']expectError(fake)/, \'construct signatures\'); expectError(value);';
	const secondStart = source.lastIndexOf('expectError');
	assert.deepEqual(findCalls(source), [
		{
			name: 'expectError', start: 0, nameEnd: 'expectError'.length, end: source.indexOf('; expectError(value)'), message: 'construct signatures',
		},
		{
			name: 'expectError', start: secondStart, nameEnd: secondStart + 'expectError'.length, end: source.length - 1, message: undefined,
		},
	]);
});

for (const specifier of [String.raw`'t\u0073d'`, String.raw`"t\x73d"`, String.raw`'t\u{73}d'`, String.raw`'t\sd'`, '\'t\\\nsd\'']) {
	test(`module specifiers decode escapes: ${specifier}`, () => {
		const head = 'import {printType} from ';
		assert.deepEqual(findImports(`${head}${specifier};`), [{start: head.length, specifier: 'tsd'}]);
	});
}

for (const head of ['export {printType} from ', 'import ', 'import(', 'require(']) {
	test(`module specifiers decode escapes after every import form: ${head}`, () => {
		const source = `${head}${String.raw`'t\u0073d'`}${head.endsWith('(') ? ')' : ''};`;
		assert.deepEqual(findImports(source), [{start: head.length, specifier: 'tsd'}]);
	});
}

test('relative module specifiers decode escaped path characters and quotes, and keep their whitespace', () => {
	const sources = [
		String.raw`export {value} from './\u0069ndex.js';`,
		String.raw`export {value} from './it\'s.js';`,
		'import \'./space  in filename.js\';',
	];
	assert.deepEqual(sources.map(source => findImports(source)), [
		[{start: sources[0].indexOf('\''), specifier: './index.js'}],
		[{start: sources[1].indexOf('\''), specifier: './it\'s.js'}],
		[{start: sources[2].indexOf('\''), specifier: './space  in filename.js'}],
	]);
});

for (const head of [
	'loader.require',
	'loader.import',
	'loader?.require',
	'loader?.import',
	'this.#require',
	'this.#import',
	'loader. /* member */ require',
	'loader[\'require\']',
	'loader[\'import\']',
]) {
	test(`member methods are not module imports: ${head}`, () => {
		assert.deepEqual(findImports(`${head}('tsd');`), []);
	});
}

test('bare module syntax still records imports', () => {
	const sources = [
		'import \'tsd\';',
		'import value from \'tsd\';',
		'import {value} from \'tsd\';',
		'import * as value from \'tsd\';',
		'export {value} from \'tsd\';',
		'export * from \'tsd\';',
		'import(\'tsd\');',
		'require(\'tsd\');',
		'import value = require(\'tsd\');',
		'const value = import /* module */ ( /* name */ \'tsd\');',
		'const value = require /* module */ ( /* name */ \'tsd\');',
	];
	assert.deepEqual(sources.map(source => findImports(source).map(({specifier}) => specifier)), sources.map(() => ['tsd']));
});

for (const [header, isUnchecked] of [
	['// @ts-nocheck\n// @ts-check', false],
	['// @ts-check\n// @ts-nocheck', true],
	['// @ts-nocheck\n// @ts-nocheck', true],
	['// @ts-nocheck\n// @ts-check\n// @ts-nocheck', true],
	['// @ts-nocheck\n// @TS-CHECK', false],
	['// @ts-nocheck\n/* @ts-check */', true],
	['// @ts-nocheck\n// @ts-checker', true],
	['// @ts-nocheck\n// @ts-check: note', false],
	['// @ts-nocheck\n/// @TS-CHECK', false],
]) {
	test(`only the effective file-check directive is reported: ${JSON.stringify(header)}`, () => {
		const source = `${header}\nexport {};`;
		const expected = isUnchecked ? [{start: source.lastIndexOf('// @ts-nocheck'), name: 'nocheck'}] : [];
		assert.deepEqual(findDirectives(source), expected);
	});
}

test('re-enabling file checking preserves ordinary ignore directives', () => {
	const source = '// @ts-nocheck\n// @ts-check\n// @ts-ignore\nconst value: string = 1;';
	assert.deepEqual(findDirectives(source), [{start: source.indexOf('// @ts-ignore'), name: 'ignore'}]);
});

test('a check directive after a statement cannot override a file-check directive', () => {
	assert.deepEqual(findDirectives('// @ts-nocheck\nexport {};\n// @ts-check\nconst value: string = 1;'), [{start: 0, name: 'nocheck'}]);
});
