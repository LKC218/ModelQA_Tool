# 在线预览短 ID 链接 — 服务端补丁说明（V1.2）

> **部署状态（2026-09-12 17:18）：已部署至生产并通过全部验证。**
> - 服务端：`服务器部署/modelqa-data-server.py` 已按本文打补丁，经 `_deploy_review_shortid_20260912.py` 部署（服务器侧时间戳备份 `/root/deploy-backups/`）。
> - 验证：本地冒烟 `local_smoke_review_endpoints.py` 23 项 PASS；E2E `tool/scripts/smoke/smoke-review-links.py` PASS（上传链接 = 短 ID 42 字符）。
> - 相比本文初稿的两处实现修正（部署时落地）：
>   1. **upload 的 meta name 实际不含 `.html`**（前端 `exportSingle` 上传时传 `filename.replace(/\.html$/,'')`），submit 的 display 名仍含 `.html`；DELETE 因此兼容「补后缀 + meta 反查」四种 name 形态。
>   2. DELETE 未命中落盘名时扫 sidecar meta 按显示名反查短 ID（前端面板删除传的就是显示名）。
> - E2E 配套修正：固定切「模拟电路实训室」小项目（headless 无 localStorage 时 `reconcileCloud` 自动接续云端最新项目，可能落到 15MB 大项目导致上传超时）；区分 `#single`（仅下载）与 `#upload-preview`（上传）两个按钮。

## 背景与目标

当前 `/reviews/<文件名>` 直接用上传文件名当 URL，中文经百分号编码后链接过长（一个汉字膨胀为 9 字符）。
本补丁把存储名与显示名解耦：**服务端生成 6 位短 ID 落盘，原始文件名收进 sidecar 元数据**，
URL 变为 `https://3d.propanda.cn/reviews/R7kQ2x.html`（纯 ASCII，约 40 字符）。

改动文件：`服务器部署/modelqa-data-server.py`（本仓库不含该文件）。
前端配套改动已完成（见文末「前端配套状态」），**新旧服务端逻辑双向兼容，可分步部署**。

## 契约变更总览

| 接口 | 现状 | 补丁后 |
|------|------|--------|
| POST `/api/upload` | 按 `X-Filename` 原名落盘 | 生成短 ID `<id>.html` 落盘；写 `<id>.meta.json` = `{"name": "<原名>", "reviewed": false}`；返回的 `url` 用短 ID |
| POST `/api/reviews/submit` | 落盘 `<原名>-已审.html` | 同样新短 ID 落盘；meta = `{"name": "<原名去.html>-已审.html", "reviewed": true}` |
| GET `/api/reviews/list` | 扫 `*.html`，文件名推导 `reviewed` | 优先读 meta 的 `name/reviewed`；**无 meta 的旧文件回退现有推导逻辑** |
| DELETE `/api/reviews/<name>` | `<name>` 移入 `_archive/` | 接受短 ID 或旧全名；短 ID 删除时把 `<id>.meta.json` 一并移入 `_archive/` |

> `name` 字段统一存**含 `.html` 的完整显示名**（如 `电机控制实训-审核器-20260911-234538-已审.html`），
> 与旧 list 返回的 name 语义一致，前端无需区分来源。

## 补丁代码

以下函数按行为编写，与现有 handler 对号入座替换即可（`REVIEWS_DIR`、`safe_name()` 等沿用现有实现）。

### 1. 短 ID 生成

```python
import secrets, string

_ID_ALPHABET = string.ascii_letters + string.digits

def new_review_id() -> str:
    """6 位 [A-Za-z0-9] 短 ID，落盘前查重，冲突则重新生成（62^6 ≈ 568 亿，实际不会碰撞）"""
    while True:
        rid = ''.join(secrets.choice(_ID_ALPHABET) for _ in range(6))
        if not (REVIEWS_DIR / f'{rid}.html').exists():
            return rid
```

### 2. meta 读写工具

```python
import json

def _meta_path(html_name: str):
    return REVIEWS_DIR / (html_name[:-5] + '.meta.json') if html_name.endswith('.html') else None

def write_meta(html_name: str, name: str, reviewed: bool) -> None:
    p = _meta_path(html_name)
    if p:
        p.write_text(json.dumps({'name': name, 'reviewed': reviewed}, ensure_ascii=False), encoding='utf-8')

def read_meta(html_name: str) -> dict | None:
    p = _meta_path(html_name)
    if p and p.exists():
        try:
            return json.loads(p.read_text(encoding='utf-8'))
        except Exception:
            return None
    return None
```

### 3. `/api/upload` handler（改动点）

```python
# 原：orig = safe_name(X-Filename)；dest = REVIEWS_DIR / orig
# 改为：
orig = safe_name(decode_header('X-Filename'))          # 原名只进元数据，不再当存储名
rid  = new_review_id()
dest = REVIEWS_DIR / f'{rid}.html'
dest.write_bytes(body)
write_meta(dest.name, name=orig, reviewed=False)
return {'ok': True, 'url': f'/reviews/{rid}.html'}
```

