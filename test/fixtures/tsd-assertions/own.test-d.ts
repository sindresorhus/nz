import {greet} from './index.js';

// The file does not import `tsd`, so this is a function of the test.
function printType(value: unknown) {}

printType(greet);
