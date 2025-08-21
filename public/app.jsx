const { useEffect, useRef, useState, useCallback } = React;

// Monaco Editor Component
function CodeEditor({ value, onChange, editorHeight, setEditorHeight, isFullscreen, setIsFullscreen }) {
  const editorRef = useRef(null);
  const normalContainerRef = useRef(null);
  const fullscreenContainerRef = useRef(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isResizingEditor, setIsResizingEditor] = useState(false);

  // Keep a ref to the latest onChange so editor event listeners don't call a stale closure
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  // Get the current container ref based on mode
  const containerRef = isFullscreen ? fullscreenContainerRef : normalContainerRef;

  useEffect(() => {
    if (typeof window.require !== 'undefined') {
      window.require.config({ paths: { vs: 'https://unpkg.com/monaco-editor@0.44.0/min/vs' } });
      window.require(['vs/editor/editor.main'], () => {
        setIsLoaded(true);
      });
    }
  }, []);

  useEffect(() => {
    if (isLoaded && containerRef.current) {
      // Dispose existing editor if it exists
      if (editorRef.current) {
        editorRef.current.dispose();
        editorRef.current = null;
      }

      // Define a custom theme
      window.monaco.editor.defineTheme('elegant-dark', {
        base: 'vs-dark',
        inherit: true,
        rules: [
          { token: 'comment', foreground: '6A9955', fontStyle: 'italic' },
          { token: 'keyword', foreground: '569CD6', fontStyle: 'bold' },
          { token: 'string', foreground: 'CE9178' },
          { token: 'number', foreground: 'B5CEA8' },
          { token: 'function', foreground: 'DCDCAA' },
          { token: 'variable', foreground: '9CDCFE' },
        ],
        colors: {
          'editor.background': '#1e1e1e',
          'editor.foreground': '#d4d4d4',
          'editor.lineHighlightBackground': '#2d2d30',
          'editor.selectionBackground': '#264f78',
          'editor.inactiveSelectionBackground': '#3a3d41',
        }
      });

      editorRef.current = window.monaco.editor.create(containerRef.current, {
        value: value,
        language: 'javascript',
        theme: 'elegant-dark',
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        fontSize: 14,
        lineNumbers: 'on',
        roundedSelection: false,
        automaticLayout: true,
        wordWrap: 'on',
        tabSize: 2,
        insertSpaces: true,
        padding: { top: 10, bottom: 10 },
        lineHeight: 22,
        fontFamily: 'JetBrains Mono, Fira Code, Monaco, Consolas, monospace',
      });

      editorRef.current.onDidChangeModelContent(() => {
        const newValue = editorRef.current.getValue();
        // Use the ref so we always call the latest onChange (avoid stale closures)
        if (onChangeRef && onChangeRef.current) {
          onChangeRef.current(newValue);
        }
      });
    }

    return () => {
      if (editorRef.current) {
        editorRef.current.dispose();
        editorRef.current = null;
      }
    };
  }, [isLoaded, isFullscreen]); // Re-create editor when fullscreen changes

  useEffect(() => {
    if (editorRef.current && editorRef.current.getValue() !== value) {
      editorRef.current.setValue(value);
    }
  }, [value]);

  // Editor resize functionality
  useEffect(() => {
    function handleMouseMove(e) {
      if (isResizingEditor && containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const newHeight = e.clientY - rect.top;
        setEditorHeight(Math.max(150, Math.min(800, newHeight))); // Min 150px, max 800px
      }
    }

    function handleMouseUp() {
      setIsResizingEditor(false);
    }

    if (isResizingEditor) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isResizingEditor]);

  if (!isLoaded) {
    return (
      <div className="w-full h-48 border border-gray-300 rounded-lg flex items-center justify-center bg-gray-50">
        <div className="text-gray-500 text-sm">Loading code editor...</div>
      </div>
    );
  }

  const actualHeight = isFullscreen ? '70vh' : `${editorHeight}px`;

  if (isFullscreen) {
    return (
      <>
        {/* Backdrop */}
        <div className="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm z-40" onClick={() => setIsFullscreen(false)} />

        {/* Zen mode window */}
        <div className="fixed inset-0 z-50 flex items-center justify-center p-8">
          <div className="bg-white rounded-lg shadow-2xl border border-gray-300 overflow-hidden w-full max-w-6xl">
            {/* Title bar */}
            <div className="bg-gray-100 border-b border-gray-300 px-4 py-3 flex items-center justify-between">
              <span className="text-sm font-medium text-gray-700">handler.js</span>
              <button
                onClick={() => setIsFullscreen(false)}
                className="text-gray-500 hover:text-gray-700 transition-colors duration-150"
                title="Exit zen mode"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Editor container */}
            <div
              ref={fullscreenContainerRef}
              className="w-full"
              style={{ height: actualHeight }}
            />
          </div>
        </div>
      </>
    );
  }

  return (
    <div className="relative border border-gray-300 rounded-lg overflow-hidden">
      {/* Title bar */}
      <div className="bg-gray-100 border-b border-gray-300 px-3 py-2 flex items-center justify-between">
        <span className="text-sm font-medium text-gray-700">handler.js</span>
        <button
          onClick={() => setIsFullscreen(true)}
          className="text-gray-500 hover:text-gray-700 transition-colors duration-150"
          title="Enter zen mode"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
          </svg>
        </button>
      </div>

      {/* Editor container */}
      <div
        ref={normalContainerRef}
        className="w-full"
        style={{ height: actualHeight }}
      />

      {/* Resize handle - only show when not fullscreen */}
      {!isFullscreen && (
        <div
          className="absolute bottom-0 left-0 right-0 h-2 cursor-row-resize bg-gray-200 hover:bg-gray-300 transition-colors duration-150 flex items-center justify-center"
          onMouseDown={() => setIsResizingEditor(true)}
        >
          <div className="w-8 h-0.5 bg-gray-400 rounded"></div>
        </div>
      )}
    </div>
  );
}

