-- A small JPEG copy of the organisation logo, made in the browser at upload, for certificates. PDFs can carry a JPEG as
-- it is, while a PNG has to be decoded first, which costs more CPU than a free-plan request has.
ALTER TABLE organizations ADD COLUMN logo_print_key TEXT;
