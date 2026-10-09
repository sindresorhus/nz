import {expectError} from '../expect-error.js';
import {greet, pair} from './index.js';

// A call in a comment is not a call: expectError(greet('World'))
const text = 'expectError(greet("World"))';
const template = `expectError(greet('World'))`;

expectError(greet(')', 1));
expectError(greet("(", 1));
expectError(greet(/* ) */ 1));
expectError(true /* ) */ && greet(1));
expectError(greet( // )
	1,
));
expectError(greet(`${')'}`, 1));
expectError(greet(`)${`(`}`, 1));
expectError(/[)]/.test(greet(1)));
expectError(/\)/.test(greet(1)));
expectError(/[/)]/.test(greet(1)));
expectError(/\/[)]/.test(greet(1)));
expectError<(name: string) => void>(greet(1));
expectError<Array<Array<string>>>(greet(1));
expectError /* comment */ (greet(1));
// A `/` after a keyword is a regex, and the parentheses in it are not the call's.
expectError(typeof /[)]/.source + pair(1));

// A `/` after a postfix `!`, `++` or `--` is a division. The first one is the plain case.
expectError(greet(1) / 1);
expectError(greet(1)! / 1);
expectError(greet(1)++ / 1);
expectError(greet(1)-- / 1);

// A `/` after a binary `+` or `-` is a regex.
expectError(greet(1) + /["')]/.source);
expectError(greet(1) - /["')]/.source.length);

// `function` before a call does not make the call a declaration.
const noop = function () {};
expectError(greet(1));

// Neither of these is a call, so neither is an assertion.
class Counter {
	#expectError(value: unknown) {
		return value;
	}

	expectError(value: unknown) {
		return value;
	}

	increment() {
		return [this.#expectError(1), this.expectError(2)];
	}
}

// A return type after the arguments is a method or a method signature, so none of these is a call either.
class Checker {
	expectError(value: unknown): unknown {
		return value;
	}
}

class Generator {
	*expectError(value: unknown): Iterator<unknown> {
		yield value;
	}
}

type Assertions = {
	expectError(value: unknown): void;
};

// After an operator or a keyword, a `:` after the arguments is the rest of a conditional or a `case`, so these are calls.
declare const condition: boolean;
const conditional = condition ? expectError(greet(1)) : undefined;
const conditionalOperand = condition ? typeof expectError(greet(1)) : undefined;

declare const value: unknown;
switch (value) {
	case expectError(greet(1)): {
		break;
	}
}

// A `>` or `void` can end the type of a property or method before a member, so these are still methods.
class Values {
	values: Array<string> = []
	expectError(value: unknown): unknown {
		return value;
	}
}

type Resettable = {
	reset(): void
	expectError(value: unknown): void
};

// A `/` after the head of an `if` or a `for` is a regex, so the quote in it does not start a string, and the call after it is found.
if (condition) /'/.test('');
expectError(greet(1));

for (;;) /"/.test('');
expectError(greet(1));
