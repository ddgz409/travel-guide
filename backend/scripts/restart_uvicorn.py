"""安全重启生产 uvicorn：argv 直传 pkill 模式，避免 ssh 引号剥离问题。"""
import subprocess
import time
import urllib.request

# 精确匹配 uvicorn 进程；pkill 收到的是单个 argv，不会被 shell 拆开
subprocess.run(
    ["pkill", "-f", r"\.venv/bin/python -m uvicorn app\.main"],
    check=False,
)
time.sleep(2)

subprocess.Popen(
    [
        "setsid", "nohup",
        ".venv/bin/python", "-m", "uvicorn", "app.main:app",
        "--host", "0.0.0.0", "--port", "8000",
    ],
    stdout=open("/tmp/uvicorn.log", "w"),
    stderr=subprocess.STDOUT,
    stdin=subprocess.DEVNULL,
    cwd="/root/travel-guide/backend",
    start_new_session=True,
)

ok = False
for _ in range(15):
    time.sleep(2)
    try:
        with urllib.request.urlopen("http://127.0.0.1:8000/health", timeout=4) as r:
            print("health:", r.read().decode())
            ok = True
            break
    except Exception as e:  # noqa: BLE001
        print("waiting...", e)
print("RESTART_OK" if ok else "RESTART_FAILED")
