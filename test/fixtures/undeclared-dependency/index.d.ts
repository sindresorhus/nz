import type {Value} from 'declared';
import type {Value as DevelopmentValue} from 'dev-only';
import type {Readable} from 'node:stream';
import type {Value as TypedValue} from 'typed';
import type {Helper} from './types/helper.js';

export type {Value as Other} from 'undeclared';

export function greet(name: Value | DevelopmentValue | TypedValue | Helper, stream?: Readable): typeof import('undeclared');
