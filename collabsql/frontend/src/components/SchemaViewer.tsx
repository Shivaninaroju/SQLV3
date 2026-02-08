import { useState } from 'react';
import { FiTable, FiKey, FiLink, FiChevronDown, FiChevronRight } from 'react-icons/fi';

interface SchemaViewerProps {
  databaseId: number;
  schema: any;
}

const SchemaViewer: React.FC<SchemaViewerProps> = ({ schema }) => {
  const [expandedTables, setExpandedTables] = useState<Set<string>>(new Set());

  if (!schema || !schema.tables) {
    return (
      <div className="h-full flex items-center justify-center text-gray-500">
        <p>No schema data available</p>
      </div>
    );
  }

  const toggleTable = (tableName: string) => {
    setExpandedTables((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(tableName)) {
        newSet.delete(tableName);
      } else {
        newSet.add(tableName);
      }
      return newSet;
    });
  };

  return (
    <div className="h-full overflow-y-auto bg-gray-50 p-6">
      <div className="max-w-5xl mx-auto">
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Database Schema</h2>
          <div className="flex items-center space-x-4 text-sm text-gray-600">
            <span>{schema.tables.length} tables</span>
            <span>•</span>
            <span>{schema.views?.length || 0} views</span>
            <span>•</span>
            <span>{schema.indexes?.length || 0} indexes</span>
          </div>
        </div>

        <div className="space-y-4">
          {schema.tables.map((table: any) => (
            <div key={table.name} className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
              {/* Table Header */}
              <button
                onClick={() => toggleTable(table.name)}
                className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition"
              >
                <div className="flex items-center space-x-3">
                  {expandedTables.has(table.name) ? (
                    <FiChevronDown className="w-5 h-5 text-gray-400" />
                  ) : (
                    <FiChevronRight className="w-5 h-5 text-gray-400" />
                  )}
                  <FiTable className="w-5 h-5 text-primary-600" />
                  <div className="text-left">
                    <h3 className="text-lg font-semibold text-gray-900">{table.name}</h3>
                    <p className="text-sm text-gray-500">
                      {table.columns.length} columns • {table.rowCount.toLocaleString()} rows
                    </p>
                  </div>
                </div>
              </button>

              {/* Table Details */}
              {expandedTables.has(table.name) && (
                <div className="border-t border-gray-200 p-4 bg-gray-50">
                  {/* Columns */}
                  <div className="mb-4">
                    <h4 className="text-sm font-semibold text-gray-700 mb-3">Columns</h4>
                    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                              Name
                            </th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                              Type
                            </th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                              Constraints
                            </th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {table.columns.map((column: any) => (
                            <tr key={column.name}>
                              <td className="px-4 py-2 text-sm font-medium text-gray-900 flex items-center">
                                {column.name}
                                {column.primaryKey && (
                                  <FiKey className="w-3 h-3 ml-2 text-gray-700" title="Primary Key" />
                                )}
                              </td>
                              <td className="px-4 py-2 text-sm text-gray-700">{column.type}</td>
                              <td className="px-4 py-2 text-sm text-gray-500">
                                <div className="flex flex-wrap gap-1">
                                  {column.notNull && (
                                    <span className="px-2 py-0.5 bg-gray-700 text-white rounded text-xs">
                                      NOT NULL
                                    </span>
                                  )}
                                  {column.defaultValue && (
                                    <span className="px-2 py-0.5 bg-gray-200 text-gray-800 rounded text-xs">
                                      DEFAULT: {column.defaultValue}
                                    </span>
                                  )}
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Foreign Keys */}
                  {table.foreignKeys && table.foreignKeys.length > 0 && (
                    <div className="mb-4">
                      <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center">
                        <FiLink className="w-4 h-4 mr-2" />
                        Foreign Keys
                      </h4>
                      <div className="space-y-2">
                        {table.foreignKeys.map((fk: any, idx: number) => (
                          <div
                            key={idx}
                            className="bg-white border border-gray-200 rounded-lg px-4 py-2 text-sm"
                          >
                            <span className="font-medium text-gray-900">{fk.from}</span>
                            <span className="text-gray-500 mx-2">→</span>
                            <span className="text-primary-600">
                              {fk.table}.{fk.to}
                            </span>
                            {(fk.onUpdate || fk.onDelete) && (
                              <div className="mt-1 text-xs text-gray-500">
                                {fk.onUpdate && <span>ON UPDATE: {fk.onUpdate}</span>}
                                {fk.onDelete && <span className="ml-3">ON DELETE: {fk.onDelete}</span>}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Indexes */}
                  {table.indexes && table.indexes.length > 0 && (
                    <div>
                      <h4 className="text-sm font-semibold text-gray-700 mb-3">Indexes</h4>
                      <div className="flex flex-wrap gap-2">
                        {table.indexes.map((index: any, idx: number) => (
                          <span
                            key={idx}
                            className={`px-3 py-1 rounded-full text-xs font-medium ${
                              index.unique
                                ? 'bg-gray-700 text-white'
                                : 'bg-gray-100 text-gray-700'
                            }`}
                          >
                            {index.name} {index.unique && '(UNIQUE)'}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Views */}
        {schema.views && schema.views.length > 0 && (
          <div className="mt-8">
            <h3 className="text-xl font-bold text-gray-900 mb-4">Views</h3>
            <div className="space-y-2">
              {schema.views.map((view: any) => (
                <div key={view.name} className="bg-white rounded-lg border border-gray-200 p-4">
                  <h4 className="font-semibold text-gray-900">{view.name}</h4>
                  {view.sql && (
                    <pre className="mt-2 text-xs bg-gray-50 p-3 rounded overflow-x-auto">
                      <code>{view.sql}</code>
                    </pre>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SchemaViewer;
