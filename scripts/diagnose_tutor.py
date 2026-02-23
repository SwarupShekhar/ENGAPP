import os
import socket
import sys
import requests
from dotenv import load_dotenv

def check_port(host, port):
    try:
        with socket.create_connection((host, port), timeout=2):
            return True
    except (socket.timeout, ConnectionRefusedError):
        return False

def check_env_file(path, required_keys):
    print(f"Checking {path}...")
    if not os.path.exists(path):
        print(f"❌ {path} does not exist!")
        return False
    
    found_keys = set()
    try:
        with open(path, 'r') as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith('#'): continue
                if '=' in line:
                    key = line.split('=')[0].strip()
                    found_keys.add(key)
        
        missing = [k for k in required_keys if k not in found_keys]
        if missing:
            print(f"❌ Missing keys in {path}: {missing}")
            return False
        else:
            print(f"✅ All required keys found in {path}")
            return True
    except Exception as e:
        print(f"❌ Error reading {path}: {e}")
        return False

def check_service(url, name):
    print(f"Checking {name} at {url}...")
    try:
        resp = requests.get(url, timeout=5)
        print(f"✅ {name} responded with {resp.status_code}")
        return True
    except Exception as e:
        print(f"❌ {name} unreachable: {e}")
        return False

def main():
    print("=== AI Tutor Diagnostic Tool ===")
    
    # Paths
    base_dir = os.getcwd()
    backend_ai_env = os.path.join(base_dir, "backend-ai", ".env")
    backend_nest_env = os.path.join(base_dir, "backend-nest", ".env")
    
    # 1. Check Env Vars
    print("\n--- Configuration Check ---")
    check_env_file(backend_ai_env, ["AZURE_SPEECH_KEY", "AZURE_SPEECH_REGION", "GOOGLE_API_KEY"])
    check_env_file(backend_nest_env, ["AI_BACKEND_URL"])
    
    # 2. Check Ports
    print("\n--- Port Check ---")
    ai_running = check_port("localhost", 8001)
    if ai_running:
        print("✅ Port 8001 (backend-ai) is open")
    else:
        print("❌ Port 8001 (backend-ai) is CLOSED. Service likely not running.")
        
    nest_running = check_port("localhost", 3000)
    if nest_running:
        print("✅ Port 3000 (backend-nest) is open")
    else:
        print("❌ Port 3000 (backend-nest) is CLOSED.")

    redis_running = check_port("localhost", 6379)
    if redis_running:
        print("✅ Port 6379 (Redis) is open")
    else:
        print("❌ Port 6379 (Redis) is CLOSED. backend-ai needs Redis!")


    # 3. Service Health
    print("\n--- Service Health Check ---")
    if ai_running:
        check_service("http://localhost:8001/", "backend-ai root")
        # Check specific endpoint if possible, but root is good enough for connectivity
        
    if nest_running:
        check_service("http://localhost:3000/", "backend-nest root")

if __name__ == "__main__":
    main()
