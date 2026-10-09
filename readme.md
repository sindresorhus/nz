# nz

> Zero-config type tests for packages with hand-written declaration files

It type checks your package's declaration files and type test files, using your own `tsc`, and reports the errors. It also checks the package for mistakes that break its types for users, and has small type assertions with failure messages that name the actual type.

It runs the `tsc` binary and reads its output, so it works with TypeScript 7, which has no JavaScript compiler API.

## The name

`nz` is `no zeal`: the most boring possible name for the most boring possible job. It checks your types with no enthusiasm at all, prints nothing when they are right, and exits `0`.

## Install

```sh
npm install --save-dev nz typescript
```

## Usage

```json
{
	"scripts": {
		"test": "nz"
	}
}
```

```ts
// index.test-d.ts
import {expectTypeOf, expectError} from 'nz';
import greet, {fetchGreeting, type Greeting} from './index.js';

expectTypeOf(greet('World')).toBe<string>();
expectTypeOf(greet).returns.toBe<string>();
expectTypeOf(greet).not.toBe<(name: number) => string>();
expectTypeOf(greet).toBeAssignableTo<(name: string) => unknown>();
expectTypeOf(greet).parameters.toBe<[name: string]>();
expectTypeOf(fetchGreeting()).resolves.toBe<string>();
expectTypeOf<Greeting>().toBe<string>();

expectError(greet(1));
expectError(greet(1), 'not assignable to parameter of type');

// @ts-expect-error
greet();
```

Any type error is a failure, so plain type annotations and `// @ts-expect-error` comments work too, and `tsc` reports a `// @ts-expect-error` that is not needed. A `// @ts-ignore` in a test file, and a `// @ts-nocheck` in any checked file, are failures, because they hide failures without a trace.

```text
$ nz
index.test-d.ts:4:7  error TS2322: Type 'string' is not assignable to type 'number'.
index.test-d.ts:6:1  Expected an error, but found none.
index.test-d.ts:8:1  error TS2578: Unused '@ts-expect-error' directive.

3 failures
```

Most terminals and editors turn `file:line:column` into a link. In GitHub Actions, they are also annotations on the failing lines of a pull request.

## What it checks

**Declaration files**, the first of these that the package has:

1. Every `types` condition in `exports`, including subpaths and conditions inside a `types` condition.
2. `types`
3. `typings`
4. The `.d.ts` file next to `main`.
5. `index.d.ts`

**Test files:** `*.test-d.ts` next to a declaration file, `test-d/**/*.ts`, and `typetests/**/*.ts`.

**With a `tsconfig.json`,** your options, `extends` chain and `paths` apply, so the types are checked the way the package builds them. It writes a config that extends yours and overrides only the file list. Your `types` applies, like with your own `tsc`; TypeScript defaults it to `[]`, so add `"types": ["node"]` for the Node.js globals and built-in modules. It forces a few options:

- `--rootDir` the file system root, so an `outDir` cannot infer a `rootDir` that leaves out the checked files, and a test file can import from outside the package.
- `--incremental false` and `--composite false`, so no build info is written to your package. `emitDeclarationOnly`, `declarationMap`, `isolatedDeclarations`, `declarationDir` and `mapRoot` are off too, because they are an error without the `declaration` that `composite` implied (`mapRoot` without `declarationMap`). Nothing is emitted, so they only matter for `isolatedDeclarations`, which would check what a test file exports.
- `--noCheck false`, because checking is the point.

**Without a `tsconfig.json`,** it runs this in the package root:

```sh
tsc --noEmit --pretty false --locale en --noErrorTruncation \
	--types node \
	--ignoreConfig --strict \
	--module nodenext --moduleResolution nodenext \
	--target esnext --lib esnext,dom \
	<declaration files> <test files> <type check file>
```

`--ignoreConfig` ignores a `tsconfig.json` in a parent directory, like the root of a monorepo. Your declaration files are checked without `skipLibCheck`. `--types node` is passed when `@types/node` is installed, so `@types/node` is the only `@types` package loaded on its own.

**In both cases:**

- The config and the type check file are written to a temporary directory in `node_modules/.cache`, in the first `node_modules` from the package up, and removed afterwards (not when the run is killed). From there, TypeScript finds the same `types` and packages as from your package. When there is no `node_modules` in the package or above it, one is made in the package and stays there, like the `.cache` directory.
- Errors in `node_modules`, and in other files outside the package, like a symlinked workspace package, are ignored.
- `--noErrorTruncation` is passed, so a failure shows the whole type.
- A syntax error anywhere, or some errors in the compiler options, make `tsc` skip the type check. A type check file with one known type error finds this. Then that is a failure, every error is a failure (also in `node_modules`), and none satisfies an `expectError()` call, so the run can never pass with nothing checked.

