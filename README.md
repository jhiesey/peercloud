# Peercloud

## Decentralized web hosting over WebTorrent

With Peercloud, you can host and view static websites without servers. You download the
site's resources from other regular web browsers just like yours!

For this to work, you need a
browser that supports [WebRTC](https://developer.mozilla.org/en-US/docs/Web/Guide/API/WebRTC) and
[service workers](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API). Currently
this only includes Chrome, although Firefox is adding support for service workers soon.

## How do I use it?

To see a demo, go to the homepage at [peercloud.io](https://peercloud.io)

Simply paste the infohash of a torrent (seeded with WebTorrent) that contains the site you want to
visit and click go.

If you want to host your own site using peercloud, just create a folder containing the files you
want to host, including an index.html file in the root. As long as you use relative paths for all
resources, the site should render exactly the same as if you used any other server to
serve the same static files. For a simple way to seed your torrent, go to
[instant.io](https://instant.io/) and drag your folder onto your browser. The infohash for your
new torrent will appear, which you can then paste into peercloud.

## How does it work?

The peercloud.io site doesn't actually host any content. It just provides the code needed to fetch
individual sites from torrents using [WebTorrent](https://webtorrent.io/). This means that you
have access to the same things whether you go to the official site or any other mirror (including
one you run yourself), so long as the person hosting the mirror is serving the correct code.

Furthermore, when you visit peercloud.io for the first time, your browser will permanently cache
the peercloud.io site itself using a service worker. This means that the site will continue to
function even if you can no longer access the peercloud.io server.

When you supply an infohash and click go, a new tab opens pointing to
`https://peercloud.io/sandbox/<infohash>/index.html`. The browser will then request index.html from
the service worker, which will in turn make peercloud start downloading the torrent and return
the index file. As the site requests more resources, they too will be downloaded from the torrent.

If you request a resource from a relative url, like "myimage.jpg", it will be looked up within your
same torrent. To request a resource from a different torrent, just use a path that starts with the
root directory, like this: `/sandbox/<infohash-of-other-torrent>/path/within/other/torrent.jpg`

## Limitations

* For security reasons, all pages are sandboxed using
[Content Security Policy](https://developer.mozilla.org/en-US/docs/Web/Security/CSP). Without this,
any torrent could access any resource from any other torrent, which isn't desirable. An unfortunate
side effect is that every resource has an anonymous origin, preventing many web features like
cookies and XHR requests from working properly. I hope to provide a polyfill library to emulate
these features in a safe way at some point in the future.

* Since Chrome doesn't support WebRTC from service workers, you always need a tab open to the main
peercloud.io site when browsing. This means that you can't directly link to a particular torrent,
since that wouldn't open the homepage as well. This can be fixed once Chrome implements WebRTC in
serviceworkers, so if you want to see this fixed, you should
[star this issue on the chromium bug tracker](https://code.google.com/p/chromium/issues/detail?id=302019).

* This is still very experimental! If you think you can help make it better, please send me a pull
request.

## License

MIT. Copyright (c) John Hiesey.

