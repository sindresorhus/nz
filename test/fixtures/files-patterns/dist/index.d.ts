import type {Deep} from './sub/deep.js';
import type {Rooted} from '../types/rooted.js';
import type {Matched} from '../lib/matched.js';

export function greet(name: Deep | Rooted | Matched): string;
