# nz

> Zero-config type tests for packages with hand-written declaration files

It type checks your package's declaration files and type test files with your own `tsc`. It also finds package mistakes that break the types for users, and has small type assertions whose failure messages name the actual type.

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

Any type error is a failure, so plain type annotations and `// @ts-expect-error` work too, and `tsc` reports an unneeded `// @ts-expect-error`. A `// @ts-ignore` in a test file, and a `// @ts-nocheck` in a TypeScript file of the package that `tsc` reads, are failures, because they hide failures. Only the last leading `// @ts-check` or `// @ts-nocheck` of a file counts, like in TypeScript.

```text
$ nz
index.test-d.ts:4:7  error TS2322: Type 'string' is not assignable to type 'number'.
index.test-d.ts:6:1  Expected an error, but found none.
index.test-d.ts:8:1  error TS2578: Unused '@ts-expect-error' directive.

3 failures
```

Most terminals and editors turn `file:line:column` into a link. In GitHub Actions, failures are also annotations on the pull request.

## What it checks

**Declaration files**, the first of these that the package has:

1. Every `types` condition in `exports`, including subpaths and conditions inside a `types` condition.
2. `types`
3. `typings`
4. The `.d.ts` file next to `main`.
5. `index.d.ts`

**Test files:** `*.test-d.ts` next to a declaration file, `test-d/**/*.ts`, and `typetests/**/*.ts`. An imported `*.test-d.ts` or `*.test-d.tsx` file of the package, or a `.tsx` file in `test-d` or `typetests`, is a test file too.

**With a `tsconfig.json`,** your options, `extends` chain and `paths` apply, so the types are checked the way the package builds them. It writes a config that extends yours and overrides only the file list. Your `types` applies too. TypeScript defaults it to `[]`, so add `"types": ["node"]` for the Node.js globals and built-in modules. These options are forced:

- `--rootDir` the file system root, so an `outDir` cannot infer a `rootDir` that leaves out the checked files, and a test file can import from outside the package.
- `--incremental false` and `--composite false`, so no build info is written. `emitDeclarationOnly`, `declarationMap`, `isolatedDeclarations`, `declarationDir` and `mapRoot` are off too, because they are an error without the `declaration` that `composite` implied. Nothing is emitted, so of these, only `isolatedDeclarations` matters, and it would check what a test file exports.
- `--noCheck false`, because checking is the point.
- `diagnostics`, `extendedDiagnostics`, `traceResolution` and `explainFiles` are off, so debugging output does not become a failure.

**Without a `tsconfig.json`,** it runs this in the package root:

```sh
tsc --noEmit --listFiles --pretty false --locale en --noErrorTruncation \
	--types node \
	--ignoreConfig --strict \
	--module nodenext --moduleResolution nodenext \
	--target esnext --lib esnext,dom \
	<declaration files> <test files> <type check file>
```

`--ignoreConfig` ignores a `tsconfig.json` in a parent directory, like the root of a monorepo. Your declaration files are checked without `skipLibCheck`. `--types node` is passed when `@types/node` is installed, so it is the only `@types` package loaded on its own.

**In both cases:**

- The config and the type check file go in a temporary directory in `.cache` in the first `node_modules` from the package up, and are removed afterwards (not when the run is killed). From there, TypeScript finds the same `types` and packages as from your package. When there is no `node_modules`, one is made in the package and stays.
- Errors in `node_modules` and in other files outside the package, like a symlinked workspace package, are ignored. `--listFiles` tells which files those are, so an error elsewhere, like in a config that yours extends, is still a failure.
- `--noErrorTruncation` is passed, so a failure shows the whole type.
- A syntax error anywhere, or some errors in the compiler options, make `tsc` skip the type check. A type check file with one known type error detects this. Then the skip is a failure, every error is a failure (also in `node_modules`), and none satisfies an `expectError()` call, so the run never passes with nothing checked.

## Package checks

It also reports mistakes that type check in the package, but break the types for users:

