var mysql = require('mysql');
var request = require('request-promise')
var util = require('util');

var mautic = {
    uri: process.env.MAUTIC_URL + '/api', // https://yourdomain.com'
    username: process.env.MAUTIC_AUTH_USER, // Basic Auth User
    password: process.env.MAUTIC_AUTH_PASSWORD // Basic Auth Password
}

var auth = {
    'user': mautic.username,
    'pass': mautic.password,
    'sendImmediately': true
}

var poolMautic = mysql.createPool({
    host: process.env.MAUTIC_DB_HOST,
    user: process.env.MAUTIC_DB_USER,
    password: process.env.MAUTIC_DB_PASSWORD,
    database: process.env.MAUTIC_DB_DATABASE,
    connectionLimit: 10
});

var queryMautic = util.promisify(poolMautic.query.bind(poolMautic))

var main = async () => {
    // Get current published emails
    var results = await queryMautic("SELECT id, sent_count FROM emails WHERE is_published = true AND email_type = 'list'")
    results
        .forEach(async (row) => {
            // checkPending
            var email_pending = await request.get({
                uri: mautic.uri + '/contacts',
                qs: {
                    search: `email_pending:${row.id}`,
                    minimal: true,
                    limit: 1
                },
                json: true,
                auth: auth
            })

            // Unpublish if pending down to zero
            if (email_pending.total == 0) {
                await request.patch({
                    uri: mautic.uri + `/emails/${row.id}/edit`,
                    form: {
                        isPublished: false
                    },
                    json: true,
                    auth: auth
                })
                console.log(`Unpublished ${row.id}`)
            }
        })
    
    poolMautic.end()
}

main()
