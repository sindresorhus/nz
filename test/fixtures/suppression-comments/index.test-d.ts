import {greet} from './index.js';

// @ts-ignore
const count: number = greet('World');

/* @ts-ignore */
const other: number = greet('World');

/**
 * @ts-ignore */
const third: number = greet('World');

// @ts-ignorefoo
const fourth: number = greet('World');

/* @ts-ignore
*/
const fifth: number = greet('World');
