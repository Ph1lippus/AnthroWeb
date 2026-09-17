import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { FileOpener } from '@capawesome-team/capacitor-file-opener';

const GITHUB_REPO = 'Ph1lippus/AnthroWeb';

export interface UpdateInfo {
    version: string;
    url: string;
    notes: string;
}

export const isCapacitorApp = (): boolean => {
    return Capacitor.isNativePlatform();
};

const parseVersion = (v: string): number[] => {
    return v
        .replace(/^v/i, '')
        .trim()
        .split('.')
        .map(n => parseInt(n, 10))
        .filter(n => !isNaN(n));
};

const isNewer = (current: string | null, latest: string): boolean => {
    if (!current) return false;
    const a = parseVersion(current);
    const b = parseVersion(latest);
    const len = Math.max(a.length, b.length);
    for (let i = 0; i < len; i++) {
        const x = a[i] || 0;
        const y = b[i] || 0;
        if (x < y) return true;
        if (x > y) return false;
    }
    return false;
};

export const getCurrentVersion = async (): Promise<string | null> => {
    if (!isCapacitorApp()) return null;
    try {
        const info = await App.getInfo();
        return info.version || null;
    } catch {
        return null;
    }
};

export const fetchLatestUpdate = async (): Promise<UpdateInfo | null> => {
    try {
        const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`);
        if (!res.ok) return null;
        const data = await res.json();
        const version = (data.tag_name || '').replace(/^v/i, '');
        if (!version) return null;
        const asset = (data.assets || []).find((a: { name: string }) => a.name && a.name.endsWith('.apk'));
        if (!asset) return null;
        return {
            version,
            url: asset.browser_download_url,
            notes: data.body || '',
        };
    } catch {
        return null;
    }
};

export const checkForUpdate = async (): Promise<{ update: UpdateInfo; current: string | null } | null> => {
    if (!isCapacitorApp()) return null;
    const current = await getCurrentVersion();
    const latest = await fetchLatestUpdate();
    if (!latest) return null;
    if (!isNewer(current, latest.version)) return null;
    return { update: latest, current };
};

const fileToBase64 = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const result = (reader.result as string) || '';
            resolve(result.split(',')[1] || result);
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
};

export const downloadAndInstall = async (url: string): Promise<void> => {
    const fileName = 'anthroweb-update.apk';

    const response = await fetch(url);
    if (!response.ok) throw new Error('Download failed');
    const blob = await response.blob();
    const data = await fileToBase64(blob);

    await Filesystem.writeFile({
        path: fileName,
        data,
        directory: Directory.Cache,
        recursive: true,
    });

    const uri = await Filesystem.getUri({ path: fileName, directory: Directory.Cache });
    await FileOpener.openFile({ path: uri.uri });
};
