const identifierPattern = /[\p{ID_Continue}$\u{200C}\u{200D}]+/vy;

// A `/` after one of these characters starts a regex literal, not a division.
const regexPrecedingCharacters = new Set('(,=:[!&|?{};+-*/%<>~^');

// The single characters TypeScript counts as the end of a line. A line comment and a regex literal end at any of them.
const lineBreaks = new Set(['\n', '\r', '\u{2028}', '\u{2029}']);

// The same, with `\r\n` as one break, for `lineStartOffsets()`, which matches a break rather than test a character.
const lineBreakPattern = /\r\n|[\n\r\u{2028}\u{2029}]/gv;

// A `/` after one of these keywords starts a regex literal, not a division, because each of them has to be followed by an expression. `of` is not in here, because it is only a keyword in a `for…of` head and a normal name everywhere else. `split(' ')` is needed because a `Set` from a string takes single characters.
const regexPrecedingKeywords = new Set('await case default delete do else in instanceof new return throw typeof void yield'.split(' '));

// The keywords whose `(…)` head is followed by a statement, so a `/` after the `)` starts a regex literal, not a division.
const controlKeywords = new Set(['if', 'while', 'for', 'with']);

// The characters `previous` can be after an expression has ended: the end of an identifier, of a string, a template or a regex, and the three closing brackets. It is a `Set` from a string, so it takes single characters.
const expressionEndCharacters = new Set('")]}a');

/*
What `previous` becomes after an identifier, so that `skipLiteral()` can tell a regex from a division. A keyword after `.` or `#` is a property name, and a `/` after that is a division.

The preserved `new` token also identifies a constructor target, rather than a function call.

`function` is kept too, so that `scanSource()` can tell a declaration from a call, and so are the `controlKeywords`, so that it can find the end of their head. A `/` after any of them is a division, which is never valid there anyway.
*/
function afterIdentifier(previous, identifier) {
	// `for await (…)` has a head like `for (…)`.
	if (identifier === 'await' && previous === 'for') {
		return previous;
	}

	const isKeyword = regexPrecedingKeywords.has(identifier) || controlKeywords.has(identifier) || identifier === 'function';
	return previous !== '.' && previous !== '#' && isKeyword ? identifier : 'a';
}

/*
What `previous` becomes after a single character, so that `skipLiteral()` can tell a regex literal from a division.

A `!` after the end of an expression, and a `++` or `--`, is a postfix operator, as in `value!` or `count++`. The expression is over, so a `/` after the operator is a division. A single `+` or `-` is a binary or unary operator, and a `/` after it is a regex. A prefix `++` is followed by an operand, so reading it as the end of an expression makes no difference. The characters of `++` and `--` must be adjacent; whitespace or a comment separates two operators.
*/
function afterCharacter(previous, character, previousCharacter) {
	const isPostfix = (character === '!' && expressionEndCharacters.has(previous))
		|| (character === previous && character === previousCharacter && (character === '+' || character === '-'));

	return isPostfix ? 'a' : character;
}

/*
Returns the type argument that starts at `offset`, as it is written in the test, with its whitespace outside literals collapsed and its string literals in double quotes, like TypeScript prints a type. Returns `undefined` when there is no type argument there.

TypeScript widens a literal type in a failure message, like `'a'` to `string`, so the written type is the one to show.
*/
export function readTypeArgument(source, offset) {
	let start = offset - 1;
	while (start >= 0 && /\s/v.test(source[start])) {
		start--;
	}

	const end = source[start] === '<' ? findClosing(source, start, '<', '>') : -1;
	if (end === -1) {
		return undefined;
	}

	// Read as tokens, so a quote inside a string literal is not taken for the end of one, and a comment is left out.
	let writtenType = '';
	let previous = '';

	for (let index = start + 1; index < end - 1;) {
		const token = readToken(source, index, previous);
		// The walk does not track control heads like `findClosing()`, so it can read a literal that does not end where `findClosing()` read a regex.
		if (token.end === -1) {
			return undefined;
		}

		const text = source.slice(index, token.end);
		const value = decodeStringLiteral(text);

		if (isComment(source, index) || /^\s/v.test(text)) {
			writtenType += writtenType.endsWith(' ') ? '' : ' ';
		} else {
			writtenType += value === undefined ? text : JSON.stringify(value);
		}

		index = token.end;
		previous = token.previous;
	}

	return writtenType.trim();
}

