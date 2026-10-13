import { supabase, getCurrentUserId } from './supabaseClient';
import { openRows, sealExistingRow } from './vault/rows';
import { isVaultOpen } from './vault/keyring';

export interface DailyLog {
    id?: string;
    user_id?: string;
    log_date: string;
    wake_time?: string | null;
    bedtime?: string | null;
    sleep_duration?: number | null;
    morning_systolic?: number | null;
    morning_diastolic?: number | null;
    morning_bpm?: number | null;
    evening_systolic?: number | null;
    evening_diastolic?: number | null;
    evening_bpm?: number | null;
    body_temperature?: number | null;
    calories?: number | null;
    protein?: number | null;
    carbs?: number | null;
    fat?: number | null;
    water?: number | null;
    project_work_done?: boolean;
    daily_score?: number | null;
    /**
     * Subjective 1-10 mood, once per end of the day. Set from the journal page,
     * which is where the writing for each half of the day already lives.
     *
     * Replaced the single `mood` column in 0014. Both are nullable and always
     * were meant to be: a day with only an evening rating is a real day, and
     * coercing a missing reading to a midpoint would drag every average toward
     * calm. Read them through `utils/moodSeries` rather than averaging by hand.
     */
    morning_mood?: number | null;
    evening_mood?: number | null;
    journal_entry?: string | null;
    journal_morning?: string | null;
    journal_evening?: string | null;
    journal_links?: string[] | null;
    created_at?: string;
    updated_at?: string;
    goal_snapshot?: Record<string, unknown> | null;
    sleep_quality?: number | null;
    morning_routine?: boolean;
    evening_routine?: boolean;
    fruit_serving?: boolean;
    studied?: boolean;
    journal?: boolean;
    stretching?: boolean;
    reading?: boolean;
    no_sleep?: boolean;
    /**
     * A day off the food plan: the four food macros are stored exactly as typed
     * but are left out of the day's score. Hydration still counts -- see
     * `computeDailyScore` for why.
     */
    cheat_day?: boolean;
    // Written by the workout pages (setGymForDate), never by this service, so
    // the habit score and the workout heatmap stay one fact rather than two.
    gym?: boolean;
}

// Fetch all daily logs for current user
//
// `select('*')`, which used to be a named column list.
//
// The named list was there for a good reason and the reason still holds: the
// mind-charts page builds its graph out of the journal columns and both mood
// ratings, and the dashboard needs the readings, so all of it comes back in one
// query rather than two. What changed is that with the vault on, the sensitive
// columns are *not* where they used to be -- they are inside the sealed `vault`
// blob, and `id` is needed to address each row's payload. A named list that
// omitted `vault` would return rows with every private field null and no error
// at all, which is the silent-data-loss shape this file is careful about. `*`
// plus an open is both shorter and the only correct option.
export const getUserDailyLogs = async (): Promise<DailyLog[]> => {
    const userId = await getCurrentUserId();
    if (!userId) return [];

    const { data, error } = await supabase
        .from('daily_logs')
        .select('*')
        .eq('user_id', userId)
        .order('log_date', { ascending: false });

    if (error) {
        console.error('Error fetching daily logs:', error.message);
        return [];
    }

    const { rows } = await openRows<DailyLog>('daily_logs', (data ?? []) as DailyLog[], userId);
    return rows;
};

// Fetch a single daily log by date for current user
/**
 * `null` means "this day has no row". A failure throws.
 *
 * These used to be the same answer, which made a dropped connection
 * indistinguishable from a blank day -- and a caller that fills a form from this
 * responds to `null` by clearing it. A transient error therefore read as "this
 * day is empty", and the next autosave wrote that emptiness over the entry that
 * was there. Throwing keeps the two apart, and React Query's `retry` gets a
 * chance to recover before the page has been told anything.
 */
