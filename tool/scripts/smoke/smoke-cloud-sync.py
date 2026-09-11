"""云端项目同步 E2E 冒烟（P1）：带 Token 启动 dev（proxy→生产），
验证 编辑→自动保存→推云端→同步徽标变绿→清空本地模拟换设备→启动对账拉回。
运行前提：playwright（系统 Python312）。"""
from __future__ import annotations

import json
import os
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
LOG = ROOT / "vite-smoke.log"
ERR = ROOT / "vite-smoke.err"
PORT = 5178
TOKEN_FILE = Path(r"G:\项目\服务器部署\private\modelqa-token.txt")
ORIGIN = "https://3d.propanda.cn"
NAME = f"云同步冒烟-{time.strftime('%H%M%S')}"


def api(path, method="GET", data=None):
    req = urllib.request.Request(ORIGIN + path, method=method, data=data,
                                 headers={"X-ModelQA-Token": TOKEN_FILE.read_text(encoding="utf-8").strip(),
                                          "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=15) as resp:
        return json.loads(resp.read())


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
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            page = browser.new_context(viewport={"width": 1440, "height": 900}).new_page()
            page.goto(f"http://localhost:{PORT}/", wait_until="networkidle", timeout=30000)
            page.wait_for_timeout(1000)

            # 1) 编辑 → 自动保存（本地） → 云端防抖推送
            page.evaluate(
                """(name) => {
                  const el = document.getElementById('project-name');
                  el.value = name;
                  el.dispatchEvent(new Event('input', { bubbles: true }));
                }""",
                NAME,
            )
            page.wait_for_timeout(2500)  # 本地防抖 1.5s
            footer = page.locator("#footer").inner_text()
            if "已自动保存" not in footer:
                failures.append(f"本地自动保存文案缺失: {footer!r}")
            page.wait_for_timeout(4500)  # 云端防抖 3s + 余量
            dot = page.locator("#sync-dot").get_attribute("class")
            if "synced" not in dot:
                failures.append(f"同步徽标未变绿: {dot!r}")

            # 2) 云端确有该项目
            cloud_list = api("/api/projects")["projects"]
            match = [item for item in cloud_list if item["name"] == NAME]
            if not match:
                failures.append(f"云端未见项目 {NAME}，现有 {[x['name'] for x in cloud_list][:8]}")

            # 3) 模拟换设备：清空本地 → 刷新 → 启动对账拉回
            page.evaluate(
                """() => {
                  Object.keys(localStorage)
                    .filter((k) => k.startsWith('an-review-draft') || k === 'an-review-active')
                    .forEach((k) => localStorage.removeItem(k));
                }"""
            )
            page.reload(wait_until="networkidle")
            page.wait_for_timeout(3000)
            drafts = page.evaluate("() => JSON.parse(localStorage.getItem('an-review-drafts')||'[]')")
            if not any(d.get("name") == NAME for d in drafts):
                failures.append(f"换设备后未拉回云端项目: {[d.get('name') for d in drafts][:8]}")
            pulled = [d for d in drafts if d.get("name") == NAME]
            if pulled and not pulled[0].get("cloudSyncedAt"):
                failures.append("拉回的项目缺少 cloudSyncedAt 标记")
            dot2 = page.locator("#sync-dot").get_attribute("class")
            if "synced" not in dot2:
                failures.append(f"对账后徽标未变绿: {dot2!r}")

            # 4) 切换到拉回的项目，内容一致
            if pulled:
                page.click("#draft-toggle")
                page.wait_for_timeout(200)
                page.once("dialog", lambda d: d.accept())  # 若有未保存改动弹窗
                page.locator(f'.draft-item[data-id="{pulled[0]["id"]}"] .draft-item-main').click()
                page.wait_for_timeout(500)
                name_val = page.evaluate("() => document.getElementById('project-name').value")
                if name_val != NAME:
                    failures.append(f"拉回项目内容不一致: {name_val!r}")

            browser.close()

        # 清理云端测试项目
        for item in api("/api/projects")["projects"]:
            if item["name"] == NAME:
                api(f"/api/projects/{item['id']}", method="DELETE")
    finally:
        proc.kill()

    if failures:
        print("FAIL")
        for f in failures:
            print(f" - {f}")
        return 1
    print("PASS: 云端项目同步 E2E 全部通过")
    return 0


if __name__ == "__main__":
    sys.exit(main())
