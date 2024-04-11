const { app } = require('@azure/functions');
const CosmosClient = require('@azure/cosmos').CosmosClient;

app.http('quote', {
    methods: ['GET', 'POST'],
    authLevel: 'anonymous',
    handler: async (request, context) => {
        context.log(`Http function processed request for url "${request.url}"`);

        // Getting Headers and body from request
        context.info('Attempting to get headers...');
        const signature = await request.headers.get('X-Signature-Ed25519');
        const timestamp = await request.headers.get('X-Signature-Timestamp');
        context.info("Timestamp: " + timestamp);
        
        // Getting the request body and options
        const body = await request.text();
        const bodyObject = JSON.parse(body);
        context.info("Request body: " + body);
        const commandOptions = bodyObject.data.options;
        context.info("Command options: " + JSON.stringify(commandOptions));
        let quoteId = commandOptions ? commandOptions[0].value : null;

        
        try {
            // Connecting to client
            context.info("Connecting to Cosmos DB...")
            const client = await new CosmosClient(process.env.CosmosDbConnectionSetting);
            const database = await client.database('playdatesBot');
            const container = await database.container('xboxplaydatesus');

            // Getting random number for quote if no options are provided
            context.info("Checking if there is an quote ID...")
            if (!quoteId) {
                context.info("No quote ID found, generating random quote ID...");
                const querySpec = {
                    query: "SELECT VALUE COUNT(1) FROM c"
                };
                const { resources: quoteCount } = await container.items.query(querySpec).fetchAll();
                context.info("Quote count: " + quoteCount[0])

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
            if (!quoteItem) {
                context.warn("Quote not found.");
    
                const noSuchQuote = { 
                    "type": 4,
                    "data": {
                    "content": "No quote found with that ID."
                    }
                };
                const commandFunctionURI = `https://discord.com/api/v10/interactions/${bodyObject.application_id}/${bodyObject.id}/messages/@original`;
                const options = {
                    method: 'PATCH',
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify(noSuchQuote)
                };
                fetch(commandFunctionURI, options);
                return {
                    status: 200
                };
            } else {
                //formatting the quote to be returned
                const quoteReturn = { 
                    "type": 4,
                    "data": {
                        "content": `#${quoteItem.id}: ${quoteItem.quote} - ${quoteItem.attribution} (${quoteItem.dateOfQuote})`
                    }
                };
                
                context.info("Quote Return: " + JSON.stringify(quoteReturn));

                // Sending quote to Discord
                const commandFunctionURI = `https://discord.com/api/v10/interactions/${bodyObject.application_id}/${bodyObject.id}/messages/@original`;
                const options = {
                    method: 'PATCH',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(quoteReturn)                
                };

                try {
                    context.info("Sending quote to Discord...");
                    context.info("Command Function URI: " + commandFunctionURI);
                    context.info("Options: " + JSON.stringify(options));
                    fetch(commandFunctionURI, options);
                } catch (error) {
                    context.error("An error occurred while sending the quote.");
                    context.error(error);
                    return { jsonBody: { 
                        type: 4, 
                        data: {
                            "content": "An error occurred while sending the quote."
                            }}, 
                        status: 200 };
                }
                
                return {
                    status: 200
                };
            }
        } catch (error) {
            context.error("Error: " + error);
            return {
                status: 500,
                body: { error: 'Error connecting to Cosmos DB' }
            };
        }
    }
});
