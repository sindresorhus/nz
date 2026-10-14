import {expectTypeOf} from '../../../source/index.js';

expectTypeOf<number>().toBe<null>();
expectTypeOf<number>().toBe<undefined>();
expectTypeOf<any>().toBe<null>();
expectTypeOf<never>().toBe<undefined>();
expectTypeOf<null>().not.toBe<null>();
expectTypeOf<undefined>().not.toBe<undefined>();
expectTypeOf<number>().toBeAssignableTo<null>();
expectTypeOf<any>().toBeAssignableTo<undefined>();
expectTypeOf<null>().not.toBeAssignableTo<null>();
expectTypeOf<undefined>().not.toBeAssignableTo<undefined>();

const numberExpectation = expectTypeOf<number>();
const equalityMethod = numberExpectation.toBe<any>;
type EqualityFailure = ThisParameterType<typeof equalityMethod>;
numberExpectation.toBe<EqualityFailure>();
const assignabilityMethod = numberExpectation.toBeAssignableTo<never>;
type AssignabilityFailure = ThisParameterType<typeof assignabilityMethod>;
numberExpectation.toBeAssignableTo<AssignabilityFailure>();
const anyExpectation = expectTypeOf<any>();
const anyMethod = anyExpectation.toBe<never>;
type AnyFailure = ThisParameterType<typeof anyMethod>;
anyExpectation.toBe<AnyFailure>();
