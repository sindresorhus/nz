import {expectTypeOf} from '../../../source/index.js';

// A name or declaration form does not change a type's complete structure.
interface NamedInterface {
	name: string;
}
type NamedAlias = {name: string};
class NamedClass {
	name = '';
}
type NamedMapped = {[Key in keyof NamedInterface]: NamedInterface[Key]};
expectTypeOf<NamedInterface>().toBe<NamedAlias>();
expectTypeOf<NamedAlias>().toBe<NamedInterface>();
expectTypeOf<NamedClass>().toBe<NamedAlias>();
expectTypeOf<NamedMapped>().toBe<NamedAlias>();

// Mapping a built-in type to readonly preserves its methods but changes their property modifiers.
// @ts-expect-error Readonly method properties differ from writable ones.
expectTypeOf<Date>().toBe<Readonly<Date>>();
// @ts-expect-error The modifier difference is symmetric.
expectTypeOf<Readonly<Date>>().toBe<Date>();
expectTypeOf<Date>().not.toBe<Readonly<Date>>();
expectTypeOf<Readonly<Date>>().not.toBe<Date>();

// Recursive interface and alias declarations retain the same complete structure.
type RecursiveAlias = {value: string; next?: RecursiveAlias};
interface RecursiveInterface {
	value: string;
	next?: RecursiveInterface;
}
expectTypeOf<RecursiveAlias>().toBe<RecursiveInterface>();
expectTypeOf<RecursiveInterface>().toBe<RecursiveAlias>();
// @ts-expect-error Identical recursive types cannot satisfy a negated equality assertion.
expectTypeOf<RecursiveAlias>().not.toBe<RecursiveInterface>();
// @ts-expect-error The complement remains the same when the pair is reversed.
expectTypeOf<RecursiveInterface>().not.toBe<RecursiveAlias>();

// A modifier differs at every recursion depth and equality remains symmetric.
type RecursiveReadonly = {readonly value: string; next?: RecursiveReadonly};
// @ts-expect-error Readonly must still match on a recursive shape.
expectTypeOf<RecursiveAlias>().toBe<RecursiveReadonly>();
// @ts-expect-error Reversing the recursive pair still detects the modifier.
expectTypeOf<RecursiveReadonly>().toBe<RecursiveAlias>();
expectTypeOf<RecursiveAlias>().not.toBe<RecursiveReadonly>();
expectTypeOf<RecursiveReadonly>().not.toBe<RecursiveAlias>();

// Mutually recursive and directly recursive declarations represent the same structure.
type MutualFirst = {value: string; next?: MutualSecond};
type MutualSecond = {value: string; next?: MutualFirst};
expectTypeOf<MutualFirst>().toBe<RecursiveAlias>();
expectTypeOf<RecursiveAlias>().toBe<MutualFirst>();

// Recursive callables keep properties and generic argument relationships.
type RecursiveGeneric = {<Value>(value: Value): RecursiveGeneric; value: string};
interface RecursiveGenericInterface {
	<Value>(value: Value): RecursiveGenericInterface;
	value: string;
}
expectTypeOf<RecursiveGeneric>().toBe<RecursiveGenericInterface>();
expectTypeOf<RecursiveGenericInterface>().toBe<RecursiveGeneric>();
// @ts-expect-error Callables that agree still reject a negated assertion.
expectTypeOf<RecursiveGeneric>().not.toBe<RecursiveGenericInterface>();

