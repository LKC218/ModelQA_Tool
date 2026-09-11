"""字体字号三档冒烟：默认中档、设置抽屉切换、持久化、审核端同步。"""
from __future__ import annotations

import os
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
LOG = ROOT / "vite-smoke.log"
ERR = ROOT / "vite-smoke.err"
PORT = 5177
BASE = f"http://127.0.0.1:{PORT}"
SMOKE_HTML = ROOT / "reviewer-smoke.html"


def start_vite():
    node = r"C:\Users\Administrator\AppData\Local\Microsoft\WinGet\Packages\OpenJS.NodeJS.22_Microsoft.Winget.Source_8wekyb3d8bbwe\node-v22.22.0-win-x64\node.exe"
    vite = ROOT / "node_modules" / "vite" / "bin" / "vite.js"
    log_f = open(LOG, "w", encoding="utf-8")
    err_f = open(ERR, "w", encoding="utf-8")
    env = {**os.environ, "VITE_CLOUD_TOKEN": ""}
    proc = subprocess.Popen(
        [node, str(vite), "--port", str(PORT), "--strictPort"],
        cwd=str(ROOT),
        env=env,
        stdout=log_f,
        stderr=err_f,
        creationflags=subprocess.CREATE_NO_WINDOW,
    )
    for _ in range(40):
        time.sleep(0.25)
        try:
            import urllib.request

            urllib.request.urlopen(f"http://localhost:{PORT}/", timeout=1)
            return proc
        except Exception:
            if proc.poll() is not None:
                break
            if LOG.exists() and "ready in" in LOG.read_text(encoding="utf-8", errors="ignore"):
                time.sleep(0.3)
                return proc
    proc.kill()
    raise RuntimeError(f"vite 启动失败\n{LOG.read_text(encoding='utf-8', errors='ignore')}\n{ERR.read_text(encoding='utf-8', errors='ignore')}")


def main():
    from playwright.sync_api import sync_playwright

    # 审核端冒烟宿主页：dev 服务器根下临时提供（测后删除）
    SMOKE_HTML.write_text(
        '<!doctype html><html><body><div id="app"></div>'
        '<script src="/src/generated/reviewer-runtime.js"></script></body></html>',
        encoding="utf-8",
    )
    proc = start_vite()
    failures: list[str] = []
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            context = browser.new_context(viewport={"width": 1440, "height": 900})
            page = context.new_page()
            page.goto(f"http://localhost:{PORT}/", wait_until="networkidle", timeout=30000)

            # 1) 默认中档 + 基准字号 13px（探针用 .status，其 font-size = --fs-base）
            tier = page.evaluate("() => document.documentElement.dataset.fontsize")
            if tier != "md":
                failures.append(f"默认档位应为 md，实际 {tier!r}")
            fs = page.evaluate("() => parseFloat(getComputedStyle(document.querySelector('.status')).fontSize)")
            if fs != 13:
                failures.append(f"中档基准字号应为 13px，实际 {fs}")

            # 2) 打开设置抽屉 → 选大档
            if not page.locator("#app-settings-toggle").is_visible():
                failures.append("开发端设置按钮不可见")
            page.click("#app-settings-toggle")
            page.wait_for_timeout(200)
            if page.locator("#app-settings").evaluate("el => el.classList.contains('hidden')"):
                failures.append("设置抽屉未展开")
            page.click('#app-settings [data-fs="lg"]')
            page.wait_for_timeout(200)
            tier = page.evaluate("() => document.documentElement.dataset.fontsize")
            if tier != "lg":
                failures.append(f"切大档失败，实际 {tier!r}")
            fs = page.evaluate("() => parseFloat(getComputedStyle(document.querySelector('.status')).fontSize)")
            if fs != 14:
                failures.append(f"大档基准字号应为 14px，实际 {fs}")
            stored = page.evaluate("() => localStorage.getItem('modelqa-fontsize')")
            if stored != "lg":
                failures.append(f"大档未持久化，实际 {stored!r}")
            on_label = page.locator("#app-settings .fontsize-seg button.is-on").get_attribute("data-fs")
            if on_label != "lg":
                failures.append(f"分段控件高亮错误: {on_label!r}")

            # 3) 关闭抽屉（✕）
            page.click('#app-settings [data-settings-close]:not(.drawer-mask)')
            page.wait_for_timeout(200)
            if not page.locator("#app-settings").evaluate("el => el.classList.contains('hidden')"):
                failures.append("抽屉未关闭")

            # 4) 刷新后保持大档
            page.reload(wait_until="networkidle")
            page.wait_for_timeout(400)
            tier = page.evaluate("() => document.documentElement.dataset.fontsize")
            if tier != "lg":
                failures.append(f"刷新后档位丢失，实际 {tier!r}")

            # 5) 切小档（= 历史字号 12px）
            page.click("#app-settings-toggle")
            page.wait_for_timeout(200)
            page.click('#app-settings [data-fs="sm"]')
            page.wait_for_timeout(200)
            fs = page.evaluate("() => parseFloat(getComputedStyle(document.querySelector('.status')).fontSize)")
            if fs != 12:
                failures.append(f"小档基准字号应为 12px，实际 {fs}")

            # 6) 审核端：同源共享档位 + 齿轮按钮 + 抽屉可用
            rpage = context.new_page()
            rpage.goto(f"http://localhost:{PORT}/reviewer-smoke.html", wait_until="networkidle", timeout=60000)
            rpage.wait_for_timeout(800)
            # 每次启动自动弹出的功能引导浮层会拦截指针事件，先移除
            rpage.evaluate("() => document.getElementById('onb-root')?.remove()")
            tier = rpage.evaluate("() => document.documentElement.dataset.fontsize")
            if tier != "sm":
                failures.append(f"审核端档位应同步为 sm，实际 {tier!r}")
            if not rpage.locator("#app-settings-toggle").is_visible():
                failures.append("审核端设置按钮不可见")
            rpage.click("#app-settings-toggle")
            rpage.wait_for_timeout(200)
            if rpage.locator("#app-settings").evaluate("el => el.classList.contains('hidden')"):
                failures.append("审核端设置抽屉未展开")
            rpage.click('#app-settings [data-fs="md"]')
            rpage.wait_for_timeout(200)
            tier = rpage.evaluate("() => document.documentElement.dataset.fontsize")
            if tier != "md":
                failures.append(f"审核端切中档失败，实际 {tier!r}")
            # 更多菜单含「界面设置」入口
            rpage.evaluate("() => document.getElementById('topbar-more-menu').classList.remove('hidden')")
            more_has = rpage.locator('#topbar-more-menu [data-more="settings"]').count()
            if not more_has:
                failures.append("审核端更多菜单缺少「界面设置」项")

            browser.close()
    finally:
        proc.kill()
        SMOKE_HTML.unlink(missing_ok=True)

    if failures:
        print("FAIL")
        for f in failures:
            print(f" - {f}")
        return 1
    print("PASS: 字体字号三档冒烟全部通过")
    return 0


if __name__ == "__main__":
    sys.exit(main())
