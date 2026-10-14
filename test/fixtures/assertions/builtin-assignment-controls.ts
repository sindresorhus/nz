import {expectTypeOf} from '../../../source/index.js';

// Built-in methods retain their declared return and parameter types.
expectTypeOf<Date['toISOString']>().returns.toBe<string>();
expectTypeOf<Date['toISOString']>().parameters.toBe<[]>();
expectTypeOf<Map<string, number>['get']>().returns.toBe<number | undefined>();
expectTypeOf<Map<string, number>['set']>().parameters.toBe<[key: string, value: number]>();
expectTypeOf<Map<string, number>['set']>().returns.toBe<Map<string, number>>();
expectTypeOf<ReadonlyMap<string, number>['get']>().returns.toBe<number | undefined>();
expectTypeOf<Set<string>['add']>().returns.toBe<Set<string>>();
expectTypeOf<Promise<string>['then']>().returns.toBe<Promise<unknown>>();
expectTypeOf<Promise<string>['catch']>().returns.toBe<Promise<unknown>>();
expectTypeOf<Promise<string>['finally']>().returns.toBe<Promise<string>>();
expectTypeOf<typeof Promise.resolve>().returns.toBe<Promise<unknown>>();
expectTypeOf<typeof Array.isArray>().returns.toBe<boolean>();
expectTypeOf<typeof Array.isArray>().parameters.toBe<[arg: any]>();

// Readonly property modifiers affect identity, but native assignability ignores them.
expectTypeOf<{readonly value: string}>().toBeAssignableTo<{value: string}>();
expectTypeOf<{value: string}>().toBeAssignableTo<{readonly value: string}>();
expectTypeOf<(value: unknown) => value is string>().toBeAssignableTo<(value: unknown) => boolean>();
expectTypeOf<(value: unknown) => asserts value is string>().toBeAssignableTo<(value: unknown) => void>();
// @ts-expect-error A plain boolean function does not have a type-predicate contract.
expectTypeOf<(value: unknown) => boolean>().toBeAssignableTo<(value: unknown) => value is string>();

// Native assignment accepts a normal void function for an assertion-signature contract.
declare const plainVoid: (value: unknown) => void;
const assertingVoid: (value: unknown) => asserts value is string = plainVoid;
expectTypeOf(plainVoid).toBeAssignableTo<(value: unknown) => asserts value is string>();
// @ts-expect-error Native assignment accepts void functions for assertion signatures.
expectTypeOf(plainVoid).not.toBeAssignableTo<(value: unknown) => asserts value is string>();

// Void can accept undefined, while undefined cannot accept every void value.
expectTypeOf<void | undefined>().toBeAssignableTo<void>();
expectTypeOf<void>().toBeAssignableTo<void | undefined>();
expectTypeOf<undefined>().toBeAssignableTo<void>();
expectTypeOf<void>().not.toBeAssignableTo<undefined>();
// @ts-expect-error Native assignment rejects assigning void to undefined.
const notUndefined: undefined = undefined as void;
// @ts-expect-error The assertion should reject that assignment too.
expectTypeOf<void>().toBeAssignableTo<undefined>();
expectTypeOf<() => void>().not.toBe<() => undefined>();
expectTypeOf<void>().not.toBe<undefined>();

// A void callback can ignore a result, but a number callback must return one.
expectTypeOf<() => void>().toBeAssignableTo<() => void>();
expectTypeOf<() => number>().toBeAssignableTo<() => void>();
// @ts-expect-error Native assignment rejects void-returning functions where numbers are required.
const notNumberReturning: () => number = () => {
};
expectTypeOf<() => void>().not.toBeAssignableTo<() => number>();
// @ts-expect-error The assertion should reject that assignment too.
expectTypeOf<() => void>().toBeAssignableTo<() => number>();

// Intrinsic string types and numeric patterns widen to string, but retain their constraints.
declare const uppercaseText: Uppercase<string>;
declare const numericText: `${number}`;
const uppercaseString: string = uppercaseText;
const numericString: string = numericText;
expectTypeOf(uppercaseText).toBe<Uppercase<Uppercase<string>>>();
expectTypeOf(uppercaseText).not.toBe<string>();
expectTypeOf(uppercaseText).toBeAssignableTo<string>();
expectTypeOf(numericText).toBe<`${number}`>();
expectTypeOf(numericText).not.toBe<string>();
expectTypeOf(numericText).toBeAssignableTo<string>();
// @ts-expect-error An arbitrary string need not already be uppercase.
const notUppercase: Uppercase<string> = numericString;
// @ts-expect-error The assertion has the same uppercase requirement.
expectTypeOf<string>().toBeAssignableTo<Uppercase<string>>();
expectTypeOf<string>().not.toBeAssignableTo<Uppercase<string>>();
// @ts-expect-error An arbitrary string need not encode a number.
const notNumeric: `${number}` = uppercaseString;
// @ts-expect-error The assertion has the same numeric text requirement.
expectTypeOf<string>().toBeAssignableTo<`${number}`>();
expectTypeOf<string>().not.toBeAssignableTo<`${number}`>();

// Uppercase<any> keeps an intrinsic string constraint, while Uppercase<never> is still never.
expectTypeOf<Uppercase<any>>().toBe<Uppercase<any>>();
expectTypeOf<Uppercase<any>>().not.toBe<any>();
expectTypeOf<Uppercase<never>>().toBe<never>();
expectTypeOf<Uppercase<never>>().toBeAssignableTo<never>();
expectTypeOf<Uppercase<never>>().not.toBeAssignableTo<string>();

void assertingVoid;
void notUndefined;
void notNumberReturning;
void notUppercase;
void notNumeric;
