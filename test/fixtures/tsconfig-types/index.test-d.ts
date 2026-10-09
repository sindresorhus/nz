import {Readable} from 'node:stream';
import {greet} from './index.js';

export const stream: Readable | undefined = undefined;

greet('World');
