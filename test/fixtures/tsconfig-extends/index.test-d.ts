import {greet} from './index.js';

// `strict` comes from the base config the package config extends, so this is an error.
declare const name: string | undefined;
greet(name);
