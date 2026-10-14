import { stripHtml } from './noteContent';

export interface JournalDocument {
    version: 1;
    morning: string;
    evening: string;
    links: string[];
}

const emptyDocument = (): JournalDocument => ({
    version: 1,
    morning: '',
    evening: '',
    links: [],
});

/** Read the structured journal format while keeping old plain-text entries valid. */
export const parseJournalDocument = (
    value?: string | null,
    fields?: Pick<JournalDocument, 'morning' | 'evening' | 'links'>,
): JournalDocument => {
    if (
        fields &&
        (fields.morning ||
            fields.evening ||
            fields.links.length > 0)
    ) {
        /**
         * An entry that predates the split has all of its text in `journal_entry`
         * and nothing in the two halves. That text belongs in the evening: it was
         * written at the end of a day, and there is nothing to suggest otherwise.
         *
         * Only when `value` is genuinely legacy, though -- that is, when it does
         * not parse as the structured format. Once a row has been saved by this
         * format, `value` always starts with `{` and the two halves are the whole
         * truth.
         *
         * This used to fall back to `fields.morning` in that case, which meant an
         * evening you had not written in was silently filled with a copy of the
         * morning -- and because the page then autosaved, that copy was written
         * back to `journal_evening`. It ratcheted: every reload of a day with an
         * empty evening duplicated the morning into it and persisted the result,
         * so entries quietly doubled up. Reading `value` is the only case that
         * justifies inventing an evening at all.
         */
        const legacyEvening = fields.evening || (
            value && !value.trim().startsWith('{') ? value : ''
        );
        return {
            ...emptyDocument(),
            ...fields,
            evening: legacyEvening,
            links: fields.links ?? [],
        };
    }
    if (!value) return emptyDocument();
    try {
        const parsed: unknown = JSON.parse(value);
        if (
            parsed &&
            typeof parsed === 'object' &&
            'morning' in parsed &&
            'evening' in parsed
        ) {
            const document = parsed as Partial<JournalDocument>;
            return {
                ...emptyDocument(),
                ...document,
                morning: typeof document.morning === 'string' ? document.morning : '',
                evening: typeof document.evening === 'string' ? document.evening : '',
                links: Array.isArray(document.links)
                    ? document.links.filter((link): link is string => typeof link === 'string')
                    : [],
            };
        }
    } catch {
        // Existing journal entries were plain text, not JSON.
    }
    return { ...emptyDocument(), evening: `<p>${value}</p>` };
};

export const serializeJournalDocument = (document: JournalDocument): string =>
    JSON.stringify(document);

export const journalDocumentText = (document: JournalDocument): string =>
    stripHtml(`${document.morning} ${document.evening}`).trim();

export const journalWordCount = (document: JournalDocument): number => {
    const text = journalDocumentText(document);
    return text ? text.split(/\s+/).length : 0;
};

/** Hashtags are explicit, low-friction topic anchors written in the entry itself. */
export const journalTopicSuggestions = (document: JournalDocument): string[] => {
    const topics = new Set<string>();
    for (const match of journalDocumentText(document).matchAll(/(?:^|\s)#([A-Za-z0-9][\w-]{1,29})/g)) {
        topics.add(match[1].toLowerCase());
    }
    return [...topics];
};

