const axios = require('axios');

/**
 * NEXT-GENERATION NLP TO SQL CONVERTER
 *
 * Features:
 * 1. Smart query classification (DML, DDL, Schema Info, Conversational)
 * 2. Context-aware table detection (implicit table understanding)
 * 3. Enhanced fuzzy column matching
 * 4. DDL operations support (CREATE, ALTER, DROP)
 * 5. Schema information queries (SHOW CONSTRAINTS, KEYS, etc.)
 * 6. Date/time query support
 * 7. Conversational query handling
 */

class NLPToSQLV2 {
  constructor() {
    this.geminiApiKey = process.env.GEMINI_API_KEY;
    this.useLocalModel = process.env.USE_LOCAL_MODEL === 'true';
    this.localModelUrl = process.env.LOCAL_MODEL_URL || 'http://localhost:11434';
  }

  /**
   * Main entry point - Convert natural language to SQL
   */
  async convertToSQL(userQuery, schema, conversationHistory = []) {
    try {
      // Try LLM first if available
      if (this.useLocalModel) {
        return await this.useLocalLLM(userQuery, schema, conversationHistory);
      } else if (this.geminiApiKey && this.geminiApiKey !== 'your-gemini-api-key-here' && this.geminiApiKey.length > 20) {
        return await this.useGemini(userQuery, schema, conversationHistory);
      }

      // Use enhanced fallback parser
      return await this.useEnhancedParser(userQuery, schema);
    } catch (error) {
      console.error('NLP to SQL error:', error.message);
      return await this.useEnhancedParser(userQuery, schema);
    }
  }

  /**
   * ENHANCED PARSER - Main logic
   */
  async useEnhancedParser(userQuery, schema) {
    const lowerQuery = userQuery.toLowerCase().trim();

    // Step 1: Classify the query type
    const queryClass = this.classifyQuery(lowerQuery, userQuery);

    // Step 2: Route to appropriate handler
    switch (queryClass.type) {
      case 'CONVERSATIONAL':
        return this.handleConversational(userQuery, queryClass);

      case 'SCHEMA_INFO':
        return this.handleSchemaInfo(userQuery, lowerQuery, schema, queryClass);

      case 'DDL':
        return this.handleDDL(userQuery, lowerQuery, schema, queryClass);

      case 'DML_READ':
        return this.handleSelect(userQuery, lowerQuery, schema, queryClass);

      case 'DML_WRITE_INSERT':
        return this.handleInsert(userQuery, lowerQuery, schema);

      case 'DML_WRITE_UPDATE':
        return this.handleUpdate(userQuery, lowerQuery, schema);

      case 'DML_WRITE_DELETE':
        return this.handleDelete(userQuery, lowerQuery, schema);

      default:
        return this.handleUnknown(userQuery, schema);
    }
  }

  /**
   * SMART QUERY CLASSIFIER
   */
  classifyQuery(lowerQuery, originalQuery) {
    // Conversational queries
    if (lowerQuery.match(/^(hi|hello|hey|thanks|thank you|ok|yes|no|bye)$/)) {
      return { type: 'CONVERSATIONAL', subtype: 'GREETING' };
    }

    // Help/How queries
    if (lowerQuery.match(/^(help|what is|how do|can you|explain)/)) {
      if (lowerQuery.includes('constraint') || lowerQuery.includes('key')) {
        return { type: 'SCHEMA_INFO', subtype: 'CONSTRAINTS' };
      }
      return { type: 'CONVERSATIONAL', subtype: 'HELP' };
    }

    // Schema information queries
    if (lowerQuery.match(/show.*constraint|list.*constraint|what.*constraint/)) {
      return { type: 'SCHEMA_INFO', subtype: 'CONSTRAINTS' };
    }
    if (lowerQuery.match(/show.*key|list.*key|what.*key|types of key/)) {
      return { type: 'SCHEMA_INFO', subtype: 'KEYS' };
    }
    if (lowerQuery.match(/show.*table|list.*table|all table/)) {
      return { type: 'SCHEMA_INFO', subtype: 'TABLES' };
    }
    if (lowerQuery.match(/show.*column|list.*column|describe|schema of/)) {
      return { type: 'SCHEMA_INFO', subtype: 'COLUMNS' };
    }

    // DDL operations
    if (lowerQuery.match(/create\s+(new\s+)?database/)) {
      return { type: 'DDL', subtype: 'CREATE_DATABASE' };
    }
    if (lowerQuery.match(/create\s+(new\s+)?table/)) {
      return { type: 'DDL', subtype: 'CREATE_TABLE' };
    }
    if (lowerQuery.match(/add\s+column|alter\s+table.*add/)) {
      return { type: 'DDL', subtype: 'ALTER_ADD_COLUMN' };
    }
    if (lowerQuery.match(/drop\s+column|alter\s+table.*drop/)) {
      return { type: 'DDL', subtype: 'ALTER_DROP_COLUMN' };
    }
    if (lowerQuery.match(/drop\s+table/)) {
      return { type: 'DDL', subtype: 'DROP_TABLE' };
    }

    // DML - INSERT
    if (lowerQuery.match(/insert|add\s+(new\s+)?(record|row|entry|data)|create\s+(new\s+)?(record|row|entry)/)) {
      return { type: 'DML_WRITE_INSERT' };
    }

    // DML - UPDATE (improved detection)
    if (lowerQuery.match(/update|modify|change|edit|set.*to/)) {
      // NOT if it's a schema modification
      if (!lowerQuery.includes('add column') && !lowerQuery.includes('drop column')) {
        return { type: 'DML_WRITE_UPDATE' };
      }
    }

    // DML - DELETE (improved detection)
    if (lowerQuery.match(/delete|remove/) && !lowerQuery.includes('column')) {
      return { type: 'DML_WRITE_DELETE' };
    }

    // DML - SELECT
    if (lowerQuery.match(/select|show|get|fetch|find|list|display|retrieve|employees? who|students? who|where|filter/)) {
      return { type: 'DML_READ' };
    }

    // COUNT queries
    if (lowerQuery.match(/how many|count/)) {
      return { type: 'DML_READ', subtype: 'COUNT' };
    }

    // Default to unknown
    return { type: 'UNKNOWN' };
  }

