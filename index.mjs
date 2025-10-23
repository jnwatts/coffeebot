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

function logged_send(client, roomId, message) {
    console.log(">> " + roomId + ": " + message);
    client.sendText(roomId, message);
}

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
                    logged_send(client, roomId, "🔔 Coffee should be ready! ☕");
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

    if (body.startsWith("!")) {
        console.log("<< " + roomId + "," + event["sender"] + ": " + body)
    }

    if (body.startsWith("!coffee")) {
        var now = new Date();
        var last_coffee = storage.readValue("last_coffee");
        if (!last_coffee) {
            logged_send(client, roomId, "Sorry, I have no idea when the coffee was last brewed ☹️");
            return;
        }
        var last_coffee_date = parseISO(last_coffee);
        var now = new Date();
        var dist = formatDistance(last_coffee_date, now);
        if (last_coffee_date < now) {
            logged_send(client, roomId, "Coffee was last ready " + dist + " ago");
        } else {
            logged_send(client, roomId, "Coffee will be ready in about " + dist);
        }
    } else if (body.startsWith("!reset")) {
        storage.storeValue("last_coffee", null);
        logged_send(client, roomId, "I know nothing... 🤐");
    } else if (body.startsWith("!help")) {
        logged_send(client, roomId, "I'll let you know when I'm told coffee has been brewed! Otherwise, you can type \"!coffee\" to query how long it's been since the last brew.");
    } else if (body.startsWith("!fresh")) {
        var last_coffee;
        try {
            last_coffee = chrono.parseDate(body).toISOString();
        } catch (error) {
            last_coffee = new Date().toISOString();
        }
        storage.storeValue("last_coffee", last_coffee);
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
        client.sendEvent(roomId, "m.reaction", {
            "m.relates_to": {
                event_id: event["event_id"],
                key: "👍",
                rel_type: "m.annotation",
            },
        });
        brew();
    }
};

function brew() {
        var roomId = storage.readValue("coffee_room_id");
        var brew_delay = storage.readValue("brew_delay")
        storage.storeValue("last_coffee", chrono.parseDate("in " + brew_delay).toISOString());
        var last_coffee = storage.readValue("last_coffee");
        var last_coffee_date = parseISO(last_coffee);
        logged_send(client, roomId, "Brewing, ready in " + brew_delay);
        setTimeout(() => {
            logged_send(client, roomId, "🔔 Coffee should be ready! ☕");
        }, differenceInMilliseconds(last_coffee_date, new Date()));
}

async function handleRequest(req, res) {
    if (req.url == storage.readValue('http_prefix') + '/brew') {
        storage.storeValue("last_coffee", new Date().toISOString());
        res.writeHead(200);
        res.end('Thanks!');
        brew();
        console.log("<< HTTP," + req.ip + ": /brew")
    } else  {
        res.writeHead(404);
        res.end('Not found');
    }
}

const server = http.createServer(handleRequest);
console.log("Listening at http://0.0.0.0:" + storage.readValue("http_port") + storage.readValue('http_prefix') + '/brew')
server.listen(parseInt(storage.readValue("http_port")));

