import React from 'react';
import { FiDatabase, FiCheck } from 'react-icons/fi';

interface Table {
  name: string;
  rowCount: number;
  columns: any[];
}

interface TableSelectorProps {
  tables: Table[];
  selectedTable: string | null;
  onSelectTable: (tableName: string | null) => void;
}

const TableSelector: React.FC<TableSelectorProps> = ({ tables, selectedTable, onSelectTable }) => {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 mb-4 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center space-x-2">
          <FiDatabase className="w-5 h-5 text-gray-700" />
          <h3 className="text-sm font-semibold text-gray-900">Active Table</h3>
        </div>
        {selectedTable && (
          <button
            onClick={() => onSelectTable(null)}
            className="text-xs text-gray-600 hover:text-gray-900 underline"
          >
            Clear Selection
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {tables.length === 0 ? (
          <p className="text-sm text-gray-500 italic">No tables in database</p>
        ) : (
          <>
            <button
              onClick={() => onSelectTable(null)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                selectedTable === null
                  ? 'bg-gray-900 text-white shadow-md'
                  : 'bg-gray-50 text-gray-700 hover:bg-gray-100 border border-gray-200'
              }`}
            >
              <div className="flex items-center space-x-2">
                {selectedTable === null && <FiCheck className="w-4 h-4" />}
                <span>All Tables</span>
              </div>
            </button>

            {tables.map((table) => (
              <button
                key={table.name}
                onClick={() => onSelectTable(table.name)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  selectedTable === table.name
                    ? 'bg-gray-900 text-white shadow-md'
                    : 'bg-gray-50 text-gray-700 hover:bg-gray-100 border border-gray-200'
                }`}
                title={`${table.rowCount} rows, ${table.columns.length} columns`}
              >
                <div className="flex items-center space-x-2">
                  {selectedTable === table.name && <FiCheck className="w-4 h-4" />}
                  <span>{table.name}</span>
                  <span className="text-xs opacity-70">({table.rowCount})</span>
                </div>
              </button>
            ))}
          </>
        )}
      </div>

      {selectedTable && (
        <div className="mt-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
          <p className="text-xs text-gray-600">
            <span className="font-semibold">Active:</span> All queries will target the{' '}
            <span className="font-bold text-gray-900">{selectedTable}</span> table unless you
            specify otherwise.
          </p>
        </div>
      )}
    </div>
  );
};

export default TableSelector;
