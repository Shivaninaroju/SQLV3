import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { databaseAPI, queryAPI } from '../lib/api';
import {
  ArrowLeft, Send, Mic, ChevronDown, ChevronRight, Database,
  Users, Settings, History, User, Mail, Lock, LogOut, Trash2,
  Clock, Check, CheckCheck, BarChart3, FileDown, Plus, Download,
  Calendar, Filter, Copy, Code, GitCommit
} from 'lucide-react';

interface DatabaseInfo {
  id: number;
  name: string;
  original_filename: string;
  schema: {
    tables: Array<{
      name: string;
      columns: Array<{
        name: string;
        type: string;
        notNull: boolean;
        primaryKey: boolean;
      }>;
      rowCount: number;
    }>;
  };
}

interface Message {
  id: string;
  type: 'user' | 'assistant' | 'error';
  content: string;
  sql?: string;
  result?: Record<string, unknown>[];
  changes?: number;
  timestamp: Date;
  read?: boolean;
}

interface ChatSession {
  id: string;
  name: string;
  messages: Message[];
  createdAt: Date;
}

interface CommitStats {
  insertions: number;
  updates: number;
  deletions: number;
  alterations: number;
  creates: number;
  drops: number;
}

interface CommitEntry {
  id: string;
  operation: 'INSERT' | 'UPDATE' | 'DELETE' | 'ALTER' | 'CREATE' | 'DROP';
  table: string;
  rowsAffected: number;
  user: string;
  timestamp: Date;
  sql: string;
  message: string;
}

