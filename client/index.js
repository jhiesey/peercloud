var debug = require('debug')('peercloud.io')
var mime = require('mime')
var Peer = require('simple-peer')
var thunky = require('thunky')
var toArrayBuffer = require('to-arraybuffer')
var WebTorrent = require('webtorrent')
var xhr = require('xhr')

var TRACKER_URL = 'wss://tracker.webtorrent.io'

global.WEBTORRENT_ANNOUNCE = [ 'wss://tracker.openwebtorrent.com', 'wss://tracker.btorrent.xyz', 'wss://tracker.fastcast.nz' ]

if (!Peer.WEBRTC_SUPPORT || !navigator.serviceWorker) {
	alert('This browser is unsupported. Please use a browser with WebRTC support and ServiceWorker support.')
	return;
}

var locationField = document.getElementById('location')
var goButton = document.getElementById('go-button')

goButton.addEventListener('click', function () {
	loadPage(locationField.value)
})

function syncLocation (firstLoad) {
	if (location.hash) {
		locationField.value = location.hash.substr(1)
	} else if (!firstLoad) {
		locationField.value = ''
	}
}
syncLocation(true)

window.addEventListener('hashchange', function () {
	syncLocation()
});

/*
indexed by infoHash
{
	files: [
		{
			name: '',
			cb: //function
		}
	]
}
*/
var waitingTorrents = {};

function fetchFileFromTorrent(torrent, path, cb) {
	for (var i = 0; i < torrent.files.length; i++) {
		var file = torrent.files[i];
		if (file.path === torrent.name + '/' + path) {
			file.getBuffer(function (err, buffer) {
				if (err) return cb(err);
				cb(null, toArrayBuffer(buffer));
			});
			return;
		}
	}

	cb(new Error('file not found'))
}

function torrentReady (torrent) {
	var entry = waitingTorrents[torrent.infoHash];
	entry.torrent = torrent;
	entry.files.forEach(function (file) {
		fetchFileFromTorrent(torrent, file.path, file.cb)
	});

}

function fetchFile(infoHash, path, cb) {
	var entry = waitingTorrents[infoHash];

	if (!entry) {
		getClient(function (err, client) {
			if (err) return console.error(err)
			client.add(infoHash, torrentReady)
		})
		waitingTorrents[infoHash] = {
			files: [],
			torrent: null
		};
	}

	if (entry && entry.torrent) {
		fetchFileFromTorrent(entry.torrent, path, cb)
	} else {
		waitingTorrents[infoHash].files.push({
			path: path,
			cb: cb
		});
	}
}

function messageWorker() {
	worker.postMessage.apply(worker, arguments);
}

var pageId = Math.random(1, 2);

window.addEventListener('unload', function () {
	messageWorker({
		type: 'unload',
		pageId: pageId
	});
});

var HEARTBEAT_RESET_TIME = 5 // seconds

setInterval(function () {
	messageWorker({
		type: 'heartbeat',
		pageId: pageId
	})
}, HEARTBEAT_RESET_TIME * 1000)

var worker = null
navigator.serviceWorker.register('/service-worker.js').then(function (registration) {
	if (!registration.active) {
		// Refresh to activate the worker
		location.reload()
		return
	}
	worker = registration.active

	var messageChannel = new MessageChannel()
	messageChannel.port1.onmessage = function(event) {
		var data = event.data
		switch(data.type) {
			case 'fetch':
				fetchFile(data.hash, data.path, function (err, buffer) {
					var msg = {
						type: 'response',
						hash: data.hash,
						path: data.path,
						err: null
					}
					if (!err) {
						msg.response = {
							body: buffer,
							mime: mime.getType(data.path)
						}
					} else {
						msg.err = err.message
					}
					messageWorker(msg)
				});
				break
			default:
				console.log('Unexpected message from service worker:', data);
				break
		}
	};

	messageWorker({
		type: 'returnpipe',
		pageId: pageId
	}, [messageChannel.port2])

	goButton.disabled = false
}).catch(function (err) {
	console.error('service worker failed')
	console.error(err)
});

var MATCH_PATH = /\/?([a-fA-F0-9]{40})(?:\/(.*))?$/

// Loads the correct content
function loadPage (loc) {
	var matches = MATCH_PATH.exec(loc)
	if (matches) {
		var hash = matches[1]
		var path = matches[2] || ''
		var a = document.createElement('a')
		a.target = '_blank'
		a.href = '/sandbox/' + hash + '/' + path
		a.click()
	} else {
		console.log(loc)
		alert('The location must start with a 40-character hash')
	}
}

var getClient = thunky(function (cb) {
	xhr('/rtcConfig', function (err, res) {
		var rtcConfig
		if (err || res.statusCode !== 200) {
			console.error('Could not get WebRTC config from server. Using default (without TURN).')
		} else {
			try {
				rtcConfig = JSON.parse(res.body)
			} catch (err) {
				return cb(new Error('Expected JSON response from /rtcConfig: ' + res.body))
			}
			debug('got rtc config: %o', rtcConfig)
		}
		var client = new WebTorrent({
			tracker: {
				rtcConfig
			}
		})
		client.on('warning', console.warn)
		client.on('error', console.error)
		cb(null, client)
	})
})
