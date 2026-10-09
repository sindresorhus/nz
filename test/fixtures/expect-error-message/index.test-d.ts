import {expectError} from '../expect-error.js';
import {greet} from './index.js';

expectError(greet(1), 'not assignable to parameter of type');
expectError(greet(1), "Argument of type 'string'");
expectError(greet(1), 'is not a function');
expectError(greet(1), 'not assignable to type',);
expectError(greet('World'), 'anything');
expectError(greet(1), 'It\'s not');
expectError(greet(1), /* The reason. */ 'type \'number\'');
expectError(greet(1), `not assignable`);
expectError(greet(1), 'Argument of');
expectError(greet(1), 'Argument' + ' of');
expectError(greet(1), 'Argument of' as const);
declare function pick<First, Second>(value: string): void;
expectError(pick<'a', 'b'>(1));
expectError(greet(1), "type \'number\'");
expectError(greet(1), 'Argument\x20of');
