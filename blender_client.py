import socket
import json
import sys

def run_blender_code(code_str):
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.connect(('127.0.0.1', 9876))
    payload = {
        'type': 'execute_code',
        'params': {
            'code': code_str
        }
    }
    s.sendall(json.dumps(payload).encode('utf-8'))
    res = b''
    while True:
        chunk = s.recv(8192)
        if not chunk:
            break
        res += chunk
        try:
            return json.loads(res.decode('utf-8'))
        except Exception:
            continue

def get_screenshot(filepath, max_size=1200):
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.connect(('127.0.0.1', 9876))
    payload = {
        'type': 'get_viewport_screenshot',
        'params': {
            'filepath': filepath,
            'max_size': max_size
        }
    }
    s.sendall(json.dumps(payload).encode('utf-8'))
    res = b''
    while True:
        chunk = s.recv(8192)
        if not chunk:
            break
        res += chunk
        try:
            return json.loads(res.decode('utf-8'))
        except Exception:
            continue

if __name__ == '__main__':
    if len(sys.argv) > 1:
        script_path = sys.argv[1]
        with open(script_path, 'r', encoding='utf-8') as f:
            code = f.read()
        ret = run_blender_code(code)
        print(json.dumps(ret, ensure_ascii=False, indent=2))
