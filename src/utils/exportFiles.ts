/** Shared helpers for downloading data files in the browser. */

export const sanitizeFilename = (value: string): string =>
    value
        .replace(/[^a-zA-Z0-9._-]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 80) || 'export';

export const downloadTextFile = (filename: string, text: string, type: string): void => {
    const blob = new Blob([text], { type });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
};

export const downloadJson = (filename: string, data: unknown): void => {
    downloadTextFile(filename, JSON.stringify(data, null, 2), 'application/json');
};

const csvEscape = (value: unknown): string => {
    if (value === null || value === undefined) return '';
    const str = typeof value === 'object' ? JSON.stringify(value) : String(value);
    if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
        return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
};

export const rowsToCsv = (rows: Record<string, unknown>[]): string => {
    if (rows.length === 0) return '';
    const headers = Object.keys(rows[0]);
    const lines = [headers.join(',')];
    for (const row of rows) {
        lines.push(headers.map(h => csvEscape(row[h])).join(','));
    }
    return lines.join('\n');
};

export const downloadCsv = (filename: string, rows: Record<string, unknown>[]): void => {
    downloadTextFile(filename, rowsToCsv(rows), 'text/csv;charset=utf-8');
};

export const copyCsvToClipboard = async (rows: Record<string, unknown>[]): Promise<boolean> => {
    const text = rowsToCsv(rows);
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch {
        try {
            const textarea = document.createElement('textarea');
            textarea.value = text;
            textarea.style.position = 'fixed';
            textarea.style.opacity = '0';
            document.body.appendChild(textarea);
            textarea.select();
            const ok = document.execCommand('copy');
            document.body.removeChild(textarea);
            return ok;
        } catch {
            return false;
        }
    }
};