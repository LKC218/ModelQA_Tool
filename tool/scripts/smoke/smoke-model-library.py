"""云端模型库 E2E 冒烟：导入菜单 → 模型库面板 → 搜索 → 点选导入 → 模型加载 + 引用直记。
运行前提：playwright（系统 Python312）；云端库需至少有一个模型（蜂鸣器.glb）。"""
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
PORT = 5180
ORIGIN = "https://3d.propanda.cn"
TOKEN_FILE = Path(r"G:\项目\服务器部署\private\modelqa-token.txt")
NAME = f"模型库冒烟-{time.strftime('%H%M%S')}"


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
    # preview 模式跑 dist 构建产物：不受并行会话源码编辑触发的 Vite 重载影响（运行前先 npm run build）
    proc = subprocess.Popen(
        [node, str(vite), "preview", "--port", str(PORT), "--strictPort"],
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
    raise RuntimeError("vite 启动失败")


def main():
    from playwright.sync_api import sync_playwright

    failures = []
    proc = start_vite()
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            page = browser.new_context(viewport={"width": 1440, "height": 900}).new_page()
            page.goto(f"http://localhost:{PORT}/", wait_until="domcontentloaded", timeout=30000)
            page.wait_for_selector(".course-card", timeout=20000)  # networkidle 在 Vite 并行开发期不稳定，改为等关键节点
            # 等启动对账（reconcileCloud）收尾：可能自动接续云端项目并重渲染，早于它完成导入会被 applyDraftContent 清掉
            page.wait_for_function("() => { const d = document.getElementById('sync-dot'); return d && !d.classList.contains('pending'); }", timeout=20000)
            page.wait_for_timeout(500)
            page.locator(".course-card").first.click()

            # 1) 选课程 → 点导入 → 菜单两项
            page.locator(".course-card").first.click()
            page.wait_for_timeout(200)
            page.click("#rail-import")
            page.wait_for_selector("#import-menu:not(.hidden)", timeout=3000)
            if page.locator("#import-local").count() != 1 or page.locator("#import-cloud").count() != 1:
                failures.append("导入菜单缺选项")

            # 2) 打开模型库 → 列表有云端模型
            page.click("#import-cloud")
            page.wait_for_selector(".library-item", timeout=15000)
            names = page.locator(".library-item-name").all_inner_texts()
            if not any("蜂鸣器" in n for n in names):
                failures.append(f"模型库缺蜂鸣器: {names}")

            # 3) 搜索过滤 → 点选导入
            page.fill("#library-search", "蜂鸣")
            page.wait_for_timeout(200)
            items = page.locator(".library-item").count()
            if items != 1:
                failures.append(f"搜索过滤异常: {items} 项")
            page.locator(".library-item").first.click()

            # 4) 模型载入当前课程（bytes 非 0、单 HTML 可用）
            page.wait_for_function("() => document.getElementById('single').disabled === false", timeout=30000)
            # 5) 保存后草稿直记云端引用（不再上传）
            page.wait_for_timeout(2500)
            payload = page.evaluate("() => JSON.parse(localStorage.getItem('an-review-draft:' + localStorage.getItem('an-review-active')))")
            refs = payload.get("modelCloud") or {}
            if not refs:
                failures.append("草稿未写入 modelCloud 引用")

            # 5.5) 刷新后模型必须自动恢复（ hydrate 路径回归）
            page.reload(wait_until="domcontentloaded")
            page.wait_for_function("() => document.getElementById('single') && document.getElementById('single').disabled === false", timeout=60000)
            restored = page.evaluate("() => document.querySelector('.course-card-count')?.textContent || ''")
            if page.locator("#single").is_disabled():
                failures.append("刷新后模型未自动恢复（hydrate 未生效）")

            # 6) 项目改名使其唯一 → 清理云端测试项目
            page.evaluate(
                """(name) => {
                  const el = document.getElementById('project-name');
                  el.value = name;
                  el.dispatchEvent(new Event('input', { bubbles: true }));
                }""",
                NAME,
            )
            page.wait_for_timeout(5000)
            browser.close()

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
    print("PASS: 云端模型库 E2E 全部通过")
    return 0


if __name__ == "__main__":
    sys.exit(main())
