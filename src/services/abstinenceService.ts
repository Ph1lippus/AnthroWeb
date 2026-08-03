import { supabase } from './supabaseClient';

// Abstinence Goal types
export interface AbstinenceGoal {
    id?: string;
    user_id: string;
    name: string;
    start_date: string;
    end_date?: string | null;
    target_days?: number | null;
    notes?: string;
    created_at?: string;
    updated_at?: string;
}

// Abstinence History types
export interface AbstinenceHistory {
    id?: string;
    user_id: string;
    name: string;
    start_date: string;
    end_date: string;
    duration_days: number;
    notes?: string;
    created_at?: string;
}

// Fetch all abstinence goals for current user
export const getUserAbstinenceGoals = async (): Promise<AbstinenceGoal[]> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    const allGoals: AbstinenceGoal[] = [];
    const pageSize = 1000;
    let page = 0;
    let hasMore = true;

    while (hasMore) {
        const from = page * pageSize;
        const to = from + pageSize - 1;

        const { data, error } = await supabase
            .from('abstinence_goals')
            .select('*')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })
            .range(from, to);

        if (error) {
            console.error('Error fetching abstinence goals:', error.message);
            break;
        }

        if (data && data.length > 0) {
            allGoals.push(...(data as AbstinenceGoal[]));
            hasMore = data.length === pageSize;
            page++;
        } else {
            hasMore = false;
        }
    }

    return allGoals;
};

// Fetch all abstinence history for current user
export const getUserAbstinenceHistory = async (): Promise<AbstinenceHistory[]> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    const allHistory: AbstinenceHistory[] = [];
    const pageSize = 1000;
    let page = 0;
    let hasMore = true;

    while (hasMore) {
        const from = page * pageSize;
        const to = from + pageSize - 1;

        const { data, error } = await supabase
            .from('abstinence_history')
            .select('*')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })
            .range(from, to);

        if (error) {
            console.error('Error fetching abstinence history:', error.message);
            break;
        }

        if (data && data.length > 0) {
            allHistory.push(...(data as AbstinenceHistory[]));
            hasMore = data.length === pageSize;
            page++;
        } else {
            hasMore = false;
        }
    }

    return allHistory;
};

// Create a new abstinence goal
export const createAbstinenceGoal = async (goal: {
    name: string;
    start_date?: string;
    end_date?: string | null;
    target_days?: number | null;
    notes?: string;
}) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('No user found');

    const { data, error } = await supabase
        .from('abstinence_goals')
        .insert({
            user_id: user.id,
            name: goal.name,
            start_date: goal.start_date || new Date().toISOString().split('T')[0],
            end_date: goal.end_date || null,
            target_days: goal.target_days || null,
            notes: goal.notes,
        })
        .select()
        .single();

    if (error) {
        console.error('Error creating abstinence goal:', error.message);
        throw error;
    }
    return data;
};

// Update an abstinence goal
export const updateAbstinenceGoal = async (id: string, updates: Partial<AbstinenceGoal>) => {
    const { data, error } = await supabase
        .from('abstinence_goals')
        .update({
            ...updates,
            updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single();

    if (error) {
        console.error('Error updating abstinence goal:', error.message);
        throw error;
    }
    return data;
};

// Delete an abstinence goal
export const deleteAbstinenceGoal = async (id: string) => {
    const { error } = await supabase
        .from('abstinence_goals')
        .delete()
        .eq('id', id);

    if (error) {
        console.error('Error deleting abstinence goal:', error.message);
        throw error;
    }
};

// End an abstinence goal (set end_date and move to history)
export const endAbstinenceGoal = async (goal: AbstinenceGoal): Promise<void> => {
    if (!goal.id) return;

    const endDate = new Date().toISOString().split('T')[0];
    const startDate = new Date(goal.start_date);
    const end = new Date(endDate);
    const durationDays = Math.floor((end.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));

    // Add to history
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('No user found');

    const { error: historyError } = await supabase
        .from('abstinence_history')
        .insert({
            user_id: user.id,
            name: goal.name,
            start_date: goal.start_date,
            end_date: endDate,
            duration_days: durationDays,
            notes: goal.notes,
        });

    if (historyError) {
        console.error('Error adding to abstinence history:', historyError.message);
        throw historyError;
    }

    // Delete the goal (or update with end_date)
    await deleteAbstinenceGoal(goal.id);
};

// Delete an abstinence history entry
export const deleteAbstinenceHistory = async (id: string) => {
    const { error } = await supabase
        .from('abstinence_history')
        .delete()
        .eq('id', id);

    if (error) {
        console.error('Error deleting abstinence history:', error.message);
        throw error;
    }
};

// Export abstinence goals to CSV format
export const exportAbstinenceToCSV = (goals: AbstinenceGoal[]): string => {
    const headers = ['name', 'start_date', 'end_date', 'target_days', 'notes'];
    const escapeCsvField = (field: string | number | undefined | null): string => {
        if (field === undefined || field === null) return '';
        const str = String(field);
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
            return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
    };
    const rows = goals.map(goal => [
        escapeCsvField(goal.name),
        escapeCsvField(goal.start_date),
        escapeCsvField(goal.end_date),
        escapeCsvField(goal.target_days),
        escapeCsvField(goal.notes)
    ].join(','));

    return [headers.join(','), ...rows].join('\n');
};

// Parse and import abstinence goals from CSV
export const importAbstinenceFromCSV = async (csvContent: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('No user found');

    const lines = csvContent.trim().split('\n');
    const goalsToCreate: Partial<AbstinenceGoal>[] = [];

    for (let i = 1; i < lines.length; i++) {
        if (!lines[i].trim()) continue;

        const parts = parseCsvLine(lines[i]);

        const name = parts[0] || '';
        const startDate = parts[1] || undefined;
        const endDate = parts[2] || null;
        const targetDays = parts[3] ? parseInt(parts[3]) : null;
        const notes = parts[4] || undefined;

        if (name && name.trim()) {
            goalsToCreate.push({
                user_id: user.id,
                name: name.trim(),
                start_date: startDate || new Date().toISOString().split('T')[0],
                end_date: endDate || null,
                target_days: targetDays,
                notes: notes || undefined,
            });
        }
    }

    if (goalsToCreate.length === 0) return [];

    const { data, error } = await supabase
        .from('abstinence_goals')
        .insert(goalsToCreate)
        .select();

    if (error) {
        console.error('Error importing abstinence goals:', error.message);
        throw error;
    }
    return data;
};

// Helper function to parse CSV line with proper quote handling
const parseCsvLine = (line: string): string[] => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const char = line[i];

        if (char === '"') {
            if (inQuotes && line[i + 1] === '"') {
                current += '"';
                i++;
            } else {
                inQuotes = !inQuotes;
            }
        } else if (char === ',' && !inQuotes) {
            result.push(current.trim());
            current = '';
        } else {
            current += char;
        }
    }
    result.push(current.trim());

    return result;
};