export const getDailyLogByDate = async (logDate: string): Promise<DailyLog | null> => {
    const userId = await getCurrentUserId();
    if (!userId) return null;

    // `maybeSingle`, not `single`: `single` reports "no rows" as an error, so
    // every visit to a day without a log printed a PGRST116 to the console.
    const { data, error } = await supabase
        .from('daily_logs')
        .select('*')
        .eq('user_id', userId)
        .eq('log_date', logDate)
        .maybeSingle();

    if (error) {
        console.error('Error fetching daily log by date:', error.message);
        throw error;
    }

    if (!data) return null;
    const { rows } = await openRows<DailyLog>('daily_logs', [data as DailyLog], userId);
    return rows[0] ?? null;
};

// Fetch a single daily log by id
/**
 * Scoped to the signed-in user, not just filtered by RLS.
 *
 * This reads by primary key alone, so the id in the URL was the whole of the
 * authorisation check on the client. Row level security is the real boundary
 * and should be the only one; the filter here is belt and braces, and it also
 * turns "not yours" into "not found" rather than letting the page open on
 * someone else's journal row and then autosave over it.
 */
export const getDailyLogById = async (id: string): Promise<DailyLog | null> => {
    const userId = await getCurrentUserId();
    if (!userId) return null;

    const { data, error } = await supabase
        .from('daily_logs')
        .select('*')
        .eq('id', id)
        .eq('user_id', userId)
        .maybeSingle();

    if (error) {
        console.error('Error fetching daily log:', error.message);
        return null;
    }

    if (!data) return null;
    const { rows } = await openRows<DailyLog>('daily_logs', [data as DailyLog], userId);
    return rows[0] ?? null;
};

// Create a daily log for a day, or overwrite it if that day already has one.
// Upserting against the (user_id, log_date) unique index means a second save
// for the same day updates instead of failing with a 23505 conflict.
export const createDailyLog = async (log: DailyLog) => {
    const userId = await getCurrentUserId();
    if (!userId) throw new Error('No user found');

    const row = {
        user_id: userId,
        log_date: log.log_date,
        wake_time: log.wake_time,
        bedtime: log.bedtime,
        sleep_duration: log.sleep_duration,
        morning_systolic: log.morning_systolic,
        morning_diastolic: log.morning_diastolic,
        morning_bpm: log.morning_bpm,
        evening_systolic: log.evening_systolic,
        evening_diastolic: log.evening_diastolic,
        evening_bpm: log.evening_bpm,
        body_temperature: log.body_temperature,
        calories: log.calories,
        protein: log.protein,
        carbs: log.carbs,
        fat: log.fat,
        water: log.water,
        project_work_done: log.project_work_done,
        daily_score: log.daily_score,
        morning_mood: log.morning_mood,
        evening_mood: log.evening_mood,
        journal_entry: log.journal_entry,
        journal_morning: log.journal_morning,
        journal_evening: log.journal_evening,
        journal_links: log.journal_links,
        goal_snapshot: log.goal_snapshot,
        sleep_quality: log.sleep_quality,
        // Built-in habits
        morning_routine: log.morning_routine,
        evening_routine: log.evening_routine,
        fruit_serving: log.fruit_serving,
        studied: log.studied,
        journal: log.journal,
        stretching: log.stretching,
        reading: log.reading,
        no_sleep: log.no_sleep,
        cheat_day: log.cheat_day,
    };

    /**
     * Sealing needs the row id, because the id is bound into the payload's
     * authenticated data -- that binding is what stops a sealed journal being
     * copied onto another day's row and opened there. An upsert can be creating
     * the row or overwriting it and the client does not know which until the
     * response comes back.
     *
     * So the id is looked up first, on the unique index this call is about to
     * write against. The common case -- autosaving a day that already exists --
     * resolves it and the payload is sealed in the same statement, with no
     * window at all in which the entry sits in the database unencrypted. The
     * first save of a day has no id to seal against, so it is inserted plainly
     * and sealed immediately after; see `resealLogRow`.
     */
    const { data: existing } = await supabase
        .from('daily_logs')
        .select('id')
        .eq('user_id', userId)
        .eq('log_date', log.log_date)
        .maybeSingle();

    const write: Record<string, unknown> = { ...row };
    if (existing?.id) {
        const sealed = await sealExistingRow('daily_logs', { ...row, id: existing.id }, userId);
        if (sealed.sealed && sealed.vault) {
            write.vault = sealed.vault;
            for (const key of Object.keys(sealed.blanks)) write[key] = sealed.blanks[key];
        }
    }

    const { data, error } = await supabase
        .from('daily_logs')
        .upsert(write, { onConflict: 'user_id,log_date' })
        .select()
        .single();

    if (error) {
        console.error('Error creating daily log:', error.message);
        throw error;
    }

    // Only reached when the row was created rather than overwritten.
    if (!existing?.id && data) await resealLogRow(data as DailyLog, userId);
    return data;
};

