import {expectType, expectNotType, expectAssignable, expectNotAssignable, expectError, expectDeprecated, expectNotDeprecated, printType, expectDocCommentIncludes} from 'tsd';
import {greet} from './index.js';

// These are checked by `tsc`.
expectType<string>(greet('World'));
expectAssignable<string>(greet('World'));
expectError(greet(1));

// These pass with any value.
expectNotType<number>(greet('World'));
expectNotAssignable<number>(greet('World'));
expectDeprecated(greet);
expectNotDeprecated(greet);
printType(greet);
expectDocCommentIncludes<'Greets'>(greet);