  /**
   * CONTEXT-AWARE TABLE DETECTOR
   * Understands implicit table references
   */
  detectTable(userQuery, lowerQuery, schema) {
    // Explicit table mentions
    for (const table of schema.tables) {
      const tableLower = table.name.toLowerCase();

      // Direct mention: "from EMPLOYEE", "in EMPLOYEE", "EMPLOYEE table"
      if (lowerQuery.match(new RegExp(`\\b(from|in|into|to|of)\\s+${tableLower}\\b`, 'i'))) {
        return table;
      }
      if (lowerQuery.match(new RegExp(`\\b${tableLower}\\s+table\\b`, 'i'))) {
        return table;
      }
      if (lowerQuery.match(new RegExp(`\\b${tableLower}\\s+(where|set|values)`, 'i'))) {
        return table;
      }
    }

    // Implicit detection from context keywords
    // "employee" or "employees" → EMPLOYEE table
    if (lowerQuery.match(/\bemployees?\b/)) {
      const table = schema.tables.find(t => t.name.toLowerCase().includes('employ'));
      if (table) return table;
    }

    // "student" or "students" → STUDENT table
    if (lowerQuery.match(/\bstudents?\b/)) {
      const table = schema.tables.find(t => t.name.toLowerCase().includes('student'));
      if (table) return table;
    }

    // "hospital" → HOSPITAL table
    if (lowerQuery.match(/\bhospitals?\b/)) {
      const table = schema.tables.find(t => t.name.toLowerCase().includes('hospital'));
      if (table) return table;
    }

    // Detect from column names mentioned
    // e.g., "delete name Keera" → if only EMPLOYEE has FIRST_NAME column
    const words = userQuery.match(/\b\w+\b/g) || [];
    for (const word of words) {
      for (const table of schema.tables) {
        const hasColumn = table.columns.some(col =>
          col.name.toLowerCase().includes(word.toLowerCase()) ||
          this.getFuzzyNames(col.name).some(fn => fn.toLowerCase() === word.toLowerCase())
        );
        if (hasColumn) {
          return table;
        }
      }
    }

    // If only one table in schema, use it
    if (schema.tables.length === 1) {
      return schema.tables[0];
    }

    return null;
  }

  /**
   * GET FUZZY COLUMN NAME VARIATIONS
   */
  getFuzzyNames(colName) {
    const colLower = colName.toLowerCase();
    const fuzzyNames = [colName];

    // Common variations
    if (colLower.includes('first_name') || colLower.includes('firstname')) {
      fuzzyNames.push('first_name', 'firstname', 'fname', 'name', 'first');
    }
    if (colLower.includes('last_name') || colLower.includes('lastname')) {
      fuzzyNames.push('last_name', 'lastname', 'lname', 'surname', 'last');
    }
    if (colLower.includes('email')) {
      fuzzyNames.push('email', 'mail', 'e-mail', 'e_mail');
    }
    if (colLower.includes('phone')) {
      fuzzyNames.push('phone', 'mobile', 'cell', 'telephone', 'phone_number', 'contact');
    }
    if (colLower.includes('address')) {
      fuzzyNames.push('address', 'addr', 'location');
    }
    if (colLower.includes('salary')) {
      fuzzyNames.push('salary', 'pay', 'wage', 'compensation');
    }
    if (colLower.includes('department')) {
      fuzzyNames.push('department', 'dept', 'division');
    }
    if (colLower.includes('employee_id') || colLower.includes('emp_id')) {
      fuzzyNames.push('employee_id', 'emp_id', 'empid', 'id');
    }
    if (colLower.includes('hire_date') || colLower.includes('join')) {
      fuzzyNames.push('hire_date', 'join_date', 'joined', 'hired', 'start_date');
    }

    return [...new Set(fuzzyNames)]; // Remove duplicates
  }

