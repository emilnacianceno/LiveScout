// env.ts requires DATABASE_URL at import time. The pool connects lazily, so tests that never
// touch the database run fine with this placeholder; DB tests set their own URL (see test/db.ts).
process.env.DATABASE_URL ??= 'postgres://postgres:postgres@127.0.0.1:5432/face_test';
