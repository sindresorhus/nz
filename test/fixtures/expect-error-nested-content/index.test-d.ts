import {expectError} from '../expect-error.js';
import {printType} from 'tsd';
import {greet} from './index.js';

// An error in a sibling does not satisfy the nested assertion.
expectError([greet(1), expectError(greet('World'))]);

// A matching outer assertion must not hide a suppression directive.
expectError([
	greet(1),
	// @ts-ignore
	greet(2),
]);

// Only tsd checks this assertion, even when it is inside another assertion.
expectError([greet(1), printType(greet)]);

// Each nested assertion can match the error inside its own parentheses.
expectError(expectError(greet(1)));
expectError([expectError(greet(1)), expectError(greet(2), 'not assignable')]);

// The outer assertion must not hide a message mismatch in the nested call.
expectError([greet(1), expectError(greet(2), 'wrong message')]);
