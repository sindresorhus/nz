import {expectTypeOf} from '../../../source/index.js';

// Nullable expected types must not bypass an assertion's failure constraint.
// @ts-expect-error Number is not null, even when strictNullChecks is disabled.
expectTypeOf<number>().toBe<null>();
// @ts-expect-error Number is not undefined.
expectTypeOf<number>().toBe<undefined>();
// @ts-expect-error Any is only identical to itself.
expectTypeOf<any>().toBe<null>();
// @ts-expect-error Never is only identical to itself.
expectTypeOf<never>().toBe<undefined>();
// @ts-expect-error A negated assertion must reject identical null types.
expectTypeOf<null>().not.toBe<null>();
// @ts-expect-error A negated assertion must reject identical undefined types.
expectTypeOf<undefined>().not.toBe<undefined>();
// @ts-expect-error Number cannot be assigned to an explicitly null type.
expectTypeOf<number>().toBeAssignableTo<null>();
// @ts-expect-error Any is only assignable to itself in this API.
expectTypeOf<any>().toBeAssignableTo<undefined>();
// @ts-expect-error Null is assignable to itself.
expectTypeOf<null>().not.toBeAssignableTo<null>();
// @ts-expect-error Undefined is assignable to itself.
expectTypeOf<undefined>().not.toBeAssignableTo<undefined>();

// The native assignment proves null remains distinct from number in both configurations.
// @ts-expect-error Only null can be assigned to this type.
const onlyNull: null = 1;
void onlyNull;

// Matching and genuinely different nullable assertions retain their behavior.
expectTypeOf<null>().toBe<null>();
expectTypeOf<undefined>().toBe<undefined>();
expectTypeOf<null | undefined>().toBe<null | undefined>();
expectTypeOf<null>().toBeAssignableTo<null>();
expectTypeOf<undefined>().toBeAssignableTo<undefined>();
expectTypeOf<number>().not.toBe<null>();
expectTypeOf<number>().not.toBe<undefined>();
expectTypeOf<number>().not.toBeAssignableTo<null>();
expectTypeOf<number>().not.toBeAssignableTo<undefined>();

// Identical constrained type parameters still resolve before the guard.
function assertIdentical<Value extends null | undefined>(value: Value): void {
	expectTypeOf(value).toBe<Value>();
	expectTypeOf(value).toBeAssignableTo<Value>();
}
assertIdentical<null>(null);
assertIdentical<undefined>(undefined);

// The guard also applies to nullable aliases and pure nullable unions.
type Nullable = null | undefined;
// @ts-expect-error Number is not a nullable-only union.
expectTypeOf<number>().toBe<Nullable>();
// @ts-expect-error Accidental never is only assignable to itself.
expectTypeOf<never>().toBeAssignableTo<null>();
// @ts-expect-error Accidental any is only assignable to itself.
expectTypeOf<any>().toBeAssignableTo<null>();

// Unconstrained parameters remain valid when the actual and expected types match.
function assertUnconstrained<Value>(value: Value): void {
	expectTypeOf(value).toBe<Value>();
	expectTypeOf(value).toBeAssignableTo<Value>();
}
assertUnconstrained(1);
assertUnconstrained(null);

// Public method signatures can expose failure types, which must not satisfy their own failed assertion.
const numberExpectation = expectTypeOf<number>();
const equalityMethod = numberExpectation.toBe<any>;
type EqualityFailure = ThisParameterType<typeof equalityMethod>;
// @ts-expect-error A failure marker is not the asserted number type.
numberExpectation.toBe<EqualityFailure>();
const assignabilityMethod = numberExpectation.toBeAssignableTo<never>;
type AssignabilityFailure = ThisParameterType<typeof assignabilityMethod>;
// @ts-expect-error Number is not assignable to a failure marker.
numberExpectation.toBeAssignableTo<AssignabilityFailure>();
const anyExpectation = expectTypeOf<any>();
const anyMethod = anyExpectation.toBe<never>;
type AnyFailure = ThisParameterType<typeof anyMethod>;
// @ts-expect-error Any is only identical to itself.
anyExpectation.toBe<AnyFailure>();

// An exposed failure type is still a valid type to compare when it actually matches.
expectTypeOf<EqualityFailure>().toBe<EqualityFailure>();
expectTypeOf<EqualityFailure>().toBeAssignableTo<EqualityFailure>();
numberExpectation.not.toBe<EqualityFailure>();
numberExpectation.not.toBeAssignableTo<AssignabilityFailure>();

// Negated failure types are also exposed through public method signatures.
const negatedEqualityMethod = anyExpectation.not.toBe<any>;
type NegatedEqualityFailure = ThisParameterType<typeof negatedEqualityMethod>;
const negatedAssignabilityMethod = anyExpectation.not.toBeAssignableTo<any>;
type NegatedAssignabilityFailure = ThisParameterType<typeof negatedAssignabilityMethod>;
// @ts-expect-error A recovered failure type is still identical to itself.
expectTypeOf<NegatedEqualityFailure>().not.toBe<NegatedEqualityFailure>();
// @ts-expect-error A recovered failure type is still assignable to itself.
expectTypeOf<NegatedAssignabilityFailure>().not.toBeAssignableTo<NegatedAssignabilityFailure>();
expectTypeOf<NegatedEqualityFailure>().toBe<NegatedEqualityFailure>();
expectTypeOf<NegatedAssignabilityFailure>().toBeAssignableTo<NegatedAssignabilityFailure>();
expectTypeOf<number>().not.toBe<NegatedEqualityFailure>();
expectTypeOf<number>().not.toBeAssignableTo<NegatedAssignabilityFailure>();
