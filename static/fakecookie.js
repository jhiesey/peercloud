// TODO: store in outer frame's localStorage
var cookies = [];

Object.defineProperty(document, 'cookie', {
	get: function () {
		var entries = [];
		var now = Date.now();
		// Filter out old cookies when getting
		cookies = cookies.filter(function (cookie) {
			if (location.pathname.indexOf(cookie.path) !== 0)
				return true;
			if (cookie.expires !== null && cookie.date < now) {
				return false;
			} 
			// TODO: domain
			if (cookie.max_age !== null && (now - cookie.created) > cookie.max_age * 1000)
				return false;
			entries.push(cookie.key + '=' + cookie.val);
			return true;
		});
		return entries.join(';');
	},
	set: function (value) {
		var items = value.split(';');
		var key;
		var val;
		var path = location.pathname;
		var lastSlash = path.lastIndexOf('/');
		path = path.substr(0, lastSlash + 1);
		var domain = location.host;
		var max_age = null;
		var expires = null;
		var secure = false;
		items.forEach(function (item, i) {
			var equals = item.indexOf('=');
			if (equals < 0)
				equals = item.length;
			var first = item.substr(0, equals);
			var second = item.substr(equals + 1);
			if (i === 0) {
				key = first;
				val = second;
			} else {
				switch (first) {
					case 'path':
						if (second[0] === '/')
							path = second;
						break;
					case 'domain':
						break; // TODO: domain
					case 'max-age':
						max_age = parseInt(second);
						break;
					case 'expires':
						expires = Date.parse(second);
						break;
					case 'secure':
						secure = true;
						break;
				}
			}
		});

		if (secure)
			return;

		cookies = cookies.filter(function (cookie) {
			return cookie.key !== key;
		});

		cookies.push({
			key: key,
			val: val,
			path: path,
			domain: domain,
			max_age: max_age,
			created: Date.now(),
			expires: expires
		});
	}
});