## Package checks

It also reports mistakes that type check in the package, but break the types for users:

- **A value that a declaration file exports and the JavaScript file does not.** Importing it type checks, and throws at runtime. For each ES module entry point (a `types` condition with an `import`, `node` or `default` JavaScript file next to it, or else `types` or `typings` with `main`, a string `exports`, or `index.js`), TypeScript writes declarations for the JavaScript file in a separate run, and the value names are compared. The comparison is skipped when it cannot run, like for a declaration file that only declares globals.
- **A package that a declaration file imports, which is not in `dependencies`, `peerDependencies` or `optionalDependencies`.** Built-in modules, the package itself, and a package whose `@types` package is listed are fine. The declaration files they import are checked too.
- **`types` after `default`, `import`, `require` or `node`** in `exports`. TypeScript only finds it through a fallback.
- **A `types` file of another format than a JavaScript file next to it,** like one `.d.ts` for both `import` and `require`.
- **A declaration file that `files` in package.json leaves out.**

## CLI options

- `--show-config`: Print the `tsc` command and the resolved compiler configuration.
- `--help`: Print the usage summary.
- `--version`: Print the version.

## Assertions

The assertions work in the editor and with plain `tsc` too. Only `expectError()` needs the `nz` CLI.

### expectTypeOf(value)

Start a type assertion on the type of `value`.

The assertions are only checked by the TypeScript compiler, and do nothing at runtime.

### expectTypeOf\<Type>()

Start a type assertion on the type `Type`, for a type with no value to pass, like a type a package exports.

```ts
expectTypeOf<IsEqual<string, string>>().toBe<true>();
```

#### .toBe\<Expected>()

Assert that the type is identical to `Expected`.

`any`, `unknown`, and `never` are only identical to themselves, so `toBe<string>()` catches an accidental `any`. `readonly` and optional modifiers must match.

Without a type argument, the expected type is `never`, so the assertion fails for every other type.

#### .not.toBe\<Expected>()

Assert that the type is not identical to `Expected`.

#### .toBeAssignableTo\<Expected>()

Assert that the type is assignable to `Expected`.

This is the normal TypeScript assignability, except that `any` and `never` are only assignable to themselves, so an accidental `any` or `never` fails.

Without a type argument, the expected type is `never`, so the assertion fails for every other type.

#### .not.toBeAssignableTo\<Expected>()

Assert that the type is not assignable to `Expected`.

#### .returns

The return type of the function.

For an overloaded function, this is the return type of the last overload. It is `unknown` for `any`, and `never` if the type is not a function.

#### .parameters

The parameter types of the function, as a tuple.

For an overloaded function, these are the parameters of the last overload. It is `unknown[]` for `any`, and `never` if the type is not a function.

#### .resolves

The type that the promise resolves to.

For a union, like `Promise<string> | undefined`, it is the resolved type of the promises in it. It is `any` for `any`, and `never` if the type is not a promise.

### expectError(value, message?)

Assert that `value` causes a type error.

It passes when there is at least one type error in its type argument or inside its parentheses, and fails with `Expected an error, but found none.` otherwise. Any error code counts, except an error for a name that does not exist, which is a typo in the test. When a syntax error or an error in the compiler options made `tsc` skip the type check, no error counts.

With a `message`, only an error whose message includes it passes the assertion, so a test cannot pass because of a different error. An error inside the call that does not include it is reported, so the failure shows what the error was. The message has to be one string literal, because it is read from the source. Anything else, like a variable, is not read, and the call then takes any error.

```ts
expectError(greet(1), 'not assignable to parameter of type');
```

This needs the `nz` CLI, which matches type errors to the `expectError()` calls. The calls are found by name, so the `expectError` from `tsd` works too. With plain `tsc`, every type error fails, so use a `// @ts-expect-error` comment instead.

### Failure messages

The CLI describes a failed assertion in one line, the same on TypeScript 6 and 7, with the expected type as you wrote it:

```text
index.test-d.ts:4:26  Expected type 'string', but the actual type is 'number'.
index.test-d.ts:5:30  Expected a type other than 'number', but the actual type is identical.
index.test-d.ts:6:38  Expected a type assignable to 'string', but the actual type is 'number'.
index.test-d.ts:7:42  Expected a type not assignable to 'number | string', but the actual type is 'number'.
```

In the editor, the message is TypeScript's own, and the actual type is the one in the `ActualTypeIs…` type:

```text
error TS2344: Type 'string' does not satisfy the constraint 'ActualTypeIs<number>'.
error TS2344: Type '(name: string) => string' does not satisfy the constraint 'ActualTypeIsIdentical<(name: string) => string>'.
error TS2344: Type 'string' does not satisfy the constraint 'ActualTypeIsNotAssignable<number>'.
error TS2344: Type 'string | number' does not satisfy the constraint 'ActualTypeIsAssignable<number>'.
```

