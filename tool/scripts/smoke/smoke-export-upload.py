"""P2 审核包一键上传 E2E 冒烟：导入真实 GLB → 导出单 HTML → toast「上传到服务器」
→ 生成在线预览链接 → 链接可访问 → 复制按钮存在。运行前提：playwright（系统 Python312）。"""
from __future__ import annotations

import json
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
LOG = ROOT / "vite-smoke.log"
ERR = ROOT / "vite-smoke.err"
PORT = 5179
ORIGIN = "https://3d.propanda.cn"
TOKEN_FILE = Path(r"G:\项目\服务器部署\private\modelqa-token.txt")
GLB = ROOT.parent / "Model" / "AN-模拟电路实训室" / "AN-03 滤波电路" / "桥式整流模块.glb"


def start_vite():
    node = r"C:\Users\Administrator\AppData\Local\Microsoft\WinGet\Packages\OpenJS.NodeJS.22_Microsoft.Winget.Source_8wekyb3d8bbwe\node-v22.22.0-win-x64\node.exe"
    vite = ROOT / "node_modules" / "vite" / "bin" / "vite.js"
    log_f = open(LOG, "w", encoding="utf-8")
    err_f = open(ERR, "w", encoding="utf-8")
    proc = subprocess.Popen(
        [node, str(vite), "--port", str(PORT), "--strictPort"],
        cwd=str(ROOT), stdout=log_f, stderr=err_f,
        creationflags=subprocess.CREATE_NO_WINDOW,
    )
    for _ in range(40):
        time.sleep(0.25)
        try:
            urllib.request.urlopen(f"http://localhost:{PORT}/", timeout=1)
            return proc
        except Exception:
            if proc.poll() is not None:
                break
    proc.kill()
    raise RuntimeError(f"vite 启动失败\n{LOG.read_text(encoding='utf-8', errors='ignore')}\n{ERR.read_text(encoding='utf-8', errors='ignore')}")


def main():
    from playwright.sync_api import sync_playwright

    failures = []
    proc = start_vite()
    uploaded_url = ""
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            context = browser.new_context(viewport={"width": 1440, "height": 900}, accept_downloads=True)
            page = context.new_page()
            page.goto(f"http://localhost:{PORT}/", wait_until="networkidle", timeout=30000)
            page.wait_for_timeout(1000)

            # 1) 选课程（第一个卡片）→ 导入真实 GLB
            page.locator(".course-card").first.click()
            page.wait_for_timeout(300)
            page.set_input_files("#files", str(GLB))
            page.wait_for_function("() => !document.getElementById('single').disabled", timeout=30000)

            # 2) 导出单 HTML → 一键流程：下载 + 自动上传，toast 直接出现链接 + 复制按钮
            with page.expect_download(timeout=60000) as dl:
                page.click("#single")
            download = dl.value
            if not download.suggested_filename.endswith(".html"):
                failures.append(f"导出文件名异常: {download.suggested_filename}")
            page.wait_for_selector(".toast-link", timeout=60000)
            uploaded_url = page.locator(".toast-link").get_attribute("href")
            if "/reviews/" not in uploaded_url:
                failures.append(f"上传返回链接异常: {uploaded_url}")
            if page.locator("#toast-copy").count() != 1:
                failures.append("上传后 toast 未出现「复制链接」按钮")

            # 4) 链接公网可访问，且为审核包 HTML（含审核 payload）
            with urllib.request.urlopen(uploaded_url, timeout=30) as resp:
                body = resp.read().decode("utf-8", "ignore")
            if resp.status != 200 or "__AN_REVIEW_PAYLOAD__" not in body:
                failures.append(f"在线预览内容异常: status={resp.status}, payload={'__AN_REVIEW_PAYLOAD__' in body}")

            # 5) 导出区「上传在线预览」按钮可用（最近产物记录）
            if page.locator("#upload-preview").is_disabled():
                failures.append("导出后「上传在线预览」按钮仍禁用")

            browser.close()
    finally:
        proc.kill()

    # 测试上传的 /reviews/ 文件留存无害（同名时间戳不覆盖）；如需清理：
    # python G:\项目\服务器部署\deploy_data_service.py --backup 前可手工删除，或 SSH 删除
    # /var/www/modelqa-data/reviews/ 下本次时间戳文件。
    if uploaded_url:
        print(f"uploaded(测试残留可清理): {uploaded_url}")

    if failures:
        print("FAIL")
        for f in failures:
            print(f" - {f}")
        return 1
    print("PASS: 审核包一键上传 E2E 全部通过")
    return 0


if __name__ == "__main__":
    sys.exit(main())
