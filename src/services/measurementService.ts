import { supabase, getCurrentUserId } from './supabaseClient';
import type { MeasurementInput } from '../utils/measurementCalculations';

export interface BodyMeasurement extends MeasurementInput {
    id?: string;
    user_id?: string;
    measure_date: string;
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

    const { data, error } = await supabase
        .from('body_measurements')
        .select('*')
        .eq('user_id', userId)
        .order('measure_date', { ascending: false })
        .limit(1)
        .single();

    if (error) {
        if (error.code === 'PGRST116') return null;
        console.error('Error fetching latest body measurement:', error.message);
        return null;
    }
    return data as BodyMeasurement;
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

export const getLatestWeightForMeasurement = async (): Promise<number | null> => {
    const userId = await getCurrentUserId();
    if (!userId) return null;

    const { data, error } = await supabase
        .from('daily_logs')
        .select('weight')
        .eq('user_id', userId)
        .not('weight', 'is', null)
        .order('log_date', { ascending: false })
        .limit(1);

    if (error) {
        console.error('Error fetching latest weight:', error.message);
        return null;
    }
    return data[0]?.weight ?? null;
};