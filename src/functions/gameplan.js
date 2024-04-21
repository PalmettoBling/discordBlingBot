const { app } = require('@azure/functions');
const CosmosClient = require('@azure/cosmos').CosmosClient;
const axios = require('axios');

app.http('gameplan', {
    methods: ['GET', 'POST'],
    authLevel: 'anonymous',
    handler: async (request, context) => {
        context.log(`Http function processed request for url "${request.url}"`);
        // Will update the Twitch Stream Channel Schedule 

        // Getting request body and options
        const body = await request.text();
        const bodyObject = JSON.parse(body);
        context.info("Request body: " + body);
        const commandOptions = bodyObject.data.options;
        context.info("Command Options: " + JSON.stringify(commandOptions));
        
        // Getting App Token
        const appToken = await axios.post('https://id.twitch.tv/oauth2/token', {
            client_id: process.env.TWITCH_CLIENT_ID,
            client_secret: process.env.TWITCH_CLIENT_SECRET,
            grant_type: 'client_credentials'
        }, {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        });
        context.info("App Token Request Status: " + JSON.stringify(appToken.status));
        
        // Searching for Category ID from game
        try {
            context.info("Searching for Category ID from game...");
            var gameName = commandOptions[1].value;
            qs = new URLSearchParams({
                query: gameName
            });

            var gameResponse = await axios.get(`https://api.twitch.tv/helix/search/categories?${qs}`,
            {
                headers: {
                    'Authorization': `Bearer ${appToken.data.access_token}`,
                    'Client-Id': process.env.TWITCH_CLIENT_ID,
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            });
            context.info("Game Response: " + JSON.stringify(gameResponse.data));
        } catch (error) {
            context.error("An error occurred while searching for the game.");
            context.error(error);
        }

        try {
            var discordGameMenuSelection = await axios.patch(`https://discord.com/api/webhooks/${bodyObject.application_id}/${bodyObject.token}/messages/@original`, {
                'content': `Please select the Host and Game: `,
                'components': [{
                    'type': 1,
                    'components': [{
                        'type': 3,
                        'custom_id': 'playhost',
                        'options': [
                            {
                                'label': 'PalmettoBling',
                                'value': 'palmettobling'
                            },
                            {
                                'label': 'Xbox Playdates US',
                                'value': 'xboxplaydatesus'
                            },
                            {
                                'label': 'Xbox Playdates GB',
                                'value': 'xboxplaydatesgb'
                            },
                            {
                                'label': 'Xbox Playdates CA',
                                'value': 'xboxplaydatesca'
                            },
                            {
                                'label': 'Xbox Ambassadors',
                                'value': 'xboxambassadors'
                            }
                        ]
                    }],
                    'type': 1,
                    'components': [{
                        'type': 3,
                        'custom_id': 'gameSelection',
                        'options': [
                            {
                                'label': gameResponse.data.data[0].name,
                                'value': gameResponse.data.data[0].id
                            },
                            {
                                'label': gameResponse.data.data[1].name,
                                'value': gameResponse.data.data[1].id
                            },
                            {
                                'label': gameResponse.data.data[2].name,
                                'value': gameResponse.data.data[2].id
                            },
                            {
                                'label': gameResponse.data.data[3].name,
                                'value': gameResponse.data.data[3].id
                            },
                            {
                                'label': "None of these...",
                                "value": "none"
                            }
                        ]
                    }]
                }]
            });
        } catch (error) {
            context.error("An error occurred while sending the game selection menu.");
            context.error(error); 
            axios.patch(`https://discord.com/api/webhooks/${bodyObject.application_id}/${bodyObject.token}/messages/@original`, 
                {
                    'content': `Error sending or getting menu selection items.`
                },
                {
                    'Content-Type': 'application/json'
                });
            return { status: 200 };
        }

        return { status: 200 };
    }
});
