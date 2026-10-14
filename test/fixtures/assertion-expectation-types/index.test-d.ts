import {expectTypeOf, type ExpectTypeOf} from '../../../source/index.js';

expectTypeOf<number>().toBe<ExpectTypeOf<string>>();
expectTypeOf<number>().toBeAssignableTo<ExpectTypeOf<string>>();
expectTypeOf<ExpectTypeOf<string>>().not.toBe<ExpectTypeOf<string>>();

type Negated<Type> = ExpectTypeOf<Type>['not'];
expectTypeOf<number>().toBe<Negated<string>>();
expectTypeOf<number>().toBeAssignableTo<Negated<string>>();
expectTypeOf<Negated<string>>().not.toBe<Negated<string>>();

// Genuine guards still describe the supplied type when the actual type is an assertion object.
expectTypeOf<ExpectTypeOf<string>>().toBe<any>();
expectTypeOf<Negated<string>>().toBe<never>();
