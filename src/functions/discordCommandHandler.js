const { app } = require('@azure/functions');
const nacl = require('tweetnacl');
const http = require('http');

app.http('discordCommandHandler', {
    methods: ['GET', 'POST'],
    authLevel: 'anonymous',
    handler: async (request, context) => {
        context.log(`Http function processed request for url "${request.url}"`);

        const PUBLIC_KEY = process.env.DISCORD_PUBLIC_KEY;

        // Getting Headers and body from request
        // Body is also parsed into an object for reference
        context.info('Attempting to get headers...');
        const signature = await request.headers.get('X-Signature-Ed25519');
        const timestamp = await request.headers.get('X-Signature-Timestamp');
        const body = await request.text();
        const bodyObject = JSON.parse(body);
        context.info("Request body: " + body);

        // Verifying request as is required by Discord
        context.info('Attempting to verify request...');
        const isVerified = await nacl.sign.detached.verify(
            Buffer.from(timestamp + body),
            Buffer.from(signature, "hex"),
            Buffer.from(PUBLIC_KEY, "hex")
        );
        context.info(`Request verification: ${isVerified}`);

        // If request is not verified, return 401
        if (!isVerified) {
            context.warn("Request not verified, returning 401");
            return {
                status: 401,
                body: { error: 'invalid request signature' }
            };
        }

        // If request is a PING type message, return PONG (ACK type 1)
        if (bodyObject.type == 1) {
            context.info("Request is a PING, returning PONG");
            return { jsonBody: { type: 1 }, status: 200 };
        }

        // Validation of message is complete and the request is not a PING, so sending the payload to the appropriate function based
        // on the command name and sending the options along with it.
        context.info("Sending command to function " + bodyObject.data.name + " with options " + JSON.stringify(bodyObject.data.options));


        return { body: `Command Complete`, status: 200 };
    }
});
