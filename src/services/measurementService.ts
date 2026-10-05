import { supabase, getCurrentUserId } from './supabaseClient';
import { buildCompositionPayload } from '../utils/compositionPayload';
import type { MeasurementInput } from '../utils/measurementCalculations';

/**
 * How a body-fat percentage was obtained.
 *
 * `navy` is the odd one out: it is derived from circumference measurements by
 * the US Navy method rather than read off anything. Kept distinct so the chart
 * and the score can tell an estimate from a measurement.
 */
export type BodyFatMethod = 'scale' | 'calipers' | 'navy' | 'manual';

export interface BodyMeasurement extends MeasurementInput {
    id?: string;
    user_id?: string;
    measure_date: string;
    /**
     * Body fat percentage. Migration 0013.
     *
     * A real column, because there was nowhere to put a number you actually read.
     * The Navy circumference method has always derived one into `fat_mass` --
     * stored as weight x bodyFat% / 100 -- so before this the only way to see a
     * body fat percentage for a measurement was to divide it back out.
     */
    body_fat?: number | null;
    /**
     * How `body_fat` was arrived at. Migration 0013.
     *
     * Without it a tape estimate is indistinguishable from a weigh-in, which
     * matters most when the two disagree. Null means unknown, which is the honest
     * default for a column added to existing rows.
     */
    body_fat_method?: BodyFatMethod | null;
    waist_hip_ratio?: number | null;
    waist_height_ratio?: number | null;
    shoulder_waist_ratio?: number | null;
    shoulder_chest_ratio?: number | null;
    shoulder_hip_ratio?: number | null;
    thigh_calf_ratio?: number | null;
    bicep_ratio?: number | null;
    bicep_flexing_symmetry?: number | null;
    forearm_symmetry?: number | null;
    lean_body_mass?: number | null;
    fat_mass?: number | null;
    bmr?: number | null;
    ffmi?: number | null;
    adonis_index?: number | null;
    torso_taper?: number | null;
    leg_torso_ratio?: number | null;
    metabolic_age?: number | null;
    muscle_quality?: number | null;
    dynamic_strength?: number | null;
    created_at?: string;
    updated_at?: string;
}

// All measurement snapshots, oldest first (for trend charts).
export const getBodyMeasurements = async (): Promise<BodyMeasurement[]> => {
    const userId = await getCurrentUserId();
    if (!userId) return [];

    const { data, error } = await supabase
        .from('body_measurements')
        .select('*')
        .eq('user_id', userId)
        .order('measure_date', { ascending: true });

    if (error) {
        console.error('Error fetching body measurements:', error.message);
        return [];
    }
    return data as BodyMeasurement[];
};

export const getBodyMeasurementByDate = async (date: string): Promise<BodyMeasurement | null> => {
    const userId = await getCurrentUserId();
    if (!userId) return null;

    const { data, error } = await supabase
        .from('body_measurements')
        .select('*')
        .eq('user_id', userId)
        .eq('measure_date', date)
        .single();

    if (error) {
        if (error.code === 'PGRST116') return null;
        console.error('Error fetching body measurement:', error.message);
        return null;
    }
    return data as BodyMeasurement;
};

export const getLatestMeasurement = async (): Promise<BodyMeasurement | null> => {
    const userId = await getCurrentUserId();
    if (!userId) return null;

    // Deliberately not .single(). Asking PostgREST for a single JSON object when
    // the account has no measurement rows answers 406 (PGRST116, "JSON object
    // requested, multiple (or no) rows returned") -- a red console error on every
    // single page load for exactly the users least likely to know why. Selecting
    // an array and taking the first element returns 200 either way.
    const { data, error } = await supabase
        .from('body_measurements')
        .select('*')
        .eq('user_id', userId)
        .order('measure_date', { ascending: false })
        .limit(1);

    if (error) {
        console.error('Error fetching latest body measurement:', error.message);
        return null;
    }
    const rows = data as BodyMeasurement[] | null;
    return rows?.[0] ?? null;
};

// Insert a new snapshot, or update the existing one for that date
// (one snapshot per user per day via the uq_body_measurements_user_date index).
export const saveBodyMeasurement = async (m: BodyMeasurement): Promise<BodyMeasurement | null> => {
    const userId = await getCurrentUserId();
    if (!userId) throw new Error('No user found');

    const payload = {
        user_id: userId,
        measure_date: m.measure_date,
        ...rawMeasurementFields(m),
        ...derivedMeasurementFields(m),
    };

    const { data, error } = await supabase
        .from('body_measurements')
        .upsert(payload, { onConflict: 'user_id,measure_date' })
        .select()
        .single();

    if (error) {
        console.error('Error saving body measurement:', error.message);
        throw error;
    }

    return data as BodyMeasurement;
};

export const deleteBodyMeasurement = async (id: string) => {
    const { error } = await supabase
        .from('body_measurements')
        .delete()
        .eq('id', id);

    if (error) {
        console.error('Error deleting body measurement:', error.message);
        throw error;
    }
};

