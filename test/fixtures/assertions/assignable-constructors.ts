import {expectTypeOf} from '../../../source/index.js';

declare const abstractConstructor: abstract new () => Date;
declare const concreteConstructor: new () => Date;

// An abstract constructor cannot be used where a constructible value is required.
// @ts-expect-error TypeScript rejects the same assignment.
const cannotInstantiate: new () => Date = abstractConstructor;
// @ts-expect-error The assertion must reject it too.
expectTypeOf(abstractConstructor).toBeAssignableTo<new () => Date>();
expectTypeOf(abstractConstructor).not.toBeAssignableTo<new () => Date>();

expectTypeOf(concreteConstructor).toBeAssignableTo<abstract new () => Date>();
expectTypeOf(abstractConstructor).toBeAssignableTo<abstract new () => Date>();
expectTypeOf(concreteConstructor).toBeAssignableTo<new () => Date>();

// Equality intentionally treats these constructor types as identical.
expectTypeOf(abstractConstructor).toBe<new () => Date>();
expectTypeOf(concreteConstructor).toBe<abstract new () => Date>();

// Constructor assignability must also hold inside compound types.
// @ts-expect-error An abstract constructor property cannot satisfy a concrete constructor property.
expectTypeOf<{constructor: abstract new () => Date}>().toBeAssignableTo<{constructor: new () => Date}>();
expectTypeOf<{constructor: abstract new () => Date}>().not.toBeAssignableTo<{constructor: new () => Date}>();
expectTypeOf<{constructor: new () => Date}>().toBeAssignableTo<{constructor: abstract new () => Date}>();
// @ts-expect-error An abstract tuple member cannot satisfy a concrete constructor member.
expectTypeOf<[abstract new () => Date]>().toBeAssignableTo<[new () => Date]>();
expectTypeOf<[abstract new () => Date]>().not.toBeAssignableTo<[new () => Date]>();
// @ts-expect-error Every union member must be assignable, including its constructor.
expectTypeOf<(abstract new () => Date) | string>().toBeAssignableTo<(new () => Date) | string>();
expectTypeOf<(abstract new () => Date) | string>().not.toBeAssignableTo<(new () => Date) | string>();

// Generic constructors preserve abstractness without losing their type relationship.
type AbstractGeneric = abstract new <Type>(value: Type) => {value: Type};
type ConcreteGeneric = new <Type>(value: Type) => {value: Type};
// @ts-expect-error A generic abstract constructor cannot be instantiated either.
expectTypeOf<AbstractGeneric>().toBeAssignableTo<ConcreteGeneric>();
expectTypeOf<AbstractGeneric>().not.toBeAssignableTo<ConcreteGeneric>();
expectTypeOf<ConcreteGeneric>().toBeAssignableTo<AbstractGeneric>();
expectTypeOf<AbstractGeneric>().toBeAssignableTo<AbstractGeneric>();

// Each overload remains callable after assignment to an abstract constructor type.
type ConcreteOverloaded = (new (value: string) => Date) & (new (value: number) => Date);
type AbstractOverloaded = (abstract new (value: string) => Date) & (abstract new (value: number) => Date);
// @ts-expect-error An overloaded abstract constructor cannot satisfy concrete overloads.
expectTypeOf<AbstractOverloaded>().toBeAssignableTo<ConcreteOverloaded>();
expectTypeOf<AbstractOverloaded>().not.toBeAssignableTo<ConcreteOverloaded>();
expectTypeOf<ConcreteOverloaded>().toBeAssignableTo<AbstractOverloaded>();

// Identical unresolved type parameters still pass before checking for any or never.
function assertGeneric<Type>(value: Type): void {
	expectTypeOf(value).toBeAssignableTo<Type>();
}

class Generic<Type> {
	assertSelf(value: Type): void {
		expectTypeOf(value).toBeAssignableTo<Type>();
		expectTypeOf(this).toBeAssignableTo<this>();
	}
}

assertGeneric('value');
new Generic<string>().assertSelf('value');

void cannotInstantiate;
