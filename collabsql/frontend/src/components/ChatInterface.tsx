import { useState, useEffect, useRef, useMemo } from 'react';
import { queryAPI } from '../services/api';
import socketService from '../services/socket';
import {
  FiSend,
  FiUser,
  FiCpu,
  FiCopy,
  FiCheck,
  FiAlertCircle,
  FiCode,
  FiTable,
  FiTrash2,
  FiDatabase,
} from 'react-icons/fi';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  type?: 'text' | 'sql' | 'clarification' | 'info' | 'error' | 'result';
  sqlQuery?: string;
  queryResult?: any[];
  suggestions?: any[];
  timestamp: Date;
}

interface ChatInterfaceProps {
  databaseId: number;
  schema: any;
  userPermission: string;
}

const ChatInterface: React.FC<ChatInterfaceProps> = ({ databaseId, schema }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    loadSuggestions();
    loadChatHistory();
  }, []);

  useEffect(() => {
    if (messages.length > 0) {
      saveChatHistory();
    }
  }, [messages]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const loadSuggestions = async () => {
    try {
      const response = await queryAPI.getSuggestions(databaseId);
      setSuggestions(response.data.suggestions);
    } catch (error) {
      console.error('Failed to load suggestions');
    }
  };

  // Get table-specific suggestions based on selected table
  const filteredSuggestions = useMemo(() => {
    if (!selectedTable) {
      return suggestions.slice(0, 6);
    }
    const tableSpecific = suggestions.filter(
      (s) => s.query.toLowerCase().includes(selectedTable.toLowerCase())
    );
    // Add dynamic suggestions for the selected table
    const tableCols = schema?.tables?.find(
      (t: any) => t.name === selectedTable
    )?.columns;
    const dynamicSuggestions: any[] = [];

    if (tableCols) {
      const nameCol = tableCols.find(
        (c: any) =>
          c.name.toLowerCase().includes('first_name') ||
          c.name.toLowerCase() === 'name'
      );
      const numCol = tableCols.find(
        (c: any) =>
          c.name.toLowerCase().includes('salary') ||
          c.name.toLowerCase().includes('age') ||
          c.name.toLowerCase().includes('score') ||
          (c.type.toUpperCase().includes('INT') && !c.primaryKey && !c.name.toLowerCase().endsWith('_id'))
      );

      if (nameCol) {
        dynamicSuggestions.push({
          query: `Show ${selectedTable.toLowerCase()} names starting with A`,
          description: `Filter by name pattern`,
        });
      }
      if (numCol) {
        dynamicSuggestions.push({
          query: `Show top 5 highest ${numCol.name.toLowerCase()} in ${selectedTable}`,
          description: `Top records by ${numCol.name}`,
        });
        dynamicSuggestions.push({
          query: `Average ${numCol.name.toLowerCase()} in ${selectedTable}`,
          description: `Calculate average ${numCol.name}`,
        });
      }
      dynamicSuggestions.push({
        query: `Count rows in ${selectedTable}`,
        description: `Total record count`,
      });
    }

    const combined = [...tableSpecific, ...dynamicSuggestions];
    const seen = new Set<string>();
    return combined
      .filter((s) => {
        const key = s.query.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 6);
  }, [selectedTable, suggestions, schema]);

  const addWelcomeMessage = () => {
    const tableNames = schema?.tables?.map((t: any) => t.name).join(', ') || 'your tables';
    const welcomeMessage: Message = {
      id: 'welcome',
      role: 'assistant',
      content: `Hello! I'm your database assistant. I can help you query and manipulate data using natural language.\n\n**Available tables:** ${tableNames}\n\nSelect a table on the right to focus your queries, or just ask me anything!\n\nExamples:\n- "Show all employees"\n- "Find names starting with S"\n- "Count rows in STUDENT"\n- "Insert into EMPLOYEE name John salary 5000"`,
      type: 'info',
      timestamp: new Date(),
    };
    setMessages([welcomeMessage]);
  };

  const loadChatHistory = () => {
    try {
      const storageKey = `chat_history_${databaseId}`;
      const savedHistory = localStorage.getItem(storageKey);

      if (savedHistory) {
        const parsedHistory = JSON.parse(savedHistory);
        const messagesWithDates = parsedHistory.map((msg: any) => ({
          ...msg,
          timestamp: new Date(msg.timestamp),
        }));
        setMessages(messagesWithDates);
      } else {
        addWelcomeMessage();
      }
    } catch (error) {
      console.error('Failed to load chat history:', error);
      addWelcomeMessage();
    }
  };

  const saveChatHistory = () => {
    try {
      const storageKey = `chat_history_${databaseId}`;
      localStorage.setItem(storageKey, JSON.stringify(messages));
    } catch (error) {
      console.error('Failed to save chat history:', error);
    }
  };

  const clearChatHistory = () => {
    try {
      const storageKey = `chat_history_${databaseId}`;
      localStorage.removeItem(storageKey);
      addWelcomeMessage();
    } catch (error) {
      console.error('Failed to clear chat history:', error);
    }
  };

  const handleSendMessage = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input.trim(),
      type: 'text',
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const nlResponse = await queryAPI.convertNL({
        databaseId,
        query: input.trim(),
        conversationHistory: messages.map((m) => ({ role: m.role, content: m.content })),
        selectedTable: selectedTable || undefined,
      });

      const { type, message, query, queryType, explanation, suggestions: newSuggestions } = nlResponse.data;

      if (type === 'clarification') {
        const clarificationMessage: Message = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: message,
          type: 'clarification',
          suggestions: newSuggestions,
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, clarificationMessage]);
      } else if (type === 'info') {
        const infoMessage: Message = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: message,
          type: 'info',
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, infoMessage]);
      } else if (type === 'sql') {
        const assistantMessage: Message = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: explanation || 'Executing query...',
          type: 'sql',
          sqlQuery: query,
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, assistantMessage]);
        executeQuery(query, queryType);
      } else if (type === 'error') {
        const errorMessage: Message = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: message,
          type: 'error',
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, errorMessage]);
      }
    } catch (error: any) {
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: error.response?.data?.error || 'Failed to process your query',
        type: 'error',
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const executeQuery = async (query: string, queryType: string) => {
    try {
      const execResponse = await queryAPI.execute({
        databaseId,
        query,
        isWrite: queryType !== 'SELECT',
      });

      const resultMessage: Message = {
        id: (Date.now() + 2).toString(),
        role: 'assistant',
        content: execResponse.data.message,
        type: 'result',
        queryResult: queryType === 'SELECT' ? execResponse.data.result : null,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, resultMessage]);

      if (queryType !== 'SELECT') {
        socketService.notifyQueryExecuted({
          databaseId,
          queryType,
          affectedTables: extractTableName(query),
          rowsAffected: execResponse.data.result?.rowsAffected,
        });
      }
    } catch (error: any) {
      const errorMessage: Message = {
        id: (Date.now() + 2).toString(),
        role: 'assistant',
        content: error.response?.data?.error || 'Failed to execute query',
        type: 'error',
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    }
  };

  const extractTableName = (query: string): string => {
    const match = query.match(/(?:FROM|INTO|UPDATE|TABLE)\s+["']?(\w+)["']?/i);
    return match ? match[1] : '';
  };

  const handleSuggestionClick = (suggestion: any) => {
    setInput(suggestion.query || suggestion.value);
    inputRef.current?.focus();
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <div className="h-full flex bg-gray-50">
      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Messages Area */}
        <div className="flex-1 overflow-y-auto px-4 py-6">
          <div className="max-w-3xl mx-auto space-y-6">
            {messages.map((message) => (
              <MessageBubble key={message.id} message={message} onSuggestionClick={handleSuggestionClick} />
            ))}

            {isLoading && <TypingIndicator />}

            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Suggestions */}
        {messages.length <= 1 && filteredSuggestions.length > 0 && (
          <div className="px-4 py-3 bg-white border-t border-gray-200">
            <div className="max-w-3xl mx-auto">
              <p className="text-xs font-medium text-gray-500 mb-2">
                Suggested queries{selectedTable ? ` for ${selectedTable}` : ''}:
              </p>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {filteredSuggestions.map((suggestion, index) => (
                  <button
                    key={index}
                    onClick={() => handleSuggestionClick(suggestion)}
                    className="text-left px-3 py-2 text-sm bg-gray-50 hover:bg-gray-100 rounded-lg border border-gray-200 transition"
                  >
                    <div className="font-medium text-gray-900 truncate">{suggestion.query}</div>
                    <div className="text-xs text-gray-500 truncate">{suggestion.description}</div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Input Area */}
        <div className="bg-white border-t border-gray-200 px-4 py-4">
          <div className="max-w-3xl mx-auto">
            {/* Clear Chat Button */}
            {messages.length > 1 && (
              <div className="flex justify-end mb-2">
                <button
                  onClick={clearChatHistory}
                  className="flex items-center space-x-1 px-3 py-1 text-xs text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
                  title="Clear chat history"
                >
                  <FiTrash2 className="w-3 h-3" />
                  <span>Clear Chat</span>
                </button>
              </div>
            )}

            <div className="flex items-end space-x-3">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder={
                  selectedTable
                    ? `Ask about ${selectedTable}...`
                    : 'Ask me anything about your database...'
                }
                className="flex-1 resize-none px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                rows={1}
                style={{ minHeight: '48px', maxHeight: '120px' }}
              />
              <button
                onClick={handleSendMessage}
                disabled={!input.trim() || isLoading}
                className="px-6 py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
              >
                <FiSend className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Right Sidebar - Table Selector as Radio Options */}
      {schema && schema.tables && schema.tables.length > 0 && (
        <div className="w-56 border-l border-gray-200 bg-white flex-shrink-0 overflow-y-auto">
          <div className="p-4">
            <div className="flex items-center space-x-2 mb-4">
              <FiDatabase className="w-4 h-4 text-gray-600" />
              <h3 className="text-sm font-semibold text-gray-900">Tables</h3>
            </div>

            {/* All Tables option */}
            <label className="flex items-center space-x-3 px-3 py-2 rounded-lg cursor-pointer hover:bg-gray-50 transition mb-1">
              <input
                type="radio"
                name="table-selector"
                checked={selectedTable === null}
                onChange={() => setSelectedTable(null)}
                className="w-4 h-4 text-primary-600 border-gray-300 focus:ring-primary-500"
              />
              <div className="flex-1 min-w-0">
                <span className="text-sm font-medium text-gray-900">All Tables</span>
              </div>
            </label>

            <div className="border-t border-gray-100 my-2" />

            {/* Individual table options */}
            {schema.tables.map((table: any) => (
              <label
                key={table.name}
                className={`flex items-center space-x-3 px-3 py-2 rounded-lg cursor-pointer transition mb-1 ${
                  selectedTable === table.name
                    ? 'bg-primary-50 border border-primary-200'
                    : 'hover:bg-gray-50'
                }`}
              >
                <input
                  type="radio"
                  name="table-selector"
                  checked={selectedTable === table.name}
                  onChange={() => setSelectedTable(table.name)}
                  className="w-4 h-4 text-primary-600 border-gray-300 focus:ring-primary-500"
                />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-900 truncate">{table.name}</div>
                  <div className="text-xs text-gray-500">
                    {table.rowCount} rows &middot; {table.columns.length} cols
                  </div>
                </div>
              </label>
            ))}

            {/* Selected table info */}
            {selectedTable && (
              <div className="mt-4 p-3 bg-gray-50 rounded-lg border border-gray-200">
                <p className="text-xs text-gray-600 mb-2">
                  <span className="font-semibold">Active:</span>{' '}
                  <span className="text-primary-700 font-bold">{selectedTable}</span>
                </p>
                <p className="text-xs text-gray-500">
                  Queries target this table by default.
                </p>
                <button
                  onClick={() => setSelectedTable(null)}
                  className="mt-2 text-xs text-primary-600 hover:text-primary-700 font-medium"
                >
                  Clear selection
                </button>
              </div>
            )}

            {/* Quick column reference */}
            {selectedTable && (
              <div className="mt-3">
                <p className="text-xs font-medium text-gray-600 mb-1 px-1">Columns:</p>
                <div className="space-y-0.5">
                  {schema.tables
                    .find((t: any) => t.name === selectedTable)
                    ?.columns.slice(0, 10)
                    .map((col: any) => (
                      <div
                        key={col.name}
                        className="flex items-center justify-between px-2 py-1 text-xs"
                      >
                        <span className="text-gray-700 truncate">{col.name}</span>
                        <span className="text-gray-400 ml-1 flex-shrink-0">{col.type}</span>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// Message Bubble Component
const MessageBubble: React.FC<{ message: Message; onSuggestionClick: (s: any) => void }> = ({
  message,
  onSuggestionClick,
}) => {
  const [copied, setCopied] = useState(false);
  const [showSql, setShowSql] = useState(false);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (message.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="flex items-start space-x-2 max-w-2xl">
          <div className="bg-primary-600 text-white px-4 py-3 rounded-2xl rounded-tr-sm">
            <p className="text-sm whitespace-pre-wrap">{message.content}</p>
          </div>
          <div className="flex-shrink-0 w-8 h-8 bg-primary-100 rounded-full flex items-center justify-center">
            <FiUser className="w-4 h-4 text-primary-600" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-start">
      <div className="flex items-start space-x-2 max-w-2xl">
        <div className="flex-shrink-0 w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center">
          <FiCpu className="w-4 h-4 text-gray-600" />
        </div>
        <div className="bg-white border border-gray-200 px-4 py-3 rounded-2xl rounded-tl-sm shadow-sm">
          {message.type === 'error' && (
            <div className="flex items-start space-x-2 text-red-600 mb-2">
              <FiAlertCircle className="w-5 h-5 mt-0.5" />
              <p className="text-sm font-medium">Error</p>
            </div>
          )}

          {/* Render message content with markdown-like bold */}
          <div className="text-sm text-gray-900 whitespace-pre-wrap">
            {message.content.split(/(\*\*[^*]+\*\*)/).map((part, i) => {
              if (part.startsWith('**') && part.endsWith('**')) {
                return (
                  <strong key={i} className="font-semibold">
                    {part.slice(2, -2)}
                  </strong>
                );
              }
              return <span key={i}>{part}</span>;
            })}
          </div>

          {/* SQL Query Display - hidden by default, toggle to show */}
          {message.sqlQuery && (
            <div className="mt-3">
              <button
                type="button"
                onClick={() => setShowSql((s) => !s)}
                className="flex items-center text-xs font-medium text-gray-500 hover:text-gray-700 transition"
              >
                <FiCode className="w-3 h-3 mr-1" />
                {showSql ? 'Hide SQL' : 'Show SQL'}
              </button>
              {showSql && (
                <div className="mt-2 bg-gray-900 text-gray-100 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium text-gray-400">SQL Query</span>
                    <button
                      onClick={() => copyToClipboard(message.sqlQuery!)}
                      className="text-xs text-gray-400 hover:text-white flex items-center transition"
                    >
                      {copied ? <FiCheck className="w-3 h-3 mr-1" /> : <FiCopy className="w-3 h-3 mr-1" />}
                      {copied ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                  <code className="text-xs font-mono text-green-300 break-all">{message.sqlQuery}</code>
                </div>
              )}
            </div>
          )}

          {/* Query Results Table */}
          {message.queryResult && message.queryResult.length > 0 && (
            <div className="mt-3">
              <div className="flex items-center text-xs font-medium text-gray-600 mb-2">
                <FiTable className="w-3 h-3 mr-1" />
                Results ({message.queryResult.length} rows)
              </div>
              <div className="overflow-x-auto rounded-lg border border-gray-200">
                <table className="min-w-full divide-y divide-gray-200 text-xs">
                  <thead className="bg-gray-50">
                    <tr>
                      {Object.keys(message.queryResult[0]).map((key) => (
                        <th key={key} className="px-3 py-2 text-left font-medium text-gray-700 whitespace-nowrap">
                          {key}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {message.queryResult.map((row, idx) => (
                      <tr key={idx} className="hover:bg-gray-50">
                        {Object.values(row).map((value: any, cellIdx) => (
                          <td key={cellIdx} className="px-3 py-2 text-gray-900 whitespace-nowrap">
                            {value === null ? (
                              <span className="text-gray-400 italic">null</span>
                            ) : value === '-' ? (
                              <span className="text-gray-400">-</span>
                            ) : (
                              String(value)
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Suggestions */}
          {message.suggestions && message.suggestions.length > 0 && (
            <div className="mt-3 space-y-2">
              {message.suggestions.map((suggestion, idx) => (
                <button
                  key={idx}
                  onClick={() => onSuggestionClick(suggestion)}
                  className="block w-full text-left px-3 py-2 bg-gray-50 hover:bg-gray-100 rounded-lg border border-gray-200 transition"
                >
                  <div className="text-sm font-medium text-gray-900">{suggestion.label}</div>
                  {suggestion.description && (
                    <div className="text-xs text-gray-700">{suggestion.description}</div>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// Typing Indicator
const TypingIndicator = () => (
  <div className="flex justify-start">
    <div className="flex items-start space-x-2">
      <div className="flex-shrink-0 w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center">
        <FiCpu className="w-4 h-4 text-gray-600" />
      </div>
      <div className="bg-white border border-gray-200 px-4 py-3 rounded-2xl rounded-tl-sm">
        <div className="flex space-x-1">
          <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
          <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
          <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
        </div>
      </div>
    </div>
  </div>
);

export default ChatInterface;