- **A value that a declaration file exports and the JavaScript file does not.** Importing it type checks, and throws at runtime. For each ES module entry point (a `types` condition with an `import`, `node` or `default` JavaScript file next to it, or else `types` or `typings` with `main`, a string `exports`, or `index.js`), the value names are compared with the declarations TypeScript writes for the JavaScript file. When the comparison cannot run, like for a declaration file that only declares globals, it is skipped.
- **A package that a declaration file imports, which is not in `dependencies`, `peerDependencies` or `optionalDependencies`.** Built-in modules, the package itself, and a package with a listed `@types` package are fine. The declaration files they import are checked too.
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

`any`, `unknown`, and `never` are only identical to themselves, so `toBe<string>()` catches an accidental `any`. `readonly` and optional modifiers must match, and so must the `this` parameter of a function.

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

For an overloaded function, this is the return type of the last overload. For a union, only its function members count. It is `unknown` for `any`, and `never` if the type is not a function.

#### .parameters

The parameter types of the function, as a tuple.

For an overloaded function, these are the parameters of the last overload. For a union, only its function members count. It is `unknown[]` for `any`, and `never` if the type is not a function.

#### .resolves

The type that a promise or thenable resolves to, recursively unwrapped using TypeScript's `Awaited` utility.

For a union, like `Promise<string> | undefined`, only its promises and thenables count. It is `any` for `any`, and `never` if the type is not a promise or thenable.

For an overloaded `then` method, only the last overload counts, which can differ from the type of an `await` expression.

### expectError(value, message?)

Assert that `value` causes a type error.

It passes when there is at least one type error in its type argument or parentheses, and fails with `Expected an error, but found none.` otherwise. Any error counts, except one for a name that does not exist or an unused `@ts-expect-error` directive, which are mistakes in the test. When `tsc` skipped the type check, no error counts.

With a `message`, only an error whose message includes it passes, so a test cannot pass because of a different error. Another error inside the call is reported, so the failure shows what it was. The message must be one string literal, because it is read from the source. Anything else, like a variable, is ignored, and the call then takes any error. Control characters in an unmatched message are shown as `\uXXXX` escapes.

```ts
expectError(greet(1), 'not assignable to parameter of type');
```

This needs the `nz` CLI, which matches type errors to the calls. The calls are found by name, so `expectError` from `tsd` works too. With plain `tsc`, use a `// @ts-expect-error` comment instead.

### Failure messages

The CLI describes a failed assertion in one line, the same on TypeScript 6 and 7, with the expected type as you wrote it, and control characters as `\uXXXX` escapes:

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

