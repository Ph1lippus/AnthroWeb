import React from 'react';
import { Check, Pipette } from 'lucide-react';
import Popover from '../Popover';
import {
    NOTE_PALETTE,
    isCustomNoteColor,
    resolveNoteColor,
    type NoteColor,
} from '../../utils/noteColors';

interface NoteColorPickerProps {
    /** The control it is anchored to. Null keeps it closed. */
    anchor: HTMLElement | null;
    onClose: () => void;
    /** The stored value: a palette id, a legacy hex, or one of the user's own. */
    value: string;
    onChange: (value: string) => void;
}

/**
 * Seed for the free-form input when the page has no custom colour yet.
 *
 * A native colour input cannot show an empty swatch, and `#000000` would be both
 * invisible against the popover and read as "you have picked black". This is the
 * app's own accent, so the control looks like something that already belongs to
 * the page rather than a hole in it.
 */
const SEED = '#00ffa6';

/**
 * The page colour picker.
 *
 * Eleven named colours, then a free-form one. Default is first and stays in the
 * same place every time, because it is the only way to remove a colour -- the
 * panel used to open on a strip whose "none" swatch looked identical whether or
 * not it was selected, which made setting a colour a one-way trip.
 *
 * It stays open when you pick one. A colour is chosen by comparing it against the
 * page, so closing after each attempt would mean reopening it every time.
 */
const NoteColorPicker: React.FC<NoteColorPickerProps> = ({ anchor, onClose, value, onChange }) => {
    const current = resolveNoteColor(value);
    const custom = isCustomNoteColor(value);

    const renderTile = (color: NoteColor) => {
        const selected = color.id === current.id;
        return (
            <button
                key={color.id || 'none'}
                type="button"
                className={`note-color-tile${selected ? ' note-color-tile--on' : ''}`}
                onClick={() => onChange(color.id)}
                aria-pressed={selected}
                data-tip={color.label}
                aria-label={`Page colour: ${color.label}`}
            >
                {/* The dot is the swatch. A tile painted with the colour itself was
                    tried and abandoned: every value in the palette is a mid-tone, so
                    at this size eleven of them sat on the popover's own surface and
                    read as eleven slightly-different greys. */}
                <span className="note-color-tile-dot" style={{ background: color.solid }}>
                    {/* Dark on every tile, including Default. The dot is the only
                        opaque part of a swatch at this size and every `solid` is light
                        enough to carry it; picking per-tile put a dark tick on eight
                        tiles and none on the ninth, which was the one most likely to be
                        picked. */}
                    {selected && <Check size={12} strokeWidth={3} aria-hidden="true" />}
                </span>
                <span className="note-color-tile-label">{color.label}</span>
            </button>
        );
    };

    return (
        <Popover anchor={anchor} onClose={onClose} label="Page colour" className="note-color-popover">
            {/* Named, so they are readable rather than being identified only by a
                tooltip a pointer has to find. */}
            <div className="note-color-grid">{NOTE_PALETTE.map(renderTile)}</div>

            {/*
                The free-form one.

                A native `<input type="color">` rather than a hand-built hue slider:
                the browser's own is the only version of this that ships with an
                eyedropper, with the OS's own picker behind it, and with correct
                handling of every colour space it supports -- all of which a
                hand-rolled slider gets wrong. It cannot be wrapped in the `<button>`
                the other tiles are, so this one is a `<label>`; clicking the label is
                what opens the picker.
            */}
            <div className="note-color-custom-row">
                <label
                    className={`note-color-custom${custom ? ' note-color-custom--on' : ''}`}
                    data-tip="Any colour you like"
                >
                    <input
                        type="color"
                        className="note-color-custom-input"
                        value={custom ? current.solid : SEED}
                        onChange={event => onChange(event.target.value)}
                        aria-label="Pick any page colour"
                    />
                    <Pipette size={13} aria-hidden="true" />
                    <span className="note-color-tile-label">
                        {custom ? current.solid.toUpperCase() : 'Custom'}
                    </span>
                    {custom && <Check size={12} strokeWidth={3} aria-hidden="true" />}
                </label>
            </div>
        </Popover>
    );
};

export default NoteColorPicker;
