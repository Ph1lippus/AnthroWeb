import React from 'react';
import { useNoteEditorChunk } from '../Notes/useNoteEditorChunk';
import type { JournalDocument } from '../../utils/journalContent';

interface JournalEditorProps {
    value: JournalDocument;
    onChange: (value: JournalDocument) => void;
}

const JournalEditor: React.FC<JournalEditorProps> = ({ value, onChange }) => {
    const { Editor } = useNoteEditorChunk();

    if (!Editor) return <div className="journal-rich-editor-loading">Loading editor...</div>;

    return (
        <div className="journal-rich-editor">
            <section className="journal-node journal-node--morning">
                <div className="journal-node-heading">
                    <span>Morning Node</span>
                    <small>Intentions, dreams, sleep and anticipation</small>
                </div>
                <Editor
                    initialHtml={value.morning}
                    onChange={morning => onChange({ ...value, morning })}
                    autoFocus={!value.morning && !value.evening}
                />
            </section>
            <section className="journal-node journal-node--evening">
                <div className="journal-node-heading">
                    <span>Evening Node</span>
                    <small>Gratitude, wins, friction and processing</small>
                </div>
                <Editor
                    initialHtml={value.evening}
                    onChange={evening => onChange({ ...value, evening })}
                />
            </section>
            <div className="journal-node-links">
                <label>
                    Day signal
                    <select
                        value={value.sentiment}
                        onChange={event =>
                            onChange({
                                ...value,
                                sentiment: event.target.value as JournalDocument['sentiment'],
                            })
                        }
                    >
                        <option value="good">Good Day Hub</option>
                        <option value="mixed">Mixed / unclassified</option>
                        <option value="bad">Bad Day Hub</option>
                    </select>
                </label>
                <label>
                    Linked topics
                    <input
                        value={value.links.join(', ')}
                        onChange={event =>
                            onChange({
                                ...value,
                                links: event.target.value
                                    .split(',')
                                    .map(link => link.trim())
                                    .filter(Boolean),
                            })
                        }
                        placeholder="Project Launch, Stoicism"
                    />
                </label>
            </div>
        </div>
    );
};

export default JournalEditor;
