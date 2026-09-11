"""桌面回归：确认 hide-sm/only-sm 未破坏桌面三栏。"""
from playwright.sync_api import sync_playwright

BASE = "http://localhost:5174/reviewer-preview.html"

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    context = browser.new_context(viewport={"width": 1440, "height": 900})
    context.add_init_script("try { localStorage.setItem('an_reviewer_onboarding_v2', '1'); } catch {}")
    page = context.new_page()
    errors = []
    page.on("pageerror", lambda err: errors.append(str(err)))
    page.goto(BASE, wait_until="networkidle", timeout=60000)
    page.wait_for_function("() => document.getElementById('model-title')?.textContent?.includes('1N4007')", timeout=30000)
    page.wait_for_timeout(800)
    if page.locator("#onb-root.is-open").count():
        page.evaluate("() => document.getElementById('onb-root')?.classList.remove('is-open')")
    data = page.evaluate(
        """() => {
      const cs = (el) => getComputedStyle(el);
      const ws = document.querySelector('.workspace');
      const left = document.querySelector('.sidebar.left');
      const right = document.querySelector('.sidebar.right');
      const tabs = document.querySelector('.mobile-tabs');
      const more = document.getElementById('mobile-more');
      const folder = document.getElementById('folder');
      const zip = document.getElementById('export-zip');
      return {
        cols: cs(ws).gridTemplateColumns,
        leftPos: cs(left).position,
        rightPos: cs(right).position,
        leftOpen: left.classList.contains('is-open'),
        tabs: cs(tabs).display,
        more: cs(more).display,
        folder: cs(folder).display,
        zipText: zip.innerText.trim(),
        exportHtml: cs(document.getElementById('export-html')).display,
      };
    }"""
    )
    print("DESKTOP", data)
    print("ERRORS", errors)
    browser.close()
