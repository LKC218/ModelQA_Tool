"""P3 在线预览链接管理 + 审核端回传 E2E 冒烟：
编辑端导出自动上传 → 链接管理面板（未审核页签）→ 审核端在线打开点「回传审核结果」
→ 服务端生成 <原名>-已审.html → 面板已审核页签出现 → 行内二次确认删除 → 链接 404。
运行前提：playwright（系统 Python312）。测试产物结束时全部删除，无残留。"""
from __future__ import annotations

import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path
from urllib.parse import unquote

ROOT = Path(__file__).resolve().parents[2]
LOG = ROOT / "vite-smoke.log"
ERR = ROOT / "vite-smoke.err"
PORT = 5181
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


def status_code(url):
    try:
        with urllib.request.urlopen(url, timeout=30) as resp:
            return resp.status
    except urllib.error.HTTPError as e:
        return e.code


def wait_row(page, text, timeout=30000):
    """等待包含 text 的链接行可见（显式检查 bounding box，避免 wait_for_selector 偶发误判）。"""
    page.wait_for_function(
        """(text) => [...document.querySelectorAll('.reviewlinks-item')]
            .some((el) => el.dataset.name.includes(text) && el.getBoundingClientRect().height > 0)""",
        arg=text, timeout=timeout)


def delete_row_fast(page, expect_text, tab, retries=3):
    """快速连点删除：首点进入待确认态、次点立即确认（严格断言版已在同流程覆盖 UX）。
    失败则重开面板再试，规避 3s 确认窗口与查询往返的时序竞争。"""
    for attempt in range(retries):
        wait_row(page, expect_text)
        btn = page.locator(".reviewlinks-item", has_text=expect_text).first.locator('[data-op="delete"]')
        btn.click()
        btn.click()
        page.wait_for_timeout(1200)
        gone = page.evaluate(
            """(text) => ![...document.querySelectorAll('.reviewlinks-item')]
                .some((el) => el.dataset.name.includes(text))""",
            expect_text)
        if gone:
            return
        page.wait_for_timeout(500)
        page.click("#reviewlinks-close")
        page.wait_for_timeout(300)
        page.click("#review-links")
        page.wait_for_selector("#reviewlinks-mask:not(.hidden)", timeout=30000)
        page.click(f"#tab-{tab}")
        page.wait_for_timeout(600)
    raise AssertionError(f"快速连点重试 {retries} 次后行仍未消失: {expect_text}")


def delete_row_via_panel(page, expect_text, tab="pending", retries=3):
    """对包含 expect_text 的行执行行内二次确认删除；失败则重开面板再试（避免陈旧 DOM 状态）。"""
    for attempt in range(retries):
        wait_row(page, expect_text)
        row = page.locator(".reviewlinks-item", has_text=expect_text).first
        del_btn = row.locator('[data-op="delete"]')
        if del_btn.inner_text().strip() != "确认删除":
            del_btn.click()  # 首点：进入待确认态
        confirm_btn = row.locator('[data-op="delete"]')
        if confirm_btn.inner_text().strip() != "确认删除":
            raise AssertionError(f"首点后未进入待确认态: {expect_text}")
        confirm_btn.click()  # 次点：确认删除
        page.wait_for_timeout(1200)
        gone = page.evaluate(
            """(text) => ![...document.querySelectorAll('.reviewlinks-item')]
                .some((el) => el.dataset.name.includes(text))""",
            expect_text)
        if gone:
            return
        page.wait_for_timeout(500)
        # 重开面板，彻底重置渲染状态后再试
        page.click("#reviewlinks-close")
        page.wait_for_timeout(300)
        page.click("#review-links")
        page.wait_for_selector("#reviewlinks-mask:not(.hidden)", timeout=30000)
        page.click(f"#tab-{tab}")
        page.wait_for_timeout(600)
    raise AssertionError(f"重试 {retries} 次后行仍未消失: {expect_text}")


