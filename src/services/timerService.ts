import { supabase } from './supabaseClient';
import { normalizeIntervalConfig, normalizeSettings, type ChimeId, type IntervalConfig, type TimerSettings } from '../utils/timerMath';

/**
 * Presets, alarms and preferences.
 *
 * Everything here is configuration that should follow the user between devices,
 * and it is the *only* thing that is. The running timer is deliberately not in
 * this file -- its deadline lives in `localStorage` so the display can paint on
 * the first frame without a network round-trip. See `useTimerEngine`.
 *
 * Reads swallow their errors and return the empty case, writes throw. That is
 * the house pattern across every service in `src/services`, and it is why each
 * caller pairs this with a toast on the write path and an empty state on the
 * read path.
 */

export interface TimerPreset {
    id: string;
    user_id: string;
    label: string;
    kind: 'countdown' | 'interval';
    seconds: number | null;
    work_seconds: number | null;
    rest_seconds: number | null;
    long_rest_seconds: number | null;
    rounds_before_long: number | null;
    total_rounds: number | null;
    position: number;
}

export interface TimerAlarm {
    id: string;
    user_id: string;
    label: string;
    hour: number;
    minute: number;
    days_of_week: number[];
    enabled: boolean;
    sound: ChimeId;
    position: number;
}

/** What the client actually reads a preset as. */
export interface NormalizedPreset {
    id: string;
    label: string;
    kind: 'countdown' | 'interval';
    /** Countdown only. */
    durationMs: number;
    /** Interval only. */
    config: IntervalConfig;
}

type PresetRow = {
    id: string;
    user_id: string;
    label: string;
    kind: 'countdown' | 'interval';
    seconds: number | null;
    work_seconds: number | null;
    rest_seconds: number | null;
    long_rest_seconds: number | null;
    rounds_before_long: number | null;
    total_rounds: number | null;
    position: number;
};

/**
 * Turn a row into something the UI can render without a branch.
 *
 * The database already guarantees a countdown row has `seconds` and no interval
 * columns, but "guaranteed" is a property of the schema and the persisted React
 * Query cache can outlive it -- a row written by an older build, or a schema
 * that has been edited since. Reading through the same normalizer the interval
 * editor uses means a malformed row degrades to a usable default instead of
 * rendering `null:00`.
 */
export function normalizePreset(row: PresetRow): NormalizedPreset {
    const config = normalizeIntervalConfig({
        workSec: row.work_seconds,
        restSec: row.rest_seconds,
        longRestSec: row.long_rest_seconds,
        roundsBeforeLong: row.rounds_before_long,
        totalRounds: row.total_rounds,
    });
    return {
        id: row.id,
        label: row.label,
        kind: row.kind,
        durationMs: (row.seconds ?? config.workSec) * 1000,
        config,
    };
}

// ============================================================================
// PRESETS
// ============================================================================

export const getTimerPresets = async (): Promise<TimerPreset[]> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    const { data, error } = await supabase
        .from('timer_presets')
        .select('*')
        .eq('user_id', user.id)
        .order('position', { ascending: true });

    if (error) {
        console.error('Error fetching timer presets:', error.message);
        return [];
    }
    return (data ?? []) as TimerPreset[];
};

/**
 * Insert a preset, taking the next position itself.
 *
 * Positions are computed here rather than passed in. They are only ever
 * "after everything that already exists", so making the caller supply one means
 * every call site repeats the same query and every repetition is a chance to
 * write it differently.
 */
export const createTimerPreset = async (preset: Omit<NormalizedPreset, 'id'>): Promise<TimerPreset> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('No user found');

    const { data: existing } = await supabase
        .from('timer_presets')
        .select('position')
        .eq('user_id', user.id)
        .order('position', { ascending: false })
        .limit(1);

    const position = ((existing?.[0]?.position ?? -1) + 1);

    /**
     * Built as one object with every field spelled out, rather than as two
     * literals chosen by a ternary.
     *
     * The two branches have different types -- `seconds: number` against
     * `seconds: null` -- and Supabase infers its insert type from the first one it
     * sees, so the second is a type error. One object literal has a single type,
     * which is also the only shape the `timer_presets_shape_exclusive` CHECK
     * describes: a countdown carries a duration and nulls everywhere else, an
     * interval the reverse. Writing it once makes that symmetry impossible to
     * break on one side only.
     */
    const payload = {
        user_id: user.id,
        label: preset.label,
        kind: preset.kind,
        position,
        seconds: preset.kind === 'countdown'
            ? Math.max(1, Math.round(preset.durationMs / 1000))
            : null,
        work_seconds: preset.kind === 'interval' ? preset.config.workSec : null,
        rest_seconds: preset.kind === 'interval' ? preset.config.restSec : null,
        long_rest_seconds: preset.kind === 'interval' ? preset.config.longRestSec : null,
        rounds_before_long: preset.kind === 'interval' ? preset.config.roundsBeforeLong : null,
        total_rounds: preset.kind === 'interval' ? preset.config.totalRounds : null,
    };

    const { data, error } = await supabase
        .from('timer_presets')
        .insert(payload)
        .select()
        .single();

    if (error) {
        console.error('Error creating timer preset:', error.message);
        throw error;
    }
    return data as TimerPreset;
};

