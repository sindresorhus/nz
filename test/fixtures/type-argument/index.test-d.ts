import {expectError} from '../expect-error.js';
import {greet} from './index.js';

// The type name does not exist. That is a typo in the test, so it is a failure of its own, and the error in the parentheses must not stand in for it.
expectError<Missing>(greet(1));

// A type argument that does not satisfy its constraint is a normal thing to test, like with `tsd`.
type Name<Type extends string> = Type;
expectError<Name<number>>(greet('World'));
