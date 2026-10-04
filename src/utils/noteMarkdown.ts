/**
 * Markdown -> the editor's own HTML.
 *
 * Paste arrives as plain text all the way from the clipboard to the schema, and
 * the schema has no idea what `- [ ]` means. So a page written by an assistant --
 * which is markdown, because that is what assistants write -- arrives as one long
 * paragraph with its structure flattened into stray characters.
 *
 * This turns it back into blocks. It emits HTML carrying what the schema's
 * *parser* matches on, which is the part that is easy to get wrong: `renderHTML`
 * decides what is saved, a paste goes through `parseHTML`, and for to-do items
 * those two disagree about which attributes are present -- the renderer writes
 * `data-type="taskItem"`, the parser requires it, and a plain `<li>` matches
 * nothing at all. See `renderList`.
 *
 * Deliberately not a general markdown implementation. It covers what a written
 * page is actually made of, and `looksLikeMarkdown` refuses anything else rather
 * than guessing: a paste handler that mangles prose is worse than one that does
 * nothing.
 *
 * No new dependency. The project has Turndown for the other direction and nothing
 * for this one. `prosemirror-markdown` is the obvious candidate and is not
 * installed; TipTap's `parseMarkdown` hooks need that parser, and it would still
 * leave this editor's callouts, code blocks and sub/superscript uncovered.
 */

/** Escapes text for an HTML text node. */
const escapeHtml = (value: string): string =>
    value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');

/** Escapes for an `href`, where the scheme is the real risk. */
const escapeHref = (value: string): string => {
    const trimmed = value.trim();
    // A bare `example.com/page` has no scheme and is left as written. Anything
    // that does have one is kept only if it is a scheme a link may have.
    const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(trimmed);
    if (scheme && !/^(https?|mailto|tel)$/i.test(scheme[1])) return '#';
    return escapeHtml(trimmed);
};

/* ------------------------------------------------------------------ *
 * Inline
 * ------------------------------------------------------------------ */

interface InlineRule {
    /** Exactly one capture group: the content the mark wraps. */
    pattern: RegExp;
    render: (content: string, whole: string) => string;
}

/**
 * The inline marks.
 *
 * Applied by scanning for whichever rule matches earliest at each step, rather
 * than by one alternation. An alternation would need every rule's groups counted
 * to work out which one matched, and that arithmetic is exactly the kind of thing
 * that is quietly wrong the moment a pattern gains a group.
 */
const INLINE_RULES: InlineRule[] = [
    // Code first, so no later rule can reach inside it. Nothing in a code span is
    // markup, which is the whole point of one.
    {
        pattern: /`([^`\n]+)`/,
        render: content => `<code>${escapeHtml(content)}</code>`,
    },
    {
        pattern: /\*\*\*([^*\n]+)\*\*\*/,
        render: content => `<strong><em>${escapeHtml(content)}</em></strong>`,
    },
    {
        pattern: /___([^_\n]+)___/,
        render: content => `<strong><em>${escapeHtml(content)}</em></strong>`,
    },
    {
        pattern: /\*\*([^*\n]+)\*\*/,
        render: content => `<strong>${escapeHtml(content)}</strong>`,
    },
    {
        pattern: /__([^_\n]+)__/,
        render: content => `<strong>${escapeHtml(content)}</strong>`,
    },
    {
        pattern: /~~([^~\n]+)~~/,
        render: content => `<s>${escapeHtml(content)}</s>`,
    },
    {
        pattern: /\*([^*\n]+)\*/,
        render: content => `<em>${escapeHtml(content)}</em>`,
    },
    // Underscore emphasis only when it is not inside a word, so `snake_case_name`
    // and a footnote marker are left alone.
    {
        pattern: /(?<![A-Za-z0-9_])_([^_\n]+)_(?![A-Za-z0-9_])/,
        render: content => `<em>${escapeHtml(content)}</em>`,
    },
    {
        // Balanced-ish parentheses, so a URL with them in it -- which a
        // `javascript:` payload always does -- is taken whole rather than
        // truncated at the first `)`.
        pattern: /\[([^\]\n]*)\]\(((?:[^()\s]|\([^()\s]*\))+)(?:\s+"[^"]*")?\)/,
        render: (content, whole) => {
            const target = /\]\((.+?)(?:\s+"[^"]*")?\)$/.exec(whole)?.[1] ?? '';
            return `<a href="${escapeHref(target)}">${escapeHtml(content || target)}</a>`;
        },
    },
    {
        pattern: /https?:\/\/[^\s<>()]+[^\s<>().,]/,
        render: (_content, whole) => `<a href="${escapeHref(whole)}">${escapeHtml(whole)}</a>`,
    },
];

/**
 * Makes a run of plain text safe to drop into the output.
 *
 * Note that this only HTML-escapes. It does not markdown-escape, and that is the
 * whole point: the output is parsed as HTML, where a bare `*` is already a `*` and
 * a backslash would be shown to the reader as a backslash. Backslashes the author
 * wrote on purpose are simply dropped, so `\*` means an asterisk, as they meant.
 *
 * HTML-escaping is not optional here. This output is built from whatever was on
 * the clipboard and handed to the schema's parser, so an unescaped `<` is an
 * element rather than a character.
 */
const escapePlain = (value: string): string =>
    escapeHtml(value.replace(/\\([*_~`\\])/g, '$1'));

