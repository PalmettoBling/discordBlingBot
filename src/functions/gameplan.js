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
        var menuSelectionItems = [];
        
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
        } catch (error) {
            context.error("An error occurred while searching for the game.");
            context.error(error);
        }

        // Processing the gameResponse data for likeliest matches
        context.info("Processing the gameResponse data for likeliest matches.")
        var categoryArray = gameResponse.data.data;
        var menuCategoryArray = categoryArray.filter(category => category.name.toLowerCase().includes(gameName.toLowerCase()));
        for (var i = 0; i < menuCategoryArray.length; i++) {
            menuSelectionItems[i] = {
                'label': menuCategoryArray[i].name,
                'value': menuCategoryArray[i].id
            };
        }
        if (menuSelectionItems.length == 0) {
            context.info("No matches found, sending all categories returned.");
            for (var j = 0; j < menuCategoryArray.length; j++) {
                context.info("Adding Menu Category Array item: " + JSON.stringify(menuCategoryArray[j].name));
                menuSelectionItems.push({ 'label': menuCategoryArray[j].name, 'value': menuCategoryArray[j].id })
            }
        }
        menuSelectionItems.push({ 'label': "None of these games are what I'm playing.", 'value': "none" });

        try {
            context.info("Sending the game selection menu.");
            var discordGameMenuSelection = await axios.patch(`https://discord.com/api/webhooks/${bodyObject.application_id}/${bodyObject.token}/messages/@original`, 
            {
                'content': 'Please verify the Game:',
                'components': [
                    {
                        'type': 1,
                        'components': [
                            {
                                'type': 3,
                                'custom_id': `${commandOptions[0].value}`,
                                'options': menuSelectionItems
                            }]
                    }
                ]
            });
            return { status: 200 };
        } catch (error) {
            context.error("An error occurred while sending the game selection menu.");
            context.error(error); 
            axios.patch(`https://discord.com/api/webhooks/${bodyObject.application_id}/${bodyObject.token}/messages/@original`, 
                {
                    'content': `Error sending or getting menu selection items.`,
                    'components': []
                },
                {
                    'Content-Type': 'application/json'
                });
            return { status: 200 };
        }
    }
});
