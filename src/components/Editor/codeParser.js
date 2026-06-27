/**
 * Helper to match balanced parentheses/brackets.
 */
function extractBalancedBrackets(str, startIndex, openChar = '{', closeChar = '}') {
  let count = 0;
  let foundOpen = false;
  let start = -1;
  let inString = false;
  let stringChar = '';

  for (let i = startIndex; i < str.length; i++) {
    const char = str[i];
    if (inString) {
      if (char === stringChar && str[i - 1] !== '\\') {
        inString = false;
      }
      continue;
    } else if (char === "'" || char === '"' || char === '`') {
      inString = true;
      stringChar = char;
      continue;
    }

    if (char === openChar) {
      if (!foundOpen) {
        foundOpen = true;
        start = i;
      }
      count++;
    } else if (char === closeChar) {
      count--;
      if (foundOpen && count === 0) {
        return str.substring(start, i + 1);
      }
    }
  }
  return null;
}

/**
 * Extracts the first argument inside a useCallback function wrapper.
 */
function extractFirstArgOfUseCallback(useCallbackCode) {
  const startIndex = 'useCallback('.length;
  let countBrace = 0;
  let countParen = 1; // inside useCallback parens
  let inString = false;
  let stringChar = '';

  for (let i = startIndex; i < useCallbackCode.length; i++) {
    const char = useCallbackCode[i];
    if (inString) {
      if (char === stringChar && useCallbackCode[i - 1] !== '\\') {
        inString = false;
      }
      continue;
    } else if (char === "'" || char === '"' || char === '`') {
      inString = true;
      stringChar = char;
      continue;
    }

    if (char === '{') countBrace++;
    else if (char === '}') countBrace--;
    else if (char === '(') countParen++;
    else if (char === ')') {
      countParen--;
      if (countParen === 0) {
        return useCallbackCode.substring(startIndex, i);
      }
    } else if (char === ',' && countParen === 1 && countBrace === 0) {
      return useCallbackCode.substring(startIndex, i);
    }
  }
  return null;
}

/**
 * Extracts the third argument (the transform callback) from a useMotionSubscriber call.
 */
function extractThirdArgument(code, startIndex) {
  let count = 1;
  let start = startIndex;
  let inString = false;
  let stringChar = '';

  for (let i = startIndex; i < code.length; i++) {
    const char = code[i];
    if (inString) {
      if (char === stringChar && code[i - 1] !== '\\') {
        inString = false;
      }
      continue;
    } else if (char === "'" || char === '"' || char === '`') {
      inString = true;
      stringChar = char;
      continue;
    }

    if (char === '(') count++;
    else if (char === ')') {
      count--;
      if (count === 0) {
        return code.substring(start, i);
      }
    } else if (char === ',' && count === 1) {
      return code.substring(start, i);
    }
  }
  return null;
}

/**
 * Locates the variable/function declaration block for a given variable name.
 */
export function findVariableDeclaration(code, varName, searchIndex = code.length) {
  const declRegexs = [
    new RegExp(`const\\s+${varName}\\s*=`, 'g'),
    new RegExp(`let\\s+${varName}\\s*=`, 'g'),
    new RegExp(`var\\s+${varName}\\s*=`, 'g'),
    new RegExp(`function\\s+${varName}\\s*\\(`, 'g')
  ];

  let bestMatch = null;
  let bestStart = -1;

  for (const r of declRegexs) {
    r.lastIndex = 0;
    let match;
    while ((match = r.exec(code)) !== null) {
      if (match.index < searchIndex && match.index > bestStart) {
        bestStart = match.index;
        bestMatch = match;
      }
    }
  }

  if (bestMatch) {
    const start = bestStart;
    let braceCount = 0;
    let parenCount = 0;
    let inString = false;
    let stringChar = '';

    let i = start;
    for (; i < code.length; i++) {
      const char = code[i];
      if (inString) {
        if (char === stringChar && code[i - 1] !== '\\') {
          inString = false;
        }
        continue;
      } else if (char === "'" || char === '"' || char === '`') {
        inString = true;
        stringChar = char;
        continue;
      }

      if (char === '{') braceCount++;
      else if (char === '}') {
        braceCount--;
        if (braceCount === 0 && code.substring(start, start + 8) === 'function') {
          i++;
          break;
        }
      } else if (char === '(') parenCount++;
      else if (char === ')') parenCount--;
      else if (char === ';' && braceCount === 0 && parenCount === 0) {
        break;
      }
    }
    return code.substring(start, i + 1);
  }
  return null;
}

