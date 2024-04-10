const { app, input } = require('@azure/functions');
//const CosmosClient = require('@azure/cosmos').CosmosClient;

app.http('quote', {
    methods: ['GET', 'POST'],
    authLevel: 'anonymous',
    extraInputs: [cosmosInput],
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

        // connecting to DB
        try {
            context.info("Connecting to CosmosDB client...");
            const credential = new DefaultAzureCredential();
            const client = new CosmosClient(process.env.DB_ENDPOINT, credential);
        } catch(err) {
            context.error("Error connecting to CosmosDB client: " + err);
            return {
                status: 500,
                body: { error: 'internal server error' }
            };
        }
        
        const database = client.database("playdatesBot");
        const container = database.container("xboxplaydatesus");

        // Connecting CosmosDB client to quote DB
        /*
        try {
            context.log("Connecting to CosmosDB client...");
            const dbEndpoint = process.env.DB_ENDPOINT;
            const dbKey = process.env.DB_KEY;
            const client = await new CosmosClient( dbEndpoint, dbKey );
            context.log("Connected to CosmosDB client");
            const database = await client.database("playdatesBot");
        } catch(err) {
            context.error("Error connecting to CosmosDB client: " + err);
            return {
                status: 500,
                body: { error: 'internal server error' }
            };
        }*/

        const quoteId = commandOptions.find(option => option.name === 'id').value;
        if (!quoteId) {
            let min = Math.ceil(0);
            //let max = Math.floor(await db.getTotalQuoteCount(channelName));
            let max = Math.floor(100);
            quoteId = Math.floor(Math.random() * (max - min + 1) + min);
        }
        context.info("Quote ID: " + quoteId);
        var partitionkey = 'dateAdded'

        var response = await container.item(quoteId, partitionkey).read();
        let quoteItem = response.resource;
        
        /*
        const querySpec = {
            query: `SELECT * FROM c WHERE c.id = '${quoteId}'`,
            parameters: [
                { name: '@id', value: quoteId }
            ]
        };
        context.info("Query Spec: " + JSON.stringify(querySpec));

        const { resources } = await database.container(`xboxplaydatesus`).items.query(querySpec).fetchAll();
        */

        //const quoteItem = await context.extraInputs.get(cosmosInput);
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
        }

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
});
