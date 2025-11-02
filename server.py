import json
import os
from http.server import HTTPServer, SimpleHTTPRequestHandler
from urllib.parse import urlparse

DATA_DIR = os.path.join(os.path.dirname(__file__), 'data')
POSTS_FILE = os.path.join(DATA_DIR, 'posts.json')

os.makedirs(DATA_DIR, exist_ok=True)
if not os.path.exists(POSTS_FILE):
    with open(POSTS_FILE, 'w', encoding='utf-8') as f:
        json.dump([], f)


def read_posts():
    try:
        with open(POSTS_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception:
        return []


def write_posts(posts):
    with open(POSTS_FILE, 'w', encoding='utf-8') as f:
        json.dump(posts, f, ensure_ascii=False, indent=2)


class Handler(SimpleHTTPRequestHandler):
    def _send_json(self, data, status=200):
        payload = json.dumps(data, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def _read_body(self):
        length = int(self.headers.get('Content-Length', 0))
        if length == 0:
            return None
        raw = self.rfile.read(length)
        try:
            return json.loads(raw.decode('utf-8'))
        except Exception:
            return None

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == '/api/posts':
            posts = read_posts()
            return self._send_json(posts, 200)
        return super().do_GET()

    def do_POST(self):
        parsed = urlparse(self.path)
        if parsed.path == '/api/posts':
            body = self._read_body()
            if not body:
                return self._send_json({'error': 'Invalid JSON'}, 400)
            posts = read_posts()
            # assegna id se mancante
            if 'id' not in body or not body['id']:
                body['id'] = self._generate_id()
            posts.append(body)
            write_posts(posts)
            return self._send_json(body, 201)
        return super().do_POST()

    def do_PUT(self):
        parsed = urlparse(self.path)
        if parsed.path.startswith('/api/posts/'):
            post_id = parsed.path.split('/')[-1]
            body = self._read_body()
            if not body:
                return self._send_json({'error': 'Invalid JSON'}, 400)
            posts = read_posts()
            updated = False
            for i, p in enumerate(posts):
                if p.get('id') == post_id:
                    posts[i] = body
                    updated = True
                    break
            if not updated:
                return self._send_json({'error': 'Post not found'}, 404)
            write_posts(posts)
            return self._send_json(body, 200)
        return super().do_PUT()

    def do_DELETE(self):
        parsed = urlparse(self.path)
        if parsed.path.startswith('/api/posts/'):
            post_id = parsed.path.split('/')[-1]
            posts = read_posts()
            new_posts = [p for p in posts if p.get('id') != post_id]
            if len(new_posts) == len(posts):
                return self._send_json({'error': 'Post not found'}, 404)
            write_posts(new_posts)
            return self._send_json({'ok': True}, 200)
        return super().do_DELETE()

    @staticmethod
    def _generate_id():
        import time, random
        return hex(int(time.time() * 1000))[2:] + hex(random.randint(0, 1_000_000))[2:]


if __name__ == '__main__':
    port = 8000
    server = HTTPServer(('', port), Handler)
    print(f"Serving with API on http://localhost:{port}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()