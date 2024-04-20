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
        let tokenInfo;
        let segmentId;
        let segmentTitle;
        let segmentStartTime;
        let qs;

        // Connecting to DB client
        context.info("Connecting to Cosmos DB...")
        const client = await new CosmosClient(process.env.CosmosDbConnectionSetting);
        const database = await client.database('playdatesBot');
        const container = await database.container('twitchAuthorization');

        switch (bodyObject.guild_id) {
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
        context.info("Twitch Login: " + twitchLogin);

        // Getting token and twitch user ID from Cosmos DB
        context.info("Reading Twitch Authorization from Cosmos DB...");
        const twitchQuerySpec = {
            query: `SELECT c.twitchUserId, c.refresh_token, c.id FROM c WHERE c.login = '${twitchLogin}'`
        };
        const { resources } = await container.items.query(twitchQuerySpec).fetchAll();
        const twitchInfo = resources[0];

        try {
            // Getting Twitch Access Token
            context.info("Getting Twitch Access Token...");
            var tokenResponse = await axios.post(`https://id.twitch.tv/oauth2/token?client_id=${process.env.TWITCH_CLIENT_ID}&client_secret=${process.env.TWITCH_CLIENT_SECRET}&grant_type=refresh_token&refresh_token=${twitchInfo.refresh_token}`);
            tokenInfo = tokenResponse.data;
            container.items.upsert(tokenInfo);
        } catch (error) {
            context.error("An error occurred while getting the Twitch Access Token.");
            context.error(error);
            return { status: 500 };
        }
        
        // Searching for Category ID from game
        try {
            context.info("Searching for Category ID from game...");
            var gameName = commandOptions[1].value;
            qs = new URLSearchParams({
                query: gameName,
                first: 4
            });

            var gameResponse = await axios.get(`https://api.twitch.tv/helix/search/categories?${qs}`,
            {
                headers: {
                    'Authorization': `Bearer ${tokenInfo.access_token}`,
                    'Client-Id': process.env.TWITCH_CLIENT_ID,
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            });
            context.info("Game Response: " + JSON.stringify(gameResponse.data));

            // Updating discord message to ask for menu selection of games
            qs = new URLSearchParams({
                wait: true
            });
            
            var discordGameMenuSelection = await axios.post(`https://discord.com/api/v10/interactions/${bodyObject.id}/${bodyObject.token}/callback`, {
                "type": 4, 
                "data": {
                    'content': `Please select the game from the list below:`,
                    'components': [{
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
                                }
                            ]
                        }]
                    }]
                }
            });
            /*
            var discordGameMenuSelection = await axios.patch(`https://discord.com/api/webhooks/${bodyObject.application_id}/${bodyObject.token}/messages/@original`, 
                {
                    'content': `Please select the game from the list below:`,
                    'components': [{
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
                                }
                            ]
                        }]
                    }]
                },
                {
                    'Content-Type': 'application/json'
                });
            context.info("Discord Game Menu Selection: " + JSON.stringify(discordGameMenuSelection.data));
            */
            // Might need to end function here, and start a new function handling interaction response - checking data for "type" (3 , instead of 1)


            //var followUpResponse = await axios.get(`https://discord.com/api/webhooks/${bodyObject.application_id}/${bodyObject.token}/messages/${discordGameMenuSelection.data.id}`);
            //context.info("Follow Up Response: " + JSON.stringify(followUpResponse.data));
            var categoryId = discordGameMenuSelection.data.data.values[0];
            context.info("Category ID: " + categoryId);
        } catch (error) {
            context.error("An error occurred while searching for the game.");
            context.error(error);
        }
        
        // Returning error if no category ID found 
        // assigning value to categoryId if found
        if (!categoryId) {
            context.warn("Game not found.");
            axios.patch(`https://discord.com/api/webhooks/${bodyObject.application_id}/${bodyObject.token}/messages/@original`, 
                {
                    'content': `Game not found. Please check spelling or be more specific.`
                },
                {
                    'Content-Type': 'application/json'
                });
            return { status: 200 };
        }

        // Get Schedule for Channel
        try {
            qs = new URLSearchParams({
                broadcaster_id: twitchInfo.twitchUserId
            });
            var scheduleResponse = await axios.get(`https://api.twitch.tv/helix/schedule?${qs}`, {
                headers: {
                    'Authorization': `Bearer ${tokenInfo.access_token}`,
                    'Client-Id': process.env.TWITCH_CLIENT_ID,
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            });
        } catch (error) {
            context.error("An error occurred while getting the schedule.");
            context.error(error);
            axios.patch(`https://discord.com/api/webhooks/${bodyObject.application_id}/${bodyObject.token}/messages/@original`, 
                {
                    'content': `Error getting the ${twitchLogin} channel twitch schedule.`
                },
                {
                    'Content-Type': 'application/json'
                });
            return { status: 200 };
        }
        context.info("Schedule Response: " + JSON.stringify(scheduleResponse.data));

        //Iterate through schedule to find the segment ID for the host
        const scheduleArray = scheduleResponse.data.segments;
        context.info("iterating through schedule array...");
        for (let i = 0; i < scheduleArray.length; i++) {
            context.info("Segment Title: " + scheduleArray[i].title);
            if ((scheduleArray[i].title).toLowercase().includes(commandOptions.playhost) && (scheduleArray[i].is_recurring === true)) {
                context.info("Found segment for host: " + commandOptions.playhost);
                segmentId = scheduleArray[i].id;
                segmentTitle = scheduleArray[i].title;
                segmentStartTime = scheduleArray[i].start_time;
                context.info("Segment ID: " + segmentId);
                break;
            }
        }

        // Update the segment with the category ID
        qs = new URLSearchParams({
            broadcaster_id: twitchInfo.twitchUserId,
            id: segmentId,
            category_id: categoryId
        });
        const scheduleSegmentUpdate = await axios.patch(`https://api.twitch.tv/helix/schedule/segment?${qs}`, {
            headers: {
                'Authorization': `Bearer ${tokenInfo.access_token}`,
                'Client-Id': process.env.TWITCH_CLIENT_ID,
                'Content-Type': 'application/json'
            }
        });

        // Update discord on status of schedule update
        if (scheduleSegmentUpdate.status === 204) {
            context.info("Schedule segment updated successfully.");
            let options = {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
                hour: 'numeric',
                minute: 'numeric',
                timeZone: 'America/Los_Angeles',
                timeZoneName: 'short'
            };
            const gameStartText = new Intl.DateTimeFormat('en', options).format(new Date(segmentStartTime));

            axios.patch(`https://discord.com/api/webhooks/${bodyObject.application_id}/${bodyObject.token}/messages/@original`, 
                {
                    'content': `The show ${segmentTitle} on ${gameStartText} has been updated to ${gameResponse.data.name}.`
                },
                {
                    'Content-Type': 'application/json'
                });
            return { status: 200 };
        } else {
            context.warn("Schedule segment update failed.");
            axios.patch(`https://discord.com/api/webhooks/${bodyObject.application_id}/${bodyObject.token}/messages/@original`, 
                {
                    'content': `Error processing, but it is possible the update to the Twitch schedule succeeded. Please check the schedule to confirm.`
                },
                {
                    'Content-Type': 'application/json'
                });
            return { status: 200 };
        }
    }
});
