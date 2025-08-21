// Paste this into a Code node's `code` parameter.
// Uses the project-level tool `tools.timestamp` (see [`tools/timestamp.js`](tools/timestamp.js:1))
async function handler(context, console, tools) {
  console.log('Tool time:', tools.timestamp.now());
  const id = tools.timestamp.uid();
  console.log('Generated id:', id);
  context.generatedId = id;
  context.generatedAt = tools.timestamp.now();
  // mutate or augment context as needed
  return context;
}