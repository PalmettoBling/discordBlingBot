const { app } = require('@azure/functions');
const CosmosClient = require('@azure/cosmos').CosmosClient;
const axios = require('axios');

app.http('quote', {
    methods: ['GET', 'POST'],
    authLevel: 'anonymous',
    handler: async (request, context) => {
        context.log(`Http function processed request for url "${request.url}"`);

        /*
        // Getting Headers and body from request
        context.info('Attempting to get headers...');
        const signature = await request.headers.get('X-Signature-Ed25519');
        const timestamp = await request.headers.get('X-Signature-Timestamp');
        */
        
        // Getting the request body and options
        const body = await request.text();
        const bodyObject = JSON.parse(body);
        context.info("Request body: " + body);
        const commandOptions = bodyObject.data.options;
        //let channelName = commandOptions[0].value;
        const applicationId = bodyObject.application_id;
        const interactionToken = bodyObject.token;
        context.info("App ID: " + applicationId + " and Interaction ID: " + interactionToken);

        let quoteId = commandOptions[0] ? commandOptions[0].value : null;
        context.info("Quote ID: " + quoteId);
               
        // Connecting to DB client
        context.info("Connecting to Cosmos DB...")
        const client = await new CosmosClient(process.env.CosmosDbConnectionSetting);
        const database = await client.database('playdatesBot');
        const container = await database.container('xboxplaydates');

        // Getting random number for quote if no options are provided
        if (!quoteId) {
            context.info("No quote ID found, generating random quote ID...");
            const querySpec = {
                query: "SELECT VALUE COUNT(1) FROM c"
            };
            const { resources: quoteCount } = await container.items.query(querySpec).fetchAll();
            context.info("Quote count: " + quoteCount[0]);

            quoteId = await Math.floor(Math.random() * (quoteCount[0] - 1));
            context.info("Generated quote ID: " + quoteId);
        }

        // Getting quote from DB
        context.info("Reading quote from Cosmos DB...");          
        const quoteQuerySpec = {
            query: `SELECT * FROM c WHERE c.id = '${quoteId}'`
        };
        const { resources } = await container.items.query(quoteQuerySpec).fetchAll();
        context.log("Resources: " + JSON.stringify(resources));                                                                                                                                                                                                                                                                                                                                                                                                     
        const quoteItem = resources[0];         
        context.info("Quote Item: " + JSON.stringify(quoteItem));

        // Returning error if quote doesn't exist else returning the quote
        if (quoteItem == null) {
            context.warn("Quote not found.");
            axios.patch(`https://discord.com/api/webhooks/${applicationId}/${interactionToken}/messages/@original`, {
                'content': 'Quote not found.'
            },
            {
                "Content-Type": "application/json"
            });
            return { status: 200, body: { error: 'Quote not found.' }};
        } else {
            //formatting the quote to be returned
            const quoteReturn = `#${quoteItem.id}: ${quoteItem.quote} - ${quoteItem.attribution} (${quoteItem.dateOfQuote})`
            context.info("Quote Return: " + quoteReturn);

            // Sending quote to Discord
            try {
                context.info("Sending quote to Discord...");
                axios.patch(`https://discord.com/api/webhooks/${applicationId}/${interactionToken}/messages/@original`, {
                    'content': quoteReturn
                },
                {
                    "Content-Type": "application/json"
                });
                return { status: 200, body: { message: 'Quote sent successfully.' }};
            } catch (error) {
                context.error("An error occurred while sending the quote.");
                context.error(error);
                return { status: 500, body: { error: 'An error occurred while sending the quote.' }};
            }
        }
    }
});
