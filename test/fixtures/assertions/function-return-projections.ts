import {expectTypeOf} from '../../../source/index.js';

declare const emptyArguments: <Values extends never[]>(...values: Values) => Values;

// The function is callable: an empty argument list returns an empty tuple.
expectTypeOf(emptyArguments()).toBe<[]>();
expectTypeOf(emptyArguments).parameters.toBe<never[]>();
expectTypeOf(emptyArguments).returns.toBe<never[]>();
expectTypeOf(emptyArguments).returns.not.toBe<never>();
// @ts-expect-error A callable function's array return is not never.
expectTypeOf(emptyArguments).returns.toBe<never>();

// The recognition check must not depend on whether an argument can be supplied.
expectTypeOf<(...values: never) => string>().returns.toBe<string>();
expectTypeOf<(...values: never) => string>().parameters.toBe<never>();
expectTypeOf<<Value extends never>(value: Value) => string>().returns.toBe<string>();
expectTypeOf<<Value extends never>(value: Value) => string>().parameters.toBe<[value: never]>();
expectTypeOf<(...values: never[]) => never>().returns.toBe<never>();

// Constrained generics keep their return constraints while unconstrained ones become unknown.
expectTypeOf<<Value>(value: Value) => Value>().returns.toBe<unknown>();
expectTypeOf<<Values extends []>(...values: Values) => Values>().returns.toBe<[]>();
expectTypeOf<<Values extends [string]>(...values: Values) => Values>().returns.toBe<[string]>();
expectTypeOf<<Values extends readonly unknown[]>(...values: Values) => Values>().returns.toBe<readonly unknown[]>();
expectTypeOf<<Values extends number[]>(...values: Values) => Values>().returns.toBe<number[]>();
expectTypeOf<(this: never, value: string) => string>().returns.toBe<string>();

// The last overload can itself have constrained rest parameters.
declare function overloaded(value: string): string;
declare function overloaded<Values extends never[]>(...values: Values): Values;
expectTypeOf(overloaded()).toBe<[]>();
expectTypeOf(overloaded).returns.toBe<never[]>();
expectTypeOf(overloaded).parameters.toBe<never[]>();

// Unions combine function return types and exclude nonfunctions.
expectTypeOf<typeof emptyArguments | (() => string) | undefined>().returns.toBe<never[] | string>();
expectTypeOf<((...values: never) => string) | ((value: number) => never) | number>().returns.toBe<string>();
expectTypeOf<(() => any) | (() => never)>().returns.toBe<any>();
expectTypeOf<(() => unknown) | (() => never)>().returns.toBe<unknown>();

// Top-level special types and constructor-only signatures retain their documented projections.
expectTypeOf<any>().returns.toBe<unknown>();
expectTypeOf<unknown>().returns.toBe<never>();
expectTypeOf<never>().returns.toBe<never>();
expectTypeOf<abstract new () => Date>().returns.toBe<never>();
expectTypeOf<new () => Date>().returns.toBe<never>();

// The `this` parameter is compared for a function with constrained rest parameters too.
declare const withThisAndRest: <Values extends never[]>(this: Date, ...values: Values) => void;
expectTypeOf(withThisAndRest).not.toBe<<Values extends never[]>(...values: Values) => void>();
// @ts-expect-error The `this` parameter differs.
expectTypeOf(withThisAndRest).toBe<<Values extends never[]>(...values: Values) => void>();
