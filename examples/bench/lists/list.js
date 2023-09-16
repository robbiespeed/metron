import { setup, run } from './config.js';
import { createAtomList } from 'metron-core/list.js';

run(setup(createAtomList));
