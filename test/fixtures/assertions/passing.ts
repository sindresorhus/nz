import {expectTypeOf} from '../../../source/index.js';

declare function greet(name: string): string;
declare function overloaded(value: string): string;
declare function overloaded(value: number): number;
declare const aNumber: number;
declare const anAny: any;
declare const anUnknown: unknown;
declare const aNever: never;
declare const union: 'a' | 'b';
declare const maybeCallback: ((value: string) => number) | undefined;
declare const optionalObject: {name?: string};
declare function fetchGreeting(): Promise<string>;
declare const maybePromise: Promise<number> | undefined;
declare const thenable: PromiseLike<boolean>;

// The cases that must not report anything on either TypeScript version.
expectTypeOf(greet('World')).toBe<string>();
expectTypeOf(greet).toBe<(name: string) => string>();
expectTypeOf(union).toBe<'a' | 'b'>();
expectTypeOf({name: 'x'}).toBe<{name: string}>();
expectTypeOf(anAny).toBe<any>();
expectTypeOf(anUnknown).toBe<unknown>();
expectTypeOf(aNever).toBe<never>();
expectTypeOf(optionalObject).toBe<{name?: string}>();
// A value that can be `undefined` keeps `undefined` in its type.
expectTypeOf(maybeCallback).toBe<((value: string) => number) | undefined>();

expectTypeOf(greet).not.toBe<(name: number) => string>();
expectTypeOf(aNumber).not.toBe<any>();
expectTypeOf(anAny).not.toBe<never>();

expectTypeOf(greet).toBeAssignableTo<(name: string) => unknown>();
expectTypeOf(aNumber).toBeAssignableTo<number | string>();
expectTypeOf(aNumber).toBeAssignableTo<any>();
expectTypeOf(anAny).toBeAssignableTo<any>();
expectTypeOf(anAny).not.toBeAssignableTo<string>();
expectTypeOf(aNever).not.toBeAssignableTo<string>();
expectTypeOf(aNever).toBeAssignableTo<never>();

expectTypeOf(greet).returns.toBe<string>();
expectTypeOf(overloaded).returns.toBe<number>();
expectTypeOf(aNumber).returns.toBe<never>();
expectTypeOf(anAny).returns.toBe<unknown>();
expectTypeOf(maybeCallback).returns.toBe<number>();

expectTypeOf(greet).not.toBeAssignableTo<(name: number) => unknown>();
expectTypeOf(aNumber).not.toBeAssignableTo<string>();
expectTypeOf(aNumber).not.toBeAssignableTo<never>();

expectTypeOf(greet).parameters.toBe<[name: string]>();
expectTypeOf(overloaded).parameters.toBe<[value: number]>();
expectTypeOf(aNumber).parameters.toBe<never>();

expectTypeOf(fetchGreeting()).resolves.toBe<string>();
expectTypeOf(maybePromise).resolves.toBe<number>();
expectTypeOf(thenable).resolves.toBe<boolean>();
expectTypeOf(aNumber).resolves.toBe<never>();
expectTypeOf(anAny).parameters.toBe<unknown[]>();
expectTypeOf(anAny).resolves.toBe<any>();

// A type with no value to pass.
expectTypeOf<Uppercase<'a'>>().toBe<'A'>();
expectTypeOf<string>().not.toBe<number>();

// A fresh literal widens, so this is a `string`.
expectTypeOf('hello').toBe<string>();