  /**
   * HANDLER: Conversational Queries
   */
  handleConversational(userQuery, queryClass) {
    const responses = {
      GREETING: {
        'hi': 'Hello! I can help you query your database using natural language. Try asking me to show data, insert records, or explain your schema.',
        'hello': 'Hi there! What would you like to know about your database?',
        'hey': 'Hey! Ready to help you with SQL queries. What do you need?',
        'thanks': 'You\'re welcome! Let me know if you need anything else.',
        'thank you': 'Happy to help! Feel free to ask more questions.',
        'ok': 'Great! What else can I help you with?',
        'yes': 'Understood! How can I assist you further?',
        'bye': 'Goodbye! Come back if you need more help with your database.'
      }
    };

    const lowerQuery = userQuery.toLowerCase().trim();
    const response = responses[queryClass.subtype]?.[lowerQuery] ||
      'I\'m here to help you work with your database. You can ask me to show data, insert records, update values, or explain your database structure.';

    return {
      type: 'info',
      message: response
    };
  }

  /**
   * HANDLER: Schema Information
   */
  handleSchemaInfo(userQuery, lowerQuery, schema, queryClass) {
    switch (queryClass.subtype) {
      case 'CONSTRAINTS':
        return this.showConstraints(schema);

      case 'KEYS':
        return this.showKeys(schema);

      case 'TABLES':
        return {
          type: 'sql',
          query: `SELECT name as table_name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`,
          queryType: 'SELECT',
          explanation: 'Listing all tables in the database'
        };

      case 'COLUMNS':
        const table = this.detectTable(userQuery, lowerQuery, schema);
        if (table) {
          return {
            type: 'sql',
            query: `PRAGMA table_info("${table.name}")`,
            queryType: 'SELECT',
            explanation: `Showing column information for ${table.name}`
          };
        } else {
          return {
            type: 'clarification',
            message: 'Which table would you like to see columns for?',
            suggestions: schema.tables.map(t => ({
              label: t.name,
              value: `Show columns from ${t.name}`,
              description: `${t.columns.length} columns, ${t.rowCount} rows`
            }))
          };
        }

      default:
        return this.handleUnknown(userQuery, schema);
    }
  }

  /**
   * Show Constraints (PRIMARY KEY, FOREIGN KEY, UNIQUE, NOT NULL)
   */
  showConstraints(schema) {
    let message = '**Database Constraints:**\n\n';

    schema.tables.forEach(table => {
      message += `**${table.name}:**\n`;

      // Primary Keys
      const pks = table.columns.filter(c => c.primaryKey);
      if (pks.length > 0) {
        message += `  - PRIMARY KEY: ${pks.map(c => c.name).join(', ')}\n`;
      }

      // Foreign Keys
      if (table.foreignKeys && table.foreignKeys.length > 0) {
        table.foreignKeys.forEach(fk => {
          message += `  - FOREIGN KEY: ${fk.from} → ${fk.table}(${fk.to})\n`;
        });
      }

      // NOT NULL constraints
      const notNulls = table.columns.filter(c => c.notNull && !c.primaryKey);
      if (notNulls.length > 0) {
        message += `  - NOT NULL: ${notNulls.map(c => c.name).join(', ')}\n`;
      }

      // UNIQUE constraints
      if (table.indexes) {
        const uniqueIndexes = table.indexes.filter(idx => idx.unique);
        if (uniqueIndexes.length > 0) {
          uniqueIndexes.forEach(idx => {
            message += `  - UNIQUE: ${idx.name}\n`;
          });
        }
      }

      message += '\n';
    });

    return {
      type: 'info',
      message: message
    };
  }

  /**
   * Show Keys (PRIMARY, FOREIGN)
   */
  showKeys(schema) {
    let message = '**Database Keys:**\n\n';

    schema.tables.forEach(table => {
      message += `**${table.name}:**\n`;

      // Primary Keys
      const pks = table.columns.filter(c => c.primaryKey);
      if (pks.length > 0) {
        message += `  - **Primary Keys:** ${pks.map(c => `${c.name} (${c.type})`).join(', ')}\n`;
      }

      // Foreign Keys
      if (table.foreignKeys && table.foreignKeys.length > 0) {
        message += `  - **Foreign Keys:**\n`;
        table.foreignKeys.forEach(fk => {
          message += `    - ${fk.from} references ${fk.table}(${fk.to})\n`;
        });
      }

      if (pks.length === 0 && (!table.foreignKeys || table.foreignKeys.length === 0)) {
        message += `  - No keys defined\n`;
      }

      message += '\n';
    });

    return {
      type: 'info',
      message: message
    };
  }