// Class accessors retain readonly metadata while setters make the property writable.
class GetterOnly {
	get value(): number {
		return 1;
	}
}
class WritableField {
	value: number = 1;
}
class GetterAndSetter {
	get value(): number {
		return 1;
	}
	set value(value: number) {
		void value;
	}
}
expectTypeOf<GetterOnly>().toBe<{readonly value: number}>();
expectTypeOf<{readonly value: number}>().toBe<GetterOnly>();
expectTypeOf<GetterAndSetter>().toBe<WritableField>();
expectTypeOf<WritableField>().toBe<GetterAndSetter>();
// @ts-expect-error A getter-only property differs from a writable field.
expectTypeOf<GetterOnly>().toBe<WritableField>();
// @ts-expect-error The readonly distinction is symmetric.
expectTypeOf<WritableField>().toBe<GetterOnly>();
expectTypeOf<GetterOnly>().not.toBe<WritableField>();
expectTypeOf<WritableField>().not.toBe<GetterOnly>();
// @ts-expect-error An accessor with a setter is not readonly.
expectTypeOf<GetterAndSetter>().toBe<{readonly value: number}>();
// @ts-expect-error Reversing the property and accessor retains the difference.
expectTypeOf<{readonly value: number}>().toBe<GetterAndSetter>();
expectTypeOf<GetterAndSetter>().not.toBe<{readonly value: number}>();
expectTypeOf<{readonly value: number}>().not.toBe<GetterAndSetter>();

// Direct writes enforce readonly even though native object assignment ignores it.
declare const getter: GetterOnly;
declare const writable: WritableField;
declare const accessor: GetterAndSetter;
// @ts-expect-error Native direct writes to getter-only accessors are rejected.
getter.value = 2;
writable.value = 2;
accessor.value = 2;
const nativeMutable: {value: number} = getter;
const nativeReadonly: {readonly value: number} = accessor;
expectTypeOf(getter).toBeAssignableTo<typeof nativeMutable>();
expectTypeOf(accessor).toBeAssignableTo<typeof nativeReadonly>();
void nativeMutable;
void nativeReadonly;

// Opaque identifiers retain their unique-symbol brand and readonly metadata.
declare const identifierBrand: unique symbol;
type UserIdentifier = string & {readonly [identifierBrand]: 'user'};
type OrderIdentifier = string & {readonly [identifierBrand]: 'order'};
declare const userIdentifier: UserIdentifier;
declare const orderIdentifier: OrderIdentifier;
const nativeString: string = userIdentifier;
// @ts-expect-error A plain string lacks the opaque identifier brand.
const nativeMissingBrand: UserIdentifier = 'value';
// @ts-expect-error Identifiers with different brands are not interchangeable.
const nativeWrongBrand: UserIdentifier = orderIdentifier;
expectTypeOf(userIdentifier).toBe<UserIdentifier>();
expectTypeOf<UserIdentifier>().not.toBe<OrderIdentifier>();
expectTypeOf(userIdentifier).toBeAssignableTo<string>();
// @ts-expect-error The assertion preserves native brand requirements.
expectTypeOf<string>().toBeAssignableTo<UserIdentifier>();
expectTypeOf<string>().not.toBeAssignableTo<UserIdentifier>();
// @ts-expect-error Different brands remain different under assignability.
expectTypeOf(orderIdentifier).toBeAssignableTo<UserIdentifier>();
expectTypeOf(orderIdentifier).not.toBeAssignableTo<UserIdentifier>();
// @ts-expect-error Readonly metadata in the symbol brand must match.
expectTypeOf<UserIdentifier>().toBe<string & {[identifierBrand]: 'user'}>();

// Concrete utility compositions preserve the opaque type and property modifiers.
expectTypeOf<NoInfer<UserIdentifier>>().toBe<UserIdentifier>();
expectTypeOf<Extract<UserIdentifier | OrderIdentifier, UserIdentifier>>().toBe<UserIdentifier>();
expectTypeOf<Exclude<UserIdentifier | OrderIdentifier, UserIdentifier>>().toBe<OrderIdentifier>();
type RecordShape = {readonly id: UserIdentifier; name?: string; temporary: number};
type Stored = Readonly<Required<Pick<RecordShape, 'id' | 'name'>>>;
expectTypeOf<Stored>().toBe<{readonly id: UserIdentifier; readonly name: string}>();
expectTypeOf<Omit<RecordShape, 'temporary'>>().toBe<{readonly id: UserIdentifier; name?: string}>();
void nativeString;
void nativeMissingBrand;
void nativeWrongBrand;
