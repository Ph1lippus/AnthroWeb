// Helpers for turning stored note HTML into the plain text the list and the
// editor header need, and for making old notes safe to hand to the new editor.

/** Strip tags and decode entities so a note can be searched and previewed as text. */
export const stripHtml = (html: string): string => {
    if (!html) return '';
    const doc = new DOMParser().parseFromString(html, 'text/html');
    // Block boundaries become spaces so `<p>a</p><p>b</p>` does not read as "ab".
    return (doc.body.textContent || '').replace(/\s+/g, ' ').trim();
};

/** Word count from stored HTML, for the card footer and the editor header. */
export const wordCount = (html: string): number => {
    const text = stripHtml(html);
    if (!text) return 0;
    // Count whitespace-separated runs, which is close enough to how every word
    // processor counts and avoids treating punctuation as a token.
    return text.split(/\s+/).filter(Boolean).length;
};

/** Relative "3 days ago" / "just now" label for cards and the editor header. */
export const relativeTime = (dateStr?: string | null): string => {
    if (!dateStr) return '';
    const then = new Date(dateStr).getTime();
    if (Number.isNaN(then)) return '';

    const seconds = Math.floor((Date.now() - then) / 1000);
    if (seconds < 45) return 'just now';
    if (seconds < 90) return 'a minute ago';

    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes} min ago`;

    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;

    const days = Math.floor(hours / 24);
    if (days === 1) return 'yesterday';
    if (days < 7) return `${days} days ago`;

    return new Date(then).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

/** Absolute timestamp, used as the editor header's title attribute. */
export const absoluteTime = (dateStr?: string | null): string => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
};

/**
 * Rewrite the checkbox markup written by the old editor into task-list HTML the
 * new editor can parse.
 *
 * The previous editor inserted bare `<input type="checkbox">` elements into its
 * contentEditable div (see the old NotesPage insertCheckboxesAtSelection). A
 * schema-based editor drops input elements it does not recognise, so without
 * this pass every to-do list already in the database would silently lose its
 * checkboxes the first time it was opened and saved.
 *
 * Runs against a parsed DOM rather than the HTML string so the surrounding
 * structure can be rebuilt properly instead of pattern-matched.
 */
export const normalizeLegacyCheckboxes = (html: string): string => {
    if (!html || !html.includes('<input')) return html;

    const doc = new DOMParser().parseFromString(html, 'text/html');
    // Snapshot first: replaceWith below mutates the tree this list came from.
    const inputs = Array.from(doc.body.querySelectorAll('input[type="checkbox"]'));
    if (inputs.length === 0) return html;

    for (const input of inputs) {
        const list = doc.createElement('ul');
        list.setAttribute('data-type', 'taskList');

        const item = doc.createElement('li');
        item.setAttribute('data-type', 'taskItem');
        item.setAttribute('data-checked', input.hasAttribute('checked') ? 'true' : 'false');

        // The old editor put the checkbox immediately before its label text as a
        // sibling inside whatever block the caret was in, so the task's text is
        // whatever follows it up to the end of that line.
        const label = doc.createElement('div');
        let sibling = input.nextSibling;
        while (sibling) {
            const element = sibling.nodeType === 1 ? (sibling as Element) : null;
            // Stop at the next checkbox, a line break, or any block boundary --
            // each of those means the current task's line has ended. Note these are
            // left where they are: consumed nodes are moved, never removed, so a
            // stray <br> cannot end up re-attached inside the wrong task.
            if (
                element &&
                (element.tagName === 'INPUT' ||
                    element.tagName === 'BR' ||
                    /^(P|DIV|LI|UL|OL|BLOCKQUOTE|H[1-6]|PRE|TABLE|TBODY|TR|TD)$/.test(
                        element.tagName,
                    ))
            ) {
                break;
            }
            const next = sibling.nextSibling;
            label.appendChild(sibling);
            sibling = next;
        }

        item.appendChild(label);
        list.appendChild(item);
        input.replaceWith(list);
    }

    return doc.body.innerHTML;
};

/** True when a note has nothing in it yet: no text and no embedded media. */
export const isBlankNote = (html?: string | null): boolean => {
    if (!html) return true;
    if (stripHtml(html)) return false;
    // An image or a table has no text content but is very much not blank.
    return !/<(img|table|hr)\b/i.test(html);
};

/** Accent options offered on the editor page. Null clears the accent. */
export const NOTE_COLORS: { value: string; label: string }[] = [
    { value: '', label: 'None' },
    { value: '#00ffa6', label: 'Green' },
    { value: '#4da6ff', label: 'Blue' },
    { value: '#ff7ba9', label: 'Pink' },
    { value: '#b48dff', label: 'Purple' },
    { value: '#4dd8e0', label: 'Cyan' },
    { value: '#ffb84d', label: 'Amber' },
    { value: '#ff5a60', label: 'Red' },
];
