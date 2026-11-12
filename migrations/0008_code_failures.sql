-- Wrong-guess limit for 6-digit sign-in codes: 5 misses in 15 minutes locks code sign-in for that email until a new code is requested.
CREATE TABLE code_failures (
  email TEXT PRIMARY KEY,
  count INTEGER NOT NULL DEFAULT 0,
  window_start INTEGER NOT NULL
);
