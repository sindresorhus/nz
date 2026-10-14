import {expectError} from '../../expect-error.js';
import {greet} from '../index.js';

expectError(greet('valid'));
expectError(greet(1));
