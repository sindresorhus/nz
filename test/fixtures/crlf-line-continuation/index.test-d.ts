import {expectError} from '../expect-error.js';
import {greet} from './index.js';

const text = 'a\
b';
expectError(greet(1));
