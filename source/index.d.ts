/*
The failure messages are the names of these types. TypeScript prints the reference as is, for example `Type 'string' does not satisfy the constraint 'ActualTypeIs<number>'`, so the message names the actual type without any string building. The names are the public wording of a failure, and runner.js reads them to describe a failure in one line. Do not rename them.

The keys are symbols that are not exported, so no expected type can have the key, and satisfy the check that way.
*/

declare const actualTypeIs: unique symbol;

type ActualTypeIs<Type> = {
	readonly [actualTypeIs]: Type;
};

declare const actualTypeIsIdentical: unique symbol;

type ActualTypeIsIdentical<Type> = {
	readonly [actualTypeIsIdentical]: Type;
};

declare const actualTypeIsNotAssignable: unique symbol;

type ActualTypeIsNotAssignable<Type> = {
	readonly [actualTypeIsNotAssignable]: Type;
};

declare const actualTypeIsAssignable: unique symbol;

type ActualTypeIsAssignable<Type> = {
	readonly [actualTypeIsAssignable]: Type;
};

type IsEqual<Left, Right> =
	(<Type>() => Type extends Left ? true : false) extends
	(<Type>() => Type extends Right ? true : false)
		? true
		: false;

type IsAnyOrNever<Type> = [Type] extends [never] ? true : 0 extends 1 & Type ? true : false;

// TypeScript compares `this` parameters only when both functions have one, so the `this` parameter of the function itself is compared separately.
type IsIdentical<Actual, Expected> = IsEqual<Actual, Expected> extends true ? IsEqual<ThisParameterOf<Actual>, ThisParameterOf<Expected>> : false;

type ToBe<Actual, Expected> = IsIdentical<Actual, Expected> extends true ? unknown : ActualTypeIs<Actual>;

type NotToBe<Actual, Expected> = IsIdentical<Actual, Expected> extends true ? ActualTypeIsIdentical<Actual> : unknown;

// `any` and `never` are assignable to almost everything, which is how an accidental one passes unnoticed, so here they are only assignable to themselves. Identical types come first, because TypeScript can tell that also for a type parameter, like `this` in a class, where it cannot tell whether the type is `any` or `never`. Equality still needs an assignability check, because it does not distinguish abstract constructors from concrete ones. Comparing return types lets TypeScript resolve the check for identical type parameters too.
type IsAssignable<Actual, Expected> =
	IsEqual<Actual, Expected> extends true
		? (() => Actual) extends (() => Expected) ? true : false
		: IsAnyOrNever<Actual> extends true ? false : [Actual] extends [Expected] ? true : false;

type ToBeAssignableTo<Actual, Expected> = IsAssignable<Actual, Expected> extends true ? unknown : ActualTypeIsNotAssignable<Actual>;

// The check is a separate type, like `IsIdentical` in `NotToBe`, because with the failure in the true branch of `[Actual] extends [Expected]` itself, the constraint is circular and TypeScript never checks it.
type NotToBeAssignableTo<Actual, Expected> = IsAssignable<Actual, Expected> extends true ? ActualTypeIsAssignable<Actual> : unknown;

// `any` and `never` satisfy every constraint, so for them the check is repeated on `this`, which they cannot bypass.
type AnyOrNeverGuard<Expected, Check> = IsAnyOrNever<Expected> extends true ? Check : unknown;

// A `never` argument list matches every call signature, including generic rest parameters constrained to `never[]`.
type ReturnTypeOf<Type> = Type extends (...arguments_: never) => infer Return ? Return : never;

type ParametersOf<Type> = Type extends (...arguments_: infer Parameters) => any ? Parameters : never;

// `never` for a type that is not a function, so in a union, only the functions count. The members that are not functions are left out before the `infer`, which is much slower for each member of a large union.
type ThisParameterOf<Type> = Type extends (...arguments_: never) => unknown ? (Type extends (this: infer This, ...arguments_: never) => any ? This : never) : never;

type ResolvedTypeOf<Type> = Type extends PromiseLike<unknown> ? Awaited<Type> : never;

/*
Named, so that a failure message names it instead of printing the whole signature, like `Negated<number>` when the check is repeated on `this` for `any` and `never`. runner.js reads the names `ExpectTypeOf` and `Negated` to tell that case apart. Do not rename them.
*/
type Negated<Actual> = {
	/**
	Assert that the type is not identical to `Expected`.

	@example
	```
	import {expectTypeOf} from 'nz';

	expectTypeOf(greet).not.toBe<(name: number) => string>();
	```
	*/
	toBe<Expected extends NotToBe<Actual, Expected>>(this: AnyOrNeverGuard<Expected, NotToBe<Actual, Expected>>): void;

	/**
	Assert that the type is not assignable to `Expected`.

	@example
	```
	import {expectTypeOf} from 'nz';

	expectTypeOf(greet).not.toBeAssignableTo<(name: number) => unknown>();
	```
	*/
	toBeAssignableTo<Expected extends NotToBeAssignableTo<Actual, Expected>>(this: AnyOrNeverGuard<Expected, NotToBeAssignableTo<Actual, Expected>>): void;
};

