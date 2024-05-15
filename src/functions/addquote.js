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

        try {
            context.info("Sending component to gather quote data, then be processed by addquoteprocessing");
            var discordGameMenuSelection = await axios.patch(`https://discord.com/api/webhooks/${bodyObject.application_id}/${bodyObject.token}/messages/@original`,
                {
                    'content': 'Please enter the quote information below:',
                    'components': [
                        {
                            'type': 1,
                            'components': [
                                {
                                    'type': 3,
                                    'custom_id': 'channelSelect',
                                    'options': [
                                        {
                                            'label': 'XboxPlaydatesCA',
                                            'value': 'xboxplaydatesca'
                                        },
                                        {
                                            'label': 'XboxPlaydatesGB',
                                            'value': 'xboxplaydatesgb'
                                        },
                                        {
                                            'label': 'XboxPlaydatesUS',
                                            'value': 'xboxplaydatesus'
                                        }
                                    ]
                                }
                            ]
                        },
                        {
                            'type': 1,
                            'components': [
                                {
                                    'type': 4,
                                    'custom_id': 'quoteText',
                                    'style': 1,
                                    'label': 'Quote Text',
                                    'placeholder': 'Enter what was said here.'
                                }
                            ]
                        },
                        {
                            'type': 1,
                            'components': [
                                {
                                    'type': 4,
                                    'custom_id': 'quoteAttribution',
                                    'style': 1,
                                    'label': 'Attribution',
                                    'placeholder': 'Who said the thing?  Put that here.'
                                }
                            ]
                        },
                        {
                            'type': 1,
                            'components': [
                                {
                                    'type': 4,
                                    'custom_id': 'quoteGame',
                                    'style': 1,
                                    'label': 'Game',
                                    'placeholder': 'What game were we playing?'
                                }
                            ]
                        }
                    ]
                }
            )
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

        // user enters channel to add the quote initially

        // sends user component

        // addquote_processing function called

        return { status: 200};
    }
});
