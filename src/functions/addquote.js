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
            
            var discordGameMenuSelection = await axios.post(`https://discord.com/api/webhooks/${bodyObject.application_id}/${bodyObject.token}`,
                {
                    'title': 'Add A Quote',
                    'custom_id': 'quote_entry_form',
                    'components': [
                        {
                            'type': 1,
                            'components': [{
                                'type': 4,
                                'custom_id': 'quote_text',
                                'style': 1,
                                'label': 'Quote Text',
                                'placeholder': 'Enter the quote text here...'
                            }]
                        },
                        {
                            'type': 1,
                            'components': [{
                                'type': 4,
                                'custom_id': 'quote_attribution',
                                'style': 1,
                                'label': 'Quote Attribution',
                                'placeholder': 'Enter who said the quote here...'
                            }]
                        },
                        {
                            'type': 1,
                            'components': [{
                                'type': 4,
                                'custom_id': 'quote_game',
                                'style': 1,
                                'label': 'Game',
                                'placeholder': 'Enter the game played while the quote was said...'
                            }]
                        }
                    ]
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
