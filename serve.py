#!/usr/bin/env python3
"""
serve.py — 3D教室のローカル配信サーバ（依存なし・Python標準ライブラリのみ）

python3 serve.py [port]     # 既定 8000 / 0.0.0.0 にバインド

開発中に「修正したのに古い JS が読まれる」を防ぐため、
すべてのレスポンスに Cache-Control: no-store を付けてキャッシュを無効化します。
"""
import http.server
import socketserver
import sys


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def log_message(self, fmt, *args):
        # 静的アセットのログは煩雑なので 200 は黙る
        if " 200 " not in (fmt % args):
            sys.stderr.write("%s - %s\n" % (self.address_string(), fmt % args))


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.ThreadingTCPServer(("0.0.0.0", port), NoCacheHandler) as httpd:
        print(f"serving on http://0.0.0.0:{port}  (no-store)")
        httpd.serve_forever()


if __name__ == "__main__":
    main()
