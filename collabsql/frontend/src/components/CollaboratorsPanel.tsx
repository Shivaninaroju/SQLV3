import { useState, useEffect } from 'react';
import { collaborationAPI } from '../services/api';
import toast from 'react-hot-toast';
import {
  FiUserPlus,
  FiUser,
  FiMail,
  FiTrash2,
  FiEdit,
  FiCheck,
  FiX,
} from 'react-icons/fi';
import { formatDistanceToNow } from 'date-fns';

interface Collaborator {
  id: number;
  username: string;
  email: string;
  permission_level: string;
  granted_at: string;
  granted_by_username: string;
}

interface CollaboratorsPanelProps {
  databaseId: number;
  userPermission: string;
  activeUsers: any[];
}

const CollaboratorsPanel: React.FC<CollaboratorsPanelProps> = ({
  databaseId,
  userPermission,
  activeUsers,
}) => {
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);

  useEffect(() => {
    loadCollaborators();
  }, [databaseId]);

  const loadCollaborators = async () => {
    setIsLoading(true);
    try {
      const response = await collaborationAPI.getCollaborators(databaseId);
      setCollaborators(response.data.collaborators);
    } catch (error) {
      toast.error('Failed to load collaborators');
    } finally {
      setIsLoading(false);
    }
  };

  const isOwner = userPermission === 'owner';

  const getPermissionBadge = (level: string) => {
    const badges: any = {
      owner: 'bg-gray-900 text-white',
      editor: 'bg-gray-700 text-white',
      viewer: 'bg-gray-100 text-gray-800',
    };
    return badges[level] || badges.viewer;
  };

  const isUserActive = (userId: number) => {
    return activeUsers.some((u) => u.id === userId);
  };

  return (
    <div className="h-full overflow-y-auto bg-gray-50 p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Collaborators</h2>
            <p className="text-sm text-gray-600">
              {collaborators.length} {collaborators.length === 1 ? 'person has' : 'people have'} access to
              this database
            </p>
          </div>

          {isOwner && (
            <button
              onClick={() => setShowAddModal(true)}
              className="flex items-center px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition"
            >
              <FiUserPlus className="w-4 h-4 mr-2" />
              Add Collaborator
            </button>
          )}
        </div>

        {/* Active Users Banner */}
        {activeUsers.length > 0 && (
          <div className="bg-gray-50 border border-gray-300 rounded-lg p-4 mb-6">
            <div className="flex items-center space-x-2 mb-2">
              <div className="w-2 h-2 bg-gray-700 rounded-full animate-pulse"></div>
              <span className="text-sm font-medium text-gray-900">
                {activeUsers.length} {activeUsers.length === 1 ? 'user' : 'users'} currently online
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {activeUsers.map((user) => (
                <span
                  key={user.id}
                  className="px-3 py-1 bg-white text-gray-800 rounded-full text-xs font-medium border border-gray-200"
                >
                  {user.username}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Collaborators List */}
        {isLoading ? (
          <div className="flex justify-center items-center h-64">
            <div className="spinner border-4 border-primary-600 border-t-transparent rounded-full w-12 h-12"></div>
          </div>
        ) : (
          <div className="space-y-3">
            {collaborators.map((collaborator) => (
              <CollaboratorCard
                key={collaborator.id}
                collaborator={collaborator}
                databaseId={databaseId}
                isOwner={isOwner}
                isActive={isUserActive(collaborator.id)}
                onUpdate={loadCollaborators}
                getPermissionBadge={getPermissionBadge}
              />
            ))}
          </div>
        )}

        {/* Add Collaborator Modal */}
        {showAddModal && (
          <AddCollaboratorModal
            databaseId={databaseId}
            onClose={() => setShowAddModal(false)}
            onSuccess={() => {
              loadCollaborators();
              setShowAddModal(false);
            }}
          />
        )}
      </div>
    </div>
  );
};

// Collaborator Card
const CollaboratorCard: React.FC<any> = ({
  collaborator,
  databaseId,
  isOwner,
  isActive,
  onUpdate,
  getPermissionBadge,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [newPermission, setNewPermission] = useState(collaborator.permission_level);

  const handleUpdatePermission = async () => {
    try {
      await collaborationAPI.updatePermission(databaseId, collaborator.id, {
        permissionLevel: newPermission,
      });
      toast.success('Permission updated');
      setIsEditing(false);
      onUpdate();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to update permission');
    }
  };

  const handleRemove = async () => {
    if (!confirm(`Remove ${collaborator.username} from this database?`)) return;

    try {
      await collaborationAPI.removeCollaborator(databaseId, collaborator.id);
      toast.success('Collaborator removed');
      onUpdate();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to remove collaborator');
    }
  };

  const canModify = isOwner && collaborator.permission_level !== 'owner';

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="relative">
            <div className="bg-gray-100 p-3 rounded-full">
              <FiUser className="w-6 h-6 text-gray-600" />
            </div>
            {isActive && (
              <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-gray-700 border-2 border-white rounded-full"></div>
            )}
          </div>

          <div>
            <div className="font-medium text-gray-900">{collaborator.username}</div>
            <div className="text-sm text-gray-500 flex items-center">
              <FiMail className="w-3 h-3 mr-1" />
              {collaborator.email}
            </div>
            <div className="text-xs text-gray-400 mt-1">
              Added {formatDistanceToNow(new Date(collaborator.granted_at), { addSuffix: true })} by{' '}
              {collaborator.granted_by_username}
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          {isEditing ? (
            <>
              <select
                value={newPermission}
                onChange={(e) => setNewPermission(e.target.value)}
                className="px-3 py-1 border border-gray-300 rounded-lg text-sm"
              >
                <option value="editor">Editor</option>
                <option value="viewer">Viewer</option>
              </select>
              <button
                onClick={handleUpdatePermission}
                className="p-2 text-gray-700 hover:bg-gray-100 rounded-lg"
              >
                <FiCheck className="w-4 h-4" />
              </button>
              <button
                onClick={() => setIsEditing(false)}
                className="p-2 text-gray-600 hover:bg-gray-50 rounded-lg"
              >
                <FiX className="w-4 h-4" />
              </button>
            </>
          ) : (
            <>
              <span className={`px-3 py-1 rounded-full text-xs font-medium ${getPermissionBadge(collaborator.permission_level)}`}>
                {collaborator.permission_level}
              </span>
              {canModify && (
                <>
                  <button
                    onClick={() => setIsEditing(true)}
                    className="p-2 text-gray-700 hover:bg-gray-100 rounded-lg"
                    title="Edit permission"
                  >
                    <FiEdit className="w-4 h-4" />
                  </button>
                  <button
                    onClick={handleRemove}
                    className="p-2 text-gray-700 hover:bg-gray-100 rounded-lg"
                    title="Remove collaborator"
                  >
                    <FiTrash2 className="w-4 h-4" />
                  </button>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

// Add Collaborator Modal
const AddCollaboratorModal: React.FC<any> = ({ databaseId, onClose, onSuccess }) => {
  const [email, setEmail] = useState('');
  const [permission, setPermission] = useState('viewer');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email) {
      toast.error('Email is required');
      return;
    }

    setIsLoading(true);
    try {
      await collaborationAPI.addCollaborator(databaseId, {
        userEmail: email,
        permissionLevel: permission,
      });
      toast.success('Collaborator added successfully');
      onSuccess();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to add collaborator');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">Add Collaborator</h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Email Address</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="block w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
              placeholder="collaborator@example.com"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Permission Level</label>
            <select
              value={permission}
              onChange={(e) => setPermission(e.target.value)}
              className="block w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
            >
              <option value="viewer">Viewer (Read-only)</option>
              <option value="editor">Editor (Read & Write)</option>
            </select>
            <p className="mt-1 text-xs text-gray-500">
              {permission === 'viewer'
                ? 'Can view data but cannot make changes'
                : 'Can view and modify data'}
            </p>
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
              disabled={isLoading}
              className="flex-1 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition disabled:opacity-50"
            >
              {isLoading ? 'Adding...' : 'Add Collaborator'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CollaboratorsPanel;
