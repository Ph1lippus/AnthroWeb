import React, { useMemo } from 'react';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import type { BodyMeasurement } from '../../services/measurementService';
import { computeBodyCalculations } from '../../utils/measurementCalculations';
import { useUserSettings } from '../../hooks/useUserSettings';
import type { MeasurementContext } from './MeasurementEditor';

interface MeasurementChartsProps {
    records: BodyMeasurement[];
    context: MeasurementContext;
}

interface ChartDef {
    key: string;
    label: string;
    unit: string;
    width: number;
    accent: string;
}

const RAW_CHARTS: ChartDef[] = [
    { key: 'weight', label: 'Weight', unit: 'kg', width: 2, accent: 'var(--color-primary)' },
    { key: 'neck', label: 'Neck', unit: 'cm', width: 1, accent: '#4fd1ff' },
    { key: 'shoulders', label: 'Shoulders', unit: 'cm', width: 1, accent: '#4fd1ff' },
    { key: 'chest', label: 'Chest', unit: 'cm', width: 1, accent: '#4fd1ff' },
    { key: 'waist', label: 'Waist', unit: 'cm', width: 1, accent: '#ffa500' },
    { key: 'hips', label: 'Hips', unit: 'cm', width: 1, accent: '#4fd1ff' },
    { key: 'bicep_left_flexed', label: 'Bicep Flexed (Left)', unit: 'cm', width: 1, accent: '#a8e600' },
    { key: 'bicep_right_flexed', label: 'Bicep Flexed (Right)', unit: 'cm', width: 1, accent: '#a8e600' },
    { key: 'forearm_left_flexed', label: 'Forearm Flexed (Left)', unit: 'cm', width: 1, accent: '#a8e600' },
    { key: 'forearm_right_flexed', label: 'Forearm Flexed (Right)', unit: 'cm', width: 1, accent: '#a8e600' },
    { key: 'thigh_left', label: 'Thigh (Left)', unit: 'cm', width: 1, accent: '#a8e600' },
    { key: 'thigh_right', label: 'Thigh (Right)', unit: 'cm', width: 1, accent: '#a8e600' },
    { key: 'calf_left', label: 'Calf (Left)', unit: 'cm', width: 1, accent: '#a8e600' },
    { key: 'calf_right', label: 'Calf (Right)', unit: 'cm', width: 1, accent: '#a8e600' },
];

const DERIVED_CHARTS: ChartDef[] = [
    { key: 'body_fat_percent', label: 'Body Fat %', unit: '%', width: 2, accent: '#ff5f7e' },
    { key: 'lean_body_mass', label: 'Lean Body Mass', unit: 'kg', width: 2, accent: 'var(--color-primary)' },
    { key: 'fat_mass', label: 'Fat Mass', unit: 'kg', width: 2, accent: '#ff5f7e' },
    { key: 'bmr', label: 'BMR', unit: 'kcal', width: 1, accent: '#4fd1ff' },
    { key: 'ffmi', label: 'FFMI', unit: '', width: 2, accent: 'var(--color-primary)' },
    { key: 'metabolic_age', label: 'Metabolic Age', unit: 'yrs', width: 1, accent: '#c084fc' },
    { key: 'waist_hip_ratio', label: 'Waist-Hip Ratio', unit: '', width: 2, accent: '#c084fc' },
    { key: 'waist_height_ratio', label: 'Waist-Height Ratio', unit: '', width: 1, accent: '#c084fc' },
    { key: 'shoulder_waist_ratio', label: 'Shoulder-Waist Ratio', unit: '', width: 2, accent: 'var(--color-primary)' },
    { key: 'shoulder_chest_ratio', label: 'Shoulder-Chest Ratio', unit: '', width: 1, accent: '#4fd1ff' },
    { key: 'thigh_calf_ratio', label: 'Thigh-Calf Ratio', unit: '', width: 1, accent: '#a8e600' },
    { key: 'torso_taper', label: 'Torso Taper', unit: 'cm', width: 1, accent: 'var(--color-primary)' },
    { key: 'adonis_index', label: 'Adonis Index', unit: '', width: 2, accent: 'var(--color-primary)' },
    { key: 'muscle_quality', label: 'Muscle Quality', unit: '%', width: 1, accent: '#a8e600' },
    { key: 'dynamic_strength', label: 'Dynamic Strength', unit: '/100', width: 1, accent: '#ffa500' },
];

const fmtDate = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

const ChartCard: React.FC<{ def: ChartDef; data: Array<Record<string, number | string | null>> }> = ({ def, data }) => (
    <div className="measurement-chart-card">
        <div className="measurement-chart-card__head">
            <span className="measurement-chart-card__label">{def.label}</span>
            <span className="measurement-chart-card__unit">{def.unit}</span>
        </div>
        <ResponsiveContainer width="100%" height={140}>
            <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
                <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.5)' }} tickFormatter={fmtDate} minTickGap={24} />
                <YAxis domain={['auto', 'auto']} tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.5)' }} />
                <Tooltip
                    labelFormatter={(l) => fmtDate(String(l))}
                    formatter={(v) => [String(v), def.label]}
                    contentStyle={{ background: 'rgba(20,20,28,0.95)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, fontSize: 12 }}
                    itemStyle={{ color: '#fff' }}
                />
                <Line type="monotone" dataKey={def.key} name={def.label} stroke={def.accent} strokeWidth={def.width} dot={{ r: 2.5 }} activeDot={{ r: 4 }} connectNulls />
            </LineChart>
        </ResponsiveContainer>
    </div>
);

const MeasurementCharts: React.FC<MeasurementChartsProps> = ({ records, context }) => {
    const weightUnit = useUserSettings().settings?.weight_unit ?? 'kg';

    const data = useMemo(() => {
        return records.map(r => {
            const calc = computeBodyCalculations(
                { ...r },
                {
                    gender: (context.gender || '') as 'male' | 'female' | 'other' | 'prefer_not_to_say' | '',
                    height_cm: context.height_cm ?? null,
                    age: context.age ?? null,
                    relativeBestLift: context.relativeBestLift ?? null,
                }
            );
            const row: Record<string, number | string | null> = { date: r.measure_date };
            for (const def of [...RAW_CHARTS, ...DERIVED_CHARTS]) {
                const rawVal = r[def.key as keyof BodyMeasurement] as number | null | undefined;
                const derivedVal = calc[def.key as keyof typeof calc] as number | null | undefined;
                let val = rawVal != null ? rawVal : derivedVal ?? null;
                if (def.key === 'weight' && val != null && weightUnit !== 'kg') val = val * 2.20462;
                row[def.key] = val;
            }
            return row;
        });
    }, [records, context, weightUnit]);

    const chartData = (def: ChartDef) => data.filter(row => (row[def.key] as number | null) != null);

    const sections: Array<{ title: string; defs: ChartDef[] }> = [
        { title: 'Body Weight & Size', defs: RAW_CHARTS },
        { title: 'Composition & Ratios', defs: DERIVED_CHARTS },
    ];

    return (
        <div>
            {sections.map(section => {
                const visible = section.defs.filter(def => chartData(def).length >= 2);
                if (visible.length === 0) return null;
                return (
                    <div key={section.title} className="measurement-chart-section">
                        <h4 className="measurement-chart-section__title">{section.title}</h4>
                        <div className="measurement-chart-grid">
                            {visible.map(def => (
                                <ChartCard key={def.key} def={def} data={chartData(def)} />
                            ))}
                        </div>
                    </div>
                );
            })}
        </div>
    );
};

export default MeasurementCharts;