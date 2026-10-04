/* Temporary diagnostic: paste conversion and toggle creation, end to end. */
import './index.css';
import { Editor } from '@tiptap/core';
import { buildNoteExtensions, SLASH_COMMANDS } from './utils/noteEditorExtensions';
import { handleMarkdownPaste } from './utils/notePaste';

const out: string[] = [];
const log = (line: string) => {
    out.push(line);
    document.getElementById('log')!.textContent = out.join('\n');
};
window.addEventListener('error', e => log('ERROR: ' + e.message));
const wait = (ms: number) => new Promise(r => setTimeout(r, ms));

const MARKDOWN = [
    '# Weekly review',
    '',
    'Three things that went well, and one that did not.',
    '',
    '## Wins',
    '',
    '- shipped the **editor** rewrite',
    '- cut latency by `40%`',
    '',
    '## To follow up',
    '',
    '- [x] archive the old notes',
    '- [ ] write the release notes',
    '- [ ] ask [Mara](https://example.com/mara)',
    '',
    '## Numbers',
    '',
    '| Day | Notes |',
    '| --- | ---: |',
    '| Mon | 4 |',
    '| Tue | 7 |',
    '',
    '> Worth reading again next week.',
    '',
    '```ts',
    'const done = true;',
    '```',
    '',
    '---',
].join('\n');

const host = document.getElementById('host')!;
const editor = new Editor({
    element: host,
    extensions: buildNoteExtensions({ placeholder: '' }),
    content: '<p>Paste here.</p>',
    editorProps: {
        attributes: { class: 'note-prose' },
        handlePaste: (view, event) => handleMarkdownPaste(view, event),
    },
});

const paste = (text: string, html = '') => {
    const data = new Map<string, string>([['text/plain', text]]);
    if (html) data.set('text/html', html);
    return new ClipboardEvent('paste', { clipboardData: new DataTransferStub(data) } as never);
};

/** The minimum of DataTransfer the handler touches. */
class DataTransferStub {
    constructor(private readonly data: Map<string, string>) {}
    getData(type: string) {
        return this.data.get(type) ?? '';
    }
}

