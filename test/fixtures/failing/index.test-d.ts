import {expectError} from '../expect-error.js';
import {greet} from './index.js';

const count: number = greet('World');

expectError(greet('World'));

// @ts-expect-error
greet('World');
