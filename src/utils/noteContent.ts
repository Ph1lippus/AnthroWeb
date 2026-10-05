// Helpers for turning stored note HTML into the plain text the list and the
// editor header need, and for making old notes safe to hand to the new editor.

/** Strip tags and decode entities so a note can be searched and previewed as text. */
export const stripHtml = (html: string): string => {
    if (!html) return '';
    // Block boundaries are turned into spaces *before* parsing. textContent alone
    // concatenates straight across them, so <p>a</p><p>b</p> read as "ab" -- which
    // glued two words together in the search index and in previews.
    const spaced = html
        .replace(/<br\s*\/?>/gi, ' ')
        .replace(
            /<\/(p|div|li|ul|ol|h[1-6]|blockquote|pre|section|article|tr|td|th|details|summary)\s*>/gi,
            ' ',
        );
    const doc = new DOMParser().parseFromString(spaced, 'text/html');
    return (doc.body.textContent || '').replace(/\s+/g, ' ').trim();
};

/**
 * Word count from stored HTML.
 *
 * Deliberately regex-based rather than reusing stripHtml: this runs on every
 * keystroke for the header count, and DOMParser builds and throws away a whole
 * document each time. Stripping tags with a regex and dropping entities is good
 * enough to count words and costs a fraction of it. stripHtml stays DOM-based
 * because search and previews want entities actually decoded.
 */
export const wordCount = (html: string): number => {
    if (!html) return 0;
    const text = html
        .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
        .replace(/<[^>]*>/g, ' ')
        .replace(/&nbsp;|&#160;/gi, ' ')
        .replace(/&[a-z]+;|&#\d+;|&#x[0-9a-f]+;/gi, ' ');
    const match = text.trim();
    return match ? match.split(/\s+/).length : 0;
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
 * Whether a checkbox is already part of a task list this editor wrote.
 *
 * TaskItem serialises to `<li data-type="taskItem"><label><input type="checkbox">…`,
 * so a *modern* to-do contains an `<input>` exactly as often as a legacy one
 * does. Telling them apart therefore cannot be done by looking for inputs at all
 * -- it has to be done by asking whether this particular input already has a
 * task list around it.
 *
 * Getting this wrong is not cosmetic. The rewrite below lifts whatever follows
 * the checkbox into a fresh `<li>`, and in modern markup what follows is the
 * a11y `<span>` -- which serialises empty -- so every existing to-do is replaced
 * by an empty one and its text is left behind outside the list. Worse, the
 * injected `<ul>` lands *inside* the original `<label>`, and a label wrapping
 * the row makes the entire row a click target for its checkbox.
 */
const isTaskListCheckbox = (input: Element): boolean =>
    input.closest('[data-type="taskItem"]') !== null ||
    input.closest('[data-type="taskList"]') !== null;

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
 * Checkboxes that already belong to a task list are left alone -- see
 * `isTaskListCheckbox`. The original string is returned untouched when there was
 * nothing to migrate, so a healthy note round-trips byte for byte rather than
 * being re-serialised for no reason.
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

    let migrated = false;
    for (const input of inputs) {
        if (isTaskListCheckbox(input)) continue;
        migrated = true;
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

    return migrated ? doc.body.innerHTML : html;
};

/**
 * A block whose inline content can be lifted into a `<summary>`.
 *
 * A summary holds inline content only, so only a textblock qualifies. Anything
 * with block children (a nested list, a second paragraph) is left alone rather
 * than half-migrated.
 */
const LIFTABLE_TEXT_BLOCK = /^(P|H[1-6]|BLOCKQUOTE|PRE)$/;

/**
 * Move text out of the body of a toggle whose summary is empty.
 *
 * An earlier version of the to-toggle conversion put the line's text in the
 * body instead of the summary. That saved perfectly valid HTML which rendered as
 * a collapsed, untitled toggle with its text hidden inside, so the text was there
 * in the database and simply invisible -- the exact opposite of the to-do bug,
 * where the text was destroyed. Everything written since keeps the text in the
 * summary, so this only touches the notes that were converted by the broken
 * build.
 *
 * Only the first body block moves, and only if it is a textblock: `detailsContent`
 * holds blocks, so the body has to keep at least one, and the emptied original
 * is already a valid empty paragraph.
 */
export const normalizeLegacyToggles = (html: string): string => {
    if (!html || !html.includes('<details')) return html;

    const doc = new DOMParser().parseFromString(html, 'text/html');
    const details = Array.from(doc.body.querySelectorAll('details'));
    if (details.length === 0) return html;

    let repaired = false;
    for (const node of details) {
        const summary = node.querySelector(':scope > summary');
        // A summary with anything in it was written correctly and is left alone.
        if (!summary || (summary.textContent ?? '').trim() !== '') continue;

        const body =
            node.querySelector(':scope > [data-type="detailsContent"]') ??
            Array.from(node.children).find(child => child !== summary);
        if (!body) continue;

        const first = body.firstElementChild;
        if (!first || !LIFTABLE_TEXT_BLOCK.test(first.tagName)) continue;

        // Moved, not copied: the inline nodes keep their marks, and the block they
        // came from stays behind as the body's now-empty first paragraph.
        while (first.firstChild) {
            summary.appendChild(first.firstChild);
        }
        repaired = true;
    }

    return repaired ? doc.body.innerHTML : html;
};

/** Every load-time repair to stored note HTML, in one call. */
export const normalizeNoteHtml = (html: string): string =>
    normalizeLegacyToggles(normalizeLegacyCheckboxes(html));

/** True when a note has nothing in it yet: no text and no embedded media. */
export const isBlankNote = (html?: string | null): boolean => {
    if (!html) return true;
    if (stripHtml(html)) return false;
    // An image or a table has no text content but is very much not blank.
    return !/<(img|table|hr)\b/i.test(html);
};

/** Below this many headings a page outline is noise rather than navigation. */
export const TOC_MIN_HEADINGS = 3;

/** Whether a note has enough headings to be worth drawing an outline for. */
export const shouldShowToc = (headingCount: number): boolean => headingCount >= TOC_MIN_HEADINGS;

/*
 * NOTE_COLORS used to live here: eight raw hex values, with "null clears the
 * accent" as the only comment and nowhere for a second shade of any colour to go.
 * It is now `NOTE_PALETTE` in `utils/noteColors`, which stores an id and carries
 * the three values a colour needs on a dark page -- see the note there on why a
 * Notion palette cannot simply be copied onto near-black.
 */

