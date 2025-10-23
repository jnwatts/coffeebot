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
import fs from "fs";

const storage = new SimpleFsStorageProvider("coffeebot-storage.json");
var client = null;
var brew_alert_timeout = null;

function logged_send(client, roomId, message) {
    console.log(">> " + roomId + ": " + message);
    client.sendText(roomId, message);
}

async function initBot() {
    if (client) {
        var rooms = await client.getJoinedRooms();
        var roomId = storage.readValue("coffee_room_id");
        if (!rooms.includes(roomId))
            client.joinRoom(roomId);
    }
    console.log("Time to make the coffee!");
    var last_coffee = storage.readValue("last_coffee");
    if (last_coffee) {
        brew_alert(parseISO(last_coffee));
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
        brew_clear();
    } else if (body.startsWith("!help")) {
        logged_send(client, roomId, "I'll let you know when I'm told coffee has been brewed! Otherwise, you can type \"!coffee\" to query how long it's been since the last brew.");
    } else if (body.startsWith("!fresh")) {
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
        fresh(body);
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

function status() {
    var status = {
        "last_coffee": storage.readValue("last_coffee"),
    };
    return JSON.stringify(status);
}

function fresh(when) {
    brew_clear();
    var last_coffee;
    try {
        last_coffee = chrono.parseDate(when).toISOString();
    } catch (error) {
        last_coffee = new Date().toISOString();
    }
    storage.storeValue("last_coffee", last_coffee);
}

function brew() {
    brew_clear();
        var brew_delay = storage.readValue("brew_delay")
        storage.storeValue("last_coffee", chrono.parseDate("in " + brew_delay).toISOString());
        var last_coffee = storage.readValue("last_coffee");
        var last_coffee_date = parseISO(last_coffee);
        brew_alert(last_coffee_date);
}

function brew_clear() {
    if (brew_alert_timeout) {
        clearTimeout(brew_alert_timeout);
        brew_alert_timeout=null;
    }
}

function brew_alert(when) {
    brew_clear();
    var now = new Date();
    if (when < now) {
        console.log("Fresh " + formatDistance(when, now) + " ago");
        return;
    }
    console.log("Will be ready in " + formatDistance(when, now));
    brew_alert_timeout = setTimeout(() => {
        console.log("Ding!");
        if (client) {
            var roomId = storage.readValue("coffee_room_id");
            logged_send(client, roomId, "🔔 Coffee should be ready! ☕");
        }
    }, differenceInMilliseconds(when, now));
}

async function handleRequest(req, res) {
    var url = req.url;
    var remote_ip = req.socket.remoteAddress;
    var log_request = false;
    if ('x-forwarded-for' in req.headers) {
        remote_ip = req.headers['x-forwarded-for'];
    }
    var http_prefix = storage.readValue('http_prefix');

    if (url.includes('..') || url.includes('~')) {
        return;
    }

    if (url.endsWith('/')) {
        url = req.url.substr(0,req.url.length - 1);
    } else if (url == http_prefix) {
        res.setHeader('Location', http_prefix + '/');
        res.writeHead(302);
        res.end('<head><meta http-equiv="refresh" content="0;url='+http_prefix+'/" /></head>');
        return;
    }

    if (!url.startsWith(http_prefix)) {
        res.writeHead(404);
        res.end('Not found');
        return;
    }

    url = url.substring(http_prefix.length);
    if (url.length == 0) {
        url = '/';
    }
    
    if (url == '/brew') {
        res.writeHead(200);
        res.end('Thanks!');
        brew();
        log_request = true;
    } else if (url == '/fresh') {
        res.writeHead(200);
        res.end('Thanks!');
        fresh();
        log_request = true;
    } else if (url == '/status') {
        res.setHeader('Content-Type', 'application/json');
        res.writeHead(200);
        res.end(status());
        log_request = false;
    } else if (url == '/') {
        var f = fs.readFileSync('dist/front.html', 'utf8');
        res.writeHead(200);
        res.end(f);
    } else if (fs.existsSync('dist'+url)) {
        var f = fs.readFileSync('dist'+url, 'utf8');
        if (url.endsWith('.js')) {
            res.setHeader('Content-Type', 'application/javascript');
        } else if (url.endsWith('.html')) {
            res.setHeader('Content-Type', 'text/html');
        } else if (url.endsWith('.js.map')) {
            res.setHeader('Content-Type', 'application/json');
        }
        res.writeHead(200);
        res.end(f);
    } else {
        res.writeHead(404);
        res.end('Not found');
    }
    if (log_request) {
        console.log("<< HTTP," + remote_ip + "," + url);
    }
}

storage.storeValue("last_command", new Date().toISOString());

if (!storage.readValue("skip_matrix")) {
    client = new MatrixClient(
        storage.readValue("homeserver_url"),
        storage.readValue("access_token"),
        storage);
    console.log("Joining matrix...");
    client.start().then(initBot);
    client.on("room.message", handleCommand);
} else {
    setTimeout(initBot, 100);
}

const server = http.createServer(handleRequest);
console.log("Listening at http://0.0.0.0:" + storage.readValue("http_port") + storage.readValue('http_prefix') + '/brew')
server.listen(parseInt(storage.readValue("http_port")));