/**
 * Seal a row that was just created, once its id is known.
 *
 * The brief window between the insert and this call is the one place a sealed
 * app writes in the clear, and it exists only because the payload cannot be
 * bound to an id that has not been assigned. It is closed on the very next
 * statement rather than left open, and a failure here logs rather than throws:
 * the row is correct either way, and failing the save over a crypto problem
 * would lose the entry.
 */
const resealLogRow = async (log: DailyLog, userId: string): Promise<void> => {
    const { vault, blanks, sealed } = await sealExistingRow('daily_logs', log as unknown as object, userId);
    if (!sealed || !vault) return;
    const { error } = await supabase
        .from('daily_logs')
        .update({ vault, ...blanks })
        .eq('id', log.id!)
        .eq('user_id', userId);
    if (error) console.error('Could not seal a new daily log:', error.message);
};

// Update a daily log
export const updateDailyLog = async (id: string, updates: Partial<DailyLog>) => {
    /**
     * Fields that identify *which* row this is, never what is in it.
     *
     * `log_date` belongs here rather than being written, and that is not
     * tidiness. The upsert that creates a row needs the date to name it, but an
     * update addresses an existing row by id -- so sending `log_date` here only
     * ever means "also move this row to that date". Autosave closures carry a
     * `logDate` alongside the editor content they captured, and a slow request
     * is enough for the two to disagree; letting that through moved an entry to
     * the wrong day, or collided with the day that already had a row. The date
     * a row has is set when the row is created.
     */
    const excludedFields = ['user_id', 'id', 'log_date', 'created_at', 'updated_at'];
    const updateData: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(updates)) {
        if (!excludedFields.includes(key)) {
            updateData[key] = value;
        }
    }

    /**
     * Seal on the way out.
     *
     * `updates` is partial -- a habit tick carries no journal -- so it is merged
     * onto the stored row first. Sealing the partial on its own would produce a
     * payload describing only the fields that happened to change, and the next
     * read would reopen the row without the rest of it. This is the path the
     * journal page autosaves through, so getting it wrong loses entries.
     *
     * Skipped entirely when the vault is closed, which is every account that has
     * not set a PIN -- there is nothing to seal and nothing to read first.
     */
    const userId = await getCurrentUserId();
    let write: Record<string, unknown> = { ...updateData };

    if (userId && isVaultOpen()) {
        const existing = await getDailyLogById(id);
        if (existing) {
            const merged = { ...existing, ...updateData } as unknown as object;
            const sealed = await sealExistingRow('daily_logs', merged, userId);
            if (sealed.sealed && sealed.vault) {
                write = { ...updateData, vault: sealed.vault };
                // A private field named in `updateData` is in the payload now;
                // leaving its plaintext in the write would store both copies.
                for (const key of Object.keys(sealed.blanks)) {
                    if (key in updateData) write[key] = sealed.blanks[key];
                }
            }
        }
    }

    const { data, error } = await supabase
        .from('daily_logs')
        .update({
            ...write,
            updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .maybeSingle();

    if (error) {
        console.error('Error updating daily log:', error.message);
        throw error;
    }
    if (!data) {
        // RLS rejecting the row, or a deleted one. `.single()` reported this as a
        // 406 about JSON shape, which reads like a server fault rather than the
        // authorisation refusal it actually is.
        throw new Error('That entry could not be updated. It may have been deleted.');
    }
    if (!userId || !isVaultOpen()) return data;
    const { rows } = await openRows<DailyLog>('daily_logs', [data as DailyLog], userId);
    return rows[0] ?? null;
};

// The built-in habits, named as the columns they are stored in. `gym` is absent on
// purpose: it is written by the workout pages (setGymForDate), never from here.
export type DailyLogHabitColumn =
    | 'morning_routine'
    | 'evening_routine'
    | 'fruit_serving'
    | 'studied'
    | 'journal'
    | 'stretching'
    | 'reading'
    | 'project_work_done'
    | 'no_sleep'
    | 'cheat_day';

/**
 * Writes one built-in habit for one day, on its own.
 *
 * The habit checkboxes used to reach the database only through the page's
 * debounced whole-row autosave, which meant three things went wrong at once: a
 * tick sat in a timer instead of being saved, a refresh inside the debounce window
 * lost it outright, and every tick put the whole ~35 column row on the wire. Two
 * ticks in quick succession were two competing whole-row writes, so whichever
 * response landed last won -- which could be the older one, silently undoing a
 * habit the user had already ticked.
 *
 * A habit is a single boolean column, so it is written as a single boolean
 * column. The upsert against (user_id, log_date) creates the day's row when this
 * is the first thing entered on it, and PostgREST only sets the columns in the
 * payload, so nothing else on the row moves. Two different habits can therefore
 * be written at the same moment without either clobbering the other, and the
 * page's own autosave still rewrites the whole row a moment later to bring
 * `daily_score` and the day's project links back in step with the tick.
 */
export const setDailyLogHabit = async (
    logDate: string,
    habit: DailyLogHabitColumn,
    completed: boolean
): Promise<void> => {
    const userId = await getCurrentUserId();
    if (!userId) throw new Error('No user found');

    const { error } = await supabase
        .from('daily_logs')
        .upsert(
            { user_id: userId, log_date: logDate, [habit]: completed },
            { onConflict: 'user_id,log_date' },
        );

    if (error) {
        console.error(`Error saving the ${habit} habit:`, error.message);
        throw error;
    }
};

// Delete a daily log
export const deleteDailyLog = async (id: string) => {
    const { error } = await supabase
        .from('daily_logs')
        .delete()
        .eq('id', id);

    if (error) {
        console.error('Error deleting daily log:', error.message);
        throw error;
    }
};

// Save project associations for a daily log (replaces existing associations)
export const saveDailyLogProjects = async (dailyLogId: string, projectIds: string[]) => {
    const userId = await getCurrentUserId();
    if (!userId) throw new Error('No user found');

    // Delete existing associations
    const { error: deleteError } = await supabase
        .from('daily_log_projects')
        .delete()
        .eq('daily_log_id', dailyLogId);

    if (deleteError) {
        console.error('Error deleting daily log projects:', deleteError.message);
        throw deleteError;
    }

    // Insert new associations
    if (projectIds.length > 0) {
        const { error: insertError } = await supabase
            .from('daily_log_projects')
            .insert(
                projectIds.map(projectId => ({
                    daily_log_id: dailyLogId,
                    project_id: projectId,
                    user_id: userId,
                }))
            );

        if (insertError) {
            console.error('Error saving daily log projects:', insertError.message);
            throw insertError;
        }
    }
};

// Get project IDs associated with a daily log
export const getDailyLogProjects = async (dailyLogId: string): Promise<string[]> => {
    const { data, error } = await supabase
        .from('daily_log_projects')
        .select('project_id')
        .eq('daily_log_id', dailyLogId);

    if (error) {
        console.error('Error fetching daily log projects:', error.message);
        return [];
    }

    return data.map(item => item.project_id);
};
