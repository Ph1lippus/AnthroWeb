import React from 'react';
import { BellRing, Smartphone, Volume2, Waves } from 'lucide-react';
import { CHIMES, type ChimeId, type TimerSettings } from '../../utils/timerMath';

interface SettingsPanelProps {
    settings: TimerSettings;
    onChange: (patch: Partial<TimerSettings>) => void;
    /** Called when a sound is chosen, so the choice can be heard immediately. */
    onPreview: (id: ChimeId) => void;
    /** True while the browser has refused notifications, to explain the toggle. */
    notificationsBlocked: boolean;
}

/** A labelled on/off row. The app has no switch primitive, so this builds one. */
const SwitchRow: React.FC<{
    label: string;
    hint: string;
    on: boolean;
    onToggle: () => void;
    disabled?: boolean;
}> = ({ label, hint, on, onToggle, disabled }) => (
    <div className="timer-setting">
        <div className="timer-setting__text">
            <span className="timer-setting__label">{label}</span>
            <span className="timer-setting__hint">{hint}</span>
        </div>
        {/* A real button rather than a styled checkbox, so it is reachable by
            keyboard and announces its state -- `role="switch"` is what makes a
            screen reader say "on"/"off" rather than nothing. */}
        <button
            type="button"
            role="switch"
            aria-checked={on}
            aria-label={label}
            className={`timer-switch${on ? ' timer-switch--on' : ''}`}
            onClick={onToggle}
            disabled={disabled}
        />
    </div>
);

/**
 * Sound and behaviour preferences.
 *
 * The four switches are not equal in what they can promise, and the hints say
 * so. "Keep screen on" and "vibrate" depend on the browser and the device
 * granting something the page cannot grant itself; "sound" always works. Hiding
 * that behind identical-looking toggles is how a feature ends up looking broken,
 * so the hint on each one states what it actually does.
 */
const SettingsPanel: React.FC<SettingsPanelProps> = ({
    settings, onChange, onPreview, notificationsBlocked,
}) => (
    <div className="timer-block">
        <div className="timer-block__head">
            <h3 className="timer-block__title">
                <Volume2 size={14} aria-hidden="true" /> Sound
            </h3>
        </div>

        <div className="timer-sounds">
            {CHIMES.map(chime => (
                <button
                    key={chime.id}
                    type="button"
                    className={`timer-sound${settings.chime === chime.id ? ' timer-sound--on' : ''}`}
                    onClick={() => {
                        onChange({ chime: chime.id });
                        onPreview(chime.id);
                    }}
                    aria-pressed={settings.chime === chime.id}
                    data-tip={`Play ${chime.label.toLowerCase()}`}
                >
                    <Waves size={15} aria-hidden="true" />
                    {chime.label}
                </button>
            ))}
        </div>

        <div className="timer-field" style={{ marginTop: '0.85rem' }}>
            <label className="form-label" htmlFor="timer-volume">
                Volume
            </label>
            <input
                id="timer-volume"
                className="timer-range"
                type="range"
                min={0}
                max={100}
                step={1}
                value={Math.round(settings.volume * 100)}
                onChange={event => onChange({ volume: Number(event.target.value) / 100 })}
            />
        </div>

        <div style={{ marginTop: '0.5rem' }}>
            <SwitchRow
                label="Vibrate"
                hint="Pulses the phone when a timer ends. Needs the VIBRATE permission on Android."
                on={settings.vibrate}
                onToggle={() => onChange({ vibrate: !settings.vibrate })}
            />
            <SwitchRow
                label="Notifications"
                hint={
                    notificationsBlocked
                        ? 'Blocked for this site, so you will get the sound and this screen but no system notification.'
                        : 'A system notification, so a timer that ends in another tab still tells you.'
                }
                on={settings.notify && !notificationsBlocked}
                onToggle={() => onChange({ notify: !settings.notify })}
                disabled={notificationsBlocked}
            />
            <SwitchRow
                label="Keep screen on"
                hint="Holds the display awake while something is running. Re-acquired when you come back to the tab."
                on={settings.keepAwake}
                onToggle={() => onChange({ keepAwake: !settings.keepAwake })}
            />
            <SwitchRow
                label="Show hundredths"
                hint="Stopwatch only. The extra digits make the count-up look like a precision instrument."
                on={settings.hundredths}
                onToggle={() => onChange({ hundredths: !settings.hundredths })}
            />
        </div>

        {/* Stated rather than implied. The limit is a permissions decision, not a
            bug, and somebody setting a 6am alarm deserves to know now rather than
            when it does not go off. */}
        <p className="timer-empty-hint" style={{ textAlign: 'left', marginTop: '0.75rem' }}>
            <Smartphone size={11} aria-hidden="true" style={{ verticalAlign: '-1px', marginRight: '0.25rem', opacity: 0.6 }} />
            Alarms and timers run while the app is open or in a background tab.
            Firing with the app closed needs an OS-level alarm, which this build
            has no permission for.
        </p>

        <p className="timer-empty-hint" style={{ textAlign: 'left' }}>
            <BellRing size={11} aria-hidden="true" style={{ verticalAlign: '-1px', marginRight: '0.25rem', opacity: 0.6 }} />
            Presets, alarms and these settings follow you between devices. A running
            timer does not, because it belongs to the machine it is running on.
        </p>
    </div>
);

export default SettingsPanel;