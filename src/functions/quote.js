const { app } = require('@azure/functions');
const CosmosClient = require('@azure/cosmos').CosmosClient;

app.http('quote', {
    methods: ['GET', 'POST'],
    authLevel: 'anonymous',
    handler: async (request, context) => {
        context.log(`Http function processed request for url "${request.url}"`);

        // Connecting CosmosDB client to quote DB
        const client = new CosmosClient(DB_ENDPOINT, DB_KEY);
        const database = client.database("playdatesBot");

        const body = await request.text();
        const bodyObject = JSON.parse(body);
        const commandOptions = bodyObject.data.options;
        const quoteId = commandOptions.find(option => option.name === 'id').value;
        if (!quoteId) {
            let min = Math.ceil(0);
            let max = Math.floor(await db.getTotalQuoteCount(channelName));
            quoteId = Math.floor(Math.random() * (max - min + 1) + min);
        }
        
        const querySpec = {
            query: `SELECT * FROM c WHERE c.id = '${quoteId}'`,
            parameters: [
                { name: '@id', value: quoteId }
            ]
        };

        const { resources } = await database.container(`xboxplaydatesus`).items.query(querySpec).fetchAll();
        const quoteReturn = `#${resources[0].id}: ${resources[0].quote} - ${resources[0].attribution} (${resources[0].dateOfQuote})`;

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
