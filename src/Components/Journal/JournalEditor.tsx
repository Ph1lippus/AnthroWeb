import React from 'react';
import { useNoteEditorChunk } from '../Notes/useNoteEditorChunk';
import { MoodScale } from './Mood';
import type { JournalDocument } from '../../utils/journalContent';

interface JournalEditorProps {
    value: JournalDocument;
    /**
     * An updater, not a next value.
     *
     * These two editors are siblings holding opposite halves of one document, so
     * a `onChange(next: JournalDocument)` made each one spread the `value` it
     * closed over. TipTap emits from both in the same React batch often enough
     * (a keystroke landing next to a mood tap) that the second call rebuilt the
     * document from the pre-first-call value and silently threw the first change
     * away. Taking an updater lets each half write against the latest state
     * instead of its own snapshot, which is also exactly what `setState` already
     * does -- so the page can hand `setJournalDocument` straight through.
     */
    onChange: (update: (current: JournalDocument) => JournalDocument) => void;
    /** The day's two ratings. Held by the page, because the page autosaves them. */
    morningMood: number | null;
    eveningMood: number | null;
    onMorningMood: (value: number | null) => void;
    onEveningMood: (value: number | null) => void;
    focusMode: boolean;
}

/**
 * Two writing surfaces, two ratings, and the graph metadata that ties them
 * together.
 *
 * The rating sits directly above the writing it belongs to rather than in a
 * separate card or in the rail. That placement is the whole argument for
 * splitting mood in two: a slider asking "how was this morning?" reads
 * completely differently when it is sitting on top of the paragraph you wrote
 * about this morning than when it is a field called "mood" on a form.
 *
 * The pair is drawn as a two-up grid with the daily log's card grid underneath
 * it, so this page and the daily log are visibly the same instrument at
 * different scales. Below them, the topic anchors span the full width: they
 * describe the day as a whole rather than either half of it, and they are what
 * the mind-charts graph is built from.
 */
const JournalEditor: React.FC<JournalEditorProps> = ({
    value,
    onChange,
    morningMood,
    eveningMood,
    onMorningMood,
    onEveningMood,
    focusMode,
}) => {
    const { Editor } = useNoteEditorChunk();
    if (!Editor) return <div className="journal-rich-editor-loading">Loading editor...</div>;

    return (
        <div className={`journal-nodes${focusMode ? ' journal-nodes--focus' : ''}`}>
            <div className="journal-log-puzzle">
                <section className="card puzzle-card journal-node journal-node--morning">
                    <div className="card-body">
                        <MoodScale
                            slot="morning"
                            value={morningMood}
                            onChange={onMorningMood}
                            label="Morning mood"
                            className="journal-entry-scale"
                        />
                        <div className="journal-node-hint">What you hoped for this morning — intentions, dreams, the energy you want to carry</div>
                        <Editor
                            initialHtml={value.morning}
                            onChange={morning => onChange(current => ({ ...current, morning }))}
                            focusMode={focusMode}
                        />
                    </div>
                </section>

                <section className="card puzzle-card journal-node journal-node--evening">
                    <div className="card-body">
                        <MoodScale
                            slot="evening"
                            value={eveningMood}
                            onChange={onEveningMood}
                            label="Evening mood"
                            className="journal-entry-scale"
                        />
                        <div className="journal-node-hint">How the day landed — what went well, what stuck with you, what you're carrying forward</div>
                        <Editor
                            initialHtml={value.evening}
                            onChange={evening => onChange(current => ({ ...current, evening }))}
                            focusMode={focusMode}
                        />
                    </div>
                </section>
            </div>
        </div>
    );
};

export default JournalEditor;