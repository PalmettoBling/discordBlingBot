const { app } = require('@azure/functions');
const nacl = require('tweetnacl');
const CosmosClient = require('@azure/cosmos').CosmosClient;
const axios = require('axios');

app.http('discordCommandHandler', {
    methods: ['GET', 'POST'],
    authLevel: 'anonymous',
    handler: async (request, context) => {
        context.log(`Http function processed request for url "${request.url}"`);

        //##SECURITY VERIFICATION##
        const PUBLIC_KEY = process.env.DISCORD_PUBLIC_KEY;
        // Getting Headers and body from request
        // Body is also parsed into an object for reference
        const signature = await request.headers.get('X-Signature-Ed25519');
        const timestamp = await request.headers.get('X-Signature-Timestamp');
        const body = await request.text();
        const bodyObject = JSON.parse(body);
        //context.info("Request body: " + body);
        // Verifying request as is required by Discord
        context.info('Attempting to verify request...');
        const isVerified = await nacl.sign.detached.verify(
            Buffer.from(timestamp + body),
            Buffer.from(signature, "hex"),
            Buffer.from(PUBLIC_KEY, "hex")
        );
        // If request is not verified, return 401
        if (!isVerified) {
            context.warn("Request not verified, returning 401");
            return {
                status: 401,
                body: { error: 'invalid request signature' }
            };
        } else {
            context.info("Request verified.");
        }
        //##END SECURITY VERIFICATION##

        //##TYPE CHECK##
        // THIS IS USED IN RESPONSES, TYPE DOES NOT EXIST IN DATA
        switch(bodyObject.type) {
            case 1:
                // PING request, sending PONG response
                context.info("Request type is PING, Type 1");
                return { jsonBody: { type: 1 }, status: 200 };
                //break;  
            case 2:
                context.info("Application Command, Type 2");
                context.info("Command: " + bodyObject.data.name);
                let commandName = bodyObject.data.name + "command";
                [commandName](bodyObject);
                break;
            case 3:
                // THESE ARE THE PROCESSING commands
                context.info("Message Component, Type 3");
                context.info(bodyObject.message.interaction.name + " was called.");
                let messageProcessingName = bodyObject.message.interaction.name + "processing";
                [messageProcessingName](bodyObject);
                break;
            case 4:
                context.info("Autocomplete?, Type 4");
                //currently do not use
                break;
            case 5:
                context.info("Modal Submit, Type 5");
                context.info(bodyObject.data.custom_id + " was called.");
                let modalProcessingName = bodyObject.data.custom_id + "modal";
                [modalProcessingName](bodyObject);
                break;
            default: 
            //Revisit what this actually is?
                if(bodyObject.data.name) {
                    context.info("Command call, not a response. Executing command: " + bodyObject.data.name);
                    [bodyObject.data.name](bodyObject);                
                    break;
                } else {
                    context.warn("Unknown command type, returning 401");
                    return { jsonBody: { 
                        type: 4, 
                        data: {
                            "content": "This is awkward, the bot can't find the command name... You should probably tell Bling..."
                            }}, 
                        status: 200 };
                }
        }
    }
});

async function gameplancommand(bodyObject) {
    context.info("Gameplan command called. Sending Modal...");
    let gameplanModalData = {
        "title": "Gameplan Entry Form",
        "custom_id": "gameplan",
        "components": [
            {
                "type": 1,
                "components": [{
                    "type": 4,
                    "custom_id": "host_name",
                    "label": "Host Name: ",
                    "style": 1,
                    "placeholder": "Enter the host's gamertag name here...",
                    "required": true
                }]
            },
            {
                "type": 1,
                "components": [{
                    "type": 4,
                    "custom_id": "game_name",
                    "label": "Game Name: ",
                    "style": 1,
                    "placeholder": "Enter the game name here...",
                    "required": true
                }]
            },
            {
                "type": 1,
                "components": [{
                    "type": 4,
                    "custom_id": "channel_name",
                    "label": "Twitch Channel: ",
                    "style": 1,
                    "placeholder": "Enter the twitch channel to update here...",
                    "required": true
                }]
            }]
    };
    return { jsonBody: { 'type': 9, 'data': gameplanModalData }, status: 200 };
}

