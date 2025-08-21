let workflow = { nodes: [], edges: [] };
let selectedNodeId = null;

const canvasEl = document.getElementById('canvas');
const propsEl = document.getElementById('props');
const btnSave = document.getElementById('btn-save');
const btnRun = document.getElementById('btn-run');
const btnAddNode = document.getElementById('btn-add-node');
const addNodeType = document.getElementById('add-node-type');
const edgeFromSel = document.getElementById('edge-from');
const edgeToSel = document.getElementById('edge-to');
const btnAddEdge = document.getElementById('btn-add-edge');
const edgesList = document.getElementById('edges-list');
const consoleOut = document.getElementById('console-output');

function $(sel) { return document.querySelector(sel); }

async function loadWorkflow() {
  const res = await fetch('/api/workflow');
  workflow = await res.json();
  if (!Array.isArray(workflow.nodes)) workflow.nodes = [];
  if (!Array.isArray(workflow.edges)) workflow.edges = [];
  render();
}

function saveWorkflow() {
  return fetch('/api/workflow', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(workflow)
  });
}

function runWorkflow() {
  consoleOut.textContent = 'Running...\n';
  return fetch('/api/run', { method: 'POST' })
    .then(r => r.json())
    .then(data => {
      if (data.ok) {
        consoleOut.textContent = (data.logs || []).join('\n') + '\n\nOutputs:\n' + JSON.stringify(data.outputs, null, 2);
      } else {
        consoleOut.textContent = 'Run failed: ' + (data.error || 'Unknown error');
      }
    })
    .catch(e => {
      consoleOut.textContent = 'Run error: ' + e.message;
    });
}

function render() {
  canvasEl.innerHTML = '';
  // SVG for edges
  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.classList.add('edges-svg');
  svg.setAttribute('width', '2000');
  svg.setAttribute('height', '2000');
  canvasEl.appendChild(svg);

  // Nodes
  for (const node of workflow.nodes) {
    const el = document.createElement('div');
    el.className = 'node' + (node.id === selectedNodeId ? ' selected' : '');
    el.style.left = (node.position?.x || 0) + 'px';
    el.style.top = (node.position?.y || 0) + 'px';

    const title = document.createElement('div');
    title.className = 'title';
    title.textContent = `${node.type} (${node.id})`;

    el.appendChild(title);
    el.addEventListener('mousedown', (e) => startDrag(e, node));
    el.addEventListener('click', () => { selectedNodeId = node.id; renderProps(); render(); });
    canvasEl.appendChild(el);
  }

  // Edges
  for (const edge of workflow.edges) {
    const from = workflow.nodes.find(n => n.id === edge.from);
    const to = workflow.nodes.find(n => n.id === edge.to);
    if (!from || !to) continue;
    const x1 = (from.position?.x || 0) + 60;
    const y1 = (from.position?.y || 0) + 24;
    const x2 = (to.position?.x || 0) + 60;
    const y2 = (to.position?.y || 0) + 24;
    const path = document.createElementNS(svgNS, 'path');
    path.setAttribute('class', 'edge-line');
    const d = `M ${x1} ${y1} C ${x1 + 50} ${y1} ${x2 - 50} ${y2} ${x2} ${y2}`;
    path.setAttribute('d', d);
    svg.appendChild(path);
  }

  // Edge controls
  edgeFromSel.innerHTML = '';
  edgeToSel.innerHTML = '';
  for (const n of workflow.nodes) {
    const opt1 = document.createElement('option'); opt1.value = n.id; opt1.textContent = n.id; edgeFromSel.appendChild(opt1);
    const opt2 = document.createElement('option'); opt2.value = n.id; opt2.textContent = n.id; edgeToSel.appendChild(opt2);
  }

  // Edges list
  edgesList.innerHTML = '';
  workflow.edges.forEach((e, idx) => {
    const li = document.createElement('li');
    li.textContent = `${e.from} → ${e.to}`;
    const del = document.createElement('button');
    del.textContent = 'x';
    del.style.marginLeft = '8px';
    del.onclick = () => { workflow.edges.splice(idx, 1); render(); };
    li.appendChild(del);
    edgesList.appendChild(li);
  });

  renderProps();
}

function renderProps() {
  propsEl.innerHTML = '';
  const node = workflow.nodes.find(n => n.id === selectedNodeId);
  if (!node) {
    propsEl.textContent = 'Select a node';
    return;
  }

  const idInput = document.createElement('input');
  idInput.value = node.id;
  idInput.onchange = () => { node.id = idInput.value; render(); };
  propsEl.appendChild(labelWrap('ID', idInput));

  const typeSel = document.createElement('select');
  ['Trigger','Code','Log'].forEach(t => {
    const opt = document.createElement('option'); opt.value = t; opt.textContent = t; if (t === node.type) opt.selected = true; typeSel.appendChild(opt);
  });
  typeSel.onchange = () => { node.type = typeSel.value; renderProps(); };
  propsEl.appendChild(labelWrap('Type', typeSel));

  // Params editor
  node.params = node.params || {};
  if (node.type === 'Code') {
    const ta = document.createElement('textarea');
    ta.value = node.params.code || '';
    ta.rows = 8;
    ta.onchange = () => { node.params.code = ta.value; };
    propsEl.appendChild(labelWrap('Code (must return context)', ta));
  } else if (node.type === 'Log') {
    const inp = document.createElement('input');
    inp.value = node.params.message || '';
    inp.onchange = () => { node.params.message = inp.value; };
    propsEl.appendChild(labelWrap('Message (supports {{path}})', inp));
  } else {
    const note = document.createElement('div');
    note.textContent = 'No params';
    propsEl.appendChild(note);
  }
}

function labelWrap(label, el) {
  const wrap = document.createElement('div');
  const l = document.createElement('div'); l.textContent = label; l.style.fontSize = '12px'; l.style.color = '#555';
  wrap.appendChild(l); wrap.appendChild(el); return wrap;
}

function startDrag(e, node) {
  e.preventDefault();
  const startX = e.clientX; const startY = e.clientY;
  const origX = node.position?.x || 0; const origY = node.position?.y || 0;

  function onMove(ev) {
    const dx = ev.clientX - startX; const dy = ev.clientY - startY;
    node.position = { x: origX + dx, y: origY + dy };
    render();
  }
  function onUp() {
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('mouseup', onUp);
  }
  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);
}

btnSave.onclick = () => { saveWorkflow(); };
btnRun.onclick = () => { runWorkflow(); };
btnAddNode.onclick = () => {
  const id = 'node-' + Math.random().toString(36).slice(2, 7);
  workflow.nodes.push({ id, type: addNodeType.value, params: {}, position: { x: 100, y: 100 } });
  selectedNodeId = id;
  render();
};
btnAddEdge.onclick = () => {
  const from = edgeFromSel.value; const to = edgeToSel.value;
  if (from && to && from !== to) {
    workflow.edges.push({ from, to });
    render();
  }
};

loadWorkflow(); 