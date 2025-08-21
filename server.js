import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const dotenv = require("dotenv")
dotenv.config()
const fs = require('fs');
const path = require('path');
const express = require("express")
const {exchangeShortLivedToken, exchangeLongLivedToken} = require("./igtokens.js")
const {checkContentPublishingLimit, createInstagramPost} = require("./tools/instagram.js")

const app = express();
app.use(express.json({ limit: '1mb' }));

const projectRoot = path.resolve();
const configPath = path.join(projectRoot, 'n4n.config.json');
const workflowPath = path.join(projectRoot, 'workflow.json');
const cachePath = path.join(projectRoot, 'workflow-cache.json');
const nodesDir = path.join(projectRoot, 'nodes');
const toolsDir = path.join(projectRoot, 'tools');
const outputsDir = path.join(projectRoot, 'outputs');
// Serve outputs from an absolute path to avoid CWD-related 404s
app.use("/outputs", express.static(outputsDir))
// Serve public assets and choose which app to show based on APP_MODE (defaults to 'dev')
app.use(express.static(path.join(projectRoot, 'public'), { index: false }));

const APP_MODE = process.env.APP_MODE || process.env.NODE_ENV || 'dev';
app.get('/', (req, res) => {
  if (APP_MODE === 'production') {
    // Serve the React dashboard in production mode
    res.sendFile(path.join(projectRoot, 'public', 'dashboard.html'));
  } else {
    // Serve the workflow editor in dev mode (default)
    res.sendFile(path.join(projectRoot, 'public', 'index.html'));
  }
});
// Simple dashboard authentication (hard-coded credentials)
// Credentials can also be set via environment variables for flexibility
const AUTH_USERNAME = process.env.DASH_USERNAME || 'victry';
const AUTH_PASSWORD = process.env.DASH_PASSWORD || 'ubkjovuh';

// In-memory session store: token -> {username, expiresAt, instagram_user_id?, instagram_access_token?}
const dashboardSessions = new Map();
function generateToken() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

// Login endpoint for dashboard clients
app.post('/api/dashboard-login', (req, res) => {
  const { username, password } = req.body || {};
  if (username === AUTH_USERNAME && password === AUTH_PASSWORD) {
    const token = generateToken();
    const expiresAt = Date.now() + (1000 * 60 * 60); // 1 hour
    dashboardSessions.set(token, { username, expiresAt });
    return res.json({ ok: true, token, expiresAt });
  }
  return res.status(401).json({ ok: false, error: 'Invalid credentials' });
});

// Get current user session info including Instagram status
app.get('/api/dashboard/user', requireDashboardAuth, (req, res) => {
  const token = req.headers['x-dashboard-token'] || (req.headers.authorization && req.headers.authorization.replace(/^Bearer\s+/i, ''));
  const session = dashboardSessions.get(token);
  
  console.log('🔍 Fetching user info for token:', token?.substring(0, 8) + '...');
  console.log('🔍 Session data:', {
    username: session?.username,
    has_ig_user_id: !!session?.instagram_user_id,
    has_ig_access_token: !!session?.instagram_access_token,
    ig_user_id: session?.instagram_user_id,
    session_exists: !!session
  });
  
  const userInfo = {
    username: session.username,
    instagram_connected: !!(session.instagram_user_id && session.instagram_access_token),
    instagram_user_id: session.instagram_user_id || null
  };
  
  console.log('Returning user info:', userInfo);
  
  res.json({
    ok: true,
    user: userInfo
  });
});

// Simple token validation middleware
function requireDashboardAuth(req, res, next) {
  const token = req.headers['x-dashboard-token'] || (req.headers.authorization && req.headers.authorization.replace(/^Bearer\s+/i, ''));
  if (!token) return res.status(401).json({ ok: false, error: 'Missing token' });
  const session = dashboardSessions.get(token);
  if (!session) return res.status(401).json({ ok: false, error: 'Invalid token' });
  if (session.expiresAt < Date.now()) {
    dashboardSessions.delete(token);
    return res.status(401).json({ ok: false, error: 'Token expired' });
  }
  // refresh expiry
  session.expiresAt = Date.now() + (1000 * 60 * 60);
  dashboardSessions.set(token, session);
  req.dashboardUser = session.username;
  next();
}

