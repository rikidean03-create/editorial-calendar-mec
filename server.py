import json
import os
import time
import urllib.parse
import urllib.request
from http.server import HTTPServer, SimpleHTTPRequestHandler
from urllib.parse import urlparse

DATA_DIR = os.path.join(os.path.dirname(__file__), 'data')
POSTS_FILE = os.path.join(DATA_DIR, 'posts.json')
CLIENT_SECRET_FILE = os.path.join(os.path.dirname(__file__), 'client_secret.json')
TOKEN_FILE = os.path.join(os.path.dirname(__file__), 'token.json')
GOOGLE_SECRET_FILE = os.path.join(os.path.dirname(__file__), 'google_client_secret.json')
GOOGLE_TOKEN_FILE = os.path.join(os.path.dirname(__file__), 'google_token.json')
GOOGLE_CFG_FILE = os.path.join(os.path.dirname(__file__), 'google_config.json')

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
    # Scrittura atomica: usa un file temporaneo e poi rinomina
    tmp_path = POSTS_FILE + '.tmp'
    with open(tmp_path, 'w', encoding='utf-8') as f:
        json.dump(posts, f, ensure_ascii=False, indent=2)
    os.replace(tmp_path, POSTS_FILE)


class Handler(SimpleHTTPRequestHandler):
    def _send_json(self, data, status=200):
        payload = json.dumps(data, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        # CORS
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
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
            # Prova a decodificare come form-urlencoded (fallback)
            try:
                data = urllib.parse.parse_qs(raw.decode('utf-8'))
                # Flatten values (prendi il primo per chiave)
                flat = {k: (v[0] if isinstance(v, list) and v else v) for k, v in data.items()}
                return flat or None
            except Exception:
                return None

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == '/api/posts':
            posts = read_posts()
            return self._send_json(posts, 200)
        # OAuth Dropbox: avvio login
        if parsed.path == '/oauth/login':
            query = urllib.parse.parse_qs(parsed.query or '')
            popup = '1' in (query.get('popup') or [])
            if not os.path.exists(CLIENT_SECRET_FILE):
                return self._send_json({'error': 'client_secret.json mancante. Crea credenziali OAuth in Dropbox App Console.'}, 500)
            with open(CLIENT_SECRET_FILE, 'r', encoding='utf-8') as f:
                secrets = json.load(f)
            # supporta top-level o nested
            client_id = secrets.get('client_id') or secrets.get('web', {}).get('client_id') or secrets.get('installed', {}).get('client_id')
            if not client_id:
                return self._send_json({'error': 'client_id mancante in client_secret.json'}, 500)
            redirect_uri = f"http://localhost:{self.server.server_port}/oauth/callback"
            params = {
                'client_id': client_id,
                'redirect_uri': redirect_uri,
                'response_type': 'code',
                'token_access_type': 'offline',
                'state': (str(int(time.time())) + ('|popup' if popup else '')),
                'scope': 'files.content.write'
            }
            url = 'https://www.dropbox.com/oauth2/authorize?' + urllib.parse.urlencode(params)
            self.send_response(302)
            self.send_header('Location', url)
            self.end_headers()
            return
        # OAuth Dropbox: callback scambio codice/token
        if parsed.path == '/oauth/callback':
            if not os.path.exists(CLIENT_SECRET_FILE):
                return self._send_json({'error': 'client_secret.json mancante'}, 500)
            query = urllib.parse.parse_qs(parsed.query or '')
            code = (query.get('code') or [None])[0]
            state = (query.get('state') or [''])[0]
            is_popup = ('popup' in state) if state else False
            if not code:
                return self._send_json({'error': 'code mancante'}, 400)
            with open(CLIENT_SECRET_FILE, 'r', encoding='utf-8') as f:
                secrets = json.load(f)
            client_id = secrets.get('client_id') or secrets.get('web', {}).get('client_id') or secrets.get('installed', {}).get('client_id')
            client_secret = secrets.get('client_secret') or secrets.get('web', {}).get('client_secret') or secrets.get('installed', {}).get('client_secret')
            if not client_id or not client_secret:
                return self._send_json({'error': 'client_id/client_secret mancanti'}, 500)
            redirect_uri = f"http://localhost:{self.server.server_port}/oauth/callback"
            data = urllib.parse.urlencode({
                'code': code,
                'client_id': client_id,
                'client_secret': client_secret,
                'redirect_uri': redirect_uri,
                'grant_type': 'authorization_code',
            }).encode('utf-8')
            req = urllib.request.Request('https://api.dropboxapi.com/oauth2/token', data=data, method='POST')
            req.add_header('Content-Type', 'application/x-www-form-urlencoded')
            try:
                with urllib.request.urlopen(req) as resp:
                    token_data = json.loads(resp.read().decode('utf-8'))
            except Exception as e:
                return self._send_json({'error': 'token_exchange_failed', 'details': str(e)}, 500)
            token_data['created_at'] = int(time.time())
            with open(TOKEN_FILE, 'w', encoding='utf-8') as f:
                json.dump(token_data, f, ensure_ascii=False, indent=2)
            if is_popup:
                # Restituisce una pagina che chiude il popup e notifica l'opener
                self.send_response(200)
                self.send_header('Content-Type', 'text/html; charset=utf-8')
                self.end_headers()
                html = (
                    "<html><body><script>" 
                    "try{window.opener&&window.opener.postMessage({type:'oauth_success',provider:'dropbox'},'*');}catch(e){}" 
                    "window.close();" 
                    "</script><p>Autenticazione completata. Puoi chiudere questa finestra.</p></body></html>"
                )
                self.wfile.write(html.encode('utf-8'))
            else:
                self.send_response(302)
                self.send_header('Location', '/')
                self.end_headers()
            return
        # Gestione errori di OAuth
        if parsed.path == '/oauth/callback' and 'error' in (urllib.parse.parse_qs(parsed.query or '')):
            q = urllib.parse.parse_qs(parsed.query or '')
            err = (q.get('error') or [''])[0]
            desc = (q.get('error_description') or [''])[0]
            self.send_response(200)
            self.send_header('Content-Type', 'text/html; charset=utf-8')
            self.end_headers()
            html = (
                f"<html><body><h3>Errore OAuth: {err}</h3><p>{desc}</p>" 
                "<script>try{window.opener&&window.opener.postMessage({type:'oauth_error',provider:'dropbox'},'*');}catch(e){}" 
                "</script></body></html>"
            )
            self.wfile.write(html.encode('utf-8'))
            return
        # OAuth Google Drive: avvio login
        if parsed.path == '/google/login':
            query = urllib.parse.parse_qs(parsed.query or '')
            popup = '1' in (query.get('popup') or [])
            if not os.path.exists(GOOGLE_SECRET_FILE):
                return self._send_json({'error': 'google_client_secret.json mancante. Scarica le credenziali OAuth dal Google Cloud Console (tipo Web).'}, 500)
            with open(GOOGLE_SECRET_FILE, 'r', encoding='utf-8') as f:
                secrets = json.load(f)
            client_id = secrets.get('client_id') or secrets.get('web', {}).get('client_id') or secrets.get('installed', {}).get('client_id')
            if not client_id:
                return self._send_json({'error': 'client_id mancante in google_client_secret.json'}, 500)
            redirect_uri = f"http://localhost:{self.server.server_port}/google/callback"
            params = {
                'client_id': client_id,
                'redirect_uri': redirect_uri,
                'response_type': 'code',
                'scope': 'https://www.googleapis.com/auth/drive.file',
                'access_type': 'offline',
                'prompt': 'consent',
                'state': (str(int(time.time())) + ('|popup' if popup else ''))
            }
            url = 'https://accounts.google.com/o/oauth2/v2/auth?' + urllib.parse.urlencode(params)
            self.send_response(302)
            self.send_header('Location', url)
            self.end_headers()
            return
        # OAuth Google Drive: callback scambio codice/token
        if parsed.path == '/google/callback':
            if not os.path.exists(GOOGLE_SECRET_FILE):
                return self._send_json({'error': 'google_client_secret.json mancante'}, 500)
            query = urllib.parse.parse_qs(parsed.query or '')
            code = (query.get('code') or [None])[0]
            state = (query.get('state') or [''])[0]
            is_popup = ('popup' in state) if state else False
            if not code:
                return self._send_json({'error': 'code mancante'}, 400)
            with open(GOOGLE_SECRET_FILE, 'r', encoding='utf-8') as f:
                secrets = json.load(f)
            client_id = secrets.get('client_id') or secrets.get('web', {}).get('client_id') or secrets.get('installed', {}).get('client_id')
            client_secret = secrets.get('client_secret') or secrets.get('web', {}).get('client_secret') or secrets.get('installed', {}).get('client_secret')
            if not client_id or not client_secret:
                return self._send_json({'error': 'client_id/client_secret mancanti'}, 500)
            redirect_uri = f"http://localhost:{self.server.server_port}/google/callback"
            data = urllib.parse.urlencode({
                'code': code,
                'client_id': client_id,
                'client_secret': client_secret,
                'redirect_uri': redirect_uri,
                'grant_type': 'authorization_code',
            }).encode('utf-8')
            req = urllib.request.Request('https://oauth2.googleapis.com/token', data=data, method='POST')
            req.add_header('Content-Type', 'application/x-www-form-urlencoded')
            try:
                with urllib.request.urlopen(req) as resp:
                    token_data = json.loads(resp.read().decode('utf-8'))
            except Exception as e:
                return self._send_json({'error': 'token_exchange_failed', 'details': str(e)}, 500)
            token_data['created_at'] = int(time.time())
            with open(GOOGLE_TOKEN_FILE, 'w', encoding='utf-8') as f:
                json.dump(token_data, f, ensure_ascii=False, indent=2)
            if is_popup:
                self.send_response(200)
                self.send_header('Content-Type', 'text/html; charset=utf-8')
                self.end_headers()
                html = (
                    "<html><body><script>"
                    "try{window.opener&&window.opener.postMessage({type:'oauth_success',provider:'google'},'*');}catch(e){}"
                    "window.close();"
                    "</script><p>Autenticazione Google completata. Puoi chiudere questa finestra.</p></body></html>"
                )
                self.wfile.write(html.encode('utf-8'))
            else:
                self.send_response(302)
                self.send_header('Location', '/')
                self.end_headers()
            return
        return super().do_GET()

    def do_OPTIONS(self):
        # Risposta CORS generica
        self.send_response(204)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def do_POST(self):
        parsed = urlparse(self.path)
        # Accetta sia /api/posts che /api/posts/
        if parsed.path.rstrip('/') == '/api/posts':
            print('POST /api/posts')
            body = self._read_body()
            if not body:
                print('POST body invalid or empty')
                return self._send_json({'error': 'Invalid JSON'}, 400)
            # Validazione campi obbligatori
            required = ['date', 'time', 'platform', 'title']
            missing = [k for k in required if not body.get(k)]
            if missing:
                return self._send_json({'error': 'validation_failed', 'missing': missing}, 400)
            posts = read_posts()
            # assegna id se mancante
            if 'id' not in body or not body['id']:
                body['id'] = self._generate_id()
            posts.append(body)
            write_posts(posts)
            print('POST saved id=', body['id'])
            return self._send_json(body, 201)
        if parsed.path.rstrip('/') == '/dropbox/upload':
            # Carica posts.json su Dropbox
            if not os.path.exists(TOKEN_FILE):
                return self._send_json({'error': 'not_authenticated', 'message': 'Collega Dropbox con /oauth/login'}, 401)
            with open(CLIENT_SECRET_FILE, 'r', encoding='utf-8') as f:
                secrets = json.load(f)
            client_id = secrets.get('client_id') or secrets.get('web', {}).get('client_id') or secrets.get('installed', {}).get('client_id')
            client_secret = secrets.get('client_secret') or secrets.get('web', {}).get('client_secret') or secrets.get('installed', {}).get('client_secret')
            with open(TOKEN_FILE, 'r', encoding='utf-8') as f:
                token_data = json.load(f)
            access_token = token_data.get('access_token')
            refresh_token = token_data.get('refresh_token')
            expires_in = int(token_data.get('expires_in', 3600))
            created_at = int(token_data.get('created_at', int(time.time())))
            # Refresh se scaduto
            if not access_token or (int(time.time()) - created_at) > (expires_in - 60):
                if not refresh_token:
                    return self._send_json({'error': 'no_refresh_token'}, 401)
                data = urllib.parse.urlencode({
                    'client_id': client_id,
                    'client_secret': client_secret,
                    'refresh_token': refresh_token,
                    'grant_type': 'refresh_token',
                }).encode('utf-8')
                req = urllib.request.Request('https://api.dropboxapi.com/oauth2/token', data=data, method='POST')
                req.add_header('Content-Type', 'application/x-www-form-urlencoded')
                try:
                    with urllib.request.urlopen(req) as resp:
                        refreshed = json.loads(resp.read().decode('utf-8'))
                    token_data['access_token'] = refreshed.get('access_token')
                    token_data['expires_in'] = refreshed.get('expires_in', 3600)
                    token_data['created_at'] = int(time.time())
                    with open(TOKEN_FILE, 'w', encoding='utf-8') as f:
                        json.dump(token_data, f, ensure_ascii=False, indent=2)
                    access_token = token_data['access_token']
                except Exception as e:
                    return self._send_json({'error': 'refresh_failed', 'details': str(e)}, 500)

            # Upload del file su Dropbox (sovrascrive)
            try:
                with open(POSTS_FILE, 'rb') as f:
                    content_bytes = f.read()
            except Exception as e:
                return self._send_json({'error': 'read_failed', 'details': str(e)}, 500)
            upload_url = 'https://content.dropboxapi.com/2/files/upload'
            headers = {
                'Authorization': f'Bearer {access_token}',
                'Content-Type': 'application/octet-stream',
                'Dropbox-API-Arg': json.dumps({
                    'path': '/CalendarioEditoriale.json',
                    'mode': 'overwrite',
                    'mute': False
                })
            }
            req = urllib.request.Request(upload_url, data=content_bytes, method='POST')
            for k, v in headers.items():
                req.add_header(k, v)
            try:
                with urllib.request.urlopen(req) as resp:
                    result = json.loads(resp.read().decode('utf-8'))
                return self._send_json({'ok': True, 'id': result.get('id'), 'name': result.get('name')}, 200)
            except Exception as e:
                return self._send_json({'error': 'upload_failed', 'details': str(e)}, 500)
        # Upload su Google Drive
        if parsed.path.rstrip('/') == '/google/upload':
            # Richiede autenticazione Google
            if not os.path.exists(GOOGLE_TOKEN_FILE):
                return self._send_json({'error': 'not_authenticated', 'message': 'Collega Google Drive con /google/login'}, 401)
            with open(GOOGLE_SECRET_FILE, 'r', encoding='utf-8') as f:
                secrets = json.load(f)
            client_id = secrets.get('client_id') or secrets.get('web', {}).get('client_id') or secrets.get('installed', {}).get('client_id')
            client_secret = secrets.get('client_secret') or secrets.get('web', {}).get('client_secret') or secrets.get('installed', {}).get('client_secret')
            with open(GOOGLE_TOKEN_FILE, 'r', encoding='utf-8') as f:
                token_data = json.load(f)
            access_token = token_data.get('access_token')
            refresh_token = token_data.get('refresh_token')
            expires_in = int(token_data.get('expires_in', 3600))
            created_at = int(token_data.get('created_at', int(time.time())))
            # Refresh se scaduto
            if not access_token or (int(time.time()) - created_at) > (expires_in - 60):
                if not refresh_token:
                    return self._send_json({'error': 'no_refresh_token'}, 401)
                data = urllib.parse.urlencode({
                    'client_id': client_id,
                    'client_secret': client_secret,
                    'refresh_token': refresh_token,
                    'grant_type': 'refresh_token',
                }).encode('utf-8')
                req = urllib.request.Request('https://oauth2.googleapis.com/token', data=data, method='POST')
                req.add_header('Content-Type', 'application/x-www-form-urlencoded')
                try:
                    with urllib.request.urlopen(req) as resp:
                        refreshed = json.loads(resp.read().decode('utf-8'))
                    token_data['access_token'] = refreshed.get('access_token')
                    token_data['expires_in'] = refreshed.get('expires_in', 3600)
                    token_data['created_at'] = int(time.time())
                    with open(GOOGLE_TOKEN_FILE, 'w', encoding='utf-8') as f:
                        json.dump(token_data, f, ensure_ascii=False, indent=2)
                    access_token = token_data['access_token']
                except Exception as e:
                    return self._send_json({'error': 'refresh_failed', 'details': str(e)}, 500)

            # Lettura configurazione cartella
            folder_id = None
            body = self._read_body() or {}
            if isinstance(body, dict):
                folder_id = body.get('folderId') or body.get('folder_id')
            if not folder_id and os.path.exists(GOOGLE_CFG_FILE):
                try:
                    with open(GOOGLE_CFG_FILE, 'r', encoding='utf-8') as f:
                        cfg = json.load(f)
                    folder_id = cfg.get('folder_id')
                except Exception:
                    folder_id = None

            # Se la cartella non è impostata, creane una di default e salva config
            if not folder_id:
                meta = json.dumps({'name': 'Calendario Editoriale MEC', 'mimeType': 'application/vnd.google-apps.folder'}).encode('utf-8')
                create_req = urllib.request.Request('https://www.googleapis.com/drive/v3/files', data=meta, method='POST')
                create_req.add_header('Authorization', f'Bearer {access_token}')
                create_req.add_header('Content-Type', 'application/json; charset=utf-8')
                try:
                    with urllib.request.urlopen(create_req) as resp:
                        folder = json.loads(resp.read().decode('utf-8'))
                    folder_id = folder.get('id')
                    with open(GOOGLE_CFG_FILE, 'w', encoding='utf-8') as f:
                        json.dump({'folder_id': folder_id}, f, ensure_ascii=False, indent=2)
                except Exception as e:
                    return self._send_json({'error': 'create_folder_failed', 'details': str(e)}, 500)

            # Verifica se esiste già il file nel folder
            query = urllib.parse.quote_plus(f"name = 'calendario-editoriale.json' and '{folder_id}' in parents and trashed = false")
            search_url = f'https://www.googleapis.com/drive/v3/files?q={query}&fields=files(id,name)'
            sreq = urllib.request.Request(search_url, method='GET')
            sreq.add_header('Authorization', f'Bearer {access_token}')
            try:
                with urllib.request.urlopen(sreq) as resp:
                    search = json.loads(resp.read().decode('utf-8'))
                existing_id = (search.get('files') or [{}])[0].get('id')
            except Exception:
                existing_id = None

            # Costruisci multipart upload
            try:
                with open(POSTS_FILE, 'rb') as f:
                    content_bytes = f.read()
            except Exception as e:
                return self._send_json({'error': 'read_failed', 'details': str(e)}, 500)

            boundary = 'foo_bar_baz_' + str(int(time.time()))
            metadata = {
                'name': 'calendario-editoriale.json',
                'parents': [folder_id]
            }
            meta_part = (
                f"--{boundary}\r\n"
                "Content-Type: application/json; charset=UTF-8\r\n\r\n"
                + json.dumps(metadata) + "\r\n"
            ).encode('utf-8')
            file_part = (
                f"--{boundary}\r\n"
                "Content-Type: application/json\r\n\r\n"
            ).encode('utf-8') + content_bytes + (f"\r\n--{boundary}--\r\n").encode('utf-8')
            multipart_body = meta_part + file_part

            if existing_id:
                upload_url = f'https://www.googleapis.com/upload/drive/v3/files/{existing_id}?uploadType=multipart'
                method = 'PATCH'
            else:
                upload_url = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart'
                method = 'POST'

            req = urllib.request.Request(upload_url, data=multipart_body, method=method)
            req.add_header('Authorization', f'Bearer {access_token}')
            req.add_header('Content-Type', f'multipart/related; boundary={boundary}')
            try:
                with urllib.request.urlopen(req) as resp:
                    result = json.loads(resp.read().decode('utf-8'))
                return self._send_json({'ok': True, 'fileId': result.get('id'), 'folderId': folder_id}, 200)
            except Exception as e:
                return self._send_json({'error': 'upload_failed', 'details': str(e)}, 500)
        return super().do_POST()

    def do_PUT(self):
        parsed = urlparse(self.path)
        if parsed.path.startswith('/api/posts/'):
            # supporta trailing slash
            post_id = parsed.path.strip('/').split('/')[-1]
            print('PUT /api/posts/', post_id)
            body = self._read_body()
            if not body:
                print('PUT body invalid or empty')
                return self._send_json({'error': 'Invalid JSON'}, 400)
            # Assicura che l'ID sia preservato
            if not body.get('id'):
                body['id'] = post_id
            # Validazione campi obbligatori
            required = ['date', 'time', 'platform', 'title']
            missing = [k for k in required if not body.get(k)]
            if missing:
                return self._send_json({'error': 'validation_failed', 'missing': missing}, 400)
            posts = read_posts()
            updated = False
            for i, p in enumerate(posts):
                if p.get('id') == post_id:
                    posts[i] = body
                    updated = True
                    break
            if not updated:
                print('PUT post not found')
                return self._send_json({'error': 'Post not found'}, 404)
            write_posts(posts)
            print('PUT updated id=', post_id)
            return self._send_json(body, 200)
        return super().do_PUT()

    def do_DELETE(self):
        parsed = urlparse(self.path)
        if parsed.path.startswith('/api/posts/'):
            # supporta trailing slash
            post_id = parsed.path.strip('/').split('/')[-1]
            print('DELETE /api/posts/', post_id)
            posts = read_posts()
            new_posts = [p for p in posts if p.get('id') != post_id]
            if len(new_posts) == len(posts):
                print('DELETE post not found')
                return self._send_json({'error': 'Post not found'}, 404)
            write_posts(new_posts)
            print('DELETE ok id=', post_id)
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