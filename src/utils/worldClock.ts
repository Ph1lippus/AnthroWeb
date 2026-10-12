/**
 * World clock formatting, built on `Intl` rather than on a date library.
 *
 * The timezone database is already in the browser and in the Android WebView --
 * it is the same data that makes every `Date` on the platform correct across a
 * DST boundary. A third-party library here would be a second, slightly worse
 * copy of it, and the thing this page needs (what time is it over there, and
 * is it already tomorrow) is two calls to `Intl.DateTimeFormat`.
 *
 * The hard part is not the formatting, it is the day offset. "09:00 in Tokyo"
 * tells you nothing useful at 23:00 in London unless it also says that Tokyo is
 * already tomorrow, which is why every row carries one.
 */

/** A city the picker offers out of the box, and its IANA zone. */
export interface City {
    name: string;
    country: string;
    zone: string;
}

/**
 * A deliberately short list.
 *
 * Every major timezone offset is represented, so converting between any two
 * zones is reachable from here, and the rows stay scannable. A city added by
 * the user is stored by zone id and renders through the same code as these.
 */
export const CITIES: readonly City[] = [
    { name: 'London', country: 'UK', zone: 'Europe/London' },
    { name: 'Lisbon', country: 'PT', zone: 'Europe/Lisbon' },
    { name: 'Madrid', country: 'ES', zone: 'Europe/Madrid' },
    { name: 'Berlin', country: 'DE', zone: 'Europe/Berlin' },
    { name: 'Athens', country: 'GR', zone: 'Europe/Athens' },
    { name: 'Helsinki', country: 'FI', zone: 'Europe/Helsinki' },
    { name: 'Kyiv', country: 'UA', zone: 'Europe/Kyiv' },
    { name: 'Moscow', country: 'RU', zone: 'Europe/Moscow' },
    { name: 'Istanbul', country: 'TR', zone: 'Europe/Istanbul' },
    { name: 'Dubai', country: 'AE', zone: 'Asia/Dubai' },
    { name: 'Karachi', country: 'PK', zone: 'Asia/Karachi' },
    { name: 'Kolkata', country: 'IN', zone: 'Asia/Kolkata' },
    { name: 'Bangkok', country: 'TH', zone: 'Asia/Bangkok' },
    { name: 'Singapore', country: 'SG', zone: 'Asia/Singapore' },
    { name: 'Shanghai', country: 'CN', zone: 'Asia/Shanghai' },
    { name: 'Tokyo', country: 'JP', zone: 'Asia/Tokyo' },
    { name: 'Seoul', country: 'KR', zone: 'Asia/Seoul' },
    { name: 'Sydney', country: 'AU', zone: 'Australia/Sydney' },
    { name: 'Auckland', country: 'NZ', zone: 'Pacific/Auckland' },
    { name: 'Honolulu', country: 'US', zone: 'Pacific/Honolulu' },
    { name: 'New York', country: 'US', zone: 'America/New_York' },
    { name: 'Chicago', country: 'US', zone: 'America/Chicago' },
    { name: 'Denver', country: 'US', zone: 'America/Denver' },
    { name: 'Los Angeles', country: 'US', zone: 'America/Los_Angeles' },
    { name: 'Toronto', country: 'CA', zone: 'America/Toronto' },
    { name: 'Vancouver', country: 'CA', zone: 'America/Vancouver' },
    { name: 'Mexico City', country: 'MX', zone: 'America/Mexico_City' },
    { name: 'Bogota', country: 'CO', zone: 'America/Bogota' },
    { name: 'Sao Paulo', country: 'BR', zone: 'America/Sao_Paulo' },
    { name: 'Buenos Aires', country: 'AR', zone: 'America/Argentina/Buenos_Aires' },
    { name: 'Cairo', country: 'EG', zone: 'Africa/Cairo' },
    { name: 'Lagos', country: 'NG', zone: 'Africa/Lagos' },
    { name: 'Johannesburg', country: 'ZA', zone: 'Africa/Johannesburg' },
] as const;

/**
 * The local zone, as an IANA id.
 *
 * `Intl.DateTimeFormat().resolvedOptions().timeZone` is the only way to ask
 * this. Falling back to 'UTC' would be wrong in a way that is invisible until
 * somebody reads their own row and sees it disagree with the clock on the
 * wall, so the fallback keeps the label honest instead.
 */
export function localZone(): string {
    if (typeof Intl === 'undefined') return 'UTC';
    try {
        return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    } catch {
        return 'UTC';
    }
}

/**
 * True when the runtime knows this zone.
 *
 * `Intl.DateTimeFormat` does not throw on an unknown zone, it silently formats
 * in UTC. That is the dangerous case: a typo in a saved city renders a
 * perfectly plausible time that is quietly wrong, so the zone has to be probed
 * against a value that must round-trip.
 */
export function isValidZone(zone: string): boolean {
    if (!zone || typeof Intl === 'undefined') return false;
    try {
        new Intl.DateTimeFormat('en-US', { timeZone: zone }).format(0);
        return true;
    } catch {
        return false;
    }
}

const timeFormatters = new Map<string, Intl.DateTimeFormat>();
const dateFormatters = new Map<string, Intl.DateTimeFormat>();

const formatterFor = (
    cache: Map<string, Intl.DateTimeFormat>,
    key: string,
    build: () => Intl.DateTimeFormat,
): Intl.DateTimeFormat => {
    const existing = cache.get(key);
    if (existing) return existing;
    const created = build();
    cache.set(key, created);
    return created;
};

