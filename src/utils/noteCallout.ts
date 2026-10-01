import { Node, mergeAttributes } from '@tiptap/core';

export const CALLOUT_TYPES = ['info', 'tip', 'warning', 'danger'] as const;
export type CalloutType = (typeof CALLOUT_TYPES)[number];

export const CALLOUT_META: Record<CalloutType, { label: string; glyph: string; keywords: string[] }> = {
    info: { label: 'Info', glyph: 'i', keywords: ['info', 'note', 'blue'] },
    tip: { label: 'Tip', glyph: '!', keywords: ['tip', 'hint', 'success', 'green'] },
    warning: { label: 'Warning', glyph: '!', keywords: ['warning', 'caution', 'amber', 'yellow'] },
    danger: { label: 'Danger', glyph: 'x', keywords: ['danger', 'error', 'red', 'stop'] },
};

export const isCalloutType = (value: string): value is CalloutType =>
    (CALLOUT_TYPES as readonly string[]).includes(value);

declare module '@tiptap/core' {
    interface Commands<ReturnType> {
        callout: {
            /** Wrap the current block in a callout, or change its type. */
            setCallout: (options: { type: CalloutType }) => ReturnType;
            /** Unwrap back to a plain block. */
            unsetCallout: () => ReturnType;
            /** Turn the active block into a callout of the given type, or back. */
            toggleCallout: (options: { type: CalloutType }) => ReturnType;
        };
    }
}

/**
 * A callout: a tinted block with a glyph, for the paragraph that is advice or a
 * warning rather than prose.
 *
 * Written from scratch because TipTap has no official callout. It is a block
 * container holding a single block, so anything that can go in a paragraph can go
 * in here, and Enter inside it inserts another paragraph rather than splitting
 * out of the box.
 */
export const Callout = Node.create({
    name: 'callout',
    group: 'block',
    content: 'block+',
    defining: true,
    isolating: true,

    addAttributes() {
        return {
            type: {
                default: 'info' as CalloutType,
                parseHTML: element => {
                    const value = element.getAttribute('data-callout');
                    return value && isCalloutType(value) ? value : 'info';
                },
                renderHTML: attributes => ({ 'data-callout': attributes.type }),
            },
        };
    },

    parseHTML() {
        return [{ tag: 'div[data-callout]' }];
    },

    renderHTML({ HTMLAttributes }) {
        const type = (HTMLAttributes['data-callout'] as CalloutType) ?? 'info';
        return [
            'div',
            mergeAttributes(HTMLAttributes, {
                'data-callout': type,
                class: 'note-callout',
            }),
            ['div', { class: 'note-callout-glyph', 'data-glyph': CALLOUT_META[type].glyph }],
            ['div', { class: 'note-callout-body' }, 0],
        ];
    },

    addCommands() {
        return {
            setCallout:
                options =>
                ({ commands }) =>
                    commands.wrapIn(this.name, { type: options.type }),
            unsetCallout:
                () =>
                ({ commands }) =>
                    commands.lift(this.name),
            toggleCallout:
                options =>
                ({ commands }) =>
                    commands.toggleWrap(this.name, { type: options.type }),
        };
    },

    addKeyboardShortcuts() {
        return {
            // Backspace at the very start of an empty callout unwraps it, matching
            // how an empty list item behaves. Without this a callout is a one-way
            // door, since there is no other way back to a plain paragraph.
            Backspace: () => {
                if (!this.editor.isActive(this.name)) return false;
                const { $from, empty } = this.editor.state.selection;
                if (!empty || $from.parentOffset !== 0) return false;
                return this.editor.commands.lift(this.name);
            },
        };
    },
});

export default Callout;
