import {expectTypeOf} from '../../../source/index.js';

declare const value: {name?: string};

expectTypeOf(value).toBe<{name?: string}>();
expectTypeOf(value).not.toBe<{name?: string | undefined}>();
expectTypeOf(value).toBe<{name?: string | undefined}>();
