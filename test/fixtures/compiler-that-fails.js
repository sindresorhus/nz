// Stands in for a compiler that cannot be started, or that dies, so that a run of it is not mistaken for a list of type failures.
process.stderr.write('the compiler could not start\n');
process.exitCode = 1;
