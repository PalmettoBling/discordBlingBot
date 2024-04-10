const { app } = require('@azure/functions');
const CosmosClient = require('@azure/cosmos');

app.http('quote', {
    methods: ['GET', 'POST'],
    authLevel: 'anonymous',
    handler: async (request, context) => {
        context.log(`Http function processed request for url "${request.url}"`);

        // Getting Headers and body from request
        context.info('Attempting to get headers...');
        const signature = await request.headers.get('X-Signature-Ed25519');
        const timestamp = await request.headers.get('X-Signature-Timestamp');
        
        // Getting the channel name from the request
        const body = await request.text();
        const bodyObject = JSON.parse(body);
        context.info("Request body: " + body);
        const commandOptions = bodyObject.data.options;
        context.info("Command options: " + JSON.stringify(commandOptions));

        // Connecting CosmosDB client to quote DB
        try {
            context.log("Connecting to CosmosDB client...");
            const dbEndpoint = process.env.DB_ENDPOINT;
            const dbKey = process.env.DB_KEY;
            const client = await new CosmosClient({ dbEndpoint, dbKey });
            context.log("Connected to CosmosDB client");
            const database = await client.database("playdatesBot");
        } catch(err) {
            context.error("Error connecting to CosmosDB client: " + err);
            return {
                status: 500,
                body: { error: 'internal server error' }
            };
        }

        const quoteId = commandOptions.find(option => option.name === 'id').value;
        if (!quoteId) {
            let min = Math.ceil(0);
            let max = Math.floor(await db.getTotalQuoteCount(channelName));
            quoteId = Math.floor(Math.random() * (max - min + 1) + min);
        }
        context.info("Quote ID: " + quoteId);
        
        const querySpec = {
            query: `SELECT * FROM c WHERE c.id = '${quoteId}'`,
            parameters: [
                { name: '@id', value: quoteId }
            ]
        };
        context.info("Query Spec: " + JSON.stringify(querySpec));

        const { resources } = await database.container(`xboxplaydatesus`).items.query(querySpec).fetchAll();
        const quoteReturn = `#${resources[0].id}: ${resources[0].quote} - ${resources[0].attribution} (${resources[0].dateOfQuote})`;
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
});