  /**
   * HANDLER: DDL Operations
   */
  handleDDL(userQuery, lowerQuery, schema, queryClass) {
    switch (queryClass.subtype) {
      case 'CREATE_DATABASE':
        return {
          type: 'info',
          message: '⚠️ Database creation is handled through file uploads in this system. Please upload a new SQLite database file to create a new database.'
        };

      case 'CREATE_TABLE':
        return {
          type: 'error',
          message: 'CREATE TABLE operations require explicit confirmation for safety. Please provide the full CREATE TABLE statement with column definitions.'
        };

      case 'ALTER_ADD_COLUMN':
        return this.handleAlterAddColumn(userQuery, lowerQuery, schema);

      case 'ALTER_DROP_COLUMN':
        return {
          type: 'error',
          message: '⚠️ DROP COLUMN operations are dangerous and require explicit confirmation. Please provide the full ALTER TABLE statement.'
        };

      case 'DROP_TABLE':
        return {
          type: 'error',
          message: '⚠️ DROP TABLE operations require explicit confirmation for safety.'
        };

      default:
        return this.handleUnknown(userQuery, schema);
    }
  }

  /**
   * Handle ALTER TABLE ADD COLUMN
   */
  handleAlterAddColumn(userQuery, lowerQuery, schema) {
    // Extract table name
    const table = this.detectTable(userQuery, lowerQuery, schema);

    if (!table) {
      return {
        type: 'clarification',
        message: 'Which table would you like to add a column to?',
        suggestions: schema.tables.map(t => ({
          label: t.name,
          value: `Add column to ${t.name}`,
          description: `${t.columns.length} columns`
        }))
      };
    }

    // Extract column name
    const colMatch = userQuery.match(/column\s+(?:name\s+)?["']?(\w+)["']?/i);
    if (!colMatch) {
      return {
        type: 'clarification',
        message: `What is the name of the column you want to add to ${table.name}?\n\nExample: Add column AGE to ${table.name}`,
        suggestions: [
          { label: 'Text column', value: `Add column NAME TEXT to ${table.name}`, description: 'String/text data' },
          { label: 'Number column', value: `Add column AGE INTEGER to ${table.name}`, description: 'Integer numbers' },
          { label: 'Decimal column', value: `Add column PRICE REAL to ${table.name}`, description: 'Decimal numbers' }
        ]
      };
    }

    const columnName = colMatch[1].toUpperCase();

    // Extract data type (default to TEXT)
    let dataType = 'TEXT';
    if (lowerQuery.includes('integer') || lowerQuery.includes('int') || lowerQuery.includes('number')) {
      dataType = 'INTEGER';
    } else if (lowerQuery.includes('real') || lowerQuery.includes('float') || lowerQuery.includes('decimal')) {
      dataType = 'REAL';
    } else if (lowerQuery.includes('text') || lowerQuery.includes('string')) {
      dataType = 'TEXT';
    } else if (lowerQuery.includes('date') || lowerQuery.includes('time')) {
      dataType = 'TEXT'; // SQLite doesn't have native DATE type
    }

    const query = `ALTER TABLE "${table.name}" ADD COLUMN "${columnName}" ${dataType}`;

    return {
      type: 'sql',
      query: query,
      queryType: 'ALTER',
      explanation: `Adding column ${columnName} (${dataType}) to ${table.name}`
    };
  }

  /**
   * HANDLER: SELECT Queries
   */
  handleSelect(userQuery, lowerQuery, schema, queryClass) {
    // Detect table
    const table = this.detectTable(userQuery, lowerQuery, schema);

    if (!table) {
      return {
        type: 'clarification',
        message: 'Which table would you like to query?',
        suggestions: schema.tables.map(t => ({
          label: t.name,
          value: `Show all data from ${t.name}`,
          description: `${t.rowCount} rows`
        }))
      };
    }

    // Check for COUNT query
    if (queryClass.subtype === 'COUNT' || lowerQuery.includes('how many') || lowerQuery.includes('count')) {
      return {
        type: 'sql',
        query: `SELECT COUNT(*) as total_count FROM "${table.name}"`,
        queryType: 'SELECT',
        explanation: `Counting total records in ${table.name}`
      };
    }

    // Build WHERE clause if conditions exist
    const whereClause = this.buildWhereClause(userQuery, lowerQuery, table);

    const query = `SELECT * FROM "${table.name}"${whereClause} LIMIT 100`;

    return {
      type: 'sql',
      query: query,
      queryType: 'SELECT',
      explanation: `Retrieving records from ${table.name}${whereClause ? ' with filters' : ''}`
    };
  }

  /**
   * BUILD WHERE CLAUSE with fuzzy matching and date support
   */
  buildWhereClause(userQuery, lowerQuery, table) {
    const conditions = [];

    // Date filtering (e.g., "joined in June", "hired in 2023")
    const dateMatch = lowerQuery.match(/(joined|hired|enrolled|in)\s+(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i);
    if (dateMatch) {
      const month = dateMatch[2].toUpperCase().substring(0, 3);
      const dateCol = table.columns.find(c =>
        c.name.toLowerCase().includes('date') ||
        c.name.toLowerCase().includes('hire') ||
        c.name.toLowerCase().includes('join') ||
        c.name.toLowerCase().includes('enroll')
      );
      if (dateCol) {
        conditions.push(`"${dateCol.name}" LIKE '%-${month}-%'`);
      }
    }

    // Year filtering
    const yearMatch = lowerQuery.match(/\b(19|20)\d{2}\b/);
    if (yearMatch && conditions.length === 0) {
      const year = yearMatch[0];
      const dateCol = table.columns.find(c => c.name.toLowerCase().includes('date'));
      if (dateCol) {
        conditions.push(`"${dateCol.name}" LIKE '%-%-${year.substring(2)}'`); // For DD-MON-YY format
      }
    }

    // Column-value conditions with fuzzy matching
    for (const col of table.columns) {
      const fuzzyNames = this.getFuzzyNames(col.name);

      for (const fName of fuzzyNames) {
        const patterns = [
          // "where name = value"
          new RegExp(`where\\s+${fName}\\s*=\\s*['"]?([^\\s'"\\n]+?)['"]?`, 'i'),
          // "name is value"
          new RegExp(`\\b${fName}\\s+is\\s+['"]?([^\\s'"\\n]+?)['"]?`, 'i'),
          // "name value" (e.g., "name John")
          new RegExp(`\\b${fName}\\s+['"]?([^\\s'"\\n]+?)['"]?(?:\\s+(where|and|or|from|$))`, 'i'),
          // Comparison operators
          new RegExp(`\\b${fName}\\s*>\\s*([^\\s'"\\n]+)`, 'i'),
          new RegExp(`\\b${fName}\\s*<\\s*([^\\s'"\\n]+)`, 'i'),
          new RegExp(`\\b${fName}\\s*>=\\s*([^\\s'"\\n]+)`, 'i'),
          new RegExp(`\\b${fName}\\s*<=\\s*([^\\s'"\\n]+)`, 'i')
        ];

        for (const pattern of patterns) {
          const match = userQuery.match(pattern);
          if (match && match[1]) {
            const value = match[1].trim().replace(/^["']|["']$/g, '');

            // Skip if value is a keyword
            if (['where', 'and', 'or', 'from', 'table', 'in', 'to'].includes(value.toLowerCase())) {
              continue;
            }

            const operator = match[0].includes('>') ? (match[0].includes('=') ? '>=' : '>') :
                            match[0].includes('<') ? (match[0].includes('=') ? '<=' : '<') : '=';

            // Type-aware condition building
            if (col.type.toUpperCase().includes('INT')) {
              const parsed = parseInt(value);
              if (!isNaN(parsed)) {
                conditions.push(`"${col.name}" ${operator} ${parsed}`);
                break;
              }
            } else if (col.type.toUpperCase().includes('REAL') || col.type.toUpperCase().includes('FLOAT')) {
              const parsed = parseFloat(value);
              if (!isNaN(parsed)) {
                conditions.push(`"${col.name}" ${operator} ${parsed}`);
                break;
              }
            } else {
              // String comparison - case insensitive
              conditions.push(`LOWER("${col.name}") ${operator} LOWER('${value.replace(/'/g, "''")}')`);
              break;
            }
          }
        }
        if (conditions.some(c => c.includes(col.name))) break;
      }
    }

    return conditions.length > 0 ? ` WHERE ${conditions.join(' AND ')}` : '';
  }

  /**
   * HANDLER: INSERT
   */
  handleInsert(userQuery, lowerQuery, schema) {
    // Detect table
    const table = this.detectTable(userQuery, lowerQuery, schema);

    if (!table) {
      return {
        type: 'clarification',
        message: 'Which table would you like to insert data into?',
        suggestions: schema.tables.map(t => ({
          label: t.name,
          value: `Insert into ${t.name}`,
          description: `Available columns: ${t.columns.filter(c => !c.primaryKey || !c.name.toLowerCase().endsWith('_id')).map(c => c.name).join(', ')}`
        }))
      };
    }

    // Extract values with fuzzy matching
    const values = {};
    const insertableColumns = table.columns.filter(c =>
      !c.primaryKey || !c.name.toLowerCase().endsWith('_id')
    );

    // Try to extract column-value pairs
    for (const col of insertableColumns) {
      const fuzzyNames = this.getFuzzyNames(col.name);

      for (const fName of fuzzyNames) {
        const patterns = [
          // "name=value" or "name: value"
          new RegExp(`\\b${fName}\\s*[=:]\\s*['"]?([^,'"\\n]+?)['"]?(?:\\s|,|$)`, 'i'),
          // "name value"
          new RegExp(`\\b${fName}\\s+['"]?([^,'"\\s\\n]+)['"]?`, 'i'),
          // Quoted values
          new RegExp(`\\b${fName}\\s*[=:]?\\s*["']([^"']+)["']`, 'i')
        ];

        for (const pattern of patterns) {
          const match = userQuery.match(pattern);
          if (match && match[1]) {
            let value = match[1].trim().replace(/^["']|["']$/g, '').replace(/,$/g, '');

            if (!value || value.length === 0) continue;

            // Skip keywords
            if (['into', 'in', 'to', 'insert', 'add', 'create', 'new', 'table'].includes(value.toLowerCase())) {
              continue;
            }

            // Type conversion
            if (col.type.toUpperCase().includes('INT')) {
              const parsed = parseInt(value);
              if (!isNaN(parsed)) {
                values[col.name] = parsed;
                break;
              }
            } else if (col.type.toUpperCase().includes('REAL') || col.type.toUpperCase().includes('FLOAT')) {
              const parsed = parseFloat(value);
              if (!isNaN(parsed)) {
                values[col.name] = parsed;
                break;
              }
            } else {
              values[col.name] = `'${value.replace(/'/g, "''")}'`;
              break;
            }
          }
        }
        if (values[col.name]) break;
      }
    }

    // If no matches, try positional extraction
    if (Object.keys(values).length === 0) {
      const afterTable = userQuery.substring(userQuery.toLowerCase().lastIndexOf(table.name.toLowerCase()) + table.name.length);
      const words = afterTable.match(/["']([^"']+)["']|(\b\w+\b)/g);

      if (words && words.length > 0) {
        const cleanWords = words.map(w => w.replace(/["']/g, '').trim()).filter(w =>
          w.length > 0 && !['into', 'in', 'to', 'insert', 'add', 'create', 'new'].includes(w.toLowerCase())
        );

        insertableColumns.slice(0, cleanWords.length).forEach((col, idx) => {
          if (cleanWords[idx]) {
            let value = cleanWords[idx];

            if (col.type.toUpperCase().includes('INT')) {
              const parsed = parseInt(value);
              values[col.name] = !isNaN(parsed) ? parsed : `'${value.replace(/'/g, "''")}'`;
            } else if (col.type.toUpperCase().includes('REAL')) {
              const parsed = parseFloat(value);
              values[col.name] = !isNaN(parsed) ? parsed : `'${value.replace(/'/g, "''")}'`;
            } else {
              values[col.name] = `'${value.replace(/'/g, "''")}'`;
            }
          }
        });
      }
    }

    if (Object.keys(values).length === 0) {
      return {
        type: 'clarification',
        message: `Please provide values for ${table.name}.\n\nExample formats:\n- Insert into ${table.name} ${insertableColumns.slice(0, 2).map(c => c.name).join(' ')} value1 value2\n- Insert into ${table.name} ${insertableColumns.slice(0, 2).map(c => `${c.name}=value`).join(', ')}`,
        suggestions: insertableColumns.slice(0, 5).map(c => ({
          label: c.name,
          value: `Insert into ${table.name} ${c.name} example_value`,
          description: `Type: ${c.type}${c.notNull ? ' (Required)' : ''}`
        }))
      };
    }

    const columns = Object.keys(values);
    const valueList = Object.values(values);

    const query = `INSERT INTO "${table.name}" (${columns.map(c => `"${c}"`).join(', ')}) VALUES (${valueList.join(', ')})`;

    return {
      type: 'sql',
      query: query,
      queryType: 'INSERT',
      explanation: `Inserting new record into ${table.name} with ${columns.length} field(s)`
    };
  }

  /**
   * HANDLER: UPDATE
   */
  handleUpdate(userQuery, lowerQuery, schema) {
    // Detect table FIRST before matching columns
    const table = this.detectTable(userQuery, lowerQuery, schema);

    if (!table) {
      return {
        type: 'clarification',
        message: 'Which table would you like to update?',
        suggestions: schema.tables.map(t => ({
          label: t.name,
          value: `Update ${t.name}`,
          description: `${t.rowCount} rows`
        }))
      };
    }

    // Extract SET values with fuzzy matching
    const setStatements = [];
    const setFields = new Set();

    for (const col of table.columns) {
      if (setFields.has(col.name)) continue;

      const fuzzyNames = this.getFuzzyNames(col.name);

      for (const fName of fuzzyNames) {
        const patterns = [
          new RegExp(`\\b${fName}\\s*=\\s*['"]?([^,'"\\n]+?)['"]?(?:\\s|,|where|$)`, 'i'),
          new RegExp(`\\b${fName}\\s+to\\s+['"]?([^,'"\\n]+?)['"]?(?:\\s|,|where|$)`, 'i'),
          new RegExp(`set\\s+${fName}\\s+['"]?([^,'"\\s\\n]+?)['"]?`, 'i')
        ];

        for (const pattern of patterns) {
          const match = userQuery.match(pattern);
          if (match && match[1]) {
            let value = match[1].trim().replace(/^["']|["']$/g, '');

            // Skip keywords
            if (['where', 'and', 'or'].includes(value.toLowerCase())) {
              continue;
            }

            if (col.type.toUpperCase().includes('INT')) {
              const parsed = parseInt(value);
              if (!isNaN(parsed)) {
                setStatements.push(`"${col.name}" = ${parsed}`);
                setFields.add(col.name);
                break;
              }
            } else if (col.type.toUpperCase().includes('REAL') || col.type.toUpperCase().includes('FLOAT')) {
              const parsed = parseFloat(value);
              if (!isNaN(parsed)) {
                setStatements.push(`"${col.name}" = ${parsed}`);
                setFields.add(col.name);
                break;
              }
            } else {
              setStatements.push(`"${col.name}" = '${value.replace(/'/g, "''")}'`);
              setFields.add(col.name);
              break;
            }
          }
        }
        if (setFields.has(col.name)) break;
      }
    }

    if (setStatements.length === 0) {
      return {
        type: 'clarification',
        message: `What would you like to update in ${table.name}?\n\nExample: Update ${table.name} set column_name = new_value where id = 1`
      };
    }

    // Build WHERE clause
    const whereClause = this.buildWhereClause(userQuery, lowerQuery, table);

    if (!whereClause) {
      return {
        type: 'clarification',
        message: `⚠️ WARNING: UPDATE without WHERE clause will modify ALL ${table.rowCount} rows in ${table.name}.\n\nPlease specify which rows to update.\n\nExample: Update ${table.name} set ${setStatements[0].split('=')[0].trim()} where id = 1`
      };
    }

    const query = `UPDATE "${table.name}" SET ${setStatements.join(', ')}${whereClause}`;

    return {
      type: 'sql',
      query: query,
      queryType: 'UPDATE',
      explanation: `Updating records in ${table.name}${whereClause.replace(' WHERE ', ' where ')}`
    };
  }

  /**
   * HANDLER: DELETE
   */
  handleDelete(userQuery, lowerQuery, schema) {
    // Detect table FIRST
    const table = this.detectTable(userQuery, lowerQuery, schema);

    if (!table) {
      return {
        type: 'clarification',
        message: 'Which table would you like to delete from?',
        suggestions: schema.tables.map(t => ({
          label: t.name,
          value: `Delete from ${t.name}`,
          description: `${t.rowCount} rows`
        }))
      };
    }

    // Build WHERE clause
    const whereClause = this.buildWhereClause(userQuery, lowerQuery, table);

    if (!whereClause) {
      return {
        type: 'clarification',
        message: `⚠️ DANGER: DELETE without WHERE clause will remove ALL ${table.rowCount} rows from ${table.name}!\n\nPlease specify which rows to delete.\n\nExample: Delete from ${table.name} where id = 1`
      };
    }

    const query = `DELETE FROM "${table.name}"${whereClause}`;

    return {
      type: 'sql',
      query: query,
      queryType: 'DELETE',
      explanation: `Deleting records from ${table.name}${whereClause.replace(' WHERE ', ' where ')}`
    };
  }

  /**
   * HANDLER: Unknown queries
   */
  handleUnknown(userQuery, schema) {
    return {
      type: 'clarification',
      message: `I'm not sure how to help with that. Here are some things you can ask me:\n\n` +
               `• Show data: "show all employees", "list students"\n` +
               `• Filter data: "employees who joined in June", "students where age > 20"\n` +
               `• Insert data: "insert into employee name John", "add student Jane"\n` +
               `• Update data: "update employee salary 50000 where name John"\n` +
               `• Delete data: "delete employee where id 5"\n` +
               `• Schema info: "show constraints", "what keys in employee"\n` +
               `• Add columns: "add column AGE to employee table"`,
      suggestions: [
        { label: 'View tables', value: 'Show all tables', description: 'List all database tables' },
        { label: 'View data', value: `Show all data from ${schema.tables[0]?.name || 'EMPLOYEE'}`, description: 'Display table contents' },
        { label: 'Schema info', value: 'What are the constraints?', description: 'Show keys and constraints' }
      ]
    };
  }

  /**
   * Use Gemini API (existing implementation)
   */
  async useGemini(userQuery, schema, conversationHistory) {
    const prompt = this.buildLLMPrompt(userQuery, schema, conversationHistory);

    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${this.geminiApiKey}`,
      {
        contents: [{
          parts: [{
            text: prompt
          }]
        }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 1024,
        }
      }
    );

    const generatedText = response.data.candidates[0].content.parts[0].text;
    return this.parseResponse(generatedText, schema);
  }

  /**
   * Use Local LLM (existing implementation)
   */
  async useLocalLLM(userQuery, schema, conversationHistory) {
    const prompt = this.buildLLMPrompt(userQuery, schema, conversationHistory);

    const response = await axios.post(`${this.localModelUrl}/api/generate`, {
      model: 'llama2',
      prompt: prompt,
      stream: false
    });

    return this.parseResponse(response.data.response, schema);
  }

  /**
   * Build LLM Prompt
   */
  buildLLMPrompt(userQuery, schema, conversationHistory) {
    let prompt = `You are an expert SQL query generator. Convert natural language to SQLite queries.

DATABASE SCHEMA:
${this.formatSchemaForPrompt(schema)}

IMPORTANT RULES:
1. Generate ONLY valid SQLite syntax
2. Use double quotes for table/column names if they contain spaces
3. For ambiguous queries, ask for clarification using the format: CLARIFY: [your question]
4. For non-SQL questions about the database, respond with: INFO: [your answer]
5. For SELECT queries, always limit to 100 rows unless specified
6. Always include WHERE clause for UPDATE and DELETE unless user explicitly says "all"
7. Use case-insensitive comparisons with LOWER() for string columns
8. Support date filtering with LIKE patterns (e.g., '%-JUN-%' for June)

`;

    if (conversationHistory.length > 0) {
      prompt += `\nCONVERSATION HISTORY:\n`;
      conversationHistory.slice(-3).forEach(msg => {
        prompt += `${msg.role}: ${msg.content}\n`;
      });
    }

    prompt += `\nUSER QUERY: ${userQuery}

RESPONSE FORMAT:
- If you need clarification: CLARIFY: [question]
- If it's a non-SQL informational query: INFO: [answer]
- If it's a valid SQL request: SQL: [query]

Your response:`;

    return prompt;
  }

  /**
   * Format schema for LLM prompt
   */
  formatSchemaForPrompt(schema) {
    let formatted = '';

    schema.tables.forEach(table => {
      formatted += `\nTable: ${table.name} (${table.rowCount} rows)\n`;
      formatted += 'Columns:\n';
      table.columns.forEach(col => {
        const constraints = [];
        if (col.primaryKey) constraints.push('PRIMARY KEY');
        if (col.notNull) constraints.push('NOT NULL');
        const constraintStr = constraints.length > 0 ? ` (${constraints.join(', ')})` : '';
        formatted += `  - ${col.name}: ${col.type}${constraintStr}\n`;
      });

      if (table.foreignKeys && table.foreignKeys.length > 0) {
        formatted += 'Foreign Keys:\n';
        table.foreignKeys.forEach(fk => {
          formatted += `  - ${fk.from} references ${fk.table}(${fk.to})\n`;
        });
      }
    });

    return formatted;
  }

  /**
   * Parse LLM response
   */
  parseResponse(responseText, schema) {
    const trimmed = responseText.trim();

    // Check for clarification request
    if (trimmed.includes('CLARIFY:')) {
      const clarification = trimmed.split('CLARIFY:')[1].trim();
      return {
        type: 'clarification',
        message: clarification
      };
    }

    // Check for informational response
    if (trimmed.includes('INFO:')) {
      const info = trimmed.split('INFO:')[1].trim();
      return {
        type: 'info',
        message: info
      };
    }

    // Extract SQL query
    let sqlQuery = '';
    if (trimmed.includes('SQL:')) {
      sqlQuery = trimmed.split('SQL:')[1].trim();
    } else {
      const codeBlockMatch = trimmed.match(/```sql\n([\s\S]*?)\n```/);
      if (codeBlockMatch) {
        sqlQuery = codeBlockMatch[1].trim();
      } else {
        sqlQuery = trimmed;
      }
    }

    sqlQuery = sqlQuery.replace(/```/g, '').trim();
    if (sqlQuery.endsWith(';')) {
      sqlQuery = sqlQuery.slice(0, -1);
    }

    // Validate the query
    const validation = this.validateQuery(sqlQuery);
    if (!validation.valid) {
      return {
        type: 'error',
        message: validation.error
      };
    }

    const queryType = this.getQueryType(sqlQuery);

    return {
      type: 'sql',
      query: sqlQuery,
      queryType: queryType,
      explanation: this.explainQuery(sqlQuery, queryType)
    };
  }

  /**
   * Validate SQL query
   */
  validateQuery(query) {
    if (!query || query.length === 0) {
      return { valid: false, error: 'Empty query' };
    }

    const dangerous = ['DROP', 'TRUNCATE'];
    const upperQuery = query.toUpperCase();
    for (const cmd of dangerous) {
      if (upperQuery.includes(cmd)) {
        return {
          valid: false,
          error: `${cmd} operations require explicit confirmation for safety`
        };
      }
    }

    return { valid: true };
  }

  /**
   * Get query type
   */
  getQueryType(query) {
    const upperQuery = query.toUpperCase().trim();
    if (upperQuery.startsWith('SELECT') || upperQuery.startsWith('PRAGMA')) return 'SELECT';
    if (upperQuery.startsWith('INSERT')) return 'INSERT';
    if (upperQuery.startsWith('UPDATE')) return 'UPDATE';
    if (upperQuery.startsWith('DELETE')) return 'DELETE';
    if (upperQuery.startsWith('CREATE')) return 'CREATE';
    if (upperQuery.startsWith('ALTER')) return 'ALTER';
    if (upperQuery.startsWith('DROP')) return 'DROP';
    return 'UNKNOWN';
  }

  /**
   * Explain query in plain language
   */
  explainQuery(query, queryType) {
    const explanations = {
      'SELECT': 'Retrieving data from the database',
      'INSERT': 'Adding new records to the database',
      'UPDATE': 'Modifying existing records',
      'DELETE': 'Removing records from the database',
      'CREATE': 'Creating new database objects',
      'ALTER': 'Modifying database structure',
      'DROP': 'Deleting database objects'
    };

    return explanations[queryType] || 'Executing database operation';
  }
}

module.exports = new NLPToSQLV2();
