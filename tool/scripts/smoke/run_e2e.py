# -*- coding: utf-8 -*-
"""E2E wrapper：subprocess 运行冒烟脚本，stdout/stderr 直写文件，绕开不可靠的 shell 管道。
用法: python run_e2e.py <script相对tool根> <输出文件>
"""
import subprocess
import sys
from pathlib import Path

TOOL = Path(r"G:\项目\模型审核工具\tool")
PY = r"C:\Users\Administrator\AppData\Local\Programs\Python\Python312\python.exe"

script = sys.argv[1]
outfile = sys.argv[2]

proc = subprocess.run(
    [PY, str(TOOL / script)],
    cwd=str(TOOL), capture_output=True, text=True, encoding="utf-8", errors="ignore", timeout=900,
)
with open(outfile, "w", encoding="utf-8") as f:
    f.write(f"EXIT={proc.returncode}\n--- stdout ---\n{proc.stdout}\n--- stderr ---\n{proc.stderr[-3000:]}")
print(f"wrapper done, exit={proc.returncode}")