export function lineStartOffsets(source) {
	const offsets = [0];

	for (const match of source.matchAll(lineBreakPattern)) {
		offsets.push(match.index + match[0].length);
	}

	return offsets;
}

// The skip functions return the index after the literal that starts at `index`, or `-1` if it does not end.

function skipString(source, index) {
	const quote = source[index];

	for (let position = index + 1; position < source.length; position++) {
		const character = source[position];

		if (character === quote) {
			return position + 1;
		}

		// Quoted strings allow raw U+2028 and U+2029 since ECMAScript's JSON superset change.
		if (character === '\n' || character === '\r') {
			return -1;
		}

		// Step over the escaped character. An escaped `\r\n` is one line continuation.
		if (character === '\\') {
			position += source.startsWith('\r\n', position + 1) ? 2 : 1;
		}
	}

	return -1;
}

function skipTemplate(source, index) {
	for (let position = index + 1; position < source.length; position++) {
		const character = source[position];

		if (character === '`') {
			return position + 1;
		}

		if (character === '\\') {
			position++;
		} else if (character === '$' && source[position + 1] === '{') {
			position = findClosing(source, position + 1, '{', '}');
			if (position === -1) {
				return -1;
			}

			// Step back so the loop increment lands after the closing brace.
			position--;
		}
	}

	return -1;
}

function skipRegex(source, index) {
	let isInCharacterClass = false;

	for (let position = index + 1; position < source.length; position++) {
		const character = source[position];

		// A `switch` here would need a `break` to fall out of each case, which `unicorn/no-break-in-nested-loop` rejects.
		if (character === '\\') {
			position++;
		} else if (lineBreaks.has(character)) {
			return -1;
		} else if (character === '[') {
			isInCharacterClass = true;
		} else if (character === ']') {
			isInCharacterClass = false;
		} else if (character === '/' && !isInCharacterClass) {
			return position + 1;
		}
	}

	return -1;
}

/*
Returns the index after a comment, string, template literal, or regex literal that starts at `index`, `undefined` if none starts there, and `-1` if it does not end.

`previous` is the last significant character before `index`, used to tell a regex literal from a division.
*/
function skipLiteral(source, index, previous) {
	const character = source[index];
	const nextCharacter = source[index + 1];

	if (character === '/' && nextCharacter === '/') {
		let end = index + 2;
		while (end < source.length && !lineBreaks.has(source[end])) {
			end++;
		}

		return end;
	}

	if (character === '/' && nextCharacter === '*') {
		const end = source.indexOf('*/', index + 2);
		return end === -1 ? -1 : end + 2;
	}

	if (character === '\'' || character === '"') {
		return skipString(source, index);
	}

	if (character === '`') {
		return skipTemplate(source, index);
	}

	const isRegex = character === '/'
		&& (previous === '' || regexPrecedingCharacters.has(previous) || regexPrecedingKeywords.has(previous));
	return isRegex ? skipRegex(source, index) : undefined;
}

function isComment(source, index) {
	return source[index] === '/' && (source[index + 1] === '/' || source[index + 1] === '*');
}

