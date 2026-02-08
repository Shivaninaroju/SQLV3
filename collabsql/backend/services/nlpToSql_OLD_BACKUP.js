const axios = require('axios');

class NLPToSQL {
  constructor() {
    this.geminiApiKey = process.env.GEMINI_API_KEY;
    this.useLocalModel = process.env.USE_LOCAL_MODEL === 'true';
    this.localModelUrl = process.env.LOCAL_MODEL_URL || 'http://localhost:11434';
  }

  /**
   * Convert natural language to SQL query
   */
  async convertToSQL(userQuery, schema, conversationHistory = []) {
    try {
      if (this.useLocalModel) {
        return await this.useLocalLLM(userQuery, schema, conversationHistory);
      } else if (this.geminiApiKey && this.geminiApiKey !== 'your-gemini-api-key-here' && this.geminiApiKey.length > 20) {
        return await this.useGemini(userQuery, schema, conversationHistory);
      } else {
        // Fallback to enhanced rule-based approach
        return await this.useFallbackParser(userQuery, schema);
      }
    } catch (error) {
      console.error('NLP to SQL error:', error.message);
      // Try fallback if API fails
      return await this.useFallbackParser(userQuery, schema);
    }
  }

  /**
   * Use Google Gemini API
   */
  async useGemini(userQuery, schema, conversationHistory) {
    const prompt = this.buildPrompt(userQuery, schema, conversationHistory);

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
   * Use local Ollama model
   */
  async useLocalLLM(userQuery, schema, conversationHistory) {
    const prompt = this.buildPrompt(userQuery, schema, conversationHistory);

    const response = await axios.post(`${this.localModelUrl}/api/generate`, {
      model: 'llama2',
      prompt: prompt,
      stream: false
    });

    return this.parseResponse(response.data.response, schema);
  }

  /**
   * Build prompt for LLM
   */
  buildPrompt(userQuery, schema, conversationHistory) {
    let prompt = `You are an expert SQL query generator. Convert natural language to SQLite queries.

DATABASE SCHEMA:
${this.formatSchemaForPrompt(schema)}

IMPORTANT RULES:
1. Generate ONLY valid SQLite syntax
2. Use double quotes for table/column names if they contain spaces
3. For ambiguous queries, ask for clarification using the format: CLARIFY: [your question]
4. For non-SQL questions about the database, respond with: INFO: [your answer]
5. For SELECT queries, always limit to 100 rows unless specified
6. Use parameterized query format when needed
7. Validate that referenced tables and columns exist in the schema
8. For INSERT/UPDATE/DELETE, be cautious and generate safe queries
9. Always include WHERE clause for UPDATE and DELETE unless user explicitly says "all"

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
   * Format schema for prompt
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

      if (table.foreignKeys.length > 0) {
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
        message: clarification,
        suggestions: this.generateSuggestions(clarification, schema)
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
      // Try to extract SQL from code blocks
      const codeBlockMatch = trimmed.match(/```sql\n([\s\S]*?)\n```/);
      if (codeBlockMatch) {
        sqlQuery = codeBlockMatch[1].trim();
      } else {
        sqlQuery = trimmed;
      }
    }

    // Clean up the query
    sqlQuery = sqlQuery.replace(/```/g, '').trim();
    if (sqlQuery.endsWith(';')) {
      sqlQuery = sqlQuery.slice(0, -1);
    }

    // Validate the query
    const validation = this.validateQuery(sqlQuery, schema);
    if (!validation.valid) {
      return {
        type: 'error',
        message: validation.error
      };
    }

    // Determine query type
    const queryType = this.getQueryType(sqlQuery);

    return {
      type: 'sql',
      query: sqlQuery,
      queryType: queryType,
      explanation: this.explainQuery(sqlQuery, queryType)
    };
  }

