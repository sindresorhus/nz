import {expectError} from '../expect-error.js';
import {greet} from './index.js';

expectError(-1 ** 2);
const count: number = greet('World');
