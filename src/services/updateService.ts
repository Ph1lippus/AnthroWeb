import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { App } from '@capacitor/app';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { FileOpener } from '@capawesome-team/capacitor-file-opener';

const GITHUB_REPO = 'Ph1lippus/AnthroWeb';

export interface UpdateInfo {
    version: string;
    url: string;
    notes: string;
}

/**
 * A desktop update that is already checked and ready to install. The handle
 * owns the Tauri update object, so it must be closed when the user declines.
 */
export interface DesktopUpdate {
    version: string;
    notes: string;
    install: (onProgress?: (percent: number) => void) => Promise<void>;
    close: () => Promise<void>;
}

export type AppPlatform = 'android' | 'desktop' | 'web';

export const isCapacitorApp = (): boolean => {
    return Capacitor.isNativePlatform();
};

export const isTauriApp = (): boolean => {
    if (typeof window === 'undefined') return false;
    return '__TAURI_INTERNALS__' in window;
};

export const getAppPlatform = (): AppPlatform => {
    if (isCapacitorApp()) return 'android';
    if (isTauriApp()) return 'desktop';
    return 'web';
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
    if (isTauriApp()) {
        try {
            const { getVersion } = await import('@tauri-apps/api/app');
            return (await getVersion()) || null;
        } catch {
            return null;
        }
    }
    if (!isCapacitorApp()) return null;
    try {
        const info = await App.getInfo();
        return info.version || null;
    } catch {
        return null;
    }
};

interface GitHubAsset {
    name?: string;
    browser_download_url?: string;
}

interface GitHubRelease {
    tag_name?: string;
    body?: string;
    draft?: boolean;
    prerelease?: boolean;
    assets?: GitHubAsset[];
}

/**
 * Find the newest published release that actually contains an APK.
 *
 * This deliberately does not use `/releases/latest`: desktop releases are
 * published from the same repository, and GitHub's "latest" pointers at the
 * most recent release of any kind. A desktop release has no APK, so trusting
 * it would make Android report "no update" even when a newer APK exists.
 */
export const fetchLatestUpdate = async (): Promise<UpdateInfo | null> => {
    try {
        const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases?per_page=30`);
        if (!res.ok) return null;
        const data: unknown = await res.json();
        if (!Array.isArray(data)) return null;

        let best: UpdateInfo | null = null;
        for (const release of data as GitHubRelease[]) {
            if (release.draft || release.prerelease) continue;
            const version = (release.tag_name || '').replace(/^v/i, '').trim();
            if (!version) continue;
            const asset = (release.assets || []).find(
                a => a.name?.toLowerCase().endsWith('.apk') && a.browser_download_url,
            );
            if (!asset?.browser_download_url) continue;
            if (!best || isNewer(best.version, version)) {
                best = {
                    version,
                    url: asset.browser_download_url,
                    notes: release.body || '',
                };
            }
        }
        return best;
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

/**
 * Ask the Tauri updater whether a newer desktop build exists. Returns null
 * when the app is already current. Throws when the update endpoint cannot be
 * reached, so callers can distinguish "up to date" from "check failed".
 */
export const checkForDesktopUpdate = async (): Promise<DesktopUpdate | null> => {
    if (!isTauriApp()) return null;

    const { check } = await import('@tauri-apps/plugin-updater');
    const update = await check();
    if (!update) return null;

    return {
        version: update.version,
        notes: update.body ?? '',
        install: async (onProgress) => {
            let downloaded = 0;
            let total = 0;
            await update.downloadAndInstall((event) => {
                if (event.event === 'Started') {
                    total = event.data.contentLength ?? 0;
                    onProgress?.(0);
                } else if (event.event === 'Progress') {
                    downloaded += event.data.chunkLength;
                    if (total > 0) {
                        onProgress?.(Math.min(99, Math.round((downloaded / total) * 100)));
                    }
                } else if (event.event === 'Finished') {
                    onProgress?.(100);
                }
            });
            const { relaunch } = await import('@tauri-apps/plugin-process');
            await relaunch();
        },
        close: async () => {
            await update.close();
        },
    };
};

export const downloadAndInstall = async (url: string): Promise<void> => {
    const fileName = 'anthroweb-update.apk';

    try {
        await Filesystem.deleteFile({ path: fileName, directory: Directory.Cache });
    } catch {
        // No stale file to clean up
    }

    const response = await CapacitorHttp.get({
        url,
        responseType: 'blob',
        connectTimeout: 60000,
        readTimeout: 120000,
    });
    if (response.status < 200 || response.status >= 300) {
        throw new Error('Download failed');
    }

    const data = typeof response.data === 'string' ? response.data : '';
    await Filesystem.writeFile({
        path: fileName,
        data,
        directory: Directory.Cache,
        recursive: true,
    });

    const uri = await Filesystem.getUri({ path: fileName, directory: Directory.Cache });
    await FileOpener.openFile({
        path: uri.uri,
        mimeType: 'application/vnd.android.package-archive',
    });
};