async function gameplanmodal(bodyObject) {
    context.info("Processing gameplan command response from Modal...");
    const hostNameInput = (bodyObject.data.components[0].components[0].value).toLowerCase();
    const gameNameInput = bodyObject.data.components[1].components[0].value;
    const channelNameInput = (bodyObject.data.components[2].components[0].value).toLowerCase();
    
    //Getting App Token from Twitch
    const appToken = await axios.post('https://id.twitch.tv/oauth2/token', {
        client_id: process.env.TWITCH_CLIENT_ID,
        client_secret: process.env.TWITCH_CLIENT_SECRET,
        grant_type: 'client_credentials'
    },{
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
        }
    });

    //Searching for Category ID from game entry
    try {
        context.info("Searching for Game ID from game...");
        var qs = new URLSearchParams({
            name: gameNameInput
        });
        var gameResponse = await axios.get(`https://api.twitch.tv/helix/games?${qs}`, {
            headers: {
                'Authorization': `Bearer ${appToken.data.access_token}`,
                'Client-Id': process.env.TWITCH_CLIENT_ID,
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        });
    } catch (error) {
        context.error("An error occured while searching for the game.");
        context.error(error);
    }

    //Checking if return object is empty to query categories instead
    // Then sends a dropdown menu to pick the category
    if (!(Object.keys(gameResponse).length)) {
        qs = new URLSearchParams({
            query: gameNameInput
        });

        // Searching for categories using the game input if game response was empty
        var categoryResponse = await axios.get(`https://api.twitch.tv/helix/search/categories?${qs}`,
            {
                headers: {
                    'Authorization': `Bearer ${appToken.data.access_token}`,
                    'Client-Id': process.env.TWITCH_CLIENT_ID,
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            });

        // Processing the categoryResonse data for likeliest matches
        var categoryArray = categoryResponse.data.data;
        var menuCategoryArray = categoryArray.filter(category => category.name.toLowerCase().includes(gameNameInput.toLowerCase()));
        var listSize = 10;
        let menuSelectionItems = [];
        if (menuCategoryArray.length < 10) {
            listSize = menuCategoryArray.length;
        }
        for (var i = 0; i < listSize; i++) {
            menuSelectionItems[i] = {
                'label': menuCategoryArray[i].name,
                'value': menuCategoryArray[i].id
            };
        }
        menuSelectionItems.push({ 'label': "How is it that NONE of thse are right?", 'value': "none" });

        // Sending dropdown menu to pick category
        try {
            context.info("Sending the game selection menu.");
            axios.patch(`https://discord.com/api/webhooks/${bodyObject.application_id}/${bodyObject.token}/messages/@original`, {
                'content': 'Please verify the Category:',
                'components': [
                    {
                        'type': 1,
                        'components': [
                            {
                                'type': 3,
                                'custom_id': `${hostNameInput}`,
                                'options': menuSelectionItems
                            }
                        ]
                    }
                ]
            });
            return { status: 200 };
        } catch(error) {
            context.error("An error occurred sending the drop down game slection menu.");
            context.error(error);
            axios.patch(`https://discord.com/api/webhooks/${bodyObject.application_id}/${bodyObject.token}/messages/@original`, 
                {
                    'content': `Error occurred trying to figure out if Twitch knows the game we're playing....`,
                    'components': []
                },
                {
                    'Content-Type': 'application/json'
                });
            return { status: 200 };
        }
    }
    
    // No need for menu, so setting game on Twitch and sending discord message back.
    twitchCategoryUpdate(gameResponse.data[0].id, channelNameInput, hostNameInput, bodyObject);
}

async function gameplanprocessing(bodyObject) {
    context.info("Processing gameplan selection from drop down that was sent from the modal processing...");
    twitchCategoryUpdate(bodyObject.data.values[0], bodyObject.message.components[2].components[0].value,  bodyObject.data.custom_id, bodyObject);
    return { status: 200 };
}

async function twitchCategoryUpdate(gameResponseId, channelNameInput, hostNameInput, bodyObject){
    // Starting with DB connection
    context.info("Connecting to Cosmos DB...")
    const client = new CosmosClient(process.env.CosmosDbConnectionSetting);
    const database = client.database('playdatesBot');
    const container = database.container('twitchAuthorization');

    // Checking if channel name is present and setting if not
    if (!channelNameInput) {
        switch (bodyObject.guild_id) {
            case '828634187175034900':
                channelNameInput = "palmettobling"
                break;
            case '208988601474613249':
                switch (hostNameInput) {
                    case "xboxplaydatesus":
                        channelNameInput = "xboxplaydatesus"
                        break;
                    case "xboxplaydatesgb":
                        channelNameInput = "xboxplaydatesgb"
                        break;
                    case "xboxplaydatesca":
                        channelNameInput = "xboxplaydatesca"
                        break;
                }
                break;
            case '309400100130783232':
                channelNameInput = "xboxambassadors"
                break;
        }
        context.info("Twitch Login: " + channelNameInput);
    }

    // Getting token and twitch info from DB
    const twitchQuerySpec = {
        query: `SELECT * FROM c WHERE c.login = '${channelNameInput}'`
    };
    const { resources } = await container.items.query(twitchQuerySpec).fetchAll();
    const twitchInfo = resources[0];

    // Checking if Twitch info is present
    if (!twitchInfo) {
        context.error("Twitch info not found in DB.");
        axios.patch(`https://discord.com/api/webhooks/${bodyObject.application_id}/${bodyObject.token}/messages/@original`, {
            content: "Unable to find the twitch channel identified."
        });
        return { status: 200 };
    }

    // Refreshing token access with twitch and updating DB
    context.info("Getting Twitch Access Token...");
    var qs = new URLSearchParams({
        client_id: process.env.TWITCH_CLIENT_ID,
        client_secret: process.env.TWITCH_CLIENT_SECRET,
        grant_type: 'refresh_token',
        refresh_token: twitchInfo.refresh_token
    });
    var tokenResponse = await axios.post(`https://id.twitch.tv/oauth2/token?${qs}`);
    var tokenInfo = tokenResponse.data;
    twitchInfo.access_token = tokenInfo.access_token;
    twitchInfo.refresh_token = tokenInfo.refresh_token;
    twitchInfo.scope = tokenInfo.scope;
    container.items.upsert(twitchInfo);
    context.info("Updated tokens in DB");

    //Getting schedule using refreshed token info.
    context.info("Getting the schedule for the channel...")
    var scheduleQuerySpec = new URLSearchParams({
        broadcaster_id: twitchInfo.twitchUserId
    });
    var scheduleResponse = await axios.get(`https://api.twitch.tv/helix/schedule?${scheduleQuerySpec}`, {
        headers: {
            'Authorization': `Bearer ${tokenInfo.access_token}`,
            'Client-Id': process.env.TWITCH_CLIENT_ID,
            'Content-Type': 'application/x-www-form-urlencoded'
        }
    });

    //Iterating through response for schedule info of identified host
    const scheduleData = scheduleResponse.data.data.segments;
    for (let i=0; i<scheduleData.length; i++) {
        if ((scheduleData[i].title).toLowerCase().includes(hostNameInput) && (scheduleData[i].is_recurring === true)) {
            var segmentId = scheduleData[i].id;
            var segmentTitle = scheduleData[i].title;
            var segmentStartTime = scheduleData[i].start_time;
            break;
        }
    }

    //updating the segment with the game info
    var segmentQuerySpec = new URLSearchParams({
        broadcaster_id: twitchInfo.twitchUserId,
        id: segmentId
    });
    var scheduleSegmentUpdate = await axios.patch(`https://api.twitch.tv/helix/schedule/segment?${segmentQuerySpec}`, 
        {
            'category_id': gameResponseId
        },
    {
        headers: {
            'Authorization': `Bearer ${tokenInfo.access_token}`,
            'Client-Id': process.env.TWITCH_CLIENT_ID,
            'Content-Type': 'application/json'
        }
    });

    // Sending response to Discord if good
    if (scheduleSegmentUpdate.status == 200) {
        context.info("Game updated successfully.");
        var dateOptions = {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            hour: 'numeric',
            minute: 'numeric',
            timeZone: 'America/Los_Angeles',
            timeZoneName: 'short'
        };
        var gameStartText = new Intl.DateTimeFormat('en-US', dateOptions).format(new Date(segmentStartTime));
        axios.patch(`https://discord.com/api/webhooks/${bodyObject.application_id}/${bodyObject.token}/messages/@original`, 
            {
                'content': `The show "${segmentTitle}" on **${gameStartText}** has been updated to __${scheduleSegmentUpdate.data.data.segments[0].category.name}__.`,
                'components': []
            },
            {
                'Content-Type': 'application/json'
            });
        return { status: 200 };
    } else {
        context.warn("Schedule segment update failed.");
        axios.patch(`https://discord.com/api/webhooks/${bodyObject.application_id}/${bodyObject.token}/messages/@original`, 
            {
                'content': `Error processing, but it is possible the update to the Twitch schedule succeeded. Please check the schedule to confirm.`,
                'components': []
            },
            {
                'Content-Type': 'application/json'
            });
        return { status: 200 };
    }
}



function addquotecommand(bodyObject) {
    context.info("Add Quote command called. Sending Modal...");
    let addQuoteModalData = {
        "title": "Quote Entry Form",
        "custom_id": "addquote",
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
            },
            {
                "type": 1,
                "components": [{
                    "type": 4,
                    "custom_id": "quote_channel",
                    "label": "Twitch Channel: ",
                    "style": 1,
                    "placeholder": "XboxAmbassadors, XboxPlaydatesUS, XboxPlaydatesCA, XboxPlaydatesGB, etc...",
                    "required": true
                }]
            }
        ]
    };
    return { jsonBody: { 'type': 9, 'data': addQuoteModalData }, status: 200 }; 
}

