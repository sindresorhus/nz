import {expectTypeOf} from '../../../source/index.js';

declare const aNumber: number;
declare const anObject: {name: string};

expectTypeOf(aNumber).toBe<string>();
expectTypeOf(anObject).toBe<{name: string; age: number}>();
expectTypeOf(aNumber).toBe<any>();
expectTypeOf(aNumber).not.toBe<number>();
expectTypeOf(aNumber).toBeAssignableTo<string>();
expectTypeOf(aNumber).not.toBeAssignableTo<number | string>();
expectTypeOf(aNumber).not.toBeAssignableTo<any>();
declare const aLiteral: 'b';
expectTypeOf(aLiteral).toBe<'a'>();
expectTypeOf(aLiteral).not.toBe<
	'b'
>();
declare const aQuote: "it's";
expectTypeOf(aQuote).toBe<'it\'s' | "y's">();