// Derived touches a lot of columns; keep the payload building explicit.
const rawMeasurementFields = (m: BodyMeasurement) => ({
    weight: m.weight ?? null,
    body_fat: m.body_fat ?? null,
    body_fat_method: m.body_fat ?? null ? m.body_fat_method ?? null : null,
    wrist_left: m.wrist_left ?? null,
    wrist_right: m.wrist_right ?? null,
    neck: m.neck ?? null,
    shoulders: m.shoulders ?? null,
    chest: m.chest ?? null,
    forearm_left_relaxed: m.forearm_left_relaxed ?? null,
    forearm_left_flexed: m.forearm_left_flexed ?? null,
    forearm_right_relaxed: m.forearm_right_relaxed ?? null,
    forearm_right_flexed: m.forearm_right_flexed ?? null,
    bicep_left_relaxed: m.bicep_left_relaxed ?? null,
    bicep_left_flexed: m.bicep_left_flexed ?? null,
    bicep_right_relaxed: m.bicep_right_relaxed ?? null,
    bicep_right_flexed: m.bicep_right_flexed ?? null,
    waist: m.waist ?? null,
    hips: m.hips ?? null,
    thigh_left: m.thigh_left ?? null,
    thigh_right: m.thigh_right ?? null,
    calf_left: m.calf_left ?? null,
    calf_right: m.calf_right ?? null,
});

const derivedMeasurementFields = (m: BodyMeasurement) => ({
    waist_hip_ratio: m.waist_hip_ratio ?? null,
    waist_height_ratio: m.waist_height_ratio ?? null,
    shoulder_waist_ratio: m.shoulder_waist_ratio ?? null,
    shoulder_chest_ratio: m.shoulder_chest_ratio ?? null,
    shoulder_hip_ratio: m.shoulder_hip_ratio ?? null,
    thigh_calf_ratio: m.thigh_calf_ratio ?? null,
    bicep_ratio: m.bicep_ratio ?? null,
    bicep_flexing_symmetry: m.bicep_flexing_symmetry ?? null,
    forearm_symmetry: m.forearm_symmetry ?? null,
    lean_body_mass: m.lean_body_mass ?? null,
    fat_mass: m.fat_mass ?? null,
    bmr: m.bmr ?? null,
    ffmi: m.ffmi ?? null,
    adonis_index: m.adonis_index ?? null,
    torso_taper: m.torso_taper ?? null,
    leg_torso_ratio: m.leg_torso_ratio ?? null,
    metabolic_age: m.metabolic_age ?? null,
    muscle_quality: m.muscle_quality ?? null,
    dynamic_strength: m.dynamic_strength ?? null,
});

/**
 * The latest weight on record.
 *
 * Reads `body_measurements`, which is where weight lives. It used to read
 * `daily_logs.weight` -- a column that no longer exists -- and its name always
 * said measurements while its body said daily log, so the Measurements page
 * prefilled from the wrong table and the two drifted apart.
 */
export const getLatestWeightForMeasurement = async (): Promise<number | null> => {
    const userId = await getCurrentUserId();
    if (!userId) return null;

    const { data, error } = await supabase
        .from('body_measurements')
        .select('weight')
        .eq('user_id', userId)
        .not('weight', 'is', null)
        .order('measure_date', { ascending: false })
        .limit(1);

    if (error) {
        console.error('Error fetching latest weight:', error.message);
        return null;
    }
    return data[0]?.weight ?? null;
};

/**
 * Records a weight and/or body fat for one date, leaving the rest of that day's
 * measurement alone.
 *
 * `saveBodyMeasurement` cannot be used for this. It builds its payload from the
 * whole `BodyMeasurement` shape and nulls every field it was not given, so
 * writing a morning weight through it would blank the circumference measurements
 * for the same day -- and vice versa, filling in a tape measurement would wipe a
 * weight. This sends only the columns actually being written, which is what
 * makes it safe to call from a form that knows nothing about circumferences.
 *
 * `undefined` and `null` mean different things, and the difference is the whole
 * point of having a second writer:
 *
 * - `undefined` -- not mentioned, leave the column alone. This is what keeps a
 *   two-box Daily Log from deleting the tape measurements recorded for the same
 *   date.
 * - `null` -- write the null. An emptied box means the reading is gone, and it
 *   has to be removable from here as well as from the Measurements page,
 *   otherwise a mistyped weight is wedged in forever.
 */
export const logBodyComposition = async (input: {
    measure_date: string;
    weight?: number | null;
    body_fat?: number | null;
    body_fat_method?: BodyFatMethod | null;
}): Promise<BodyMeasurement | null> => {
    const userId = await getCurrentUserId();
    if (!userId) return null;

    const payload = buildCompositionPayload(userId, input.measure_date, input);
    if (input.body_fat !== undefined) {
        payload.body_fat = input.body_fat;
        // A body fat that has been removed takes its method with it, or a cleared
        // reading would go on claiming it was measured on a scale.
        payload.body_fat_method = input.body_fat === null ? null : input.body_fat_method ?? 'manual';
    }

    const { data, error } = await supabase
        .from('body_measurements')
        .upsert(payload, { onConflict: 'user_id,measure_date' })
        .select()
        .single();

    if (error) {
        console.error('Error logging body composition:', error.message);
        return null;
    }
    return data as BodyMeasurement;
};
