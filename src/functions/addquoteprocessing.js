const { app } = require('@azure/functions');
const CosmosClient = require('@azure/cosmos').CosmosClient;
const axios = require('axios');

app.http('addquoteprocessing', {
    methods: ['GET', 'POST'],
    authLevel: 'anonymous',
    handler: async (request, context) => {
        context.log(`Http function processed request for url "${request.url}"`);
        
        // Getting the request body
        const body = await request.text();
        const bodyObject = JSON.parse(body);
        context.info("Request body: " + body);
        
        // getting the quote information from the modal
        const quoteText = bodyObject.data.components[0].components[0].value;
        const quoteAttribution = bodyObject.data.components[0].components[1].value;
        const quoteGame = bodyObject.data.components[0].components[2].value;
        const quoteChannel = (bodyObject.data.components[0].components[3].value).toLowerCase();
        const quoteSubmitter = bodyObject.member.user.username;

        // Connecting to DB client
        try {
            context.info("Connecting to Cosmos DB...")
            const client = await new CosmosClient(process.env.CosmosDbConnectionSetting);
            const database = await client.database('playdatesBot');
            var container = await database.container(quoteChannel);
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

        // getting the date
        options = { year: 'numeric', month: 'numeric', day: 'numeric' };
        const submitDate = new Intl.DateTimeFormat("en-US", options).format(new Date());
        context.info("Submit Date: " + submitDate);
        
        const quoteData = {
            id: quoteCount[0],
            quote: quoteText,
            attribution: quoteAttribution,
            dateOfQuote: submitDate,
            game: quoteGame,
            submitter: quoteSubmitter, 
            dateAdded: submitDate
        };
        context.info("Quote Data: " + JSON.stringify(quoteData));

        //conntecting and updating DB
        try {
            context.info("Connecting to DB");
            const dbResponse = await container.items.upsert(quoteData);
            context.log("DB Response: " + JSON.stringify(dbResponse));
        } catch (error) {
            context.error("An error occurred while adding the quote to the database.");
            context.error(error);
            axios.patch(`https://discord.com/api/webhooks/${bodyObject.application_id}/${bodyObject.token}/messages/@original`, {
                content: "An error occurred while adding the quote to the database."
            });
            return { status: 200 };
        }

        const stringQuote = `#${quoteData.id}: ${quoteData.quote} - ${quoteData.attribution} (${quoteData.dateOfQuote})`;
        context.log("String Quote: " + stringQuote);

        axios.patch(`https://discord.com/api/webhooks/${bodyObject.application_id}/${bodyObject.token}/messages/@original`, {
            content: "Added the quote: " + stringQuote
        });

        return { status: 200 };
    }
});
