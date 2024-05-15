const { app } = require('@azure/functions');

app.http('addquoteprocessing', {
    methods: ['GET', 'POST'],
    authLevel: 'anonymous',
    handler: async (request, context) => {
        context.log(`Http function processed request for url "${request.url}"`);

        // Getting request body and options
        const body = await request.text();
        const bodyObject = JSON.parse(body);
        context.info("Request body: " + body);
        const componentData = bodyObject.data;
        

        return { status: 200 };
    }
});