export const updateTimerPreset = async (id: string, preset: Omit<NormalizedPreset, 'id'>): Promise<TimerPreset> => {
    // Same single-literal reasoning as the insert, without `user_id`/`position`.
    const payload = {
        label: preset.label,
        kind: preset.kind,
        seconds: preset.kind === 'countdown'
            ? Math.max(1, Math.round(preset.durationMs / 1000))
            : null,
        work_seconds: preset.kind === 'interval' ? preset.config.workSec : null,
        rest_seconds: preset.kind === 'interval' ? preset.config.restSec : null,
        long_rest_seconds: preset.kind === 'interval' ? preset.config.longRestSec : null,
        rounds_before_long: preset.kind === 'interval' ? preset.config.roundsBeforeLong : null,
        total_rounds: preset.kind === 'interval' ? preset.config.totalRounds : null,
    };

    const { data, error } = await supabase
        .from('timer_presets')
        .update(payload)
        .eq('id', id)
        .select()
        .single();

    if (error) {
        console.error('Error updating timer preset:', error.message);
        throw error;
    }
    return data as TimerPreset;
};

export const deleteTimerPreset = async (id: string): Promise<void> => {
    const { error } = await supabase.from('timer_presets').delete().eq('id', id);
    if (error) {
        console.error('Error deleting timer preset:', error.message);
        throw error;
    }
};

// ============================================================================
// ALARMS
// ============================================================================

export const getTimerAlarms = async (): Promise<TimerAlarm[]> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    const { data, error } = await supabase
        .from('timer_alarms')
        .select('*')
        .eq('user_id', user.id)
        .order('position', { ascending: true });

    if (error) {
        console.error('Error fetching timer alarms:', error.message);
        return [];
    }
    return (data ?? []) as TimerAlarm[];
};

/**
 * What the client writes for an alarm.
 *
 * `days` here, `days_of_week` in the database -- the same rename the rest of the
 * app uses (`snake_case` at the boundary, camel-ish in the client) except here,
 * where `days` is also what `nextAlarmFire` calls the concept. One name in the
 * client makes that call site read the way the scheduling question is actually
 * phrased.
 */
export interface AlarmDraft {
    label: string;
    hour: number;
    minute: number;
    days: number[];
    enabled: boolean;
    sound: ChimeId;
}

/** Draft to row. The one place the day-list name changes. */
const draftToRow = (alarm: AlarmDraft) => ({
    label: alarm.label,
    hour: alarm.hour,
    minute: alarm.minute,
    days_of_week: alarm.days,
    enabled: alarm.enabled,
    sound: alarm.sound,
});

export const createTimerAlarm = async (alarm: AlarmDraft): Promise<TimerAlarm> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('No user found');

    const { data: existing } = await supabase
        .from('timer_alarms')
        .select('position')
        .eq('user_id', user.id)
        .order('position', { ascending: false })
        .limit(1);

    const position = ((existing?.[0]?.position ?? -1) + 1);

    const { data, error } = await supabase
        .from('timer_alarms')
        .insert({ ...draftToRow(alarm), user_id: user.id, position })
        .select()
        .single();

    if (error) {
        console.error('Error creating timer alarm:', error.message);
        throw error;
    }
    return data as TimerAlarm;
};

export const updateTimerAlarm = async (id: string, alarm: AlarmDraft): Promise<TimerAlarm> => {
    const { data, error } = await supabase
        .from('timer_alarms')
        .update(draftToRow(alarm))
        .eq('id', id)
        .select()
        .single();

    if (error) {
        console.error('Error updating timer alarm:', error.message);
        throw error;
    }
    return data as TimerAlarm;
};

export const deleteTimerAlarm = async (id: string): Promise<void> => {
    const { error } = await supabase.from('timer_alarms').delete().eq('id', id);
    if (error) {
        console.error('Error deleting timer alarm:', error.message);
        throw error;
    }
};

// ============================================================================
// SETTINGS
// ============================================================================

/**
 * The settings row, or null when there isn't one yet.
 *
 * Null rather than a defaulted object, because the two mean different things
 * and the page cares about the difference: null means "nothing saved yet", and
 * writing defaults on first read would make the row's existence the only
 * evidence a sync has ever happened.
 */
export const getTimerSettings = async (): Promise<TimerSettings | null> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const { data, error } = await supabase
        .from('timer_settings')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

    if (error) {
        console.error('Error fetching timer settings:', error.message);
        return null;
    }
    if (!data) return null;

    return normalizeSettings({
        chime: (data as { sound?: unknown }).sound,
        volume: (data as { volume?: unknown }).volume,
        vibrate: (data as { vibrate?: unknown }).vibrate,
        notify: (data as { notify?: unknown }).notify,
        keepAwake: (data as { keep_awake?: unknown }).keep_awake,
        hundredths: (data as { hundredths?: unknown }).hundredths,
    });
};

/**
 * Upsert the whole settings row.
 *
 * Written whole rather than column by column. Every value here comes from a
 * toggle or a slider the user just moved, so the row is small and always fully
 * known; a partial patch would only add a way for two fields to disagree about
 * which is newer.
 */
export const saveTimerSettings = async (settings: TimerSettings): Promise<void> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('No user found');

    const { error } = await supabase.from('timer_settings').upsert({
        user_id: user.id,
        sound: settings.chime,
        volume: settings.volume,
        vibrate: settings.vibrate,
        notify: settings.notify,
        keep_awake: settings.keepAwake,
        hundredths: settings.hundredths,
        updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' });

    if (error) {
        console.error('Error saving timer settings:', error.message);
        throw error;
    }
};