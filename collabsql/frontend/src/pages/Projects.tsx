import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { databaseAPI } from '../lib/api';
import { Database, MoreVertical, Upload, ArrowLeft, Trash2 } from 'lucide-react';

interface Project {
  id: number;
  name: string;
  original_filename: string;
  created_at: string;
}

export default function Projects() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [openMenuId, setOpenMenuId] = useState<number | null>(null);
  const { user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!user) {
      navigate('/auth');
      return;
    }
    fetchProjects();

    const handleClickOutside = () => setOpenMenuId(null);
    window.addEventListener('click', handleClickOutside);
    return () => window.removeEventListener('click', handleClickOutside);
  }, [user, navigate]);

  const fetchProjects = async () => {
    try {
      const response = await databaseAPI.list();
      setProjects(response.databases || []);
    } catch (error) {
      console.error('Error fetching projects:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteProject = async (projectId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Are you sure you want to delete this project? This action cannot be undone.')) return;

    try {
      await databaseAPI.delete(projectId);
      await fetchProjects();
    } catch (error) {
      console.error('Error deleting project:', error);
      alert('Failed to delete project');
    }
  };

  const handleUploadDatabase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjectName.trim() || !selectedFile) return;

    setUploading(true);
    try {
      const response = await databaseAPI.upload(newProjectName, selectedFile);
      if (response.id) {
        await fetchProjects();
        setNewProjectName('');
        setSelectedFile(null);
        setShowUploadModal(false);
      }
    } catch (error) {
      console.error('Error uploading database:', error);
      alert('Failed to upload database. Please try again.');
    } finally {
      setUploading(false);
    }
  };



  const handleProjectClick = (projectId: number) => {
    console.log('Project clicked! ID:', projectId);
    console.log('Navigating to:', `/workspace/${projectId}`);
    navigate(`/workspace/${projectId}`);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0]);
      // Auto-fill project name from filename if empty
      if (!newProjectName) {
        const filename = e.target.files[0].name.replace(/\.(db|sqlite|sqlite3|csv)$/i, '');
        setNewProjectName(filename);
      }
    }
  };

  return (
    <div className="min-h-screen bg-black text-text-primary font-body">
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-orange/10 rounded-full mix-blend-normal filter blur-3xl animate-blob"></div>
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-orange-glow/15 rounded-full mix-blend-normal filter blur-3xl animate-blob-slow"></div>
      </div>

      <div className="relative">
        <header className="border-b border-black-border bg-black/50 backdrop-blur-sm sticky top-0 z-10">
          <div className="max-w-7xl mx-auto px-6 py-6">
            <div className="flex items-center gap-4">
              <button
                onClick={() => navigate('/')}
                className="text-text-secondary hover:text-orange transition-colors duration-300"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <img src="/logo.png" alt="CollabSQL" className="w-8 h-8 rounded-lg" />
              <h1 className="font-heading font-bold text-3xl text-orange">
                CollabSQL
              </h1>
            </div>
          </div>
        </header>

        <main className="max-w-7xl mx-auto px-6 py-12">
          <div className="flex items-center justify-between mb-12">
            <div>
              <h2 className="font-heading font-bold text-4xl text-white mb-2">
                Your <span className="text-orange">Projects</span>
              </h2>
              <p className="text-text-secondary">
                Manage your database projects and collaborate with your team
              </p>
            </div>
            <button
              onClick={() => setShowUploadModal(true)}
              className="flex items-center gap-2 px-6 py-3 bg-orange text-black font-semibold rounded-xl hover:bg-orange-hover hover:shadow-[0_0_30px_rgba(255,106,0,0.3)] transition-all duration-300 hover:scale-105"
            >
              <Upload className="w-5 h-5" />
              Upload Database
            </button>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="w-8 h-8 border-4 border-orange border-t-transparent rounded-full animate-spin"></div>
            </div>
          ) : projects.length === 0 ? (
            <div className="text-center py-20">
              <Database className="w-16 h-16 text-text-muted mx-auto mb-4 opacity-50" />
              <h3 className="font-heading font-semibold text-2xl text-text-primary mb-2">
                No projects yet
              </h3>
              <p className="text-text-secondary mb-8">
                Create your first project to get started with CollabSQL
              </p>
              <button
                onClick={() => setShowUploadModal(true)}
                className="px-6 py-3 bg-orange text-black font-semibold rounded-xl hover:bg-orange-hover transition-all duration-300"
              >
                Upload Your First Database
              </button>
            </div>
          ) : (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {projects.map((project) => (
                <div
                  key={project.id}
                  onClick={() => handleProjectClick(project.id)}
                  className="group bg-black-card border border-black-border rounded-2xl p-6 cursor-pointer transition-all duration-300 hover:border-orange/50 hover:shadow-[0_0_30px_rgba(255,106,0,0.1)] hover:scale-105"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="w-12 h-12 bg-orange/10 rounded-xl flex items-center justify-center transition-all duration-300 group-hover:bg-orange/20">
                      <Database className="w-6 h-6 text-orange" />
                    </div>
                    <div className="relative">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpenMenuId(openMenuId === project.id ? null : project.id);
                        }}
                        className="p-2 rounded-lg hover:bg-black-border transition-colors duration-300 opacity-0 group-hover:opacity-100"
                      >
                        <MoreVertical className="w-4 h-4 text-text-muted" />
                      </button>

                      {openMenuId === project.id && (
                        <div className="absolute right-0 mt-2 w-48 bg-black-card border border-black-border rounded-xl shadow-xl z-20 py-1 origin-top-right transition-all duration-300">
                          <button
                            onClick={(e) => handleDeleteProject(project.id, e)}
                            className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-red-500 hover:bg-red-500/10 transition-colors duration-300"
                          >
                            <Trash2 className="w-4 h-4" />
                            Delete Project
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  <h3 className="font-heading font-semibold text-xl text-text-primary mb-2 line-clamp-2">
                    {project.name}
                  </h3>
                  <div className="pt-4 border-t border-black-border flex items-center justify-between text-xs text-text-muted">
                    <span className="flex items-center gap-1">
                      <Database className="w-3 h-3" />
                      {project.original_filename}
                    </span>
                    <span>{formatDate(project.created_at)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </main>
      </div>

      {showUploadModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 px-6">
          <div className="bg-black-card border border-black-border rounded-2xl p-8 max-w-md w-full">
            <h3 className="font-heading font-bold text-2xl text-white mb-6">
              Upload <span className="text-orange">Database</span>
            </h3>

            <form onSubmit={handleUploadDatabase} className="space-y-6">
              <div>
                <label className="block text-text-secondary text-sm font-body mb-2">
                  Database File
                </label>
                <input
                  type="file"
                  accept=".db,.sqlite,.sqlite3,.csv"
                  onChange={handleFileChange}
                  className="w-full bg-black border border-black-border rounded-xl px-4 py-3 text-text-primary font-body placeholder-text-muted focus:outline-none focus:border-orange transition-colors duration-300 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-orange file:text-black hover:file:bg-orange-hover"
                  required
                />
                {selectedFile && (
                  <p className="mt-2 text-sm text-text-secondary">
                    Selected: {selectedFile.name}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-text-secondary text-sm font-body mb-2">
                  Project Name
                </label>
                <input
                  type="text"
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  className="w-full bg-black border border-black-border rounded-xl px-4 py-3 text-text-primary font-body placeholder-text-muted focus:outline-none focus:border-orange transition-colors duration-300"
                  placeholder="My Database Project"
                  required
                />
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowUploadModal(false)}
                  className="flex-1 px-4 py-3 bg-black-card border border-black-border text-text-secondary rounded-xl hover:border-black-border transition-colors duration-300 font-body font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={uploading || !selectedFile}
                  className="flex-1 px-4 py-3 bg-orange text-black rounded-xl hover:bg-orange-hover hover:shadow-[0_0_30px_rgba(255,106,0,0.3)] transition-all duration-300 font-body font-semibold disabled:opacity-50"
                >
                  {uploading ? 'Uploading...' : 'Upload'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
