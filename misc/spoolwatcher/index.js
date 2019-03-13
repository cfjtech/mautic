const spawn = require('child_process').spawn
var RateLimiter = require('limiter').RateLimiter
var path = require('path')
var chokidar = require('chokidar')
var fs = require('fs');

const async = require('async')
const dir = process.env.SPOOL_DIR || '/var/www/html/spool/default'
var pattern = `${dir}/*.message`
const rate = 80
const concurrency = 20
var limiter = new RateLimiter(rate, 'second')

var q = async.queue(function ls(task, callback) {
    console.log(task)
    var script = path.resolve(__dirname, 'send.php')
    limiter.removeTokens(1, function() {
        var child = spawn('php', [script, task], {detached: true})

        child.on('close', function(code) {
            callback()
        })
    })
}, concurrency)

q.drain = function() {
    console.log('all items have been processed')
}

// Need to rename all .sending to normal
fs.readdir(dir, (err, files) => {
    if ( err ) console.log('ERROR: ' + err);
    files.forEach(file => {
        fs.rename(`${dir}/${file}`, `${dir}/${file.replace('.sending', '')}`, function(err) {
            if ( err ) console.log('ERROR: ' + err);
        });
    });
});

// One-liner for current directory, ignores .dotfiles
const watcher = chokidar
.watch(pattern, {
        usePolling: true,
        interval: 5000,
        awaitWriteFinish: true,
        ignored: /(^|[\/\\])\../
    })
    .on('add', path => q.push(path))

var stop = function () { 
    console.log('draining. wait for 10s')
    watcher.close()    
    setTimeout(() => {
        console.log('done')
    }, 10000);
}

process.on('SIGTERM', stop);
process.on('SIGINT', stop);