/**
 * Clean and isolate raw function body from wrappers (like variable assignments or useCallback).
 */
export function cleanFunctionBody(declCode) {
  let clean = declCode.trim();
  if (clean.endsWith(';')) {
    clean = clean.substring(0, clean.length - 1).trim();
  }

  const assignmentMatch = /^const\s+\w+\s*=\s*/.exec(clean) ||
                          /^let\s+\w+\s*=\s*/.exec(clean) ||
                          /^var\s+\w+\s*=\s*/.exec(clean);
  if (assignmentMatch) {
    clean = clean.substring(assignmentMatch[0].length).trim();
  }

  if (clean.startsWith('useCallback(')) {
    const firstArg = extractFirstArgOfUseCallback(clean);
    if (firstArg) {
      clean = firstArg.trim();
    }
  }

  return clean;
}

/**
 * Parses and extracts scene configurations matching `const xxxScene = { ... }`.
 */
export function parseSceneConfigs(code) {
  const scenes = {};
  const regex = /(?:const|let|var)\s+(\w+Scene)\s*=\s*/g;
  let match;

  while ((match = regex.exec(code)) !== null) {
    const sceneName = match[1];
    const startIndex = regex.lastIndex;
    const braceContent = extractBalancedBrackets(code, startIndex, '{', '}');
    if (braceContent) {
      try {
        const evaluated = new Function(`return (${braceContent})`)();
        scenes[sceneName] = evaluated;
      } catch (e) {
        console.error(`Failed to parse scene config for ${sceneName}:`, e);
      }
    }
  }
  return Object.keys(scenes).length > 0 ? scenes : null;
}

/**
 * Extracts all Subscriber transformFn callback codes mapped to elementIds.
 */
export function parseTransformFns(code) {
  const transforms = {};
  const subscriberRegex = /useMotionSubscriber\s*\(\s*['"`]([^'"`]+)['"`]\s*,\s*[^,]+\s*,\s*/g;
  let match;

  while ((match = subscriberRegex.exec(code)) !== null) {
    const elementId = match[1];
    const startIndex = subscriberRegex.lastIndex;
    const argContent = extractThirdArgument(code, startIndex);
    if (!argContent) continue;

    const trimmedArg = argContent.trim();
    if (/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(trimmedArg)) {
      const declCode = findVariableDeclaration(code, trimmedArg, startIndex);
      if (declCode) {
        transforms[elementId] = cleanFunctionBody(declCode);
      }
    } else {
      transforms[elementId] = cleanFunctionBody(trimmedArg);
    }
  }
  return transforms;
}

/**
 * Validates javascript/JSX syntax.
 */
export function validateCode(code) {
  if (typeof window !== 'undefined' && window.Babel) {
    try {
      window.Babel.transform(code, {
        presets: ['react'],
      });
      return { valid: true, error: null };
    } catch (e) {
      return {
        valid: false,
        error: {
          message: e.message,
          loc: e.loc ? { line: e.loc.line, column: e.loc.column } : null
        }
      };
    }
  }

  // Node (Vitest/Fallback)
  try {
    new Function(code);
    return { valid: true, error: null };
  } catch (e) {
    return {
      valid: false,
      error: {
        message: e.message,
        loc: null
      }
    };
  }
}

/**
 * Strips ES6/JSX import statements from code so they don't break transpilation or sandboxed execution.
 */
export function stripImports(code) {
  return code
    .replace(/import\s+[\s\S]*?from\s+['"`][^'"`]+['"`];?/g, '')
    .replace(/import\s+['"`][^'"`]+['"`];?/g, '');
}

/**
 * Strips ES6 export keywords, converting 'export default' into a local variable assignment.
 */
export function stripExports(code) {
  return code
    .replace(/export\s+default\s+function/g, 'const defaultExport = function')
    .replace(/export\s+default\s+class/g, 'const defaultExport = class')
    .replace(/export\s+default\s+/g, 'const defaultExport = ')
    .replace(/export\s+(const|let|var|function|class)/g, '$1');
}
