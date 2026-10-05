import React from 'react';
import NotesWorkspace from '../Components/Notes/NotesWorkspace';

/**
 * /Notes. The workspace opens the most recently touched page itself, so the list
 * never appears without a page beside it.
 */
const NotesPage: React.FC = () => (
    <div className="notes-page">
        <NotesWorkspace />
    </div>
);

export default NotesPage;
