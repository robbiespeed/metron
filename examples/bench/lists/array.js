import { setup, run } from './config.js';
import { createAtomArray } from 'metron-core/collections/array.js';

run(setup(createAtomArray));