### 4. `/api/reviews/submit` handler（改动点）

```python
# 原：dest = REVIEWS_DIR / (orig_review_name)   # <原名>-已审.html，中文名回来链接又变长
# 改为：
orig = safe_name(decode_header('X-Orig-Filename'))      # 如 '电机控制实训-审核器-xxx.html'
display = orig[:-5] + '-已审.html' if orig.endswith('.html') else orig + '-已审.html'
rid  = new_review_id()
dest = REVIEWS_DIR / f'{rid}.html'
dest.write_bytes(body)
write_meta(dest.name, name=display, reviewed=True)
return {'ok': True, 'url': f'/reviews/{rid}.html'}
```

### 5. `/api/reviews/list` handler（改动点）

```python
items = []
for f in sorted(REVIEWS_DIR.glob('*.html'), key=lambda p: p.stat().st_mtime, reverse=True):
    if '_archive' in f.parts:
        continue
    meta = read_meta(f.name)
    if meta:
        items.append({'name': meta['name'], 'size': f.stat().st_size,
                      'uploadedAt': ts(f), 'url': f'/reviews/{f.name}', 'reviewed': bool(meta['reviewed'])})
    else:
        # 旧文件回退：无 meta 时沿用现有「存在 <名去.html>-已审.html 则 reviewed=true」推导
        base = f.name[:-5]
        reviewed = (REVIEWS_DIR / f'{base}-已审.html').exists() or base.endswith('-已审')
        items.append({'name': f.name, 'size': f.stat().st_size,
                      'uploadedAt': ts(f), 'url': f'/reviews/{f.name}', 'reviewed': reviewed})
return {'reviews': items}
```

### 6. `DELETE /api/reviews/<name>` handler（改动点）

```python
# 路径校验沿用现有白名单；删除对象扩展为同时清 meta：
meta_p = _meta_path(name)
# 原 os.rename / shutil.move 到 _archive 的逻辑保持，追加：
if meta_p and meta_p.exists():
    archive_meta = ARCHIVE_DIR / meta_p.name   # 与 html 同批移入 _archive，可人工恢复
    os.rename(meta_p, archive_meta)
```

## 兼容性与迁移

- **旧文件零迁移**：无 meta 的旧文件走回退推导，旧长链接继续可访问；新上传/回传全部走短 ID。
- **部署顺序无要求**：前端已做双兼容（去重配对同时认「同名 reviewed」与「-已审 后缀」两种约定；审核端原名来源 payload → URL → 项目名三级回退）。只部署前端时一切照旧；先部署服务端时回传靠 payload 注入的原名，同样正确。
- **补丁部署后可选验证**：上传一个新包，确认返回 url 形如 `/reviews/<6位>.html`；面板刷新后已审行可打开。

## 前端配套状态（本仓库已完成）

| 文件 | 改动 |
|------|------|
| `tool/src/editor/main-implementation.js` | `exportSingle()` 把原始包名注入 `payload.upload.origFilename`；面板去重升级为「同名 name + reviewed」与「-已审 后缀」双规则 |
| `tool/src/reviewer/reviewer-implementation.js` | `origReviewFilename()` 前缀仲裁：URL 名以注入名前缀开头（旧服务端改名场景）→ 用 URL 名；短 ID 托管（无前缀关系）→ 用注入名；再回退项目名 |
| `tool/scripts/smoke/smoke-review-links.py` | 回传产物 URL 改从面板 `data-url` 取（不再从原 URL 推导），新旧服务端通用；回传改快速连点避开 3s 确认窗口；断言课程维度化。已 PASS |

## 已查实的旧服务端行为（补丁部署前必读）

- **`/api/upload` 一律给落盘名追加 `-YYYYMMDD-HHMMSS` 时间戳**（客户端传 `X-审核器.html`，落盘为 `<名>-20260912-014936.html`），**`/api/reviews/submit` 不改名**（`<X-Orig-Filename去.html>-已审.html` 原样落盘）。审核端取名因此用「前缀仲裁」兼容两种服务端。
- 打补丁后 upload 改为短 ID 落盘、不再追加时间戳，与 `meta.name` 的约定即「显示名 = 客户端原始名」完全解耦。

## 冒烟稳定性备注（2026-09-12 凌晨验证过程）

- 审核端「回传」是行内二次确认（3s 窗口）：自动化测试必须在窗口内完成两次点击（快速连点），否则确认态被定时器还原、回传静默不启动（现象：按钮还原、status/footer 全空）。
- 冒烟直连生产共享数据，断言一律课程维度（带时间戳可区分历史产物），不做全列表绝对断言。