// Endpoint clients use to trigger the workflow from the dashboard
// Expects JSON: { mode: 'notes'|'url', notes?: string, url?: string }
app.post('/api/client/run', requireDashboardAuth, async (req, res) => {
  try {
    const payload = req.body || {};
    const mode = payload.mode;
    if (!['notes', 'url'].includes(mode)) {
      return res.status(400).json({ ok: false, error: 'Invalid mode' });
    }
    const originalWorkflow = JSON.parse(fs.readFileSync(workflowPath, 'utf8'));
    const startNodeId = 'node-buaiw';
    // Build a subworkflow containing downstream nodes from node-buaiw
    const subWorkflow = getWorkflowFromNode(originalWorkflow, startNodeId);
    // Build starting context from client input, explicitly unset instagram fields
    const startingContext = {};
    if (mode === 'notes') startingContext.notes = String(payload.notes || '');
    if (mode === 'url') startingContext.url = String(payload.url || '');
    startingContext.instagram_user_id = undefined;
    startingContext.instagram_access_token = undefined;
    // Execute the subworkflow, forcing the starting context for the start node
    const result = await executeWorkflow(subWorkflow, {
      useCache: false,
      startNodeId,
      originalWorkflow,
      forceStartContext: { [startNodeId]: startingContext }
    });
    // Extract saveId and caption from any sink output context first
    let saveId = null;
    let caption = null;
    const sinkOutputs = result && result.outputs ? Object.values(result.outputs) : [];
    for (const ctx of sinkOutputs) {
      if (ctx && (ctx.saveId !== undefined && ctx.saveId !== null)) {
        saveId = String(ctx.saveId);
      }
      if (ctx && ctx.caption) {
        caption = ctx.caption;
      }
    }

    // Fallback: parse logs for execution order and read cache to find a saveId and caption
    if (!saveId || !caption) {
      try {
        const completedOrder = [];
        for (const line of (result && result.logs) || []) {
          const m = /Completed\s+.*\(([^)]+)\)/.exec(line);
          if (m && m[1]) completedOrder.push(m[1]);
        }
        const cache = loadCache();
        // try last executed node first
        const candidates = completedOrder.slice().reverse();
        for (const nodeId of candidates) {
          const out = cache && cache[nodeId] && cache[nodeId].output;
          if (!saveId && out && (out.saveId !== undefined && out.saveId !== null)) {
            saveId = String(out.saveId);
          }
          if (!caption && out && out.caption) {
            caption = out.caption;
          }
          if (saveId && caption) break;
        }
      } catch (e) {
        // ignore
      }
    }

    // If we found a saveId, list files under outputs/<saveId>
    let files = [];
    if (saveId) {
      try {
        const dir = path.join(outputsDir, saveId);
        if (fs.existsSync(dir)) {
          const entries = fs.readdirSync(dir);
          files = entries.map(f => `/outputs/${saveId}/${f}`);
        }
      } catch (e) {
        //console.log(" testing 5; dir doesn't exist", e)
        // Non-fatal; just omit files
      }
    }

    return res.json({ ok: true, result, saveId, files, caption });
  } catch (e) {
    console.error('Client run error:', e && e.stack || e);
    return res.status(500).json({ ok: false, error: String(e && e.message ? e.message : e) });
  }
});

// List output files for a given saveId
app.get('/api/client/outputs/:saveId', requireDashboardAuth, (req, res) => {
  try {
    const saveId = String(req.params.saveId || '').trim();
    if (!saveId) return res.status(400).json({ ok: false, error: 'Missing saveId' });
    const dir = path.join(outputsDir, saveId);
    if (!fs.existsSync(dir)) return res.json({ ok: true, files: [] });
    const entries = fs.readdirSync(dir).filter(f => /\.(png|jpe?g|gif|webp)$/i.test(f));
    entries.sort((a, b) => {
      const na = Number((a.match(/^(\d+)/) || [])[1]);
      const nb = Number((b.match(/^(\d+)/) || [])[1]);
      if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
      return a.localeCompare(b);
    });
    const files = entries.map(f => `/outputs/${saveId}/${f}`);
    res.json({ ok: true, files });
  } catch (e) {
    res.status(500).json({ ok: false, error: 'Failed to list outputs', details: String(e) });
  }
});

