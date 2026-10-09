import {expectTypeOf, expectError, type ExpectTypeOf} from './index.js';

declare function greet(name: string): string;
declare function overloaded(value: string): string;
declare function overloaded(value: number): number;
declare const aNumber: number;
declare const anAny: any;
declare const anUnknown: unknown;
declare const aNever: never;
declare const union: 'a' | 'b';
declare const readonlyObject: {readonly name: string};
declare const optionalObject: {name?: string};

// `toBe()`
expectTypeOf(greet('World')).toBe<string>();
expectTypeOf(greet).toBe<(name: string) => string>();
expectTypeOf(union).toBe<'a' | 'b'>();
expectTypeOf({name: 'x'}).toBe<{name: string}>();
expectTypeOf(anAny).toBe<any>();
expectTypeOf(anUnknown).toBe<unknown>();
expectTypeOf(aNever).toBe<never>();

expectError(expectTypeOf(aNumber).toBe<string>());
expectError(expectTypeOf(union).toBe<'a'>());
expectError(expectTypeOf(union).toBe<string>());
expectError(expectTypeOf({name: 'x'}).toBe<{name: string; age: number}>());
expectError(expectTypeOf(readonlyObject).toBe<{name: string}>());
expectError(expectTypeOf(optionalObject).toBe<{name: string | undefined}>());

// `any`, `unknown`, and `never` are only identical to themselves.
expectError(expectTypeOf(anAny).toBe<string>());
expectError(expectTypeOf(anAny).toBe<unknown>());
expectError(expectTypeOf(anAny).toBe<never>());
expectError(expectTypeOf(anUnknown).toBe<any>());
expectError(expectTypeOf(aNever).toBe<any>());
expectError(expectTypeOf(aNumber).toBe<any>());
expectError(expectTypeOf(aNumber).toBe<never>());
expectError(expectTypeOf(aNumber).toBe<unknown>());
expectError(expectTypeOf(anUnknown).toBe<never>());
expectError(expectTypeOf(aNever).toBe<unknown>());

// Nested curried functions.
declare const curried: (a: string) => (b: string) => (c: string) => (d: string) => string;
expectTypeOf(curried).toBe<(a: string) => (b: string) => (c: string) => (d: string) => string>();
expectError(expectTypeOf(curried).toBe<(a: string) => (b: string) => (c: string) => (d: number) => string>());
expectTypeOf(curried).not.toBe<(a: string) => (b: string) => (c: string) => (d: number) => string>();

// Generic functions.
declare const identity: <Type>(value: Type) => Type;
expectTypeOf(identity).toBe<<Type>(value: Type) => Type>();
expectError(expectTypeOf(identity).toBe<<Type>(value: Type) => string>());

// `not.toBe()`
expectTypeOf(greet).not.toBe<(name: number) => string>();
expectTypeOf(aNumber).not.toBe<any>();
expectTypeOf(aNumber).not.toBe<never>();
expectTypeOf(anAny).not.toBe<never>();
expectError(expectTypeOf(greet).not.toBe<(name: string) => string>());
expectError(expectTypeOf(anAny).not.toBe<any>());
expectError(expectTypeOf(aNever).not.toBe<never>());

// `toBeAssignableTo()`
expectTypeOf(greet).toBeAssignableTo<(name: string) => unknown>();
expectTypeOf(aNumber).toBeAssignableTo<number | string>();
expectTypeOf(aNumber).toBeAssignableTo<any>();
expectTypeOf(aNumber).toBeAssignableTo<unknown>();
expectTypeOf(aNever).toBeAssignableTo<never>();
expectError(expectTypeOf(anAny).toBeAssignableTo<string>());
expectError(expectTypeOf(aNever).toBeAssignableTo<string>());
expectError(expectTypeOf(aNumber).toBeAssignableTo<string>());
expectError(expectTypeOf(aNumber).toBeAssignableTo<never>());
expectError(expectTypeOf(union).toBeAssignableTo<'a'>());

// `returns`
expectTypeOf(greet).returns.toBe<string>();
expectTypeOf(overloaded).returns.toBe<number>();
expectTypeOf(aNumber).returns.toBe<never>();
expectTypeOf(anAny).returns.toBe<unknown>();
expectError(expectTypeOf(greet).returns.toBe<number>());
expectTypeOf(expectTypeOf(greet).returns).toBe<ExpectTypeOf<string>>();

// Class methods keep working when `this` is used inside the class.
class Counter {
	count = 0;

	increment(): number {
		expectTypeOf(this.count).toBe<number>();
		expectTypeOf(this).toBe<this>();
		expectTypeOf(this).toBeAssignableTo<this>();
		return this.count++;
	}
}

expectTypeOf(new Counter().increment()).toBe<number>();

// A type parameter as the actual type works too, for the assertions TypeScript can resolve for one.
function checkGeneric<Type>(value: Type): void {
	expectTypeOf(value).toBe<Type>();
	expectTypeOf(value).toBeAssignableTo<Type>();
}

checkGeneric('World');

// `not.toBeAssignableTo()`
expectTypeOf(aNumber).not.toBeAssignableTo<string>();
expectTypeOf(aNumber).not.toBeAssignableTo<never>();
expectError(expectTypeOf(aNumber).not.toBeAssignableTo<number | string>());
expectError(expectTypeOf(aNumber).not.toBeAssignableTo<any>());
expectTypeOf(anAny).not.toBeAssignableTo<string>();

// `parameters`
expectTypeOf(greet).parameters.toBe<[name: string]>();
expectTypeOf(overloaded).parameters.toBe<[value: number]>();
expectError(expectTypeOf(greet).parameters.toBe<[name: number]>());

// `resolves`
declare function fetchGreeting(): Promise<string>;
expectTypeOf(fetchGreeting()).resolves.toBe<string>();
expectTypeOf(aNumber).resolves.toBe<never>();
expectError(expectTypeOf(fetchGreeting()).resolves.toBe<number>());

// An assertion without a type argument checks against `never`.
expectError(expectTypeOf(aNumber).toBe());
expectError(expectTypeOf(aNumber).toBeAssignableTo());
expectTypeOf(aNever).toBe();

// A type with no value to pass.
expectTypeOf<Uppercase<'a'>>().toBe<'A'>();
expectError(expectTypeOf<string>().toBe<number>());

// `expectError()`
expectError(greet(1));
expectError<string>(1);
