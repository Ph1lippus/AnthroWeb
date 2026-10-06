/**
 * Checks the things about the notes page's appearance and the app tooltip that
 * fail silently.
 *
 * Every check here is structural rather than visual, because the failure modes
 * this file exists for all look fine in a screenshot of the happy path and wrong
 * in use:
 *
 *  - A floating panel positioned inside `.notes-workspace` is clipped by it, not
 *    drawn over the page. `.notes-pane` is `overflow: hidden`, the workspace is
 *    `contain: layout paint`, and its `backdrop-filter` makes it a containing
 *    block for fixed descendants -- so `position: fixed` does not escape either.
 *    The fix is to render into <body>, which is what `Popover` does, and this
 *    asserts it so a refactor cannot quietly put the panel back inside.
 *
 *  - A dismiss-on-outside-click handler that does not know about the portalled
 *    panel unmounts it on pointerdown, before the click on the swatch inside can
 *    land. Every colour and icon then silently fails to apply, which is the single
 *    most confusing bug this feature has had. Asserted structurally because it
 *    cannot be seen by looking at the open panel.
 *
 *  - A position held in state and corrected from an effect that reads it is a
 *    loop: a fresh object never compares equal, so the effect re-triggers for
 *    ever and React eventually gives up on the nesting depth. `nextPosIfMoved` in
 *    SidebarNav is the guard against exactly this, and the fix here was to stop
 *    holding the position in state at all.
 *
 *  - `title` on a control is the accessible name when there is nothing else, so
 *    the sweep to `data-tip` must not have taken one away from anything that has
 *    no visible text.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

let pass = 0;
let fail = 0;
const check = (name, ok, detail = '') => {
    if (ok) {
        pass++;
        console.log(`  ok   ${name}`);
    } else {
        fail++;
        console.log(` FAIL  ${name}${detail ? ` -> ${detail}` : ''}`);
    }
};

const read = rel => readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');

const popover = read('src/Components/Popover.tsx');
const tipLayer = read('src/Components/TooltipLayer.tsx');
const css = read('src/index.css').replace(/\/\*[\s\S]*?\*\//g, '');
const noteColors = read('src/utils/noteColors.ts');
const noteIcons = read('src/utils/noteIcons.ts');
const pane = read('src/Components/Notes/NoteEditorPane.tsx');
const badge = read('src/Components/Notes/NoteIconBadge.tsx');
const colorPicker = read('src/Components/Notes/NoteColorPicker.tsx');
const iconPicker = read('src/Components/Notes/NoteIconPicker.tsx');

/**
 * The four components that used to interpolate `notes_icon` straight into markup,
 * which put a bare emoji in each and made four independent decisions about its
 * size. Hoisted rather than concatenated inside the check, because a four-line
 * expression inside a regex test is unreadable and ungreppable.
 */
const notesIconSites = [
    'src/Components/Notes/NoteEditorPane.tsx',
    'src/Components/Notes/NotesSidebar.tsx',
    'src/Components/Notes/NotesWorkspace.tsx',
    'src/Components/Notes/QuickSwitcher.tsx',
].map(read).join('\n');

/**
 * Every declaration block for a class selector, joined.
 *
 * Not `css.match(/.../)`, which returns whichever occurrence comes first. The
 * stylesheet has an indented `.notes-workspace { background: none; border: none }`
 * in a later cascade block that appears several hundred lines *before* the real
 * layout rule -- so "the first rule" was the wrong rule, and a check written
 * against it reported a workspace with neither `overflow` nor `contain` while the
 * actual element had both. Collect them all and assert that the selector carries
 * the declaration somewhere.
 */
const cssRules = (selector, source) => {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`${escaped}\\s*\\{[^}]*\\}`, 'g');
    return [...source.matchAll(re)].map(m => m[0]).join('\n');
};

