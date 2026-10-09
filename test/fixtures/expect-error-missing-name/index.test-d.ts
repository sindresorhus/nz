import {expectError} from '../expect-error.js';
import {greet} from './index.js';

expectError(greeet(1));
expectError(missingName);

// A property that does not exist is a normal thing to test.
expectError(greet('World').missingProperty);
expectError(greet($));
expectError({missingShorthand});
expectError(1 as Fooo.Bar);
