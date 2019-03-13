var mysql = require('mysql');
var request = require('request-promise')
var transform = require('parallel-transform');
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

var poolSendy = mysql.createPool({
    host: process.env.SENDY_DB_HOST,
    user: process.env.SENDY_DB_USER,
    password: process.env.SENDY_DB_PASSWORD,
    database: process.env.SENDY_DB_DATABASE,
    connectionLimit: 10
});

var poolMautic = mysql.createPool({
    host: process.env.MAUTIC_DB_HOST,
    user: process.env.MAUTIC_DB_USER,
    password: process.env.MAUTIC_DB_PASSWORD,
    database: process.env.MAUTIC_DB_DATABASE,
    connectionLimit: 10
});

var querySendy = util.promisify(poolSendy.query.bind(poolSendy))
var queryMautic = util.promisify(poolMautic.query.bind(poolMautic))

var segmentsLookup = {}

var migrate = transform(50, { objectMode: true }, async (subscriber, callback) => {
    var users = await queryMautic(`SELECT id FROM leads WHERE email = ?`, [subscriber.email])

    var contactId
    var segmentId = segmentsLookup[subscriber.list_name]
    var addSegment

    if (!users.length) {
        // Create user
        try {
            var user = await request.post({
                uri: mautic.uri + '/contacts/new',
                json: true,
                auth: auth,
                form: {
                    email: subscriber.email,
                    firstname: subscriber.firstname
                }
            })
            contactId = user.contact.id
            addSegment = true
            console.log(`Imported ${subscriber.email}`)
        } catch (e) {
            console.log(`Failed to import ${subscriber.email}`)
        }

    } else {
        contactId = users[0].id
        try {
            var userSegments = await queryMautic(`SELECT lead_id FROM lead_lists_leads WHERE leadlist_id = ${segmentId} AND lead_id = ${contactId}`)
            console.log(`Checked segment ${segmentId} on ${contactId} ${subscriber.email}`)
            if (!userSegments.length) {
                addSegment = true
            }
        } catch (e) {
            console.log(`Failed checking segment ${segmentId} on ${contactId} ${subscriber.email}`)
        }
    }

    // Add into segment
    if (addSegment) {
        try {
            await queryMautic(`INSERT INTO lead_lists_leads (lead_id, leadlist_id, date_added, manually_removed, manually_added) VALUES (${contactId}, ${segmentId}, NOW(), 0, 1)`)
            console.log(`Added ${subscriber.email} into ${subscriber.list_name} (${contactId}, ${segmentId})`)
        } catch (e) {
            console.log(`Failed adding ${subscriber.email} into ${subscriber.list_name} (${contactId}, ${segmentId})`)
        }
    }

    callback()
});

var main = async () => {
    // Get current segment list on Mautic
    var segments = await request.get({
        uri: mautic.uri + '/segments',
        qs: {
            limit: 1000
        },
        json: true,
        auth: auth
    })

    segments = Object.values(segments.lists)

    // Get current list on sendy
    var results = await querySendy("SELECT * FROM lists WHERE app = 1")
    var sendListIds = results.map(row => row.id)

    // Compare and create
    results.forEach(async (row) => {
        var found = segments.find(segment => segment.name == row.name)
        if (!found) {
            await request.post({
                uri: mautic.uri + '/segments/new',
                json: true,
                auth: auth,
                form: {
                    name: row.name,
                }
            })
            console.info(`Created ${row.name} segment`)
        }
    })

    // Refresh
    segments = await request.get({
        uri: mautic.uri + '/segments',
        qs: {
            limit: 1000
        },
        json: true,
        auth: auth
    })
    Object.values(segments.lists).forEach((segment) => {
        segmentsLookup[segment.name] = segment.id
    })

    console.log(segmentsLookup)

    var cursor = poolSendy
        .query("SELECT email, s.name as firstname, l.name as list_name FROM subscribers s LEFT JOIN lists l ON s.list = l.id WHERE unsubscribed = 0 AND complaint = 0 AND bounced = 0 AND confirmed = 1 AND s.list IN (?)", [sendListIds])
        .stream()
        .pipe(migrate)
        .on('finish', function () { console.log('done'); })

    // pool.end()
}

main()
