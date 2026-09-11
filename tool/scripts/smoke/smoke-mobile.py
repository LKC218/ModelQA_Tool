"""审核端多视口响应式冒烟：宽/高矩阵 + 桌面回归。"""
from pathlib import Path
from playwright.sync_api import sync_playwright

BASE = "http://localhost:5174/reviewer-preview.html"
OUT = Path(r"G:\项目\模型审核工具\tool\output\playwright")
OUT.mkdir(parents=True, exist_ok=True)

VIEWPORTS = [
    ("se", 320, 568),
    ("android-small", 360, 640),
    ("iphone12", 390, 844),
    ("iphone-promax", 430, 932),
    ("landscape", 844, 390),
    ("desktop", 1440, 900),
]


def inspect(page):
    return page.evaluate(
        """() => {
      const cs = (el) => (el ? getComputedStyle(el) : null);
      const ws = document.querySelector('.workspace');
      const left = document.querySelector('.sidebar.left');
      const right = document.querySelector('.sidebar.right');
      const tabs = document.querySelector('.mobile-tabs');
      const more = document.getElementById('mobile-more');
      const progress = document.getElementById('progress');
      const card = document.querySelector('.course-card');
      const rails = document.querySelectorAll('.rail-scroll');
      const progSm = progress?.querySelector('.progress-sm');
      const progLg = progress?.querySelector('.progress-lg');
      const cardRect = card?.getBoundingClientRect();
      return {
        w: innerWidth,
        h: innerHeight,
        scrollW: document.documentElement.scrollWidth,
        clientW: document.documentElement.clientWidth,
        overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
        cols: cs(ws)?.gridTemplateColumns,
        leftPos: cs(left)?.position,
        tabsDisplay: cs(tabs)?.display,
        tabsMinH: cs(tabs?.querySelector('button'))?.minHeight,
        moreDisplay: cs(more)?.display,
        progressText: progress?.innerText?.replace(/\\s+/g, ' ').trim(),
        progSmDisplay: cs(progSm)?.display,
        progLgDisplay: cs(progLg)?.display,
        progressTitle: progress?.title || '',
        railScrollDisplay: cs(rails[0])?.display,
        cardW: cardRect?.width || 0,
        leftOpen: left?.classList.contains('is-open'),
        rightOpen: right?.classList.contains('is-open'),
        drawerMaxH: cs(left)?.maxHeight,
        modelTitle: document.getElementById('model-title')?.textContent || '',
      };
    }"""
    )


def run_viewport(browser, name, width, height):
    is_desktop = width > 900
    context = browser.new_context(
        viewport={"width": width, "height": height},
        device_scale_factor=2 if width <= 430 else 1,
        is_mobile=width <= 900,
        has_touch=width <= 900,
    )
    context.add_init_script("try { localStorage.setItem('an_reviewer_onboarding_v2', '1'); } catch {}")
    page = context.new_page()
    errors = []
    page.on("pageerror", lambda err: errors.append(f"pageerror:{err}"))
    page.on("console", lambda msg: errors.append(f"console:{msg.text}") if msg.type == "error" else None)
    page.goto(BASE, wait_until="networkidle", timeout=60000)
    page.wait_for_function(
        "() => document.getElementById('model-title')?.textContent?.includes('1N4007')",
        timeout=30000,
    )
    page.wait_for_timeout(700)
    if page.locator("#onb-root.is-open").count():
        page.evaluate("() => document.getElementById('onb-root')?.classList.remove('is-open')")

    data = inspect(page)
    page.screenshot(path=str(OUT / f"vp-{name}.png"), full_page=False)

    ok = not data["overflowX"]
    notes = []
    if data["overflowX"]:
        notes.append(f"OVERFLOW {data['scrollW']}>{data['clientW']}")
    if not is_desktop:
        if data["tabsDisplay"] != "grid":
            notes.append(f"tabs={data['tabsDisplay']}")
        try:
            tab_h = float((data["tabsMinH"] or "0px").replace("px", ""))
        except ValueError:
            tab_h = 0
        if tab_h < 44:
            notes.append(f"tabsMinH={data['tabsMinH']}")
        if data["progSmDisplay"] == "none":
            notes.append("progress-sm hidden")
        if "/" not in (data["progressText"] or ""):
            notes.append(f"progress={data['progressText']}")
    else:
        if data["tabsDisplay"] != "none":
            notes.append(f"desktop tabs={data['tabsDisplay']}")
        if data["progLgDisplay"] == "none":
            notes.append("desktop progress-lg hidden")
        if "通过" not in (data["progressText"] or ""):
            notes.append(f"desktop progress={data['progressText']}")

    # 手机：打开抽屉再测一次 overflow
    if not is_desktop and height >= 500:
        page.click('[data-mobile-panel="right"]', timeout=5000)
        page.wait_for_timeout(300)
        drawer = inspect(page)
        if drawer["overflowX"]:
            notes.append("drawer OVERFLOW")
            ok = False
        page.screenshot(path=str(OUT / f"vp-{name}-drawer.png"), full_page=False)

    print(f"[{name} {width}x{height}] ok={ok} notes={notes}")
    print(f"  {data}")
    if errors:
        print(f"  ERRORS {errors}")
        ok = False
    context.close()
    return ok


with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    results = []
    for name, w, h in VIEWPORTS:
        results.append(run_viewport(browser, name, w, h))
    browser.close()

failed = sum(1 for ok in results if not ok)
print(f"SUMMARY passed={len(results)-failed}/{len(results)} out={OUT}")
raise SystemExit(1 if failed else 0)
