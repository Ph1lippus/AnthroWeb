export type WeightUnit = 'kg' | 'lbs';

export const KG_PER_LBS = 0.45359237;

// Convert a weight stored in the given unit into canonical kilograms.
export const toKg = (value: number, unit: WeightUnit): number =>
    unit === 'lbs' ? Number((value * KG_PER_LBS).toFixed(2)) : value;

// Convert a canonical kilogram value into the target display unit.
export const fromKg = (value: number, unit: WeightUnit): number =>
    unit === 'lbs' ? Number((value / KG_PER_LBS).toFixed(1)) : value;

// Format a canonical kg value as a string in the display unit.
export const formatWeight = (kg: number, unit: WeightUnit, digits = 1): string =>
    `${fromKg(kg, unit).toFixed(digits)} ${unit}`;

export const round1 = (value: number): number => Math.round(value * 10) / 10;