function loadConfig() {
  try {
    const raw = fs.readFileSync(configPath, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    return { projectName: 'n4n-workflow', port: 3000 };
  }
}

function loadCache() {
  try {
    const raw = fs.readFileSync(cachePath, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    return {};
  }
}

function saveCache(cache) {
  try {
    fs.writeFileSync(cachePath, JSON.stringify(cache, null, 2));
  } catch (e) {
    console.error('Failed to save cache:', e);
  }
}

function getNodeHash(node) {
  // Create a hash of the node's code and parameters to detect changes
  return JSON.stringify({ type: node.type, params: node.params });
}

function isCacheValid(cache, nodeId, node, workflow) {
  if (!cache[nodeId]) return false;
  
  const cached = cache[nodeId];
  const currentHash = getNodeHash(node);
  
  // Check if node itself has changed
  if (cached.nodeHash !== currentHash) return false;
  
  // Check if any upstream nodes have changed (simplified check)
  // In a full implementation, we'd do a proper dependency graph traversal
  return true;
}

function getWorkflowFromNode(workflow, startNodeId) {
  // Create a subworkflow that includes the start node and all downstream nodes
  const visited = new Set();
  const nodesToInclude = new Set();
  const edgesToInclude = [];
  
  // Build adjacency list
  const outgoing = new Map();
  for (const node of workflow.nodes) {
    outgoing.set(node.id, []);
  }
  for (const edge of workflow.edges || []) {
    outgoing.get(edge.from).push(edge.to);
  }
  
  // DFS to find all downstream nodes
  function dfs(nodeId) {
    if (visited.has(nodeId)) return;
    visited.add(nodeId);
    nodesToInclude.add(nodeId);
    
    for (const childId of outgoing.get(nodeId) || []) {
      dfs(childId);
      edgesToInclude.push({ from: nodeId, to: childId });
    }
  }
  
  dfs(startNodeId);
  
  // Filter nodes and edges
  const filteredNodes = workflow.nodes.filter(n => nodesToInclude.has(n.id));
  
  // Remove any incoming edges to the start node so it can be executed first
  const filteredEdges = edgesToInclude.filter(edge => edge.to !== startNodeId);
  
  console.log(`Filtered edges: ${edgesToInclude.length} -> ${filteredEdges.length} (removed incoming edges to start node)`);
  
  return {
    nodes: filteredNodes,
    edges: filteredEdges
  };
}

function logWithTime(logs, message, logEmitter = null) {
  const ts = new Date().toISOString();
  const logLine = `[${ts}] ${message}`;
  logs.push(logLine);
  
  // Emit log in real-time if emitter is provided
  if (logEmitter) {
    logEmitter.emit('log', logLine);
  }
}

function renderTemplateString(template, context) {
  if (typeof template !== 'string') return String(template);
  
  return template.replace(/\{\{\s*([^}]+)\s*\}\}/g, (match, expression) => {
    try {
      // Create a safe evaluation context with common utilities
      const safeContext = {
        ...context,
        JSON: {
          stringify: (obj, replacer, space) => JSON.stringify(obj, replacer, space),
          parse: (str) => JSON.parse(str)
        },
        Math: Math,
        Date: Date,
        String: String,
        Number: Number,
        Boolean: Boolean,
        Array: Array,
        Object: Object
      };
      
      // Create a function that evaluates the expression in the safe context
      const func = new Function(...Object.keys(safeContext), `return ${expression}`);
      const result = func(...Object.values(safeContext));
      
      return String(result);
    } catch (error) {
      // If evaluation fails, try simple property access (backward compatibility)
      if (expression.match(/^[\w.]+$/)) {
        const parts = expression.split('.');
        let value = context;
        for (const p of parts) {
          if (value && typeof value === 'object' && p in value) {
            value = value[p];
          } else {
            return '';
          }
        }
        return String(value);
      }
      
      // If all else fails, return the original expression with error indicator
      console.warn(`Template expression error: ${error.message} in "${expression}"`);
      return `[Error: ${expression}]`;
    }
  });
}

async function executeWorkflow(workflow, options = {}) {
  const logs = [];
  const cache = loadCache();
  const useCache = options.useCache !== false; // Default to true
  const logEmitter = options.logEmitter; // Optional event emitter for streaming logs

  // Load node modules
  const nodeTypeToModule = new Map();
  for (const file of fs.readdirSync(nodesDir)) {
    if (!file.endsWith('.js')) continue;
    const mod = require(path.join(nodesDir, file));
    if (!mod || !mod.name || typeof mod.execute !== 'function') {
      continue;
    }
    nodeTypeToModule.set(mod.name, mod);
  }

  // Load tools fresh for this workflow execution (no require cache)
  const tools = {};
  try {
    if (fs.existsSync(toolsDir)) {
      for (const file of fs.readdirSync(toolsDir)) {
        if (!file.endsWith('.js')) continue;
        try {
          const modulePath = path.join(toolsDir, file);
          // Clear require cache so tools are re-run each execution
          try { delete require.cache[require.resolve(modulePath)]; } catch (e) {}
          const mod = require(modulePath);
          // If the exported value is a function, call it (support factory-style tools).
          // Await the result in case it returns a Promise.
          const instance = typeof mod === 'function' ? await Promise.resolve(mod()) : mod;
          const name = path.basename(file, '.js');
          tools[name] = instance;
        } catch (e) {
          logWithTime(logs, `WARNING: Failed to load tool ${file}: ${e.message}`);
        }
      }
    }
  } catch (e) {
    console.warn('Tools loading failed:', e && e.message);
  }

  const nodesById = new Map(workflow.nodes.map(n => [n.id, n]));
  const incoming = new Map();
  const outgoing = new Map();
  const indegree = new Map();

  for (const node of workflow.nodes) {
    incoming.set(node.id, []);
    outgoing.set(node.id, []);
    indegree.set(node.id, 0);
  }
  for (const edge of workflow.edges || []) {
    outgoing.get(edge.from).push(edge.to);
    incoming.get(edge.to).push(edge.from);
    indegree.set(edge.to, (indegree.get(edge.to) || 0) + 1);
  }

  const pendingIncomingCount = new Map();
  for (const [id, incomers] of incoming.entries()) {
    pendingIncomingCount.set(id, incomers.length);
  }

  const collectedContexts = new Map(); // nodeId -> Array<context>
  for (const node of workflow.nodes) {
    collectedContexts.set(node.id, []);
  }

  // Track in-flight tasks so we can await dynamic scheduling
  let inFlight = 0;
  let resolveDone;
  const donePromise = new Promise((res) => { resolveDone = res; });
  // If a node handler returns `null` we treat that as a global halt signal
  // and stop scheduling any further nodes for this workflow run.
  let haltExecution = false;

  function maybeResolve() {
    if (inFlight === 0 && resolveDone) {
      resolveDone();
    }
  }

  function scheduleNode(nodeId, mergedContext) {
    if (haltExecution) {
      logWithTime(logs, `Skipping scheduling ${nodeId} because workflow halted`, logEmitter);
      return;
    }
    const node = nodesById.get(nodeId);
    const nodeModule = nodeTypeToModule.get(node.type);

    if (!nodeModule) {
      logWithTime(logs, `ERROR: Node type module not found for type '${node.type}' (node ${nodeId})`, logEmitter);
      for (const childId of outgoing.get(nodeId)) {
        const remaining = pendingIncomingCount.get(childId) - 1;
        pendingIncomingCount.set(childId, remaining);
        if (remaining === 0) {
          const contexts = collectedContexts.get(childId);
          const merged = Object.assign({}, ...contexts);
          scheduleNode(childId, merged);
        }
      }
      return;
    }

    inFlight += 1;

    (async () => {
      try {
        let updatedContext;
        
        // Temporarily disable caching to debug execution issues
        logWithTime(logs, `Executing ${node.type} (${nodeId})`, logEmitter);
        updatedContext = await nodeModule.execute(mergedContext, node.params || {}, { logs, renderTemplateString, nodeId, tools, logEmitter });
        logWithTime(logs, `Completed ${node.type} (${nodeId})`, logEmitter);
        
        // Cache the output (but don't use it yet)
        cache[nodeId] = {
          output: updatedContext,
          nodeHash: getNodeHash(node),
          timestamp: Date.now()
        };
 
        // If the node explicitly returned `null` we treat that as a STOP signal:
        // halt scheduling any further nodes in this workflow execution.
        if (updatedContext === null) {
          logWithTime(logs, `Node ${node.type} (${nodeId}) returned null - halting further execution`, logEmitter);
          haltExecution = true;
        } else {
          for (const childId of outgoing.get(nodeId)) {
            collectedContexts.get(childId).push(updatedContext);
            const remaining = pendingIncomingCount.get(childId) - 1;
            pendingIncomingCount.set(childId, remaining);
            if (remaining === 0) {
              const contexts = collectedContexts.get(childId);
              const merged = Object.assign({}, ...contexts);
              scheduleNode(childId, merged);
            }
          }
        }
      } catch (err) {
        logWithTime(logs, `ERROR in ${node.type} (${nodeId}): ${err.message || String(err)}`, logEmitter);
        for (const childId of outgoing.get(nodeId)) {
          const remaining = pendingIncomingCount.get(childId) - 1;
          pendingIncomingCount.set(childId, remaining);
          if (remaining === 0) {
            const contexts = collectedContexts.get(childId);
            const merged = Object.assign({}, ...contexts);
            scheduleNode(childId, merged);
          }
        }
      } finally {
        inFlight -= 1;
        maybeResolve();
      }
    })();
  }

  // Start execution
  let hasStarted = false;
  
  // First try to start from Trigger nodes
  for (const node of workflow.nodes) {
    if (node.type === 'Trigger') {
      // Check if we have a forced starting context for this node
      let startingContext = {};
      if (options.forceStartContext && options.forceStartContext[node.id]) {
        startingContext = options.forceStartContext[node.id];
        console.log(`Using forced starting context for trigger node ${node.id}:`, startingContext);
      }
      scheduleNode(node.id, startingContext);
      hasStarted = true;
    }
  }
  
  // If no triggers found (e.g., in a subworkflow), start from nodes with no incoming edges
  if (!hasStarted) {
    console.log('No trigger nodes found, starting from nodes with no incoming edges');
    for (const node of workflow.nodes) {
      const incomingCount = incoming.get(node.id).length;
      if (incomingCount === 0) {
        console.log(`Starting execution from ${node.type} (${node.id})`);
        
        // Check if we have a forced starting context for this node
        let startingContext = {};
        if (options.forceStartContext && options.forceStartContext[node.id]) {
          startingContext = options.forceStartContext[node.id];
          console.log(`Using forced starting context for node ${node.id}:`, startingContext);
        } else if (useCache && cache && options.startNodeId) {
          // For "run from here", try to use cached context from upstream nodes
          // Find the original upstream nodes that would feed into the start node
          // by looking at the original workflow edges
          const originalWorkflow = options.originalWorkflow || workflow;
          const upstreamNodes = [];
          
          for (const edge of originalWorkflow.edges || []) {
            if (edge.to === options.startNodeId) {
              upstreamNodes.push(edge.from);
            }
          }
          
          console.log(`Looking for cached outputs from upstream nodes:`, upstreamNodes);
          
          // Collect cached outputs from upstream nodes
          const upstreamContexts = [];
          for (const upstreamNodeId of upstreamNodes) {
            if (cache[upstreamNodeId] && cache[upstreamNodeId].output) {
              upstreamContexts.push(cache[upstreamNodeId].output);
              console.log(`Found cached output from ${upstreamNodeId}:`, cache[upstreamNodeId].output);
            }
          }
          
          // Merge all upstream contexts (same logic as normal execution)
          if (upstreamContexts.length > 0) {
            startingContext = Object.assign({}, ...upstreamContexts);
            console.log(`Using merged cached context for starting node:`, startingContext);
          }
        }
        
        scheduleNode(node.id, startingContext);
        hasStarted = true;
      }
    }
  }

  // If still no tasks were scheduled, resolve immediately
  if (!hasStarted) {
    console.log('No starting nodes found, workflow complete');
  }
  maybeResolve();
  await donePromise;

  // Collect outputs from sink nodes (no outgoing edges)
  const sinkNodeIds = workflow.nodes
    .filter(n => (outgoing.get(n.id) || []).length === 0)
    .map(n => n.id);

  const outputs = {};
  for (const sinkId of sinkNodeIds) {
    const contexts = collectedContexts.get(sinkId);
    const merged = Object.assign({}, ...contexts);
    outputs[sinkId] = merged;
  }

  // Save cache after execution
  saveCache(cache);
  
  return { logs, outputs };
}

// Get available node types dynamically
app.get('/api/node-types', (req, res) => {
  try {
    const nodeTypes = [];
    const files = fs.readdirSync(nodesDir);
    
    console.log('Loading node types from files:', files);
    
    for (const file of files) {
      if (!file.endsWith('.js')) continue;
      
      try {
        // Clear require cache to get fresh module
        const modulePath = path.join(nodesDir, file);
        delete require.cache[require.resolve(modulePath)];
        const mod = require(modulePath);
        
        console.log(`Loaded module from ${file}:`, mod.name);
        
        if (mod && mod.name) {
          const nodeType = {
            name: mod.name,
            displayName: mod.displayName || mod.name,
            description: mod.description || `${mod.name} node`,
            color: mod.color || '#6366f1', // Default indigo color
            bgColor: mod.bgColor || '#eef2ff',
            borderColor: mod.borderColor || '#c7d2fe',
            icon: mod.icon || 'fas fa-cube',
            category: mod.category || 'general',
            inputs: mod.inputs || [],
            outputs: mod.outputs || [],
            parameters: mod.parameters || []
          };
          nodeTypes.push(nodeType);
        }
      } catch (e) {
        console.warn(`Failed to load node type from ${file}:`, e.message);
      }
    }
    
    res.json(nodeTypes);
  } catch (e) {
    res.status(500).json({ error: 'Failed to load node types', details: String(e) });
  }
});

app.get('/api/workflow', (req, res) => {
  try {
    const raw = fs.readFileSync(workflowPath, 'utf8');
    res.type('application/json').send(raw);
  } catch (e) {
    res.status(500).json({ error: 'Failed to read workflow.json', details: String(e) });
  }
});

app.post('/api/workflow', (req, res) => {
  try {
    const body = req.body;
    if (!body || !Array.isArray(body.nodes) || !Array.isArray(body.edges)) {
      return res.status(400).json({ error: 'Invalid workflow format' });
    }
    fs.writeFileSync(workflowPath, JSON.stringify(body, null, 2), 'utf8');
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Failed to write workflow.json', details: String(e) });
  }
});

app.post('/api/run', async (req, res) => {
  try {
    let workflow;

    console.log('Request body:', req.body);
    console.log('Has nodes:', req.body && req.body.nodes);
    console.log('Has edges:', req.body && req.body.edges);

    // If a workflow is provided in the request body, use it; otherwise read from file
    if (req.body && req.body.nodes && req.body.edges) {
      workflow = req.body;
      console.log('Using provided workflow with', workflow.nodes.length, 'nodes');
      console.log('Trigger nodes:', workflow.nodes.filter(n => n.type === 'Trigger').map(n => n.id));
    } else {
      console.log('No valid workflow in request body, reading from file');
      const raw = fs.readFileSync(workflowPath, 'utf8');
      workflow = JSON.parse(raw);
      console.log('Using file workflow with', workflow.nodes.length, 'nodes');
    }

    const result = await executeWorkflow(workflow);
    res.json({ ok: true, ...result });
  } catch (e) {
    res.status(500).json({ ok: false, error: 'Failed to run workflow', details: String(e) });
  }
});

// Get cache status for all nodes
app.get('/api/cache-status', (req, res) => {
  try {
    const cache = loadCache();
    const raw = fs.readFileSync(workflowPath, 'utf8');
    const workflow = JSON.parse(raw);
    
    const status = {};
    for (const node of workflow.nodes) {
      status[node.id] = {
        hasCache: !!cache[node.id],
        isValid: isCacheValid(cache, node.id, node, workflow),
        timestamp: cache[node.id]?.timestamp
      };
    }
    
    res.json({ ok: true, status });
  } catch (e) {
    res.status(500).json({ ok: false, error: 'Failed to get cache status' });
  }
});

// Instagram OAuth initiation endpoint
app.post('/api/instagram/auth', requireDashboardAuth, (req, res) => {
  const {getBaseUrl} = require("./tools/config");
  const baseUrl = getBaseUrl();
  const clientId = process.env.INSTAGRAM_APP_ID;
  const authUrl = `https://www.instagram.com/oauth/authorize?client_id=${clientId}&redirect_uri=${baseUrl}/app/redirect&response_type=code&scope=instagram_business_basic,instagram_business_manage_messages,instagram_business_manage_comments,instagram_business_content_publish,instagram_business_manage_insights`;
  
  console.log('🔗 Generated OAuth URL:', authUrl);
  res.json({ ok: true, authUrl });
});

// Instagram OAuth callback handler
app.get('/app/redirect', async (req, res) => {
  const code = req.query.code;
  const token = req.query.state; // We'll pass the dashboard token as state
  
  console.log('🔄 OAuth callback received:', { 
    code: !!code, 
    state: !!token, 
    raw_code: code?.substring(0, 20) + '...', 
    raw_state: token?.substring(0, 8) + '...',
    all_query_params: Object.keys(req.query)
  });
  
  if (!code) {
    console.error('❌ No authorization code provided');
    return res.status(400).send('Missing authorization code');
  }

  try {
    console.log('🔄 Exchanging tokens...');
    const shortLivedToken = await exchangeShortLivedToken(code);
    const longLivedToken = await exchangeLongLivedToken(shortLivedToken.access_token);

    const userId = shortLivedToken.user_id;
    const accessToken = longLivedToken;

    console.log('✅ Tokens exchanged successfully:', { userId, hasAccessToken: !!accessToken });
    console.log('🔍 Processing OAuth callback with state token:', token);
    console.log('🔍 All current sessions:', Array.from(dashboardSessions.keys()).map(k => k.substring(0, 8) + '...'));
    
    // Find the dashboard session by token (if provided in state)
    if (token) {
      const session = dashboardSessions.get(token);
      console.log('🔍 Found session for token:', token.substring(0, 8) + '...', 'exists:', !!session);
      
      if (session) {
        console.log('📝 Updating session with Instagram credentials...');
        // Update session with Instagram credentials
        session.instagram_user_id = userId;
        session.instagram_access_token = accessToken;
        dashboardSessions.set(token, session);
        
        console.log('✅ Instagram connected for user:', session.username, 'IG User ID:', userId);
        console.log('✅ Updated session data:', {
          username: session.username,
          has_ig_user_id: !!session.instagram_user_id,
          has_ig_access_token: !!session.instagram_access_token,
          ig_user_id: session.instagram_user_id
        });
        
        // Verify the session was updated
        const verifySession = dashboardSessions.get(token);
        console.log('🔍 Verification - session after update:', {
          exists: !!verifySession,
          has_ig_user_id: !!(verifySession && verifySession.instagram_user_id),
          has_ig_access_token: !!(verifySession && verifySession.instagram_access_token)
        });
      } else {
        console.error('❌ No session found for token:', token.substring(0, 8) + '...');
        console.log('🔍 Available sessions:', Array.from(dashboardSessions.keys()).map(k => k.substring(0, 8) + '...'));
      }
    } else {
      console.error('❌ No token provided in state parameter');
      console.log('🔍 Query parameters:', req.query);
    }

    // Send success message to parent window and close popup
    res.send(`
      <html>
        <head><title>Instagram Connected</title></head>
        <body>
          <div style="text-align: center; font-family: Arial, sans-serif; padding: 50px;">
            <h2>✅ Instagram Connected Successfully!</h2>
            <p>This window will close automatically...</p>
          </div>
          <script>
            console.log('OAuth success page loaded');
            
            function notifyParentAndClose() {
              console.log('Attempting to notify parent window');
              
              if (window.opener && !window.opener.closed) {
                console.log('Parent window found, sending message');
                try {
                  const message = { 
                    type: 'INSTAGRAM_OAUTH_SUCCESS',
                    timestamp: Date.now()
                  };
                  
                  // Send message multiple times to ensure delivery
                  window.opener.postMessage(message, '*');
                  console.log('First message sent to parent');
                  
                  // Send again after 100ms
                  setTimeout(() => {
                    window.opener.postMessage(message, '*');
                    console.log('Second message sent to parent');
                  }, 100);
                  
                  // Send again after 300ms and then close
                  setTimeout(() => {
                    window.opener.postMessage(message, '*');
                    console.log('Third message sent to parent');
                    
                    // Close after a short delay to ensure message is received
                    setTimeout(() => {
                      console.log('Closing popup window');
                      window.close();
                    }, 300);
                  }, 300);
                  
                } catch (e) {
                  console.error('Error sending message to parent:', e);
                  // Fallback: redirect to main page
                  window.location.href = '/?ig_connected=true';
                }
              } else {
                console.log('No parent window found, redirecting');
                // Fallback if no opener (redirect to main page)
                window.location.href = '/?ig_connected=true';
              }
            }
            
            // Try immediately and also after page load
            notifyParentAndClose();
            window.addEventListener('load', notifyParentAndClose);
          </script>
        </body>
      </html>
    `);
  } catch (error) {
    console.error('Instagram OAuth error:', error);
    // Send error message to parent window and close popup
    res.send(`
      <html>
        <head><title>Instagram Connection Failed</title></head>
        <body>
          <div style="text-align: center; font-family: Arial, sans-serif; padding: 50px;">
            <h2>❌ Instagram Connection Failed</h2>
            <p>This window will close automatically...</p>
          </div>
          <script>
            console.log('OAuth error page loaded');
            
            function notifyParentAndClose() {
              console.log('Attempting to notify parent window of error');
              
              if (window.opener && !window.opener.closed) {
                console.log('Parent window found, sending error message');
                try {
                  window.opener.postMessage({ 
                    type: 'INSTAGRAM_OAUTH_ERROR', 
                    error: 'Connection failed',
                    timestamp: Date.now()
                  }, '*');
                  console.log('Error message sent to parent');
                  
                  // Close after a short delay to ensure message is received
                  setTimeout(() => {
                    console.log('Closing popup window');
                    window.close();
                  }, 500);
                } catch (e) {
                  console.error('Error sending message to parent:', e);
                  // Fallback: redirect to main page
                  window.location.href = '/?ig_error=true';
                }
              } else {
                console.log('No parent window found, redirecting');
                // Fallback if no opener (redirect to main page)
                window.location.href = '/?ig_error=true';
              }
            }
            
            // Try immediately and also after page load
            notifyParentAndClose();
            window.addEventListener('load', notifyParentAndClose);
          </script>
        </body>
      </html>
    `);
  }
});

app.get("/test", (req, res) => {
  res.send("ok")
});

// Instagram publishing endpoint
app.post('/api/instagram/publish', requireDashboardAuth, async (req, res) => {
  try {
    const token = req.headers['x-dashboard-token'] || (req.headers.authorization && req.headers.authorization.replace(/^Bearer\s+/i, ''));
    const session = dashboardSessions.get(token);
    const { saveId, caption = '' } = req.body;

    console.log('📱 Instagram publish request:', { saveId, caption: !!caption, hasSession: !!session });

    // Check if user has Instagram connected
    if (!session || !session.instagram_user_id || !session.instagram_access_token) {
      return res.status(400).json({ 
        ok: false, 
        error: 'Instagram account not connected. Please connect your Instagram account first.' 
      });
    }

    // Validate saveId
    if (!saveId) {
      return res.status(400).json({ 
        ok: false, 
        error: 'No carousel specified. Please generate a carousel first.' 
      });
    }

    // Check if output directory exists
    const outputDir = path.join(outputsDir, saveId);
    if (!fs.existsSync(outputDir)) {
      return res.status(404).json({ 
        ok: false, 
        error: `Carousel not found. The output directory for ${saveId} does not exist.` 
      });
    }

    // Check content publishing limit
    console.log('🔍 Checking Instagram publishing limits...');
    const remainingPosts = await checkContentPublishingLimit(session.instagram_user_id, session.instagram_access_token);
    console.log('📊 Remaining Instagram posts today:', remainingPosts);

    if (remainingPosts <= 0) {
      return res.status(429).json({ 
        ok: false, 
        error: 'Instagram posting limit reached for today. Please try again tomorrow.' 
      });
    }

    // Create and publish Instagram post
    console.log('🚀 Publishing carousel to Instagram...');
    const postId = await createInstagramPost(
      session.instagram_user_id, 
      session.instagram_access_token, 
      saveId, 
      caption
    );

    console.log('✅ Instagram post published successfully:', postId);
    
    res.json({ 
      ok: true, 
      postId,
      message: 'Carousel published successfully to Instagram!',
      remainingPosts: remainingPosts - 1
    });

  } catch (error) {
    console.error('❌ Instagram publishing error:', error);
    res.status(500).json({ 
      ok: false, 
      error: error.message || 'Failed to publish to Instagram. Please try again.' 
    });
  }
});

// Check Instagram publishing limits
app.get('/api/instagram/limits', requireDashboardAuth, async (req, res) => {
  try {
    const token = req.headers['x-dashboard-token'] || (req.headers.authorization && req.headers.authorization.replace(/^Bearer\s+/i, ''));
    const session = dashboardSessions.get(token);

    // Check if user has Instagram connected
    if (!session || !session.instagram_user_id || !session.instagram_access_token) {
      return res.status(400).json({ 
        ok: false, 
        error: 'Instagram account not connected.' 
      });
    }

    const remainingPosts = await checkContentPublishingLimit(session.instagram_user_id, session.instagram_access_token);
    
    res.json({ 
      ok: true, 
      remainingPosts,
      userId: session.instagram_user_id
    });

  } catch (error) {
    console.error('❌ Error checking Instagram limits:', error);
    res.status(500).json({ 
      ok: false, 
      error: 'Failed to check Instagram limits.' 
    });
  }
});

// Debug endpoint to check sessions (remove in production)
app.get('/api/debug/sessions', (req, res) => {
  const sessions = Array.from(dashboardSessions.entries()).map(([token, session]) => ({
    token: token.substring(0, 8) + '...',
    username: session.username,
    instagram_connected: !!(session.instagram_user_id && session.instagram_access_token),
    instagram_user_id: session.instagram_user_id || null,
    expiresAt: new Date(session.expiresAt).toISOString()
  }));
  
  res.json({ sessions });
});

// Run workflow from a specific node using cache (streaming version)
app.post('/api/run-from/:nodeId', async (req, res) => {
  try {
    // Set SSE headers for streaming
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Cache-Control'
    });

    // Send initial connection message
    res.write('data: {"type":"connected"}\n\n');

    const { nodeId } = req.params;
    let workflow;

    // Get workflow (same logic as regular run)
    if (req.body && req.body.nodes && req.body.edges) {
      workflow = req.body;
    } else {
      const raw = fs.readFileSync(workflowPath, 'utf8');
      workflow = JSON.parse(raw);
    }

    // Create a subworkflow starting from the specified node
    const subWorkflow = getWorkflowFromNode(workflow, nodeId);
    console.log(`Run from node ${nodeId}: Original workflow has ${workflow.nodes.length} nodes, subworkflow has ${subWorkflow.nodes.length} nodes`);
    console.log('Subworkflow nodes:', subWorkflow.nodes.map(n => n.id));

    // Create event emitter for streaming logs
    const EventEmitter = require('events');
    const logEmitter = new EventEmitter();

    // Listen for log events and send them via SSE immediately
    logEmitter.on('log', (logLine) => {
      console.log('Emitting log via SSE (run-from):', logLine);
      res.write(`data: ${JSON.stringify({type: 'log', data: logLine})}\n\n`);
    });
    
    const result = await executeWorkflow(subWorkflow, { 
      useCache: true, 
      logEmitter,
      startNodeId: nodeId,
      originalWorkflow: workflow
    });
    
    // Send completion event
    res.write(`data: ${JSON.stringify({type: 'complete', data: result})}\n\n`);
    res.end();
    
  } catch (e) {
    // Send error event
    res.write(`data: ${JSON.stringify({type: 'error', data: e.message})}\n\n`);
    res.end();
  }
});

