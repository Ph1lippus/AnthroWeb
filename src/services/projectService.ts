import { supabase } from './supabaseClient';

// Project types
export interface Project {
    id?: string;
    user_id: string;
    title: string;
    description?: string;
    notes?: string;
    status: 'planned' | 'active' | 'paused' | 'completed' | 'archived';
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
    status?: 'planned' | 'active' | 'paused' | 'completed' | 'archived';
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
            status: project.status || 'planned',
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

// Project Plan Item types
export interface ProjectPlanItem {
    id?: string;
    project_id: string;
    user_id: string;
    title: string;
    description?: string;
    is_completed: boolean;
    order_index: number;
    created_at?: string;
    updated_at?: string;
}

// Export projects to CSV format
export const exportProjectsToCSV = (projects: Project[]): string => {
    const headers = ['title', 'description', 'status', 'priority', 'deadline', 'notes'];
    const escapeCsvField = (field: string | number | undefined): string => {
        if (field === undefined || field === null) return '';
        const str = String(field);
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
            return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
    };
    const rows = projects.map(project => [
        escapeCsvField(project.title),
        escapeCsvField(project.description),
        escapeCsvField(project.status),
        escapeCsvField(project.priority),
        escapeCsvField(project.deadline),
        escapeCsvField(project.notes)
    ].join(','));
    
    return [headers.join(','), ...rows].join('\n');
};

// Parse and import projects from CSV
export const importProjectsFromCSV = async (csvContent: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('No user found');

    const lines = csvContent.trim().split('\n');
    const projectsToCreate: Partial<Project>[] = [];

    for (let i = 1; i < lines.length; i++) {
        if (!lines[i].trim()) continue; // Skip empty lines
        
        // Parse CSV line handling quoted fields
        const parts = parseCsvLine(lines[i]);
        
        const title = parts[0] || '';
        const description = parts[1] || undefined;
        const status = (parts[2] || 'planned') as Project['status'];
        const priority = (parts[3] || 'medium') as Project['priority'];
        const deadline = parts[4] || undefined;
        const notes = parts[5] || undefined;
        
        if (title && title.trim()) {
            projectsToCreate.push({
                user_id: user.id,
                title: title.trim(),
                description,
                status,
                priority,
                deadline: deadline || undefined,
                notes: notes || undefined,
            });
        }
    }

    if (projectsToCreate.length === 0) return [];

    const { data, error } = await supabase
        .from('projects')
        .insert(projectsToCreate)
        .select();

    if (error) {
        console.error('Error importing projects:', error.message);
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

// Project Plan Items CRUD operations
export const getProjectPlanItems = async (projectId: string): Promise<ProjectPlanItem[]> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    const { data, error } = await supabase
        .from('project_plan_items')
        .select('*')
        .eq('project_id', projectId)
        .eq('user_id', user.id)
        .order('order_index', { ascending: true });

    if (error) {
        console.error('Error fetching plan items:', error.message);
        return [];
    }

    return data as ProjectPlanItem[];
};

export const createProjectPlanItem = async (item: {
    project_id: string;
    title: string;
    description?: string;
    order_index?: number;
}) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('No user found');

    const { data, error } = await supabase
        .from('project_plan_items')
        .insert({
            user_id: user.id,
            project_id: item.project_id,
            title: item.title,
            description: item.description,
            is_completed: false,
            order_index: item.order_index || 0,
        })
        .select()
        .single();

    if (error) {
        console.error('Error creating plan item:', error.message);
        throw error;
    }
    return data;
};

export const updateProjectPlanItem = async (id: string, updates: Partial<ProjectPlanItem>) => {
    const { data, error } = await supabase
        .from('project_plan_items')
        .update({
            ...updates,
            updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single();

    if (error) {
        console.error('Error updating plan item:', error.message);
        throw error;
    }
    return data;
};

export const deleteProjectPlanItem = async (id: string) => {
    const { error } = await supabase
        .from('project_plan_items')
        .delete()
        .eq('id', id);

    if (error) {
        console.error('Error deleting plan item:', error.message);
        throw error;
    }
};

export const toggleProjectPlanItemComplete = async (id: string, isCompleted: boolean) => {
    return updateProjectPlanItem(id, { is_completed: !isCompleted });
};
