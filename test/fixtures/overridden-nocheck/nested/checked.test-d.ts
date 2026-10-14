// @ts-nocheck
// @ts-check
import {expectError} from '../../../../source/index.js';
import {greet} from '../index.js';

expectError(greet(1), 'not assignable');