/**
 * Applies the inline marks to one run of text.
 *
 * Everything not matched is escaped, so the result is safe HTML whatever
 * arrived. Scanning is left to right rather than splitting on a delimiter,
 * because a `**` that turns out to be literal text has to end up as literal text.
 */
export const inlineMarkdownToHtml = (text: string): string => {
    let out = '';
    let index = 0;

    while (index < text.length) {
        const rest = text.slice(index);
        let earliest: { rule: InlineRule; match: RegExpExecArray } | null = null;
        for (const rule of INLINE_RULES) {
            const match = rule.pattern.exec(rest);
            // Ties go to the earlier rule in the list, which is why code is first.
            if (match && (!earliest || match.index < earliest.match.index)) {
                earliest = { rule, match };
            }
        }
        if (!earliest) break;

        out += escapePlain(text.slice(index, index + earliest.match.index));
        out += earliest.rule.render(earliest.match[1], earliest.match[0]);
        index += earliest.match.index + earliest.match[0].length;
    }

    return out + escapePlain(text.slice(index));
};

/* ------------------------------------------------------------------ *
 * Blocks
 * ------------------------------------------------------------------ */

/** One list row, already classified. */
type ListRow =
    | { kind: 'bullet' | 'ordered'; indent: number; text: string }
    | { kind: 'task'; indent: number; checked: boolean; text: string };

