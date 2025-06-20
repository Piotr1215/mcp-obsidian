// Pure functional search operators implementation

/**
 * Tokenize a search query into tokens
 * @param {string} query - The search query
 * @returns {Array} Array of tokens
 */
const tokenizeQuery = (query) => {
  if (!query || !query.trim()) return [];
  
  const tokens = [];
  let i = 0;
  
  while (i < query.length) {
    // Skip whitespace
    if (/\s/.test(query[i])) {
      i++;
      continue;
    }
    
    // Handle quoted strings
    if (query[i] === '"') {
      const start = i + 1;
      i++;
      while (i < query.length && query[i] !== '"') {
        i++;
      }
      if (i < query.length) {
        const value = query.slice(start, i);
        tokens.push({ type: 'TERM', value });
        i++; // Skip closing quote
      }
      continue;
    }
    
    // Handle parentheses
    if (query[i] === '(') {
      tokens.push({ type: 'LPAREN' });
      i++;
      continue;
    }
    if (query[i] === ')') {
      tokens.push({ type: 'RPAREN' });
      i++;
      continue;
    }
    
    // Handle minus as NOT
    if (query[i] === '-' && i + 1 < query.length && /\S/.test(query[i + 1])) {
      tokens.push({ type: 'NOT' });
      i++;
      continue;
    }
    
    // Collect word
    const start = i;
    while (i < query.length && /\S/.test(query[i]) && 
           query[i] !== '"' && query[i] !== '(' && query[i] !== ')') {
      i++;
    }
    
    const word = query.slice(start, i);
    
    // Check for operators
    if (word === 'AND' || word === '&&') {
      tokens.push({ type: 'AND' });
    } else if (word === 'OR' || word === '||') {
      tokens.push({ type: 'OR' });
    } else if (word === 'NOT') {
      tokens.push({ type: 'NOT' });
    } else if (word.includes(':')) {
      // Field specifier
      const colonIndex = word.indexOf(':');
      const field = word.slice(0, colonIndex);
      let value = word.slice(colonIndex + 1);
      
      if (field && value) {
        // Handle quoted field values
        if (value.startsWith('"')) {
          // Check if we need to continue reading for the closing quote
          const quotedContent = value.slice(1); // Remove opening quote
          if (!quotedContent.includes('"')) {
            // Need to continue reading until closing quote
            let fullValue = quotedContent;
            while (i < query.length && query[i] !== '"') {
              if (/\s/.test(query[i])) {
                fullValue += query[i];
              } else {
                const wordStart = i;
                while (i < query.length && query[i] !== '"' && /\S/.test(query[i])) {
                  i++;
                }
                fullValue += query.slice(wordStart, i);
              }
            }
            if (i < query.length && query[i] === '"') {
              tokens.push({ type: 'FIELD', field: field.toLowerCase(), value: fullValue });
              i++; // Skip closing quote
            }
          } else {
            // Quote is closed within the word
            const endQuoteIndex = quotedContent.indexOf('"');
            tokens.push({ type: 'FIELD', field: field.toLowerCase(), value: quotedContent.slice(0, endQuoteIndex) });
          }
        } else {
          tokens.push({ type: 'FIELD', field: field.toLowerCase(), value });
        }
      } else if (field && !value && i < query.length && query[i] === '"') {
        // Handle case like title:"quoted value"
        i++; // Skip opening quote
        const quotedStart = i;
        while (i < query.length && query[i] !== '"') {
          i++;
        }
        if (i < query.length) {
          const quotedValue = query.slice(quotedStart, i);
          tokens.push({ type: 'FIELD', field: field.toLowerCase(), value: quotedValue });
          i++; // Skip closing quote
        }
      }
    } else {
      tokens.push({ type: 'TERM', value: word });
    }
  }
  
  // Insert implicit AND operators between adjacent terms
  const finalTokens = [];
  for (let j = 0; j < tokens.length; j++) {
    finalTokens.push(tokens[j]);
    
    // Add implicit AND between terms, fields, and after RPAREN if followed by term
    if (j < tokens.length - 1) {
      const current = tokens[j];
      const next = tokens[j + 1];
      
      const needsAnd = (
        (current.type === 'TERM' || current.type === 'FIELD' || current.type === 'RPAREN') &&
        (next.type === 'TERM' || next.type === 'FIELD' || next.type === 'LPAREN' || next.type === 'NOT')
      );
      
      if (needsAnd) {
        finalTokens.push({ type: 'AND' });
      }
    }
  }
  
  return finalTokens;
};

