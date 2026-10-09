import {Readable} from 'node:stream';
import {expectError} from '../expect-error.js';
import {greet} from './index.js';

const greeting: string = greet('World');

expectError(greet(1));

expectError(
	greet(
		1,
	),
);

expectError<string>(1);

// A TS1xxx code from the type check counts, although most TS1xxx codes are syntax errors.
expectError(greeting satisfies number);

// @ts-expect-error
greet(1);

const stream: Readable = Readable.from(['a']);