  /**
   * Enhanced fallback rule-based parser with full CRUD support
   */
  async useFallbackParser(userQuery, schema) {
    const lowerQuery = userQuery.toLowerCase().trim();

    // Show all tables
    if (lowerQuery.match(/show (all )?tables/i)) {
      return {
        type: 'sql',
        query: `SELECT name as table_name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`,
        queryType: 'SELECT',
        explanation: 'Listing all tables in the database'
      };
    }

    // Show columns
    const showColumnsMatch = lowerQuery.match(/show columns (from|in|of) (\w+)/i);
    if (showColumnsMatch) {
      const tableName = showColumnsMatch[2];
      const table = schema.tables.find(t => t.name.toLowerCase() === tableName.toLowerCase());
      if (table) {
        return {
          type: 'sql',
          query: `PRAGMA table_info("${table.name}")`,
          queryType: 'SELECT',
          explanation: `Showing column information for ${table.name}`
        };
      }
    }

    // Ambiguous column request
    if (lowerQuery.match(/show (all )?columns/i) && !lowerQuery.includes('from')) {
      return {
        type: 'clarification',
        message: `Which table would you like to see columns for?`,
        suggestions: schema.tables.map(t => ({
          label: t.name,
          value: `Show columns from ${t.name}`,
          description: `${t.columns.length} columns, ${t.rowCount} rows`
        }))
      };
    }

    // INSERT operations
    if (lowerQuery.includes('insert') || lowerQuery.includes('add new') || lowerQuery.includes('create new')) {
      return this.parseInsertQuery(userQuery, schema, lowerQuery);
    }

    // UPDATE operations
    if (lowerQuery.includes('update') || lowerQuery.includes('modify') || lowerQuery.includes('change') || lowerQuery.includes('edit')) {
      return this.parseUpdateQuery(userQuery, schema, lowerQuery);
    }

    // DELETE operations
    if ((lowerQuery.includes('delete') || lowerQuery.includes('remove')) && !lowerQuery.includes('create') && !lowerQuery.includes('add')) {
      return this.parseDeleteQuery(userQuery, schema, lowerQuery);
    }

    // Select with WHERE condition
    if (lowerQuery.includes('where')) {
      return this.parseSelectWithWhere(userQuery, schema, lowerQuery);
    }

    // Select all from table
    const selectAllMatch = lowerQuery.match(/(?:show|select|get|fetch|display|list) (?:all )?(?:data |records |rows |entries )?(?:from |in )?(\w+)/i);
    if (selectAllMatch) {
      const tableName = selectAllMatch[1];
      const table = schema.tables.find(t => t.name.toLowerCase() === tableName.toLowerCase());
      if (table) {
        return {
          type: 'sql',
          query: `SELECT * FROM "${table.name}" LIMIT 100`,
          queryType: 'SELECT',
          explanation: `Retrieving all records from ${table.name}`
        };
      }
    }

    // Count rows
    const countMatch = lowerQuery.match(/(?:how many|count) (?:rows |records )?(?:in |from )?(\w+)/i);
    if (countMatch) {
      const tableName = countMatch[1];
      const table = schema.tables.find(t => t.name.toLowerCase() === tableName.toLowerCase());
      if (table) {
        return {
          type: 'sql',
          query: `SELECT COUNT(*) as total_count FROM "${table.name}"`,
          queryType: 'SELECT',
          explanation: `Counting total records in ${table.name}`
        };
      }
    }

    // Default: ask for clarification
    return {
      type: 'clarification',
      message: `I need more information to generate a query. What would you like to do?\n\nAvailable tables: ${schema.tables.map(t => t.name).join(', ')}`,
      suggestions: [
        { label: 'View all tables', value: 'Show all tables', description: 'List all database tables' },
        { label: 'View data', value: `Show all data from ${schema.tables[0]?.name || 'EMPLOYEE'}`, description: 'Display table contents' },
        { label: 'Count records', value: `How many rows in ${schema.tables[0]?.name || 'EMPLOYEE'}`, description: 'Count table rows' },
        { label: 'Insert data', value: `Insert into ${schema.tables[0]?.name || 'EMPLOYEE'} name John age 25`, description: 'Add new record' }
      ]
    };
  }

