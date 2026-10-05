import React from 'react';
import { resolveNoteIcon } from '../../utils/noteIcons';
import { resolveNoteColor } from '../../utils/noteColors';

interface NoteIconBadgeProps {
    /** The stored value: a lucide name, or one of the legacy emoji. */
    value: string | null | undefined;
    /** The page's stored colour, so the glyph is tinted to match. */
    color?: string | null;
    /**
     * Which size to draw at. `page` is the large one beside the title; the rest are
     * the small inline spots -- rail row, breadcrumb, switcher row, trash row.
     */
    size?: 'page' | 'inline';
    /**
     * What to draw when the page has no icon.
     *
     * Undefined by default, and that is the whole point: a page without an icon
     * shows no icon, rather than a faded stand-in. A permanent placeholder made
     * every page look like it had been given one, which is not the same thing --
     * the icon is meant to distinguish pages, and a constant on all of them
     * distinguishes nothing.
     *
     * The box is still laid out either way. Reserving it is what stops the title
     * jumping sideways the moment an icon is added or removed, and what keeps the
     * rail's rows aligned with each other when only some pages have one.
     */
    fallback?: React.ReactNode;
    /**
     * Whether the glyph carries its own tooltip naming it.
     *
     * Turned off inside the rail. A row is a link to a page, so the tooltip that
     * describes it should describe the page -- and a badge with one of its own
     * nested inside the row is the nearer match for the pointer, which meant
     * hovering the icon showed the icon's label while the rest of the row showed
     * the title. Two different answers to the same question, from one row.
     */
    showTip?: boolean;
}

/**
 * A page's icon, drawn the same way everywhere it appears.
 *
 * Four call sites used to render `notes_icon` as a bare string, which meant four
 * independent decisions about size and colour and a raw emoji in each. One
 * component makes the glyph the only way it can be drawn, so the tint cannot
 * drift from the page's colour on one of them.
 *
 * Takes the *stored* value rather than a resolved icon so that the legacy emoji
 * mapping happens in exactly one place. A value the picker does not know renders
 * as nothing rather than as its own raw text: the alternative is a row in the
 * rail showing a string of characters where an icon should be, which is worse
 * than an empty slot.
 */
const NoteIconBadge: React.FC<NoteIconBadgeProps> = ({
    value,
    color,
    size = 'inline',
    fallback,
    showTip = true,
}) => {
    const icon = resolveNoteIcon(value);
    const tone = resolveNoteColor(color);

    if (!icon) {
        return (
            <span
                className={`note-icon-badge note-icon-badge--${size} note-icon-badge--empty`}
                aria-hidden="true"
            >
                {fallback}
            </span>
        );
    }

    const Icon = icon.Icon;
    return (
        <span
            className={`note-icon-badge note-icon-badge--${size}`}
            // The tint is a custom property rather than a colour so the rule can
            // fall back to the app's accent for a page with no colour, instead of
            // hard-coding grey and making every uncoloured page look deliberate.
            style={{
                ['--note-solid' as string]: tone.id ? tone.solid : undefined,
                ['--note-text' as string]: tone.id ? tone.text : undefined,
            } as React.CSSProperties}
            {...(showTip ? { 'data-tip': icon.label } : {})}
        >
            <Icon aria-hidden="true" />
        </span>
    );
};

export default NoteIconBadge;
