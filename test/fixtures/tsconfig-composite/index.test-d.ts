import {expectError} from '../expect-error.js';
import {greet} from './index.js';

expectError(greet(1));
const count: number = greet('World');
