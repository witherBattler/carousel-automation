module.exports = {
  name: 'Trigger',
  displayName: 'Trigger',
  description: 'Starts a workflow execution',
  color: '#10b981', // Green
  bgColor: '#f0fdf4',
  borderColor: '#bbf7d0',
  icon: 'fas fa-play',
  category: 'flow',
  inputs: [],
  outputs: ['context'],
  parameters: [{
    name: 'notes',
    type: 'string',
    required: false,
    description: 'The notes to generate the carousel for'
  }, {
    name: "url",
    type: "string",
    required: false,
    description: "The URL of the site to take notes from"
  }, {
    name: "instagram_user_id",
    type: "string",
    required: false,
    description: "Instagram user id (run the other workflow to obtain)"
  }, {
    name: "instagram_access_token",
    type: "string",
    required: false,
    description: "Instagram access token (run the other workflow to obtain)"
  }, {
    name: "auto_post",
    type: "boolean",
    required: false,
    description: "Whether to post on instagram using the instagram_access_token"
  }],
  
  
  async execute(context, params) {
    // Pass-through. Priority: context values override params values (for dashboard mode)
    // This allows the dashboard to override workflow.json values for production use
    const notes = context.notes !== undefined ? context.notes : params.notes;
    const url = context.url !== undefined ? context.url : params.url;
    const instagram_user_id = context.instagram_user_id !== undefined ? context.instagram_user_id : params.instagram_user_id;
    const instagram_access_token = context.instagram_access_token !== undefined ? context.instagram_access_token : params.instagram_access_token;
    const auto_post = context.auto_post !== undefined ? context.auto_post : params.auto_post;
    
    if(!notes && !url) {
      console.log("No notes or URL provided! Critical failure!")
    }

    
    return {
      notes,
      url,
      instagram_user_id,
      instagram_access_token,
      auto_post
    };
  }
}; 