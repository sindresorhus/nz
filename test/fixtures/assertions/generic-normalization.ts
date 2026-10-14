import {expectTypeOf} from '../../../source/index.js';
function assertUnion<Type>(value: Type | string): void {
	expectTypeOf(value).toBe<Type | string>();
	expectTypeOf(value).toBeAssignableTo<Type | string>();
}
function assertConditional<Type>(value: Type extends string ? Type : never): void {
	expectTypeOf(value).toBe<Type extends string ? Type : never>();
	expectTypeOf(value).toBeAssignableTo<Type extends string ? Type : never>();
}
function assertTuple<Type>(value: readonly [Type?, ...Type[]]): void {
	expectTypeOf(value).toBe<readonly [Type?, ...Type[]]>();
	expectTypeOf(value).toBeAssignableTo<readonly [Type?, ...Type[]]>();
}
function assertNested<Type>(value: {readonly property?: Type}): void {
	expectTypeOf(value).toBe<{readonly property?: Type}>();
	expectTypeOf(value).toBeAssignableTo<{readonly property?: Type}>();
}
function assertIntersection<Type>(value: Type & {property: string}): void {
	expectTypeOf(value).toBe<Type & {property: string}>();
	expectTypeOf(value).toBeAssignableTo<Type & {property: string}>();
}
function assertIndexed<Type, Key extends keyof Type>(value: Type[Key]): void {
	expectTypeOf(value).toBe<Type[Key]>();
	expectTypeOf(value).toBeAssignableTo<Type[Key]>();
}
assertUnion(1);
assertConditional('value');
assertTuple([1]);
assertNested({property: 1});
assertIntersection({property: 'value'});
assertIndexed<{property: number}, 'property'>(1);

// TypeScript normalizes impossible discriminants to never and branded any to any.
type Impossible = {tag: 'a'} & {tag: 'b'};
type ImpossibleBoolean = {tag: true} & {tag: false};
type ImpossiblePrimitive = string & number;
type AnyIntersection = any & {readonly brand: 'value'};
type AnyUnion = any | {readonly brand: 'value'};
expectTypeOf<Impossible>().toBe<never>();
expectTypeOf<ImpossibleBoolean>().toBe<never>();
expectTypeOf<ImpossiblePrimitive>().toBe<never>();
expectTypeOf<Impossible>().toBeAssignableTo<never>();
expectTypeOf<Impossible>().not.toBeAssignableTo<unknown>();
expectTypeOf<Impossible>().returns.toBe<never>();
expectTypeOf<Impossible>().parameters.toBe<never>();
expectTypeOf<Impossible>().resolves.toBe<never>();
expectTypeOf<AnyIntersection>().toBe<any>();
expectTypeOf<AnyUnion>().toBe<any>();
expectTypeOf<AnyIntersection>().toBeAssignableTo<any>();
expectTypeOf<AnyIntersection>().not.toBeAssignableTo<unknown>();
expectTypeOf<AnyIntersection>().returns.toBe<unknown>();
expectTypeOf<AnyIntersection>().parameters.toBe<unknown[]>();
expectTypeOf<AnyIntersection>().resolves.toBe<any>();
// @ts-expect-error An impossible intersection is still accidental never.
expectTypeOf<Impossible>().toBeAssignableTo<string>();
// @ts-expect-error A branded any intersection is still accidental any.
expectTypeOf<AnyIntersection>().toBeAssignableTo<string>();