export type ExpectTypeOf<Actual> = {
	/**
	Negated assertions.

	@example
	```
	import {expectTypeOf} from 'nz';

	expectTypeOf(greet).not.toBe<(name: number) => string>();
	```
	*/
	not: Negated<Actual>;

	/**
	The return type of the function.

	For an overloaded function, this is the return type of the last overload. For a union, only its function members count. It is `unknown` for `any`, and `never` if the type is not a function.

	@example
	```
	import {expectTypeOf} from 'nz';

	expectTypeOf(greet).returns.toBe<string>();
	```
	*/
	returns: ExpectTypeOf<ReturnTypeOf<Actual>>;

	/**
	The parameter types of the function, as a tuple.

	For an overloaded function, these are the parameters of the last overload. It is `unknown[]` for `any`, and `never` if the type is not a function.

	@example
	```
	import {expectTypeOf} from 'nz';

	expectTypeOf(greet).parameters.toBe<[name: string]>();
	```
	*/
	parameters: ExpectTypeOf<ParametersOf<Actual>>;

	/**
	The type that the promise resolves to.

	For a union, like `Promise<string> | undefined`, it is the resolved type of the promises in it. It is `any` for `any`, and `never` if the type is not a promise.

	@example
	```
	import {expectTypeOf} from 'nz';

	expectTypeOf(fetchGreeting()).resolves.toBe<string>();
	```
	*/
	resolves: ExpectTypeOf<ResolvedTypeOf<Actual>>;

	/**
	Assert that the type is identical to `Expected`.

	`any`, `unknown`, and `never` are only identical to themselves, so `toBe<string>()` catches an accidental `any`. `readonly` and optional modifiers must match, and so must the `this` parameter of a function.

	Without a type argument, the expected type is `never`, so the assertion fails for every other type.

	@example
	```
	import {expectTypeOf} from 'nz';

	expectTypeOf(greet('World')).toBe<string>();
	```
	*/
	toBe<Expected extends ToBe<Actual, Expected> = never>(this: AnyOrNeverGuard<Expected, ToBe<Actual, Expected>>): void;

	/**
	Assert that the type is assignable to `Expected`.

	This is the normal TypeScript assignability, except that `any` and `never` are only assignable to themselves, so an accidental `any` or `never` fails.

	Without a type argument, the expected type is `never`, so the assertion fails for every other type.

	@example
	```
	import {expectTypeOf} from 'nz';

	expectTypeOf(greet).toBeAssignableTo<(name: string) => unknown>();
	```
	*/
	toBeAssignableTo<Expected extends ToBeAssignableTo<Actual, Expected> = never>(this: AnyOrNeverGuard<Expected, ToBeAssignableTo<Actual, Expected>>): void;
};

/**
Start a type assertion on the type of `value`.

The assertions are only checked by the TypeScript compiler. They do nothing at runtime.

@example
```
import {expectTypeOf} from 'nz';

expectTypeOf(greet('World')).toBe<string>();
expectTypeOf(greet).returns.toBe<string>();
expectTypeOf(greet).not.toBe<(name: number) => string>();
expectTypeOf(greet).toBeAssignableTo<(name: string) => unknown>();
```
*/
// Two overloads, not an optional `value?: Actual`, because that is `Actual | undefined`, so a value that can be `undefined` would be inferred without it.
export function expectTypeOf<Actual>(value: Actual): ExpectTypeOf<Actual>;

/**
Start a type assertion on the type `Type`, for a type that has no value to pass, like a type a package exports.

@example
```
import {expectTypeOf} from 'nz';
import type {IsEqual} from './index.js';

expectTypeOf<IsEqual<string, string>>().toBe<true>();
```
*/
export function expectTypeOf<Type>(): ExpectTypeOf<Type>;

/**
Assert that `value` causes a type error.

It passes when there is at least one type error in its type argument or inside its parentheses, and fails with `Expected an error, but found none.` otherwise. Any error code counts, except an error for a name that does not exist, which is a typo in the test. When a syntax error or an error in the compiler options made `tsc` skip the type check, no error counts.

With a `message`, only an error whose message includes it passes the assertion, so a test cannot pass because of a different error. An error inside the call that does not include it is reported, so the failure shows what the error was. The message has to be one string literal, because it is read from the source. Anything else, like a variable, is not read, and the call then takes any error. Control characters in an unmatched message are displayed as visible `\uXXXX` escapes.

This needs the `nz` CLI, which matches type errors to the `expectError()` calls. The calls are found by name, so the `expectError` from `tsd` works too. With plain `tsc`, every type error fails, so use a `// @ts-expect-error` comment instead.

@param value - The expression that causes the type error.
@param message - A part of the error message.

@example
```
import {expectError} from 'nz';

expectError(greet(1));
expectError(greet(1), 'not assignable to parameter of type');
```
*/
export function expectError<Expected = never>(value: Expected, message?: string): void;

// eslint-disable-next-line unicorn/require-module-specifiers -- Without this, a declaration file exports every declaration in it, also the symbols that the failure types are keyed by.
export {};