/*
Reads the token that starts at `index`: an identifier, a comment, a string, a template literal, a regex literal, a spread operator, or a single character.

Returns the index after it (`-1` if it does not end), the identifier if it is one, and what `previous` becomes after it.
*/
function readToken(source, index, previous) {
	// An identifier cannot start a literal, and reading it as one token is what keeps a keyword before a regex from being read as a division.
	identifierPattern.lastIndex = index;
	const identifier = identifierPattern.exec(source)?.[0];
	if (identifier) {
		return {end: index + identifier.length, identifier, previous: afterIdentifier(previous, identifier)};
	}

	const end = skipLiteral(source, index, previous);
	if (end !== undefined) {
		return {end, previous: isComment(source, index) ? previous : '"'};
	}

	// Spread starts an expression, like `=`, and its dots are never property access.
	if (source.startsWith('...', index)) {
		return {end: index + 3, previous: '='};
	}

	const character = source[index];
	return {end: index + 1, previous: /\s/v.test(character) ? previous : afterCharacter(previous, character, source[index - 1])};
}

// Returns the index after the `close` character that balances the `open` character at `index`, or `-1`.
function findClosing(source, index, open, close) {
	let depth = 0;
	let previous = '';

	for (let position = index; position < source.length;) {
		const character = source[position];

		// A control head is followed by a statement, so a regex after its closing parenthesis is not a division.
		if (character === '(' && controlKeywords.has(previous)) {
			position = findClosing(source, position, '(', ')');
			if (position === -1) {
				return -1;
			}

			previous = ';';
			continue;
		}

		// The `>` in an arrow function type is not a closing angle bracket.
		const isArrow = character === '>' && source[position - 1] === '=';

		// The brackets are never part of a longer token, so they can be checked before the token is read.
		if (character === open) {
			depth++;
		} else if (character === close && !isArrow) {
			depth--;
			if (depth === 0) {
				return position + 1;
			}
		}

		const token = readToken(source, position, previous);
		if (token.end === -1) {
			return -1;
		}

		position = token.end;
		previous = token.previous;
	}

	return -1;
}

function skipWhitespaceAndComments(source, index) {
	let position = index;

	while (position < source.length) {
		if (/\s/v.test(source[position])) {
			position++;
		} else if (isComment(source, position)) {
			position = skipLiteral(source, position, '');
			if (position === -1) {
				return -1;
			}
		} else {
			break;
		}
	}

	return position;
}

/*
Returns where the parentheses of the `expectError` call that starts at `index` begin and end, or `-1` if the call cannot be parsed.

Both are needed. The end is where the range a diagnostic has to be in ends, and the message of the call is read from between the two.
*/
function findParentheses(source, index) {
	let position = skipWhitespaceAndComments(source, index);

	while (source[position] === '!' || source.startsWith('?.', position)) {
		const isNonNull = source[position] === '!';

		// A postfix non-null assertion cannot cross a line break, unlike an optional call.
		// eslint-disable-next-line unicorn/prefer-regexp-test -- The shared global pattern must not change lastIndex.
		if (isNonNull && source.slice(index, position).search(lineBreakPattern) !== -1) {
			return -1;
		}

		index = position + (isNonNull ? 1 : 2);
		position = skipWhitespaceAndComments(source, index);
	}

	if (source[position] === '<') {
		position = findClosing(source, position, '<', '>');
		if (position === -1) {
			return -1;
		}

		position = skipWhitespaceAndComments(source, position);
		// Type arguments can precede an optional call, but a following `!` starts a relational expression.
		if (source.startsWith('?.', position)) {
			position = skipWhitespaceAndComments(source, position + 2);
		}
	}

	if (source[position] !== '(') {
		return -1;
	}

	const end = findClosing(source, position, '(', ')');
	return end === -1 ? -1 : {start: position, end};
}

// The escapes of a string literal that stand for one other character.
const characterEscapes = new Map([['n', '\n'], ['r', '\r'], ['t', '\t'], ['b', '\b'], ['f', '\f'], ['v', '\v'], ['0', '\0']]);

