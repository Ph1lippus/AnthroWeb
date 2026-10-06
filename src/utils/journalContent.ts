import { stripHtml } from './noteContent';

export interface JournalDocument {
    version: 1;
    morning: string;
    evening: string;
    sentiment: 'good' | 'bad' | 'mixed';
    links: string[];
}

const emptyDocument = (): JournalDocument => ({
    version: 1,
    morning: '',
    evening: '',
    sentiment: 'mixed',
    links: [],
});

/** Read the structured journal format while keeping old plain-text entries valid. */
export const parseJournalDocument = (
    value?: string | null,
    fields?: Pick<JournalDocument, 'morning' | 'evening' | 'sentiment' | 'links'>,
): JournalDocument => {
    if (
        fields &&
        (fields.morning ||
            fields.evening ||
            fields.links.length > 0 ||
            fields.sentiment !== 'mixed')
    ) {
        return {
            ...emptyDocument(),
            ...fields,
            sentiment: fields.sentiment ?? 'mixed',
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