/**
 * Build search expression tree from tokens
 * @param {Array} tokens - Array of tokens
 * @returns {Object|null} Expression tree
 */
const buildSearchExpression = (tokens) => {
  if (!tokens || tokens.length === 0) return null;
  
  // Shunting yard algorithm to handle operator precedence and parentheses
  const outputQueue = [];
  const operatorStack = [];
  const precedence = { 'NOT': 3, 'AND': 2, 'OR': 1 };
  
  for (const token of tokens) {
    if (token.type === 'TERM' || token.type === 'FIELD') {
      outputQueue.push(token);
    } else if (token.type === 'NOT') {
      operatorStack.push(token);
    } else if (token.type === 'AND' || token.type === 'OR') {
      while (operatorStack.length > 0 && 
             operatorStack[operatorStack.length - 1].type !== 'LPAREN' &&
             precedence[operatorStack[operatorStack.length - 1].type] >= precedence[token.type]) {
        outputQueue.push(operatorStack.pop());
      }
      operatorStack.push(token);
    } else if (token.type === 'LPAREN') {
      operatorStack.push(token);
    } else if (token.type === 'RPAREN') {
      while (operatorStack.length > 0 && operatorStack[operatorStack.length - 1].type !== 'LPAREN') {
        outputQueue.push(operatorStack.pop());
      }
      if (operatorStack.length > 0 && operatorStack[operatorStack.length - 1].type === 'LPAREN') {
        operatorStack.pop(); // Remove LPAREN
      }
    }
  }
  
  // Pop remaining operators
  while (operatorStack.length > 0) {
    outputQueue.push(operatorStack.pop());
  }
  
  // Build expression tree from RPN
  const stack = [];
  
  for (const token of outputQueue) {
    if (token.type === 'TERM' || token.type === 'FIELD') {
      stack.push(token);
    } else if (token.type === 'NOT') {
      if (stack.length < 1) {
        throw new Error('Invalid syntax: NOT requires an operand');
      }
      const operand = stack.pop();
      stack.push({ type: 'NOT', operand });
    } else if (token.type === 'AND' || token.type === 'OR') {
      if (stack.length < 2) {
        throw new Error(`Invalid syntax: ${token.type} requires two operands`);
      }
      const right = stack.pop();
      const left = stack.pop();
      stack.push({ type: token.type, left, right });
    }
  }
  
  if (stack.length !== 1) {
    throw new Error('Invalid syntax: expression not well-formed');
  }
  
  return stack[0];
};

/**
 * Evaluate expression against content and metadata
 * @param {Object|null} expression - Expression tree
 * @param {string} content - Content to search
 * @param {Object} metadata - Metadata (title, tags, etc.)
 * @returns {boolean} Whether expression matches
 */
const evaluateExpression = (expression, content, metadata = {}) => {
  if (!expression) return true;
  
  const contentLower = content.toLowerCase();
  const titleLower = (metadata.title || '').toLowerCase();
  const tags = metadata.tags || [];
  const tagsLower = tags.map(t => t.toLowerCase());
  
  switch (expression.type) {
    case 'TERM': {
      const termLower = expression.value.toLowerCase();
      return contentLower.includes(termLower) || 
             titleLower.includes(termLower) ||
             tagsLower.some(tag => tag.includes(termLower));
    }
    
    case 'FIELD': {
      const valueLower = expression.value.toLowerCase();
      switch (expression.field) {
        case 'title':
          return titleLower.includes(valueLower);
        case 'content':
          return contentLower.includes(valueLower);
        case 'tag':
          return tagsLower.some(tag => tag.includes(valueLower));
        default:
          return false;
      }
    }
    
    case 'AND':
      return evaluateExpression(expression.left, content, metadata) &&
             evaluateExpression(expression.right, content, metadata);
    
    case 'OR':
      return evaluateExpression(expression.left, content, metadata) ||
             evaluateExpression(expression.right, content, metadata);
    
    case 'NOT':
      return !evaluateExpression(expression.operand, content, metadata);
    
    default:
      return false;
  }
};

/**
 * Parse search query into expression tree
 * @param {string} query - Search query
 * @returns {Object|null} Expression tree
 */
const parseSearchQuery = (query) => {
  const tokens = tokenizeQuery(query);
  return buildSearchExpression(tokens);
};

export {
  parseSearchQuery,
  tokenizeQuery,
  buildSearchExpression,
  evaluateExpression
};