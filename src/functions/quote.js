const { app } = require('@azure/functions');

app.http('quote', {
    methods: ['GET', 'POST'],
    authLevel: 'anonymous',
    handler: async (request, context) => {
        context.log(`Http function processed request for url "${request.url}"`);

        const body = await request.text();
        const bodyObject = JSON.parse(body);

        return { body: `Hello, ${name}!` };
    }
});
