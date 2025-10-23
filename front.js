(function (global) { 
function init() {
    window.coffeebot = new Object();
    var brew = $('#brew');
    var fresh = $('#fresh');

    brew.click(function(e) {
        e.preventDefault();
        $.get('brew').then(update_status);
    });

    fresh.click(function(e) {
        e.preventDefault();
        $.get('fresh').then(update_status);
    });

    function update_status() {
        $.get('status').then(function(d) {
            if (window.coffeebot.status_timeout) {
                clearTimeout(window.coffeebot.status_timeout);
            }
            var last_coffee = new Date(d['last_coffee']);

            var now = new Date();
            var text = formatDistance(last_coffee, now);
            if (last_coffee < now) {
                if (now - last_coffee < 60*1000) {
                    text = 'now! ☕'
                } else {
                    text = text + ' ago';
                }
            } else {
                if (last_coffee - now < 10*1000) {
                    text = 'just a little bit more...';
                } else if (last_coffee - now < 60*1000) {
                    text = 'almost there...';
                } else {
                    text = 'in ' + text;
                }
            }
            $('#status').text(text);
            window.coffeebot.status_timeout = setTimeout(update_status, 500);
        });
    }

    update_status();
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