// The value of a string literal, or `undefined` when it is not one.
function decodeStringLiteral(literal) {
	if (!/^(?:'.*'|".*")$/sv.test(literal)) {
		return undefined;
	}

	const escapePattern = /\\(?:u\{(?<codePoint>[\dA-Fa-f]+)\}|u(?<unit>[\dA-Fa-f]{4})|x(?<byte>[\dA-Fa-f]{2})|(?<lineContinuation>\r\n|[\n\r\u{2028}\u{2029}])|(?<character>.))/gsv;

	return literal.slice(1, -1).replaceAll(escapePattern, (...match) => {
		const {codePoint, unit, byte, lineContinuation, character} = match.at(-1);
		const hexadecimal = codePoint ?? unit ?? byte;

		// A code point that does not exist is a syntax error, which `tsc` reports, so it is left as it is.
		const value = hexadecimal === undefined ? undefined : Number.parseInt(hexadecimal, 16);
		if (value !== undefined) {
			return value > 0x10_FF_FF ? match[0] : String.fromCodePoint(value);
		}

		return lineContinuation === undefined ? (characterEscapes.get(character) ?? character) : '';
	});
}

const closingBrackets = new Map([['(', ')'], ['[', ']'], ['{', '}']]);

/*
Returns the message of an `expectError` call, whose parentheses start at `start` and end at `end`: the argument after the last comma outside any brackets, when it is one string literal. Anything else is not a message, like a variable, `'a' + 'b'`, or the rest of a type argument after a comma, like `'b'>` in `create<'a', 'b'>()`.
*/
function readMessage(source, start, end) {
	// The tokens outside brackets, split at the commas.
	const arguments_ = [[]];
	let previous = '';

	for (let index = start + 1; index < end - 1;) {
		const token = readToken(source, index, previous);
		if (token.end === -1) {
			return undefined;
		}

		const character = source[index];
		const closingCharacter = closingBrackets.get(character);
		if (closingCharacter) {
			// Keep a token for the group, so a string followed by an index or a call is not read as a lone literal.
			arguments_.at(-1).push(character);
			index = findClosing(source, index, character, closingCharacter);
			if (index === -1) {
				return undefined;
			}

			previous = closingCharacter;
			continue;
		}

		if (character === ',') {
			arguments_.push([]);
		} else if (!/\s/v.test(character) && !isComment(source, index)) {
			arguments_.at(-1).push(source.slice(index, token.end));
		}

		index = token.end;
		previous = token.previous;
	}

	// A trailing comma.
	if (arguments_.length > 1 && arguments_.at(-1).length === 0) {
		arguments_.pop();
	}

	const lastArgument = arguments_.at(-1);
	return arguments_.length > 1 && lastArgument.length === 1 ? decodeStringLiteral(lastArgument[0]) : undefined;
}

/*
Returns `ignore`, `check`, or `nocheck` when the comment is a directive that TypeScript honors, with the same rules: `@ts-ignore` in a line comment, or on the last line of a block comment, and `@ts-check` or `@ts-nocheck` only in a line comment before the first statement.
*/
function readDirective(comment, hasStatement) {
	if (!comment.startsWith('//')) {
		return /^[*\/]*\s*@ts-ignore/v.test(comment.split(lineBreakPattern).at(-1).trimStart()) ? 'ignore' : undefined;
	}

	if (/^\/\/\/?\s*@ts-ignore/v.test(comment)) {
		return 'ignore';
	}

	// TypeScript reads the name of a pragma without case.
	return hasStatement ? undefined : /^\/\/\/?\s*@ts-(?<name>check|nocheck)(?=[\s:]|$)/iv.exec(comment)?.groups.name.toLowerCase();
}

// Whether a string after these two tokens is a module specifier: `from 'x'`, `import 'x'`, `import('x')` and `require('x')`.
function isSpecifierPosition([beforeLast, last]) {
	return last === 'from' || last === 'import' || (last === '(' && (beforeLast === 'import' || beforeLast === 'require'));
}

