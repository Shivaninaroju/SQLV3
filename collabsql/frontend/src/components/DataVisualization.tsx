import { useState, useEffect } from 'react';
import { databaseAPI } from '../services/api';
import { FiBarChart2, FiPieChart, FiTrendingUp, FiDatabase, FiInfo } from 'react-icons/fi';

interface ColumnSummary {
  name: string;
  type: string;
  nullPct: number | null;
}

interface TableSummary {
  name: string;
  rowCount: number;
  columnCount: number;
  columns: ColumnSummary[];
}

interface AnalyticsSummary {
  tableCount: number;
  tables: TableSummary[];
}

type ChartType = 'bar' | 'pie' | 'line';

const DataVisualization = ({ databaseId }: { databaseId: number }) => {
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [chartType, setChartType] = useState<ChartType>('bar');
  const [chartData, setChartData] = useState<any[]>([]);
  const [insights, setInsights] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    databaseAPI.getAnalyticsSummary(databaseId)
      .then((res) => {
        if (!cancelled) {
          setSummary(res.data.summary);
          if (res.data.summary?.tables?.length > 0 && !selectedTable) {
            setSelectedTable(res.data.summary.tables[0].name);
          }
        }
      })
      .catch(() => {
        if (!cancelled) setError('Failed to load dataset summary');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [databaseId]);

  useEffect(() => {
    if (!summary || !selectedTable) {
      setChartData([]);
      setInsights([]);
      return;
    }
    const table = summary.tables.find((t) => t.name === selectedTable);
    if (!table) return;

    // Build chart data: for bar/line use row counts per table or column stats
    if (chartType === 'bar') {
      const rowData = summary.tables.map((t) => ({ name: t.name, value: t.rowCount }));
      setChartData(rowData);
      setInsights([
        `${selectedTable} has ${table.rowCount} rows and ${table.columnCount} columns.`,
        table.columns.some((c) => c.nullPct != null && c.nullPct > 0)
          ? `Columns with nulls: ${table.columns.filter((c) => c.nullPct != null && c.nullPct > 0).map((c) => `${c.name} (${c.nullPct}%)`).join(', ')}.`
          : 'No significant nulls in this table.',
        `Largest table by rows: ${summary.tables.reduce((a, b) => (b.rowCount > (a?.rowCount ?? 0) ? b : a), summary.tables[0]).name}.`
      ]);
    } else if (chartType === 'pie') {
      const pieData = summary.tables.map((t) => ({ name: t.name, value: t.rowCount }));
      setChartData(pieData);
      const total = pieData.reduce((s, d) => s + d.value, 0);
      setInsights([
        `Total rows across all tables: ${total}.`,
        ...summary.tables.slice(0, 3).map((t) => `${t.name}: ${t.rowCount} rows (${total ? Math.round((t.rowCount / total) * 100) : 0}%).`)
      ]);
    } else {
      const lineData = summary.tables.map((t, i) => ({ index: i + 1, name: t.name, rows: t.rowCount }));
      setChartData(lineData);
      setInsights([
        `Row distribution across ${summary.tableCount} tables.`,
        `Tables: ${summary.tables.map((t) => t.name).join(', ')}.`
      ]);
    }
  }, [summary, selectedTable, chartType]);

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-2 border-primary-600 border-t-transparent" />
      </div>
    );
  }

  if (error || !summary) {
    return (
      <div className="p-6 text-center text-gray-600">
        {error || 'No summary available'}
      </div>
    );
  }

  const table = summary.tables.find((t) => t.name === selectedTable);
  const maxRows = Math.max(...summary.tables.map((t) => t.rowCount), 1);
  const totalRows = summary.tables.reduce((s, t) => s + t.rowCount, 0);

  return (
    <div className="h-full overflow-y-auto bg-gray-50">
      <div className="max-w-4xl mx-auto p-6 space-y-6">
        <div className="flex items-center gap-2 text-gray-700 mb-4">
          <FiDatabase className="w-5 h-5" />
          <h2 className="text-lg font-semibold">Data Visualization & Summary</h2>
        </div>

        {/* Dataset summary */}
        <section className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-800 mb-3">Dataset Summary</h3>
          <ul className="text-sm text-gray-700 space-y-1">
            <li><strong>Tables:</strong> {summary.tableCount}</li>
            <li><strong>Total rows:</strong> {totalRows.toLocaleString()}</li>
            {summary.tables.map((t) => (
              <li key={t.name}>
                <strong>{t.name}:</strong> {t.rowCount} rows, {t.columnCount} columns
                {t.columns.some((c) => c.nullPct != null) && (
                  <span className="text-gray-500 ml-1">
                    (null %: {t.columns.map((c) => c.nullPct != null ? `${c.name} ${c.nullPct}%` : null).filter(Boolean).join(', ') || '—'})
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>

        {/* Chart type selection */}
        <section className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-800 mb-3">Chart Type</h3>
          <div className="flex flex-wrap gap-4">
            {[
              { id: 'bar' as ChartType, label: 'Bar chart', icon: FiBarChart2 },
              { id: 'pie' as ChartType, label: 'Pie chart', icon: FiPieChart },
              { id: 'line' as ChartType, label: 'Line chart', icon: FiTrendingUp },
            ].map(({ id, label, icon: Icon }) => (
              <label
                key={id}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg border-2 cursor-pointer transition ${
                  chartType === id ? 'border-primary-600 bg-primary-50' : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <input
                  type="radio"
                  name="chartType"
                  checked={chartType === id}
                  onChange={() => setChartType(id)}
                  className="sr-only"
                />
                <Icon className="w-4 h-4" />
                <span className="text-sm font-medium">{label}</span>
              </label>
            ))}
          </div>
        </section>

        {/* Table selector */}
        <section className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-800 mb-3">Table for context</h3>
          <select
            value={selectedTable || ''}
            onChange={(e) => setSelectedTable(e.target.value || null)}
            className="w-full max-w-xs px-3 py-2 border border-gray-300 rounded-lg text-sm"
          >
            {summary.tables.map((t) => (
              <option key={t.name} value={t.name}>{t.name} ({t.rowCount} rows)</option>
            ))}
          </select>
        </section>

        {/* Chart area */}
        <section className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm min-h-[200px]">
          <h3 className="text-sm font-semibold text-gray-800 mb-3">Chart</h3>
          {chartType === 'bar' && (
            <div className="space-y-2">
              {chartData.map((d) => (
                <div key={d.name} className="flex items-center gap-2">
                  <span className="w-24 text-xs truncate">{d.name}</span>
                  <div className="flex-1 h-6 bg-gray-100 rounded overflow-hidden">
                    <div
                      className="h-full bg-primary-600 rounded"
                      style={{ width: `${(d.value / maxRows) * 100}%` }}
                    />
                  </div>
                  <span className="text-xs text-gray-600 w-12">{d.value}</span>
                </div>
              ))}
            </div>
          )}
          {chartType === 'pie' && (
            <div className="flex flex-wrap items-center gap-6">
              <div
                className="w-40 h-40 rounded-full border-4 border-white shadow"
                style={{
                  background: totalRows
                    ? `conic-gradient(${chartData.map((d, i) => {
                        const start = (chartData.slice(0, i).reduce((s, x) => s + x.value, 0) / totalRows) * 360;
                        const end = start + (d.value / totalRows) * 360;
                        const colors = ['#2563eb', '#16a34a', '#ca8a04', '#dc2626', '#9333ea'];
                        return `${colors[i % colors.length]} ${start}deg ${end}deg`;
                      }).join(', ')})`
                    : 'linear-gradient(gray, gray)'
                }}
              />
              <div className="flex-1 min-w-0 space-y-1">
                {chartData.map((d, i) => {
                  const pct = totalRows ? Math.round((d.value / totalRows) * 100) : 0;
                  const colors = ['#2563eb', '#16a34a', '#ca8a04', '#dc2626', '#9333ea'];
                  return (
                    <div key={d.name} className="flex items-center gap-2 text-sm">
                      <span className="w-3 h-3 rounded-full" style={{ backgroundColor: colors[i % colors.length] }} />
                      <span>{d.name}: {d.value} ({pct}%)</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {chartType === 'line' && (
            <div className="flex items-end gap-1 h-32">
              {chartData.map((d, i) => (
                <div
                  key={d.name}
                  className="flex-1 min-w-0 flex flex-col items-center"
                  title={`${d.name}: ${d.rows}`}
                >
                  <div
                    className="w-full bg-primary-600 rounded-t transition"
                    style={{ height: `${(d.rows / maxRows) * 100}%`, minHeight: d.rows ? '4px' : 0 }}
                  />
                  <span className="text-xs text-gray-600 truncate w-full text-center mt-1">{d.name}</span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Textual insights */}
        <section className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-800 mb-3 flex items-center gap-2">
            <FiInfo className="w-4 h-4" />
            Insights
          </h3>
          <ul className="text-sm text-gray-700 space-y-2 list-disc list-inside">
            {insights.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
        </section>

        {/* Column types for selected table */}
        {table && (
          <section className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
            <h3 className="text-sm font-semibold text-gray-800 mb-3">Column types — {table.name}</h3>
            <div className="text-xs text-gray-600 space-y-1">
              {table.columns.map((c) => (
                <div key={c.name} className="flex justify-between gap-2">
                  <span>{c.name}</span>
                  <span>{c.type}{c.nullPct != null ? ` · ${c.nullPct}% null` : ''}</span>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
};

export default DataVisualization;
