const path = require('path');

// Try to load Babel for ES6 import transformation (optional dependency)
let babel;
try {
  babel = require('@babel/core');
} catch (e) {
  // Babel not available, will fall back to require-only mode
}

module.exports = {
  name: 'Code',
  displayName: 'Code',
  description: 'Execute custom JavaScript code',
  color: '#6366f1', // Indigo
  bgColor: '#eef2ff',
  borderColor: '#c7d2fe',
  icon: 'fas fa-code',
  category: 'logic',
  inputs: ['context'],
  outputs: ['context'],
  parameters: [
    {
      name: 'code',
      type: 'code',
      language: 'javascript',
      required: true,
      description: 'JavaScript code to execute'
    }
  ],

  async execute(context, params, helpers) {
    const code = (params && params.code) || `
// Import packages (both CommonJS and ES modules supported)
// const axios = require('axios');        // CommonJS
// const fetch = require('node-fetch');   // ES module (auto-handled)
// const fs = require('fs');              // Built-in module

// Import tools from the tools/ directory:
// const myTool = require('tools/myTool');     // Loads tools/myTool.js
// const { helper } = require('tools/utils');  // Destructure from tools/utils.js

// ES6 import syntax (auto-transformed to require):
// import myTool from 'tools/myTool';          // Default import
// import { helper, utils } from 'tools/utils'; // Named imports
// import axios from 'axios';                  // Package imports

// For pure ES modules, use dynamicImport:
// const fetch = await dynamicImport('node-fetch');

async function handler(context, console, tools) {
  console.log("Hello from code node!", context);
  
  // Access tools via the tools parameter:
  // console.log("Available tools:", Object.keys(tools));
  
  // Or require tools directly:
  // const myTool = require('tools/myTool');
  
  return context;
}
`;

    // Create a custom console that logs to our helpers
    const customConsole = {
      log: (...args) => {
        const message = args.map(arg => {
          if (typeof arg === 'object' && arg !== null) {
            try {
              return JSON.stringify(arg, null, 2);
            } catch (e) {
              return '[Object: ' + Object.prototype.toString.call(arg) + ']';
            }
          }
          return String(arg);
        }).join(' ');

        if (helpers && Array.isArray(helpers.logs)) {
          const ts = new Date().toISOString();
          const nodeId = helpers.nodeId || 'unknown';

          // Also log to server console for debugging
          console.log(`[CODE LOG] ${nodeId}:`, message);

          const logLine = `[${ts}] [${nodeId}] ${message}`;
          helpers.logs.push(logLine);
          
          // Emit log in real-time if emitter is available
          if (helpers.logEmitter) {
            console.log(`[CODE LOG EMIT] ${nodeId}:`, logLine);
            helpers.logEmitter.emit('log', logLine);
          }
        }
      }
    };

    try {
      // Transform ES6 import syntax to require() if Babel is available
      let processedCode = code;
      if (babel && code.includes('import ')) {
        try {
          const transformed = babel.transformSync(code, {
            plugins: [
              ['@babel/plugin-transform-modules-commonjs', {
                strictMode: false,
                importInterop: 'babel'
              }]
            ]
          });
          processedCode = transformed.code;
          console.log('✅ Transformed ES6 imports to CommonJS');
          console.log('Original code:', code.substring(0, 200) + '...');
          console.log('Transformed code:', processedCode.substring(0, 200) + '...');
        } catch (transformError) {
          console.warn('❌ Failed to transform ES6 imports:', transformError.message);
          console.log('Babel available:', !!babel);
        }
      } else {
        if (!babel) {
          console.log('ℹ️  Babel not available - install @babel/core and @babel/plugin-transform-modules-commonjs for ES6 import support');
        }
        if (!code.includes('import ')) {
          console.log('ℹ️  No import statements detected in code');
        }
      }

      // Create an enhanced require function that handles both CommonJS, ES modules, and tools
      const enhancedRequire = (moduleName) => {
        try {
          // Handle tools/ prefix - resolve to actual tools directory
          if (moduleName.startsWith('tools/')) {
            const toolName = moduleName.replace('tools/', '');
            const toolsDir = helpers.toolsDir || path.join(__dirname, '..', 'tools');
            
            // Try different extensions: .js, .mjs
            const possiblePaths = [
              path.join(toolsDir, toolName + '.js'),
              path.join(toolsDir, toolName + '.mjs'),
              path.join(toolsDir, toolName)
            ];
            
            for (const toolPath of possiblePaths) {
              try {
                // For .mjs files, use dynamic import
                if (toolPath.endsWith('.mjs')) {
                  // Return a promise that resolves to the ES module
                  return import(toolPath);
                }
                
                // For .js files, use require with cache clearing
                try { delete require.cache[require.resolve(toolPath)]; } catch (e) {}
                
                const module = require(toolPath);
                
                // Handle ES modules that have been transpiled to CommonJS
                if (module && typeof module === 'object' && module.__esModule && module.default) {
                  return module.default;
                }
                
                return module;
              } catch (e) {
                // Try next path
                continue;
              }
            }
            
            throw new Error(`Tool '${toolName}' not found in tools directory`);
          }
          
          // Handle regular modules
          const module = require(moduleName);

          // Handle ES modules that have been transpiled to CommonJS
          if (module && typeof module === 'object' && module.__esModule && module.default) {
            return module.default;
          }

          return module;
        } catch (error) {
          throw new Error(`Module '${moduleName}' could not be loaded: ${error.message}`);
        }
      };

      // Execute the user's complete function code
      // This allows them to import packages and write full functions
      // We expose a `tools` parameter so the user's handler can access project-level tools:
      const fn = new Function('context', 'console', 'require', 'dynamicImport', 'tools', `
        ${processedCode}
        
        // If they defined a handler function, call it
        if (typeof handler === 'function') {
          return handler(context, console, tools);
        }
        
        // Otherwise, return context as fallback
        return context;
      `);
      
      // Provide dynamic import functionality
      const dynamicImport = async (moduleName) => {
        return await import(moduleName);
      };
      
      // Pass the tools object from helpers (if provided) so user code can reference tools.<name>
      const toolsObj = (helpers && helpers.tools) ? helpers.tools : {};
      const result = await fn({ ...(context || {}) }, customConsole, enhancedRequire, dynamicImport, toolsObj);
      // Preserve explicit `null` returned by user handler so the runtime can treat it
      // as a stop signal. If the handler returns `undefined` (no return) we keep the
      // previous behavior of passing through the existing context.
      if (result === undefined) {
        return context;
      }
      return result;
    } catch (error) {
      if (helpers && Array.isArray(helpers.logs)) {
        const ts = new Date().toISOString();
        helpers.logs.push(`[${ts}] CODE ERROR: ${error.message}`);
      }
      throw error;
    }
  }
};