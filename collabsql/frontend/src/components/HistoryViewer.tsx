import { useState, useEffect } from 'react';
import { historyAPI } from '../services/api';
import toast from 'react-hot-toast';
import { FiClock, FiUser, FiCode, FiFilter } from 'react-icons/fi';
import { formatDistanceToNow, format } from 'date-fns';

interface Commit {
  id: number;
  username: string;
  email: string;
  query_executed: string;
  operation_type: string;
  affected_tables: string;
  rows_affected: number;
  commit_message: string;
  timestamp: string;
}

interface HistoryViewerProps {
  databaseId: number;
}

const HistoryViewer: React.FC<HistoryViewerProps> = ({ databaseId }) => {
  const [commits, setCommits] = useState<Commit[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState<string>('all');
  const [stats, setStats] = useState<any>(null);

  useEffect(() => {
    loadHistory();
    loadStats();
  }, [databaseId, filter]);

  const loadHistory = async () => {
    setIsLoading(true);
    try {
      const params: any = { limit: 50 };
      if (filter !== 'all') {
        params.operationType = filter;
      }

      const response = await historyAPI.getCommits(databaseId, params);
      setCommits(response.data.commits);
    } catch (error) {
      toast.error('Failed to load history');
    } finally {
      setIsLoading(false);
    }
  };

  const loadStats = async () => {
    try {
      const response = await historyAPI.getStats(databaseId);
      setStats(response.data);
    } catch (error) {
      console.error('Failed to load stats');
    }
  };

  const getOperationColor = (type: string) => {
    const colors: any = {
      SELECT: 'bg-gray-100 text-gray-800',
      INSERT: 'bg-gray-700 text-white',
      UPDATE: 'bg-gray-600 text-white',
      DELETE: 'bg-gray-900 text-white',
      CREATE: 'bg-gray-700 text-white',
      ALTER: 'bg-gray-600 text-white',
      DROP: 'bg-gray-900 text-white',
      ROLLBACK: 'bg-gray-500 text-white',
    };
    return colors[type] || 'bg-gray-100 text-gray-800';
  };

  return (
    <div className="h-full overflow-y-auto bg-gray-50 p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Commit History</h2>

          {/* Stats */}
          {stats && (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
              <div className="bg-white rounded-lg border border-gray-200 p-4">
                <div className="text-sm text-gray-500">Total Commits</div>
                <div className="text-2xl font-bold text-gray-900">{stats.totalCommits}</div>
              </div>

              {stats.operationStats.slice(0, 3).map((stat: any) => (
                <div key={stat.operation_type} className="bg-white rounded-lg border border-gray-200 p-4">
                  <div className="text-sm text-gray-500">{stat.operation_type}</div>
                  <div className="text-2xl font-bold text-gray-900">{stat.count}</div>
                </div>
              ))}
            </div>
          )}

          {/* Filter */}
          <div className="flex items-center space-x-2">
            <FiFilter className="w-4 h-4 text-gray-500" />
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500"
            >
              <option value="all">All Operations</option>
              <option value="SELECT">SELECT</option>
              <option value="INSERT">INSERT</option>
              <option value="UPDATE">UPDATE</option>
              <option value="DELETE">DELETE</option>
              <option value="CREATE">CREATE</option>
              <option value="ALTER">ALTER</option>
            </select>
          </div>
        </div>

        {/* Commits List */}
        {isLoading ? (
          <div className="flex justify-center items-center h-64">
            <div className="spinner border-4 border-primary-600 border-t-transparent rounded-full w-12 h-12"></div>
          </div>
        ) : commits.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
            <FiClock className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-sm font-medium text-gray-900">No commits yet</h3>
            <p className="mt-1 text-sm text-gray-500">History will appear here as you make changes</p>
          </div>
        ) : (
          <div className="space-y-3">
            {commits.map((commit) => (
              <div key={commit.id} className="bg-white rounded-lg border border-gray-200 p-4 hover:shadow-md transition">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center space-x-3">
                    <div className="bg-gray-100 p-2 rounded-lg">
                      <FiUser className="w-5 h-5 text-gray-600" />
                    </div>
                    <div>
                      <div className="font-medium text-gray-900">{commit.username}</div>
                      <div className="text-xs text-gray-500">{commit.email}</div>
                    </div>
                  </div>

                  <div className="flex flex-col items-end space-y-1">
                    <span className={`px-3 py-1 rounded-full text-xs font-medium ${getOperationColor(commit.operation_type)}`}>
                      {commit.operation_type}
                    </span>
                    <div className="text-xs text-gray-500 flex items-center">
                      <FiClock className="w-3 h-3 mr-1" />
                      {formatDistanceToNow(new Date(commit.timestamp), { addSuffix: true })}
                    </div>
                  </div>
                </div>

                {commit.commit_message && (
                  <p className="text-sm text-gray-700 mb-3">{commit.commit_message}</p>
                )}

                <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center text-xs font-medium text-gray-600">
                      <FiCode className="w-3 h-3 mr-1" />
                      SQL Query
                    </div>
                    <div className="text-xs text-gray-500">
                      {commit.affected_tables && <span>Table: {commit.affected_tables}</span>}
                      {commit.rows_affected > 0 && (
                        <span className="ml-3">{commit.rows_affected} rows affected</span>
                      )}
                    </div>
                  </div>
                  <code className="text-xs text-gray-800 font-mono block overflow-x-auto">
                    {commit.query_executed}
                  </code>
                </div>

                <div className="mt-2 text-xs text-gray-400">
                  Commit ID: {commit.id} • {format(new Date(commit.timestamp), 'PPpp')}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default HistoryViewer;
