import { supabase } from './supabaseClient';

// Project types
export interface Project {
    id?: string;
    user_id: string;
    title: string;
    description?: string;
    notes?: string;
    status: 'active' | 'paused' | 'completed' | 'archived';
    progress: number;
    priority: 'low' | 'medium' | 'high';
    started_at?: string;
    deadline?: string;
    completed_at?: string;
    created_at?: string;
    updated_at?: string;
}

// Fetch all projects for current user
export const getUserProjects = async (): Promise<Project[]> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    const allProjects: Project[] = [];
    const pageSize = 1000;
    let page = 0;
    let hasMore = true;

    while (hasMore) {
        const from = page * pageSize;
        const to = from + pageSize - 1;

        const { data, error } = await supabase
            .from('projects')
            .select('*')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })
            .range(from, to);

        if (error) {
            console.error('Error fetching projects:', error.message);
            break;
        }

        if (data && data.length > 0) {
            allProjects.push(...(data as Project[]));
            hasMore = data.length === pageSize;
            page++;
        } else {
            hasMore = false;
        }
    }

    return allProjects;
};

// Create a new project
export const createProject = async (project: {
    title: string;
    description?: string;
    notes?: string;
    status?: 'active' | 'paused' | 'completed' | 'archived';
    progress?: number;
    priority?: 'low' | 'medium' | 'high';
    started_at?: string;
    deadline?: string;
}) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('No user found');

    const { data, error } = await supabase
        .from('projects')
        .insert({
            user_id: user.id,
            title: project.title,
            description: project.description,
            notes: project.notes,
            status: project.status || 'active',
            progress: project.progress || 0,
            priority: project.priority || 'medium',
            started_at: project.started_at,
            deadline: project.deadline,
        })
        .select()
        .single();

    if (error) {
        console.error('Error creating project:', error.message);
        throw error;
    }
    return data;
};

// Update a project
export const updateProject = async (id: string, updates: Partial<Project>) => {
    const { data, error } = await supabase
        .from('projects')
        .update({
            ...updates,
            updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single();

    if (error) {
        console.error('Error updating project:', error.message);
        throw error;
    }
    return data;
};

// Delete a project
export const deleteProject = async (id: string) => {
    const { error } = await supabase
        .from('projects')
        .delete()
        .eq('id', id);

    if (error) {
        console.error('Error deleting project:', error.message);
        throw error;
    }
};

// Update project progress
export const updateProjectProgress = async (id: string, progress: number) => {
    const clampedProgress = Math.max(0, Math.min(100, progress));
    const status = clampedProgress >= 100 ? 'completed' : 'active';

    return updateProject(id, {
        progress: clampedProgress,
        status,
        completed_at: status === 'completed' ? new Date().toISOString().split('T')[0] : undefined,
    });
};