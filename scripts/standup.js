// Description:
//   Have Hubot remind you to do standups.
//
// Commands:
//   hubot standup help - See a help document explaining how to use.
//   hubot create standup hh:mm - Creates a standup at hh:mm every weekday for this room
//   hubot list standups - See all standups for this room
//   hubot list standups in every room - See all standups in every room
//   hubot delete hh:mm standup - If you have a standup at hh:mm, deletes it
//   hubot delete all standups - Deletes all standups for this room.
//
// Notes:
//   hh:mm must be in the same timezone as the server Hubot is on. Probably UTC.
//   This is configured to work for Hipchat. You may need to change the 'create standup' command
//   to match the adapter you're using.
//
// Dependencies:
//   underscore
//   cron

var cronJob = require('cron').CronJob;
var _ = require('underscore');

module.exports = function(robot) {

    var STANDUP_URL = 'https://appear.in/siftware-standup';
    var WARNING_TIME = 10; // minutes

    // Constants.
    var STANDUP_WARNINGS = [
        "@channel Get the kettle on, Standup in 10",
        "@channel This is your 10 minute standup warning",
        "@channel You've got a standup in 10 minutes",
        "@channel Time to put your day in order: Standup in 10 minutes",
        "@channel Grab a brew, standup soon",
    ];

    // Constants.
    var STANDUP_MESSAGES = [
        "@channel Standup time!",
        "@channel Time for standup, y'all.",
        "@channel It's standup time once again!",
        "@channel Get up, stand up (it's time for our standup)",
        "@channel Standup time. Get up, humans",
        "@channel Another day, another standup",
    ];

    // Check for standups that need to be fired, once a minute
    // Monday to Friday.
    var standupClock = new cronJob('1 * * * * 1-5', function() {
        checkStandups();
    }, null, true);

    // Compares current time to the time of the standup
    // to see if it should be fired.
    function standupShouldFire(standupTime) {
        var now = new Date();
        var currentHours = now.getHours();
        var currentMinutes = now.getMinutes();

        var standupHours = standupTime.split(':')[0];
        var standupMinutes = standupTime.split(':')[1];

        try {
            standupHours = parseInt(standupHours);
            standupMinutes = parseInt(standupMinutes);
        }
        catch (_error) {
            return false;
        }

        if (standupHours == currentHours && standupMinutes == currentMinutes) {
            return true;
        }
        return false;
    }

    // Compares current time + 10 minutes to the time of the standup
    // to see if the warning should be fired.
    function standupWarningShouldFire(standupTime) {
        var now = new Date();
        var minutes = WARNING_TIME;
        var soon = new Date(now.getTime() + minutes*60000);

        var currentHours = soon.getHours();
        var currentMinutes = soon.getMinutes();

        var standupHours = standupTime.split(':')[0];
        var standupMinutes = standupTime.split(':')[1];

        try {
            standupHours = parseInt(standupHours);
            standupMinutes = parseInt(standupMinutes);
        }
        catch (_error) {
            return false;
        }

        if (standupHours == currentHours && standupMinutes == currentMinutes) {
            return true;
        }
        return false;
    }

    // Returns all standups.
    function getStandups() {
        return robot.brain.get('standups') || [];
    }

    // Returns just standups for a given room.
    function getStandupsForRoom(room) {
        var allStandups = getStandups();
        var standupsForRoom = [];
        _.each(allStandups, function(standup) {
            if (standup.room == room) {
                standupsForRoom.push(standup);
            }
        });
        return standupsForRoom;
    }

    // Gets all standups, fires ones that should be.
    function checkStandups() {
        var standups = getStandups();

        _.each(standups, function(standup) {
            if (standupShouldFire(standup.time)) {
                doStandup(standup.room);
            }
            if (standupWarningShouldFire(standup.time)) {
                doStandupWarning(standup.room);
            }
        });
    }

    // Fires the standup message.
    function doStandup(room) {
        var message = _.sample(STANDUP_MESSAGES + ' ' + STANDUP_URL);
        robot.messageRoom(room, message);
    }

    // Fires the standup warning message.
    function doStandupWarning(room) {
        var message = _.sample(STANDUP_WARNINGS);
        robot.messageRoom(room, message);
    }

    // Stores a standup in the brain.
    function saveStandup(room, time) {
        var standups = getStandups();
        var newStandup = {
            time: time,
            room: room
        };
        standups.push(newStandup);
        updateBrain(standups);
    }

    // Updates the brain's standup knowledge.
    function updateBrain(standups) {
        robot.brain.set('standups', standups);
    }

    function clearAllStandupsForRoom(room) {
        var standups = getStandups();
        var standupsToKeep = [];
        var standupsRemoved = 0;
        _.each(standups, function(standup) {
           if (standup.room != room) {
               standupsToKeep.push(standup);
           }
           else {
               standupsRemoved++;
           }
        });
        updateBrain(standupsToKeep);
        return standupsRemoved;
    }

    function clearSpecificStandupForRoom(room, time) {
        var standups = getStandups();
        var standupsToKeep = [];
        var standupsRemoved = 0;
        _.each(standups, function(standup) {
            if (standup.room == room && standup.time == time) {
                standupsRemoved++;
            }
            else {
                standupsToKeep.push(standup);
            }
        });
        updateBrain(standupsToKeep);
        return standupsRemoved;
    }

    robot.respond(/delete all standups/i, function(msg) {
        if(robot.adapterName == 'slack') {
            var room = msg.envelope.user.room;
        } else {
            var room = msg.envelope.user.reply_to;
        }
        var standupsCleared = clearAllStandupsForRoom(room);
        msg.send('Deleted ' + standupsCleared + ' standup' + (standupsCleared === 1 ? '' : 's') + '. No more standups for you.');
    });

    robot.respond(/delete ([0-5]?[0-9]:[0-5]?[0-9]) standup/i, function(msg) {
        var time = msg.match[1]
        if(robot.adapterName == 'slack') {
            var room = msg.envelope.user.room;
        } else {
            var room = msg.envelope.user.reply_to;
        }
        var standupsCleared = clearSpecificStandupForRoom(room, time);
        if (standupsCleared === 0) {
            msg.send("Nice try. You don't even have a standup at " + time);
        }
        else {
            msg.send("Deleted your " + time + " standup.");
        }
    });

    robot.respond(/create standup ([0-5]?[0-9]:[0-5]?[0-9])$/i, function(msg) {
        var time = msg.match[1];

        // NOTE: This works for Hipchat. You may need to change this line to 
        // match your adapter. 'room' must be saved in a format that will
        // work with the robot.messageRoom function.
        if(robot.adapterName == 'slack') {
            var room = msg.envelope.user.room;
        } else {
            var room = msg.envelope.user.reply_to;
        }

        saveStandup(room, time);
        msg.send("Ok, from now on I'll remind this room to do a standup every weekday at " + time);
    });

    robot.respond(/list standups$/i, function(msg) {
        if(robot.adapterName == 'slack') {
            var room = msg.envelope.user.room;
        } else {
            var room = msg.envelope.user.reply_to;
        }
        var standups = getStandupsForRoom(room);

        if (standups.length === 0) {
            msg.send("Well this is awkward. You haven't got any standups set :-/");
        }
        else {
            var standupsText = [];
            standupsText.push("Here's your standups:");
            _.each(standups, function (standup) {
                standupsText.push(standup.time);
            });
            msg.send(standupsText.join('\n'));
        }
    });

    robot.respond(/list standups in every room/i, function(msg) {
        var standups = getStandups();
        if (standups.length === 0) {
            msg.send("No, because there aren't any.");
        }
        else {
            var standupsText = [];
            standupsText.push("Here's the standups for every room:");
            _.each(standups, function (standup) {
                standupsText.push('Room: ' + standup.room + ', Time: ' + standup.time);
            });
            msg.send(standupsText.join('\n'));
        }
    });

    robot.respond(/standup help/i, function(msg) {
        var message = [];
        message.push("I can remind you to do your daily standup!");
        message.push("Use me to create a standup, and then I'll post in this room every weekday at the time you specify. Here's how:");
        message.push("");
        message.push(robot.name + " create standup hh:mm - I'll remind you to standup in this room at hh:mm every weekday.");
        message.push(robot.name + " list standups - See all standups for this room.");
        message.push(robot.name + " list standups in every room - Be nosey and see when other rooms have their standup.");
        message.push(robot.name + " delete hh:mm standup - If you have a standup at hh:mm, I'll delete it.");
        message.push(robot.name + " delete all standups - Deletes all standups for this room.");
        msg.send(message.join('\n'));
    });
};