/** Every .tsx under src. */
const tsxFiles = [];
const walk = dir => {
    for (const entry of readdirSync(dir)) {
        const p = join(dir, entry);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.tsx$/.test(p)) tsxFiles.push(p);
    }
};
walk(new URL('../src', import.meta.url).pathname.replace(/^\//, ''));

/* ------------------------------------------------------------------ popover */
console.log('\n== the panels escape the pane they belong to ==');
{
    const workspace = cssRules('.notes-workspace', css);
    check('the workspace rule was found', workspace.length > 0);
    // The three reasons a panel cannot live inside it. Asserted because the whole
    // architecture is downstream of them: remove any one and an inline panel
    // becomes viable again, at which point the portal looks like pointless
    // indirection and the next person removes it.
    check('the workspace clips its own overflow', /overflow:\s*hidden/.test(workspace), workspace.trim());
    check('and contains its paint, so a child cannot escape it',
        /contain:\s*(layout\s+paint|paint\s+layout)/.test(workspace), workspace.trim());

    const paneRule = cssRules('.notes-pane', css);
    check('the pane clips too', /overflow:\s*hidden/.test(paneRule), paneRule.trim());

    check('the panel is rendered through createPortal',
        /createPortal\([\s\S]*document\.body/.test(popover));
    check('and is not rendered inside the pane element',
        !/note-pane-shell[\s\S]*<Popover[\s\S]*note-pane-scroll/.test(pane));

    const rule = cssRules('.popover', css);
    check('the popover rule was found', rule.length > 0);
    // `absolute` against an in-pane ancestor is what `overflow: hidden` clipped.
    check('the popover is positioned against the viewport',
        /position:\s*fixed/.test(rule) && !/position:\s*absolute/.test(rule), rule.trim());
    check('and carries a z-index from the shared scale', /z-index:\s*var\(--z-popover\)/.test(rule), rule.trim());
    // Above the modal overlay and the chart modal, below toasts. Getting this wrong
    // hides the panel behind the dialog it was opened from.
    check('the popover level sits above the modal layers and below toasts',
        /--z-popover:\s*(\d+)/.test(css) && Number(css.match(/--z-popover:\s*(\d+)/)[1]) > 300,
        css.match(/--z-popover:\s*\d+/)?.[0] ?? 'not declared');
}

console.log('\n== the dismissal knows about the portalled panel ==');
{
    // The check itself: both the panel AND the trigger have to be recognised as
    // "inside". Recognising only the trigger closes the panel on pointerdown of
    // any swatch, and the click that would have selected it never lands.
    check('the handler tests the panel before closing',
        /panelRef\.current\?\.contains\(target\)/.test(popover));
    check('and tests the anchor too',
        /anchor\?\.contains\(target\)/.test(popover));
    check('it listens in the capture phase, so a stopped event cannot swallow it',
        /addEventListener\('mousedown', onDown, true\)/.test(popover));
    check('Escape closes it', /key\s*!==?\s*'Escape'|'Escape'\s*!==/.test(popover));
    check('and stops there, rather than also closing whatever is behind it',
        /event\.stopPropagation\(\)/.test(popover));
    // Escape inside a text field in the panel belongs to that field -- the icon
    // search clears its query on it. Closing as well would mean one keystroke
    // discards the search *and* dismisses the picker.
    check('Escape inside a field in the panel is left to that field',
        /HTMLInputElement/.test(popover) && /panelRef\.current\?\.contains\(target\)/.test(popover));
    check('but Escape elsewhere in the panel still closes it',
        /popover/.test(popover) && /!== 'Escape'\) return/.test(popover));
}

console.log('\n== the position is measured, not estimated ==');
{
    check('it reads the anchor rect', /getBoundingClientRect/.test(popover));
    check('and clamps to the window',
        /window\.innerHeight/.test(popover) && /window\.innerWidth/.test(popover));
    check('it flips to the other edge when the requested one does not fit',
        /resolved = 'top'/.test(popover) && /resolved = 'left'/.test(popover));
    // The placement is written to the node rather than to state. Asserted because
    // the state version is the one that loops: an effect that writes a fresh
    // object to correct a fresh object never compares equal to itself.
    check('the coordinates are written to the node, not held in state',
        /panel\.style\.top/.test(popover) && /panel\.style\.left/.test(popover));
    check('so nothing reads the position back to re-trigger itself',
        !/setPos/.test(popover));
    check('and the layout effect settles before the paint', /useLayoutEffect/.test(popover));
}

console.log('\n== the app tooltip ==');
{
    check('it is portalled to the body', /createPortal\([\s\S]*document\.body/.test(tipLayer));
    check('it is delegated rather than per-control',
        /addEventListener\('mouseover', onOver, true\)/.test(tipLayer));
    // Both, or a tip is a mouse-only feature and the icon rail stops working for
    // anyone navigating by keyboard.
    check('keyboard focus opens it as well as hover',
        /addEventListener\('focusin'/.test(tipLayer) && /addEventListener\('focusout'/.test(tipLayer));
    check('with no delay on focus, since Tab is deliberate',
        /open\(anchor, true\)/.test(tipLayer));
    check('the position is written to the node too', /node\.style\.top/.test(tipLayer));
    // The loop the position-in-state version had: a layout effect that reads the
    // tip and writes a fresh object back re-triggers for ever. Reading the tip
    // state inside a layout effect at all is the smell.
    check('no effect reads the tip back to correct itself',
        !/useLayoutEffect\(\(\) => \{[\s\S]{0,200}?setTip/.test(tipLayer));
    check('and re-entering the same tip bails out rather than re-measuring',
        /current\.anchor === anchor/.test(tipLayer));

    const rule = cssRules('.tooltip', css);
    check('the tooltip rule was found', rule.length > 0);
    check('it does not move the browser default: no `title` in the tree',
        !tsxFiles.some(f => /(^|\s)title=\s*(["'{])/.test(readFileSync(f, 'utf8'))
            && !/\b(Title|ConfirmModal|ChartCard)\b/.test(readFileSync(f, 'utf8'))),
        'a file has a title= with none of the components that take a title prop');
    check('the tooltip is pointer-transparent so it cannot steal the click',
        /pointer-events:\s*none/.test(rule), rule.trim());
    // The cause of the tips being cut off by the edge of the screen. `nowrap`
    // under a `max-width` is a lie about the box: the box is clamped to the cap
    // while the text keeps painting past it, and `offsetWidth` -- which is what
    // the placement clamps against -- reports the clamped box. So the code placed
    // a tip it believed fit, and the label ran off the display and was cut by it.
    check('the tip wraps, so the measured box is the painted box',
        /white-space:\s*normal/.test(rule) && !/white-space:\s*nowrap/.test(rule), rule.trim());
    check('and a long unbroken label is broken rather than left to overflow',
        /overflow-wrap:\s*anywhere/.test(rule), rule.trim());
    check('the cap is bounded by the viewport, not a fixed width',
        /max-width:\s*min\([^)]*100vw/.test(rule), rule.trim());
    check('the wrap opt-in is gone rather than left contradicting the rule',
        !/tooltip--wrap/.test(css) && !/data-tip-wrap/.test(read('src/Components/TooltipLayer.tsx'))
        && !/data-tip-wrap/.test(notesIconSites));
    // Left and right have to be centred on the anchor rather than aligned to its
    // top edge: the rail rows are 30px tall against a tip that is two lines high,
    // and matching the two top edges hangs the tip below the row like a caption.
    check('a side tip is centred on its control, not aligned to its top edge',
        /rect\.top \+ rect\.height \/ 2 - height \/ 2/.test(tipLayer));
    check('the notes rail asks for that edge explicitly',
        /data-tip-side="right"/.test(read('src/Components/Notes/NotesSidebar.tsx')));
    check('and the icon inside a rail row does not answer with its own label',
        /showTip=\{false\}/.test(read('src/Components/Notes/NotesSidebar.tsx')),
        'hovering the icon would show the icon instead of the page');
    check('it opts out of animation under prefers-reduced-motion',
        /\.tooltip \{[\s\S]*?animation:\s*none/.test(css.replace(/\/\*[\s\S]*?\*\//g, '')));
    // `sidebar-tooltip-in` carries a `translateY(-50%)` for a rule that centres
    // itself on a rail icon. Inheriting it moved this one half its own height.
    check('it has its own keyframes rather than reusing the sidebar one',
        /@keyframes tooltip-in/.test(css) && !/\.tooltip \{[^}]*sidebar-tooltip-in/.test(css));
    check('and it is mounted once, at the top of the tree',
        /<TipLayer \/>/.test(read('src/App.tsx')));
}

/* ------------------------------------------------------------------- colour */
console.log('\n== page colour ==');
{
    check('the palette is named and stores an id, not a hex',
        /id:\s*'blue'/.test(noteColors) && /LEGACY_HEX/.test(noteColors));
    // Every existing row holds one of the old hexes. Without the table a coloured
    // page loses its colour on the next read, silently.
    check('the legacy hexes are all mapped',
        (noteColors.match(/'#[0-9a-f]{6}':\s*'/gi) ?? []).length >= 7,
        'expected the seven hexes the old picker wrote');
    // An unrecognised *id* still falls back to Default, because a value that cannot be
    // drawn at all is not a colour. A hex is different -- it is drawn, and it is
    // what the user chose.
    check('an unrecognised id falls back to Default rather than throwing',
        /return DEFAULT_NOTE_COLOR;/.test(noteColors)
        && /return named;\s*if \(HEX\.test/.test(noteColors));
    check('Default is the first entry, so removal is always in the same place',
        /export const NOTE_PALETTE: NoteColor\[\] = \[\s*\{ id: '', label: 'Default'/.test(noteColors));

    // The bug this replaces: `--on` and `--none` both set `border-color` at equal
    // specificity, and `--none` came later, so the "no colour" swatch looked the
    // same whether or not it was selected -- making a colour a one-way trip.
    check('the selected tile is a ring, and the swatch/none pair is gone',
        /\.note-color-tile--on/.test(css) && !/note-color-swatch/.test(css));
    check('every tile names itself, rather than relying on a tooltip alone',
        /note-color-tile-label/.test(css) && /aria-pressed/.test(colorPicker));
    check('the picker tiles are all labelled for a screen reader',
        /aria-label={`Page colour: /.test(colorPicker));

    // Free-form. The eleven named colours are a starting set, not a closed one, so
    // a hex the table has never seen has to resolve to itself -- otherwise picking
    // one either shows Default as selected or discards the colour on the next read.
    check('a hex the user chose is taken at face value',
        /HEX\.test\(trimmed\)/.test(noteColors) && /label: 'Custom'/.test(noteColors));
    check('and is distinguished from a palette choice we offered',
        /isCustomNoteColor/.test(noteColors)
        && !noteColors.includes('trimmed.toLowerCase() in LEGACY_HEX}'));
    check('the picker offers a native free-form control',
        /type="color"/.test(colorPicker));
    // A native input is the only version of this that ships with an eyedropper and
    // the OS's own picker; a hand-built hue slider gets every colour space wrong.
    // It cannot go inside the `<button>` the other tiles are, so it is a label.
    check('laid out as its own row rather than an eleventh tile',
        /note-color-custom-row/.test(css) && /note-color-custom-row/.test(colorPicker));
    check('the swatch is the input itself, not a wrapper around a hidden one',
        /appearance:\s*none/.test(css) && /::-webkit-color-swatch/.test(css));
    check('and it is seeded from the app accent, never from #000000',
        /SEED = '#00ffa6'/.test(colorPicker));
    // The grid must show the current colour as selected. It resolved against the
    // palette list directly, which meant a custom hex matched nothing and the
    // panel claimed the page was set to Default.
    check('the selected tile is resolved, not looked up in the palette',
        /resolveNoteColor\(value\)/.test(colorPicker));

    // The colour rule above the page, and the icon, and the bar on the rail row.
    // Those three are the whole of it now.
    check('the accent rule takes the page colour',
        /\.note-pane-accent \{[^}]*var\(--note-solid/.test(css));
    check('and the icon is tinted by it',
        /\.note-icon-badge \{[^}]*var\(--note-text/.test(css));
    check('the accent is always rendered, so setting and clearing cannot shift the page',
        /<div className="note-pane-accent" aria-hidden="true" \/>/.test(pane));
    check('the tint travels down as custom properties',
        /--note-solid/.test(pane) && /--note-text/.test(pane));

    // Asserted as an absence, because that is what it now is. A wash across the
    // scrolling pane read as a different theme rather than an accent, and only
    // ever covered the notes half of the screen -- so the same colour looked
    // applied beside the rail and absent in the rail. If a `--note-bg` comes back
    // this is the check that should notice, so it is written to.
    check('nothing paints a background wash behind the page',
        !/--note-bg/.test(css) && !/--note-bg/.test(pane)
        && !/\.note-pane-scroll \{[^}]*background/.test(css),
        'a --note-bg or a background on .note-pane-scroll came back');
    check('the palette carries no wash value either',
        !/\bbg:/.test(noteColors) && !/rgba\(/.test(noteColors),
        'the palette has a background value that nothing consumes');

    // The icon tile was a 3.25rem rounded box with a hairline, on its own line
    // above the title. Asserted as an absence for the same reason: it read as
    // page furniture rather than as part of the page's name.
    const iconPage = cssRules('.note-icon-badge--page', css);
    check('the page icon has no tile of its own',
        !/background/.test(iconPage) && !/border/.test(iconPage), iconPage.trim());
    check('the icon sits beside the title, not above it',
        /\.note-title-row/.test(css) && /note-title-row/.test(pane));
    check('and the title is allowed to shrink beside it',
        /\.note-title-row \{[^}]*\}/.test(css)
        && /\.note-title-input \{[^}]*min-width:\s*0/.test(css));
    check('tags and the meta line share one row',
        /\.note-meta-row/.test(css) && /note-meta-row/.test(pane));
}

/* --------------------------------------------------------------------- icon */
console.log('\n== page icon ==');
{
    check('the set is lucide, not emoji', /LucideIcon/.test(noteIcons) && /lucide-react/.test(noteIcons));
    check('it is grouped, so sixty icons are findable',
        /NOTE_ICON_GROUPS/.test(noteIcons) && (noteIcons.match(/group: '/g) ?? []).length >= 4);
    check('and searchable', /data-tip/.test(iconPicker) && /Search/.test(iconPicker));
    // Every emoji the old picker wrote, named out rather than counted. A count would
// pass at fifteen if one of them silently stopped matching, and the whole point is
// that every existing row keeps an icon.
const LEGACY_EMOJI = ['📄', '📝', '📌', '⭐', '💡', '🔥', '📚', '🎯', '🧠', '⚙️', '🧪', '💻', '🌱', '✅', '❗', '🎓'];
const unmapped = LEGACY_EMOJI.filter(e => !noteIcons.includes(`'${e}':`));
    check('every emoji the old picker wrote is mapped to a lucide icon',
        unmapped.length === 0, `unmapped: ${unmapped.join(' ')}`);
    check('an unrecognised value renders as nothing rather than as itself',
        /BY_ID\.get\(id\)\s*\?\?\s*null/.test(noteIcons));

    /**
 * The stored icon used as JSX *children* -- i.e. rendered as text.
 *
 * Scoped to `>{...}<` deliberately. `value={note.notes_icon}` on the badge is the
 * correct way to pass it down, and a check that flagged any `{note.notes_icon}`
 * anywhere would fail on the very code that fixes the problem.
 */
const ICON_AS_TEXT = />\s*\{(?:note|ancestor|entry\.note)\.notes_icon\}\s*</;
    check('no component renders the stored icon as text',
        !ICON_AS_TEXT.test(notesIconSites));
    check('they all go through the one badge instead',
        notesIconSites.includes('NoteIconBadge'));
    check('the badge takes the stored value and resolves it itself',
        /resolveNoteIcon\(value\)/.test(badge));
    check('and is tinted by the page colour', /resolveNoteColor/.test(badge));
    check('removal is an explicit control, not a toggle to guess at',
        /Remove/.test(iconPicker) && /onChange\(null\)/.test(iconPicker));
    // The old trigger was a generic `Smile` whatever the page had, so you had to
    // open the picker to find out what was already set.
    check('the trigger previews the page\'s own icon',
        /icon\s*\?\s*<icon\.Icon/.test(pane));
    check('and so does the colour trigger',
        /style=\{\{ color: tone\.id \? tone\.solid/.test(pane));
    check('the icon on the page is itself a way in to the picker',
        /note-page-icon-btn/.test(pane) && /openPickerAt\('icon'/.test(pane));

    // No icon at all, rather than a faded stand-in on every page. A constant on
    // all of them distinguishes nothing, which is the one job an icon has.
    check('an iconless page draws no glyph by default',
        /opacity:\s*0;/.test(cssRules('.note-icon-badge--empty', css)));
    check('the empty slot still reserves its width',
        /\.note-icon-badge--page \{[^}]*width:/.test(css)
        && /\.note-icon-badge--inline \{[^}]*width:\s*18px/.test(css));
    check('and it is revealed on approach, as the way to add a first icon',
        /note-page-icon-btn:hover \.note-icon-badge--empty/.test(css));
    check('no call site passes a permanent fallback any more',
        !/NoteIconBadge[\s\S]{0,200}?fallback\s*(\n\s*)?\/>/.test(notesIconSites)
        || /fallback=\{<Plus/.test(notesIconSites),
        'a NoteIconBadge is still given a fallback that always renders');
}

console.log('\n== focus mode ==');
{
    // Located by text rather than through `cssRules`, because the selector spans
    // several lines and the helper models `<selector> {` on one line. The tail is
    // pinned to the two `:not()`s so the lazy match cannot run past this rule.
    const dim = /\.note-editor-shell--focus \.note-prose[\s\S]{0,240}?:not\(:has\(\.has-focus\)\)\s*\{([^}]*)\}/.exec(css);
    check('the dimming rule is still there', !!dim);

    // The invariant that keeps focus mode from going black inside nested blocks,
    // and from leaving formatted lines lit inside them. `opacity` compounds, so
    // matching a node at each level of its own nesting renders a toggle's body at
    // 0.2^4 -- invisible, not dimmed. And a shape test for "a text leaf" stops
    // matching the moment the line contains a `<strong>`, which is most lines
    // written inside a toggle. Naming the block text holders is what gets both.
    const selector = dim ? dim[0].slice(0, dim[0].indexOf('{')) : '';
    check('the dimming names the blocks that hold a line, rather than testing shape',
        /:is\(/.test(selector) && !/:not\(:has\(> \*\)\)/.test(selector),
        'the shape-based leaf test is back; formatted lines would stop dimming');
    for (const tag of ['p', 'pre', 'summary']) {
        check(`and ${tag} is one of them`,
            new RegExp(`\\b${tag}\\b`).test(selector), selector);
    }
    check('the two blocks that are leaves visually but not structurally',
        /button/.test(selector) && /label/.test(selector),
        'the toggle chevron and the to-do checkbox would stay lit');
    check('a callout glyph is named, since it is text with no wrapper of its own',
        /\.note-callout-glyph/.test(selector), selector);
    check('but `li` is not, or a to-do would take two factors again',
        !/(^|[\s,])li(,|\s|\))/.test(selector), selector);
    check('the page still goes down to 0.2',
        dim?.[1]?.includes('opacity: 0.2'), dim?.[1]?.trim() ?? 'no body');

    // The focused line is lifted by *not being matched*, not by a surface of its
    // own. A background here would mean the caret moving a line repaints a box,
    // which looks like the page reflowing under you.
    const focusRule = cssRules('.note-editor-shell--focus .note-prose .has-focus', css);
    check('the focused line is only undimmed, never re-surfaced',
        !/background/.test(focusRule) && !/font-size/.test(focusRule), focusRule.trim());

    const chrome = /\.notes-workspace:has\(\.note-editor-shell--focus\) :is\(([^)]*)\)/.exec(css);
    check('the chrome rule is still there', !!chrome);
    // The accent rule is a full-width bar in the page's own colour, and so the
    // brightest thing on screen. Left out of this list it was the one element the
    // mode could not reach -- a saturated bar directly above a page that had just
    // been faded out from under it.
    check('the page colour rule dims with everything else',
        !!chrome?.[1] && chrome[1].includes('.note-pane-accent'), chrome?.[1] ?? 'no list');
    check('and so does everything else that is not the line',
        !!chrome?.[1]
        && ['.notes-rail', '.note-pane-bar', '.note-title-row', '.note-meta-row']
            .every(sel => chrome[1].includes(sel)),
        chrome?.[1] ?? 'no list');
    check('the site nav dims to the same value, not to a different one',
        /body:has\(\.note-editor-shell--focus\) :is\(\.sidebar-nav, \.mobile-navbar\) \{\s*opacity: 0\.2;/.test(css));
    check('and nothing brings them back on hover',
        !/note-editor-shell--focus\)[^{]*:hover/.test(css),
        'a focus-mode hover rule crept back in');
    check('and Escape does not toggle it, which was tried and rejected',
        !/setFocusMode\(false\)/.test(pane));
    // verify-focus-mode.mjs is what proves the compounding is actually gone: it
    // builds the real node-view DOM and counts the factors each line takes.
    check('and the compounding is covered behaviourally, not just structurally',
        /dim factors/.test(read('scripts/verify-focus-mode.mjs')));
}

console.log('\n== one picker at a time ==');
{
    // Two booleans would let both be open at once, and two open panels on one
    // anchor race over the same outside-click dismissal.
    check('the open picker is one value, not two booleans',
        /useState<'color' \| 'icon' \| null>/.test(pane));
    check('clicking the other trigger moves the panel',
        /current === which \? null : which/.test(pane));
}

console.log('\n== a note arrives in one piece ==');
{
    // The title, the icon and the body used to paint in two commits: the `<Suspense>`
    // boundary sat *below* the title row, so the page appeared first and the text
    // filled in underneath it a frame later. That is the one thing about this page
    // that is visible without being wrong, so it is asserted rather than trusted.
    // Comments are stripped first: this file's own explanation of the old
    // arrangement names both `lazy()` and `Suspense`, and a check that read them
    // would fail forever against the note describing what was fixed.
    const paneCode = pane.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    check('the pane no longer wraps the editor in a Suspense boundary',
        !/<Suspense/.test(paneCode) && !/\blazy\(/.test(paneCode),
        'a boundary below the title row paints the header on its own again');
    check('the editor arrives through the shared chunk hook',
        /useNoteEditorChunk/.test(pane));
    check('and nothing is drawn until it is here',
        /\{Editor \? \(/.test(pane) && /note-prose-loading/.test(pane));

    const chunk = read('src/Components/Notes/useNoteEditorChunk.ts');
    check('the chunk is fetched once and shared', /pending \?\?=/.test(chunk));
    // `lazy` attaches `.then`, which settles on a microtask -- so even an
    // already-loaded chunk reads as pending on the first render and paints its
    // fallback. The module cache is what makes a second visit synchronous.
    check('the resolved module is cached, so a later visit renders on the first commit',
        /resolved/.test(chunk) && /useState<NoteEditorChunkState>\(\(\) =>/.test(chunk));
    check('a rejected chunk still settles, rather than holding the splash for ever',
        /useNoteEditorChunk/.test(chunk) && /\(\) => \{\s*\n?\s*\/\/ Settled/.test(chunk)
        || /settled: true/.test(chunk));

    const workspace = read('src/Components/Notes/NotesWorkspace.tsx');
    check('the splash is held until the editor can be drawn',
        /useBootHold\(!editorSettled\)/.test(workspace));
    // The splash only covers a cold load. Reaching /Notes inside a running session
    // is the other half, where a title-first pane would still be visible.
    check('and the pane itself draws nothing until it is settled',
        /!editorSettled \? null : activeNote \?/.test(workspace));
    // The download is started by hand rather than from the top of the chunk module,
    // which `App.tsx` reaches: a module-scope import() there would pull TipTap down
    // on every app load for the routes that never open a note.
    check('and the fetch is not started by the module itself', !/^import\('\.\/NoteEditor'\)/m.test(chunk));
}

console.log(fail === 0 ? `\nALL PASS: ${pass} checks` : `\n${fail} FAILED of ${pass + fail}`);
process.exit(fail === 0 ? 0 : 1);
