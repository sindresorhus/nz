import {expectTypeOf} from '../../../source/index.js';

// Equality must inspect modifiers and special types inside the structure too.
// @ts-expect-error Nested readonly properties differ.
expectTypeOf<{nested: {readonly field: number}}>().toBe<{nested: {field: number}}>();
// @ts-expect-error An optional nested property differs from a required property that can be undefined.
expectTypeOf<{nested: {field?: number}}>().toBe<{nested: {field: number | undefined}}>();
// @ts-expect-error An any property differs from an unknown property.
expectTypeOf<{value: any}>().toBe<{value: unknown}>();
// @ts-expect-error A never property differs from an unknown property.
expectTypeOf<{value: never}>().toBe<{value: unknown}>();
// @ts-expect-error An any return type differs from an unknown return type.
expectTypeOf<() => any>().toBe<() => unknown>();
// @ts-expect-error An any parameter differs from an unknown parameter.
expectTypeOf<(value: any) => void>().toBe<(value: unknown) => void>();
// @ts-expect-error An optional parameter differs from a required parameter that can be undefined.
expectTypeOf<(value?: string) => void>().toBe<(value: string | undefined) => void>();
// @ts-expect-error A type predicate differs from a boolean return type.
expectTypeOf<(value: unknown) => value is string>().toBe<(value: unknown) => boolean>();
// @ts-expect-error An assertion signature differs from a void return type.
expectTypeOf<(value: unknown) => asserts value is string>().toBe<(value: unknown) => void>();

// Index signatures, tuples, and callable objects also retain their modifiers.
// @ts-expect-error A readonly string index signature differs from a mutable one.
expectTypeOf<{readonly [key: string]: number}>().toBe<{[key: string]: number}>();
// @ts-expect-error A readonly number index signature differs from a mutable one.
expectTypeOf<{readonly [key: number]: number}>().toBe<{[key: number]: number}>();
// @ts-expect-error A readonly symbol index signature differs from a mutable one.
expectTypeOf<{readonly [key: symbol]: number}>().toBe<{[key: symbol]: number}>();
// @ts-expect-error A readonly array differs from a mutable array.
expectTypeOf<readonly string[]>().toBe<string[]>();
// @ts-expect-error A readonly tuple differs from a mutable tuple.
expectTypeOf<readonly [string]>().toBe<[string]>();
// @ts-expect-error An any array element differs from an unknown element.
expectTypeOf<any[]>().toBe<unknown[]>();
// @ts-expect-error An any tuple element differs from an unknown element.
expectTypeOf<[any]>().toBe<[unknown]>();
// @ts-expect-error Callable properties must match as well as the signature.
expectTypeOf<{(): void; value: any}>().toBe<{(): void; value: unknown}>();
// @ts-expect-error Readonly properties on callable objects must match.
expectTypeOf<{(): void; readonly value: string}>().toBe<{(): void; value: string}>();
// @ts-expect-error Readonly properties on constructors must match.
expectTypeOf<{new(): Date; readonly value: string}>().toBe<{new(): Date; value: string}>();
// @ts-expect-error Template index signatures retain readonly too.
expectTypeOf<{readonly [key: `data-${string}`]: number}>().toBe<{[key: `data-${string}`]: number}>();
// @ts-expect-error A getter is a readonly property.
expectTypeOf<{get value(): string}>().toBe<{value: string}>();
// @ts-expect-error An optional tuple item differs from a required item that can be undefined.
expectTypeOf<[number?]>().toBe<[number | undefined]>();

// Equality checks every overload and nested generic signature.
// @ts-expect-error The first overload differs even though the last one matches.
expectTypeOf<{(value: string): any; (value: number): string}>().toBe<{(value: string): unknown; (value: number): string}>();
// @ts-expect-error Generic constraints must match.
expectTypeOf<<Type extends string>(value: Type) => Type>().toBe<<Type>(value: Type) => Type>();
// @ts-expect-error A generic property must retain its return type relationship.
expectTypeOf<{factory: <Type>(value: Type) => Type}>().toBe<{factory: <Type>(value: Type) => string}>();

// The this check must work with rest parameters and types that bypass constraints.
// @ts-expect-error A this parameter still matters with a required rest tuple.
expectTypeOf<(this: Date, ...values: [string, number]) => void>().toBe<(...values: [string, number]) => void>();
// @ts-expect-error An any this parameter differs from no this parameter.
expectTypeOf<(this: any) => void>().toBe<() => void>();
// @ts-expect-error A null this parameter differs from no this parameter.
expectTypeOf<(this: null) => void>().toBe<() => void>();
// @ts-expect-error A never this parameter differs from no this parameter.
expectTypeOf<(this: never) => void>().toBe<() => void>();
expectTypeOf<(this: Date, ...values: [string, number]) => void>().not.toBe<(...values: [string, number]) => void>();
expectTypeOf<((this: Date) => void) | ((this: URL) => void)>().not.toBe<((this: Date) => void) | ((this: Set<string>) => void)>();

// A union is assignable only when every member is, also for the negated assertion.
expectTypeOf<string | number>().not.toBeAssignableTo<string>();
expectTypeOf<string | number>().toBeAssignableTo<string | number | boolean>();
// @ts-expect-error Every member of the union is assignable to the wider type.
expectTypeOf<string | number>().not.toBeAssignableTo<string | number | boolean>();
expectTypeOf<never>().not.toBeAssignableTo<unknown>();
expectTypeOf<any>().not.toBeAssignableTo<unknown>();
// @ts-expect-error An accidental never cannot pass an unknown assertion.
expectTypeOf<never>().toBeAssignableTo<unknown>();
// @ts-expect-error An accidental any cannot pass an unknown assertion.
expectTypeOf<any>().toBeAssignableTo<unknown>();
// @ts-expect-error Never is assignable to itself.
expectTypeOf<never>().not.toBeAssignableTo<never>();
// @ts-expect-error Any is assignable to itself.
expectTypeOf<any>().not.toBeAssignableTo<any>();
expectTypeOf<never>().toBeAssignableTo();

// Function projections filter non-functions in unions and infer constrained generics.
expectTypeOf<(() => string) | ((value: number) => boolean) | undefined>().returns.toBe<string | boolean>();
expectTypeOf<(() => string) | ((value: number) => boolean) | undefined>().parameters.toBe<[] | [value: number]>();
expectTypeOf<<Type extends string>(value: Type) => Type>().returns.toBe<string>();
expectTypeOf<<Type extends string>(value: Type) => Type>().parameters.toBe<[value: string]>();
expectTypeOf<never>().parameters.toBe<never>();
expectTypeOf<never>().returns.toBe<never>();
expectTypeOf<new () => Date>().returns.toBe<never>();
expectTypeOf<new () => Date>().parameters.toBe<never>();

// Promise projections unwrap nested thenables and filter non-promises in unions.
expectTypeOf<PromiseLike<PromiseLike<string>>>().resolves.toBe<string>();
expectTypeOf<PromiseLike<string> | Promise<number> | undefined | number>().resolves.toBe<string | number>();
expectTypeOf<() => PromiseLike<string>>().returns.resolves.toBe<string>();
expectTypeOf<unknown>().resolves.toBe<never>();
expectTypeOf<never>().resolves.toBe<never>();
expectTypeOf<Promise<never>>().resolves.toBe<never>();
