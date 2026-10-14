import {expectTypeOf} from '../../../source/index.js';

// Explicit const assertions keep their native value inference.
expectTypeOf('literal' as const).toBe<'literal'>();
expectTypeOf(1 as const).toBe<1>();
expectTypeOf(true as const).toBe<true>();
expectTypeOf(['literal', 1] as const).toBe<readonly ['literal', 1]>();
expectTypeOf({value: 'literal'} as const).toBe<{readonly value: 'literal'}>();

// Satisfies validates a declaration while retaining its inferred discriminant.
const entry = {kind: 'text', value: 'value'} satisfies {kind: 'text' | 'number'; value: string | number};
expectTypeOf(entry).toBe<{kind: 'text'; value: string}>();
const tuple = ['value', 1] satisfies [string, number];
expectTypeOf(tuple).toBe<[string, number]>();

// Instantiation expressions supply concrete generic parameters before projection.
function identity<Value>(value: Value): Value {
	return value;
}
expectTypeOf(identity<string>).parameters.toBe<[value: string]>();
expectTypeOf(identity<string>).returns.toBe<string>();
function tupleIdentity<const Values extends readonly unknown[]>(...values: Values): Values {
	return values;
}
expectTypeOf(tupleIdentity<readonly ['value', 1]>).parameters.toBe<['value', 1]>();
expectTypeOf(tupleIdentity<readonly ['value', 1]>).returns.toBe<readonly ['value', 1]>();

// Async iterators and generators remain ordinary return types until explicitly projected.
function* generator(): Generator<string, number, boolean> {
	const sent = yield 'value';
	return sent ? 1 : 0;
}
expectTypeOf(generator).returns.toBe<Generator<string, number, boolean>>();
async function* asynchronousGenerator(): AsyncGenerator<string, number, boolean> {
	const sent = yield 'value';
	return sent ? 1 : 0;
}
expectTypeOf(asynchronousGenerator).returns.toBe<AsyncGenerator<string, number, boolean>>();
expectTypeOf(generator()).resolves.toBe<never>();
expectTypeOf(asynchronousGenerator()).resolves.toBe<never>();

// Thenable values inferred by satisfies agree with await.
const thenable = {
	then(resolve: (value: 'literal') => void): void {
		resolve('literal');
	},
} satisfies {then(resolve: (value: string) => void): void};
const awaited = await thenable;
expectTypeOf(awaited).toBe<'literal'>();
expectTypeOf(thenable).resolves.toBe<'literal'>();

// NoInfer changes inference, while identity and projections keep the contained type.
expectTypeOf<NoInfer<string>>().toBe<string>();
expectTypeOf<string>().toBe<NoInfer<string>>();
expectTypeOf<NoInfer<string>>().toBeAssignableTo<string>();
expectTypeOf<string>().toBeAssignableTo<NoInfer<string>>();
expectTypeOf<NoInfer<{value: string}>>().toBe<{value: string}>();
expectTypeOf<{value: string}>().toBe<NoInfer<{value: string}>>();
expectTypeOf<() => NoInfer<string>>().returns.toBe<string>();
expectTypeOf<(value: NoInfer<string>) => void>().parameters.toBe<[value: string]>();
expectTypeOf<NoInfer<Promise<string>>>().resolves.toBe<string>();
expectTypeOf<NoInfer<any>>().toBe<any>();
expectTypeOf<NoInfer<never>>().toBe<never>();
expectTypeOf<NoInfer<unknown>>().toBe<unknown>();
// @ts-expect-error Preventing inference cannot hide a genuinely different type.
expectTypeOf<NoInfer<string>>().toBe<number>();
// @ts-expect-error Preventing inference cannot make identical types pass negation.
expectTypeOf<string>().not.toBe<NoInfer<string>>();

