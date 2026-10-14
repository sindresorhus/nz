import {expectError} from '../expect-error.js';
import {greet} from './index.js';

expectError(greet('valid'));
expectError(greet(1));

declare global {
	namespace JSX {
		interface IntrinsicElements {
			span: unknown;
		}
	}
}

const element = <span />;
void element;