/*
Whether a name after `previous` is where an expression starts, and not where a member can start, so that a `{` or `:` after its arguments does not make it a method.

`{`, `}`, `;` and `,` can come before a member, `*` before a generator method, and `>` and `void` end the type of a property or method before a member without a `;`, like `values: Array<string>` or `reset(): void`. So a call after one of them, like `condition ? () => expectError(value) : other`, is still read as a method.
*/
function isExpressionStart(previous) {
	return (regexPrecedingCharacters.has(previous) && !'{};,*>'.includes(previous)) || (regexPrecedingKeywords.has(previous) && previous !== 'void');
}

/*
Finds the calls to the functions in `callNames`, like `expectError(…)` and `expectError<…>(…)`, in a file without a TypeScript parser, the `@ts-ignore` comments, the effective `@ts-nocheck` directive, and the modules it imports.

A call that cannot be parsed is left out, so its diagnostics are reported as failures instead of being swallowed.
*/
export function scanSource(source, callNames) {
	const calls = [];
	const directives = [];
	const imports = [];
	let previous = '';
	// The last two tokens that are not whitespace or a comment, to tell a module specifier from any other string.
	let recentTokens = [];
	let hasStatement = false;
	let fileCheckDirective;
	// Where the `(…)` head of an `if`, `while`, `for` or `with` ends.
	const controlHeadEnds = new Set();

	// TypeScript skips a shebang before it reads the directives.
	const shebangEnd = source.startsWith('#!') ? source.search(lineBreakPattern) : 0;

	for (let index = shebangEnd === -1 ? source.length : shebangEnd; index < source.length;) {
		const token = readToken(source, index, previous);
		if (token.end === -1) {
			break;
		}

		const isCommentToken = isComment(source, index);
		const directive = isCommentToken ? readDirective(source.slice(index, token.end), hasStatement) : undefined;
		if (directive === 'ignore') {
			directives.push({start: index, name: directive});
		} else if (directive) {
			fileCheckDirective = {start: index, name: directive};
		}

		const isString = source[index] === '\'' || source[index] === '"';
		if (isString && isSpecifierPosition(recentTokens)) {
			imports.push({start: index, specifier: decodeStringLiteral(source.slice(index, token.end))});
		}

		if (!isCommentToken && !/\s/v.test(source[index])) {
			// Member names do not make a following string a module specifier.
			const significantToken = token.identifier && (previous === '.' || previous === '#') ? 'a' : token.identifier ?? source[index];
			recentTokens = [recentTokens.at(-1), significantToken];
			hasStatement = true;
		}

		if (source[index] === '(' && controlKeywords.has(previous)) {
			const headEnd = findClosing(source, index, '(', ')');
			if (headEnd !== -1) {
				controlHeadEnds.add(headEnd);
			}
		}

		// Skip property access (`tsd.expectError`), a private field (`this.#expectError`), declarations (`function expectError`), and constructor targets (`new expectError`).
		if (previous !== '.' && previous !== '#' && previous !== 'function' && previous !== 'new' && callNames.has(token.identifier)) {
			const parentheses = findParentheses(source, token.end);
			// A `{` after the arguments is a method body, and a `:` is a return type, so the name is a method or a method signature and not a call. Where an expression starts, a `:` is the rest of a conditional, like in `condition ? expectError(value) : other`, or of a `case`.
			if (parentheses !== -1 && (isExpressionStart(previous) || !'{:'.includes(source[skipWhitespaceAndComments(source, parentheses.end)]))) {
				calls.push({
					name: token.identifier,
					start: index,
					nameEnd: token.end,
					end: parentheses.end,
					message: readMessage(source, parentheses.start, parentheses.end),
				});
				// Keep scanning the arguments, which can contain assertions and suppression directives of their own.
			}
		}

		index = token.end;
		// The head is followed by a statement, like a `;` is.
		previous = controlHeadEnds.has(index) ? ';' : token.previous;
	}

	// Only the last `@ts-check` or `@ts-nocheck` takes effect, and only one that turns off the check is a failure.
	if (fileCheckDirective?.name === 'nocheck') {
		directives.push(fileCheckDirective);
	}

	return {calls, directives, imports};
}