void (async () => {
    await wait(700);
    const prose = editor.view.dom;

    // ---- 1. paste a whole page -------------------------------------------
    log('=== PASTE A MARKDOWN PAGE ===');
    editor.commands.focus('end');
    const handled = editor.view.someProp('handlePaste', f =>
        f(editor.view, paste(MARKDOWN) as never),
    );
    log('handler claimed the paste: ' + handled);
    await wait(200);

    // What did the document actually become?
    const counts = {
        headings: prose.querySelectorAll('h1, h2, h3').length,
        paragraphs: prose.querySelectorAll('p').length,
        bulletItems: prose.querySelectorAll('ul:not([data-type]) li').length,
        taskItems: prose.querySelectorAll('li[data-type="taskItem"]').length,
        checked: prose.querySelectorAll('li[data-type="taskItem"][data-checked="true"]').length,
        tables: prose.querySelectorAll('table').length,
        headerCells: prose.querySelectorAll('table th').length,
        rows: prose.querySelectorAll('table tr').length,
        quotes: prose.querySelectorAll('blockquote').length,
        codeBlocks: prose.querySelectorAll('pre').length,
        rules: prose.querySelectorAll('hr').length,
        bold: prose.querySelectorAll('strong').length,
        inlineCode: prose.querySelectorAll('p code').length,
        links: prose.querySelectorAll('a[href]').length,
    };
    for (const [name, value] of Object.entries(counts)) log(`  ${name.padEnd(12)} ${value}`);

    log('');
    log('checks:');
    const expect = (name: string, actual: number, wanted: number) =>
        log(`  ${actual === wanted ? 'ok  ' : 'FAIL'} ${name}: ${actual} (want ${wanted})`);
    expect('headings', counts.headings, 3);
    expect('bullet items', counts.bulletItems, 2);
    expect('to-do items', counts.taskItems, 3);
    expect('checked to-dos', counts.checked, 1);
    expect('tables', counts.tables, 1);
    expect('header cells (the | a | b | row)', counts.headerCells, 2);
    expect('table rows', counts.rows, 3);
    expect('quotes', counts.quotes, 1);
    expect('code blocks', counts.codeBlocks, 1);
    expect('dividers', counts.rules, 1);
    expect('bold runs', counts.bold, 1);
    expect('inline code', counts.inlineCode, 1);
    expect('links', counts.links, 1);

    // A to-do must be a real task item beside its text, not a bare checkbox.
    const firstTask = prose.querySelector('li[data-type="taskItem"]');
    if (firstTask) {
        const label = firstTask.querySelector('label')!.getBoundingClientRect();
        const div = firstTask.querySelector('div')!.getBoundingClientRect();
        log(
            `  ${Math.abs(label.top - div.top) < label.height ? 'ok  ' : 'FAIL'} to-do box beside its text ` +
                `(label top ${label.top.toFixed(1)}, text top ${div.top.toFixed(1)})`,
        );
        log(`  ${div.width > 40 ? 'ok  ' : 'FAIL'} to-do text is not squeezed: ${div.width.toFixed(0)}px wide`);
    } else {
        log('  FAIL no task item found');
    }

    // ---- 2. prose must be refused ----------------------------------------
    log('');
    log('=== REFUSALS ===');
    const refuses = (label: string, text: string, html = '') => {
        const before = editor.state.doc.content.size;
        const claimed = editor.view.someProp('handlePaste', f =>
            f(editor.view, paste(text, html) as never),
        );
        const changed = editor.state.doc.content.size !== before;
        log(
            `  ${!claimed && !changed ? 'ok  ' : 'FAIL'} ${label}` +
                (claimed || changed ? ` (claimed=${claimed} changed=${changed})` : ''),
        );
    };
    refuses('ordinary prose', 'Just a normal sentence, nothing structured here.');
    refuses(
        'a lone dash in a sentence',
        'Well - I suppose that is one way to put it.',
    );
    refuses(
        'rich HTML from another page',
        '# Heading\n\n- a\n- b',
        '<h1>Styled</h1><p style="color:red">From a web page</p>',
    );

    // A plain copy out of a text file has an HTML flavour that is the same words
    // wrapped in tags, and that must still convert.
    const before2 = editor.state.doc.content.size;
    const plainCopy = editor.view.someProp('handlePaste', f =>
        f(
            editor.view,
            paste('- one\n- two', '<meta charset="utf-8">- one\n- two') as never,
        ),
    );
    log(
        `  ${plainCopy && editor.state.doc.content.size > before2 ? 'ok  ' : 'FAIL'} a plain copy wrapped in tags still converts`,
    );

    // ---- 3. inside a code block ------------------------------------------
    refuses = (label: string, text: string) => {
        const before = editor.state.doc.content.size;
        editor.commands.setTextSelection(1);
        const claimed = editor.view.someProp('handlePaste', f =>
            f(editor.view, paste(text) as never),
        );
        log(
            `  ${!claimed && editor.state.doc.content.size === before ? 'ok  ' : 'FAIL'} ${label}`,
        );
    };
    editor.commands.setContent('<pre><code>const a = 1;</code></pre>');
    await wait(60);
    refuses('markdown inside a code block', '# heading\n\n- a\n- b');

    // ---- 4. a toggle opens, caret inside ---------------------------------
    log('');
    log('=== TOGGLE ===');
    editor.commands.setContent('<p>A section worth folding away</p>');
    await wait(60);
    editor.commands.focus('end');
    const toggle = SLASH_COMMANDS.find(command => command.id === 'toggle')!;
    toggle.run(editor);
    await wait(120);

    const details = editor.view.dom.querySelector('details, div[data-type="details"]');
    log(`  ${details ? 'ok  ' : 'FAIL'} a toggle was created`);
    if (details) {
        const open = (details as HTMLElement).getAttribute('data-checked');
        void open;
        const body = details.querySelector('[data-type="detailsContent"]');
        const summary = details.querySelector('summary');
        const bodyVisible = body ? !body.hasAttribute('hidden') : false;
        log(`  ${bodyVisible ? 'ok  ' : 'FAIL'} the body is visible (not hidden)`);
        log(`  summary: "${summary?.textContent}"`);

        // Where is the caret? It should be inside the body, not the summary.
        const { $from } = editor.state.selection;
        const parentName = $from.parent.type.name;
        let inDetails = false;
        for (let d = $from.depth; d > 0; d--) {
            if ($from.node(d).type.name === 'details') inDetails = true;
        }
        const inSummary = (() => {
            for (let d = $from.depth; d > 0; d--) {
                if ($from.node(d).type.name === 'detailsSummary') return true;
            }
            return false;
        })();
        log(
            `  ${inDetails && !inSummary ? 'ok  ' : 'FAIL'} the caret is inside the body` +
                ` (depth ${$from.depth}, parent ${parentName}, inSummary=${inSummary})`,
        );
        // And typing must land in the body.
        editor.commands.insertContent('typed straight away');
        await wait(60);
        log(
            `  ${body?.textContent?.includes('typed straight away') ? 'ok  ' : 'FAIL'} typing lands in the body`,
        );
        log(`  body now: "${body?.textContent?.trim()}"`);
    }

    log('');
    log('done');
})();