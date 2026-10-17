const NY_TZ = 'America/New_York';

export function getNytDate(date: Date = new Date()): Date {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: NY_TZ,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  }).formatToParts(date);

  const map: Record<string, string> = {};
  for (const p of parts) map[p.type] = p.value;

  return new Date(
    Number(map.year),
    Number(map.month) - 1,
    Number(map.day),
    Number(map.hour) === 24 ? 0 : Number(map.hour),
    Number(map.minute),
    Number(map.second),
  );
}

export function getNytMinutes(date: Date = new Date()): number {
  const nyt = getNytDate(date);
  return nyt.getHours() * 60 + nyt.getMinutes();
}

export function getNytMinutesFromTimestamp(timestamp: number): number {
  return getNytMinutes(new Date(timestamp));
}

export function isSameNytDay(timestamp: number): boolean {
  const nowNyt = getNytDate();
  const tsNyt = getNytDate(new Date(timestamp));
  return nowNyt.getDate() === tsNyt.getDate() && nowNyt.getMonth() === tsNyt.getMonth();
}

export function formatNytClock(date: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: NY_TZ,
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  }).format(date);
}

export function getNytDateLabel(date: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: NY_TZ,
    weekday: 'short', month: 'short', day: '2-digit',
  }).format(date);
}
