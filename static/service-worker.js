/*global self, caches, fetch, Request */

var OFFLINE_STORAGE = 'offline'

var FILES = [
'bundle.js',
'main.css',
'service-worker.js',
'fakecookie.js',
''
]

function storeStatic () {
	var requests = FILES.map(function (path) {
		return new Request('/' + path)
	})
	var responses = requests.map(function (request) {
		return fetch(request)
	})
	return caches.open(OFFLINE_STORAGE).then(function (cache) {
		return Promise.all(responses.map(function (response, i) {
			return response.then(function (responseVal) {
				return cache.put(requests[i], responseVal)
			})
		}))
	})
}

var MATCH_PATH = /\/sandbox\/([a-fA-F0-9]{40})(?:\/([^\?]*))?(?:\?|$)/

var HEARTBEAT_TIMEOUT = 10 // seconds

self.addEventListener('install', function (event) {
	event.waitUntil(storeStatic())
})

self.addEventListener('fetch', function (event) {
	var matches = MATCH_PATH.exec(event.request.url)

	if (event.request.method === 'GET') {
		if (matches) {
			var hash = matches[1]
			var path = matches[2]
			event.respondWith(new Promise(function (resolve, reject) {
				fetchFromTorrent(hash, path, function (err, response) {
					if (err) {
						reject(err)
					} else {
						resolve(new Response(new Blob([response.body]), {
							status: 200,
							headers: {
								'Content-Type': response.mime,
								'Content-Length': response.body.byteLength,
								'Content-Security-Policy': 'sandbox allow-scripts allow-popups'
							}
						}))
					}
				})
			}))
		} else {
			event.respondWith(caches.match(event.request).then(function (response) {
				return response || fetch(event.request)
			}))
			// Update the stored copy of the site after we load the main page
			if (event.request.url === self.location.protocol + '//' + self.location.host + '/') {
				storeStatic().catch(function (err) {
					console.warn('Failed to update site')
				})
			}
		}
 	}
})

// Indexed by page id, contains page id, port, requests
var pipes = {}
var outstandingRequests = {}

function fetchFromTorrent (hash, path, cb) {
	var id = hash + '/' + path
	if (!outstandingRequests[id]) {
		outstandingRequests[id] = {
			hash: hash,
			path: path,
			callbacks: [],
			requestedPage: null
		}
	}
	outstandingRequests[id].callbacks.push(cb)
	sendOutstanding()
}

function setPipe (pageId, port) {
	if (pipes[pageId]) {
		clearTimeout(pipes[pageId].timeout)
		delete pipes[pageId]
		// resend messages
		Object.keys(outstandingRequests).forEach(function (id) {
			var request = outstandingRequests[id]
			if (request.requestedPage === pageId) {
				request.requestedPage = null
			}
		})
		sendOutstanding()
	}

	if (port) {
		pipes[pageId] = {
			pageId: pageId,
			port:port,
		}
		resetTimer(pageId)
		sendOutstanding()
	}
}

function resetTimer(pageId) {
	var pipe = pipes[pageId]
	if (!pipe)
		return

	clearTimeout(pipe.timeout)
	pipe.timeout = setTimeout(function () {
		setPipe(pageId, null)
	}, HEARTBEAT_TIMEOUT * 1000)
}

self.addEventListener('message', function (event) {
	var data = event.data
	switch(data.type) {
		case 'returnpipe':
			setPipe(data.pageId, event.ports[0])
			break
		case 'response':
			var id = data.hash  + '/' + data.path
			var entry = outstandingRequests[id]
			if (entry) {
				entry.callbacks.forEach(function (cb) {
					var err = data.err ? new Error(data.err) : null
					cb(err, data.response)
				})
				delete outstandingRequests[id]
			}
			break
		case 'unload':
			setPipe(data.pageId, null)
			break
		case 'heartbeat':
			resetTimer(data.pageId)
			break
		default:
			console.warn('Unexpected message:', event.data)
			break
	}
})

function sendOutstanding() {
	var pipe = pipes[Object.keys(pipes)[0]]
	if (pipe) {
		Object.keys(outstandingRequests).forEach(function (id) {
			var request = outstandingRequests[id]
			if (!request.requestedPage) {
				pipe.port.postMessage({
					type: 'fetch',
					hash: request.hash,
					path: request.path
				})
				request.requestedPage = pipe.pageId
			}
		})
	}
}
