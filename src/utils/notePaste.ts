import { DOMParser as ProseMirrorDOMParser, Slice } from '@tiptap/pm/model';
import type { EditorView } from '@tiptap/pm/view';
import { looksLikeMarkdown, markdownToEditorHtml } from './noteMarkdown';

/**
 * Turning a paste of markdown into real blocks.
 *
 * Text on the clipboard reaches the schema as plain text, and the schema has no
 * idea what `- [ ]` means -- so a page an assistant wrote arrives as one long
 * paragraph with its structure flattened into stray characters. Converting it here
 * is the difference between pasting a document and pasting a wall of text.
 *
 * The conversion itself lives in `noteMarkdown.ts` and is a pure function with no
 * imports, so it can be tested on its own; this is the wiring that decides whether
 * to use it.
 *
 * Three refusals, each for a different reason:
 *
 *  - **Inside a code block.** Markdown is the language of code comments, and a
 *    snippet pasted into a code block is meant verbatim.
 *  - **When the clipboard carries real HTML.** Copying from a page, or from Notion,
 *    brings both, and that HTML is richer than anything reconstructed from its own
 *    text -- it has styles, links with real targets, and structure the flat text
 *    has lost. The one exception is when the two carry the same words, which is
 *    what a plain copy out of a text file looks like.
 *  - **When the text is not markdown.** `looksLikeMarkdown` has to be sure; see the
 *    note there. Ambiguity resolves to leaving the text alone, because a reader
 *    seeing exactly what they pasted is a better failure than seeing something
 *    mangled.
 */
export const handleMarkdownPaste = (view: EditorView, event: ClipboardEvent): boolean => {
    const text = event.clipboardData?.getData('text/plain') ?? '';
    if (!text || view.state.selection.$from.parent.type.spec.code) return false;

    const html = event.clipboardData?.getData('text/html') ?? '';
    // Compared after stripping tags, because a browser's HTML flavour of a plain
    // copy is a wrapper around the very same words -- and that is exactly the case
    // this must let through. Anything richer than a wrapper does not qualify.
    if (html && html.replace(/<[^>]*>/g, '').trim() !== text.trim()) return false;

    if (!looksLikeMarkdown(text)) return false;
    const converted = markdownToEditorHtml(text);
    if (!converted) return false;

    // Parsed by the schema rather than inserted as a string, so what lands is a real
    // document. The to-do list becomes task items because the converted markup
    // carries the attributes the parser matches on -- not because this function
    // knows anything about to-dos.
    const parsed = ProseMirrorDOMParser.fromSchema(view.state.schema).parse(
        new window.DOMParser().parseFromString(converted, 'text/html'),
    );
    if (parsed.childCount === 0) return false;

    const { from, to } = view.state.selection;
    // `replaceRange` rather than `replace`: block content dropped into the middle
    // of a paragraph has to split it, and this is the call that knows how. A
    // selection is replaced, which is what a paste is expected to do.
    view.dispatch(
        view.state.tr.replaceRange(from, to, new Slice(parsed.content, 0, 0)).scrollIntoView(),
    );
    return true;
};