  /**
   * Parse INSERT query from natural language
   */
  parseInsertQuery(userQuery, schema, lowerQuery) {
    // Extract table name
    const tableMatch = lowerQuery.match(/(?:into |in |to )(\w+)/i);
    if (!tableMatch) {
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

    const tableName = tableMatch[1];
    const table = schema.tables.find(t => t.name.toLowerCase() === tableName.toLowerCase());

    if (!table) {
      return {
        type: 'error',
        message: `Table '${tableName}' not found in database`
      };
    }

    // Extract values with FUZZY COLUMN MATCHING
    const values = {};
    const originalQuery = userQuery;

    // Get non-primary key columns
    const insertableColumns = table.columns.filter(c =>
      !c.primaryKey || !c.name.toLowerCase().endsWith('_id')
    );

    // Try to extract column-value pairs with fuzzy matching
    insertableColumns.forEach(col => {
      const colName = col.name;
      const colLower = colName.toLowerCase();

      // Create fuzzy matching patterns
      // Match full name, partial name, or common aliases
      const fuzzyNames = [colName];

      // Add common variations
      if (colLower.includes('first_name') || colLower.includes('firstname')) {
        fuzzyNames.push('first_name', 'firstname', 'fname', 'name');
      }
      if (colLower.includes('last_name') || colLower.includes('lastname')) {
        fuzzyNames.push('last_name', 'lastname', 'lname', 'surname');
      }
      if (colLower.includes('email')) {
        fuzzyNames.push('email', 'mail', 'e-mail');
      }
      if (colLower.includes('phone')) {
        fuzzyNames.push('phone', 'mobile', 'cell', 'telephone');
      }
      if (colLower.includes('address')) {
        fuzzyNames.push('address', 'addr');
      }
      if (colLower.includes('salary')) {
        fuzzyNames.push('salary', 'pay', 'wage');
      }
      if (colLower.includes('department')) {
        fuzzyNames.push('department', 'dept');
      }

      // Try each fuzzy name
      for (const fName of fuzzyNames) {
        if (values[colName]) break; // Already found value for this column

        const patterns = [
          // Exact match with = or :
          new RegExp(`\\b${fName}\\s*[=:]\\s*['"]?([^,'"\\n]+?)['"]?(?:\\s|,|$)`, 'i'),
          // Space-separated (name value)
          new RegExp(`\\b${fName}\\s+['"]?([^,'"\\s\\n]+)['"]?`, 'i'),
          // Quoted values
          new RegExp(`\\b${fName}\\s*[=:]?\\s*["']([^"']+)["']`, 'i')
        ];

        for (const pattern of patterns) {
          const match = originalQuery.match(pattern);
          if (match && match[1]) {
            let value = match[1].trim();

            // Clean up value
            value = value.replace(/^["']|["']$/g, ''); // Remove quotes
            value = value.replace(/,$/g, ''); // Remove trailing comma

            if (!value || value.length === 0) continue;

            // Type conversion
            if (col.type.toUpperCase().includes('INT')) {
              const parsed = parseInt(value);
              if (!isNaN(parsed)) {
                values[colName] = parsed;
                break;
              }
            } else if (col.type.toUpperCase().includes('REAL') || col.type.toUpperCase().includes('FLOAT') || col.type.toUpperCase().includes('DECIMAL')) {
              const parsed = parseFloat(value);
              if (!isNaN(parsed)) {
                values[colName] = parsed;
                break;
              }
            } else if (col.type.toUpperCase().includes('DATE')) {
              // Handle dates - accept various formats
              values[colName] = `'${value.replace(/'/g, "''")}'`;
              break;
            } else {
              // String type
              values[colName] = `'${value.replace(/'/g, "''")}'`;
              break;
            }
          }
        }
      }
    });

    // If no exact matches, try positional extraction
    // Example: "insert into EMPLOYEE Keera Smith" → assumes first value is first non-PK column
    if (Object.keys(values).length === 0) {
      // Extract all quoted strings and standalone words after table name
      const afterTable = originalQuery.substring(originalQuery.toLowerCase().indexOf(tableName.toLowerCase()) + tableName.length);
      const words = afterTable.match(/["']([^"']+)["']|(\b\w+\b)/g);

      if (words && words.length > 0) {
        const cleanWords = words.map(w => w.replace(/["']/g, '').trim()).filter(w =>
          w.length > 0 && !['into', 'in', 'to', 'insert', 'add', 'create', 'new'].includes(w.toLowerCase())
        );

        if (cleanWords.length > 0) {
          // Map words to columns positionally
          insertableColumns.slice(0, cleanWords.length).forEach((col, idx) => {
            if (cleanWords[idx]) {
              let value = cleanWords[idx];

              if (col.type.toUpperCase().includes('INT')) {
                const parsed = parseInt(value);
                if (!isNaN(parsed)) values[col.name] = parsed;
                else values[col.name] = `'${value.replace(/'/g, "''")}'`; // Store as string if not a number
              } else if (col.type.toUpperCase().includes('REAL') || col.type.toUpperCase().includes('FLOAT')) {
                const parsed = parseFloat(value);
                if (!isNaN(parsed)) values[col.name] = parsed;
                else values[col.name] = `'${value.replace(/'/g, "''")}'`;
              } else {
                values[col.name] = `'${value.replace(/'/g, "''")}'`;
              }
            }
          });
        }
      }
    }

    // Check if we have enough information
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

    // Build INSERT query
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
   * Parse UPDATE query from natural language with fuzzy matching
   */
  parseUpdateQuery(userQuery, schema, lowerQuery) {
    // Extract table name
    const tableMatch = lowerQuery.match(/update (\w+)/i) || lowerQuery.match(/modify (\w+)/i) || lowerQuery.match(/change (\w+)/i);
    if (!tableMatch) {
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

    const tableName = tableMatch[1];
    const table = schema.tables.find(t => t.name.toLowerCase() === tableName.toLowerCase());

    if (!table) {
      return {
        type: 'error',
        message: `Table '${tableName}' not found`
      };
    }

    // Extract SET values with fuzzy matching
    const setStatements = [];
    const setFields = new Set();

    table.columns.forEach(col => {
      if (setFields.has(col.name)) return; // Already processed

      const colName = col.name;
      const colLower = colName.toLowerCase();

      // Create fuzzy name variations
      const fuzzyNames = [colName];
      if (colLower.includes('first_name') || colLower.includes('firstname')) {
        fuzzyNames.push('first_name', 'firstname', 'fname', 'name');
      }
      if (colLower.includes('last_name') || colLower.includes('lastname')) {
        fuzzyNames.push('last_name', 'lastname', 'lname', 'surname');
      }
      if (colLower.includes('email')) {
        fuzzyNames.push('email', 'mail');
      }
      if (colLower.includes('salary')) {
        fuzzyNames.push('salary', 'pay', 'wage');
      }
      if (colLower.includes('department')) {
        fuzzyNames.push('department', 'dept');
      }

      for (const fName of fuzzyNames) {
        const patterns = [
          new RegExp(`\\b${fName}\\s*=\\s*['"]?([^,'"\\n]+?)['"]?(?:\\s|,|$)`, 'i'),
          new RegExp(`\\b${fName}\\s+to\\s+['"]?([^,'"\\n]+?)['"]?(?:\\s|,|$)`, 'i'),
          new RegExp(`set\\s+${fName}\\s+['"]?([^,'"\\s\\n]+?)['"]?`, 'i')
        ];

        for (const pattern of patterns) {
          const match = userQuery.match(pattern);
          if (match && match[1]) {
            let value = match[1].trim().replace(/^["']|["']$/g, '');

            if (col.type.toUpperCase().includes('INT')) {
              const parsed = parseInt(value);
              if (!isNaN(parsed)) {
                setStatements.push(`"${colName}" = ${parsed}`);
                setFields.add(colName);
              }
            } else if (col.type.toUpperCase().includes('REAL') || col.type.toUpperCase().includes('FLOAT')) {
              const parsed = parseFloat(value);
              if (!isNaN(parsed)) {
                setStatements.push(`"${colName}" = ${parsed}`);
                setFields.add(colName);
              }
            } else {
              setStatements.push(`"${colName}" = '${value.replace(/'/g, "''")}'`);
              setFields.add(colName);
            }
            break;
          }
        }
        if (setFields.has(colName)) break;
      }
    });

    if (setStatements.length === 0) {
      return {
        type: 'clarification',
        message: `What would you like to update in ${table.name}?\n\nExample: Update ${table.name} set column_name = new_value where id = 1`
      };
    }

    // Extract WHERE clause with fuzzy matching
    let whereClause = '';
    for (const col of table.columns) {
      const colName = col.name;
      const colLower = colName.toLowerCase();

      const fuzzyNames = [colName];
      if (colLower.includes('id')) fuzzyNames.push('id');
      if (colLower.includes('first_name')) fuzzyNames.push('first_name', 'firstname', 'fname', 'name');
      if (colLower.includes('last_name')) fuzzyNames.push('last_name', 'lastname', 'lname', 'surname');
      if (colLower.includes('email')) fuzzyNames.push('email', 'mail');

      for (const fName of fuzzyNames) {
        const patterns = [
          new RegExp(`where\\s+${fName}\\s*=\\s*['"]?([^\\s'"\\n]+?)['"]?`, 'i'),
          new RegExp(`where\\s+${fName}\\s+is\\s+['"]?([^\\s'"\\n]+?)['"]?`, 'i'),
          new RegExp(`\\b${fName}\\s+['"]?([^\\s'"\\n]+?)['"]?\\s+(where|$)`, 'i')
        ];

        for (const pattern of patterns) {
          const match = userQuery.match(pattern);
          if (match && match[1] && match[1].toLowerCase() !== 'where') {
            let value = match[1].trim().replace(/^["']|["']$/g, '');

            if (col.type.toUpperCase().includes('INT')) {
              const parsed = parseInt(value);
              if (!isNaN(parsed)) {
                whereClause = `WHERE "${colName}" = ${parsed}`;
                break;
              }
            } else if (col.type.toUpperCase().includes('REAL')) {
              const parsed = parseFloat(value);
              if (!isNaN(parsed)) {
                whereClause = `WHERE "${colName}" = ${parsed}`;
                break;
              }
            } else {
              whereClause = `WHERE LOWER("${colName}") = LOWER('${value.replace(/'/g, "''")}')`;
              break;
            }
          }
        }
        if (whereClause) break;
      }
      if (whereClause) break;
    }

    if (!whereClause) {
      return {
        type: 'clarification',
        message: `⚠️ WARNING: UPDATE without WHERE clause will modify ALL ${table.rowCount} rows in ${table.name}.\n\nPlease specify which rows to update.\n\nExample: Update ${table.name} set ${setStatements[0].split('=')[0].trim()} where id = 1`
      };
    }

    const query = `UPDATE "${table.name}" SET ${setStatements.join(', ')} ${whereClause}`;

    return {
      type: 'sql',
      query: query,
      queryType: 'UPDATE',
      explanation: `Updating records in ${table.name} where ${whereClause.replace('WHERE ', '')}`
    };
  }

  /**
   * Parse DELETE query from natural language with fuzzy matching
   */
  parseDeleteQuery(userQuery, schema, lowerQuery) {
    // Extract table name
    const tableMatch = lowerQuery.match(/(?:delete from|remove from) (\w+)/i) || lowerQuery.match(/delete (\w+)/i);
    if (!tableMatch) {
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

    const tableName = tableMatch[1];
    const table = schema.tables.find(t => t.name.toLowerCase() === tableName.toLowerCase());

    if (!table) {
      return {
        type: 'error',
        message: `Table '${tableName}' not found`
      };
    }

    // Extract WHERE clause with fuzzy matching
    let whereClause = '';
    for (const col of table.columns) {
      const colName = col.name;
      const colLower = colName.toLowerCase();

      const fuzzyNames = [colName];
      if (colLower.includes('id')) fuzzyNames.push('id');
      if (colLower.includes('first_name')) fuzzyNames.push('first_name', 'firstname', 'fname', 'name');
      if (colLower.includes('last_name')) fuzzyNames.push('last_name', 'lastname', 'lname', 'surname');
      if (colLower.includes('email')) fuzzyNames.push('email', 'mail');

      for (const fName of fuzzyNames) {
        const patterns = [
          new RegExp(`where\\s+${fName}\\s*=\\s*['"]?([^\\s'"\\n]+?)['"]?`, 'i'),
          new RegExp(`where\\s+${fName}\\s+is\\s+['"]?([^\\s'"\\n]+?)['"]?`, 'i'),
          new RegExp(`\\b${fName}\\s+['"]?([^\\s'"\\n]+?)['"]?\\s+(where|from|$)`, 'i')
        ];

        for (const pattern of patterns) {
          const match = userQuery.match(pattern);
          if (match && match[1] && !['where', 'from'].includes(match[1].toLowerCase())) {
            let value = match[1].trim().replace(/^["']|["']$/g, '');

            if (col.type.toUpperCase().includes('INT')) {
              const parsed = parseInt(value);
              if (!isNaN(parsed)) {
                whereClause = `WHERE "${colName}" = ${parsed}`;
                break;
              }
            } else if (col.type.toUpperCase().includes('REAL')) {
              const parsed = parseFloat(value);
              if (!isNaN(parsed)) {
                whereClause = `WHERE "${colName}" = ${parsed}`;
                break;
              }
            } else {
              whereClause = `WHERE LOWER("${colName}") = LOWER('${value.replace(/'/g, "''")}')`;
              break;
            }
          }
        }
        if (whereClause) break;
      }
      if (whereClause) break;
    }

    if (!whereClause) {
      return {
        type: 'clarification',
        message: `⚠️ DANGER: DELETE without WHERE clause will remove ALL ${table.rowCount} rows from ${table.name}!\n\nPlease specify which rows to delete.\n\nExample: Delete from ${table.name} where id = 1`
      };
    }

    const query = `DELETE FROM "${table.name}" ${whereClause}`;

    return {
      type: 'sql',
      query: query,
      queryType: 'DELETE',
      explanation: `Deleting records from ${table.name} where ${whereClause.replace('WHERE ', '')}`
    };
  }

  /**
   * Parse SELECT with WHERE clause using fuzzy matching
   */
  parseSelectWithWhere(userQuery, schema, lowerQuery) {
    const tableMatch = lowerQuery.match(/(?:from |in )(\w+)/i);
    if (!tableMatch) return this.useFallbackParser(userQuery, schema);

    const tableName = tableMatch[1];
    const table = schema.tables.find(t => t.name.toLowerCase() === tableName.toLowerCase());

    if (!table) {
      return { type: 'error', message: `Table '${tableName}' not found` };
    }

    let whereClause = '';
    for (const col of table.columns) {
      const colName = col.name;
      const colLower = colName.toLowerCase();

      const fuzzyNames = [colName];
      if (colLower.includes('id')) fuzzyNames.push('id');
      if (colLower.includes('first_name')) fuzzyNames.push('first_name', 'firstname', 'fname', 'name');
      if (colLower.includes('last_name')) fuzzyNames.push('last_name', 'lastname', 'lname', 'surname');
      if (colLower.includes('email')) fuzzyNames.push('email', 'mail');
      if (colLower.includes('salary')) fuzzyNames.push('salary', 'pay', 'wage');

      for (const fName of fuzzyNames) {
        const patterns = [
          new RegExp(`where\\s+${fName}\\s*=\\s*['"]?([^\\s'"\\n]+?)['"]?`, 'i'),
          new RegExp(`where\\s+${fName}\\s*>\\s*['"]?([^\\s'"\\n]+?)['"]?`, 'i'),
          new RegExp(`where\\s+${fName}\\s*<\\s*['"]?([^\\s'"\\n]+?)['"]?`, 'i'),
          new RegExp(`\\b${fName}\\s+is\\s+['"]?([^\\s'"\\n]+?)['"]?`, 'i'),
          new RegExp(`\\b${fName}\\s+['"]?([^\\s'"\\n]+?)['"]?(?:\\s|$)`, 'i')
        ];

        for (const pattern of patterns) {
          const match = userQuery.match(pattern);
          if (match && match[1]) {
            let value = match[1].trim().replace(/^["']|["']$/g, '');
            const operator = match[0].includes('>') ? '>' : match[0].includes('<') ? '<' : '=';

            if (col.type.toUpperCase().includes('INT')) {
              const parsed = parseInt(value);
              if (!isNaN(parsed)) {
                whereClause = `WHERE "${colName}" ${operator} ${parsed}`;
                break;
              }
            } else if (col.type.toUpperCase().includes('REAL')) {
              const parsed = parseFloat(value);
              if (!isNaN(parsed)) {
                whereClause = `WHERE "${colName}" ${operator} ${parsed}`;
                break;
              }
            } else {
              // Use case-insensitive comparison for strings
              whereClause = `WHERE LOWER("${colName}") ${operator} LOWER('${value.replace(/'/g, "''")}')`;
              break;
            }
          }
        }
        if (whereClause) break;
      }
      if (whereClause) break;
    }

    const query = `SELECT * FROM "${table.name}" ${whereClause} LIMIT 100`;

    return {
      type: 'sql',
      query: query,
      queryType: 'SELECT',
      explanation: `Retrieving filtered records from ${table.name}${whereClause ? ' with conditions' : ''}`
    };
  }

  /**
   * Generate suggestions for clarification
   */
  generateSuggestions(clarification, schema) {
    const suggestions = [];

    if (clarification.toLowerCase().includes('table')) {
      schema.tables.forEach(table => {
        suggestions.push({
          label: table.name,
          value: table.name,
          description: `${table.columns.length} columns, ${table.rowCount} rows`
        });
      });
    }

    return suggestions;
  }

  /**
   * Validate SQL query
   */
  validateQuery(query, schema) {
    if (!query || query.length === 0) {
      return { valid: false, error: 'Empty query' };
    }

    const dangerous = ['DROP', 'TRUNCATE', 'ALTER TABLE', 'CREATE TABLE'];
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

module.exports = new NLPToSQL();
