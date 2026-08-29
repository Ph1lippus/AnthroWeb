import { useEffect, useState } from 'react';
import { getUserSettings } from '../services/profileService';
import type { UserSettings } from '../services/profileService';

export const useUserSettings = (): { settings: UserSettings | null } => {
    const [settings, setSettings] = useState<UserSettings | null>(null);

    useEffect(() => {
        let active = true;
        getUserSettings().then(s => {
            if (active) setSettings(s);
        });
        return () => {
            active = false;
        };
    }, []);

    return { settings };
};