TypeScript 7 does not work with `typescript-eslint` (and so `xo`) yet, so TypeScript recommends [installing both](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/#running-side-by-side-with-typescript-6.0), with 7 as `@typescript/native`. `nz` uses `@typescript/native` when it is installed.

```json
{
	"devDependencies": {
		"@typescript/native": "npm:typescript@^7.0.2",
		"typescript": "^6.0.3"
	}
}
```

TypeScript 6 runs in Node.js, and gets a heap of 8 GB instead of the default of about 4 GB, because a large package like `type-fest` needs more. Raise it with `NODE_OPTIONS=--max-old-space-size=16384 nz`. `node --max-old-space-size=16384 nz` does not work, because the compiler runs in its own process. TypeScript 7 is native and has no such limit.

## Limitations

**Configuration**

- No settings of its own. Put compiler options, like `exactOptionalPropertyTypes`, in your `tsconfig.json`.
- A `tsconfig.json` replaces the whole default option set, so a package that only wants `paths` must also set `module` and `moduleResolution` to `nodenext`.
- With a `tsconfig.json`, the options under [what it checks](#what-it-checks) are overridden, and `files`/`include` is not used.
- Project references (`references`) are not carried over, so an import can resolve to a referenced project's source instead of its built declarations. Import its built declaration entry points instead.
- Without a `tsconfig.json`, only the `@types/node` globals are available, because `types` is set. Import from the package instead.
- Without a `tsconfig.json`, the files are passed to `tsc` as absolute paths, and Windows limits a command line to 32,767 characters, so a package with many hundreds of test files needs a `tsconfig.json`.
- A `node_modules` that cannot be written to.
- `${configDir}` is the temporary directory in `node_modules/.cache`, not the package root, because TypeScript sets it to the config's directory. A `paths` entry that uses it does not resolve, nor does a relative `types` entry like `./typings/globals`.
- `skipLibCheck` is honored, so turning it on in `tsconfig.json` skips checking your declaration files.
- A `// @ts-nocheck` in a JavaScript file is not reported, because whether the file is type checked depends on `checkJs`.
- `--show-config` prints the temporary config as `../` chains and names temporary files that are removed afterwards. TypeScript 6 also prints `declarationDir`, although it is off.
- `.tsx` test files, and subpath patterns in `exports` (`"./*": {"types": "./*.d.ts"}`). Import such files from a test file.

**Package checks**

- The value exports of a CommonJS entry point are not compared, nor those of one that re-exports everything (`export *`) or whose JavaScript file does not exist yet. A package built from TypeScript should run `nz` after the build.
- `files` is matched like npm for the usual patterns: a glob, a directory, and `!`. `.npmignore` is not read.

**`expectError()`**

- The calls are found without a TypeScript parser. A call inside a template literal is not found, and a call after `>`, `*` or `void` that is directly followed by `:`, like `condition ? () => expectError(value) : other`, reads as a method with a return type. A call that cannot be read reports its errors and never silently passes, but one that is not found and has no error inside passes.
- In imported `.tsx` files, finding calls is best-effort, because JSX is not parsed. Keep `expectError()` and unchecked `tsd` calls in a `.test-d.ts` file.
- The `expectType` and `expectAssignable` assertions from `tsd` only check assignability here, because `tsd` does the exact check itself. Use `expectTypeOf(value).toBe<Type>()`. The `tsd` assertions that take any value, like `expectNotType` and `printType`, always pass with `tsc`, so in a file that imports `tsd`, a call to one of them is a failure. They are found by name, so a call through an alias or a namespace is not found, and a test function with the same name is reported.

**`expectTypeOf()`**

- Two structurally identical types are identical, also different classes. An intersection is not identical to the type it flattens into, an enum is not identical to the union of its members, and `new () => T` is identical to `abstract new () => T`, although `toBeAssignableTo()` does not accept the abstract one for the other.
- A `this` parameter that only one side has is only compared for the function itself, not for a function inside the type, like in a property, a method, a parameter, or a return type, nor in a union that also has a function without a `this` parameter. For an overloaded function, it is only compared for the last overload. A `this` parameter of type `unknown`, or of an unconstrained type parameter of a generic function, is the same as none. One of a constrained type parameter is its constraint.
- For an overloaded function, `returns` and `parameters` are those of the last overload. Generic type parameters are inferred from their constraints, or as `unknown` when unconstrained. When that does not match the function, like a return type of `keyof T` for a constrained `T`, `returns` is `never`. For a union, only its function members count. To test another overload, call the function, like `expectTypeOf(convert(1)).toBe<string>()`, and give a generic function its type arguments, like `expectTypeOf(identity<string>).returns.toBe<string>()`.
- A fresh literal widens, so `expectTypeOf('hello')` is a `string`. Declare the value with a literal type first.
- `.not.toBe()` and `.not.toBeAssignableTo()` without a type argument pass, because no default fails for every type.
- Inside a generic function or class, the actual type is a type parameter, which TypeScript cannot resolve, so the `not` assertions fail, and so does `toBeAssignableTo()` for a type that is not identical.
- Method parameters are checked bivariantly in `toBeAssignableTo()`, like in TypeScript.
- There are no matchers for properties or specific kinds of types. Use `toBe()` with the full type.
- When the expected type satisfies a failed assertion's constraint, the failure is reported at the start of the expression. The CLI calls it “the type argument”, and says that it is `never` without one, because TypeScript's message does not name the expected type.
