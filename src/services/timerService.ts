import { supabase } from './supabaseClient';
import { normalizeIntervalConfig, type ChimeId, type IntervalConfig } from '../utils/timerMath';

/**
 * Presets and alarms.
 *
 * Everything here is configuration that should follow the user between devices,
 * and it is the *only* thing that is. The running timer is deliberately not in
 * this file -- its deadline lives in `localStorage` so the display can paint on
 * the first frame without a network round-trip. See `useTimerEngine`.
 *
 * There is no settings section any more. The page had one, and it held a slider
 * and four switches for one sound and three behaviours; every one of those was a
 * way for a finished timer to say nothing, which is the failure this page exists
 * to prevent. The alert level is a constant and the rest is unconditional, so
 * there is nothing left to read, normalise or write -- and a `timer_settings` row
 * that nothing reads is a row that cannot go stale.
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
    /** Empty means one-shot: the next time that time comes round, and no more. */
    days: number[];
    enabled: boolean;
}

/**
 * Draft to row. The one place the day-list name changes.
 *
 * `sound` is written as a constant rather than taken from the draft, because the
 * form no longer asks for one -- there is a single chime, so the picker it used to
 * carry could only ever be answered the same way. It is written explicitly rather
 * than left to the column default so that an older row still carrying one of the
 * retired ids is normalised on its next edit, instead of keeping a sound nothing
 * can play.
 */
const draftToRow = (alarm: AlarmDraft) => ({
    label: alarm.label,
    hour: alarm.hour,
    minute: alarm.minute,
    days_of_week: alarm.days,
    enabled: alarm.enabled,
    sound: 'chime' as ChimeId,
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