const LIST_ITEM = /^([ \t]*)(?:([-*+])|(\d{1,9})[.)])[ \t]+(.*)$/;
const TASK_ITEM = /^\[([ xX])\][ \t]*(.*)$/;
const HEADING = /^(#{1,6})[ \t]+(.*)$/;
const FENCE = /^[ \t]*(```+|~~~+)[ \t]*([\w+#.-]*)[ \t]*$/;
const THEMATIC_BREAK = /^[ \t]{0,3}([-*_])([ \t]*\1){2,}[ \t]*$/;
const BLOCKQUOTE = /^[ \t]{0,3}>[ \t]?(.*)$/;

/**
 * A GFM table's delimiter row, e.g. `| --- | :--: |`.
 *
 * The delimiter is what identifies a table, so it has to be matched properly
 * rather than by looking for dashes -- otherwise prose with a `|` and a hyphen
 * in it starts a table.
 */
const TABLE_DELIMITER = /^[ \t]*\|?[ \t]*:?-+:?[ \t]*(\|[ \t]*:?-+:?[ \t]*)*\|?[ \t]*$/;

const isTableDelimiter = (line: string): boolean =>
    line.includes('-') && TABLE_DELIMITER.test(line);

/** How deep a list row sits, in levels of two spaces or one tab. */
const indentOf = (prefix: string): number => {
    let width = 0;
    for (const character of prefix) {
        if (character === '\t') width += 4;
        else if (character === ' ') width += 1;
        else break;
    }
    return Math.floor(width / 2);
};

/** Which sort of list a row belongs to. A change of sort starts a new list. */
type ListKind = 'bullet' | 'ordered' | 'task';

const listKindOf = (row: ListRow): ListKind => row.kind;

/**
 * Renders the rows of one list, honouring nesting.
 *
 * Every close tag is the stack's business and no item carries its own, because a
 * nested list has to be emitted *inside* its parent's `<li>` -- an item that closed
 * itself would have nowhere to put it.
 *
 * A row whose kind differs from the open list at the same depth starts a new list
 * rather than joining it. That is what puts a to-do into a `taskList` of its own:
 * markdown would happily read `- [ ] x` as a bullet whose text is `[ ] x`, and
 * without the split the checkbox would land in a list the schema does not
 * recognise as a to-do list at all.
 */
const renderList = (rows: ListRow[]): string => {
    let html = '';
    const stack: { tag: 'ul' | 'ol'; indent: number; kind: ListKind }[] = [];

    const open = (row: ListRow) => {
        const kind = listKindOf(row);
        const tag = kind === 'ordered' ? 'ol' : 'ul';
        html += `<${tag}${kind === 'task' ? ' data-type="taskList"' : ''}>`;
        stack.push({ tag, indent: row.indent, kind });
    };

    for (const row of rows) {
        const top = stack[stack.length - 1];

        if (top === undefined || row.indent > top.indent) {
            // Nothing open, or a level deeper. Nothing has been closed, so this
            // nests inside the item above.
            open(row);
        } else if (row.indent < top.indent || listKindOf(row) !== top.kind) {
            // Shallower, or a different kind of list: markdown starts a new list for
            // both. Close this one whole, and whatever else is deeper than the row.
            while (stack.length > 0 && stack[stack.length - 1].indent >= row.indent) {
                html += `</li></${stack.pop()!.tag}>`;
            }
            open(row);
        } else {
            // The same list, one level: close the item being left, then start the
            // next inside the list that is still open.
            while (stack.length > 1 && stack[stack.length - 1].indent > row.indent) {
                html += `</li></${stack.pop()!.tag}>`;
            }
            html += '</li>';
        }

        html +=
            row.kind === 'task'
                ? `<li data-type="taskItem" data-checked="${row.checked}">` +
                  // The parser wants the checkbox markup the task item's own
                  // renderer produces. Without it the row parses as empty, which is
                  // a checkbox with no text beside it.
                  '<label><input type="checkbox"><span></span></label>' +
                  `<div><p>${inlineMarkdownToHtml(row.text)}</p></div>`
                : `<li><p>${inlineMarkdownToHtml(row.text)}</p>`;
    }

    while (stack.length > 0) html += `</li></${stack.pop()!.tag}>`;
    return html;
};

/** Splits a table row on its pipes, dropping the outer ones. */
const tableCells = (row: string): string[] =>
    row
        .trim()
        .replace(/^\|/, '')
        .replace(/\|$/, '')
        .split('|')
        .map(cell => cell.trim());

/**
 * Converts a markdown document into HTML the editor's schema will parse into
 * blocks, or `null` when there is nothing here it understands -- which is the
 * signal to paste the text verbatim.
 */
export const markdownToEditorHtml = (markdown: string): string | null => {
    const lines = markdown.replace(/\r\n?/g, '\n').split('\n');
    let html = '';
    let index = 0;
    let listRows: ListRow[] = [];

    const flushList = () => {
        if (listRows.length === 0) return;
        html += renderList(listRows);
        listRows = [];
    };

    while (index < lines.length) {
        const line = lines[index];

        // A fence owns every line until its closing fence, backticks included, so
        // a `#` inside a code block stays a `#`.
        const fence = FENCE.exec(line);
        if (fence) {
            flushList();
            const marker = fence[1][0];
            const body: string[] = [];
            index += 1;
            while (index < lines.length && !new RegExp(`^[ \\t]*${marker}{3,}[ \\t]*$`).test(lines[index])) {
                body.push(lines[index]);
                index += 1;
            }
            index += 1;
            const language = fence[2] ? ` class="language-${escapeHtml(fence[2])}"` : '';
            html += `<pre><code${language}>${escapeHtml(body.join('\n'))}</code></pre>`;
            continue;
        }

        if (line.includes('|') && index + 1 < lines.length && isTableDelimiter(lines[index + 1])) {
            flushList();
            const headers = tableCells(line);
            index += 2;
            const body: string[][] = [];
            while (index < lines.length && lines[index].includes('|') && lines[index].trim() !== '') {
                body.push(tableCells(lines[index]));
                index += 1;
            }
            // Plain markup: the table node matches `table`, the row `tr`, and the
            // header `th`. A `th` is what makes the first row a header row, so
            // there is no attribute to set.
            const head = headers
                .map(cell => `<th><p>${inlineMarkdownToHtml(cell)}</p></th>`)
                .join('');
            const rows = body
                .map(row => `<tr>${headers.map((_, c) => `<td><p>${inlineMarkdownToHtml(row[c] ?? '')}</p></td>`).join('')}</tr>`)
                .join('');
            html += `<table><tbody><tr>${head}</tr>${rows}</tbody></table>`;
            continue;
        }

        if (THEMATIC_BREAK.test(line)) {
            flushList();
            html += '<hr>';
            index += 1;
            continue;
        }

        const quote = BLOCKQUOTE.exec(line);
        if (quote) {
            flushList();
            const body: string[] = [];
            while (index < lines.length) {
                const next = BLOCKQUOTE.exec(lines[index]);
                if (!next) break;
                body.push(next[1]);
                index += 1;
            }
            const joined = body.join('\n');
            const inner =
                markdownToEditorHtml(joined) ??
                // A quote line that is only text: one paragraph, still escaped.
                `<p>${inlineMarkdownToHtml(joined)}</p>`;
            html += `<blockquote>${inner}</blockquote>`;
            continue;
        }

        const heading = HEADING.exec(line);
        if (heading) {
            flushList();
            // The editor configures levels 1-3, so anything deeper would be dropped
            // by the schema. Clamped rather than lost.
            const level = Math.min(heading[1].length, 3);
            const text = heading[2].replace(/[ \t]+#+[ \t]*$/, '');
            html += `<h${level}>${inlineMarkdownToHtml(text)}</h${level}>`;
            index += 1;
            continue;
        }

        const item = LIST_ITEM.exec(line);
        if (item) {
            const [, indent, bullet, , rest] = item;
            const depth = indentOf(indent);
            const task = TASK_ITEM.exec(rest);
            if (task) {
                listRows.push({
                    kind: 'task',
                    indent: depth,
                    checked: task[1].toLowerCase() === 'x',
                    text: task[2],
                });
            } else if (bullet) {
                listRows.push({ kind: 'bullet', indent: depth, text: rest });
            } else {
                listRows.push({ kind: 'ordered', indent: depth, text: rest });
            }
            index += 1;
            continue;
        }

        // A blank line does not end a list. `- one` / blank / `- two` is one loose
        // list, which is how CommonMark reads it and how every editor renders it.
        // Only a non-list block flushes the rows, at the branch above.
        if (line.trim() === '') {
            index += 1;
            continue;
        }

        // A paragraph runs to the next blank line or block marker.
        flushList();
        const paragraph: string[] = [];
        while (index < lines.length) {
            const next = lines[index];
            if (
                next.trim() === '' ||
                HEADING.test(next) ||
                FENCE.test(next) ||
                THEMATIC_BREAK.test(next) ||
                BLOCKQUOTE.test(next) ||
                LIST_ITEM.test(next)
            ) {
                break;
            }
            paragraph.push(next);
            index += 1;
        }
        // A line that is only a table header waits for its delimiter, which the
        // paragraph loop would otherwise swallow as text.
        if (paragraph.length > 0) html += `<p>${inlineMarkdownToHtml(paragraph.join('\n'))}</p>`;
        else index += 1;
    }

    flushList();
    return html === '' ? null : html;
};

/* ------------------------------------------------------------------ *
 * Deciding whether to convert at all
 * ------------------------------------------------------------------ */

/**
 * Whether a pasted blob is markdown worth converting.
 *
 * The bar is deliberately high, because this runs on every paste. One dash is
 * punctuation and three are a list, so structure has to be *repeated* to count --
 * the exception is a to-do, where `- [ ]` is unambiguous on its own. Anything
 * ambiguous is left as text, which is the safe outcome: the reader sees exactly
 * what they pasted.
 */
export const looksLikeMarkdown = (text: string): boolean => {
    if (!text.trim()) return false;
    const lines = text.replace(/\r\n?/g, '\n').split('\n');

    let listLines = 0;
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (FENCE.test(line)) return true;
        if (HEADING.test(line)) return true;
        if (THEMATIC_BREAK.test(line)) return true;
        if (BLOCKQUOTE.test(line)) return true;
        if (line.includes('|') && i + 1 < lines.length && isTableDelimiter(lines[i + 1])) return true;

        const item = LIST_ITEM.exec(line);
        if (!item) continue;
        if (TASK_ITEM.test(item[4])) return true;
        listLines += 1;
    }
    return listLines >= 2;
};