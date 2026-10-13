const TIME_ZONE = 'Africa/Johannesburg';

// Legacy timestamp-without-time-zone columns contain UTC database wall time.
const parseDatabaseTimestamp = (value) => new Date(`${value.replace(' ', 'T')}Z`);

const formatter = new Intl.DateTimeFormat('en-ZA', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

const formatDate = (value) => {
  if (!value) return '';
  const date =
    typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/.test(value)
      ? parseDatabaseTimestamp(value)
      : new Date(value);
  const parts = Object.fromEntries(
    formatter.formatToParts(date).map(({ type, value }) => [type, value])
  );
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
};

module.exports = { TIME_ZONE, parseDatabaseTimestamp, formatDate };
