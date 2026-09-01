"""
A static server for development that never lets the browser cache anything.

`python -m http.server` sends no cache headers at all, which leaves the browser
free to apply its own heuristic freshness — and for ES modules it does. The
effect is nasty: `index.html` reloads, one module comes back fresh and another
is served from cache, and the app either behaves like code you have already
changed or fails outright with "does not provide an export named ...".

That has cost real debugging time twice, both times spent re-reading source that
was already correct. `no-store` on every response makes it impossible.

Nothing here is used by the published site, which is plain static files on
GitHub Pages. This is only what `.claude/launch.json` runs locally.

Usage: python tools/devserver.py [port]
"""

import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

    def log_message(self, fmt, *args):
        # One line per request is noise when the page pulls twenty modules.
        if not str(args[1] if len(args) > 1 else '').startswith('2'):
            super().log_message(fmt, *args)


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8846
    server = ThreadingHTTPServer(('127.0.0.1', port), NoCacheHandler)
    print(f'PhysicsBench dev server on http://localhost:{port} (no-store)')
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        server.server_close()


if __name__ == '__main__':
    main()