def main():
    from playwright.sync_api import sync_playwright

    failures = []
    proc = start_vite()
    uploaded_url = ""
    debug = {"editor": None, "reviewer": None}
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            context = browser.new_context(viewport={"width": 1440, "height": 900}, accept_downloads=True)
            editor = context.new_page()
            debug["editor"] = editor

            # 1) 编辑端：选课程 → 导入 GLB → 导出单 HTML 自动上传
            editor.goto(f"http://localhost:{PORT}/", wait_until="domcontentloaded", timeout=30000)
            editor.wait_for_selector("#single", state="attached", timeout=60000)  # vite 冷启动可能较慢
            editor.wait_for_timeout(1500)
            editor.locator(".course-card").first.click()
            editor.wait_for_timeout(300)
            editor.set_input_files("#files", str(GLB))
            editor.wait_for_function("() => !document.getElementById('single').disabled", timeout=30000)
            with editor.expect_download(timeout=60000) as dl:
                editor.click("#single")
            editor.wait_for_selector(".toast-link", timeout=60000)
            uploaded_url = editor.locator(".toast-link").get_attribute("href")
            if "/reviews/" not in uploaded_url:
                failures.append(f"上传返回链接异常: {uploaded_url}")
            if status_code(uploaded_url) != 200:
                failures.append(f"在线预览链接不可访问: {uploaded_url}")

            # 2) 链接管理面板：未审核页签应含该链接；已审核页签为空
            editor.click("#review-links")
            editor.wait_for_selector("#reviewlinks-mask:not(.hidden)", timeout=30000)
            orig_name = unquote(uploaded_url.rsplit("/", 1)[1])
            wait_row(editor, orig_name.replace(".html", ""))
            editor.click("#tab-reviewed")
            editor.wait_for_timeout(500)
            if editor.locator("#reviewlinks-list .reviewlinks-item").count() != 0:
                failures.append("已审核页签应为空（尚未回传）")
            editor.click("#tab-pending")
            editor.wait_for_timeout(500)

            # 3) 审核端：在线打开链接 → 关闭功能引导 → 「回传审核结果」可见并点击
            reviewer = context.new_page()
            debug["reviewer"] = reviewer
            reviewer.add_init_script("try { localStorage.setItem('an_reviewer_onboarding_v2', 'done'); } catch (e) {}")
            reviewer.goto(uploaded_url, wait_until="domcontentloaded", timeout=60000)
            reviewer.wait_for_timeout(2500)  # 等运行时启动 + syncExportButtons
            skip_btn = reviewer.locator('[data-onb-skip]')
            if skip_btn.count() and skip_btn.first.is_visible():
                skip_btn.first.click()
                reviewer.wait_for_timeout(400)
            submit_btn = reviewer.locator("#submit-review")
            if submit_btn.is_hidden():
                failures.append("在线托管下「回传审核结果」按钮未显示（payload 可能缺 submitToken）")
            else:
                submit_btn.click()
                reviewer.wait_for_function(
                    "() => document.getElementById('footer').textContent.includes('已回传')", timeout=60000)

            # 4) 服务端应生成 <原名>-已审.html 且公网 200（URL 保持百分号编码，注意服务端后缀含连字符）
            reviewed_url = uploaded_url[:-5] + "-%E5%B7%B2%E5%AE%A1.html"
            if status_code(reviewed_url) != 200:
                failures.append(f"回传产物不可访问: {reviewed_url}")

            # 5) 面板刷新 → 已审核页签出现回传条目
            editor.bring_to_front()
            editor.click("#reviewlinks-refresh")
            editor.wait_for_timeout(800)
            editor.click("#tab-reviewed")
            wait_row(editor, orig_name.replace(".html", ""))

            # 6) 清理：先删「已审核」页签中的回传产物，再删未审核页签的原始链接
            delete_row_via_panel(editor, orig_name.replace(".html", "") + "-已审", tab="reviewed")
            editor.wait_for_timeout(500)
            if status_code(reviewed_url) != 404:
                failures.append(f"删除后回传产物仍可访问: {reviewed_url}")
            editor.click("#tab-pending")
            editor.wait_for_timeout(500)
            delete_row_fast(editor, orig_name.replace(".html", ""), tab="pending")
            editor.wait_for_timeout(500)
            if status_code(uploaded_url) != 404:
                failures.append(f"删除后原始链接仍可访问: {uploaded_url}")

            editor.click("#tab-pending")
            editor.wait_for_timeout(500)
            if editor.locator("#reviewlinks-list .reviewlinks-item", has_text=orig_name.replace(".html", "")).count() != 0:
                failures.append("删除后未审核页签仍显示该链接")

            browser.close()
    except Exception as exc:
        failures.append(f"异常中断: {type(exc).__name__}: {exc}")
        for name, page in debug.items():
            if page:
                try:
                    page.screenshot(path=str(ROOT / "output" / f"smoke-review-links-{name}.png"))
                except Exception:
                    pass
    finally:
        proc.kill()

    if failures:
        print("FAIL")
        for f in failures:
            print(f" - {f}")
        return 1
    print("PASS: 在线预览链接管理 + 审核回传 E2E 全部通过（测试产物已删除）")
    return 0


if __name__ == "__main__":
    sys.exit(main())