async function addquotemodal(bodyObject) {
    context.info("Processing addquote command response from Modal...");

    // Getting Quote information from Modal input
    const quoteText = bodyObject.data.components[0].components[0].value;
    const quoteAttribution = bodyObject.data.components[1].components[0].value;
    const quoteGame = bodyObject.data.components[2].components[0].value;
    const quoteChannel = (bodyObject.data.components[3].components[0].value).toLowerCase();
    const quoteSubmitter = bodyObject.member.user.username;

    // Connecting to DB client
    try {
        context.info("Connecting to Cosmos DB...")
        const client = new CosmosClient(process.env.CosmosDbConnectionSetting);  //Need awaits?
        const database = client.database('playdatesBot');
        var container = database.container(quoteChannel);
    } catch (error) {
        context.error("An error occurred while connecting to Cosmos DB.");
        context.error(error);
        axios.patch(`https://discord.com/api/webhooks/${bodyObject.application_id}/${bodyObject.token}/messages/@original`, {
            content: "An error occurred while connecting to the quote database."
        });
        return { status: 200 };
    }

    // Getting the quote count
    const querySpec = {
        query: "SELECT VALUE COUNT(1) FROM c"
    };
    const { resources: quoteCount } = await container.items.query(querySpec).fetchAll();
    context.info("Quote count: " + quoteCount[0]);

    // setting the date
    options = { year: 'numeric', month: 'numeric', day: 'numeric' };
    const submitDate = new Intl.DateTimeFormat("en-US", options).format(new Date());
    context.info("Submit Date: " + submitDate);
    
    // Creating the quote data object
    const quoteData = {
        id: `${quoteCount[0]}`,
        quote: `${quoteText}`,
        attribution: `${quoteAttribution}`,
        dateOfQuote: `${submitDate}`,
        game: `${quoteGame}`,
        submitter: `${quoteSubmitter}`, 
        dateAdded: `${submitDate}`
    };
    context.info("Quote Data: " + JSON.stringify(quoteData));

    // Connecting and updating DB with quote data
    try {
        context.info("Connecting to DB");
        const dbResponse = await container.items.upsert(quoteData);
        context.log("DB Response: " + dbResponse);
    } catch (error) {
        context.error("An error occured while adding the quote to the database.");
        context.error(error);
        axios.patch(`https://discord.com/api/webhooks/${bodyObject.application_id}/${bodyObject.token}/messages/@original`, {
            content: "An error occurred while adding the quote to the database."
        });
        return { status: 200 };
    }

    const stringQuote = `#${quoteData.id}: ${quoteData.quote} - ${quoteData.attribution} (${quoteData.dateOfQuote})`;
    context.log("String Quote: " + stringQuote);
    await axios.post(`https://discord.com/api/webhooks/${bodyObject.application_id}/${bodyObject.token}`, {
        content: `Quote added successfully: ${stringQuote}`
    });
}





function cancelshow() {
    context.info("Cancelling show command called. Cancelling on Twitch...");
    //code
}

function quote() {
    context.info("Quote command called. Retrieving quote...");
    //code
    //calling a quote
}

function scheduleupdate() {
    context.info("Schedule Update command called. Sending Modal...");
    //code
    //not implemented
}

