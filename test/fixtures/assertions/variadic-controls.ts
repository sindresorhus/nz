import {expectTypeOf} from '../../../source/index.js';

// Generic tuple constraints retain their complete rest shapes.
type GenericTuple = <Arguments extends [name: string, ...counts: number[]]>(...arguments_: Arguments) => Arguments;
expectTypeOf<GenericTuple>().parameters.toBe<[name: string, ...counts: number[]]>();
expectTypeOf<GenericTuple>().returns.toBe<[name: string, ...counts: number[]]>();
type GenericReadonlyTuple = <Arguments extends readonly [name: string, count?: number]>(...arguments_: Arguments) => Arguments;
expectTypeOf<GenericReadonlyTuple>().parameters.toBe<[name: string, count?: number]>();
expectTypeOf<GenericReadonlyTuple>().returns.toBe<readonly [name: string, count?: number]>();
type GenericEmpty = <Arguments extends readonly []>(...arguments_: Arguments) => Arguments;
expectTypeOf<GenericEmpty>().parameters.toBe<[]>();
expectTypeOf<GenericEmpty>().returns.toBe<readonly []>();
type GenericBottom = <Argument extends never>(argument: Argument) => Argument;
expectTypeOf<GenericBottom>().parameters.toBe<[argument: never]>();
expectTypeOf<GenericBottom>().returns.toBe<never>();
type GenericPrefixed = <Arguments extends unknown[]>(first: string, ...arguments_: Arguments) => [string, ...Arguments];
expectTypeOf<GenericPrefixed>().parameters.toBe<[first: string, ...arguments_: unknown[]]>();
expectTypeOf<GenericPrefixed>().returns.toBe<[string, ...unknown[]]>();
type TupleAlternatives = (...arguments_: [kind: 'string', value: string] | [kind: 'number', value: number]) => string | number;
expectTypeOf<TupleAlternatives>().parameters.toBe<[kind: 'string', value: string] | [kind: 'number', value: number]>();
expectTypeOf<GenericTuple | GenericBottom | number>().parameters.toBe<Parameters<GenericTuple> | Parameters<GenericBottom>>();
expectTypeOf<GenericTuple | GenericBottom | number>().returns.toBe<[name: string, ...counts: number[]]>();

// Callback constraints, optional callbacks, rest tuples, and overloads follow Awaited.
type ConstrainedThenable = {then<Callback extends (value: string) => unknown>(resolve: Callback): void};
type GenericValueThenable = {then<Value extends string>(resolve: (value: Value) => unknown): void};
type RestThenable = {then(...arguments_: [resolve: (value: number) => unknown, reject?: (error: Error) => unknown]): void};
type OptionalThenable = {then(resolve?: ((value: boolean) => unknown) | null): void};
type OverloadedThenable = {then(resolve: (value: number) => unknown): void; then(resolve: (value: string) => unknown): void};
expectTypeOf<ConstrainedThenable>().resolves.toBe<string>();
expectTypeOf<GenericValueThenable>().resolves.toBe<string>();
expectTypeOf<RestThenable>().resolves.toBe<number>();
expectTypeOf<OptionalThenable>().resolves.toBe<boolean>();
expectTypeOf<OverloadedThenable>().resolves.toBe<string>();
expectTypeOf<ConstrainedThenable | RestThenable | Date>().resolves.toBe<string | number>();
expectTypeOf<{then: (...arguments_: never[]) => Promise<string>}>().resolves.toBe<never>();

// Nested any and never retain normal assignability, as do callback parameters.
type Stored<Value> = {value: Value};
expectTypeOf<Stored<never>>().toBeAssignableTo<Stored<string>>();
expectTypeOf<Stored<any>>().toBeAssignableTo<Stored<string>>();
expectTypeOf<{readonly [key: string]: never}>().toBeAssignableTo<{[key: string]: string}>();
expectTypeOf<(value: unknown) => string>().toBeAssignableTo<(value: string) => unknown>();
// @ts-expect-error A callback requiring string cannot handle an unknown argument.
expectTypeOf<(value: string) => unknown>().toBeAssignableTo<(value: unknown) => unknown>();
expectTypeOf<(value: string) => unknown>().not.toBeAssignableTo<(value: unknown) => unknown>();
