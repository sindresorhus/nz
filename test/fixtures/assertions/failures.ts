import {expectTypeOf} from '../../../source/index.js';

declare function greet(name: string): string;
declare const aNumber: number;
declare const anAny: any;
declare const union: 'a' | 'b';
declare const anUnknown: unknown;

expectTypeOf(aNumber).toBe<string>();
expectTypeOf(anAny).toBe<string>();
expectTypeOf(union).toBe<'a'>();
expectTypeOf({name: 'x'}).toBe<{name: string; age: number}>();
expectTypeOf(aNumber).toBe<any>();
expectTypeOf(aNumber).toBe<never>();
expectTypeOf(greet).not.toBe<(name: string) => string>();
expectTypeOf(aNumber).toBeAssignableTo<string>();
expectTypeOf(greet).returns.toBe<number>();
expectTypeOf(anUnknown).toBe<never>();
// The check is repeated on `this` for `any` and `never`, so the message has to name the type in that type.
expectTypeOf(anAny).not.toBe<any>();
declare function fetchGreeting(): Promise<string>;
expectTypeOf<string>().toBe<number>();
expectTypeOf(fetchGreeting()).resolves.toBe<number>();
expectTypeOf(greet).parameters.toBe<[name: number]>();
expectTypeOf(aNumber).not.toBeAssignableTo<number | string>();
// The check is repeated on `this` for `any` and `never`, so the message has to name the type in that type.
expectTypeOf(aNumber).not.toBeAssignableTo<any>();
declare const aNever: never;
// `any` and `never` are only assignable to themselves.
expectTypeOf(anAny).toBeAssignableTo<string>();
expectTypeOf(aNever).toBeAssignableTo<string>();
// An assertion without a type argument checks against `never`.
expectTypeOf(aNumber).toBe();
expectTypeOf(aNumber).toBeAssignableTo();
// The keys of the failure types are symbols that are not exported, so a property with the same name does not satisfy the check.
expectTypeOf(aNumber).toBe<{actualTypeIs: number}>();
