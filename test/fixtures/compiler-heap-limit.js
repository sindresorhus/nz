import process from 'node:process';
import v8 from 'node:v8';

// Stands in for a compiler that stops, with the heap limit it ran with as the reason, so a test can read the limit from the error.
process.stderr.write(`heap limit ${Math.round(v8.getHeapStatistics().heap_size_limit / 1024 / 1024)} MB\n`);
process.exitCode = 1;
