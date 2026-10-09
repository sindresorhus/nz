// The assertions are only checked by the TypeScript compiler, so this only has to be one frozen object that refers to itself.
const expectation = Object.freeze({
	toBe() {},
	toBeAssignableTo() {},
	get not() {
		return expectation;
	},
	get returns() {
		return expectation;
	},
	get parameters() {
		return expectation;
	},
	get resolves() {
		return expectation;
	},
});

export function expectTypeOf() {
	return expectation;
}

export function expectError() {}
