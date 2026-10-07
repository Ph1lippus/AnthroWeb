import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import Title from '../Components/Title';
import { DEFAULT_RANGE, RANGES } from '../Components/Dashboard/dateRange';
import type { DateRange } from '../Components/Dashboard/dateRange';
import { useDailyLogs } from '../hooks/useDailyLogs';
import { useBootHold } from '../services/bootScreen';
import LoadingBar from '../Components/LoadingBar';
import TopicNetwork from '../Components/MindCharts/TopicNetwork';
import MoodStatCards from '../Components/MindCharts/MoodStatCards';
import { Network, ChevronLeft } from 'lucide-react';

/**
 * Where the journal's ratings and topics go.
 *
 * The journal page collects three things per day -- a morning rating, an evening
 * rating and a set of topic anchors -- and until now there was nowhere that read
 * them back. The daily log shows a day's two ratings as badges and the dashboard
 * draws them as two lines, but neither of those is a view of the *pattern*: which
 * subjects keep recurring, whether the days they recur on are good ones, and how
 * much a typical day moves between its two halves.
 *
 * The network is the page's centrepiece and the tiles are its summary. A topic's
 * bubble is sized by how often it recurs and tinted by the mood of the days it
 * recurred on, so the question the graph answers -- "what comes up when I am
 * doing badly?" -- is answerable by looking rather than by correlating two charts.
 *
 * Everything on the page reads one query, the daily-log list the dashboard already
 * keeps warm, so opening it costs no request of its own.
 */
const MindChartsPage: React.FC = () => {
    const navigate = useNavigate();
    const { logs, isLoading } = useDailyLogs();
    const [range, setRange] = useState<DateRange>(DEFAULT_RANGE);
    const [selected, setSelected] = useState<string | null>(null);

    useBootHold(isLoading);

    /**
     * The list is nullable until it arrives. An empty array would be the same
     * thing as a user with no entries, and the graph would then claim "no topics
     * repeated" about a query that has not run yet -- so the two are kept
     * distinct and the page waits.
     */
    const rows = useMemo(() => logs ?? [], [logs]);

    /**
     * How many days the graph draws.
     *
     * The window the pills choose governs the chart and the tiles, but the graph
     * gets its own number: it plots one node per day, so "All Time" would mean
     * several hundred day nodes and a layout that takes seconds to settle and is
     * unreadable at any width. Fourteen months is past any habit cycle and stays
     * inside what the O(n^2) repulsion can lay out without stalling.
     */
    const graphDays = useMemo(
        () => (range.days === null ? 420 : Math.max(range.days, 90)),
        [range.days],
    );

    // A topic needs two mentions to become a bubble. One mention is not a subject,
    // it is a word, and plotting every word ever written produces a hairball of
    // singletons that hides the recurrences the graph exists to show.
    const MIN_TOPIC_COUNT = 2;

    if (isLoading) return <LoadingBar show blocking label="Loading mind charts" />;

    const selectedTopic = selected?.startsWith('topic:')
        ? selected.slice('topic:'.length)
        : null;

    return (
        <>
            <Title title="Mind Charts" />
            <div className="page-main-with-secondary mind-charts-wrapper">
                <div className="dashboard-section">
                    <MoodStatCards logs={rows} maxDays={range.days} />

                    <div className="mind-charts-head">
                        <div className="flex gap-2 flex-wrap">
                            <button onClick={() => navigate('/Journal')} className="btn-action">
                                <ChevronLeft size={14} className="mr-1" />Journal
                            </button>
                        </div>
                        <div className="metric-range-pills">
                            {RANGES.map(r => (
                                <button
                                    key={r.label}
                                    type="button"
                                    onClick={() => { setRange(r); setSelected(null); }}
                                    className={'metric-range-pill' + (range.label === r.label ? ' metric-range-pill--active' : '')}
                                >
                                    {r.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="card puzzle-card mind-charts-network-card">
                        <div className="card-header">
                            <h3 className="card-title">
                                <Network size={14} />Topic network
                            </h3>
                            <span className="mind-charts-subtitle">
                                {selectedTopic
                                    ? `Showing "${selectedTopic}" and its links — click it again to clear`
                                    : 'Bubble size is how often a topic recurs; colour is the mood of the days it recurred on'}
                            </span>
                        </div>
                        <div className="card-body">
                            <TopicNetwork
                                logs={rows}
                                maxDays={graphDays}
                                minTopicCount={MIN_TOPIC_COUNT}
                                selected={selected}
                                onSelect={setSelected}
                            />
                        </div>
                    </div>

                </div>
            </div>
        </>
    );
};

export default MindChartsPage;