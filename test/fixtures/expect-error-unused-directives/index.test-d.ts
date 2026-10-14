import {expectError} from '../expect-error.js';
import {greet} from './index.js';

expectError(
	// @ts-expect-error This directive cannot turn a valid expression into an expected error.
	greet('valid'),
);

expectError(
	// @ts-expect-error A used directive hides the error from the outer assertion.
	greet(1),
);

expectError((() => {
	// @ts-expect-error An unused directive remains a failure alongside a real expected type error.
	const valid: number = 1;
	greet(1);
	return valid;
})());

expectError(
	// @ts-expect-error A matching message cannot make an unused directive satisfy an assertion.
	greet('valid'),
	"Unused '@ts-expect-error' directive",
);

// @ts-expect-error Standalone unused directives remain failures.
greet('valid');

// The directive cannot satisfy either an inner assertion or its filtered outer assertion.
expectError(expectError(
	// @ts-expect-error Neither call may use this unused directive as its expected error.
	greet('valid'),
), "Unused '@ts-expect-error' directive");

// A genuine nested error can satisfy both calls while an unrelated unused directive remains a failure.
expectError([
	expectError(greet(1)),
	(() => {
		// @ts-expect-error This directive is independent of the nested call's genuine type error.
		const valid = 1;
		return valid;
	})(),
]);