/**
 * "14:05" in a zone.
 *
 * `hourCycle: 'h23'` rather than `hour12`, because the whole app is on a 24-hour
 * clock and a row that flips to "2:05 PM" while the timer above it reads 14:05
 * reads as two different apps. The zones that genuinely have a 12-hour habit
 * are not worth a special case.
 */
export function timeInZone(zone: string, at: Date): string {
    return formatterFor(timeFormatters, zone, () => new Intl.DateTimeFormat('en-GB', {
        timeZone: zone,
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
    })).format(at);
}

/** The weekday name in a zone, so a row can say "Tomorrow" without guessing. */
function dayInZone(zone: string, at: Date): string {
    return formatterFor(dateFormatters, zone, () => new Intl.DateTimeFormat('en-GB', {
        timeZone: zone,
        weekday: 'short',
    })).format(at);
}

/**
 * Whole days between a zone and the user's own, as -1, 0 or +1.
 *
 * Not an offset in hours. Converting a clock time between two zones and
 * reporting the hour difference is the thing that misleads people: London and
 * Lisbon are both UTC+1 in summer, so their difference is 0 hours, but in
 * winter they are both UTC+0 and it is *still* 0 -- and a place like Auckland
 * is +13 or +12, so the hour difference changes while the day offset does not.
 * Only the day matters for "should I call them now".
 */
export function dayOffset(zone: string, at: Date): number {
    const zoneDay = dayInZone(zone, at);
    const localDay = dayInZone(localZone(), at);
    if (zoneDay === localDay) return 0;

    // Different weekday names within the same zone are impossible, so the only
    // way to get here is a day boundary. Comparing against yesterday and
    // tomorrow settles the direction without any date arithmetic.
    const yesterday = new Date(at.getTime() - 24 * 60 * 60 * 1000);
    const tomorrow = new Date(at.getTime() + 24 * 60 * 60 * 1000);
    if (zoneDay === dayInZone(zone, tomorrow)) return 1;
    if (zoneDay === dayInZone(zone, yesterday)) return -1;
    return 0;
}

/** "Tomorrow", "Yesterday", or null when it is the same day over there. */
export function dayLabel(zone: string, at: Date): string | null {
    const offset = dayOffset(zone, at);
    return offset > 0 ? 'Tomorrow' : offset < 0 ? 'Yesterday' : null;
}

/**
 * "+5h", "-3h", or '' for the local zone.
 *
 * Read from `timeZoneName: 'longOffset'`, which asks the platform for the
 * offset *at this instant* rather than trying to infer it. The earlier approach
 * of formatting a wall-clock time in both zones and subtracting two parsed
 * strings looks equivalent and is not: it has to guess which calendar day to
 * compare, and it is wrong for exactly the half hour after a DST change where
 * the two zones' offsets no longer differ by a whole number of hours.
 *
 * Asking the runtime is also the only version that can say "half past" is wrong
 * in the right way -- some zones are UTC+05:45, and a schema of whole hours
 * cannot represent Kathmandu.
 */
export function utcOffsetLabel(zone: string, at: Date): string {
    if (zone === localZone()) return '';
    const minutes = offsetMinutes(zone, at);
    if (minutes === null) return '';
    if (minutes === 0) return 'same';
    const sign = minutes > 0 ? '+' : '-';
    const abs = Math.abs(minutes);
    // Drop the minutes part only when there is none. "+5:45" is the truth for
    // Kathmandu and rounding it to "+6h" would be a worse answer than useless.
    if (abs % 60 === 0) return `${sign}${abs / 60}h`;
    return `${sign}${Math.floor(abs / 60)}:${String(abs % 60).padStart(2, '0')}`;
}

/** The zone's offset from UTC in minutes at `at`, or null if unknowable. */
export function offsetMinutes(zone: string, at: Date): number | null {
    if (!isValidZone(zone)) return null;
    try {
        const parts = new Intl.DateTimeFormat('en-US', {
            timeZone: zone,
            timeZoneName: 'longOffset',
        }).formatToParts(at);
        const raw = parts.find(part => part.type === 'timeZoneName')?.value ?? '';
        // "GMT+05:45" / "GMT-03:30" / "GMT". Anything else means the runtime
        // does not implement longOffset, which is reported as unknown rather
        // than guessed at.
        const match = /^GMT([+-])(\d{1,2})(?::(\d{2}))?$/.exec(raw);
        if (!match) return null;
        const [, sign, hours, mins] = match;
        const total = Number(hours) * 60 + Number(mins ?? 0);
        return sign === '-' ? -total : total;
    } catch {
        return null;
    }
}

/**
 * "19:30 in Tokyo is 11:30 in London".
 *
 * Used by the converter, which takes a wall-clock time in one zone and reads it
 * back in another. The round trip through a UTC instant is what makes it
 * correct across DST: the time is anchored to today's date in the source zone,
 * then rendered everywhere else.
 */
export function convertTime(sourceZone: string, targetZone: string, hour: number, minute: number, at: Date): string {
    const guess = new Date(at.getFullYear(), at.getMonth(), at.getDate(), hour, minute, 0, 0);
    // Find the UTC instant at which the source zone reads exactly `hour:minute`
    // on that date. Two passes converge for every real zone because offsets
    // change in whole minutes; the second pass corrects a first guess that
    // landed on the wrong side of the offset.
    let instant = guess.getTime();
    for (let pass = 0; pass < 2; pass++) {
        const shown = timeInZone(sourceZone, new Date(instant));
        const [h, m] = shown.split(':').map(Number);
        const drift = (h * 60 + m) - (hour * 60 + minute);
        instant -= drift * 60 * 1000;
    }
    return timeInZone(targetZone, new Date(instant));
}