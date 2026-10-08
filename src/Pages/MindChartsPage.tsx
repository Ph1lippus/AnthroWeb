import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import Title from '../Components/Title';
import { DEFAULT_RANGE, RANGES } from '../Components/Dashboard/dateRange';
import type { DateRange } from '../Components/Dashboard/dateRange';
import { useDailyLogs } from '../hooks/useDailyLogs';
import { useBootHold } from '../services/bootScreen';
import LoadingBar from '../Components/LoadingBar';
import MoodStatCards from '../Components/MindCharts/MoodStatCards';
import { ChevronLeft } from 'lucide-react';

/**
 * Where the journal's ratings and topics go.
 *
 * The journal page collects three things per day -- a morning rating, an evening
 * rating and a set of topic anchors -- and until now there was nowhere that read
 * them back. The daily log shows a day's two ratings as badges and the dashboard
 * draws them as two lines, but neither of those is a view of the *pattern*: how
 * much a typical day moves between its two halves, and which half is doing the
 * damage.
 *
 * Everything on the page reads one query, the daily-log list the dashboard already
 * keeps warm, so opening it costs no request of its own.
 */
const MindChartsPage: React.FC = () => {
    const navigate = useNavigate();
    const { logs, isLoading } = useDailyLogs();
    const [range, setRange] = useState<DateRange>(DEFAULT_RANGE);

    useBootHold(isLoading);

    /**
     * The list is nullable until it arrives. An empty array would be the same
     * thing as a user with no entries, and the tiles would then claim a low mood
     * about a query that has not run yet -- so the two are kept distinct and the
     * page waits.
     */
    const rows = useMemo(() => logs ?? [], [logs]);

    if (isLoading) return <LoadingBar show blocking label="Loading mind charts" />;

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
                                    onClick={() => setRange(r)}
                                    className={'metric-range-pill' + (range.label === r.label ? ' metric-range-pill--active' : '')}
                                >
                                    {r.label}
                                </button>
                            ))}
                        </div>
                    </div>

                </div>
            </div>
        </>
    );
};

export default MindChartsPage;