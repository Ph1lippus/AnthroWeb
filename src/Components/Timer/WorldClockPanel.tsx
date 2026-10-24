import React, { useEffect, useState } from 'react';
import { Globe, Plus, X } from 'lucide-react';
import ConfirmModal from '../ConfirmModal';

const STORAGE_KEY = 'anthroweb:world-clocks';

const getUserTimeZone = (): string => {
    try {
        return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    } catch {
        return 'UTC';
    }
};

const DEFAULT_TZ = getUserTimeZone();

const loadZones = (): string[] => {
    const valid = new Set(typeof Intl !== 'undefined' && 'supportedValuesOf' in Intl
        ? (Intl as { supportedValuesOf: (key: string) => string[] }).supportedValuesOf('timeZone')
        : []);
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (!raw) return [DEFAULT_TZ];
        const parsed = JSON.parse(raw);
        const zones = Array.isArray(parsed)
            ? parsed.filter((z): z is string => typeof z === 'string' && (z === DEFAULT_TZ || valid.has(z)))
            : [];
        if (!zones.includes(DEFAULT_TZ)) zones.unshift(DEFAULT_TZ);
        return zones;
    } catch {
        return [DEFAULT_TZ];
    }
};

const saveZones = (zones: string[]) => {
    try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(zones));
    } catch {
        // ignore
    }
};

const formatTime = (tz: string, now: Date): string =>
    now.toLocaleTimeString(undefined, {
        timeZone: tz,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
    });

interface WorldClockPanelProps {
    activeTz: string | null;
    mainTz: string | null;
    inUse: boolean;
    onSelect: (tz: string | null) => void;
    onSelectMain?: (tz: string | null) => void;
    onUse?: () => void;
}

