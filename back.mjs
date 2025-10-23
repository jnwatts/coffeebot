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

function matrix_send_logged(client, roomId, message) {
    if (client) {
        console.log(">> " + roomId + ": " + message);
        client.sendText(roomId, message);
    } else {
        console.log("SKIPPED >> " + roomId + ": " + message);
    }
}

async function matrix_join() {
    if (client) {
        var rooms = await client.getJoinedRooms();
        var roomId = storage.readValue("coffee_room_id");
        if (!rooms.includes(roomId))
            client.joinRoom(roomId);
    }
}

async function initBot() {
    matrix_join();
    console.log("Time to make the coffee!");
    brew_alert();
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
            matrix_send_logged(client, roomId, "Sorry, I have no idea when the coffee was last brewed ☹️");
            return;
        }
        var last_coffee_date = parseISO(last_coffee);
        var now = new Date();
        var dist = formatDistance(last_coffee_date, now);
        if (last_coffee_date < now) {
            matrix_send_logged(client, roomId, "Coffee was last ready " + dist + " ago");
        } else {
            matrix_send_logged(client, roomId, "Coffee will be ready in about " + dist);
        }
    } else if (body.startsWith("!reset")) {
        storage.storeValue("last_coffee", null);
        matrix_send_logged(client, roomId, "I know nothing... 🤐");
        brew_alert_clear();
    } else if (body.startsWith("!help")) {
        matrix_send_logged(client, roomId, "I'll let you know when I'm told coffee has been brewed! Otherwise, you can type \"!coffee\" to query how long it's been since the last brew.");
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
        "client_status": (client == null ? "(matrix client disconnected!)" : ""),
    };
    return JSON.stringify(status);
}

function fresh(when) {
    brew_alert_clear();
    var last_coffee;
    try {
        last_coffee = chrono.parseDate(when).toISOString();
    } catch (error) {
        last_coffee = new Date().toISOString();
    }
    storage.storeValue("last_coffee", last_coffee);
}

function brew() {
    var last_coffee = storage.readValue("last_coffee");
    var last_coffee_date = parseISO(last_coffee);
    var now = new Date();
    if (isBefore(now, last_coffee_date)) {
        return false;
    }

    var brew_delay = storage.readValue("brew_delay");
    storage.storeValue("last_coffee", chrono.parseDate("in " + brew_delay).toISOString());
    brew_alert();
    return true;
}

function brew_alert_clear() {
    if (brew_alert_timeout) {
        clearTimeout(brew_alert_timeout);
        brew_alert_timeout=null;
    }
}

function brew_alert() {
    brew_alert_clear();

    var last_coffee = storage.readValue("last_coffee");
    if (!last_coffee) {
        return;
    }

    var when = parseISO(last_coffee);
    var now = new Date();
    if (when < now) {
        console.log("Fresh " + formatDistance(when, now) + " ago");
        return;
    }

    console.log("Will be ready in " + formatDistance(when, now));
    brew_alert_timeout = setTimeout(() => {
        console.log("Ding!");
        var roomId = storage.readValue("coffee_room_id");
        matrix_send_logged(client, roomId, "🔔 Coffee should be ready! ☕");
    }, differenceInMilliseconds(when, now));
}

function brew_started_alert() {
    var roomId = storage.readValue("coffee_room_id");
    matrix_send_logged(client, roomId, "Coffee is brewing! ⏲️");
}

function fresh_alert() {
    var roomId = storage.readValue("coffee_room_id");
    matrix_send_logged(client, roomId, "Coffee is fresh now! ☕");
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
        if (brew()) {
            res.writeHead(200);
            res.end('Thanks!');
            brew_started_alert();
        } else {
            res.writeHead(503);
            res.end('Already brewing');
        }
        log_request = true;
    } else if (url == '/fresh') {
        res.writeHead(200);
        res.end('Thanks!');
        fresh();
        fresh_alert();
        log_request = true;
    } else if (url == '/status') {
        res.setHeader('Content-Type', 'application/json');
        res.writeHead(200);
        res.end(status());
        log_request = false;
    } else if (url == '/') {
        if (!fs.existsSync('dist/front.html')) {
            res.writeHead(500);
            res.end('500 - dist folder not built');
        } else {
            var f = fs.readFileSync('dist/front.html', 'utf8');
            res.writeHead(200);
            res.end(f);
        }
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

if (storage.readValue("enable_matrix")) {
    client = new MatrixClient(
        storage.readValue("homeserver_url"),
        storage.readValue("access_token"),
        storage);
    console.log("Joining matrix...");
    client.start()
        .catch((response) => {
            client = null;
            console.log(response.body);
        })
        .finally(initBot);
    client.on("room.message", handleCommand);
} else {
    setTimeout(initBot, 100);
}

const server = http.createServer(handleRequest);
console.log("Listening at http://0.0.0.0:" + storage.readValue("http_port") + storage.readValue('http_prefix') + '/brew')
server.listen(parseInt(storage.readValue("http_port")));