export default function Workspace() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  // UI State
  const sidebarOpen = true; // Always open in ChatGPT style
  const [activeTab, setActiveTab] = useState<'chat' | 'schema' | 'analytics' | 'collaborators' | 'commits' | 'download' | 'settings'>('chat');
  const [expandedTables, setExpandedTables] = useState<Set<string>>(new Set());
  const [showSqlMap, setShowSqlMap] = useState<Map<string, boolean>>(new Map());
  const [isRecording, setIsRecording] = useState(false);

  // Data State
  const [database, setDatabase] = useState<DatabaseInfo | null>(null);
  const [chatSessions, setChatSessions] = useState<ChatSession[]>([]);
  const [activeChatId, setActiveChatId] = useState<string>('default');
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [selectedTable, setSelectedTable] = useState<string | undefined>();
  const [commits, setCommits] = useState<CommitEntry[]>([]);
  const [commitStats, setCommitStats] = useState<CommitStats>({
    insertions: 0,
    updates: 0,
    deletions: 0,
    alterations: 0,
    creates: 0,
    drops: 0
  });

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    console.log('Workspace mounted. ProjectId:', projectId, 'User:', user);
    if (!user || !projectId) {
      console.log('No user or projectId, redirecting to projects');
      navigate('/projects');
      return;
    }
    fetchDatabase();

    // Initialize default chat session
    const defaultSession: ChatSession = {
      id: 'default',
      name: 'New Chat',
      messages: [],
      createdAt: new Date(),
    };
    setChatSessions([defaultSession]);

    // Initialize sample commits
    const sampleCommits: CommitEntry[] = [
      {
        id: '1',
        operation: 'CREATE',
        table: 'Database',
        rowsAffected: 0,
        user: user?.username || 'User',
        timestamp: new Date(),
        sql: 'CREATE DATABASE',
        message: 'Initial database setup'
      }
    ];
    setCommits(sampleCommits);
  }, [user, projectId, navigate]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const fetchDatabase = async () => {
    try {
      console.log('Fetching database details for ID:', projectId);
      const response = await databaseAPI.getDetails(Number(projectId));
      console.log('Database details received:', response);
      setDatabase(response.database);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching database:', error);
      alert('Failed to load database. Redirecting to projects...');
      navigate('/projects');
    }
  };

  const addCommit = (operation: CommitEntry['operation'], table: string, rowsAffected: number, sql: string) => {
    const message = `${operation.toLowerCase()} ${rowsAffected} row${rowsAffected !== 1 ? 's' : ''} in ${table}`;
    const newCommit: CommitEntry = {
      id: Date.now().toString(),
      operation,
      table,
      rowsAffected,
      user: user?.username || 'User',
      timestamp: new Date(),
      sql,
      message
    };
    setCommits(prev => [newCommit, ...prev]);

    // Update stats
    setCommitStats(prev => ({
      ...prev,
      insertions: operation === 'INSERT' ? prev.insertions + rowsAffected : prev.insertions,
      updates: operation === 'UPDATE' ? prev.updates + rowsAffected : prev.updates,
      deletions: operation === 'DELETE' ? prev.deletions + rowsAffected : prev.deletions,
      alterations: operation === 'ALTER' ? prev.alterations + 1 : prev.alterations,
      creates: operation === 'CREATE' ? prev.creates + 1 : prev.creates,
      drops: operation === 'DROP' ? prev.drops + 1 : prev.drops,
    }));
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || sending || !projectId) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      type: 'user',
      content: input,
      timestamp: new Date(),
      read: true,
    };

    setMessages([...messages, userMessage]);
    const currentInput = input;
    setInput('');
    setSending(true);

    try {
      console.log('Sending query:', currentInput);

      const conversationHistory = messages.slice(-5).map(msg => ({
        role: msg.type === 'user' ? 'user' : 'assistant',
        content: msg.content,
        sql: msg.sql,
      }));

      const response = await queryAPI.convertNL(
        Number(projectId),
        currentInput,
        conversationHistory,
        selectedTable
      );

      console.log('Query response:', response);
      console.log('Response type:', response.type);

      if (response.type === 'error' || response.error) {
        console.log('Handling error response');
        const errorMessage: Message = {
          id: (Date.now() + 1).toString(),
          type: 'error',
          content: response.error || response.message || 'An error occurred while processing your query.',
          timestamp: new Date(),
          read: false,
        };
        setMessages((prev) => [...prev, errorMessage]);
        setTimeout(() => markAsRead(errorMessage.id), 1000);
      } else if (response.type === 'sql') {
        console.log('Handling SQL response');
        const assistantMessage: Message = {
          id: (Date.now() + 1).toString(),
          type: 'assistant',
          content: response.explanation || 'Here are the results:',
          sql: response.query,
          result: response.result,
          changes: response.changes,
          timestamp: new Date(),
          read: false,
        };
        setMessages((prev) => [...prev, assistantMessage]);
        setTimeout(() => markAsRead(assistantMessage.id), 1000);

        // Track commit
        if (response.query && response.changes && response.changes > 0) {
          const sqlUpper = response.query.toUpperCase();
          let operation: CommitEntry['operation'] = 'INSERT';
          if (sqlUpper.includes('UPDATE')) operation = 'UPDATE';
          else if (sqlUpper.includes('DELETE')) operation = 'DELETE';
          else if (sqlUpper.includes('ALTER')) operation = 'ALTER';
          else if (sqlUpper.includes('CREATE')) operation = 'CREATE';
          else if (sqlUpper.includes('DROP')) operation = 'DROP';

          const tableMatch = response.query.match(/(?:FROM|INTO|TABLE|UPDATE)\s+([a-zA-Z_][a-zA-Z0-9_]*)/i);
          const tableName = tableMatch ? tableMatch[1] : 'Unknown';

          addCommit(operation, tableName, response.changes, response.query);
        }
      } else if (response.type === 'text' || response.type === 'info' || response.type === 'clarification') {
        console.log('Handling text/info/clarification response');
        const assistantMessage: Message = {
          id: (Date.now() + 1).toString(),
          type: 'assistant',
          content: response.message || response.explanation || 'I understand your question.',
          timestamp: new Date(),
          read: false,
        };
        setMessages((prev) => [...prev, assistantMessage]);
        setTimeout(() => markAsRead(assistantMessage.id), 1000);
      } else {
        console.log('Handling unknown response type, full response:', JSON.stringify(response));
        const assistantMessage: Message = {
          id: (Date.now() + 1).toString(),
          type: 'assistant',
          content: response.message || response.explanation || JSON.stringify(response),
          timestamp: new Date(),
          read: false,
        };
        setMessages((prev) => [...prev, assistantMessage]);
        setTimeout(() => markAsRead(assistantMessage.id), 1000);
      }
    } catch (error) {
      console.error('Error sending message:', error);
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        type: 'error',
        content: error instanceof Error ? error.message : 'Failed to process your query. Please try again.',
        timestamp: new Date(),
        read: false,
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setSending(false);
    }
  };

  const markAsRead = (messageId: string) => {
    setMessages(prev => prev.map(msg =>
      msg.id === messageId ? { ...msg, read: true } : msg
    ));
  };

  const handleNewChat = () => {
    const newSession: ChatSession = {
      id: Date.now().toString(),
      name: `Chat ${chatSessions.length + 1}`,
      messages: [],
      createdAt: new Date(),
    };
    setChatSessions([...chatSessions, newSession]);
    setActiveChatId(newSession.id);
    setMessages([]);
  };

  const toggleTableExpand = (tableName: string) => {
    const newExpanded = new Set(expandedTables);
    if (newExpanded.has(tableName)) {
      newExpanded.delete(tableName);
    } else {
      newExpanded.add(tableName);
    }
    setExpandedTables(newExpanded);
  };

  const toggleSqlVisibility = (messageId: string) => {
    setShowSqlMap(prev => {
      const newMap = new Map(prev);
      newMap.set(messageId, !newMap.get(messageId));
      return newMap;
    });
  };

  const handleVoiceInput = async () => {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      alert('Speech recognition is not supported in your browser. Please use Chrome or Edge.');
      return;
    }

    const SpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
    const recognition = new SpeechRecognition();

    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-US';

    recognition.onstart = () => {
      setIsRecording(true);
    };

    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setInput(transcript);
      setIsRecording(false);
    };

    recognition.onerror = () => {
      setIsRecording(false);
      alert('Speech recognition error. Please try again.');
    };

    recognition.onend = () => {
      setIsRecording(false);
    };

    recognition.start();
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    });
  };

  const generateAnalyticsPDF = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const totalTables = database?.schema?.tables?.length || 0;
    const totalRows = database?.schema?.tables?.reduce((sum, t) => sum + t.rowCount, 0) || 0;

    printWindow.document.write(`
      <html>
        <head>
          <title>Database Analytics - ${database?.name}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 40px; }
            h1 { color: #FF6A00; }
            .stat { margin: 20px 0; padding: 15px; border: 1px solid #ddd; }
            table { width: 100%; border-collapse: collapse; margin: 20px 0; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
            th { background-color: #FF6A00; color: white; }
          </style>
        </head>
        <body>
          <h1>Database Analytics Report</h1>
          <p><strong>Database:</strong> ${database?.name}</p>
          <p><strong>Generated:</strong> ${new Date().toLocaleString()}</p>
          
          <div class="stat">
            <h3>Summary Statistics</h3>
            <p>Total Tables: ${totalTables}</p>
            <p>Total Rows: ${totalRows}</p>
            <p>Total Insertions: ${commitStats.insertions}</p>
            <p>Total Updates: ${commitStats.updates}</p>
            <p>Total Deletions: ${commitStats.deletions}</p>
          </div>
          
          <h3>Table Details</h3>
          <table>
            <thead>
              <tr>
                <th>Table Name</th>
                <th>Columns</th>
                <th>Rows</th>
              </tr>
            </thead>
            <tbody>
              ${database?.schema?.tables?.map(t => `
                <tr>
                  <td>${t.name}</td>
                  <td>${t.columns.length}</td>
                  <td>${t.rowCount}</td>
                </tr>
              `).join('') || ''}
            </tbody>
          </table>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.print();
  };

  const suggestedQueries = database?.schema?.tables && database.schema.tables.length > 0 ? [
    `Show me all data from ${database.schema.tables[0].name}`,
    `How many rows are in ${database.schema.tables[0].name}?`,
    `What are the column names in ${database.schema.tables[0].name}?`,
  ] : [];

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-orange border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-text-secondary">Loading database...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black flex overflow-hidden">
      {/* Sidebar - Fixed, ChatGPT Style */}
      <aside
        className={`bg-black-light border-r border-black-border transition-all duration-300 flex flex-col ${sidebarOpen ? 'w-64' : 'w-0'
          } overflow-hidden flex-shrink-0 fixed left-0 top-0 bottom-0 z-40`}
      >
        <div className="flex flex-col h-full w-64">
          {/* Header with Back Button and Logo - Side by Side */}
          <div className="p-4 border-b border-black-border">
            <div className="flex items-center gap-3 mb-4">
              <button
                onClick={() => navigate('/projects')}
                className="text-text-secondary hover:text-orange transition-colors duration-300"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <img src="/logo.png" alt="CollabSQL" className="w-8 h-8 rounded-lg" />
              <h2 className="font-heading font-bold text-lg text-text-primary">CollabSQL</h2>
            </div>

            {/* New Chat Button */}
            <button
              onClick={handleNewChat}
              className="w-full px-4 py-2.5 bg-transparent border border-black-border text-text-primary rounded-lg hover:bg-black-card transition-all duration-300 font-body text-sm flex items-center gap-2"
            >
              <Plus className="w-4 h-4 text-orange" />
              New Chat
            </button>
          </div>

          {/* Navigation Tabs */}
          <div className="flex-1 overflow-y-auto p-3">
            <div className="space-y-1">
              <button
                onClick={() => setActiveTab('chat')}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-300 text-sm ${activeTab === 'chat'
                  ? 'bg-black-card text-text-primary'
                  : 'text-text-secondary hover:bg-black-card'
                  }`}
              >
                <Database className="w-4 h-4 text-orange" />
                <span className="font-body">DBCopilot</span>
              </button>

              <button
                onClick={() => setActiveTab('schema')}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-300 text-sm ${activeTab === 'schema'
                  ? 'bg-black-card text-text-primary'
                  : 'text-text-secondary hover:bg-black-card'
                  }`}
              >
                <Database className="w-4 h-4 text-orange" />
                <span className="font-body">Schema Overview</span>
              </button>

              <button
                onClick={() => setActiveTab('analytics')}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-300 text-sm ${activeTab === 'analytics'
                  ? 'bg-black-card text-text-primary'
                  : 'text-text-secondary hover:bg-black-card'
                  }`}
              >
                <BarChart3 className="w-4 h-4 text-orange" />
                <span className="font-body">Analytics</span>
              </button>

              <button
                onClick={() => setActiveTab('collaborators')}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-300 text-sm ${activeTab === 'collaborators'
                  ? 'bg-black-card text-text-primary'
                  : 'text-text-secondary hover:bg-black-card'
                  }`}
              >
                <Users className="w-4 h-4 text-orange" />
                <span className="font-body">Collaborators</span>
              </button>

              <button
                onClick={() => setActiveTab('commits')}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-300 text-sm ${activeTab === 'commits'
                  ? 'bg-black-card text-text-primary'
                  : 'text-text-secondary hover:bg-black-card'
                  }`}
              >
                <History className="w-4 h-4 text-orange" />
                <span className="font-body">Commit History</span>
              </button>

              <button
                onClick={() => setActiveTab('download')}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-300 text-sm ${activeTab === 'download'
                  ? 'bg-black-card text-text-primary'
                  : 'text-text-secondary hover:bg-black-card'
                  }`}
              >
                <Download className="w-4 h-4 text-orange" />
                <span className="font-body">Download Updated DB</span>
              </button>

              <button
                onClick={() => setActiveTab('settings')}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-300 text-sm ${activeTab === 'settings'
                  ? 'bg-black-card text-text-primary'
                  : 'text-text-secondary hover:bg-black-card'
                  }`}
              >
                <Settings className="w-4 h-4 text-orange" />
                <span className="font-body">Settings</span>
              </button>
            </div>

            {/* Chat Sessions (only shown when chat tab is active) */}
            {activeTab === 'chat' && chatSessions.length > 1 && (
              <div className="mt-4 pt-4 border-t border-black-border">
                <p className="text-text-muted text-xs uppercase tracking-wider mb-2 px-3">Recent Chats</p>
                <div className="space-y-1">
                  {chatSessions.map((session) => (
                    <button
                      key={session.id}
                      onClick={() => {
                        setActiveChatId(session.id);
                        setMessages(session.messages);
                      }}
                      className={`w-full text-left px-3 py-2 rounded-lg transition-all duration-300 text-sm ${activeChatId === session.id
                        ? 'bg-black-card text-text-primary'
                        : 'text-text-secondary hover:bg-black-card'
                        }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-body truncate">{session.name}</span>
                        {session.messages.length > 0 && (
                          <span className="text-xs text-text-muted ml-2">{session.messages.length}</span>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* User Email at Bottom */}
          <div className="p-3 border-t border-black-border">
            <div className="flex items-center gap-2 px-2 py-2 rounded-lg bg-black-card">
              <div className="w-7 h-7 rounded-full bg-orange flex items-center justify-center flex-shrink-0">
                <span className="text-black font-bold text-xs">{user?.username?.charAt(0).toUpperCase()}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-text-primary text-xs font-semibold truncate">{user?.username}</p>
                <p className="text-text-muted text-xs truncate">{user?.email}</p>
              </div>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className={`flex-1 flex flex-col overflow-hidden transition-all duration-300 ${sidebarOpen ? 'ml-64' : 'ml-0'}`}>
        {/* Chat Tab */}
        {activeTab === 'chat' && (
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Messages Container - Scrollable */}
            <div
              ref={messagesContainerRef}
              className="flex-1 overflow-y-auto px-4 py-6"
            >
              <div className="max-w-3xl mx-auto space-y-6">
                {messages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full py-12">
                    <div className="text-center mb-8">
                      <div className="flex items-center justify-center gap-3 mb-4">
                        <img src="/logo.png" alt="DBCopilot" className="w-12 h-12 rounded-lg" />
                        <h2 className="font-heading font-bold text-3xl text-text-primary">DBCopilot</h2>
                      </div>
                      <p className="text-text-secondary max-w-2xl text-lg">
                        An AI-Powered DBCopilot that transforms Natural Language into precise, executable SQL queries instantly
                      </p>
                    </div>

                    {suggestedQueries.length > 0 && (
                      <div className="w-full max-w-2xl">
                        <p className="text-text-muted text-sm mb-3 font-semibold">Suggested Queries:</p>
                        <div className="grid gap-3">
                          {suggestedQueries.map((query, idx) => (
                            <button
                              key={idx}
                              onClick={() => setInput(query)}
                              className="text-left px-4 py-3 bg-black-card border border-black-border rounded-lg hover:border-orange/30 hover:bg-black-light transition-all duration-300"
                            >
                              <p className="text-text-primary text-sm">{query}</p>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <>
                    {messages.map((message) => (
                      <div
                        key={message.id}
                        className={`flex gap-4 items-start ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}
                      >
                        {message.type !== 'user' && (
                          <div className="flex-shrink-0">
                            <img src="/logo.png" alt="DBCopilot" className="w-8 h-8 rounded-lg" />
                          </div>
                        )}

                        <div className={`flex-1 max-w-2xl ${message.type === 'user' ? 'flex justify-end' : ''}`}>
                          <div
                            className={`${message.type === 'user'
                              ? 'bg-orange text-black rounded-2xl rounded-br-md'
                              : message.type === 'error'
                                ? 'bg-red-500/10 border border-red-500/30 text-red-500 rounded-2xl rounded-bl-md'
                                : 'bg-black-card border border-black-border text-text-primary rounded-2xl rounded-bl-md'
                              } px-4 py-3 font-body inline-block max-w-full`}
                          >
                            <div className="max-h-96 overflow-y-auto pr-2">
                              <p className="whitespace-pre-wrap">{message.content}</p>
                            </div>

                            {message.sql && (
                              <div className="mt-3">
                                <button
                                  onClick={() => toggleSqlVisibility(message.id)}
                                  className="flex items-center gap-2 text-xs text-orange hover:text-orange-hover transition-colors"
                                >
                                  {showSqlMap.get(message.id) ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                                  Show SQL
                                </button>

                                {showSqlMap.get(message.id) && (
                                  <div className="bg-black rounded-lg p-3 mt-2 overflow-x-auto">
                                    <code className="text-accent text-xs font-mono">
                                      {message.sql}
                                    </code>
                                  </div>
                                )}
                              </div>
                            )}

                            {message.changes !== undefined && message.changes > 0 && (
                              <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-2 mt-3">
                                <p className="text-green-500 text-xs">
                                  ✓ {message.changes} row(s) affected
                                </p>
                              </div>
                            )}

                            {message.result && message.result.length > 0 && (
                              <div className="bg-black rounded-lg overflow-hidden mt-3 max-h-96">
                                <div className="overflow-auto max-w-full max-h-96">
                                  <table className="w-full text-xs">
                                    <thead className="sticky top-0 bg-black">
                                      <tr className="border-b border-black-border">
                                        {Object.keys(message.result[0] || {}).map((key) => (
                                          <th
                                            key={key}
                                            className="px-3 py-2 text-left text-orange font-semibold whitespace-nowrap"
                                          >
                                            {key}
                                          </th>
                                        ))}
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {message.result.map((row, idx) => (
                                        <tr key={idx} className="border-b border-black-border/50 hover:bg-black-card">
                                          {Object.values(row).map((val, idx) => (
                                            <td key={idx} className="px-3 py-2 text-text-secondary whitespace-nowrap">
                                              {String(val)}
                                            </td>
                                          ))}
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            )}

                            <div className="flex items-center gap-2 mt-2 text-xs">
                              <span className="text-black opacity-60">{formatTime(message.timestamp)}</span>
                              {message.type === 'user' && (
                                message.read ? <CheckCheck className="w-3 h-3 text-orange" /> : <Check className="w-3 h-3 text-black opacity-60" />
                              )}
                            </div>
                          </div>
                        </div>

                        {message.type === 'user' && (
                          <div className="flex-shrink-0">
                            <div className="w-8 h-8 rounded-full bg-orange flex items-center justify-center">
                              <User className="w-5 h-5 text-black" />
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                    <div ref={messagesEndRef} />
                  </>
                )}
              </div>
            </div>

            {/* Input Area - Fixed at Bottom */}
            <div className="border-t border-black-border bg-black px-4 py-4 flex-shrink-0">
              <form onSubmit={handleSendMessage} className="max-w-3xl mx-auto">
                {selectedTable && (
                  <div className="mb-2 flex items-center gap-2">
                    <span className="text-text-muted text-xs">Focused on table:</span>
                    <span className="bg-orange/10 border border-orange/30 text-orange px-2 py-1 rounded text-xs font-semibold">
                      {selectedTable}
                    </span>
                    <button
                      type="button"
                      onClick={() => setSelectedTable(undefined)}
                      className="text-text-muted hover:text-orange text-xs"
                    >
                      ✕
                    </button>
                  </div>
                )}
                <div className="flex gap-2 items-end bg-black-card border border-black-border rounded-3xl p-2">
                  <textarea
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSendMessage(e);
                      }
                    }}
                    placeholder="Message DBCopilot..."
                    rows={1}
                    className="flex-1 bg-transparent border-none outline-none text-text-primary font-body placeholder-text-muted resize-none px-3 py-2"
                    style={{ maxHeight: '200px' }}
                  />
                  <button
                    type="button"
                    onClick={handleVoiceInput}
                    disabled={isRecording}
                    className={`p-2 rounded-lg transition-all duration-300 ${isRecording
                      ? 'bg-red-500 text-white animate-pulse'
                      : 'text-text-secondary hover:text-orange hover:bg-black-light'
                      }`}
                  >
                    <Mic className="w-5 h-5" />
                  </button>
                  <button
                    type="submit"
                    disabled={sending || !input.trim()}
                    className="p-2 bg-orange text-black rounded-lg hover:bg-orange-hover transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {sending ? (
                      <div className="w-5 h-5 border-2 border-black border-t-transparent rounded-full animate-spin"></div>
                    ) : (
                      <Send className="w-5 h-5" />
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Schema Overview Tab */}
        {activeTab === 'schema' && (
          <div className="flex-1 overflow-y-auto p-6">
            <div className="max-w-4xl mx-auto">
              <h3 className="font-heading font-bold text-2xl text-text-primary mb-6">
                Schema <span className="text-orange">Overview</span>
              </h3>

              {database?.schema?.tables && database.schema.tables.length > 0 ? (
                <div className="space-y-4">
                  {database.schema.tables.map((table) => (
                    <div key={table.name} className="bg-black-card border border-black-border rounded-xl overflow-hidden">
                      <button
                        onClick={() => toggleTableExpand(table.name)}
                        className="w-full flex items-center justify-between p-4 hover:bg-black-light transition-colors duration-300"
                      >
                        <div className="flex items-center gap-3">
                          {expandedTables.has(table.name) ? (
                            <ChevronDown className="w-5 h-5 text-orange" />
                          ) : (
                            <ChevronRight className="w-5 h-5 text-text-muted" />
                          )}
                          <Database className="w-5 h-5 text-orange" />
                          <span className="font-heading font-semibold text-text-primary">{table.name}</span>
                        </div>
                        <div className="flex items-center gap-4">
                          <span className="text-text-muted text-sm">{table.columns.length} columns</span>
                          <span className="text-text-muted text-sm">{table.rowCount} rows</span>
                        </div>
                      </button>

                      {expandedTables.has(table.name) && (
                        <div className="border-t border-black-border p-4">
                          <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="border-b border-black-border">
                                  <th className="px-4 py-2 text-left text-orange font-semibold">Column</th>
                                  <th className="px-4 py-2 text-left text-orange font-semibold">Type</th>
                                  <th className="px-4 py-2 text-left text-orange font-semibold">Constraints</th>
                                </tr>
                              </thead>
                              <tbody>
                                {table.columns.map((column, idx) => (
                                  <tr key={idx} className="border-b border-black-border/50">
                                    <td className="px-4 py-2 text-text-primary font-mono">{column.name}</td>
                                    <td className="px-4 py-2 text-text-secondary">{column.type}</td>
                                    <td className="px-4 py-2 text-text-muted text-xs">
                                      {column.primaryKey && <span className="bg-orange/10 text-orange px-2 py-1 rounded mr-1">PK</span>}
                                      {column.notNull && <span className="bg-blue-500/10 text-blue-500 px-2 py-1 rounded">NOT NULL</span>}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                          <button
                            onClick={() => {
                              setSelectedTable(table.name);
                              setActiveTab('chat');
                            }}
                            className="mt-4 px-4 py-2 bg-orange/10 border border-orange/30 text-orange rounded-lg hover:bg-orange/20 transition-all duration-300 text-sm font-semibold"
                          >
                            Focus queries on this table
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12">
                  <Database className="w-16 h-16 text-text-muted mx-auto mb-4 opacity-50" />
                  <p className="text-text-secondary">No schema information available</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Analytics Tab */}
        {activeTab === 'analytics' && (
          <div className="flex-1 overflow-y-auto p-6">
            <div className="max-w-4xl mx-auto">
              <div className="flex items-center justify-between mb-6">
                <h3 className="font-heading font-bold text-2xl text-text-primary">
                  <span className="text-orange">Analytics</span>
                </h3>
                <button
                  onClick={generateAnalyticsPDF}
                  className="flex items-center gap-2 px-4 py-2 bg-orange text-black rounded-lg hover:bg-orange-hover transition-all duration-300 font-semibold text-sm"
                >
                  <FileDown className="w-4 h-4" />
                  Generate PDF
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                <div className="bg-black-card border border-black-border rounded-xl p-6">
                  <div className="flex items-center gap-3 mb-2">
                    <Database className="w-5 h-5 text-orange" />
                    <h4 className="font-heading font-semibold text-text-primary">Total Tables</h4>
                  </div>
                  <p className="text-4xl font-bold text-orange">{database?.schema?.tables?.length || 0}</p>
                </div>

                <div className="bg-black-card border border-black-border rounded-xl p-6">
                  <div className="flex items-center gap-3 mb-2">
                    <BarChart3 className="w-5 h-5 text-orange" />
                    <h4 className="font-heading font-semibold text-text-primary">Total Rows</h4>
                  </div>
                  <p className="text-4xl font-bold text-orange">
                    {database?.schema?.tables?.reduce((sum, t) => sum + t.rowCount, 0) || 0}
                  </p>
                </div>
              </div>

              <div className="bg-black-card border border-black-border rounded-xl p-6">
                <h4 className="font-heading font-semibold text-lg text-text-primary mb-4">Table Statistics</h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-black-border">
                        <th className="px-4 py-2 text-left text-orange font-semibold">Table</th>
                        <th className="px-4 py-2 text-left text-orange font-semibold">Columns</th>
                        <th className="px-4 py-2 text-left text-orange font-semibold">Rows</th>
                      </tr>
                    </thead>
                    <tbody>
                      {database?.schema?.tables?.map((table, idx) => (
                        <tr key={idx} className="border-b border-black-border/50 hover:bg-black-light">
                          <td className="px-4 py-2 text-text-primary font-mono">{table.name}</td>
                          <td className="px-4 py-2 text-text-secondary">{table.columns.length}</td>
                          <td className="px-4 py-2 text-text-secondary">{table.rowCount}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Collaborators Tab */}
        {activeTab === 'collaborators' && (
          <div className="flex-1 overflow-y-auto p-6">
            <div className="max-w-4xl mx-auto">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="font-heading font-bold text-2xl text-text-primary">
                    <span className="text-orange">Collaborators</span>
                  </h3>
                  <p className="text-text-muted text-sm mt-1">Manage who has access to this database</p>
                </div>
                <button className="px-4 py-2 bg-orange text-black rounded-lg hover:bg-orange-hover transition-all duration-300 font-semibold text-sm">
                  Add Collaborator
                </button>
              </div>

              <div className="bg-black-card border border-black-border rounded-xl overflow-hidden">
                <div className="p-4 border-b border-black-border">
                  <p className="text-text-secondary text-sm">
                    <span className="font-semibold text-text-primary">1</span> collaborator
                  </p>
                </div>

                <div className="divide-y divide-black-border">
                  <div className="p-4 flex items-center justify-between hover:bg-black-light transition-colors">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-full bg-orange flex items-center justify-center">
                        <span className="text-black font-bold text-lg">{user?.username?.charAt(0).toUpperCase()}</span>
                      </div>
                      <div>
                        <p className="text-text-primary font-semibold">{user?.username}</p>
                        <p className="text-text-muted text-sm">{user?.email}</p>
                      </div>
                    </div>
                    <span className="bg-orange/10 text-orange px-3 py-1 rounded-lg text-sm font-semibold">Owner</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Commit History Tab - GitHub Style */}
        {activeTab === 'commits' && (
          <div className="flex-1 overflow-y-auto p-6">
            <div className="max-w-4xl mx-auto">
              <h3 className="font-heading font-bold text-2xl text-text-primary mb-6">
                Commit <span className="text-orange">History</span>
              </h3>

              {/* Commit Stats - GitHub Style */}
              <div className="bg-black-card border border-black-border rounded-xl p-6 mb-6">
                <h4 className="font-heading font-semibold text-lg text-text-primary mb-4">Operations Summary</h4>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-3 h-3 rounded-full bg-green-500"></div>
                    <div>
                      <p className="text-text-muted text-xs">Insertions</p>
                      <p className="text-text-primary font-bold text-lg">{commitStats.insertions.toLocaleString()}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-3 h-3 rounded-full bg-blue-500"></div>
                    <div>
                      <p className="text-text-muted text-xs">Updates</p>
                      <p className="text-text-primary font-bold text-lg">{commitStats.updates.toLocaleString()}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-3 h-3 rounded-full bg-red-500"></div>
                    <div>
                      <p className="text-text-muted text-xs">Deletions</p>
                      <p className="text-text-primary font-bold text-lg">{commitStats.deletions.toLocaleString()}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                    <div>
                      <p className="text-text-muted text-xs">Alterations</p>
                      <p className="text-text-primary font-bold text-lg">{commitStats.alterations}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-3 h-3 rounded-full bg-orange"></div>
                    <div>
                      <p className="text-text-muted text-xs">Creates</p>
                      <p className="text-text-primary font-bold text-lg">{commitStats.creates}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-3 h-3 rounded-full bg-purple-500"></div>
                    <div>
                      <p className="text-text-muted text-xs">Drops</p>
                      <p className="text-text-primary font-bold text-lg">{commitStats.drops}</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Commit Header Toolbar - GitHub Style */}
              <div className="flex flex-wrap items-center justify-end gap-4 mb-6">
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-2 px-3 py-1.5 bg-black-light border border-black-border rounded-lg cursor-pointer hover:bg-black-card transition-colors">
                    <Users className="w-4 h-4 text-text-muted" />
                    <span className="text-sm font-body text-text-primary">All users</span>
                    <ChevronDown className="w-3.5 h-3.5 text-text-muted" />
                  </div>
                  <div className="flex items-center gap-2 px-3 py-1.5 bg-black-light border border-black-border rounded-lg cursor-pointer hover:bg-black-card transition-colors">
                    <Calendar className="w-4 h-4 text-text-muted" />
                    <span className="text-sm font-body text-text-primary">All time</span>
                    <ChevronDown className="w-3.5 h-3.5 text-text-muted" />
                  </div>
                </div>
              </div>

              {/* Commit List - GitHub Style */}
              <div className="space-y-8 relative before:absolute before:inset-0 before:ml-[11px] before:-translate-x-1/2 before:w-[2px] before:bg-black-border before:h-full">
                {Object.entries(
                  commits.reduce((groups, commit) => {
                    const date = commit.timestamp.toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric'
                    });
                    if (!groups[date]) groups[date] = [];
                    groups[date].push(commit);
                    return groups;
                  }, {} as Record<string, CommitEntry[]>)
                ).map(([date, dateCommits]) => (
                  <div key={date} className="relative z-10">
                    {/* Date Header */}
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-[22px] h-[22px] rounded-full bg-black-light border-2 border-black-border flex items-center justify-center shrink-0">
                        <GitCommit className="w-3 h-3 text-text-muted" />
                      </div>
                      <p className="text-text-secondary text-sm font-semibold">Commits on {date}</p>
                    </div>

                    {/* Commit Items for this date */}
                    <div className="ml-[11px] border border-black-border rounded-xl overflow-hidden bg-black-card shadow-lg">
                      <div className="divide-y divide-black-border">
                        {dateCommits.map((commit) => (
                          <div key={commit.id} className="p-4 hover:bg-black-light transition-all duration-200 group">
                            <div className="flex items-start justify-between gap-4">
                              <div className="flex-1 min-w-0">
                                <p className="text-text-primary font-bold text-[15px] mb-1.5 group-hover:text-orange transition-colors cursor-pointer">
                                  {commit.message}
                                </p>
                                <div className="flex items-center gap-2 text-xs text-text-muted">
                                  <div className="w-5 h-5 rounded-full bg-orange flex items-center justify-center overflow-hidden">
                                    <span className="text-black font-bold text-[10px]">{commit.user.charAt(0).toUpperCase()}</span>
                                  </div>
                                  <span className="font-semibold text-text-secondary hover:text-orange cursor-pointer transition-colors">{commit.user}</span>
                                  <span>committed {
                                    Math.floor((new Date().getTime() - commit.timestamp.getTime()) / (1000 * 60 * 60 * 24)) === 0
                                      ? 'today'
                                      : Math.floor((new Date().getTime() - commit.timestamp.getTime()) / (1000 * 60 * 60 * 24)) === 1
                                        ? 'yesterday'
                                        : `${Math.floor((new Date().getTime() - commit.timestamp.getTime()) / (1000 * 60 * 60 * 24))} days ago`
                                  }</span>
                                </div>
                                {commit.sql && (
                                  <div className="mt-3 bg-black/40 rounded-lg p-2.5 border border-black-border group-hover:border-orange/20 transition-all">
                                    <code className="text-orange/70 text-[11px] font-mono break-all line-clamp-1">{commit.sql}</code>
                                  </div>
                                )}
                              </div>

                              <div className="flex items-center gap-0.5 border border-black-border rounded-lg overflow-hidden shrink-0 h-fit bg-black/20">
                                <button className="px-2.5 py-1.5 text-[12px] font-mono text-text-muted border-r border-black-border hover:bg-black transition-colors">
                                  {commit.id.substring(0, 7)}
                                </button>
                                <button className="p-1.5 text-text-muted hover:text-orange hover:bg-black transition-colors border-r border-black-border">
                                  <Copy className="w-3.5 h-3.5" />
                                </button>
                                <button className="p-1.5 text-text-muted hover:text-orange hover:bg-black transition-colors">
                                  <Code className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Download Updated DB Tab */}
        {activeTab === 'download' && (
          <div className="flex-1 overflow-y-auto p-6">
            <div className="max-w-4xl mx-auto">
              <h3 className="font-heading font-bold text-2xl text-text-primary mb-6">
                Download <span className="text-orange">Updated Database</span>
              </h3>

              {/* Modifications Report */}
              <div className="bg-black-card border border-black-border rounded-xl p-6 mb-6">
                <h4 className="font-heading font-semibold text-lg text-text-primary mb-4 flex items-center gap-2">
                  <History className="w-5 h-5 text-orange" />
                  Modifications Report
                </h4>

                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
                  <div className="bg-black-light border border-black-border rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-3 h-3 rounded-full bg-green-500"></div>
                      <p className="text-text-muted text-xs">Insertions</p>
                    </div>
                    <p className="text-2xl font-bold text-green-500">{commitStats.insertions.toLocaleString()}</p>
                    <p className="text-text-muted text-xs mt-1">rows added</p>
                  </div>

                  <div className="bg-black-light border border-black-border rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-3 h-3 rounded-full bg-blue-500"></div>
                      <p className="text-text-muted text-xs">Updates</p>
                    </div>
                    <p className="text-2xl font-bold text-blue-500">{commitStats.updates.toLocaleString()}</p>
                    <p className="text-text-muted text-xs mt-1">rows modified</p>
                  </div>

                  <div className="bg-black-light border border-black-border rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-3 h-3 rounded-full bg-red-500"></div>
                      <p className="text-text-muted text-xs">Deletions</p>
                    </div>
                    <p className="text-2xl font-bold text-red-500">{commitStats.deletions.toLocaleString()}</p>
                    <p className="text-text-muted text-xs mt-1">rows removed</p>
                  </div>

                  <div className="bg-black-light border border-black-border rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                      <p className="text-text-muted text-xs">Alterations</p>
                    </div>
                    <p className="text-2xl font-bold text-yellow-500">{commitStats.alterations}</p>
                    <p className="text-text-muted text-xs mt-1">schema changes</p>
                  </div>

                  <div className="bg-black-light border border-black-border rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-3 h-3 rounded-full bg-orange"></div>
                      <p className="text-text-muted text-xs">Creates</p>
                    </div>
                    <p className="text-2xl font-bold text-orange">{commitStats.creates}</p>
                    <p className="text-text-muted text-xs mt-1">tables created</p>
                  </div>

                  <div className="bg-black-light border border-black-border rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-3 h-3 rounded-full bg-purple-500"></div>
                      <p className="text-text-muted text-xs">Drops</p>
                    </div>
                    <p className="text-2xl font-bold text-purple-500">{commitStats.drops}</p>
                    <p className="text-text-muted text-xs mt-1">tables dropped</p>
                  </div>
                </div>

                <div className="bg-orange/10 border border-orange/30 rounded-lg p-4">
                  <div className="flex items-center gap-3">
                    <Clock className="w-5 h-5 text-orange" />
                    <div>
                      <p className="text-text-primary font-semibold">Total Operations: {commits.length}</p>
                      <p className="text-text-muted text-sm">Last modified: {commits[0]?.timestamp.toLocaleString() || 'Never'}</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Download Options */}
              <div className="bg-black-card border border-black-border rounded-xl p-6">
                <h4 className="font-heading font-semibold text-lg text-text-primary mb-4 flex items-center gap-2">
                  <Download className="w-5 h-5 text-orange" />
                  Download Formats
                </h4>

                <p className="text-text-secondary text-sm mb-6">
                  Download your updated database in your preferred format. All modifications are included.
                </p>

                <div className="grid gap-4">
                  {/* SQLite Database (.db) */}
                  <button
                    onClick={async () => {
                      try {
                        const response = await databaseAPI.download(Number(projectId), 'db');
                        const blob = new Blob([response], { type: 'application/x-sqlite3' });
                        const url = window.URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = `${database?.name || 'database'}.db`;
                        document.body.appendChild(a);
                        a.click();
                        window.URL.revokeObjectURL(url);
                        document.body.removeChild(a);
                      } catch (error) {
                        console.error('Download error:', error);
                        alert('Failed to download database');
                      }
                    }}
                    className="flex items-center justify-between p-4 bg-black-light border border-black-border rounded-lg hover:border-orange/30 hover:bg-black-card transition-all duration-300 group"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-lg bg-orange/10 flex items-center justify-center group-hover:bg-orange/20 transition-colors">
                        <Database className="w-6 h-6 text-orange" />
                      </div>
                      <div className="text-left">
                        <p className="text-text-primary font-semibold">SQLite Database (.db)</p>
                        <p className="text-text-muted text-sm">Standard SQLite database file</p>
                      </div>
                    </div>
                    <Download className="w-5 h-5 text-text-muted group-hover:text-orange transition-colors" />
                  </button>

                  {/* SQLite Database (.sqlite) */}
                  <button
                    onClick={async () => {
                      try {
                        const response = await databaseAPI.download(Number(projectId), 'sqlite');
                        const blob = new Blob([response], { type: 'application/x-sqlite3' });
                        const url = window.URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = `${database?.name || 'database'}.sqlite`;
                        document.body.appendChild(a);
                        a.click();
                        window.URL.revokeObjectURL(url);
                        document.body.removeChild(a);
                      } catch (error) {
                        console.error('Download error:', error);
                        alert('Failed to download database');
                      }
                    }}
                    className="flex items-center justify-between p-4 bg-black-light border border-black-border rounded-lg hover:border-orange/30 hover:bg-black-card transition-all duration-300 group"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-lg bg-orange/10 flex items-center justify-center group-hover:bg-orange/20 transition-colors">
                        <Database className="w-6 h-6 text-orange" />
                      </div>
                      <div className="text-left">
                        <p className="text-text-primary font-semibold">SQLite Database (.sqlite)</p>
                        <p className="text-text-muted text-sm">Alternative SQLite extension</p>
                      </div>
                    </div>
                    <Download className="w-5 h-5 text-text-muted group-hover:text-orange transition-colors" />
                  </button>

                  {/* SQLite Database (.sqlite3) */}
                  <button
                    onClick={async () => {
                      try {
                        const response = await databaseAPI.download(Number(projectId), 'sqlite3');
                        const blob = new Blob([response], { type: 'application/x-sqlite3' });
                        const url = window.URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = `${database?.name || 'database'}.sqlite3`;
                        document.body.appendChild(a);
                        a.click();
                        window.URL.revokeObjectURL(url);
                        document.body.removeChild(a);
                      } catch (error) {
                        console.error('Download error:', error);
                        alert('Failed to download database');
                      }
                    }}
                    className="flex items-center justify-between p-4 bg-black-light border border-black-border rounded-lg hover:border-orange/30 hover:bg-black-card transition-all duration-300 group"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-lg bg-orange/10 flex items-center justify-center group-hover:bg-orange/20 transition-colors">
                        <Database className="w-6 h-6 text-orange" />
                      </div>
                      <div className="text-left">
                        <p className="text-text-primary font-semibold">SQLite Database (.sqlite3)</p>
                        <p className="text-text-muted text-sm">SQLite3 format extension</p>
                      </div>
                    </div>
                    <Download className="w-5 h-5 text-text-muted group-hover:text-orange transition-colors" />
                  </button>

                  {/* CSV Export */}
                  <button
                    onClick={async () => {
                      try {
                        const response = await databaseAPI.download(Number(projectId), 'csv');
                        const blob = new Blob([response], { type: 'text/csv' });
                        const url = window.URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = `${database?.name || 'database'}_export.csv`;
                        document.body.appendChild(a);
                        a.click();
                        window.URL.revokeObjectURL(url);
                        document.body.removeChild(a);
                      } catch (error) {
                        console.error('Download error:', error);
                        alert('Failed to download CSV');
                      }
                    }}
                    className="flex items-center justify-between p-4 bg-black-light border border-black-border rounded-lg hover:border-orange/30 hover:bg-black-card transition-all duration-300 group"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-lg bg-green-500/10 flex items-center justify-center group-hover:bg-green-500/20 transition-colors">
                        <FileDown className="w-6 h-6 text-green-500" />
                      </div>
                      <div className="text-left">
                        <p className="text-text-primary font-semibold">CSV Export (.csv)</p>
                        <p className="text-text-muted text-sm">Comma-separated values for all tables</p>
                      </div>
                    </div>
                    <Download className="w-5 h-5 text-text-muted group-hover:text-orange transition-colors" />
                  </button>
                </div>

                <div className="mt-6 bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
                  <div className="flex gap-3">
                    <div className="flex-shrink-0">
                      <div className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center">
                        <span className="text-blue-500 font-bold text-sm">ℹ</span>
                      </div>
                    </div>
                    <div>
                      <p className="text-blue-500 font-semibold mb-1">Download Information</p>
                      <p className="text-text-secondary text-sm">
                        All download formats include your latest modifications. The database file formats (.db, .sqlite, .sqlite3) are identical and can be used interchangeably. Choose based on your preference or tool compatibility.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Settings Tab */}
        {activeTab === 'settings' && (
          <div className="flex-1 overflow-y-auto p-6">
            <div className="max-w-4xl mx-auto">
              <h3 className="font-heading font-bold text-2xl text-text-primary mb-6">
                <span className="text-orange">Settings</span>
              </h3>

              <div className="space-y-6">
                <div className="bg-black-card border border-black-border rounded-xl p-6">
                  <h4 className="font-heading font-semibold text-lg text-text-primary mb-4 flex items-center gap-2">
                    <User className="w-5 h-5 text-orange" />
                    User Information
                  </h4>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-text-secondary text-sm mb-2">Username</label>
                      <input
                        type="text"
                        value={user?.username || ''}
                        readOnly
                        className="w-full bg-black border border-black-border rounded-lg px-4 py-3 text-text-primary"
                      />
                    </div>
                    <div>
                      <label className="block text-text-secondary text-sm mb-2 flex items-center gap-2">
                        <Mail className="w-4 h-4" />
                        Email
                      </label>
                      <input
                        type="email"
                        value={user?.email || ''}
                        readOnly
                        className="w-full bg-black border border-black-border rounded-lg px-4 py-3 text-text-muted"
                      />
                    </div>
                  </div>
                </div>

                <div className="bg-black-card border border-black-border rounded-xl p-6">
                  <h4 className="font-heading font-semibold text-lg text-text-primary mb-4 flex items-center gap-2">
                    <Lock className="w-5 h-5 text-orange" />
                    Security
                  </h4>
                  <button className="w-full flex items-center justify-between p-4 bg-black-light border border-black-border rounded-lg hover:border-orange/30 transition-all duration-300">
                    <span className="text-text-primary">Change Password</span>
                    <Lock className="w-4 h-4 text-text-muted" />
                  </button>
                </div>

                <div className="bg-black-card border border-black-border rounded-xl p-6">
                  <h4 className="font-heading font-semibold text-lg text-text-primary mb-4">Actions</h4>
                  <div className="space-y-3">
                    <button
                      onClick={() => {
                        localStorage.removeItem('token');
                        navigate('/login');
                      }}
                      className="w-full flex items-center justify-between p-4 bg-black-light border border-black-border rounded-lg hover:border-orange/30 transition-all duration-300"
                    >
                      <span className="text-text-primary">Logout</span>
                      <LogOut className="w-4 h-4 text-text-muted" />
                    </button>

                    <button className="w-full flex items-center justify-between p-4 bg-red-500/10 border border-red-500/30 rounded-lg hover:bg-red-500/20 transition-all duration-300">
                      <div>
                        <p className="text-red-500 font-semibold text-left">Delete Account</p>
                        <p className="text-text-muted text-sm text-left">Permanently delete your account and all data</p>
                      </div>
                      <Trash2 className="w-4 h-4 text-red-500" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
