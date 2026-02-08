import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { databaseAPI } from '../services/api';
import toast from 'react-hot-toast';
import socketService from '../services/socket';
import {
  FiArrowLeft,
  FiDatabase,
  FiUsers,
  FiClock,
  FiDownload,
  FiBarChart2,
} from 'react-icons/fi';
import ChatInterface from '../components/ChatInterface';
import SchemaViewer from '../components/SchemaViewer';
import HistoryViewer from '../components/HistoryViewer';
import CollaboratorsPanel from '../components/CollaboratorsPanel';
import DataVisualization from '../components/DataVisualization';

interface DatabaseDetails {
  id: number;
  name: string;
  original_filename: string;
  owner_username: string;
  created_at: string;
  updated_at: string;
  schema: any;
  collaborators: any[];
  userPermission: string;
}

const DatabaseView = () => {
  const { databaseId } = useParams<{ databaseId: string }>();
  const navigate = useNavigate();
  const [database, setDatabase] = useState<DatabaseDetails | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'chat' | 'schema' | 'history' | 'collaborators' | 'visualization'>('chat');
  const [activeUsers, setActiveUsers] = useState<any[]>([]);

  useEffect(() => {
    if (databaseId) {
      loadDatabase();
      joinDatabaseRoom();
    }

    return () => {
      if (databaseId) {
        socketService.leaveDatabase(parseInt(databaseId));
      }
    };
  }, [databaseId]);

  const loadDatabase = async () => {
    try {
      const response = await databaseAPI.getDetails(parseInt(databaseId!));
      setDatabase(response.data.database);
    } catch (error: any) {
      toast.error('Failed to load database');
      navigate('/dashboard');
    } finally {
      setIsLoading(false);
    }
  };

  const joinDatabaseRoom = () => {
    socketService.joinDatabase(parseInt(databaseId!));

    socketService.onJoinedDatabase((data) => {
      setActiveUsers(data.activeUsers);
    });

    socketService.onUserJoined((data) => {
      toast.success(`${data.username} joined`, { duration: 2000 });
      setActiveUsers((prev) => [...prev, data]);
    });

    socketService.onUserLeft((data) => {
      toast(`${data.username} left`, { duration: 2000, icon: '👋' });
      setActiveUsers((prev) => prev.filter((u) => u.id !== data.userId));
    });

    socketService.onDatabaseUpdated((data) => {
      toast.success(
        `${data.username} executed ${data.queryType}${data.affectedTables ? ` on ${data.affectedTables}` : ''}`,
        { duration: 3000 }
      );
      // Optionally refresh data
    });
  };

  const handleDownloadDatabase = async () => {
    try {
      const response = await databaseAPI.download(parseInt(databaseId!));

      // Create blob from response data
      const blob = new Blob([response.data], { type: 'application/x-sqlite3' });
      const url = window.URL.createObjectURL(blob);

      // Create temporary link and trigger download
      const link = document.createElement('a');
      link.href = url;
      link.download = database?.original_filename || 'database.db';
      document.body.appendChild(link);
      link.click();

      // Cleanup
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      toast.success('Database downloaded successfully!');
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to download database');
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="spinner border-4 border-primary-600 border-t-transparent rounded-full w-12 h-12"></div>
      </div>
    );
  }

  if (!database) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-4">
              <button
                onClick={() => navigate('/dashboard')}
                className="p-2 hover:bg-gray-100 rounded-lg transition"
              >
                <FiArrowLeft className="w-5 h-5" />
              </button>

              <div className="flex items-center">
                <FiDatabase className="w-6 h-6 text-primary-600 mr-3" />
                <div>
                  <h1 className="text-xl font-bold text-gray-900">{database.name}</h1>
                  <p className="text-xs text-gray-500">{database.original_filename}</p>
                </div>
              </div>
            </div>

            <div className="flex items-center space-x-4">
              {/* Download Button */}
              <button
                onClick={handleDownloadDatabase}
                className="flex items-center space-x-2 px-3 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition text-sm font-medium"
                title="Download database file"
              >
                <FiDownload className="w-4 h-4" />
                <span>Download</span>
              </button>

              {/* Active Users */}
              <div className="flex items-center space-x-2 px-3 py-2 bg-gray-100 rounded-lg">
                <div className="w-2 h-2 bg-gray-700 rounded-full animate-pulse"></div>
                <FiUsers className="w-4 h-4 text-gray-700" />
                <span className="text-sm font-medium text-gray-700">
                  {activeUsers.length} online
                </span>
              </div>

              {/* Permission Badge */}
              <div className="px-3 py-1 bg-gray-700 text-white rounded-full text-xs font-medium">
                {database.userPermission}
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex space-x-1 border-b border-gray-200">
            {[
              { id: 'chat', label: 'Chat', icon: FiDatabase },
              { id: 'schema', label: 'Schema', icon: FiDatabase },
              { id: 'history', label: 'History', icon: FiClock },
              { id: 'visualization', label: 'Visualization', icon: FiBarChart2 },
              { id: 'collaborators', label: 'Collaborators', icon: FiUsers },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center px-4 py-3 text-sm font-medium border-b-2 transition ${
                  activeTab === tab.id
                    ? 'border-primary-600 text-primary-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <tab.icon className="w-4 h-4 mr-2" />
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-hidden">
        {activeTab === 'chat' && (
          <ChatInterface
            databaseId={parseInt(databaseId!)}
            schema={database.schema}
            userPermission={database.userPermission}
          />
        )}

        {activeTab === 'schema' && (
          <SchemaViewer databaseId={parseInt(databaseId!)} schema={database.schema} />
        )}

        {activeTab === 'history' && <HistoryViewer databaseId={parseInt(databaseId!)} />}

        {activeTab === 'visualization' && (
          <DataVisualization databaseId={parseInt(databaseId!)} />
        )}

        {activeTab === 'collaborators' && (
          <CollaboratorsPanel
            databaseId={parseInt(databaseId!)}
            userPermission={database.userPermission}
            activeUsers={activeUsers}
          />
        )}
      </main>
    </div>
  );
};

export default DatabaseView;
