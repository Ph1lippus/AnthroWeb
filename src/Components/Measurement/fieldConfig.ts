export interface MeasurementFieldMeta {
    id: string;
    label: string;
    group: 'core' | 'arms' | 'legs';
    unit: string;
    step: string;
    help?: string;
}

export const MEASUREMENT_FIELDS: MeasurementFieldMeta[] = [
    { id: 'weight', label: 'Weight', group: 'core', unit: 'kg', step: '0.1', help: 'Bodyweight — falls back to the latest daily-log weight if empty.' },
    { id: 'neck', label: 'Neck', group: 'core', unit: 'cm', step: '0.1' },
    { id: 'shoulders', label: 'Shoulders', group: 'core', unit: 'cm', step: '0.1' },
    { id: 'chest', label: 'Chest', group: 'core', unit: 'cm', step: '0.1' },
    { id: 'waist', label: 'Waist', group: 'core', unit: 'cm', step: '0.1', help: 'navel level, relaxed' },
    { id: 'hips', label: 'Hips', group: 'core', unit: 'cm', step: '0.1', help: 'widest point' },

    { id: 'wrist_left', label: 'Wrist (Left)', group: 'arms', unit: 'cm', step: '0.1' },
    { id: 'wrist_right', label: 'Wrist (Right)', group: 'arms', unit: 'cm', step: '0.1' },
    { id: 'forearm_left_relaxed', label: 'Forearm Relaxed (Left)', group: 'arms', unit: 'cm', step: '0.1' },
    { id: 'forearm_right_relaxed', label: 'Forearm Relaxed (Right)', group: 'arms', unit: 'cm', step: '0.1' },
    { id: 'forearm_left_flexed', label: 'Forearm Flexed (Left)', group: 'arms', unit: 'cm', step: '0.1' },
    { id: 'forearm_right_flexed', label: 'Forearm Flexed (Right)', group: 'arms', unit: 'cm', step: '0.1' },
    { id: 'bicep_left_relaxed', label: 'Bicep Relaxed (Left)', group: 'arms', unit: 'cm', step: '0.1' },
    { id: 'bicep_right_relaxed', label: 'Bicep Relaxed (Right)', group: 'arms', unit: 'cm', step: '0.1' },
    { id: 'bicep_left_flexed', label: 'Bicep Flexed (Left)', group: 'arms', unit: 'cm', step: '0.1', help: 'cold, not pumped' },
    { id: 'bicep_right_flexed', label: 'Bicep Flexed (Right)', group: 'arms', unit: 'cm', step: '0.1', help: 'cold, not pumped' },

    { id: 'thigh_left', label: 'Thigh (Left)', group: 'legs', unit: 'cm', step: '0.1' },
    { id: 'thigh_right', label: 'Thigh (Right)', group: 'legs', unit: 'cm', step: '0.1' },
    { id: 'calf_left', label: 'Calf (Left)', group: 'legs', unit: 'cm', step: '0.1' },
    { id: 'calf_right', label: 'Calf (Right)', group: 'legs', unit: 'cm', step: '0.1' },
];

export const GROUP_ORDER: MeasurementFieldMeta['group'][] = ['core', 'arms', 'legs'];
export const GROUP_LABELS: Record<MeasurementFieldMeta['group'], string> = {
    core: 'Core & Torso',
    arms: 'Arms',
    legs: 'Legs',
};

export const FIELD_UNIT = (id: string): string =>
    MEASUREMENT_FIELDS.find(f => f.id === id)?.unit ?? '';