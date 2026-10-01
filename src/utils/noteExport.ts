import TurndownService from 'turndown';
import type { Note } from '../services/noteService';
import { noteAncestors } from './noteTree';

/**
 * Markdown export.
 *
 * Turndown is used rather than a hand-rolled converter because the honest version
 * of HTML to Markdown is fiddly in the ways that matter: nested lists need the
 * right indent, blockquotes need a prefix on every line, and code fences have to
 * win over inline formatting. Getting that subtly wrong produces a file that
 * looks fine and pastes badly.
 */
const buildService = () => {
    const service = new TurndownService({
        headingStyle: 'atx',
        codeBlockStyle: 'fenced',
        bulletListMarker: '-',
        emDelimiter: '*',
    });

    // KaTeX writes its markup twice: once as the rendered output and once in an
    // annotation holding the original LaTeX. Keeping the annotation means the
    // exported file still contains the expression rather than a page of span soup.
    service.addRule('katex', {
        filter(node) {
            const element = node as HTMLElement;
            return (
                element.tagName === 'SPAN' &&
                element.classList.contains('katex') &&
                !!element.querySelector('.katex-mathml annotation')
            );
        },
        replacement(_content, node) {
            const annotation = (node as HTMLElement).querySelector(
                '.katex-mathml annotation',
            );
            const latex = (annotation as HTMLElement | null)?.textContent ?? '';
            const element = node as HTMLElement;
            const isBlock = element.closest('.tiptap-mathematics-render[data-type="block-math"]');
            return isBlock ? `\n\n$$\n${latex}\n$$\n\n` : `$${latex}$`;
        },
    });

    // A toggle's collapsed state is a reading posture, not content, so the
    // exported file keeps the heading and drops the disclosure.
    service.addRule('details', {
        filter: node => (node as HTMLElement).tagName === 'DETAILS',
        replacement: content => `\n${content.trim()}\n`,
    });

    service.addRule('detailsSummary', {
        filter: node =>
            (node as HTMLElement).tagName === 'SUMMARY' &&
            (node as HTMLElement).parentElement?.tagName === 'DETAILS',
        replacement: content => `**${content.trim()}**\n`,
    });

    // A callout is a paragraph with a colour and a glyph; both are decoration, so
    // the text is kept and the wrapper dropped.
    service.addRule('callout', {
        filter: node => (node as HTMLElement).classList?.contains('note-callout'),
        replacement: content => `\n${content.trim()}\n`,
    });

    service.addRule('calloutGlyph', {
        filter: node => (node as HTMLElement).classList?.contains('note-callout-glyph'),
        replacement: () => '',
    });

    // TipTap marks to-do items with data-checked on the <li>.
    service.addRule('taskItem', {
        filter: node =>
            (node as HTMLElement).tagName === 'LI' &&
            (node as HTMLElement).getAttribute('data-type') === 'taskItem',
        replacement(content, node) {
            const checked = (node as HTMLElement).getAttribute('data-checked') === 'true';
            return `\n- [${checked ? 'x' : ' '}] ${content.trim()}\n`;
        },
    });

    return service;
};

/**
 * Renders a page as Markdown, prefixed with its breadcrumb so an exported tree is
 * still legible once the files are separated.
 */
export const noteToMarkdown = (note: Note, allNotes: Note[]): string => {
    const service = buildService();
    const body = service.turndown(note.content ?? '').trim();

    const trail = noteAncestors(allNotes, note)
        .map(ancestor => ancestor.title?.trim() || 'Untitled')
        .reverse();

    const front = [
        `# ${note.title?.trim() || 'Untitled'}`,
        trail.length ? `_In: ${trail.join(' / ')}_` : null,
        note.notes_tags?.length ? `_Tags: ${note.notes_tags.join(', ')}_` : null,
    ]
        .filter(Boolean)
        .join('\n');

    return `${front}\n\n${body}\n`;
};

/** A filename that survives every filesystem, derived from the title. */
export const noteFileName = (note: Note): string => {
    const base = (note.title?.trim() || 'Untitled')
        .replace(/[\\/:*?"<>|]+/g, '-')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 80);
    return `${base || 'Untitled'}.md`;
};

/**
 * Hands the browser a file and clicks the anchor for it.
 *
 * revokeObjectURL is deferred by a tick rather than called immediately: Safari
 * cancels the download if the URL is released before it has read the blob.
 */
export const downloadTextFile = (filename: string, text: string, type: string) => {
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

export const downloadNoteMarkdown = (note: Note, allNotes: Note[]) => {
    downloadTextFile(noteFileName(note), noteToMarkdown(note, allNotes), 'text/markdown');
};

export const downloadNoteHtml = (note: Note) => {
    // A minimal shell, so the exported file renders on its own rather than as a
    // bare fragment that a browser shows as unstyled text.
    const body = [
        '<!doctype html>',
        '<html lang="en"><head><meta charset="utf-8">',
        `<title>${escapeHtml(note.title?.trim() || 'Untitled')}</title>`,
        '<style>body{font-family:ui-monospace,monospace;max-width:46rem;margin:3rem auto;padding:0 1rem;line-height:1.7;background:#0b0b0b;color:#eee}'
        + 'pre{background:#151515;padding:1rem;border-radius:12px;overflow-x:auto}'
        + 'blockquote{border-left:3px solid #00ffa6;margin:0;padding-left:1rem}'
        + 'table{border-collapse:collapse}td,th{border:1px solid #333;padding:.4rem .6rem}'
        + '</style></head><body>',
        `<h1>${escapeHtml(note.title?.trim() || 'Untitled')}</h1>`,
        note.content ?? '',
        '</body></html>',
    ].join('\n');

    downloadTextFile(
        noteFileName(note).replace(/\.md$/, '.html'),
        body,
        'text/html',
    );
};

const escapeHtml = (value: string) =>
    value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
