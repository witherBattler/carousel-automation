# Tools Directory

Place your custom Node.js tool scripts here. Each script should export the functionality you want to expose to code nodes.

How it works
- Any `.js` file placed in the `tools/` directory will be loaded and executed fresh at the start of each workflow run.
- Exports from each file are collected into a `tools` object and passed into Code nodes.
  - For example, `tools/timestamp.js` becomes accessible as `tools.timestamp` inside your code node handler.
- Tools are loaded without using a cached require (the server clears the require cache for each tool on every workflow execution), so state does not persist between runs. If a tool exports a function, that function will be invoked (the loader supports factory-style exports returning an object or a Promise).

Example tool (already included)
- [`tools/timestamp.js`](tools/timestamp.js:1) exports:
  - `now()` — returns ISO timestamp string
  - `uid()` — returns a short random id

Example usage inside a Code node
- In your Code node's `code` parameter paste this handler:

```javascript
async function handler(context, console, tools) {
  // Access tools.timestamp.now() and tools.timestamp.uid()
  console.log('Current time from tool:', tools.timestamp.now());
  const id = tools.timestamp.uid();
  context.generatedId = id;
  return context;
}
```

Notes & tips
- If you want a tool to perform asynchronous initialization, export a function that returns a Promise resolving to the tool object. The loader will await it.
- Tool filenames become the key on the `tools` object (filename without `.js`). Avoid name collisions.
- Tools run on the server process — they have full access to Node APIs. Be careful with security and side effects.