function compare<Value>(value: Value, noInference: NoInfer<Value>): void {
	expectTypeOf(value).toBe<NoInfer<Value>>();
	expectTypeOf(noInference).toBe<Value>();
	expectTypeOf(value).toBeAssignableTo<NoInfer<Value>>();
	expectTypeOf(noInference).toBeAssignableTo<Value>();
}
compare<string>('value', 'other');

// Type queries retain the precise control-flow-narrowed type, including generic intersections.
function narrowGeneric<Value>(value: Value): void {
	if (typeof value === 'string') {
		type Narrowed = typeof value;
		expectTypeOf(value).toBe<Narrowed>();
		expectTypeOf(value).toBeAssignableTo<Narrowed>();
		expectTypeOf(value).toBe<Value & string>();
	}
	if (value !== undefined && value !== null) {
		type Narrowed = typeof value;
		expectTypeOf(value).toBe<Narrowed>();
		expectTypeOf(value).toBeAssignableTo<Narrowed>();
		expectTypeOf(value).toBe<NonNullable<Value>>();
	}
}

// Concrete union narrowing exposes the selected method through a local type alias.
type Handler = {kind: 'text'; run: (value: string) => string} | {kind: 'number'; run: (value: number) => number};
function inspectHandler(handler: Handler): void {
	if (handler.kind === 'text') {
		type Method = typeof handler.run;
		expectTypeOf(handler.run).toBe<Method>();
		expectTypeOf(handler.run).parameters.toBe<[value: string]>();
		expectTypeOf(handler.run).returns.toBe<string>();
	} else {
		expectTypeOf(handler.run).parameters.toBe<[value: number]>();
		expectTypeOf(handler.run).returns.toBe<number>();
	}
}

// Inherited generic properties retain their instantiated signature and tuple structure.
class Container<Value> {
	constructor(readonly value: Value, readonly transform: (value: Value) => Value) {
	}
	assertProperties(): void {
		type CurrentValue = typeof this.value;
		type CurrentMethod = typeof this.transform;
		expectTypeOf(this.value).toBe<CurrentValue>();
		expectTypeOf(this.value).toBeAssignableTo<CurrentValue>();
		expectTypeOf(this.transform).toBe<CurrentMethod>();
		expectTypeOf(this.transform).toBeAssignableTo<CurrentMethod>();
		expectTypeOf(this.transform).parameters.toBe<[value: Value]>();
		expectTypeOf(this.transform).returns.toBe<Value>();
	}
}
class TextContainer extends Container<string> {
	assertInherited(): void {
		expectTypeOf(this.value).toBe<string>();
		expectTypeOf(this.transform).toBe<(value: string) => string>();
		expectTypeOf(this.transform).parameters.toBe<[value: string]>();
		expectTypeOf(this.transform).returns.toBe<string>();
	}
}

// Mapped aliases for a generic callable remain equivalent to the property itself.
type Callbacks<Value> = {run: (value: Value) => Promise<Value>};
type CallbackCopy<Value> = {[Key in keyof Callbacks<Value>]: Callbacks<Value>[Key]};
function inspectCallbacks<Value>(callbacks: Callbacks<Value>): void {
	expectTypeOf(callbacks).toBe<CallbackCopy<Value>>();
	expectTypeOf(callbacks.run).toBe<CallbackCopy<Value>['run']>();
	expectTypeOf(callbacks.run).parameters.toBe<Parameters<Callbacks<Value>['run']>>();
	expectTypeOf(callbacks.run).returns.toBe<Promise<Value>>();
	expectTypeOf(callbacks.run).returns.resolves.toBe<Awaited<Value>>();
}
narrowGeneric('value');
inspectHandler({kind: 'number', run: value => value});
new TextContainer('value', value => value).assertProperties();
new TextContainer('value', value => value).assertInherited();
inspectCallbacks({run: async (value: string) => value});

