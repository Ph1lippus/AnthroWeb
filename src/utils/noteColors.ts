/**
 * The colours a page can be.
 *
 * Named, and stored by id rather than by hex. That is the change from the list
 * this replaces: those were eight raw values with no meaning attached, so the
 * only thing the page could do with one was paint a six-pixel bar with it, and
 * there was nowhere for a second shade of the same colour to come from.
 *
 * Two values per entry, because a colour does exactly two jobs on a dark page:
 *
 *   solid  the saturated mid-tone -- the rule above the page, the bar on the rail
 *          row, the dot in the picker. Reads as "this is the colour" at the
 *          smallest size it is ever drawn.
 *   text   a lightened version of it, for the page's icon. It has to clear
 *          contrast on near-black, which `solid` does not at these values.
 *
 * There is deliberately no third value for a background wash. There was one, and
 * it was the reason a page looked wrong: a tint spread across the whole scrolling
 * pane stops reading as an accent and starts reading as a different, faintly
 * incorrect theme -- and it only ever covered the notes half of the screen, so
 * the same colour looked applied on one side of the rail and absent on the other.
 */

export interface NoteColor {
    id: string;
    label: string;
    /** Saturated mid-tone. The rule, the rail bar, the picker dot. */
    solid: string;
    /** Lightened tone, for the page icon drawn on the dark surface. */
    text: string;
}

/**
 * Default first.
 *
 * Not decoration and not an afterthought: this is the only way to remove a colour,
 * so it has to be the one thing that is always in the same place in the grid. It
 * was previously a small struck-through circle whose selected state was
 * invisible, which made "set a colour" a one-way trip.
 */
export const NOTE_PALETTE: NoteColor[] = [
    { id: '', label: 'Default', solid: '#ffffff', text: '#fffbfb' },
    { id: 'grey', label: 'Grey', solid: '#9a9a9a', text: '#c8c8c8' },
    { id: 'brown', label: 'Brown', solid: '#ac8a68', text: '#d0ab86' },
    { id: 'red', label: 'Red', solid: '#e06c75', text: '#f08b93' },
    { id: 'orange', label: 'Orange', solid: '#d98a4a', text: '#eda269' },
    { id: 'yellow', label: 'Yellow', solid: '#d6b83f', text: '#e8cd5c' },
    { id: 'green', label: 'Green', solid: '#4bbf73', text: '#6fd693' },
    { id: 'teal', label: 'Teal', solid: '#4ecdc4', text: '#6fdcd4' },
    { id: 'blue', label: 'Blue', solid: '#5b9bd5', text: '#7fb4e4' },
    { id: 'purple', label: 'Purple', solid: '#a97fd0', text: '#c39ce6' },
    { id: 'pink', label: 'Pink', solid: '#e07ba8', text: '#ef99bf' },
];

/** The colour a page with no stored value gets. Always the first entry. */
export const DEFAULT_NOTE_COLOR = NOTE_PALETTE[0];

/**
 * The seven hexes the old picker wrote, mapped onto their named equivalents.
 *
 * Every row already in the database holds one of these, so without this table a
 * page coloured before this change would resolve to Default and quietly lose its
 * colour on the next read. The seven old values are the chart palette
 * (`--chart-green` and friends), so the names line up one for one; the only
 * renaming is Cyan -> Teal, because "cyan" for #4dd8e0 was never accurate.
 */
const LEGACY_HEX: Record<string, string> = {
    '#00ffa6': 'green',
    '#4da6ff': 'blue',
    '#ff7ba9': 'pink',
    '#b48dff': 'purple',
    '#4dd8e0': 'teal',
    '#ffb84d': 'yellow',
    '#ff5a60': 'red',
};

/** Anything the native colour input can hand back. */
const HEX = /^#[0-9a-f]{6}$/i;

/**
 * The colour for a stored value.
 *
 * Accepts a palette id, one of the legacy hexes, a hex the user picked themselves,
 * or nothing -- and always returns an entry, so every caller can read `.solid` and
 * `.text` without a guard.
 *
 * A hex that is not one of the palette's is taken at face value. That is what
 * makes the free-form picker in `NoteColorPicker` worth having: the eleven named
 * colours are a starting set, not a closed one, and a value the table has never
 * seen is the normal case rather than an error. An unrecognised *id* still falls
 * back to Default, because that is a value that cannot be drawn at all.
 */
export const resolveNoteColor = (value: string | null | undefined): NoteColor => {
    if (!value) return DEFAULT_NOTE_COLOR;
    const trimmed = value.trim();
    const id = LEGACY_HEX[trimmed.toLowerCase()] ?? trimmed.toLowerCase();
    const named = NOTE_PALETTE.find(color => color.id === id);
    if (named) return named;
    if (HEX.test(trimmed)) {
        // Used verbatim for both, so the icon is the colour that was picked. Not
        // lightened for legibility: a darker-than-expected glyph is a visible,
        // correctable mistake, whereas a colour quietly shifted away from what
        // was chosen is not.
        return { id: trimmed.toLowerCase(), label: 'Custom', solid: trimmed, text: trimmed };
    }
    return DEFAULT_NOTE_COLOR;
};

/**
 * Whether the stored value is one the user picked rather than one we offered.
 *
 * The picker needs this to decide whether the free-form tile is the selected one:
 * a page set to a palette colour that happens to be reachable by hex is still a
 * palette choice, and showing Custom as ticked for it would be a lie.
 */
export const isCustomNoteColor = (value: string | null | undefined): boolean => {
    if (!value) return false;
    const trimmed = value.trim();
    return HEX.test(trimmed) && !(trimmed.toLowerCase() in LEGACY_HEX);
};

/** True when the page has a colour worth showing anywhere. */
export const hasNoteColor = (value: string | null | undefined): boolean =>
    resolveNoteColor(value).id !== DEFAULT_NOTE_COLOR.id;
