import {expectError} from '../expect-error.js';
import {greet, numberOnly} from './index.js';

// Every enclosing filter applies to an error, even when another assertion accepts it.
expectError(expectError(greet(1), 'wrong inner message'));
expectError(expectError(greet(1), 'not assignable'), 'wrong outer message');
expectError(expectError(greet(1), 'wrong inner message'), 'wrong outer message');

// Matching filters, including empty filters, can share the same error.
expectError(expectError(greet(1), 'not assignable'), 'not assignable');
expectError(expectError(greet(1), ''), 'not assignable');

// A sibling's filter only applies to its own error, not another sibling's error.
expectError([expectError(greet(1), "Argument of type 'number'"), expectError(numberOnly('x'), "Argument of type 'string'")], 'not assignable');

// Both calls match an error, but the outer filter still rejects the other error.
expectError([greet(1), expectError(numberOnly('x'), "Argument of type 'string'")], "Argument of type 'number'");

// Finding a matching error must not stop checking later errors against each filter.
expectError(expectError([greet(1), numberOnly('x')], "Argument of type 'number'"), 'not assignable');

// Every filter can share one error through multiple nesting levels.
expectError(expectError(expectError(greet(1), 'not assignable'), ''), 'not assignable');
