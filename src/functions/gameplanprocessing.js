const { app } = require('@azure/functions');

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
        var playHost = componentData.values[0];
        var twitchLogin;
        var qs;

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
            var tokenResponse = await axios.post(`https://id.twitch.tv/oauth2/token?client_id=${process.env.TWITCH_CLIENT_ID}&client_secret=${process.env.TWITCH_CLIENT_SECRET}&grant_type=refresh_token&refresh_token=${twitchInfo.refresh_token}`);
            tokenInfo = tokenResponse.data;
            twitchInfo.access_token = tokenInfo.access_token;
            twitchInfo.refresh_token = tokenInfo.refresh_token;
            container.items.upsert(twitchInfo);
            context.info("Updated tokens in DB");
        } catch (error) {
            context.error("An error occurred while getting the Twitch Access Token.");
            context.error(error);
            return { status: 500 };
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
            if ((scheduleArray[i].title).toLowercase().includes(playHost) && (scheduleArray[i].is_recurring === true)) {
                context.info("Found segment for host: " + playHost);
                var segmentId = scheduleArray[i].id;
                var segmentTitle = scheduleArray[i].title;
                var segmentStartTime = scheduleArray[i].start_time;
                context.info("Segment ID: " + segmentId);
                break;
            }
        }

        // Check game selection data
        if (componentData.values[1] === "none") {
            axios.patch(`https://discord.com/api/webhooks/${bodyObject.application_id}/${bodyObject.token}/messages/@original`, 
            {
                'content': `If the game was not in the selection list, please review the initial spelling.`
            },
            {
                'Content-Type': 'application/json'
            });
            return { status: 200 };
        } else {
            var categoryId = componentData.values[1];
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

            axios.patch(`https://discord.com/api/webhooks/${bodyObject.application_id}/${bodyObject.token}/messages/@original`, 
                {
                    'content': `The show ${segmentTitle} on ${gameStartText} has been updated to ${scheduleSegmentUpdate.data.segments[0].category.name}.`
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
