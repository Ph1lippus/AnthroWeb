import React, { useCallback, useRef } from 'react';

export interface TabDefinition {
    /** Stable value written to the URL and compared to find the active panel. */
    id: string;
    label: string;
    /** Optional count or figure shown after the label, e.g. sessions logged. */
    badge?: string | number;
}

interface TabsProps {
    tabs: TabDefinition[];
    active: string;
    onChange: (id: string) => void;
    /** Marks the tab bar as controlling a panel further down the tree. */
    label?: string;
}

/**
 * The app's only tab bar.
 *
 * Built rather than borrowed because there wasn't one: `--tabs-dur` and
 * `--tabs-ease` have been sitting in `:root` since the workouts page used to be
 * six tabs, unused, with no `.tabs` rule anywhere. They are what this uses.
 *
 * The keyboard behaviour is the part that matters. A tab bar that cannot be
 * operated from the keyboard is worse than a row of buttons, because it looks
 * like one: arrows move between tabs, Home and End jump to the ends, and only
 * the selected tab is in the tab order, which is the whole point of the pattern.
 * The panel is referenced by `aria-controls` so a screen reader announces which
 * region a tab belongs to.
 */
const Tabs: React.FC<TabsProps> = ({ tabs, active, onChange, label = 'Sections' }) => {
    const listRef = useRef<HTMLDivElement>(null);

    const focusTab = useCallback((index: number) => {
        const buttons = listRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]');
        buttons?.[index]?.focus();
    }, []);

    const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
        const index = tabs.findIndex(tab => tab.id === active);
        if (index < 0) return;

        let next: number;
        switch (event.key) {
            case 'ArrowRight': next = (index + 1) % tabs.length; break;
            case 'ArrowLeft': next = (index - 1 + tabs.length) % tabs.length; break;
            case 'Home': next = 0; break;
            case 'End': next = tabs.length - 1; break;
            default: return;
        }

        event.preventDefault();
        onChange(tabs[next].id);
        focusTab(next);
    };

    return (
        <div className="tabs" role="tablist" aria-label={label} ref={listRef} onKeyDown={onKeyDown}>
            {tabs.map(tab => {
                const selected = tab.id === active;
                return (
                    <button
                        key={tab.id}
                        type="button"
                        role="tab"
                        id={`tab-${tab.id}`}
                        aria-selected={selected}
                        aria-controls={`panel-${tab.id}`}
                        /* Roving tabindex: the arrow keys are the way to move,
                           so only the selected tab is reachable by Tab itself. */
                        tabIndex={selected ? 0 : -1}
                        className={`tab${selected ? ' tab--active' : ''}`}
                        onClick={() => onChange(tab.id)}
                    >
                        {tab.label}
                        {tab.badge != null && <span className="tab__badge">{tab.badge}</span>}
                    </button>
                );
            })}
        </div>
    );
};

interface TabPanelProps {
    id: string;
    /** Hides the panel without unmounting it, so a form inside keeps its state. */
    hidden?: boolean;
    children: React.ReactNode;
}

/** The region a tab controls. Kept mounted and hidden so scroll and form state survive a tab switch. */
export const TabPanel: React.FC<TabPanelProps> = ({ id, hidden, children }) => (
    <div
        role="tabpanel"
        id={`panel-${id}`}
        aria-labelledby={`tab-${id}`}
        className="tab-panel"
        hidden={hidden}
    >
        {children}
    </div>
);

export default Tabs;