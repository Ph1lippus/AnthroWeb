import React, { useMemo, useState } from 'react';
import { Globe2, Plus, X } from 'lucide-react';
import {
    CITIES,
    dayLabel,
    localZone,
    timeInZone,
    utcOffsetLabel,
} from '../../utils/worldClock';

/** The zones listed before the user picks any. One per major offset. */
const DEFAULT_VISIBLE = [
    'America/New_York',
    'America/Los_Angeles',
    'Europe/London',
    'Europe/Athens',
    'Asia/Dubai',
    'Asia/Kolkata',
    'Asia/Tokyo',
    'Australia/Sydney',
    'Pacific/Auckland',
];

interface WorldClockPanelProps {
    now: number;
}

/**
 * The current time in other places, plus a converter.
 *
 * Every row carries a day marker. That is the part that makes the panel usable
 * rather than decorative: "09:00 in Tokyo" alongside "23:00 in London" looks
 * like Tokyo is behind, and the whole point of checking is usually to work out
 * whether it is already tomorrow for whoever you are about to call. An hour
 * offset cannot answer that -- Auckland is +12 or +13 depending on the week and
 * the day offset does not move -- so the day is computed and shown separately
 * from the offset, never derived from it.
 *
 * Cities are stored by IANA zone id rather than by name, so "Europe/London"
 * survives a rename and `Intl` does the formatting. A city the browser does not
 * recognise is dropped rather than rendered, because `Intl` does not throw on an
 * unknown zone -- it silently formats in UTC, which looks like a real answer.
 */
const WorldClockPanel: React.FC<WorldClockPanelProps> = ({ now }) => {
    const local = localZone();
    const [extra, setExtra] = useState<string[]>([]);
    const [picking, setPicking] = useState(false);

    const at = useMemo(() => new Date(now), [now]);

    /**
     * The zones on screen: local, a short default spread, then whatever the user
     * added.
     *
     * Not all thirty-two cities by default. Every row is re-formatted five times
     * a second while anything is running, and a wall of thirty-two rows is a list
     * nobody scrolls to the end of anyway. The defaults span the offsets that
     * matter -- Americas, Europe, Asia, Australia -- and everything else is one
     * tap away.
     */
    const zones = useMemo(() => {
        const seen = new Set<string>([local]);
        const rows: { zone: string; city: string; country: string }[] = [
            { zone: local, city: 'Local', country: '' },
        ];
        for (const zone of DEFAULT_VISIBLE) {
            if (seen.has(zone)) continue;
            const match = CITIES.find(c => c.zone === zone);
            if (!match) continue;
            seen.add(zone);
            rows.push({ zone, city: match.name, country: match.country });
        }
        for (const zone of extra) {
            if (seen.has(zone)) continue;
            seen.add(zone);
            const match = CITIES.find(c => c.zone === zone);
            rows.push({ zone, city: match?.name ?? zone, country: match?.country ?? '' });
        }
        return rows;
    }, [local, extra]);

    const available = CITIES.filter(city => !extra.includes(city.zone));

    return (
        <div className="timer-block">
            <div className="timer-block__head">
                <h3 className="timer-block__title">
                    <Globe2 size={14} aria-hidden="true" /> World clock
                </h3>
                <div className="timer-block__actions">
                    <button
                        type="button"
                        className="book-action-btn"
                        onClick={() => setPicking(v => !v)}
                        data-tip={picking ? 'Cancel' : 'Pick a city'}
                        aria-label={picking ? 'Cancel picking a city' : 'Pick a city'}
                    >
                        {picking ? <X /> : <Plus />}
                    </button>
                </div>
            </div>

            {picking && (
                <div className="timer-chips" style={{ marginBottom: '0.75rem' }}>
                    {available.map(city => (
                        <button
                            key={city.zone}
                            type="button"
                            className="timer-chip"
                            onClick={() => {
                                setExtra([...extra, city.zone]);
                                setPicking(false);
                            }}
                        >
                            {city.name}
                        </button>
                    ))}
                    {available.length === 0 && (
                        <span className="timer-empty-hint">Every city is already listed.</span>
                    )}
                </div>
            )}

            <div className="timer-world-list">
                {zones.map(row => {
                    const marker = dayLabel(row.zone, at);
                    const offset = utcOffsetLabel(row.zone, at);
                    return (
                        <div
                            key={row.zone}
                            className={`timer-world${row.zone === local ? ' timer-world--local' : ''}`}
                        >
                            <div className="timer-world__place">
                                <span className="timer-world__city">
                                    {row.city}
                                    {row.country && (
                                        <span style={{ opacity: 0.45, fontWeight: 400 }}> · {row.country}</span>
                                    )}
                                </span>
                                <span className="timer-world__meta">
                                    {row.zone === local ? 'Your time zone' : `${offset} · ${row.zone.split('/').pop()?.replace(/_/g, ' ')}`}
                                </span>
                            </div>
                            <div className="timer-world__time">
                                <span className="timer-world__clock">{timeInZone(row.zone, at)}</span>
                                {marker && (
                                    <span className={`timer-world__day${marker === 'Yesterday' ? ' timer-world__day--past' : ''}`}>
                                        {marker}
                                    </span>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>

            <p className="timer-empty-hint" style={{ textAlign: 'left', marginTop: '0.6rem' }}>
                Times come from the browser's own timezone database, so they follow
                daylight saving automatically.
            </p>
        </div>
    );
};

export default WorldClockPanel;