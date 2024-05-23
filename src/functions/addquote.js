const { app } = require('@azure/functions');
const CosmosClient = require('@azure/cosmos').CosmosClient;
const axios = require('axios');

app.http('addquote', {
    methods: ['GET', 'POST'],
    authLevel: 'anonymous',
    handler: async (request, context) => {
        context.log(`Http function processed request for url "${request.url}"`);

        const body = await request.text();
        const bodyObject = JSON.parse(body);
        const commandOptions = bodyObject.data.options;
        context.info("Request body: " + body);

        try {
            context.info("Sending component to gather quote data, then be processed by addquoteprocessing");

            var discordQuoteSubmitFormResponse = await axios.patch(`https://discord.com/api/webhooks/${bodyObject.application_id}/${bodyObject.token}/messages/@original`,
                {
                    "title": "Quote Entry Form",
                    "custom_id": "quote_submit_form",
                    "components": [
                        {
                            "type": 1,
                            "components": [{
                                "type": 4,
                                "custom_id": "quote_text",
                                "label": "Quote Text: ",
                                "style": 1,
                                "placeholder": "Enter the quote text here...",
                                "required": true
                            }]
                        },
                        {
                            "type": 1,
                            "components": [{
                                "type": 4,
                                "custom_id": "quote_attribution",
                                "label": "Quote Attribution: ",
                                "style": 1,
                                "placeholder": "Enter the quote attribution here...",
                                "required": true
                            }]
                        },
                        {
                            "type": 1,
                            "components": [{
                                "type": 4,
                                "custom_id": "quote_game",
                                "label": "Game: ",
                                "style": 1,
                                "placeholder": "Enter the game here...",
                                "required": true
                            }]
                        }
                    ]
                },
                {
                    'Content-Type': 'application/json'
                }
            );
            return { status: 200 };
        } catch (error) {
            context.error("An error occurred while sending the quote entry form.");
            context.error(error);
            axios.patch(`https://discord.com/api/webhooks/${bodyObject.application_id}/${bodyObject.token}/messages/@original`,
                {
                    'content': `Error sending or getting quote entry form.`,
                    'components': []
                },
                {
                    'Content-Type': 'application/json'
                });
            return { status: 200 };
        
        }
    }
});
