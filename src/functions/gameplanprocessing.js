const { app } = require('@azure/functions');
const CosmosClient = require('@azure/cosmos').CosmosClient;
const axios = require('axios');

app.http('gameplanprocessing', {
    methods: ['GET', 'POST'],
    authLevel: 'anonymous',
    handler: async (request, context) => {
        context.log(`Http function processed request for url "${request.url}"`);

        // Getting request body and options
        const body = await request.text();
        const bodyObject = JSON.parse(body);
        context.info("Request body: " + body);
        const componentData = bodyObject.data;
        context.info("Component Data: " + JSON.stringify(componentData));
        var userInputHost = componentData.custom_id; //name of the host
        var playHost = userInputHost.toLowerCase(); //lowercase name of the host
        context.log("Play Host: " + playHost);
        var categoryId = componentData.values[0];
        var twitchLogin; //twitch login for the channel (based on Discord server now...)
        var qs;
        var scheduleResponse;
        var scheduleSegmentUpdate;
        var segmentId;
        var segmentTitle;
        var segmentStartTime;

        try {
            // bodyObject.message.id
            const deleteFollowup = axios.delete(`https://discord.com/api/webhooks/${bodyObject.application_id}/${bodyObject.token}/messages/${bodyObject.message.id}`);
            context.info("Follow up message deleted: " + deleteFollowup.status);
        } catch (error) {  
            context.error("An error occurred while removing the follow up message.");
            context.error(error);
        }

        // Connecting to DB client
        context.info("Connecting to Cosmos DB...")
        const client = await new CosmosClient(process.env.CosmosDbConnectionSetting);
        const database = await client.database('playdatesBot');
        const container = await database.container('twitchAuthorization');
        
        context.info("Getting Twitch Login based on Discord server...");
        switch (bodyObject.guild_id) {
            case '828634187175034900':
                twitchLogin = "palmettobling"
                break;
            case '208988601474613249':
                switch (playHost) {
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
            query: `SELECT * FROM c WHERE c.login = '${twitchLogin}'`
        };
        const { resources } = await container.items.query(twitchQuerySpec).fetchAll();
        const twitchInfo = resources[0];

        try {
            // Getting Twitch Access Token
            context.info("Getting Twitch Access Token...");
            qs = new URLSearchParams({
                client_id: process.env.TWITCH_CLIENT_ID,
                client_secret: process.env.TWITCH_CLIENT_SECRET,
                grant_type: 'refresh_token',
                refresh_token: twitchInfo.refresh_token
            })
            var tokenResponse = await axios.post(`https://id.twitch.tv/oauth2/token?${qs}`);
            tokenInfo = tokenResponse.data;
            twitchInfo.access_token = tokenInfo.access_token;
            twitchInfo.refresh_token = tokenInfo.refresh_token;
            twitchInfo.scope = tokenInfo.scope;
            container.items.upsert(twitchInfo);
            context.info("Updated tokens in DB");
        } catch (error) {
            context.error("An error occurred while getting the Twitch Access Token.");
            context.error(error);
            return { status: 500 };
        }
        
        // Get Schedule for Channel
        try {
            context.info("Getting the schedule for the channel...")
            qs = new URLSearchParams({
                broadcaster_id: twitchInfo.twitchUserId
            });
            scheduleResponse = await axios.get(`https://api.twitch.tv/helix/schedule?${qs}`, {
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
        
        //Iterate through schedule to find the segment ID for the host
        const scheduleArray = scheduleResponse.data.data.segments;
        context.info("iterating through schedule array...");
        for (let i = 0; i < scheduleArray.length; i++) {
            context.info("Segment Title: " + scheduleArray[i].title);
            if ((scheduleArray[i].title).toLowerCase().includes(playHost) && (scheduleArray[i].is_recurring === true)) {
                context.info("Found segment for host: " + playHost);
                segmentId = scheduleArray[i].id;
                segmentTitle = scheduleArray[i].title;
                segmentStartTime = scheduleArray[i].start_time;
                context.info("Segment ID: " + segmentId);
                break;
            }
        }

        // Check game selection data
        if (componentData.values[0] === "none") {
            context.info("Returning message if 'no' game is selected")
            await axios.patch(`https://discord.com/api/webhooks/${bodyObject.application_id}/${bodyObject.token}/messages/@original`, 
            {
                'content': `If the game was not in the selection list, please review the initial spelling.`
            },
            {
                'Content-Type': 'application/json'
            });
            return { status: 200 };
        } else {
            context.info("Setting game selection: " + componentData.values[0])
            var categoryId = componentData.values[0];
        }

        try {
            // Update the segment with the category ID
            qs = new URLSearchParams({
                broadcaster_id: twitchInfo.twitchUserId,
                id: segmentId,
            });
            scheduleSegmentUpdate = await axios.patch(`https://api.twitch.tv/helix/schedule/segment?${qs}`, 
            {
                'category_id': categoryId
            },
            {
                headers: {
                    'Authorization': `Bearer ${tokenInfo.access_token}`,
                    'Client-Id': process.env.TWITCH_CLIENT_ID,
                    'Content-Type': 'application/json'
                }
            });
            context.info("Schedule Segment Update: " + JSON.stringify(scheduleSegmentUpdate.data));
        } catch (error) {
            context.error("An error occurred while updating the schedule segment.");
            context.error(error);
            axios.patch(`https://discord.com/api/webhooks/${bodyObject.application_id}/${bodyObject.token}/messages/@original`, 
                {
                    'content': `Error updating the schedule segment for ${segmentTitle} on the ${twitchLogin} Twitch channel.`
                },
                {
                    'Content-Type': 'application/json'
                });
            return { status: 200 };
        }
        
       // Update discord on status of schedule update
       if (scheduleSegmentUpdate.status === 200) {
            context.info("Schedule segment updated successfully.");
            var options = {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
                hour: 'numeric',
                minute: 'numeric',
                timeZone: 'America/Los_Angeles',
                timeZoneName: 'short'
            };
            var gameStartText = new Intl.DateTimeFormat('en', options).format(new Date(segmentStartTime));
            context.info("Game Start Time: " + gameStartText);

            await axios.post(`https://discord.com/api/webhooks/${bodyObject.application_id}/${bodyObject.token}`, 
                {
                    'content': `The show "${segmentTitle}" on **${gameStartText}*8 has been updated to ${scheduleSegmentUpdate.data.data.segments[0].category.name}.`
                },
                {
                    'Content-Type': 'application/json'
                });
            return { status: 200 };
        } else {
            context.warn("Schedule segment update failed.");
            axios.post(`https://discord.com/api/webhooks/${bodyObject.application_id}/${bodyObject.token}`, 
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
