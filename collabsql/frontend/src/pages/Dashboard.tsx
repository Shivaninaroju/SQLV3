import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { databaseAPI } from '../services/api';
import toast from 'react-hot-toast';
import {
  FiDatabase,
  FiUpload,
  FiLogOut,
  FiUser,
  FiClock,
  FiUsers,
  FiSearch,
  FiPlus,
} from 'react-icons/fi';
import { formatDistanceToNow } from 'date-fns';

interface Database {
  id: number;
  name: string;
  original_filename: string;
  created_at: string;
  updated_at: string;
  file_size: number;
  description: string;
  permission_level: string;
  owner_username: string;
}

const Dashboard = () => {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const [databases, setDatabases] = useState<Database[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    loadDatabases();
  }, []);

  const loadDatabases = async () => {
    try {
      const response = await databaseAPI.list();
      setDatabases(response.data.databases);
    } catch (error: any) {
      toast.error('Failed to load databases');
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const filteredDatabases = databases.filter((db) =>
    db.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <FiDatabase className="w-8 h-8 text-primary-600 mr-3" />
              <h1 className="text-2xl font-bold text-gray-900">CollabSQL</h1>
            </div>

            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2 px-3 py-2 bg-gray-100 rounded-lg">
                <FiUser className="w-4 h-4 text-gray-600" />
                <span className="text-sm font-medium text-gray-700">{user?.username}</span>
              </div>
              <button
                onClick={handleLogout}
                className="flex items-center px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition"
              >
                <FiLogOut className="w-4 h-4 mr-2" />
                Logout
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Top Actions */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h2 className="text-3xl font-bold text-gray-900">My Databases</h2>
            <p className="mt-1 text-sm text-gray-600">
              {databases.length} {databases.length === 1 ? 'database' : 'databases'} available
            </p>
          </div>

          <button
            onClick={() => setShowUploadModal(true)}
            className="flex items-center px-6 py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition shadow-md hover:shadow-lg"
          >
            <FiPlus className="w-5 h-5 mr-2" />
            Upload Database
          </button>
        </div>

        {/* Search Bar */}
        <div className="mb-6">
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <FiSearch className="h-5 w-5 text-gray-400" />
            </div>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="block w-full pl-10 pr-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              placeholder="Search databases..."
            />
          </div>
        </div>

        {/* Database Grid */}
        {isLoading ? (
          <div className="flex justify-center items-center h-64">
            <div className="spinner border-4 border-primary-600 border-t-transparent rounded-full w-12 h-12"></div>
          </div>
        ) : filteredDatabases.length === 0 ? (
          <div className="text-center py-12">
            <FiDatabase className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-sm font-medium text-gray-900">No databases</h3>
            <p className="mt-1 text-sm text-gray-500">
              {searchQuery ? 'No databases match your search' : 'Get started by uploading a database'}
            </p>
            {!searchQuery && (
              <div className="mt-6">
                <button
                  onClick={() => setShowUploadModal(true)}
                  className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700"
                >
                  <FiUpload className="mr-2" />
                  Upload Database
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredDatabases.map((db) => (
              <DatabaseCard key={db.id} database={db} onClick={() => navigate(`/database/${db.id}`)} />
            ))}
          </div>
        )}
      </main>

      {/* Upload Modal */}
      {showUploadModal && (
        <UploadModal onClose={() => setShowUploadModal(false)} onSuccess={loadDatabases} />
      )}
    </div>
  );
};

// Database Card Component
const DatabaseCard: React.FC<{ database: Database; onClick: () => void }> = ({ database, onClick }) => {
  const getPermissionBadge = (level: string) => {
    const badges = {
      owner: 'bg-gray-900 text-white',
      editor: 'bg-gray-700 text-white',
      viewer: 'bg-gray-100 text-gray-800',
    };
    return badges[level as keyof typeof badges] || badges.viewer;
  };

  return (
    <div
      onClick={onClick}
      className="bg-white rounded-xl shadow-sm hover:shadow-md transition cursor-pointer border border-gray-200 p-6"
    >
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center">
          <div className="bg-primary-100 p-3 rounded-lg">
            <FiDatabase className="w-6 h-6 text-primary-600" />
          </div>
          <div className="ml-4">
            <h3 className="text-lg font-semibold text-gray-900">{database.name}</h3>
            <p className="text-sm text-gray-500">{database.original_filename}</p>
          </div>
        </div>
      </div>

      {database.description && (
        <p className="text-sm text-gray-600 mb-4 line-clamp-2">{database.description}</p>
      )}

      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center text-gray-500">
          <FiClock className="w-4 h-4 mr-1" />
          <span>{formatDistanceToNow(new Date(database.updated_at), { addSuffix: true })}</span>
        </div>

        <span className={`px-3 py-1 rounded-full text-xs font-medium ${getPermissionBadge(database.permission_level)}`}>
          {database.permission_level}
        </span>
      </div>

      <div className="mt-4 pt-4 border-t border-gray-100 flex items-center text-sm text-gray-500">
        <FiUsers className="w-4 h-4 mr-1" />
        <span>Owner: {database.owner_username}</span>
      </div>
    </div>
  );
};

// Upload Modal Component
const UploadModal: React.FC<{ onClose: () => void; onSuccess: () => void }> = ({ onClose, onSuccess }) => {
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isUploading, setIsUploading] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      setFile(selectedFile);
      if (!name) {
        setName(selectedFile.name.replace(/\.(db|sqlite|sqlite3)$/i, ''));
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!file) {
      toast.error('Please select a database file');
      return;
    }

    setIsUploading(true);

    const formData = new FormData();
    formData.append('database', file);
    formData.append('name', name || file.name);
    if (description) {
      formData.append('description', description);
    }

    try {
      await databaseAPI.upload(formData);
      toast.success('Database uploaded successfully!');
      onSuccess();
      onClose();
    } catch (error: any) {
      const errorMessage = error.response?.data?.error || 'Upload failed';
      toast.error(errorMessage);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">Upload Database</h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Database File</label>
            <input
              type="file"
              accept=".db,.sqlite,.sqlite3"
              onChange={handleFileChange}
              className="block w-full text-sm text-gray-900 border border-gray-300 rounded-lg cursor-pointer bg-gray-50 focus:outline-none"
            />
            <p className="mt-1 text-xs text-gray-500">Accepted: .db, .sqlite, .sqlite3 (Max 50MB)</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Database Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="block w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
              placeholder="My Database"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Description (Optional)</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="block w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
              placeholder="Brief description of this database..."
            />
          </div>

          <div className="flex space-x-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isUploading || !file}
              className="flex-1 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isUploading ? 'Uploading...' : 'Upload'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default Dashboard;
