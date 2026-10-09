import process from 'node:process';

// Stands in for a compiler that runs out of memory, which V8 reports with a long native stack trace before it aborts the process.
process.stderr.write('\n<--- Last few GCs --->\n\n\n<--- JS stacktrace --->\n\nFATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory\n----- Native stack trace -----\n\n 1: 0x102b77f14 node::OOMErrorHandler(char const*, v8::OOMDetails const&)\n', () => {
	process.abort();
});
