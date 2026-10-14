import {expectTypeOf} from '../../../source/index.js';
import {value, nestedValue} from './helper.js';
import {aliasValue} from '@fixture/value';
import {validValue} from './valid-helper.js';

// This must not pass by hiding the helper's invalid annotation.
expectTypeOf(value).toBe<string>();
expectTypeOf(nestedValue).toBe<string>();
expectTypeOf(aliasValue).toBe<string>();
expectTypeOf(validValue).toBe<string>();
