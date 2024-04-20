const { app } = require('@azure/functions');
const nacl = require('tweetnacl');
//const http = require('http');
//const { url } = require('inspector');

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
        } //else if (bodyObject.type == 3) {}

        // Validation of message is complete and the request is not a PING, so sending the payload to the appropriate function based
        // on the command name and sending the options along with it.
        
        // Check if the 'name' property exists in the 'data' object of 'bodyObject'
        if (bodyObject.data.name) {
            const commandFunctionURI = 'https://discordblingbot.azurewebsites.net/api/' + bodyObject.data.name;
            const options = {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-Signature-Ed25519': signature,
                    'X-Signature-Timestamp': timestamp
                },
                body: JSON.stringify(bodyObject)
            };
            const commandAnswer = fetch(commandFunctionURI, options);
            
            try {
                //return { jsonBody: { type: 5 }, status: 200 };
            } catch (error) {
                context.error("An error occurred while processing the command.");
                context.error(error);
                return { jsonBody: { 
                    type: 4, 
                    data: {
                        "content": "An error occurred while processing the command."
                        }}, 
                    status: 200 };
            }
        } else {
            try {
                context.error("Invalid command name.");
                return { jsonBody: { 
                    type: 4, 
                    data: {
                        "content": "Invalid command name. I honestly have no idea how this could happen... You should probably tell Bling..."
                        }}, 
                    status: 200 };
            } catch (error) {
                context.error("An error occurred while processing the command.");
                context.error(error);
                return {
                    jsonBody: { 
                        type: 4,
                        data: {
                            "tts": false,
                            "content": "An error occurred while processing the command.",
                            "embeds": []
                        },
                        status: 200
                    }
                }
            }
        }
    }
});
