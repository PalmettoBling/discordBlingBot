const { app } = require('@azure/functions');
const nacl = require('tweetnacl');

app.setup({ enableHttpStream: true }); // to allow for param query

app.http('discordCommandHandler', {
    methods: ['GET', 'POST'],
    authLevel: 'anonymous',
    handler: async (request, context) => {
        context.log(`Http function processed request for url "${request.url}"`);

        const PUBLIC_KEY = process.env.DISCORD_PUBLIC_KEY;

        context.log('Attempting to get headers...');
        const signature = request.headers.get('X-Signature-Ed25519');
        const timestamp = request.headers.get('X-Signature-Timestamp');
        const body = await request.text();

        context.log('Attempting to verify request...');
        const isVerified = nacl.sign.detached.verify(
            Buffer.from(timestamp + body),
            Buffer.from(signature, "hex"),
            Buffer.from(PUBLIC_KEY, "hex")
        );
        context.log(`Request verification: ${isVerified}`);

        if (!isVerified) {
            context.log("Request not verified, returning 401");
            return {
                status: 401,
                body: JSON.stringify({ error: 'invalid request' })
            };
        }
    
        context.log("Req Headers: ");
        context.log(JSON.stringify(request.headers));

        context.log('Req Body: ');
        context.log(JSON.stringify(request.body));

        context.log("Checking for PING type message...");
        if (request.body.type == 1) {
            context.log(`Message type ${request.body.type}, sending ACK type 1`);
            return context.res = { 
                body: { "type": 1 }
            };
        }

        context.log("Completed request verification, returning 200");
        return { body: `Command Complete`, status: 200 };
    }
});
