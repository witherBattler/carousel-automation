module.exports = {
  name: 'Log',
  displayName: 'Log',
  description: 'Log messages to the console',
  color: '#f59e0b', // Orange
  bgColor: '#fff7ed',
  borderColor: '#fed7aa',
  icon: 'fas fa-terminal',
  category: 'output',
  inputs: ['context'],
  outputs: ['context'],
  parameters: [
    {
      name: 'message',
      type: 'string',
      required: true,
      description: 'Message to log (supports {{variable}}, {{JSON.stringify(object)}}, {{Math.round(number)}} syntax)'
    }
  ],
  
  async execute(context, params, helpers) {
    const messageTemplate = params && params.message;
    let message;
    if (messageTemplate && helpers && typeof helpers.renderTemplateString === 'function') {
      message = helpers.renderTemplateString(messageTemplate, context || {});
    } else if (typeof messageTemplate === 'string') {
      message = messageTemplate;
    } else {
      message = JSON.stringify(context || {});
    }
    if (helpers && Array.isArray(helpers.logs)) {
      const ts = new Date().toISOString();
      const nodeId = helpers.nodeId || 'unknown';
      const logLine = `[${ts}] [${nodeId}] ${message}`;
      helpers.logs.push(logLine);
      
      // Emit log in real-time if emitter is available
      if (helpers.logEmitter) {
        helpers.logEmitter.emit('log', logLine);
      }
    }
    return context || {};
  }
}; 