// @ts-nocheck
// @ts-check
import {expectError} from '../../../source/index.js';
import {greet} from './index.js';
import {count} from './helper.js';
import './nested/checked.test-d.js';

expectError(greet(count), 'not assignable');
