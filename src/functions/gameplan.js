const { app } = require('@azure/functions');
const CosmosClient = require('@azure/cosmos').CosmosClient;
const axios = require('axios');

app.http('gameplan', {
    methods: ['GET', 'POST'],
    authLevel: 'anonymous',
    handler: async (request, context) => {
        context.log(`Http function processed request for url "${request.url}"`);
        // Will update the Twitch Stream Channel Schedule 

        /* discord command needs: 
        * Host
        * Game
        * **Optional** channel (for playdates) only for the playdates guild
        
        Required Information to get Schedule:
        GET https://api.twitch.tv/helix/schedule
            Query Parameters:
                broadcaster_id - will get information based on discord "server": bodyObject.guild_id
            will need "Host" names as a selection option - will be used to search iteratively through response's 'data.segments' array

        Required information to get Categories ID:
        GET https://api.twitch.tv/helix/search/categories
            Query Parameters:
                query - will get information based on the game they will be playing
                first - number of items to return (will set to 4)
        
        Required Information to update: 
        PATCH https://api.twitch.tv/helix/schedule/segment
            Query Parameters:
                broadcaster_id - will get information based on discord "server": bodyObject.guild_id (optional parameter for playdates channel)
                id - Derrived from API call to Get Channel Stream Schedule
            Request Body:
                category_id - Derrived from API call to Search Categories ID of the game they will be playing
        */

        // Getting request body and options
        const body = await request.text();
        const bodyObject = JSON.parse(body);
        context.info("Request body: " + body);
        const commandOptions = bodyObject.data.options;
        let twitchLogin;

        // Connecting to DB client
        context.info("Connecting to Cosmos DB...")
        const client = await new CosmosClient(process.env.CosmosDbConnectionSetting);
        const database = await client.database('playdatesBot');
        const container = await database.container('twitchAuthorization');

        switch (commandOptions.guild_id) {
            case '828634187175034900':
                twitchLogin = "palmettobling"
                break;
            case '208988601474613249':
                switch (commandOptions.playhost) {
                    case "xboxplaydatesus":
                        twitchLogin = "xboxplaydatesus"
                        break;
                    case "xboxplaydatesgb":
                        twitchLogin = "xboxplaydatesgb"
                        break;
                    case "xboxplaydatesca":
                        twitchLogin = "xboxplaydatesca"
                        break;
                }
                break;
            case '309400100130783232':
                twitchLogin = "xboxambassadors"
                break;
        }

        // Getting token and twitch user ID from Cosmos DB
        context.info("Reading Twitch Authorization from Cosmos DB...");
        const twitchQuerySpec = {
            query: `SELECT c.twitchUserId, c.refresh_token FROM c WHERE c.login = '${twitchLogin}'`
        };
        const { resources } = await container.items.query(twitchQuerySpec).fetchAll();
        context.log("Resources: " + JSON.stringify(resources));
        const twitchInfo = resources[0];
        context.info("Twitch Info: " + JSON.stringify(twitchInfo));
        
        // Searching for Category ID from game
        context.info("Searching for Category ID from game...");
        const gameName = commandOptions.game;
        const gameResponse = await axios.get(`https://api.twitch.tv/helix/search/categories?query=${gameName}&first=4`, 
            {},
            { params: {
                gameName
            }});
        context.info("Game Response: " + JSON.stringify(gameResponse.data));
        
        // Returning error if no category ID found 
        // assigning value to categoryId if found
        if (!gameResponse.status === 200 || !gameResponse.data) {
            context.warn("Game not found.");
            return { status: 200, body: { error: 'Game not found. Check the spelling?' }};
        }
        const categoryId = gameResponse.data.data[0].id;

        // Get Schedule for Channel

        //Iterate through schedule to find the segment ID for the host

        // Update the segment with the category ID

        return {  };
    }
});
