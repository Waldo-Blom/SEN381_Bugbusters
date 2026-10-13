# Timestamp handling

The database inspected on 13 October 2026 uses GMT. Most event columns are
`timestamp without time zone`, with `now()` defaults; their database-generated
values therefore represent UTC wall time. Keep the database timezone at UTC/GMT.
Changing it to Johannesburg would mix UTC and South African wall times in these
columns and break duration calculations.

The application pool parses these legacy columns as UTC, independently of the
Node host timezone. Request dates, comments, history and contact access use
`src/shared/datetime.js` to display `YYYY-MM-DD HH:mm` in `Africa/Johannesburg`.
Dashboard and audit queries perform the equivalent explicit UTC-to-Johannesburg
conversion in SQL. Contact-access columns already use `timestamptz` and represent
absolute instants. Staff self-assignment converts Date parameters to UTC before
writing them into legacy columns.

Run `node db/scripts/check-timezone.js` for read-only database diagnostics.
No database migration is needed for this fix. Existing records written by the
old staff self-assignment path may contain host-local wall times. Correcting those
requires evidence of the host timezone at the time of each assignment; do not
shift all historical rows by two hours.

For future schema work, prefer `timestamptz` for event timestamps. A migration
must interpret legacy values explicitly as UTC and update SQL display conversions
and timestamp writes together.
