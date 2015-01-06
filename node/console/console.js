/* echo("\033[1@", true); */
var keypress  = require("keypress"),
    colors    = require('colors'),
    fs        = require('fs');
    argsParser = require('./argsParser'),
    settings  = require('../../settings.json'),
    name      = settings.general.name,
    ver       = settings.general.version,
    promptVal = name.bold+" "+ver.bold+" > ".green,
    commands  = [],
    history = [],
    currentPrev = 0;

var child, buffer, currentChar, sockets;

exports.start = function start(io) {
    sockets = io.sockets.sockets;
    keypress(process.stdin);  // make `process.stdin` begin emitting "keypress" events

    loadCommands();           // Load in commands
    
    // listen for the "keypress" event
    process.stdin.on("keypress", function (ch, key) {
        if (key && key.name == "return")            // Enter
            onEnter();
        else if (key && key.name == "backspace")    // Backspace
            backspace();
        else if (key && key.sequence == "\u0003")   // Control C
            prompt(true);
        else if (!key && ch)                        // Special char ![A-Za-z0-9]. key is undefined and you have to use ch in this case.
            acceptChar(ch);
        else if (key.name == "right" || key.name == "left") {     // Disable right and left arrows (for now) TODO: Implement this
            return;
        } else if (key.name == "up")                // Get the latest history
            histCycle("prev");
        else if (key.name == "down")                // Go forward a command if currentPrev is within range
            histCycle("next");
        else if (key.name == "tab")                 // Auto completion
            autocomplete();
        else {                                      // Have to use other chars in this case.
            if (key.ctrl == false) {
                acceptChar(key.sequence);
            }
        }
    });

    process.stdin.setRawMode(true);
    process.stdin.resume();
    prompt(false);
}

function onEnter() {
    if (buffer == "!!") {
        buffer = history[history.length-1];
    } else if (buffer.trim() == "") {
        prompt(true);
        return;
    }

    history.push(buffer);       // Add to history

    executeCmd(buffer, function(lineBreak) {
        prompt(lineBreak == false ? false : true);
    });
}

// TODO This segment will be affected one left/right arrow keys are implemented 
function backspace() {
    if (currentChar > 0) {      // If user is at start of term window and needs to go to the previous line
        echo("\033[1D", true);
        echo(' ', true);
        echo("\033[1D", true);
        currentChar--;
        buffer = buffer.substring(0, buffer.length-1);
    } else {
        bell();
        return;
    }
}

// Cycle forwards or backwards through cmd history
function histCycle(direction) {
    var oldCmd;

    if(direction == "prev" && history.length-currentPrev > 0) {
        oldCmd = history[history.length-currentPrev-1];
        currentPrev++;
    } else if(direction == "next" && currentPrev >= 1) {
        // Make it a blank terminal if the currentPrev is 1
        oldCmd = (currentPrev == 1) ? "" : history[history.length-currentPrev+1];
        currentPrev--;
    } else {
        bell();
        return;
    }

    echo("\033[1G", true);  // Moves cursor to beginning of line
    echo("\033[0K", true);  // Clear from cursor to end of line
    echo(promptVal, true);  // Echo previous cmd
    echo(oldCmd, true);

    buffer = oldCmd;        // Update buffer to previous cmd
    currentChar = buffer.length;
}

function autocomplete() {
    var matches = [];
    var reg;
    var tmpstr = "";

    commands.forEach(function(command) {
        reg = new RegExp("^"+buffer);
        if (reg.test(command) == true) {
            matches.push(command);
        };
    });

    if (matches.length == 1) {                  // 1 match so insert
        var cmd = matches[0] + " ";

        echo("\033["+buffer.length+"D", true);  // Move cursor back to beginning of prompt
        echo(cmd, true);

        buffer = cmd;                           // Update buffer to previous cmd
        currentChar = cmd.length;
    } else if (matches.length > 1) {            // Display matches to choose from
        matches.forEach(function(val) {
            tmpstr += val + ", ";
        });
        echo(tmpstr.substr(0, tmpstr.length-2));
    } else {
        bell();
        return;
    }
}

function prompt(newline) {
    buffer = "";
    currentChar = 0;
    currentPrev = 0;

    if (newline == true)
        echo('\n', true); 
        
    echo(promptVal, true);
}

function quit() {
    echo('\nStopping server...\n', true);
    process.exit(1);
}

function acceptChar(ch) {
    var reg = new RegExp(/\S| /);

    if (reg.test(ch) != true)
        return;

    buffer += ch;   // Add to buffer
    echo(ch, true); // Output character
    currentChar++;  // Increase character count
}

function bell() {
    echo('\u0007', true);
}

function listUsers() {
    if (sockets.length == 0) {
        console.log("No users connected.");
    }
    var a = 0;
    sockets.forEach(function(user) {
        if (typeof user.session === 'undefined') {
            console.log(++a+".\t"+"["+"guest".green+"]"+"\t"+user.ip);
        } else {
            console.log(++a+".\t"+"["+"user".red+"]"+"\t"+user.ip+"\t"+user.session.username.yellow);
        }
    })
}

function loadCommands() {
    cmds = fs.readdirSync("console/cmds");
    cmds.forEach(function(val) {
        commands.push(val.substr(0, val.length-3));
    });
}

function executeCmd(buffer, callback) {
    args = argsParser(buffer);
    if (args == null) {
        typeof callback === 'function' && callback(retval);
        return;
    }
    if (commands.indexOf(args[0]) < 0) {
        echo("\n"+args[0]+": command not found", true);
    } else {
        // Run command module
        var retval = require("./cmds/"+args[0])(args, sockets, callback);
    }
    if (args[0] != "uptime") {
        typeof callback === 'function' && callback(retval);
    }
}

function echo(txt, special) {
    special = typeof special !== 'undefined' ? special : false;
    // If it isn't an echo from the console, then show line and fix stdin buffer
    if (!special) {
        echo("\033[1G", true);  // Moves cursor to beginning of line
        echo("\033[0K", true);  // Clear from cursor to end of line
        echo(txt+"\n", true);   // Echo text
        echo(promptVal, true);  // Put buffer back
        echo(buffer, true);
    } else {
        process.stdout.write(txt);
    }
};

exports.log = echo;