// Interleaved construction signatures do not replace the last call signature.
interface CallableConstructor {
	(value: number): Promise<number>;
	new (value: boolean): Date;
	(value: string): Promise<string>;
	new (value: symbol): URL;
}
declare const callableConstructor: CallableConstructor;
const callResult: Promise<string> = callableConstructor('value');
const constructionResult: URL = new callableConstructor(Symbol());
expectTypeOf(callableConstructor).parameters.toBe<[value: string]>();
expectTypeOf(callableConstructor).returns.toBe<Promise<string>>();
expectTypeOf(callableConstructor).returns.resolves.toBe<string>();
void callResult;
void constructionResult;

// Every chained projection operates on the type produced by the previous one.
type Factory = (prefix: string) => (value: number, optional?: boolean) => Promise<string>;
expectTypeOf<Factory>().returns.parameters.toBe<[value: number, optional?: boolean]>();
expectTypeOf<Factory>().returns.returns.resolves.toBe<string>();
type MixedFactory = (() => Promise<string>) | (() => number) | ((value: string) => PromiseLike<number>) | Date;
expectTypeOf<MixedFactory>().parameters.toBe<[] | [value: string]>();
expectTypeOf<MixedFactory>().returns.toBe<Promise<string> | number | PromiseLike<number>>();
expectTypeOf<MixedFactory>().returns.resolves.toBe<string | number>();

// Explicit variance retains native assignment rules, including contravariant methods.
type Producer<out Value> = {make(): Value};
type Consumer<in Value> = {consume(value: Value): void};
type Transformer<in out Value> = {make(): Value; consume(value: Value): void};
declare const stringProducer: Producer<string>;
declare const unknownProducer: Producer<unknown>;
declare const stringConsumer: Consumer<string>;
declare const unknownConsumer: Consumer<unknown>;
declare const stringTransformer: Transformer<string>;
const producer: Producer<unknown> = stringProducer;
// @ts-expect-error An unknown-producing value cannot promise strings.
const invalidProducer: Producer<string> = unknownProducer;
expectTypeOf(stringProducer).toBeAssignableTo<Producer<unknown>>();
// @ts-expect-error The assertion must reject the same covariant assignment.
expectTypeOf(unknownProducer).toBeAssignableTo<Producer<string>>();
expectTypeOf(unknownProducer).not.toBeAssignableTo<Producer<string>>();
const consumer: Consumer<string> = unknownConsumer;
// @ts-expect-error Explicit contravariance applies even to method parameters.
const invalidConsumer: Consumer<unknown> = stringConsumer;
expectTypeOf(unknownConsumer).toBeAssignableTo<Consumer<string>>();
// @ts-expect-error The assertion follows the explicit variance annotation.
expectTypeOf(stringConsumer).toBeAssignableTo<Consumer<unknown>>();
expectTypeOf(stringConsumer).not.toBeAssignableTo<Consumer<unknown>>();
// @ts-expect-error An invariant type cannot widen its argument.
const invalidTransformer: Transformer<unknown> = stringTransformer;
// @ts-expect-error The assertion must also reject invariant widening.
expectTypeOf(stringTransformer).toBeAssignableTo<Transformer<unknown>>();
expectTypeOf(stringTransformer).not.toBeAssignableTo<Transformer<unknown>>();
void producer;
void invalidProducer;
void consumer;
void invalidConsumer;
void invalidTransformer;

// Explicit variance also matters when the generic argument has no value field.
type Phantom<out Value> = {tag: 'phantom'};
declare const stringPhantom: Phantom<string>;
// @ts-expect-error Covariance still rejects unrelated phantom type arguments.
const numberPhantom: Phantom<number> = stringPhantom;
// @ts-expect-error The assertion must retain the native phantom assignment rule.
expectTypeOf(stringPhantom).toBeAssignableTo<Phantom<number>>();
expectTypeOf(stringPhantom).not.toBeAssignableTo<Phantom<number>>();
void numberPhantom;

