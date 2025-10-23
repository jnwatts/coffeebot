import {
    MatrixClient,
    SimpleFsStorageProvider,
    RichReply,
} from "matrix-bot-sdk";
import { 
    isBefore,
    parseISO,
    formatDistance,
    differenceInMilliseconds
} from 'date-fns';
import * as chrono from 'chrono-node';
import http from "http";
import * as log_timestamp from "log-timestamp";

const storage = new SimpleFsStorageProvider("coffeebot-storage.json");
const client = new MatrixClient(
    storage.readValue("homeserver_url"),
    storage.readValue("access_token"),
    storage);

storage.storeValue("last_command", new Date().toISOString());
client.start().then(initBot);
client.on("room.message", handleCommand);

async function initBot() {
    var rooms = await client.getJoinedRooms();
    var roomId = storage.readValue("coffee_room_id");
    if (!rooms.includes(roomId))
        client.joinRoom(roomId);
    console.log("Time to make the coffee!");
    var now = new Date();
    var last_coffee = storage.readValue("last_coffee");
    if (last_coffee) {
        var last_coffee_date = parseISO(last_coffee);
        var now = new Date();
        var dist = formatDistance(last_coffee_date, now);
        if (last_coffee_date > now) {
            console.log("Coffee in the FUTURE! (" + differenceInMilliseconds(last_coffee_date, now) + "ms)");
            setTimeout(() => {
                var current_last_coffee = storage.readValue("last_coffee");
                if (current_last_coffee == last_coffee) {
                    console.log("Ding!");
                    client.sendText(roomId, "🔔 Coffee should be ready! ☕");
                } else {
                    console.log("Would ding, but the date changed, so assuming new !brew or !fresh.")
                }
            }, differenceInMilliseconds(last_coffee_date, now));
        }
    }
}

async function handleCommand(roomId, event) {
    // Don't handle events that don't have contents (they were probably redacted)
    if (!event["content"]) return;

    // Don't handle non-text events
    if (event["content"]["msgtype"] !== "m.text") return;

    // We never send `m.text` messages so this isn't required, however this is
    // how you would filter out events sent by the bot itself.
    if (event["sender"] === await client.getUserId()) return;

    // Make sure that the event looks like a command we're expecting
    const body = event["content"]["body"];

    if (!body) return;

    if (isBefore(new Date(event.origin_server_ts), parseISO(storage.readValue("last_command")))) return;

    storage.storeValue("last_command", new Date().toISOString());

    if (body.startsWith("!coffee")) {
        var now = new Date();
        var last_coffee = storage.readValue("last_coffee");
        if (!last_coffee) {
            client.sendText(roomId, "Sorry, I have no idea when the coffee was last brewed ☹️");
            return;
        }
        var last_coffee_date = parseISO(last_coffee);
        var now = new Date();
        var dist = formatDistance(last_coffee_date, now);
        if (last_coffee_date < now) {
            client.sendText(roomId, "Coffee was last ready " + dist + " ago");
        } else {
            client.sendText(roomId, "Coffee will be ready in about " + dist);
        }
    } else if (body.startsWith("!reset")) {
        storage.storeValue("last_coffee", null);
        client.sendText(roomId, "I know nothing... 🤐");
    } else if (body.startsWith("!help")) {
        client.sendText(roomId, "I'll let you know when I'm told coffee has been brewed! Otherwise, you can type \"!coffee\" to query how long it's been since the last brew.");
    } else if (body.startsWith("!fresh")) {
        var last_coffee;
        try {
            last_coffee = chrono.parseDate(body).toISOString();
        } catch (error) {
            last_coffee = new Date().toISOString();
        }
        storage.storeValue("last_coffee", last_coffee);
        console.log(event);
        client.sendEvent(roomId, "m.reaction", {
            "m.relates_to": {
                event_id: event["event_id"],
                key: "☕",
                rel_type: "m.annotation",
            },
        });
        client.sendEvent(roomId, "m.reaction", {
            "m.relates_to": {
                event_id: event["event_id"],
                key: "⏲️",
                rel_type: "m.annotation",
            },
        });
    } else if (body.startsWith("!brew")) {
        storage.storeValue("last_coffee", chrono.parseDate("in 2 minutes").toISOString());
        client.sendEvent(roomId, "m.reaction", {
            "m.relates_to": {
                event_id: event["event_id"],
                key: "👍",
                rel_type: "m.annotation",
            },
        });
        setTimeout(() => {
            client.sendText(roomId, "🔔 Coffee should be ready! ☕");
        }, differenceInMilliseconds(last_coffee_date, now));
    }
};

async function handleRequest(req, res) {
    if (req.url == storage.readValue('http_prefix') + '/brew') {
        storage.storeValue("last_coffee", new Date().toISOString());
        client.sendText(storage.readValue("coffee_room_id"), "☕⏲️");
        res.writeHead(200);
        res.end('Thanks!');
    } else  {
        res.writeHead(404);
        res.end('Not found');
    }
}

const server = http.createServer(handleRequest);
server.listen(parseInt(storage.readValue("http_port")));