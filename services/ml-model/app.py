from http.server import HTTPServer, BaseHTTPRequestHandler

class StubHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(b'{"status":"ml_ok"}')

    def do_POST(self):
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(b'{"score":0.0,"top_factors":["stub1","stub2","stub3"],"next_step":"ml_stub"}')

if __name__ == "__main__":
    HTTPServer(("0.0.0.0", 5000), StubHandler).serve_forever()
