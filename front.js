(function (global) { 
function init() {
    window.coffeebot = new Object();
    var brew = $('#brew');
    var fresh = $('#fresh');
    var fullscreen = $('#fullscreen');

    brew.click(function(e) {
        e.preventDefault();
        $.get('brew').then(update_status);
    });

    fresh.click(function(e) {
        e.preventDefault();
        $.get('fresh').then(update_status);
    });

    fullscreen.click(function(e) {
        e.preventDefault();
        if (document.fullscreenElement) {
            document.exitFullscreen();
        } else {
            // $('body').requestFullscreen();
            document.querySelector("body").requestFullscreen();
        }
    });

    function update_status() {
        $.get('status').then(function(d) {
            if (window.coffeebot.status_timeout) {
                clearTimeout(window.coffeebot.status_timeout);
            }
            var last_coffee = new Date(d['last_coffee']);
            var client_status = d['client_status'];
            if (client_status && (typeof client_status == 'string' || client_status instanceof String)) {
                $('#client_status').text(client_status);
            }

            var now = new Date();
            var text = formatDistance(last_coffee, now);
            var mood = "";
            if (last_coffee < now) {
                var delta = now - last_coffee;
                if (delta < 60*1000) {
                    text = 'now! ☕'
                    mood = "😁";
                } else {
                    text = text + ' ago';
                    if (delta < 15*60*1000) {
                        mood = "🙂";
                    } else if (delta < 3*60*60*1000) {
                        mood = "😐️";
                    } else if (delta < 4*60*60*1000) {
                        mood = "😒";
                    } else if (delta < 5*60*60*1000) {
                        mood = "🙁";
                    } else if (delta < 8*60*60*1000) {
                        mood = "😦";
                    }
                }
            } else {
                if (last_coffee - now < 10*1000) {
                    text = 'just a little bit more...';
                    mood = "🫣";
                } else if (last_coffee - now < 60*1000) {
                    text = 'almost there...';
                    mood = "🫢";
                } else {
                    text = 'in ' + text;
                    mood = "🙂";
                }
            }
            $('#coffee_status').text(text);
            $('#mood').text(mood);
            window.coffeebot.status_timeout = setTimeout(update_status, 500);
        });
    }

    update_status();
    setTimeout(function() {
        global.location.reload(true);
    }, 12*60*60*1000); // Page refresh twice a day
}

Promise.all([
    import("npm:jquery").then((m) => {
        global.$ = m;
    }),
    import("npm:date-fns").then((m) => {
        global.isBefore = m.isBefore;
        global.parseISO = m.parseISO;
        global.formatDistance = m.formatDistance;
        global.differenceInMilliseconds = m.differenceInMilliseconds;
    }),
]).then(() => {
    init();
})

})(typeof window !== "undefined" ? window : global);