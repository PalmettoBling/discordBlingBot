const { app } = require('@azure/functions');
const nacl = require('tweetnacl');

app.http('discordCommandHandler', {
    methods: ['GET', 'POST'],
    authLevel: 'anonymous',
    handler: async (request, context) => {
        context.log(`Http function processed request for url "${request.url}"`);

        const PUBLIC_KEY = process.env.DISCORD_PUBLIC_KEY;

        // Getting Headers and body from request
        // Body is also parsed into an object for reference
        context.log('Attempting to get headers...');
        const signature = await request.headers.get('X-Signature-Ed25519');
        const timestamp = await request.headers.get('X-Signature-Timestamp');
        const body = await request.text();
        const bodyObject = JSON.parse(body);
        context.log("Request body: " + body);
        context.log("Request body object: " + JSON.stringify(bodyObject));

        // Verifying request as is required by Discord
        context.log('Attempting to verify request...');
        const isVerified = await nacl.sign.detached.verify(
            Buffer.from(timestamp + body),
            Buffer.from(signature, "hex"),
            Buffer.from(PUBLIC_KEY, "hex")
        );
        context.log(`Request verification: ${isVerified}`);

        // If request is not verified, return 401
        if (!isVerified) {
            context.log("Request not verified, returning 401");
            return {
                status: 401,
                body: JSON.stringify({ error: 'invalid request signature' })
            };
        }

        // If request is a PING type message, return PONG (ACK type 1)
        if (bodyObject.type == 1) {
            context.log("Request is a PING, returning PONG");
            return { body: { "type": 1 }, status: 200 };
        }

        // Completed validation, completed PONG, this is where you do the command handling
        context.log("Completed request verification, returning 200");
        context.log("Command name: " + bodyObject.data.name);
        context.log("Command options: " + JSON.stringify(bodyObject.data.options));

        return { body: `Command Complete`, status: 200 };
    }
});