const WorldClockPanel: React.FC<WorldClockPanelProps> = ({ activeTz, mainTz, inUse, onSelect, onSelectMain, onUse }) => {
    const [zones, setZones] = useState<string[]>(loadZones);
    const [newZone, setNewZone] = useState('');
    const [selectedZone, setSelectedZone] = useState('');
    const [now, setNow] = useState(() => new Date());
    const [showForm, setShowForm] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
    const allZones = typeof Intl !== 'undefined' && 'supportedValuesOf' in Intl
        ? (Intl as { supportedValuesOf: (key: string) => string[] }).supportedValuesOf('timeZone')
        : [];

    useEffect(() => {
        const id = window.setInterval(() => setNow(new Date()), 1000);
        return () => window.clearInterval(id);
    }, []);

    useEffect(() => {
        saveZones(zones);
    }, [zones]);

    const addZone = () => {
        const zone = selectedZone;
        if (!zone || zones.includes(zone)) return;
        setZones(prev => [...prev, zone]);
        setNewZone('');
        setSelectedZone('');
        setShowForm(false);
    };

    const removeZone = (tz: string) => {
        if (tz === DEFAULT_TZ) return;
        setZones(prev => prev.filter(z => z !== tz));
        if (activeTz === tz) onSelect(null);
        setDeleteTarget(null);
    };

    if (activeTz) {
        return (
            <section className={`card puzzle-card timer-mosaic__cell${inUse ? ' timer-mode-card--on' : ' dim-until-hover'}`} style={inUse ? { opacity: 1 } : undefined}>
                <div className="books-top-bar" style={{ marginBottom: '0.5rem' }}>
                    <h3 className="card-title" style={{ margin: 0, fontSize: '0.95rem', whiteSpace: 'nowrap' }}>World clock</h3>
                    <div className="daily-log-daynav" style={{ justifyContent: 'flex-end' }}>
                        <button type="button" className="daily-log-daynav-btn" onClick={() => onSelect(null)} data-tip="Back to list">
                            <X size={14} />
                        </button>
                    </div>
                </div>
                <div className="card-body" style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '0.8rem', opacity: 0.7, marginBottom: '0.25rem' }}>
                        {activeTz === DEFAULT_TZ ? `${DEFAULT_TZ} (Default)` : activeTz.replace(/_/g, ' ')}
                    </div>
                    <div style={{ fontSize: '2.5rem', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
                        {formatTime(activeTz, now)}
                    </div>
                </div>
            </section>
        );
    }

    return (
        <>
            <section className={`card puzzle-card timer-mosaic__cell${inUse ? ' timer-mode-card--on' : ' dim-until-hover'}`} style={inUse ? { opacity: 1 } : undefined}>
                <div className="books-top-bar" style={{ marginBottom: '0.5rem', flexWrap: 'nowrap' }}>
                    <h3 className="card-title" style={{ margin: 0, fontSize: '0.95rem', whiteSpace: 'nowrap' }}>World clock</h3>
                    <div className="daily-log-daynav" style={{ justifyContent: 'flex-end', gap: '0.5rem' }}>
                        <button
                            type="button"
                            className={`timer-chip${inUse ? ' timer-chip--on' : ''}`}
                            onClick={() => { onSelectMain?.(DEFAULT_TZ); onUse?.(); }}
                            data-tip={inUse ? 'Active' : 'Use'}
                            aria-pressed={inUse}
                        >
                            {inUse ? 'Active' : 'Use'}
                        </button>
                        <button type="button" className="daily-log-daynav-btn" onClick={() => setShowForm(true)} data-tip="Add world clock">
                            <Plus size={14} />
                        </button>
                    </div>
                </div>
                <div className="card-body">
                    {zones.length === 0 ? (
                        <p className="timer-empty-hint">No world clocks yet. Add a time zone.</p>
                    ) : (
                        <div className="academic-scroll" style={{ maxHeight: 220 }}>
                            {zones.map(tz => (
                                <div key={tz} className="course-row" style={{ opacity: mainTz && mainTz !== tz ? 0.45 : 1, transition: 'opacity 0.2s' }}>
                                    <div className="course-head">
                                        <div className="course-head__text">
                                            <span className="course-title">{tz === DEFAULT_TZ ? `${DEFAULT_TZ} (Default)` : tz.replace(/_/g, ' ')}</span>
                                            <span className="course-sub">{formatTime(tz, now)}</span>
                                        </div>
                                        <span className="flex gap-1">
                                            <button
                                                type="button"
                                                className="book-action-btn"
                                                onClick={() => (onSelectMain ? onSelectMain(tz) : onSelect(tz))}
                                                data-tip="Use"
                                            >
                                                <Globe size={14} />
                                            </button>
                                            {tz !== DEFAULT_TZ && (
                                                <button
                                                    type="button"
                                                    className="book-action-btn book-action-btn--danger"
                                                    onClick={() => setDeleteTarget(tz)}
                                                    data-tip="Remove"
                                                >
                                                    <X size={14} />
                                                </button>
                                            )}
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </section>

            {showForm && (
                <div className="import-modal-overlay" onClick={() => setShowForm(false)}>
                    <div className="import-modal-card" onClick={event => event.stopPropagation()}>
                        <h3>Add world clock</h3>
                        <form onSubmit={event => { event.preventDefault(); addZone(); }}>
                            <div className="mb-4">
                                <label className="form-label">Time zone</label>
                                <input
                                    type="text"
                                    className="form-control"
                                    value={newZone}
                                    onChange={event => {
                                        setNewZone(event.target.value);
                                        setSelectedZone('');
                                    }}
                                    placeholder="Search time zones…"
                                    autoFocus
                                />
                                <div className="academic-scroll" style={{ maxHeight: 180, marginTop: '0.5rem' }}>
                                    {allZones
                                        .filter(tz => !zones.includes(tz))
                                        .filter(tz => tz.toLowerCase().includes(newZone.toLowerCase()))
                                        .slice(0, 50)
                                        .map(tz => (
                                            <button
                                                type="button"
                                                key={tz}
                                                className="book-action-btn"
                                                style={{ width: '100%', justifyContent: 'flex-start', textAlign: 'left', padding: '0.35rem 0.5rem' }}
                                                onClick={() => setSelectedZone(tz)}
                                            >
                                                {selectedZone === tz ? '✓ ' : ''}{tz.replace(/_/g, ' ')}
                                            </button>
                                        ))}
                                </div>
                                {selectedZone && (
                                    <p className="timer-empty-hint" style={{ marginTop: '0.5rem' }}>
                                        Selected: {selectedZone.replace(/_/g, ' ')}
                                    </p>
                                )}
                            </div>
                            <div className="flex gap-2 justify-end mt-5">
                                <button type="button" className="btn-form-cancel" onClick={() => setShowForm(false)}>
                                    Cancel
                                </button>
                                <button type="submit" className="btn-form-submit" disabled={!selectedZone}>
                                    Add
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            <ConfirmModal
                open={!!deleteTarget}
                title={`Remove ${deleteTarget?.replace(/_/g, ' ') ?? ''}?`}
                confirmLabel="Remove"
                danger
                busy={false}
                onConfirm={() => { if (deleteTarget) removeZone(deleteTarget); }}
                onCancel={() => setDeleteTarget(null)}
            />
        </>
    );
};

export default WorldClockPanel;