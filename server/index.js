var compress = require('compression')
var debug = require('debug')('peercloud')
var express = require('express')
var http = require('http')
var pug = require('pug')
var path = require('path')
var url = require('url')
var twilio = require('twilio')

var config = require('../config')
var secret = require('../secret')

var app = express()
var httpServer = http.createServer(app)

// Templating
app.set('views', __dirname + '/views')
app.set('view engine', 'pug')
app.set('x-powered-by', false)

app.use(compress())

app.use(function (req, res, next) {
  // Strict transport security (to prevent MITM attacks on the site)
  if (config.isProd) {
    res.header('Strict-Transport-Security', 'max-age=31536000')
  }

  // Add cross-domain header for fonts, required by spec, Firefox, and IE.
  var extname = path.extname(url.parse(req.url).pathname)
  if (['.eot', '.ttf', '.otf', '.woff', '.woff2'].indexOf(extname) >= 0) {
    res.header('Access-Control-Allow-Origin', '*')
  }

  // Prevents IE and Chrome from MIME-sniffing a response. Reduces exposure to
  // drive-by download attacks on sites serving user uploaded content.
  res.header('X-Content-Type-Options', 'nosniff')

  // Enable the XSS filter built into most recent web browsers. It's usually
  // enabled by default anyway, so role of this headers is to re-enable for this
  // particular website if it was disabled by the user.
  res.header('X-XSS-Protection', '1; mode=block')

  // Force IE to use latest rendering engine or Chrome Frame
  res.header('X-UA-Compatible', 'IE=Edge,chrome=1')

  next()
})

app.use(express.static(path.join(__dirname, '../static')))

app.get('/', function (req, res) {
  // Prevent rendering of site within a frame.
  res.header('X-Frame-Options', 'DENY')
  res.render('index')
})

// Fetch new iceServers from twilio token regularly
var iceServers
var twilioClient = twilio(secret.twilio.accountSid, secret.twilio.authToken)

function updateIceServers () {
  twilioClient.tokens.create({}, function (err, token) {
    if (err) return error(err)
    if (!token.iceServers) {
      return error(new Error('twilio response ' + token + ' missing iceServers'))
    }

    iceServers = token.iceServers
      .filter(function (server) {
        var urls = server.urls || server.url
        return urls && !/^stun:/.test(urls)
      })
    iceServers.unshift({ url: 'stun:23.21.150.121' })

    // Support new spec (`RTCIceServer.url` was renamed to `RTCIceServer.urls`)
    iceServers = iceServers.map(function (server) {
      if (server.urls === undefined) server.urls = server.url
      return server
    })
  })
}

setInterval(updateIceServers, 60 * 60 * 4 * 1000).unref()
updateIceServers()

app.get('/rtcConfig', function (req, res) {
  if (!iceServers) res.status(404).send({ iceServers: [] })
  else res.send({ iceServers: iceServers })
})

app.get('*', function (req, res) {
  res.status(404).render('error', { message: '404 Not Found' })
})

// error handling middleware
app.use(function (err, req, res, next) {
  error(err)
  res.status(500).render('error', { message: err.message || err })
})

httpServer.listen(config.ports.http, 'localhost', function (err) {
  if (err) throw err
  debug('listening on port %s', JSON.stringify(config.ports))
});

function error (err) {
  console.error(err.stack || err.message || err)
}