There, the first type is the expected type as TypeScript prints it, which widens a literal like `'a'` to `string`. TypeScript 7 words a failure for an object type as a missing `[actualTypeIs]` property.

## TypeScript version

It uses the `typescript` package your package resolves, and never downloads one. It needs 6.0 or later, for `--ignoreConfig`, and is tested with 6 and 7.

TypeScript 7 does not work with `typescript-eslint` (and so `xo`) yet, so TypeScript recommends [installing both](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/#running-side-by-side-with-typescript-6.0), with 7 as `@typescript/native`. When installed, it replaces `typescript`.

```json
{
	"devDependencies": {
		"@typescript/native": "npm:typescript@^7.0.2",
		"typescript": "^6.0.3"
	}
}
```

TypeScript 6 runs in Node.js, and the compiler gets a heap of 8 GB instead of the default of about 4 GB, because a large package like `type-fest` needs more. Raise it with `NODE_OPTIONS=--max-old-space-size=16384 nz`. The compiler runs in its own process, so `node --max-old-space-size=16384 nz` does not work. TypeScript 7 is native and has no such limit.

## Limitations

**Configuration**

- No settings of its own. Put compiler options, like `exactOptionalPropertyTypes`, in your `tsconfig.json`.
- A `tsconfig.json` replaces the whole default option set, so a package that only wants `paths` must also set `module` and `moduleResolution` to `nodenext`.
- With a `tsconfig.json`, the options under [what it checks](#what-it-checks) are overridden, and `files`/`include` is not used.
- Without a `tsconfig.json`, only the `@types/node` globals are available, because `types` is set. Import from the package instead.
- A `node_modules` that cannot be written to.
- `${configDir}` is the temporary directory in `node_modules/.cache`, not the package root, because TypeScript sets it to the config's directory. A `paths` entry that uses it does not resolve, nor does a relative `types` entry like `./typings/globals`.
- `skipLibCheck` is honored, so turning it on in `tsconfig.json` skips checking your declaration files.
- `--show-config` prints the temporary config as `../` chains and names temporary files that are removed afterwards; TypeScript 6 also prints `declarationDir` although it is off.
- `.tsx` test files, and subpath patterns in `exports` (`"./*": {"types": "./*.d.ts"}`). Import such files from a test file.

**Package checks**

- The value exports of a CommonJS entry point are not compared, nor those of one that re-exports everything (`export *`) or whose JavaScript file does not exist yet. A package built from TypeScript should run `nz` after the build.
- `files` is matched like npm for the usual patterns: a glob, a directory, and `!`. `.npmignore` is not read.

**`expectError()`**

- The calls are found without a TypeScript parser. A call inside a template literal is not found, and a call after `>`, `*` or `void` that is directly followed by `:`, like `condition ? () => expectError(value) : other`, reads as a method with a return type. A call that cannot be read reports its errors, never silently passes; one that is not found and has no error inside passes.
- The `expectType` and `expectAssignable` assertions from `tsd` only check assignability here, because `tsd` does the exact check itself. Use `expectTypeOf(value).toBe<Type>()`. The `tsd` assertions that take any value, like `expectNotType` and `printType`, pass with `tsc` whatever the type is, so in a file that imports `tsd`, a call by one of their names is a failure. The calls are found by name, so one through an alias or a namespace is not found, and a function of the test with the same name is reported.

**`expectTypeOf()`**

- Two structurally identical types are identical, also different classes. An intersection is not identical to the type it flattens into, an enum is not identical to the union of its members, and `new () => T` is identical to `abstract new () => T`.
- For an overloaded function, `returns` and `parameters` are those of the last overload. For a generic function, its type parameters are `unknown`, and for a union, `returns` follows TypeScript's `ReturnType`. To test another overload, call the function, like `expectTypeOf(convert(1)).toBe<string>()`, and give a generic function its type arguments, like `expectTypeOf(identity<string>).returns.toBe<string>()`.
- A fresh literal widens, so `expectTypeOf('hello')` is a `string`. Declare the value with a literal type first.
- `.not.toBe()` and `.not.toBeAssignableTo()` without a type argument pass, because no default fails for every type.
- Inside a generic function or class, the actual type is a type parameter, so the `not` assertions fail, and so does `toBeAssignableTo()` for a type that is not identical: TypeScript cannot resolve them.
- Method parameters are checked bivariantly in `toBeAssignableTo()`, like in TypeScript.
- There are no matchers for properties or specific kinds of types. Use `toBe()` with the full type.
- A mismatch with an expected `any` or `never` is reported at the start of the expression, and the CLI says which, because TypeScript's message does not.
