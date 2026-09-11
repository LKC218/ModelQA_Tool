"""开发端多槽草稿冒烟：自动保存、列表操作、启动恢复。"""
from __future__ import annotations

import json
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


def start_vite():
    node = r"C:\Users\Administrator\AppData\Local\Microsoft\WinGet\Packages\OpenJS.NodeJS.22_Microsoft.Winget.Source_8wekyb3d8bbwe\node-v22.22.0-win-x64\node.exe"
    vite = ROOT / "node_modules" / "vite" / "bin" / "vite.js"
    log_f = open(LOG, "w", encoding="utf-8")
    err_f = open(ERR, "w", encoding="utf-8")
    proc = subprocess.Popen(
        [node, str(vite), "--port", str(PORT), "--strictPort"],
        cwd=str(ROOT),
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

    proc = start_vite()
    failures: list[str] = []
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            context = browser.new_context(viewport={"width": 1440, "height": 900})
            page = context.new_page()
            page.goto(f"http://localhost:{PORT}/", wait_until="networkidle", timeout=30000)

            # 1) 首次编辑触发自动保存（字段在抽屉内，用事件派发避免可见性限制）
            page.evaluate(
                """() => {
              const name = document.getElementById('project-name');
              const title = document.getElementById('display-title');
              name.value = '冒烟项目A';
              title.value = '冒烟标题A';
              name.dispatchEvent(new Event('input', { bubbles: true }));
              title.dispatchEvent(new Event('input', { bubbles: true }));
            }"""
            )
            page.wait_for_timeout(2000)
            footer = page.locator("#footer").inner_text()
            if "已自动保存" not in footer:
                failures.append(f"自动保存文案缺失: {footer!r}")

            drafts = page.evaluate("() => JSON.parse(localStorage.getItem('an-review-drafts')||'[]')")
            if not drafts:
                failures.append("未生成草稿索引")
            active = page.evaluate("() => localStorage.getItem('an-review-active')")
            if not active:
                failures.append("未写入 active 草稿 id")

            # 2) 列表 UI 可见
            if not page.locator("#draft-toggle").is_visible():
                failures.append("草稿切换按钮不可见")
            page.click("#draft-toggle")
            page.wait_for_timeout(200)
            if page.locator("#draft-panel").evaluate("el => el.classList.contains('hidden')"):
                failures.append("草稿面板未展开")
            items = page.locator(".draft-item").count()
            if items < 1:
                failures.append("草稿列表为空")

            # 3) 另存为命名草稿
            page.once("dialog", lambda d: d.accept("项目B副本"))
            page.click("#draft-saveas")
            page.wait_for_timeout(300)
            drafts2 = page.evaluate("() => JSON.parse(localStorage.getItem('an-review-drafts')||'[]')")
            names = [d.get("name") for d in drafts2]
            if "项目B副本" not in names:
                failures.append(f"另存为失败，列表={names}")

            # 4) 切换回第一条并改内容，再切换验证隔离
            # 改当前（项目B副本）标题
            page.evaluate(
                """() => {
              const name = document.getElementById('project-name');
              name.value = '副本改名';
              name.dispatchEvent(new Event('input', { bubbles: true }));
            }"""
            )
            page.wait_for_timeout(1800)
            # 确保面板打开后切换
            if page.locator("#draft-panel").evaluate("el => el.classList.contains('hidden')"):
                page.click("#draft-toggle")
                page.wait_for_timeout(150)
            first_switch = page.locator('.draft-item:not(.active) .draft-item-main').first
            if first_switch.count() == 0:
                failures.append("找不到可切换草稿")
            else:
                first_switch.click()
                page.wait_for_timeout(400)
                name_val = page.evaluate("() => document.getElementById('project-name').value")
                if name_val == "副本改名":
                    failures.append("切换草稿后内容未隔离")

            # 5) 重命名
            if page.locator("#draft-panel").evaluate("el => el.classList.contains('hidden')"):
                page.click("#draft-toggle")
                page.wait_for_timeout(150)
            active_rename = page.locator('.draft-item.active [data-action="rename"]')
            if active_rename.count():
                page.once("dialog", lambda d: d.accept("重命名后"))
                active_rename.click()
                page.wait_for_timeout(200)
                drafts3 = page.evaluate("() => JSON.parse(localStorage.getItem('an-review-drafts')||'[]')")
                if "重命名后" not in [d.get("name") for d in drafts3]:
                    failures.append("重命名失败")

            # 6) 复制
            if page.locator("#draft-panel").evaluate("el => el.classList.contains('hidden')"):
                page.click("#draft-toggle")
                page.wait_for_timeout(150)
            copy_btn = page.locator('.draft-item.active [data-action="copy"]')
            if copy_btn.count():
                before = len(page.evaluate("() => JSON.parse(localStorage.getItem('an-review-drafts')||'[]')"))
                page.once("dialog", lambda d: d.accept("复制出的"))
                copy_btn.click()
                page.wait_for_timeout(200)
                after = page.evaluate("() => JSON.parse(localStorage.getItem('an-review-drafts')||'[]')")
                if len(after) != before + 1:
                    failures.append(f"复制失败 before={before} after={len(after)}")

            # 7) 刷新后自动恢复
            page.reload(wait_until="networkidle")
            page.wait_for_timeout(500)
            footer2 = page.locator("#footer").inner_text()
            if "已恢复草稿" not in footer2:
                failures.append(f"启动未恢复: {footer2!r}")
            active_name = page.locator("#draft-current-name").inner_text()
            if not active_name or active_name == "草稿":
                failures.append(f"当前草稿名未显示: {active_name!r}")

            # 8) 删除当前草稿
            page.click("#draft-toggle")
            page.wait_for_timeout(150)
            del_btn = page.locator(".draft-item.active [data-action=delete]")
            before_del = len(page.evaluate("() => JSON.parse(localStorage.getItem('an-review-drafts')||'[]')"))
            if before_del:
                page.once("dialog", lambda d: d.accept())
                del_btn.click()
                page.wait_for_timeout(300)
                after_del = page.evaluate("() => JSON.parse(localStorage.getItem('an-review-drafts')||'[]')")
                if len(after_del) != before_del - 1:
                    failures.append(f"删除失败 {before_del}->{len(after_del)}")

            # 9) 旧 key 迁移（预置后刷新）
            page.evaluate("""() => {
              localStorage.setItem('an-review-draft', JSON.stringify({
                project: { projectId:'LEGACY-1', displayTitle:'旧草稿', name:'旧项目', version:'V0.9', courses:[{courseId:'course-AN-01',code:'AN-01',name:'旧课程',sortOrder:1}] },
                models: [],
                review: { byModel: {} },
                savedAt: new Date().toISOString()
              }));
              localStorage.removeItem('an-review-active');
            }""")
            page.reload(wait_until="networkidle")
            page.wait_for_timeout(400)
            legacy_left = page.evaluate("() => localStorage.getItem('an-review-draft')")
            if legacy_left is not None:
                failures.append("旧 draft key 未清除")
            migrated = page.evaluate("() => JSON.parse(localStorage.getItem('an-review-drafts')||'[]')")
            if not any(d.get("name") in ("旧项目", "迁移草稿") for d in migrated):
                failures.append(f"旧草稿未迁移: {migrated}")

            browser.close()
    finally:
        proc.kill()

    if failures:
        print("FAIL")
        for f in failures:
            print(f" - {f}")
        return 1
    print("PASS: 多槽草稿冒烟全部通过")
    return 0


if __name__ == "__main__":
    sys.exit(main())
