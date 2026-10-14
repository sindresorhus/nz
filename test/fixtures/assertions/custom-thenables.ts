import {expectTypeOf} from '../../../source/index.js';

const thenable = {
	then(onfulfilled: (value: string) => void): void {
		onfulfilled('value');
	},
};

// Both await and Awaited unwrap a thenable whose then method returns void.
const resolved = await thenable;
expectTypeOf(resolved).toBe<string>();
expectTypeOf<Awaited<typeof thenable>>().toBe<string>();
expectTypeOf(thenable).resolves.toBe<string>();
expectTypeOf(thenable).resolves.not.toBe<never>();
// @ts-expect-error A string thenable cannot resolve to never.
expectTypeOf(thenable).resolves.toBe<never>();

// Only thenable members count, and nested promises and thenables unwrap recursively.
expectTypeOf<typeof thenable | number | undefined>().resolves.toBe<string>();
expectTypeOf<typeof thenable | Promise<number> | undefined>().resolves.toBe<string | number>();
expectTypeOf<Promise<typeof thenable>>().resolves.toBe<string>();
expectTypeOf<{then(onfulfilled: (value: typeof thenable) => void): void}>().resolves.toBe<string>();

// A then function can be a property, a generic method, or a property of a callable object.
expectTypeOf<{then: (onfulfilled: (value: number) => void) => void}>().resolves.toBe<number>();
expectTypeOf<{then<Value extends string>(onfulfilled: (value: Value) => void): void}>().resolves.toBe<string>();
const callableThenable = Object.assign(() => {}, thenable);
expectTypeOf(callableThenable).resolves.toBe<string>();

// Promise and PromiseLike keep their behavior, including top-level special types.
expectTypeOf<Promise<string>>().resolves.toBe<string>();
expectTypeOf<PromiseLike<number>>().resolves.toBe<number>();
expectTypeOf<PromiseLike<PromiseLike<string>>>().resolves.toBe<string>();
expectTypeOf<any>().resolves.toBe<any>();
expectTypeOf<never>().resolves.toBe<never>();

// Ordinary values, including objects with a noncallable then property, are not thenables.
expectTypeOf<unknown>().resolves.toBe<never>();
expectTypeOf<number>().resolves.toBe<never>();
expectTypeOf<() => string>().resolves.toBe<never>();
expectTypeOf<{then: string}>().resolves.toBe<never>();
expectTypeOf<{then: undefined}>().resolves.toBe<never>();

// Generic callers keep the same native Awaited projection for promises and custom thenables.
function assertPromise<Type>(value: Promise<Type>): void {
	expectTypeOf(value).resolves.toBe<Awaited<Type>>();
}
function assertPromiseLike<Type>(value: PromiseLike<Type>): void {
	expectTypeOf(value).resolves.toBe<Awaited<Type>>();
}
function assertThenable<Type>(value: {then(onfulfilled: (value: Type) => void): void}): void {
	expectTypeOf(value).resolves.toBe<Awaited<Type>>();
}
function assertPromiseUnion<Type>(value: Promise<Type> | undefined): void {
	expectTypeOf(value).resolves.toBe<Awaited<Type>>();
}
assertPromise(Promise.resolve('value'));
assertPromiseLike(Promise.resolve('value'));
assertThenable(thenable);
assertPromiseUnion(Promise.resolve('value'));

// Accessor-backed then methods retain their callable type and native await result.
class GetterThenable {
	get then() {
		return (resolve: (value: 'literal') => void): void => {
			resolve('literal');
		};
	}
}
const getterThenable = new GetterThenable();
const getterAwaited = await getterThenable;
const nativeGetterValue: 'literal' = getterAwaited;
expectTypeOf(getterThenable).resolves.toBe<'literal'>();
expectTypeOf(getterAwaited).toBe<'literal'>();
expectTypeOf(getterThenable.then).returns.toBe<void>();
expectTypeOf(getterThenable.then).parameters.toBe<[resolve: (value: 'literal') => void]>();
// @ts-expect-error A string-valued thenable cannot resolve to a number.
expectTypeOf(getterThenable).resolves.toBe<number>();

// A thenable resolving to a function permits projections of that function too.
function operation(value: number): Promise<string> {
	return Promise.resolve(String(value));
}
const operationThenable = {
	then(resolve: (value: typeof operation) => void): void {
		resolve(operation);
	},
};
const awaitedOperation = await operationThenable;
const nativeOperation: typeof operation = awaitedOperation;
expectTypeOf(operationThenable).resolves.toBe<typeof operation>();
expectTypeOf(operationThenable).resolves.parameters.toBe<[value: number]>();
expectTypeOf(operationThenable).resolves.returns.resolves.toBe<string>();
expectTypeOf(awaitedOperation(1)).resolves.toBe<string>();
void nativeGetterValue;
void nativeOperation;

// Awaited infers the last then overload, while native await combines its callbacks.
class CompatibleThenable {
	then(resolve: (value: 'literal') => unknown): void;
	then(resolve: (value: string) => unknown): void;
	then(resolve: (value: 'literal') => unknown): void {
		resolve('literal');
	}
}
const compatible = new CompatibleThenable();
const compatibleAwaited = await compatible;
const nativeLiteral: 'literal' = compatibleAwaited;
expectTypeOf(compatibleAwaited).toBe<'literal'>();
expectTypeOf<Awaited<CompatibleThenable>>().toBe<string>();
expectTypeOf(compatible).resolves.toBe<string>();
// @ts-expect-error The last then overload resolves to string, despite native await's narrower inference.
expectTypeOf(compatible).resolves.toBe<'literal'>();
void nativeLiteral;
