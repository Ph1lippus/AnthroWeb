export interface MeasurementFieldMeta {
    id: string;
    label: string;
    group: 'composition' | 'torso' | 'wrists' | 'forearms' | 'biceps' | 'thighs' | 'calves';
    unit: string;
    step: string;
    help?: string;
    /**
     * The other field drawn on this field's row, if it has one.
     *
     * Left and right are the same measurement of the same thing, so they share a
     * row rather than stacking -- the difference between two arms is the number,
     * not the two rows. A few unpaired fields are paired anyway where the reading
     * only makes sense beside its neighbour (chest against shoulders, waist
     * against hips, weight against body fat). The first of the pair omits this.
     */
    pair?: string;
    /**
     * Which arm this measures, drawn as a tag beside the label.
     *
     * Only the paired limbs have one. The unpaired rows -- chest beside
     * shoulders, waist beside hips -- read as one measurement and its context, so
     * a side tag there would be claiming a distinction that is not there.
     */
    side?: 'L' | 'R';
    /**
     * The short half of the label shown beside the side tag. The full name carries
     * the side, which the row already shows by position, so the box only needs the
     * noun.
     */
    shortLabel?: string;
}

export const MEASUREMENT_FIELDS: MeasurementFieldMeta[] = [
    { id: 'weight', label: 'Weight', group: 'composition', unit: 'kg', step: '0.1', pair: 'body_fat', help: 'Bodyweight — falls back to the last recorded weight if empty.' },
    { id: 'body_fat', label: 'Body Fat', group: 'composition', unit: '%', step: '0.1', help: 'Optional. Left empty, it is estimated from the tape measurements below.' },

    { id: 'neck', label: 'Neck', group: 'torso', unit: 'cm', step: '0.1' },
    { id: 'shoulders', label: 'Shoulders', group: 'torso', unit: 'cm', step: '0.1', pair: 'chest' },
    { id: 'chest', label: 'Chest', group: 'torso', unit: 'cm', step: '0.1' },
    { id: 'waist', label: 'Waist', group: 'torso', unit: 'cm', step: '0.1', pair: 'hips', help: 'navel level, relaxed' },
    { id: 'hips', label: 'Hips', group: 'torso', unit: 'cm', step: '0.1', help: 'widest point' },

    { id: 'wrist_left', label: 'Wrist (Left)', shortLabel: 'Wrist', side: 'L', group: 'wrists', unit: 'cm', step: '0.1', pair: 'wrist_right' },
    { id: 'wrist_right', label: 'Wrist (Right)', shortLabel: 'Wrist', side: 'R', group: 'wrists', unit: 'cm', step: '0.1' },

    { id: 'forearm_left_relaxed', label: 'Forearm Relaxed (Left)', shortLabel: 'Forearm Relaxed', side: 'L', group: 'forearms', unit: 'cm', step: '0.1', pair: 'forearm_right_relaxed' },
    { id: 'forearm_right_relaxed', label: 'Forearm Relaxed (Right)', shortLabel: 'Forearm Relaxed', side: 'R', group: 'forearms', unit: 'cm', step: '0.1' },
    { id: 'forearm_left_flexed', label: 'Forearm Flexed (Left)', shortLabel: 'Forearm Flexed', side: 'L', group: 'forearms', unit: 'cm', step: '0.1', pair: 'forearm_right_flexed' },
    { id: 'forearm_right_flexed', label: 'Forearm Flexed (Right)', shortLabel: 'Forearm Flexed', side: 'R', group: 'forearms', unit: 'cm', step: '0.1' },

    { id: 'bicep_left_relaxed', label: 'Bicep Relaxed (Left)', shortLabel: 'Bicep Relaxed', side: 'L', group: 'biceps', unit: 'cm', step: '0.1', pair: 'bicep_right_relaxed' },
    { id: 'bicep_right_relaxed', label: 'Bicep Relaxed (Right)', shortLabel: 'Bicep Relaxed', side: 'R', group: 'biceps', unit: 'cm', step: '0.1' },
    { id: 'bicep_left_flexed', label: 'Bicep Flexed (Left)', shortLabel: 'Bicep Flexed', side: 'L', group: 'biceps', unit: 'cm', step: '0.1', pair: 'bicep_right_flexed', help: 'cold, not pumped' },
    { id: 'bicep_right_flexed', label: 'Bicep Flexed (Right)', shortLabel: 'Bicep Flexed', side: 'R', group: 'biceps', unit: 'cm', step: '0.1', help: 'cold, not pumped' },

    { id: 'thigh_left', label: 'Thigh (Left)', shortLabel: 'Thigh', side: 'L', group: 'thighs', unit: 'cm', step: '0.1', pair: 'thigh_right' },
    { id: 'thigh_right', label: 'Thigh (Right)', shortLabel: 'Thigh', side: 'R', group: 'thighs', unit: 'cm', step: '0.1' },

    { id: 'calf_left', label: 'Calf (Left)', shortLabel: 'Calf', side: 'L', group: 'calves', unit: 'cm', step: '0.1', pair: 'calf_right' },
    { id: 'calf_right', label: 'Calf (Right)', shortLabel: 'Calf', side: 'R', group: 'calves', unit: 'cm', step: '0.1' },
];

/**
 * Reading order, top-to-bottom then left-to-right.
 *
 * A flat list rather than a split into named columns: the cards are placed into
 * the two-column grid in this order, so an odd-indexed group lands on the left and
 * an even-indexed one on the right. `Torso` and `Composition` therefore share the
 * top row, and each pair of left/right groups sits beneath the one above it.
 *
 * `Composition` is second rather than first deliberately -- it is two boxes
 * against `Torso`'s five, and leading with the shorter one leaves the top row
 * ragged on the side a reader starts from.
 */
export const GROUP_ORDER: MeasurementFieldMeta['group'][] = [
    'torso', 'composition', 'wrists', 'forearms', 'biceps', 'thighs', 'calves',
];

/**
 * The two mosaic columns.
 *
 * Split by rendered height rather than by group count, because the groups are not
 * the same size: `Torso` is five stacked boxes and `Wrists` is one. Left is
 * torso (5) + wrists (1) + forearms (2) = eight rows; right is composition (2) +
 * biceps (2) + thighs (1) + calves (1) = six. Balanced enough that the shorter
 * column does not finish a screen early.
 *
 * Reading the page goes down the left column then down the right, which walks the
 * body from the neck outward and then back down to the legs.
 */
export const GROUP_COLUMNS: MeasurementFieldMeta['group'][][] = [
    ['torso', 'wrists', 'forearms'],
    ['composition', 'biceps', 'thighs', 'calves'],
];

export const GROUP_LABELS: Record<MeasurementFieldMeta['group'], string> = {
    composition: 'Composition',
    torso: 'Torso',
    wrists: 'Wrists',
    forearms: 'Forearms',
    biceps: 'Biceps',
    thighs: 'Thighs',
    calves: 'Calves',
};

export const FIELD_UNIT = (id: string): string =>
    MEASUREMENT_FIELDS.find(f => f.id === id)?.unit ?? '';