// Combined streaming endpoint that handles both SSE and workflow execution
app.post('/api/run-stream', async (req, res) => {
  try {
    // Set SSE headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Cache-Control'
    });

    // Send initial connection message
    res.write('data: {"type":"connected"}\n\n');

    let workflow;
    if (req.body && req.body.nodes && req.body.edges) {
      workflow = req.body;
    } else {
      const raw = fs.readFileSync(workflowPath, 'utf8');
      workflow = JSON.parse(raw);
    }

    // Create event emitter for streaming logs
    const EventEmitter = require('events');
    const logEmitter = new EventEmitter();

    // Listen for log events and send them via SSE immediately
    logEmitter.on('log', (logLine) => {
      console.log('Emitting log via SSE:', logLine);
      res.write(`data: ${JSON.stringify({type: 'log', data: logLine})}\n\n`);
    });

    const result = await executeWorkflow(workflow, { logEmitter });
    
    // Send completion event
    res.write(`data: ${JSON.stringify({type: 'complete', data: result})}\n\n`);
    res.end();
    
  } catch (e) {
    // Send error event
    res.write(`data: ${JSON.stringify({type: 'error', data: e.message})}\n\n`);
    res.end();
  }
});

app.use('/', express.static(path.join(projectRoot, 'public')));
 
// Choose port: prefer PORT from environment (.env) if present, otherwise fall back to n4n.config.json
const cfg = loadConfig();
const envPort = process.env.PORT ? Number(process.env.PORT) : undefined;
const port = envPort || cfg.port || 3000;
const projectName = cfg.projectName || 'n4n-workflow';
app.listen(port, () => {
  console.log(`[n4n] ${projectName} listening on http://localhost:${port} (env PORT: ${process.env.PORT || 'unset'})`);
});