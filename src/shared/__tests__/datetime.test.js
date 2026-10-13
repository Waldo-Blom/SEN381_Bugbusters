const { formatDate, parseDatabaseTimestamp } = require('../datetime');
const { execFileSync } = require('child_process');

describe('South African timestamps', () => {
  it('converts UTC instants and legacy database strings to SAST', () => {
    expect(formatDate(new Date('2026-10-13T09:30:00Z'))).toBe('2026-10-13 11:30');
    expect(formatDate('2026-10-13 09:30:00.123456')).toBe('2026-10-13 11:30');
    expect(formatDate('2026-10-13T11:30:00+02:00')).toBe('2026-10-13 11:30');
    expect(parseDatabaseTimestamp('2026-10-13 09:30:00').toISOString()).toBe(
      '2026-10-13T09:30:00.000Z'
    );
  });

  it('handles midnight rollover, winter and missing values', () => {
    expect(formatDate('2026-10-13T23:30:00Z')).toBe('2026-10-14 01:30');
    expect(formatDate('2026-06-13T09:30:00Z')).toBe('2026-06-13 11:30');
    expect(formatDate(null)).toBe('');
  });

  it.each(['UTC', 'Africa/Johannesburg', 'America/New_York'])(
    'ignores the Node host timezone %s',
    (tz) => {
      const script = `const { formatDate, parseDatabaseTimestamp } = require(${JSON.stringify(require.resolve('../datetime'))});
      process.stdout.write(formatDate(parseDatabaseTimestamp('2026-10-13 09:30:00')));`;
      expect(
        execFileSync(process.execPath, ['-e', script], {
          env: { ...process.env, TZ: tz },
        }).toString()
      ).toBe('2026-10-13 11:30');
    }
  );
});