function App() {
  const [workflow, setWorkflow] = useState({ nodes: [], edges: [] });
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [selectedNodeIds, setSelectedNodeIds] = useState(new Set()); // Multi-selection
  const canvasRef = useRef(null);

  // In connectState, only store mouseClientX/mouseClientY for the mouse position
  const [connectState, setConnectState] = useState({
    active: false,
    from: null, // { nodeId, side }
    hoverNodeId: null,
    mouseClientX: 0,
    mouseClientY: 0,
  });

  // Selection box state
  const [selectionBox, setSelectionBox] = useState({
    active: false,
    startX: 0,
    startY: 0,
    currentX: 0,
    currentY: 0,
  });

  // Use ref to track current selection box state for event handlers
  const selectionBoxRef = useRef(selectionBox);
  const connectStateRef = useRef(connectState);

  // Update refs whenever state changes
  useEffect(() => {
    selectionBoxRef.current = selectionBox;
  }, [selectionBox]);

  useEffect(() => {
    connectStateRef.current = connectState;
  }, [connectState]);

  // Panning state
  const [panState, setPanState] = useState({
    active: false,
    startX: 0,
    startY: 0,
    startOffsetX: 0,
    startOffsetY: 0,
  });

  // Clipboard state for copy/paste
  const [clipboard, setClipboard] = useState({ nodes: [], edges: [] });

  // Track unsaved changes
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // Dynamic node types
  const [nodeTypes, setNodeTypes] = useState([]);

  const [consoleLines, setConsoleLines] = useState([]);
  const [contextMenu, setContextMenu] = useState({ visible: false, x: 0, y: 0, nodeId: null });
  const [canvasState, setCanvasState] = useState({ offsetX: 0, offsetY: 0 });
  const [lastTriggerNodeId, setLastTriggerNodeId] = useState(null);
  const [cacheStatus, setCacheStatus] = useState({});
  const [executingNodeId, setExecutingNodeId] = useState(null);
  const [sidebarWidth, setSidebarWidth] = useState(360);
  const [isResizing, setIsResizing] = useState(false);
  const [editorHeight, setEditorHeight] = useState(300);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [codeMap, setCodeMap] = useState({});

  useEffect(() => {
    (async () => {
      // Load node types first
      try {
        const nodeTypesRes = await fetch('/api/node-types');
        const types = await nodeTypesRes.json();
        console.log('Loaded node types:', types);
        setNodeTypes(types);
      } catch (e) {
        console.error('Failed to load node types:', e);
      }

      // Load workflow
      const res = await fetch('/api/workflow');
      const wf = await res.json();
      if (!Array.isArray(wf.nodes)) wf.nodes = [];
      if (!Array.isArray(wf.edges)) wf.edges = [];
      setWorkflow(wf);

      // Auto prettify on load for a clean starting layout
      setTimeout(function () {
        prettifyWorkflow(setWorkflow, () => {
          // Callback after prettify completes - capture the final state as initial
          setTimeout(() => {
            setInitialWorkflow(JSON.parse(JSON.stringify(workflowRef.current)));
            // Load cache status after initial setup
            loadCacheStatus();
          }, 100);
        });
      }, 100);
    })();
  }, []);

  // Track workflow changes to detect unsaved changes
  const [initialWorkflow, setInitialWorkflow] = useState(null);
  const workflowRef = useRef(workflow);
  const hasUnsavedChangesRef = useRef(hasUnsavedChanges);

  // Keep refs updated
  useEffect(() => {
    workflowRef.current = workflow;
  }, [workflow]);

  useEffect(() => {
    hasUnsavedChangesRef.current = hasUnsavedChanges;
  }, [hasUnsavedChanges]);

  useEffect(() => {
    // Only mark as unsaved if workflow has actually changed from initial state
    if (initialWorkflow && JSON.stringify(workflow) !== JSON.stringify(initialWorkflow)) {
      setHasUnsavedChanges(true);
    }
  }, [workflow, initialWorkflow]);



  // Add beforeunload event listener to warn about unsaved changes
  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = ''; // Chrome requires returnValue to be set
        return ''; // Some browsers require a return value
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedChanges]);

  async function saveWorkflow() {
    await fetch('/api/workflow', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(workflowRef.current)
    });
    setHasUnsavedChanges(false);
    // Update the initial workflow state to the saved state
    setInitialWorkflow(JSON.parse(JSON.stringify(workflowRef.current)));
  }

  async function loadCacheStatus() {
    try {
      const res = await fetch('/api/cache-status');
      const data = await res.json();
      if (data.ok) {
        setCacheStatus(data.status);
      }
    } catch (e) {
      console.error('Failed to load cache status:', e);
    }
  }

  async function runFromNode(nodeId) {
    setConsoleLines([]);
    setExecutingNodeId(null); // Clear any previous execution state

    try {
      console.log('Starting run-from-node with streaming for node:', nodeId);

      // Use fetch with streaming response (same as runWorkflow)
      const response = await fetch(`/api/run-from/${nodeId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(workflowRef.current)
      });

      if (!response.ok) {
        setConsoleLines([{ ts: new Date().toISOString(), msg: 'Run failed: HTTP ' + response.status }]);
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value);
          const lines = chunk.split('\n');

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const jsonStr = line.slice(6); // Remove 'data: ' prefix
              if (jsonStr.trim()) {
                try {
                  const data = JSON.parse(jsonStr);
                  console.log('Run-from SSE message received:', data);

                  if (data.type === 'log') {
                    const logLine = parseLogLine(data.data);
                    console.log('Adding run-from log line:', logLine);
                    if (filterVerboseLogs(logLine)) {
                      setConsoleLines(prev => [...prev, logLine]);
                    }
                  } else if (data.type === 'complete') {
                    console.log('Run-from workflow complete');
                    setExecutingNodeId(null); // Clear execution state
                    loadCacheStatus();
                    return;
                  } else if (data.type === 'error') {
                    console.log('Run-from workflow error:', data.data);
                    setExecutingNodeId(null); // Clear execution state
                    setConsoleLines(prev => [...prev, { ts: new Date().toISOString(), msg: 'Run error: ' + data.data }]);
                    return;
                  }
                } catch (e) {
                  console.log('Failed to parse run-from SSE data:', jsonStr, e);
                }
              }
            }
          }
        }
      } finally {
        reader.releaseLock();
      }
    } catch (e) {
      console.log('Run-from error:', e);
      setConsoleLines([{ ts: new Date().toISOString(), msg: 'Run error: ' + e.message }]);
      setExecutingNodeId(null); // Clear execution state
    }
  }

  async function runWorkflow(specificTriggerId = null) {
    setConsoleLines([]);

    // Determine which trigger to run
    let triggerToRun = specificTriggerId;
    if (!triggerToRun) {
      // Use the most recent trigger, or find any trigger if none specified
      triggerToRun = lastTriggerNodeId;
      if (!triggerToRun) {
        const triggers = workflow.nodes.filter(n => n.type === 'Trigger');
        if (triggers.length > 0) {
          triggerToRun = triggers[0].id;
        }
      }
    }

    if (!triggerToRun) {
      setConsoleLines([{ ts: new Date().toISOString(), msg: 'No trigger node found to run' }]);
      return;
    }

    // Update the last trigger that was run (for future runs)
    setLastTriggerNodeId(triggerToRun);

    try {
      // First, automatically save the current workflow to ensure we run the latest version
      if (hasUnsavedChangesRef.current) {
        await saveWorkflow();
        // Small delay to ensure server processes the save
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      // Create a filtered workflow that only includes nodes reachable from the specific trigger
      const filteredWorkflow = getWorkflowFromTrigger(workflowRef.current, triggerToRun);

      console.log('Running trigger:', triggerToRun);
      console.log('Filtered workflow:', filteredWorkflow);

      console.log('Starting workflow with streaming...');

      // Use fetch with streaming response
      const response = await fetch('/api/run-stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(filteredWorkflow)
      });

      if (!response.ok) {
        setConsoleLines([{ ts: new Date().toISOString(), msg: 'Run failed: HTTP ' + response.status }]);
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value);
          const lines = chunk.split('\n');

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const jsonStr = line.slice(6); // Remove 'data: ' prefix
              if (jsonStr.trim()) {
                try {
                  const data = JSON.parse(jsonStr);

                  if (data.type === 'log') {
                    const logLine = parseLogLine(data.data);
                    console.log('Received log data:', data.data);
                    console.log('Parsed log line:', logLine);
                    const shouldShow = filterVerboseLogs(logLine);
                    console.log('Filter result:', shouldShow);
                    if (shouldShow) {
                      console.log('Adding log line to console');
                      setConsoleLines(prev => [...prev, logLine]);
                    } else {
                      console.log('Log line filtered out');
                    }
                  } else if (data.type === 'complete') {
                    console.log('Workflow complete');
                    setExecutingNodeId(null); // Clear execution state
                    loadCacheStatus();
                    return;
                  } else if (data.type === 'error') {
                    console.log('Workflow error:', data.data);
                    setConsoleLines(prev => [...prev, { ts: new Date().toISOString(), msg: 'Run error: ' + data.data }]);
                    return;
                  }
                } catch (e) {
                  console.log('Failed to parse SSE data:', jsonStr, e);
                }
              }
            }
          }
        }
      } finally {
        reader.releaseLock();
      }
    } catch (e) {
      setConsoleLines([{ ts: new Date().toISOString(), msg: 'Run error: ' + e.message }]);
    }
  }

  function parseLogLine(line) {
    // Parse: [timestamp] [nodeId] message (handle multi-line content)
    const m = /^\[(.*?)\]\s*\[(.*?)\]\s*(.*)$/s.exec(line);
    if (m) return { ts: m[1], nodeId: m[2], msg: m[3] };

    // Fallback for old format: [timestamp] message
    const oldM = /^\[(.*?)\]\s*(.*)$/s.exec(line);
    if (oldM) return { ts: oldM[1], nodeId: null, msg: oldM[2] };

    return { ts: new Date().toISOString(), nodeId: null, msg: line };
  }

  function filterVerboseLogs(line) {
    // Hide verbose execution messages
    const verbosePatterns = [
      /^Executing /,
      /^Completed /
    ];

    const isVerbose = verbosePatterns.some(pattern => pattern.test(line.msg));

    // Track execution state from verbose messages
    if (isVerbose) {
      const executingMatch = line.msg.match(/^Executing .* \((.+)\)$/);
      const completedMatch = line.msg.match(/^Completed .* \((.+)\)$/);

      if (executingMatch) {
        setExecutingNodeId(executingMatch[1]);
      } else if (completedMatch) {
        // Clear executing state when node completes
        setExecutingNodeId(prev => prev === completedMatch[1] ? null : prev);
      }
    }

    // Only show logs that have a nodeId (from Log and Code nodes) or errors
    const hasNodeId = line.nodeId !== null;
    const isError = line.msg.includes('ERROR');

    return !isVerbose && (hasNodeId || isError);
  }



  // Helper function to get only the nodes reachable from a specific trigger
  function getWorkflowFromTrigger(workflow, triggerId) {
    const reachableNodes = new Set();
    const queue = [triggerId];

    // BFS to find all reachable nodes
    while (queue.length > 0) {
      const currentId = queue.shift();
      if (reachableNodes.has(currentId)) continue;

      reachableNodes.add(currentId);

      // Find all nodes this one connects to
      const outgoingEdges = workflow.edges.filter(e => e.from === currentId);
      for (const edge of outgoingEdges) {
        if (!reachableNodes.has(edge.to)) {
          queue.push(edge.to);
        }
      }
    }

    // Filter nodes to only include reachable ones, but exclude other trigger nodes
    const filteredNodes = workflow.nodes.filter(n => {
      if (n.id === triggerId) return true; // Always include the specific trigger
      if (n.type === 'Trigger' && n.id !== triggerId) return false; // Exclude other triggers
      return reachableNodes.has(n.id); // Include if reachable from our trigger
    });

    // Return filtered workflow with only relevant nodes and their edges
    return {
      nodes: filteredNodes,
      edges: workflow.edges.filter(e =>
        filteredNodes.some(n => n.id === e.from) &&
        filteredNodes.some(n => n.id === e.to)
      )
    };
  }

  function addNode(type) {
    const id = 'node-' + Math.random().toString(36).slice(2, 7);
    setWorkflow(function (prev) {
      return {
        nodes: prev.nodes.concat([{ id: id, type: type, params: {}, position: { x: 100, y: 100 } }]),
        edges: prev.edges
      };
    });
    setSelectedNodeId(id);
  }

  function updateNode(id, changes) {
    if (changes.params && changes.params.code !== undefined) {
      setCodeMap(prev => ({ ...prev, [id]: changes.params.code }));
    }
    setWorkflow(function (prev) {
      return {
        nodes: prev.nodes.map(function (n) { return n.id === id ? Object.assign({}, n, changes) : n; }),
        edges: prev.edges
      };
    });
  }

  function deleteEdgeAt(index) {
    setWorkflow(function (prev) {
      return { nodes: prev.nodes, edges: prev.edges.filter(function (_, i) { return i !== index; }) };
    });
  }

  // onMouseMove: handle connection, selection box, and panning
  function onMouseMove(ev) {
    // Check if canvas ref is available
    if (!canvasRef.current) return;

    // Get canvas position relative to viewport
    const canvasRect = canvasRef.current.getBoundingClientRect();
    const canvasX = ev.clientX - canvasRect.left;
    const canvasY = ev.clientY - canvasRect.top;

    // Handle connection state
    setConnectState(function (s) {
      // Only update if we're actively connecting
      if (!s.active) return s;

      return Object.assign({}, s, {
        mouseClientX: canvasX,
        mouseClientY: canvasY
      });
    });

    // Handle selection box
    setSelectionBox({
      ...selectionBox,
      currentX: canvasX,
      currentY: canvasY
    });

    // Handle panning
    setPanState(function (s) {
      if (!s.active) return s;

      const deltaX = ev.clientX - s.startX;
      const deltaY = ev.clientY - s.startY;

      setCanvasState({
        offsetX: s.startOffsetX + deltaX,
        offsetY: s.startOffsetY + deltaY
      });

      return s;
    });
  }

  function onMouseUp(ev) {
    // Handle connection state
    const currentConnectState = connectStateRef.current;
    if (currentConnectState.active) {
      setConnectState(function (s) { return updateMouseFromEvent(ev, canvasRef.current, s); });
      setWorkflow(function (prev) {
        if (currentConnectState.from && currentConnectState.hoverNodeId && currentConnectState.hoverNodeId !== currentConnectState.from.nodeId) {
          return { nodes: prev.nodes, edges: prev.edges.concat([{ from: currentConnectState.from.nodeId, to: currentConnectState.hoverNodeId }]) };
        }
        return prev;
      });
      setConnectState({ active: false, from: null, hoverNodeId: null, mouseClientX: 0, mouseClientY: 0 });
    }

    // Handle selection box
    const currentSelectionBox = selectionBoxRef.current;
    if (currentSelectionBox.active) {
      console.log('Processing selection box on mouse up');
      const boxWidth = Math.abs(currentSelectionBox.currentX - currentSelectionBox.startX);
      const boxHeight = Math.abs(currentSelectionBox.currentY - currentSelectionBox.startY);

      console.log('Box size:', boxWidth, boxHeight);
      // Only process selection if the box is large enough (minimum 5px in either direction)
      if (boxWidth > 5 || boxHeight > 5) {
        // Convert screen coordinates to world coordinates
        const startWorldX = Math.min(currentSelectionBox.startX, currentSelectionBox.currentX) - canvasState.offsetX;
        const startWorldY = Math.min(currentSelectionBox.startY, currentSelectionBox.currentY) - canvasState.offsetY;
        const endWorldX = Math.max(currentSelectionBox.startX, currentSelectionBox.currentX) - canvasState.offsetX;
        const endWorldY = Math.max(currentSelectionBox.startY, currentSelectionBox.currentY) - canvasState.offsetY;

        // Find nodes within selection box
        const selectedNodes = workflow.nodes.filter(node => {
          const nodeX = node.position?.x || 0;
          const nodeY = node.position?.y || 0;
          const nodeWidth = 160; // Approximate node width
          const nodeHeight = 60; // Approximate node height

          // Check if node overlaps with selection box
          return nodeX < endWorldX && nodeX + nodeWidth > startWorldX &&
            nodeY < endWorldY && nodeY + nodeHeight > startWorldY;
        });

        console.log('Selection result:', {
          selectedCount: selectedNodes.length,
          totalNodes: workflow.nodes.length,
          selectionBox: { startWorldX, startWorldY, endWorldX, endWorldY },
          allNodePositions: workflow.nodes.map(n => ({ id: n.id, pos: n.position })),
          boxSize: { boxWidth, boxHeight }
        });

        if (selectedNodes.length > 0) {
          setSelectedNodeIds(new Set(selectedNodes.map(n => n.id)));
          setSelectedNodeId(null); // Clear single selection
        } else {
          setSelectedNodeIds(new Set());
        }
      }

      setSelectionBox({ active: false, startX: 0, startY: 0, currentX: 0, currentY: 0 });
    }

    // Handle panning
    if (panState.active) {
      setPanState({ active: false, startX: 0, startY: 0, startOffsetX: 0, startOffsetY: 0 });
    }
  }

  useEffect(() => {
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [connectState.active, selectionBox.active, panState.active, canvasState, workflow.nodes]); // Re-setup when states change

  // Hotkey handler
  useEffect(() => {
    function handleKeyDown(e) {
      // Ctrl+S: Save workflow
      if (e.ctrlKey && e.key === 's') {
        e.preventDefault();
        saveWorkflow();
        return;
      }

      // Ctrl+Enter: Run workflow
      if (e.ctrlKey && e.key === 'Enter') {
        e.preventDefault();
        runWorkflow();
        return;
      }

      // Ctrl+P: Prettify workflow
      if (e.ctrlKey && e.key === 'p') {
        e.preventDefault();
        prettifyWorkflow(setWorkflow);
        return;
      }

      // Ctrl+C: Copy nodes
      if (e.ctrlKey && e.key === 'c') {
        const activeElement = document.activeElement;
        const isTyping = activeElement && (
          activeElement.tagName === 'INPUT' ||
          activeElement.tagName === 'TEXTAREA' ||
          activeElement.contentEditable === 'true'
        );

        // Check if there's a text selection (user wants to copy text)
        const selection = window.getSelection();
        const hasTextSelection = selection && selection.toString().length > 0;

        // Only copy nodes if not typing, has selected nodes, and no text is selected
        if (!isTyping && !hasTextSelection && (selectedNodeId || selectedNodeIds.size > 0)) {
          e.preventDefault();
          copyNodes();
          return;
        }
      }

      // Ctrl+V: Paste nodes
      if (e.ctrlKey && e.key === 'v') {
        const activeElement = document.activeElement;
        const isTyping = activeElement && (
          activeElement.tagName === 'INPUT' ||
          activeElement.tagName === 'TEXTAREA' ||
          activeElement.contentEditable === 'true'
        );

        if (!isTyping && clipboard.nodes?.length > 0) {
          e.preventDefault();
          pasteNodes();
          return;
        }
      }

      if (e.key === 'Delete' || e.key === 'Backspace') {
        // Only delete node if:
        // 1. A node is selected (single or multiple)
        // 2. User is not typing in an input field, textarea, or contenteditable element
        const activeElement = document.activeElement;
        const isTyping = activeElement && (
          activeElement.tagName === 'INPUT' ||
          activeElement.tagName === 'TEXTAREA' ||
          activeElement.contentEditable === 'true'
        );

        if ((selectedNodeId || selectedNodeIds.size > 0) && !isTyping) {
          e.preventDefault();
          if (selectedNodeIds.size > 0) {
            deleteMultipleNodes(Array.from(selectedNodeIds));
          } else if (selectedNodeId) {
            deleteNode(selectedNodeId);
          }
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedNodeId, selectedNodeIds, clipboard]);

  function deleteNode(nodeId) {
    setWorkflow(prev => ({
      nodes: prev.nodes.filter(n => n.id !== nodeId),
      edges: prev.edges.filter(e => e.from !== nodeId && e.to !== nodeId)
    }));
    setSelectedNodeId(null);
    setSelectedNodeIds(new Set());
  }

  function deleteMultipleNodes(nodeIds) {
    setWorkflow(prev => ({
      nodes: prev.nodes.filter(n => !nodeIds.includes(n.id)),
      edges: prev.edges.filter(e => !nodeIds.includes(e.from) && !nodeIds.includes(e.to))
    }));
    setSelectedNodeId(null);
    setSelectedNodeIds(new Set());
  }

  function copyNodes() {
    const nodesToCopy = [];

    // Get nodes to copy (either single selected or multi-selected)
    if (selectedNodeIds.size > 0) {
      // Multi-selection
      nodesToCopy.push(...workflow.nodes.filter(n => selectedNodeIds.has(n.id)));
    } else if (selectedNodeId) {
      // Single selection
      const node = workflow.nodes.find(n => n.id === selectedNodeId);
      if (node) nodesToCopy.push(node);
    }

    if (nodesToCopy.length > 0) {
      const nodeIds = new Set(nodesToCopy.map(n => n.id));

      // Find edges between the copied nodes
      const edgesToCopy = workflow.edges.filter(edge =>
        nodeIds.has(edge.from) && nodeIds.has(edge.to)
      );

      // Store nodes and edges in clipboard
      setClipboard({
        nodes: nodesToCopy.map(node => ({
          ...node,
          params: { ...node.params },
          position: { ...node.position }
        })),
        edges: edgesToCopy.map(edge => ({ ...edge }))
      });
      console.log(`Copied ${nodesToCopy.length} node(s) and ${edgesToCopy.length} edge(s) to clipboard`);
    }
  }

  function pasteNodes() {
    if (!clipboard.nodes || clipboard.nodes.length === 0) return;

    const newNodes = [];
    const newEdges = [];
    const idMapping = {}; // Map old IDs to new IDs for edge handling

    // Calculate offset to maintain relative positions
    const offsetX = 50;
    const offsetY = 50;

    // Create new nodes with new IDs and offset positions (maintaining relative positions)
    clipboard.nodes.forEach((originalNode) => {
      const newId = 'node-' + Math.random().toString(36).slice(2, 7);
      idMapping[originalNode.id] = newId;

      const newNode = {
        ...originalNode,
        id: newId,
        params: { ...originalNode.params },
        position: {
          x: (originalNode.position?.x || 0) + offsetX,
          y: (originalNode.position?.y || 0) + offsetY
        }
      };
      newNodes.push(newNode);
    });

    // Create new edges with mapped IDs
    clipboard.edges.forEach((originalEdge) => {
      const newEdge = {
        from: idMapping[originalEdge.from],
        to: idMapping[originalEdge.to]
      };
      newEdges.push(newEdge);
    });

    // Add the new nodes and edges to the workflow
    setWorkflow(prev => ({
      nodes: prev.nodes.concat(newNodes),
      edges: prev.edges.concat(newEdges)
    }));

    // Select the newly pasted nodes
    if (newNodes.length === 1) {
      setSelectedNodeId(newNodes[0].id);
      setSelectedNodeIds(new Set());
    } else {
      setSelectedNodeId(null);
      setSelectedNodeIds(new Set(newNodes.map(n => n.id)));
    }

    console.log(`Pasted ${newNodes.length} node(s) and ${newEdges.length} edge(s)`);
  }

  function handleContextMenu(e) {
    e.preventDefault();

    // Calculate position in canvas coordinates (accounting for panning)
    const canvasRect = canvasRef.current?.getBoundingClientRect();
    let canvasX = 100, canvasY = 100; // default position

    if (canvasRect) {
      // Get mouse position relative to canvas
      const mouseX = e.clientX - canvasRect.left;
      const mouseY = e.clientY - canvasRect.top;

      // We need to account for canvas panning, but we don't have access to canvasState here
      // So let's pass the raw canvas coordinates and handle the transform in addNodeFromContext
      canvasX = mouseX;
      canvasY = mouseY;
    }

    setContextMenu({
      visible: true,
      x: e.clientX, // screen coordinates for menu positioning
      y: e.clientY,
      canvasX: canvasX, // canvas coordinates for node positioning
      canvasY: canvasY
    });
  }

  function hideContextMenu() {
    setContextMenu({ visible: false, x: 0, y: 0 });
  }

  function addNodeFromContext(type) {
    const id = 'node-' + Math.random().toString(36).slice(2, 7);

    // Account for canvas panning when positioning the new node
    const x = contextMenu.canvasX - canvasState.offsetX - 80; // offset to center the node
    const y = contextMenu.canvasY - canvasState.offsetY - 30;

    setWorkflow(prev => ({
      nodes: prev.nodes.concat([{
        id,
        type,
        params: {},
        position: { x: Math.max(0, x), y: Math.max(0, y) }
      }]),
      edges: prev.edges
    }));
    setSelectedNodeId(id);

    hideContextMenu();
  }

  // Hide context menu on click outside
  useEffect(() => {
    function handleClick() {
      if (contextMenu.visible) {
        hideContextMenu();
      }
    }

    if (contextMenu.visible) {
      window.addEventListener('click', handleClick);
      return () => window.removeEventListener('click', handleClick);
    }
  }, [contextMenu.visible]);

  // Sidebar resize functionality
  useEffect(() => {
    function handleMouseMove(e) {
      if (isResizing) {
        const newWidth = window.innerWidth - e.clientX;
        setSidebarWidth(Math.max(280, Math.min(window.innerWidth - 200, newWidth))); // Min 280px, max 100vw-200px
      }
    }

    function handleMouseUp() {
      setIsResizing(false);
    }

    if (isResizing) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isResizing]);

  // Constrain sidebar width when window is resized
  useEffect(() => {
    function handleWindowResize() {
      setSidebarWidth(prev => Math.max(280, Math.min(window.innerWidth - 200, prev)));
    }

    window.addEventListener('resize', handleWindowResize);
    return () => window.removeEventListener('resize', handleWindowResize);
  }, []);

  const nodesDecorated = decorateNodesWithConnectionSides(workflow);

  return (
    <div className="app-shell">
      <header className="app-header bg-white border-b border-gray-200 shadow-sm">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <img
                src="/logo.png"
                alt="n4n Logo"
                className="w-8 h-8 rounded-lg"
              />
              <h1 className="text-xl font-semibold text-gray-900 tracking-tight">n4n Workflow Editor</h1>
            </div>
            <div className="flex items-center space-x-2">
              <button
                className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors duration-150 ${hasUnsavedChanges
                  ? 'bg-orange-100 text-orange-700 hover:bg-orange-200'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                onClick={() => saveWorkflow()}
              >
                {hasUnsavedChanges ? 'Save*' : 'Save'}
              </button>
              <button
                className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors duration-150 flex items-center space-x-2"
                onClick={() => runWorkflow()}
              >
                <span className="w-4 h-4">▶</span>
                <span>Run</span>
              </button>
              <button
                className="px-4 py-2 bg-amber-500 text-white text-sm font-medium rounded-lg hover:bg-amber-600 transition-colors duration-150 flex items-center space-x-2"
                onClick={() => prettifyWorkflow(setWorkflow)}
              >
                <span className="w-4 h-4">⚡</span>
                <span>Prettify</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="app-content" style={{ gridTemplateColumns: `1fr ${sidebarWidth}px` }}>
        <Canvas
          ref={canvasRef}
          workflow={nodesDecorated}
          selectedNodeId={selectedNodeId}
          setSelectedNodeId={setSelectedNodeId}
          selectedNodeIds={selectedNodeIds}
          setSelectedNodeIds={setSelectedNodeIds}
          setWorkflow={setWorkflow}
          connectState={connectState}
          setConnectState={setConnectState}
          selectionBox={selectionBox}
          setSelectionBox={setSelectionBox}
          panState={panState}
          setPanState={setPanState}
          canvasState={canvasState}
          onDeleteEdge={deleteEdgeAt}
          runWorkflow={runWorkflow}
          onContextMenu={handleContextMenu}
          onCanvasStateChange={setCanvasState}
          nodeTypes={nodeTypes}
          lastTriggerNodeId={lastTriggerNodeId}
          setIsFullscreen={setIsFullscreen}
          cacheStatus={cacheStatus}
          setContextMenu={setContextMenu}
          executingNodeId={executingNodeId}
        />

        {/* Resize handle */}
        <div
          className="resize-handle"
          onMouseDown={() => setIsResizing(true)}
          style={{
            position: 'absolute',
            right: sidebarWidth,
            top: 0,
            bottom: 0,
            width: '4px',
            cursor: 'col-resize',
            backgroundColor: 'transparent',
            zIndex: 10
          }}
        />

        <SidePanel
          workflow={workflow}
          selectedNodeId={selectedNodeId}
          selectedNodeIds={selectedNodeIds}
          clipboard={clipboard}
          onChangeNode={updateNode} codeMap={codeMap}
          sidebarWidth={sidebarWidth}
          editorHeight={editorHeight}
          setEditorHeight={setEditorHeight}
          isFullscreen={isFullscreen}
          setIsFullscreen={setIsFullscreen}
          nodeTypes={nodeTypes}
        />
      </div>

      {/* Toolbar - Right below the editor */}
      <div className="toolbar bg-white border-t border-gray-200 shadow-sm">
        <div className="flex items-center justify-center space-x-4 py-3">
          <div className="flex items-center space-x-2">
            {nodeTypes.map(nodeType => {
              const config = getNodeConfig(nodeType.name, nodeTypes);
              return (
                <button
                  key={nodeType.name}
                  className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors duration-150 flex items-center space-x-2 ${config.bgColor} ${config.borderColor} hover:opacity-80`}
                  onClick={() => addNode(nodeType.name)}
                >
                  <i className={`${nodeType.icon} w-4 h-4`}></i>
                  <span>{nodeType.displayName}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <section id="console" className="app-console">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">Console Output</h3>
          <div className="flex items-center space-x-2">
            <div className="w-2 h-2 bg-green-400 rounded-full"></div>
            <span className="text-xs text-gray-400">Ready</span>
          </div>
        </div>
        {consoleLines.length === 0 ? (
          <div className="text-center py-8">
            <div className="text-gray-500 text-sm">No output yet. Run a workflow to see logs here.</div>
          </div>
        ) : (
          <div className="console-content">
            {consoleLines.map(function (line, idx) {
              // Determine node type from workflow for coloring
              const node = workflow.nodes.find(n => n.id === line.nodeId);
              const nodeType = node ? node.type : 'unknown';

              // Color based on node type
              const nodeIdColor = nodeType === 'Code' ? 'text-indigo-400' :
                nodeType === 'Log' ? 'text-orange-400' :
                  'text-gray-400';

              return (
                <div className="line" key={idx}>
                  <div className="ts">
                    <span>{line.ts}</span>
                    {line.nodeId && (
                      <span className={`${nodeIdColor} font-medium ml-2`}>[{line.nodeId}]</span>
                    )}
                  </div>
                  <div className="msg">{line.msg}</div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Context Menu */}
      {contextMenu.visible && (
        <div
          className="fixed bg-white rounded-lg shadow-lg border border-gray-200 py-2 z-50"
          style={{
            left: contextMenu.x,
            top: contextMenu.y,
            minWidth: '160px'
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {contextMenu.isNodeMenu ? (
            // Node context menu
            <>
              <div className="px-3 py-1 text-xs font-medium text-gray-500 uppercase tracking-wider border-b border-gray-100 mb-1">
                Node Actions
              </div>
              <button
                className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-blue-50 flex items-center transition-colors duration-150"
                onClick={() => {
                  runFromNode(contextMenu.nodeId);
                  hideContextMenu();
                }}
                disabled={!cacheStatus[contextMenu.nodeId]?.hasCache}
              >
                <div className="w-5 flex justify-center">
                  <i className={`fas fa-play ${!cacheStatus[contextMenu.nodeId]?.hasCache ? 'text-gray-400' : 'text-blue-600'}`}></i>
                </div>
                <span className={`ml-3 ${!cacheStatus[contextMenu.nodeId]?.hasCache ? 'text-gray-400' : ''}`}>
                  Run from here
                  {cacheStatus[contextMenu.nodeId]?.hasCache && (
                    <span className="text-xs text-green-600 ml-1">(cached)</span>
                  )}
                </span>
              </button>
              <button
                className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-red-50 flex items-center transition-colors duration-150"
                onClick={() => {
                  deleteNode(contextMenu.nodeId);
                  hideContextMenu();
                }}
              >
                <div className="w-5 flex justify-center">
                  <i className="fas fa-trash text-red-600"></i>
                </div>
                <span className="ml-3">Delete node</span>
              </button>
            </>
          ) : (
            // Canvas context menu
            <>
              <div className="px-3 py-1 text-xs font-medium text-gray-500 uppercase tracking-wider border-b border-gray-100 mb-1">
                Add Node
              </div>
              {nodeTypes.map(nodeType => {
                const config = getNodeConfig(nodeType.name, nodeTypes);
                return (
                  <button
                    key={nodeType.name}
                    className={`w-full text-left px-4 py-2 text-sm text-gray-700 hover:${config.bgColor} flex items-center transition-colors duration-150`}
                    onClick={() => addNodeFromContext(nodeType.name)}
                  >
                    <div className="w-5 flex justify-center">
                      <i className={`${nodeType.icon}`} style={{ color: nodeType.color }}></i>
                    </div>
                    <span className="ml-3">{nodeType.displayName}</span>
                  </button>
                );
              })}
            </>
          )}
        </div>
      )}
    </div>
  );
}





function decorateNodesWithConnectionSides(workflow) {
  const sideMap = {};
  (workflow.edges || []).forEach(function (e) {
    sideMap[e.from] = sideMap[e.from] || new Set();
    sideMap[e.from].add('right');
    sideMap[e.to] = sideMap[e.to] || new Set();
    sideMap[e.to].add('left');
  });
  return {
    nodes: (workflow.nodes || []).map(function (n) {
      const sides = sideMap[n.id] || new Set();
      return Object.assign({}, n, {
        showTop: sides.has('top'),
        showRight: sides.has('right'),
        showBottom: sides.has('bottom'),
        showLeft: sides.has('left')
      });
    }),
    edges: workflow.edges || []
  };
}

const SidePanel = ({ workflow, selectedNodeId, selectedNodeIds, clipboard, onChangeNode, editorHeight, setEditorHeight, isFullscreen, setIsFullscreen, codeMap, nodeTypes }) => {
  const node = workflow.nodes.find(n => n.id === selectedNodeId);
  const params = (node && node.params) || {};
  const multiSelectedNodes = workflow.nodes.filter(n => selectedNodeIds.has(n.id));

  // Show multi-selection info if multiple nodes are selected
  if (selectedNodeIds.size > 1) {
    return (
      <div id="side-panel">
        <div className="text-center py-12">
          <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-blue-600 text-2xl">📦</span>
          </div>
          <h3 className="text-gray-700 text-sm font-medium">{selectedNodeIds.size} nodes selected</h3>
          <p className="text-gray-400 text-xs mt-1">Press Delete to remove selected nodes</p>
          <div className="mt-4 text-left">
            <div className="text-xs text-gray-500 uppercase tracking-wider font-medium mb-2">Selected Nodes</div>
            {multiSelectedNodes.map(n => (
              <div key={n.id} className="text-sm text-gray-600 py-1">
                {n.type}: {n.id}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!node) {
    return (
      <div id="side-panel">
        <div className="text-center py-12">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-gray-400 text-2xl">⚙️</span>
          </div>
          <h3 className="text-gray-500 text-sm font-medium">Select a node</h3>
          <p className="text-gray-400 text-xs mt-1">Choose a node to edit its properties</p>
        </div>
      </div>
    );
  }

  const nodeConfig = getNodeConfig(node.type, nodeTypes);

  return (
    <div id="side-panel">
      <div className="mb-6">
        <div className="flex items-center space-x-3 mb-4">
          <div className={`w-3 h-3 rounded-full ${nodeConfig.color}`}></div>
          <h2 className="text-lg font-semibold text-gray-900 ml-2" style={{ marginBottom: "0px", marginLeft: "6px" }}>{node.type} Node</h2>
        </div>
        <div className="bg-gray-50 rounded-lg p-3">
          <div className="text-xs text-gray-500 uppercase tracking-wider font-medium mb-1">Node ID</div>
          <div className="font-mono text-sm text-gray-700">{node.id}</div>
        </div>
      </div>

      <div className="space-y-6">
        {(() => {
          const nodeType = nodeTypes.find(nt => nt.name === node.type);
          if (!nodeType || !nodeType.parameters) return null;

          return nodeType.parameters.map(param => {
            const paramValue = (param.type === 'code' && codeMap[selectedNodeId] !== undefined)
              ? codeMap[selectedNodeId]
              : (params[param.name] !== undefined ? params[param.name] : param.default);

            // Handle different parameter types
            switch (param.type) {
              case 'code':
                return (
                  <div key={param.name}>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      {param.name}
                      {param.description && (
                        <span className="text-xs text-gray-500 ml-2">({param.description})</span>
                      )}
                    </label>
                    <CodeEditor
                      value={paramValue || `// Import packages (both CommonJS and ES modules supported)
// const axios = require('axios');        // CommonJS
// const fetch = require('node-fetch');   // ES module (auto-handled)
// const fs = require('fs');              // Built-in module

// For pure ES modules, use dynamicImport:
// const fetch = await dynamicImport('node-fetch');

async function handler(context, console) {
  // Log to the workflow console
  console.log("Hello from code node!", context);
  
  // Example: Using node-fetch (ES module)
  // const fetch = require('node-fetch');
  // const response = await fetch('https://api.example.com');
  // const data = await response.json();
  
  // Modify context as needed
  context.timestamp = new Date().toISOString();
  context.processed = true;
  
  // Return the modified context
  return context;
}`}
                      onChange={(value) => onChangeNode(node.id, { params: Object.assign({}, params, { [param.name]: value }) })}
                      editorHeight={editorHeight}
                      setEditorHeight={setEditorHeight}
                      isFullscreen={isFullscreen}
                      setIsFullscreen={setIsFullscreen}
                    />
                  </div>
                );

              case 'select':
                return (
                  <div key={param.name}>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      {param.name}
                      {param.description && (
                        <span className="text-xs text-gray-500 ml-2">({param.description})</span>
                      )}
                    </label>
                    <select
                      value={paramValue}
                      onChange={(e) => onChangeNode(node.id, { params: Object.assign({}, params, { [param.name]: e.target.value }) })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors duration-150"
                    >
                      {param.options?.map(option => (
                        <option key={option} value={option}>{option}</option>
                      ))}
                    </select>
                  </div>
                );
 
              case 'boolean':
                return (
                  <div key={param.name} className="flex items-start space-x-3">
                    <input
                      id={`param-${param.name}-${node.id}`}
                      type="checkbox"
                      checked={!!paramValue}
                      onChange={(e) => onChangeNode(node.id, { params: Object.assign({}, params, { [param.name]: e.target.checked }) })}
                      className="mt-1 h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                    />
                    <div className="flex flex-col">
                      <label htmlFor={`param-${param.name}-${node.id}`} className="text-sm font-medium text-gray-700">
                        {param.name}
                      </label>
                      {param.description && (
                        <span className="text-xs text-gray-500">{param.description}</span>
                      )}
                    </div>
                  </div>
                );

              case 'object':
                return (
                  <div key={param.name}>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      {param.name}
                      {param.description && (
                        <span className="text-xs text-gray-500 ml-2">({param.description})</span>
                      )}
                    </label>
                    <textarea
                      value={paramValue}
                      onChange={(e) => onChangeNode(node.id, { params: Object.assign({}, params, { [param.name]: e.target.value }) })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors duration-150"
                      rows={3}
                      placeholder="Enter JSON object"
                    />
                  </div>
                );

              case 'string':
              default:
                return (
                  <div key={param.name}>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      {param.name}
                      {param.description && (
                        <span className="text-xs text-gray-500 ml-2">({param.description})</span>
                      )}
                    </label>
                    <input
                      type="text"
                      value={paramValue}
                      onChange={(e) => onChangeNode(node.id, { params: Object.assign({}, params, { [param.name]: e.target.value }) })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors duration-150"
                      placeholder={param.description || `Enter ${param.name}`}
                    />
                  </div>
                );
            }
          });
        })()}
      </div>
    </div>
  );
};

// Dynamic node configuration function
function getNodeConfig(type, nodeTypes) {
  const nodeType = nodeTypes.find(nt => nt.name === type);
  if (!nodeType) {
    // Fallback config
    return {
      color: 'bg-gray-400',
      bgColor: 'bg-gray-50',
      borderColor: 'border-gray-200',
      icon: 'fas fa-cube'
    };
  }

  // Convert hex colors to Tailwind classes
  const colorToTailwind = (hex) => {
    const colorMap = {
      '#10b981': 'bg-green-400',
      '#6366f1': 'bg-indigo-400',
      '#f59e0b': 'bg-orange-400',
      '#ef4444': 'bg-red-400',
      '#8b5cf6': 'bg-purple-400',
      '#06b6d4': 'bg-cyan-400',
      '#84cc16': 'bg-lime-400',
      '#f97316': 'bg-orange-500'
    };
    return colorMap[hex] || 'bg-gray-400';
  };

  const bgColorToTailwind = (hex) => {
    const colorMap = {
      '#f0fdf4': 'bg-green-50',
      '#eef2ff': 'bg-indigo-50',
      '#fff7ed': 'bg-orange-50',
      '#fef2f2': 'bg-red-50',
      '#faf5ff': 'bg-purple-50',
      '#ecfeff': 'bg-cyan-50',
      '#f7fee7': 'bg-lime-50',
      '#fff7ed': 'bg-orange-50'
    };
    return colorMap[hex] || 'bg-gray-50';
  };

  const borderColorToTailwind = (hex) => {
    const colorMap = {
      '#bbf7d0': 'border-green-200',
      '#c7d2fe': 'border-indigo-200',
      '#fed7aa': 'border-orange-200',
      '#fecaca': 'border-red-200',
      '#ddd6fe': 'border-purple-200',
      '#a5f3fc': 'border-cyan-200',
      '#d9f99d': 'border-lime-200',
      '#fed7aa': 'border-orange-200'
    };
    return colorMap[hex] || 'border-gray-200';
  };

  return {
    color: colorToTailwind(nodeType.color),
    bgColor: bgColorToTailwind(nodeType.bgColor),
    borderColor: borderColorToTailwind(nodeType.borderColor),
    icon: nodeType.icon
  };
}

const Canvas = React.forwardRef(function Canvas(props, ref) {
  const {
    workflow,
    selectedNodeId,
    setSelectedNodeId,
    selectedNodeIds,
    setSelectedNodeIds,
    setWorkflow,
    connectState,
    setConnectState,
    selectionBox,
    setSelectionBox,
    panState,
    setPanState,
    canvasState: parentCanvasState,
    onDeleteEdge,
    runWorkflow,
    onContextMenu,
    onCanvasStateChange,
    nodeTypes,
    lastTriggerNodeId,
    setIsFullscreen,
    cacheStatus,
    setContextMenu,
    executingNodeId
  } = props;
  const [nodeDims, setNodeDims] = useState({});
  const [localCanvasState, setLocalCanvasState] = useState({
    isDragging: false,
    isConnecting: false,
    startX: 0,
    startY: 0,
    startOffsetX: 0,
    startOffsetY: 0
  });

  // Use parent canvas state for offset values
  const canvasState = {
    ...localCanvasState,
    offsetX: parentCanvasState.offsetX,
    offsetY: parentCanvasState.offsetY
  };

  // Use the forwarded ref instead of creating a new one
  const nodeRefs = useRef({});

  const setNodeRef = useCallback((id) => {
    return function (el) {
      if (el) {
        nodeRefs.current[id] = el;
      } else {
        delete nodeRefs.current[id];
      }
    };
  }, []); // Empty dependency array - function never changes

  // Measure node dimensions in useEffect to avoid infinite loops
  useEffect(() => {
    const newDims = {};
    let hasChanges = false;

    Object.entries(nodeRefs.current).forEach(([id, el]) => {
      if (el) {
        const rect = el.getBoundingClientRect();
        const w = rect.width;
        const h = rect.height;

        const old = nodeDims[id] || {};
        if (Math.abs((old.w || 0) - w) > 1 || Math.abs((old.h || 0) - h) > 1) {
          newDims[id] = { w, h };
          hasChanges = true;
        } else {
          newDims[id] = old;
        }
      }
    });

    if (hasChanges) {
      setNodeDims(newDims);
    }
  }, [workflow.nodes.length]); // Only re-run when number of nodes changes

  function onNodeDragStart(e, node) {
    if (e.target && e.target.classList.contains('handle')) return;
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    let hasDragged = false;

    // Store current selection state
    const wasMultiSelected = selectedNodeIds.has(node.id);
    const wasSingleSelected = selectedNodeId === node.id;

    // Determine which nodes to drag
    const nodesToDrag = [];
    if (selectedNodeIds.has(node.id)) {
      // If the clicked node is part of multi-selection, drag all selected nodes
      nodesToDrag.push(...workflow.nodes.filter(n => selectedNodeIds.has(n.id)));
    } else if (selectedNodeId === node.id) {
      // If it's the single selected node, drag just this one
      nodesToDrag.push(node);
    } else {
      // If clicking on an unselected node, we'll handle selection in onUp based on whether we dragged
      nodesToDrag.push(node);
    }

    // Store original positions for all nodes to drag
    const originalPositions = nodesToDrag.map(n => ({
      id: n.id,
      x: (n.position && n.position.x) || 0,
      y: (n.position && n.position.y) || 0
    }));

    function onMove(ev) {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;

      // Mark as dragged if moved more than 3 pixels
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
        hasDragged = true;
      }

      setWorkflow(function (prev) {
        return {
          nodes: prev.nodes.map(function (n) {
            const originalPos = originalPositions.find(pos => pos.id === n.id);
            if (originalPos) {
              return Object.assign({}, n, {
                position: {
                  x: originalPos.x + dx,
                  y: originalPos.y + dy
                }
              });
            }
            return n;
          }),
          edges: prev.edges
        };
      });
    }

    function onUp() {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);

      // Only change selection if we didn't drag and the node wasn't already selected
      if (!hasDragged && !wasMultiSelected && !wasSingleSelected) {
        setSelectedNodeId(node.id);
        setSelectedNodeIds(new Set());
      }
    }

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  function onCanvasMouseDown(e) {
    // Handle connections and node dragging first
    if (e.target.closest('.handle')) return;
    if (e.target.closest('.node')) return;

    // Middle mouse button (button 1) for panning
    if (e.button === 1) {
      e.preventDefault();
      setPanState({
        active: true,
        startX: e.clientX,
        startY: e.clientY,
        startOffsetX: canvasState.offsetX,
        startOffsetY: canvasState.offsetY
      });
      return;
    }

    e.preventDefault();

    // Left mouse button (button 0) for selection box
    if (e.button === 0) {
      const canvasRect = ref.current.getBoundingClientRect();
      const canvasX = e.clientX - canvasRect.left;
      const canvasY = e.clientY - canvasRect.top;

      console.log('Starting selection box at:', { canvasX, canvasY });

      setSelectionBox({
        active: true,
        startX: canvasX,
        startY: canvasY,
        currentX: canvasX,
        currentY: canvasY,
        debugThing: Date.now()
      });

      // Clear existing selections
      setSelectedNodeId(null);
      setSelectedNodeIds(new Set());
      return;
    }

    // Legacy dragging for other buttons (keep existing behavior)
    setLocalCanvasState(prev => ({
      ...prev,
      isDragging: true,
      startX: e.clientX,
      startY: e.clientY,
      startOffsetX: canvasState.offsetX,
      startOffsetY: canvasState.offsetY
    }));
  }

  function onCanvasDoubleClick(e) {
    const nodeEl = e.target.closest('.node');
    if (nodeEl) {
      const nodeId = nodeEl.getAttribute('data-id');
      setSelectedNodeId(nodeId);
      setSelectedNodeIds(new Set());
      // Safely handle decorated nodes array
      const nodesArray = workflow.nodes || [];
      const node = nodesArray.find(n => n.id === nodeId);
      if (node && node.type === 'Code') {
        setIsFullscreen(true);
      }
      return;
    }
    // Ignore double-clicks on handles
    if (e.target.closest('.handle')) return;
    // Double-click on empty canvas clears selection
    setSelectedNodeId(null);
    setSelectedNodeIds(new Set());
  }

  function onCanvasMouseMove(e) {
    if (localCanvasState.isDragging) {
      const dx = e.clientX - localCanvasState.startX;
      const dy = e.clientY - localCanvasState.startY;
      const newOffsetX = localCanvasState.startOffsetX + dx;
      const newOffsetY = localCanvasState.startOffsetY + dy;

      // Notify parent component of canvas state changes
      if (onCanvasStateChange) {
        onCanvasStateChange({ offsetX: newOffsetX, offsetY: newOffsetY });
      }
    }
  }

  function onCanvasMouseUp() {
    setLocalCanvasState(prev => ({ ...prev, isDragging: false }));
  }

  function onHandleMouseDown(e, node, side) {
    e.preventDefault();
    e.stopPropagation();
    setLocalCanvasState(prev => ({ ...prev, isConnecting: true }));

    // Get initial mouse position
    const canvasRect = ref.current.getBoundingClientRect();
    const canvasX = e.clientX - canvasRect.left;
    const canvasY = e.clientY - canvasRect.top;

    //console.log('onHandleMouseDown:', { canvasX, canvasY });

    setConnectState(function (s) {
      return Object.assign({}, s, {
        active: true,
        from: { nodeId: node.id, side: side },
        hoverNodeId: null,
        mouseClientX: canvasX,
        mouseClientY: canvasY
      });
    });
  }

  function nodeBounds(node) {
    const dims = nodeDims[node.id];
    const w = (dims && dims.w) || 160;
    const h = (dims && dims.h) || 60;
    const x = ((node.position && node.position.x) || 0);
    const y = ((node.position && node.position.y) || 0);
    return { x, y, w, h };
  }

  function handlePoint(node, side) {
    const b = nodeBounds(node);
    if (side === 'top') return { x: b.x + b.w / 2, y: b.y };
    if (side === 'right') return { x: b.x + b.w, y: b.y + b.h / 2 };
    if (side === 'bottom') return { x: b.x + b.w / 2, y: b.y + b.h };
    if (side === 'left') return { x: b.x, y: b.y + b.h / 2 };
    return { x: b.x + b.w, y: b.y + b.h / 2 };
  }

  function edgeMidpoint(p1, p2) {
    return { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
  }

  useEffect(() => {
    if (localCanvasState.isDragging) {
      window.addEventListener('mousemove', onCanvasMouseMove);
      window.addEventListener('mouseup', onCanvasMouseUp);
      return () => {
        window.removeEventListener('mousemove', onCanvasMouseMove);
        window.removeEventListener('mouseup', onCanvasMouseUp);
      };
    }
  }, [localCanvasState.isDragging]);

  // Prevent middle mouse button scrolling on canvas
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;

    const handleMouseDown = (e) => {
      if (e.button === 1) { // Middle mouse button
        e.preventDefault();
      }
    };

    canvas.addEventListener('mousedown', handleMouseDown);
    return () => {
      canvas.removeEventListener('mousedown', handleMouseDown);
    };
  }, []);

  const transform = `translate(${canvasState.offsetX}px, ${canvasState.offsetY}px)`;

  return (
    <section
      id="canvas"
      ref={ref}
      onMouseDown={onCanvasMouseDown}
      onDoubleClick={onCanvasDoubleClick}
      onContextMenu={onContextMenu}
      onMouseMove={function (e) {
        if (!connectState.active) return;
        const target = e.target.closest('.node');
        const nodeId = target ? target.getAttribute('data-id') : null;
        setConnectState(function (s) { return Object.assign({}, s, { hoverNodeId: nodeId }); });
      }}
      style={{
        cursor: localCanvasState.isDragging ? 'grabbing' :
          panState.active ? 'grabbing' :
            selectionBox.active ? 'crosshair' : 'grab'
      }}
    >
      {/* Transformed container for nodes and edges */}
      <div className="canvas-container" style={{ transform }}>
        {/* SVG overlay for edges - now inside transformed container */}
        <svg className="edges-svg" style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 1 }}>
          <defs>
            <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="8.5" refY="3.5" orient="auto" markerUnits="strokeWidth">
              <polygon points="0 0, 10 3.5, 0 7" fill="#6b7280" />
            </marker>
          </defs>
          {workflow.edges.map(function (edge, idx) {
            const from = workflow.nodes.find(function (n) { return n.id === edge.from; });
            const to = workflow.nodes.find(function (n) { return n.id === edge.to; });
            if (!from || !to) return null;

            // Use node positions directly (same coordinate space as nodes)
            const p1 = handlePoint(from, 'right');
            const p2 = handlePoint(to, 'left');

            const mid = edgeMidpoint(p1, p2);
            const d = 'M ' + p1.x + ' ' + p1.y + ' L ' + p2.x + ' ' + p2.y;
            return (
              <g key={idx} className="edge-group" style={{ pointerEvents: 'all' }}>
                <path className="edge-hit" d={d} />
                <path className="edge-line" d={d} markerEnd="url(#arrowhead)" />
                <g transform={'translate(' + mid.x + ',' + mid.y + ')'} onClick={function () { onDeleteEdge(idx); }} style={{ cursor: 'pointer' }}>
                  <circle className="edge-delete-bg" r="9" />
                  <line className="edge-delete" x1="-4" y1="-4" x2="4" y2="4" />
                  <line className="edge-delete" x1="4" y1="-4" x2="-4" y2="4" />
                </g>
              </g>
            );
          })}
          {connectState.active && connectState.from ? (function () {
            const from = workflow.nodes.find(function (n) { return n.id === connectState.from.nodeId; });
            if (!from) return null;
            const p1 = handlePoint(from, connectState.from.side || 'right');

            // Adjust mouse coordinates for canvas transform
            const p2 = {
              x: connectState.mouseClientX - canvasState.offsetX,
              y: connectState.mouseClientY - canvasState.offsetY
            };
            console.log('Preview edge:', {
              p1, p2,
              mouseClientX: connectState.mouseClientX,
              mouseClientY: connectState.mouseClientY,
              offsetX: canvasState.offsetX,
              offsetY: canvasState.offsetY
            });
            const d = 'M ' + p1.x + ' ' + p1.y + ' L ' + p2.x + ' ' + p2.y;
            return <path className="edge-line" d={d} strokeDasharray="4 4" />;
          })() : null}
        </svg>

        {workflow.nodes.map(function (node) {
          const classNames = ['node'];
          if (selectedNodeId === node.id || selectedNodeIds.has(node.id)) classNames.push('selected');
          if (node.showTop) classNames.push('show-top');
          if (node.showRight) classNames.push('show-right');
          if (node.showBottom) classNames.push('show-bottom');
          if (node.showLeft) classNames.push('show-left');
          if (!node.showTop && !node.showRight && !node.showBottom && !node.showLeft) classNames.push('no-conn');

          // Add active trigger class for the trigger that will run on Ctrl+Enter or Run button
          // But only if it's not currently selected (to avoid double borders)
          if (node.type === 'Trigger') {
            const activeTrigger = lastTriggerNodeId || workflow.nodes.find(n => n.type === 'Trigger')?.id;
            const isSelected = selectedNodeId === node.id || selectedNodeIds.has(node.id);
            if (node.id === activeTrigger && !isSelected) {
              classNames.push('active-trigger');
            }
          }

          // Add executing class for currently executing node
          if (node.id === executingNodeId) {
            classNames.push('executing');
          }

          const nodeConfig = getNodeConfig(node.type, nodeTypes);

          return (
            <div
              key={node.id}
              data-id={node.id}
              ref={setNodeRef(node.id)}
              className={classNames.join(' ')}
              style={{
                left: ((node.position && node.position.x) || 0),
                top: ((node.position && node.position.y) || 0),
                backgroundColor: (() => {
                  const nodeType = nodeTypes.find(nt => nt.name === node.type);
                  return nodeType?.bgColor || '#ffffff';
                })(),
                borderColor: (() => {
                  const nodeType = nodeTypes.find(nt => nt.name === node.type);
                  return nodeType?.borderColor || '#d1d5db';
                })()
              }}
              onMouseDown={function (e) { return onNodeDragStart(e, node); }}
              onClick={function () {
                setSelectedNodeId(node.id);
                setSelectedNodeIds(new Set()); // Clear multi-selection
              }}
              onContextMenu={function (e) {
                e.preventDefault();
                e.stopPropagation();
                setContextMenu({
                  visible: true,
                  x: e.clientX,
                  y: e.clientY,
                  nodeId: node.id,
                  isNodeMenu: true
                });
              }}
              onMouseOver={function (e) { e.currentTarget.classList.add('hover'); }}
              onMouseOut={function (e) { e.currentTarget.classList.remove('hover'); }}
            >
              {/* SVG animated outline for active trigger */}
              {classNames.includes('active-trigger') && (
                <svg className="moving-outline" viewBox="0 0 160 60" aria-hidden="true">
                  <rect x="1" y="1" width="158" height="58" rx="13" ry="13" />
                </svg>
              )}

              <div className="title flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <i className={`${nodeConfig.icon} text-lg`}></i>
                  <span>{node.type}</span>
                  {cacheStatus[node.id]?.hasCache && (
                    <div className="w-2 h-2 bg-green-500 rounded-full" title="Has cached output"></div>
                  )}
                </div>
                {node.type === 'Trigger' ? (
                  <button
                    title="Run Workflow"
                    className="ml-2 inline-flex items-center justify-center w-5 h-5 rounded-full bg-emerald-600 text-white hover:bg-emerald-700 text-xs transition-colors duration-150"
                    onClick={function (ev) { ev.stopPropagation(); runWorkflow(node.id); }}
                  >
                    <i className="fas fa-play text-xs"></i>
                  </button>
                ) : null}
              </div>
              <div
                className="handle top"
                onMouseDown={function (e) { onHandleMouseDown(e, node, 'top'); }}
                style={{ transform: `translate(-50%, 0) scale(${1})` }}
              />
              <div
                className="handle right"
                onMouseDown={function (e) { onHandleMouseDown(e, node, 'right'); }}
                style={{ transform: `translate(0, -50%) scale(${1})` }}
              />
              <div
                className="handle bottom"
                onMouseDown={function (e) { onHandleMouseDown(e, node, 'bottom'); }}
                style={{ transform: `translate(-50%, 0) scale(${1})` }}
              />
              <div
                className="handle left"
                onMouseDown={function (e) { onHandleMouseDown(e, node, 'left'); }}
                style={{ transform: `translate(0, -50%) scale(${1})` }}
              />
            </div>
          );
        })}
      </div>

      {/* Selection box - positioned relative to canvas, not transformed container */}
      {selectionBox.active && (
        <div
          className="selection-box"
          style={{
            position: 'absolute',
            left: Math.min(selectionBox.startX, selectionBox.currentX),
            top: Math.min(selectionBox.startY, selectionBox.currentY),
            width: Math.abs(selectionBox.currentX - selectionBox.startX),
            height: Math.abs(selectionBox.currentY - selectionBox.startY),
            border: '2px dashed #3b82f6',
            backgroundColor: 'rgba(59, 130, 246, 0.1)',
            pointerEvents: 'none',
            zIndex: 1000
          }}
        />
      )}
    </section>
  );
});

function updateMouseFromEvent(ev, canvasEl, state) {
  if (!canvasEl) return state;
  const rect = canvasEl.getBoundingClientRect();
  const mouseX = ev.clientX - rect.left + canvasEl.scrollLeft;
  const mouseY = ev.clientY - rect.top + canvasEl.scrollTop;
  return Object.assign({}, state, { mouseX: mouseX, mouseY: mouseY });
}

function prettifyWorkflow(setWorkflow, callback) {
  setWorkflow(function (prev) {
    var nodes = prev.nodes.slice();
    var edges = prev.edges.slice();
    var idToNode = {};
    nodes.forEach(function (n) { idToNode[n.id] = n; });

    var outgoing = {};
    var incoming = {};
    var indeg = {};
    nodes.forEach(function (n) { outgoing[n.id] = []; incoming[n.id] = []; indeg[n.id] = 0; });
    edges.forEach(function (e) {
      if (outgoing[e.from]) outgoing[e.from].push(e.to);
      if (incoming[e.to]) incoming[e.to].push(e.from);
      if (indeg[e.to] !== undefined) indeg[e.to] += 1;
    });

    var depth = {};
    var queue = [];
    nodes.forEach(function (n) { depth[n.id] = 0; });
    nodes.forEach(function (n) { if (indeg[n.id] === 0) queue.push(n.id); });
    if (queue.length === 0) { nodes.forEach(function (n) { queue.push(n.id); }); }
    var indegWork = Object.assign({}, indeg);
    while (queue.length > 0) {
      var id = queue.shift();
      var outs = outgoing[id] || [];
      for (var i = 0; i < outs.length; i++) {
        var to = outs[i];
        depth[to] = Math.max(depth[to] || 0, (depth[id] || 0) + 1);
        indegWork[to] = (indegWork[to] || 0) - 1;
        if (indegWork[to] === 0) queue.push(to);
      }
    }

    var layers = {};
    var maxDepth = 0;
    nodes.forEach(function (n) {
      var d = depth[n.id] || 0;
      if (!layers[d]) layers[d] = [];
      layers[d].push(n.id);
      if (d > maxDepth) maxDepth = d;
    });

    var left = 120, top = 80, xSpacing = 240, ySpacing = 120;
    var yPos = {};

    var layer0 = layers[0] || [];
    for (var i0 = 0; i0 < layer0.length; i0++) {
      var id0 = layer0[i0];
      yPos[id0] = top + i0 * ySpacing;
      idToNode[id0].position = { x: left + 0 * xSpacing, y: yPos[id0] };
    }

    for (var d = 1; d <= maxDepth; d++) {
      var layerIds = (layers[d] || []).slice();
      var items = layerIds.map(function (id) {
        var parents = incoming[id] || [];
        var sum = 0, cnt = 0;
        for (var p = 0; p < parents.length; p++) {
          var py = yPos[parents[p]];
          if (typeof py === 'number') { sum += py; cnt += 1; }
        }
        var desired = cnt > 0 ? (sum / cnt) : (top + layerIds.indexOf(id) * ySpacing);
        return { id: id, desired: desired };
      });
      items.sort(function (a, b) { return a.desired - b.desired; });
      var lastY = -Infinity;
      for (var k = 0; k < items.length; k++) {
        var cur = items[k];
        var proposed = Math.max(cur.desired, (isFinite(lastY) ? lastY + ySpacing : top));
        yPos[cur.id] = proposed;
        idToNode[cur.id].position = { x: left + d * xSpacing, y: proposed };
        lastY = proposed;
      }
    }

    return { nodes: nodes, edges: edges };
  });

  // Call callback if provided
  if (callback) {
    setTimeout(callback, 0);
  }
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />); 