// Inferred predicates retain their complete signatures and native filter narrowing.
function isText(value: unknown) {
	return typeof value === 'string';
}
const nativePredicate: (value: unknown) => value is string = isText;
expectTypeOf(isText).toBe<(value: unknown) => value is string>();
expectTypeOf(isText).returns.toBe<boolean>();
expectTypeOf(isText).parameters.toBe<[value: unknown]>();
// @ts-expect-error The inferred predicate differs from a plain boolean signature.
expectTypeOf(isText).toBe<(value: unknown) => boolean>();
expectTypeOf(isText).not.toBe<(value: unknown) => boolean>();
const filtered = [1, 'value', null].filter(isText);
expectTypeOf(filtered).toBe<string[]>();

// Generic non-null predicates retain their relationship to the input type.
function isPresent<Value>(value: Value) {
	return value !== null && value !== undefined;
}
const nativePresence: <Value>(value: Value) => value is NonNullable<Value> = isPresent;
expectTypeOf(isPresent).toBe<<Value>(value: Value) => value is NonNullable<Value>>();
expectTypeOf(isPresent).returns.toBe<boolean>();
expectTypeOf(isPresent).parameters.toBe<[value: unknown]>();
const nonNullValues = ['value', undefined, null].filter(isPresent);
expectTypeOf(nonNullValues).toBe<string[]>();
void nativePredicate;
void nativePresence;

// Merged declarations retain generic defaults and their complete instance shape.
declare class Defaults<Value = string> {
	constructor(value?: Value);
	value: Value;
	read(): Value;
	transform<Result = number>(map: (value: Value) => Result): Defaults<Result>;
}
interface Defaults<Value = string> {
	readonly status: 'ready';
	optional?: Value;
}
const defaultInstance = new Defaults();
const numericInstance = new Defaults(1);
const nativeDefault: Defaults<string> = defaultInstance;
const nativeNumeric: Defaults<number> = numericInstance;
expectTypeOf(defaultInstance).toBe<Defaults<string>>();
expectTypeOf(numericInstance).toBe<Defaults<number>>();
expectTypeOf(defaultInstance.value).toBe<string>();
expectTypeOf(defaultInstance.status).toBe<'ready'>();
expectTypeOf(defaultInstance.optional).toBe<string | undefined>();
expectTypeOf(defaultInstance.read).returns.toBe<string>();
expectTypeOf(defaultInstance.transform).parameters.toBe<[map: (value: string) => unknown]>();
expectTypeOf(defaultInstance.transform).returns.toBe<Defaults<unknown>>();
expectTypeOf(defaultInstance.transform<boolean>).returns.toBe<Defaults<boolean>>();
expectTypeOf(defaultInstance.transform(value => value.length)).toBe<Defaults<number>>();
// @ts-expect-error The concrete instantiation has a numeric property.
const wrongDefault: Defaults<string> = numericInstance;
// @ts-expect-error The assertion rejects the same native property mismatch.
expectTypeOf(numericInstance).toBeAssignableTo<Defaults<string>>();
expectTypeOf(numericInstance).not.toBeAssignableTo<Defaults<string>>();

// Namespace merging adds properties without replacing a generic call signature.
declare function merged<Value = string>(value: Value): Promise<Value>;
declare namespace merged {
	const description: 'merged';
}
expectTypeOf(merged.description).toBe<'merged'>();
expectTypeOf(merged).parameters.toBe<[value: unknown]>();
expectTypeOf(merged).returns.toBe<Promise<unknown>>();
expectTypeOf(merged<string>).parameters.toBe<[value: string]>();
expectTypeOf(merged<string>).returns.resolves.toBe<string>();
expectTypeOf(merged(1)).resolves.toBe<number>();
expectTypeOf(merged).toBeAssignableTo<<Value>(value: Value) => Promise<Value>>();
void nativeDefault;
void nativeNumeric;
void wrongDefault;
