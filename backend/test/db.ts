import { describe } from 'bun:test';

/** Database tests only run when RUN_DB_TESTS=1 and DATABASE_URL points at a migrated, disposable database. */
export const describeDb = process.env.RUN_DB_TESTS === '1' ? describe : describe.skip;
