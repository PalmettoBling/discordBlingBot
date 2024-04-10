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
        
        // Getting the channel name from the request
        const body = await request.text();
        const bodyObject = JSON.parse(body);
        context.info("Request body: " + body);
        const commandOptions = bodyObject.data.options;
        context.info("Command options: " + JSON.stringify(commandOptions));
        let quoteId = commandOptions ? commandOptions[0].value : null;

        // Connecting to client
        try {
            context.info("Connecting to Cosmos DB...")
            const client = new CosmosClient(process.env.CosmosDbConnectionSetting);
            const database = client.database('playdatesBot');
            const container = database.container('xboxplaydatesus');

            context.info("Checking if there is an quote ID...")
            if (!quoteId) {
                context.info("No quote ID found, generating random quote ID...");
                const querySpec = {
                    query: "SELECT VALUE COUNT(1) FROM c"
                };
                const { resources: quoteCount } = await container.items.query(querySpec).fetchAll();
                context.info("Quote count: " + quoteCount[0])

                quoteId = Math.floor(Math.random() * quoteCount[0]);
                context.info("Generated quote ID: " + quoteId);
            }

            context.info("Reading quote from Cosmos DB...");
            const { resource: quoteItem } = await container.item(quoteId).read();
            context.info("Quote Item: " + JSON.stringify(quoteItem));

            if (!quoteItem) {
                context.warn("Quote not found.");
    
                const noSuchQuote = `Quote not found...`;
                return {
                    body: { "type": 4,
                            "data": {
                                "tts": false,
                                "content": noSuchQuote,
                                "embeds": []
                            } },
                    headers: { "Content-Type": "application/json",
                                "x-Signature-Ed25519": signature,
                                "X-Signature-Timestamp": timestamp 
                            },
                    status: 200
                }
            } else {
                const quoteReturn = `#${quoteItem.id}: ${quoteItem.quote} - ${quoteItem.attribution} (${quoteItem.dateOfQuote})`;
                context.info("Quote Return: " + quoteReturn);

                return {
                    body: { "type": 4,
                            "data": {
                                "tts": false,
                                "content": quoteReturn,
                                "embeds": []
                            } },
                    headers: { "Content-Type": "application/json",
                                "x-Signature-Ed25519": signature,
                                "X-Signature-Timestamp": timestamp 
                            },
                    status: 200
                }
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
