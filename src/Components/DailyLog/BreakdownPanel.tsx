import React from 'react';

export interface BreakdownChip {
    key: string;
    label: string;
    /** Already formatted for display. */
    value: string;
    /**
     * Whether this figure is actually there.
     *
     * `missing` draws the chip dimmed with a dash, which is the Daily Log's
     * unlogged treatment. `value` means the number came back from whatever
     * produced it -- the two pages differ on what that is, so they differ on
     * what they put in `tone`, not on how the chip looks.
     */
    tone: 'value' | 'missing';
    /** Dot and value colour. The daily log's score colour, or the accent. */
    color?: string;
}

export interface BreakdownGroup {
    key: string;
    title: string;
    count: string;
    chips: BreakdownChip[];
}

interface BreakdownPanelProps {
    expanded: boolean;
    groups: BreakdownGroup[];
}

/**
 * The collapsible category-and-chip panel below the score ring.
 *
 * Pulled out of ScoreCard so the measurements page draws the same thing rather
 * than a copy of its markup: same collapse animation, same category headings,
 * same chips. What fills it is the caller's -- a scored metric there, a derived
 * body figure here.
 */
const BreakdownPanel: React.FC<BreakdownPanelProps> = ({ expanded, groups }) => {
    return (
        <div
            className={`daily-score-breakdown ${expanded ? 'daily-score-breakdown--open' : ''}`}
            aria-hidden={!expanded}
        >
            <div className="daily-score-breakdown__inner">
                {groups.map(group => (
                    <div key={group.key} className="daily-score-category">
                        <div className="daily-score-category-head">
                            <span className="daily-score-category-title">{group.title}</span>
                            <span className="daily-score-category-count">{group.count}</span>
                        </div>
                        <div className="metric-chips">
                            {group.chips.map(chip => (
                                <span
                                    key={chip.key}
                                    className={'metric-chip' + (chip.tone === 'missing' ? ' metric-chip--unlogged' : '')}
                                >
                                    <span
                                        className="metric-chip-dot"
                                        style={chip.tone === 'value' ? { background: chip.color } : undefined}
                                    />
                                    <span className="metric-chip-label">{chip.label}</span>
                                    <span
                                        className="metric-chip-value"
                                        style={chip.tone === 'value' ? { color: chip.color } : undefined}
                                    >
                                        {chip.value}
                                    </span>
                                </span>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default BreakdownPanel;