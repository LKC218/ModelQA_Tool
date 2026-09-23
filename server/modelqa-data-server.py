# -*- coding: utf-8 -*-
"""ModelQA 数据资源服务（P0）

零第三方依赖，Python 3 标准库实现。
监听 127.0.0.1:8445，由 systemd(modelqa-data.service) 守护，Nginx 反代 /api/。
落盘目录 /var/www/modelqa-data/{projects,models,reviews}。
接口契约见 docs/实施方案/开发端云端持久化与审核包在线托管-实施计划-V1.0.md §5.1。
"""
import hashlib
import json
import os
import re
import secrets
import string
import sys
import threading
import time
import urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

BASE_DIR = "/var/www/modelqa-data"
CONFIG_PATH = os.path.join(BASE_DIR, "server-config.json")
PROJECTS_DIR = os.path.join(BASE_DIR, "projects")
MODELS_DIR = os.path.join(BASE_DIR, "models")
REVIEWS_DIR = os.path.join(BASE_DIR, "reviews")
REVIEWS_ARCHIVE_DIR = os.path.join(REVIEWS_DIR, "_archive")   # 软删除归档（Nginx 不直出）
REVIEWS_ASSETS_DIR = os.path.join(REVIEWS_DIR, "assets")      # 在线预览外链模型（v4，sha256 内容寻址，Nginx 静态直出+强缓存）
LOG_PATH = os.path.join(BASE_DIR, "server.log")

MAX_BODY = 200 * 1024 * 1024          # 请求体上限 200MB
PUBLIC_ORIGIN = "https://3d.propanda.cn"
TOKEN_HEADER = "X-ModelQA-Token"
REVIEWED_SUFFIX = "-已审"             # 审核端回传结果文件名后缀

_id_re = re.compile(r"[^A-Za-z0-9_-]")
_file_lock = threading.Lock()
_log_lock = threading.Lock()

TOKEN = ""
SUBMIT_TOKEN = ""


# ---------------------------------------------------------------- utilities

def load_config():
    """启动时读取 Token 配置（文件权限 600，由部署脚本生成）。

    token       开发端全权 Token；submitToken 为审核端回传专用低权 Token（仅 POST /api/reviews/submit）。
    """
    global TOKEN, SUBMIT_TOKEN
    try:
        with open(CONFIG_PATH, "r", encoding="utf-8") as f:
            cfg = json.load(f)
        TOKEN = str(cfg.get("token", ""))
        SUBMIT_TOKEN = str(cfg.get("submitToken", ""))
    except Exception as e:
        print("FATAL: 读取配置失败 %s: %s" % (CONFIG_PATH, e), file=sys.stderr)
        TOKEN = ""
        SUBMIT_TOKEN = ""


def log(msg):
    line = time.strftime("%Y-%m-%d %H:%M:%S ") + msg + "\n"
    with _log_lock:
        try:
            if os.path.exists(LOG_PATH) and os.path.getsize(LOG_PATH) > 10 * 1024 * 1024:
                if os.path.exists(LOG_PATH + ".1"):
                    os.remove(LOG_PATH + ".1")
                os.replace(LOG_PATH, LOG_PATH + ".1")
            with open(LOG_PATH, "a", encoding="utf-8") as f:
                f.write(line)
        except OSError:
            pass
        try:
            sys.stdout.write(line)
            sys.stdout.flush()
        except OSError:
            pass


def sanitize_id(raw):
    """项目 id 白名单清洗，防路径穿越。"""
    return _id_re.sub("", str(raw))[:100]


def sanitize_filename(raw):
    """审核包文件名清洗：保留中文/字母/数字/中划线/下划线/点。"""
    # 前端发送 encodeURIComponent 后的值，此处解码
    name = urllib.parse.unquote(str(raw)).strip()
    name = re.sub(r'[\\/:*?"<>|\x00-\x1f]', "_", name)
    name = re.sub(r"\s+", "-", name).strip("-._")
    return name[:60] or "review"


def sanitize_path(raw):
    """模型相对路径清洗（仅作元数据，不参与任何落盘路径，无穿越风险）。

    反斜杠统一为 /；丢弃空段与 . / ..；逐段替换非法字符（保留空格与中文）；
    段数上限 6、单段上限 120 字符、总长上限 512。
    """
    text = urllib.parse.unquote(str(raw or "")).replace("\\", "/")
    segments = []
    for seg in text.split("/"):
        seg = seg.strip()
        if not seg or seg in (".", ".."):
            continue
        seg = re.sub(r'[\\/:*?"<>|\x00-\x1f]', "_", seg).strip()
        if seg:
            segments.append(seg[:120])
        if len(segments) >= 6:
            break
    return "/".join(segments)[:512]


def extract_model_hashes(data):
    """从项目 JSON 提取模型 hash 集（payload.modelCloud: modelId -> {hash,url,size}）。"""
    out = []
    mc = data.get("modelCloud") if isinstance(data, dict) else None
    if isinstance(mc, dict):
        for v in mc.values():
            if isinstance(v, dict):
                h = str(v.get("hash") or "")
                if h:
                    out.append(h)
    return out


def update_model_projects(hashes, pid, name, add=True):
    """维护模型元数据的 projects: [{id, name}]（项目制分类）。

    add=True 合并该模型的项目引用（同名自动更新）；add=False 移除该 pid 的引用。
    模型无元数据文件时静默跳过（引用先于首次上传到达是合法时序）。
    """
    for h in sorted(set(hashes)):
        if not re.fullmatch(r"[0-9a-f]{64}", h):
            continue
        meta_path = os.path.join(MODELS_DIR, h + ".json")
        if not os.path.isfile(meta_path):
            continue
        try:
            with open(meta_path, "r", encoding="utf-8") as f:
                meta = json.load(f)
        except Exception:
            continue
        old = [p for p in (meta.get("projects") or []) if isinstance(p, dict)]
        projects = [p for p in old if p.get("id") != pid]
        if add and name:
            projects.append({"id": pid, "name": name[:60]})
        if projects != old:
            meta["projects"] = projects[-20:]
            atomic_write(meta_path, json.dumps(meta, ensure_ascii=False).encode("utf-8"))


def iso_mtime(ts):
    return time.strftime("%Y-%m-%dT%H:%M:%S", time.localtime(ts))


def atomic_write(path, data):
    """加锁 + 临时文件 + os.replace 原子落盘；保证其他用户可读（Nginx 静态直出）。"""
    with _file_lock:
        tmp = path + ".tmp"
        with open(tmp, "wb") as f:
            f.write(data)
        os.chmod(tmp, 0o644)
        os.replace(tmp, path)


# ---------------------------------------------------------------- review 短 ID 与 sidecar 元数据

_REVIEW_ID_ALPHABET = string.ascii_letters + string.digits


def new_review_id():
    """6 位 [A-Za-z0-9] 短 ID，落盘前查重，冲突则重新生成（62^6 ≈ 568 亿，实际不会碰撞）。"""
    while True:
        rid = "".join(secrets.choice(_REVIEW_ID_ALPHABET) for _ in range(6))
        if not os.path.exists(os.path.join(REVIEWS_DIR, rid + ".html")):
            return rid


def review_meta_path(html_name):
    """sidecar 元数据路径：<id>.html -> <id>.meta.json；非 .html 名返回 None。"""
    if html_name.endswith(".html"):
        return os.path.join(REVIEWS_DIR, html_name[:-5] + ".meta.json")
    return None


def write_review_meta(html_name, name, reviewed):
    """写显示名 sidecar（原子落盘）。name 为含 .html 的完整显示名。"""
    p = review_meta_path(html_name)
    if p:
        atomic_write(p, json.dumps({"name": name, "reviewed": bool(reviewed)},
                                   ensure_ascii=False).encode("utf-8"))


def read_review_meta(html_name):
    """读显示名 sidecar；不存在或损坏返回 None（调用方回退旧推导逻辑）。"""
    p = review_meta_path(html_name)
    if p and os.path.isfile(p):
        try:
            with open(p, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return None
    return None


def review_display_base(name):
    """显示名归一基名：去 .html 与 -已审 后缀，作同项目回传覆盖的配对键。

    与前端注入 payload.upload.origFilename（<项目名>-审核器.html）同源，
    同项目每轮回传基名一致，跨轮可配对。
    """
    n = str(name).strip()
    if n.endswith(".html"):
        n = n[:-5]
    if n.endswith(REVIEWED_SUFFIX):
        n = n[: -len(REVIEWED_SUFFIX)]
    return n


def archive_superseded_reviewed(base):
    """回传覆盖语义：把同基名的旧「已审」条目移入 _archive（软删可恢复），列表只留最新一条。

    未审核原链接不受影响。须在 _file_lock 内调用。返回归档的落盘名列表（日志用）。
    """
    moved = []
    try:
        names = sorted(os.listdir(REVIEWS_DIR))
    except OSError:
        return moved
    for fn in names:
        if not fn.endswith(".html") or fn.startswith("_"):
            continue
        meta = read_review_meta(fn)
        if meta and isinstance(meta, dict) and meta.get("name"):
            disp = str(meta["name"])
            reviewed = bool(meta.get("reviewed"))
        else:
            disp = fn
            reviewed = fn[:-5].endswith(REVIEWED_SUFFIX)   # 无 meta 旧文件按文件名推导
        if not reviewed or review_display_base(disp) != base:
            continue
        src = os.path.join(REVIEWS_DIR, fn)
        if not os.path.isfile(src):
            continue
        os.makedirs(REVIEWS_ARCHIVE_DIR, exist_ok=True)
        dst = os.path.join(REVIEWS_ARCHIVE_DIR, fn)
        if os.path.exists(dst):
            os.remove(dst)
        os.rename(src, dst)
        mp = review_meta_path(fn)
        if mp and os.path.isfile(mp):
            dm = os.path.join(REVIEWS_ARCHIVE_DIR, os.path.basename(mp))
            if os.path.exists(dm):
                os.remove(dm)
            os.rename(mp, dm)
        moved.append(fn)
    return moved


# ---------------------------------------------------------------- handler

class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    server_version = "ModelQA-Data/1.0"

    # ---- 基础响应 ----

    def send_json(self, code, obj):
        payload = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        try:
            self.wfile.write(payload)
        except (BrokenPipeError, ConnectionResetError):
            pass

    def log_message(self, fmt, *args):
        log("%s - %s" % (self.address_string(), fmt % args))

    # ---- 请求体 ----

    def read_body(self):
        """读取请求体；超限返回 None 并已回 413。"""
        try:
            length = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            length = 0
        if length <= 0:
            self.send_json(400, {"error": "missing Content-Length"})
            return None
        if length > MAX_BODY:
            self.close_connection = True
            self.send_json(413, {"error": "body too large (max 200MB)"})
            return None
        return self.rfile.read(length)

    # ---- 鉴权 ----

    def check_auth(self):
        if self.headers.get(TOKEN_HEADER, "") == TOKEN:
            return True
        self.send_json(401, {"error": "unauthorized"})
        return False

    def check_submit_auth(self):
        """审核端回传专用鉴权：submitToken 仅放行 POST /api/reviews/submit。"""
        if SUBMIT_TOKEN and self.headers.get(TOKEN_HEADER, "") == SUBMIT_TOKEN:
            return True
        self.send_json(401, {"error": "unauthorized"})
        return False

    # ---- 路由 ----

    def do_GET(self):
        path = urllib.parse.urlparse(self.path).path
        if path == "/api/health":
            return self.send_json(200, {"ok": True})
        if not self.check_auth():
            return
        if path == "/api/projects":
            return self.list_projects()
        if path.startswith("/api/projects/"):
            return self.get_project(sanitize_id(path[len("/api/projects/"):]))
        if path == "/api/models/list":
            return self.list_models()
        if path == "/api/reviews/list":
            return self.list_reviews()
        return self.send_json(404, {"error": "not found"})

    def do_PUT(self):
        path = urllib.parse.urlparse(self.path).path
        if not self.check_auth():
            return
        if path.startswith("/api/projects/"):
            body = self.read_body()
            if body is None:
                return
            return self.put_project(sanitize_id(path[len("/api/projects/"):]), body)
        return self.send_json(404, {"error": "not found"})

    def do_POST(self):
        path = urllib.parse.urlparse(self.path).path
        if path == "/api/reviews/submit":
            # 回传专用低权 Token，先于全权 Token 鉴权
            if not self.check_submit_auth():
                return
            body = self.read_body()
            if body is None:
                return
            return self.post_submit(body)
        if not self.check_auth():
            return
        if path == "/api/models":
            body = self.read_body()
            if body is None:
                return
            return self.post_model(body)
        if path == "/api/upload":
            body = self.read_body()
            if body is None:
                return
            return self.post_upload(body)
        if path == "/api/upload-asset":
            body = self.read_body()
            if body is None:
                return
            return self.post_asset(body)
        return self.send_json(404, {"error": "not found"})

    def do_DELETE(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        if not self.check_auth():
            return
        if path.startswith("/api/projects/"):
            return self.delete_project(sanitize_id(path[len("/api/projects/"):]))
        if path.startswith("/api/reviews/"):
            hard = urllib.parse.parse_qs(parsed.query).get("hard", ["0"])[0] == "1"
            return self.delete_review(path[len("/api/reviews/"):], hard=hard)
        return self.send_json(404, {"error": "not found"})

    # ---- 业务实现 ----

    def list_projects(self):
        items = []
        try:
            names = sorted(os.listdir(PROJECTS_DIR))
        except OSError:
            names = []
        for fn in names:
            if not fn.endswith(".json"):
                continue
            pid = fn[:-5]
            p = os.path.join(PROJECTS_DIR, fn)
            name = pid
            try:
                with open(p, "r", encoding="utf-8") as f:
                    data = json.load(f)
                if isinstance(data, dict) and data.get("name"):
                    name = str(data["name"])
            except Exception:
                pass
            items.append({"id": pid, "name": name,
                          "updatedAt": iso_mtime(os.path.getmtime(p))})
        self.send_json(200, {"projects": items})

    def get_project(self, pid):
        if not pid:
            return self.send_json(400, {"error": "invalid id"})
        path = os.path.join(PROJECTS_DIR, pid + ".json")
        if not os.path.isfile(path):
            return self.send_json(404, {"error": "project not found"})
        with open(path, "rb") as f:
            raw = f.read()
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        try:
            self.wfile.write(raw)
        except (BrokenPipeError, ConnectionResetError):
            pass

    def put_project(self, pid, body):
        if not pid:
            return self.send_json(400, {"error": "invalid id"})
        try:
            data = json.loads(body.decode("utf-8"))
        except Exception:
            return self.send_json(400, {"error": "invalid json"})
        if not isinstance(data, dict) or not data.get("name"):
            return self.send_json(400, {"error": "project json must contain name"})
        path = os.path.join(PROJECTS_DIR, pid + ".json")
        # 项目制分类：先读旧项目 JSON 取旧模型引用集，落盘后对差集做增删（先读后写，顺序不可反）
        old_hashes = []
        if os.path.isfile(path):
            try:
                with open(path, "r", encoding="utf-8") as f:
                    old_hashes = extract_model_hashes(json.load(f))
            except Exception:
                old_hashes = []
        name = str(data.get("name") or "")
        new_hashes = extract_model_hashes(data)
        atomic_write(path, json.dumps(data, ensure_ascii=False).encode("utf-8"))
        update_model_projects([h for h in old_hashes if h not in set(new_hashes)], pid, name, add=False)
        update_model_projects(new_hashes, pid, name, add=True)
        log("project saved: %s (%d bytes, %d model refs)" % (pid, len(body), len(new_hashes)))
        self.send_json(200, {"ok": True, "updatedAt": iso_mtime(os.path.getmtime(path))})

    def delete_project(self, pid):
        if not pid:
            return self.send_json(400, {"error": "invalid id"})
        path = os.path.join(PROJECTS_DIR, pid + ".json")
        if not os.path.isfile(path):
            return self.send_json(404, {"error": "project not found"})
        # 仅解除项目记录，不删除 GLB（模型按 hash 全局共享）；同时清理各模型的该项目分类引用
        hashes = []
        try:
            with open(path, "r", encoding="utf-8") as f:
                hashes = extract_model_hashes(json.load(f))
        except Exception:
            hashes = []
        with _file_lock:
            os.remove(path)
        update_model_projects(hashes, pid, "", add=False)
        log("project deleted: %s" % pid)
        self.send_json(200, {"ok": True})

    def post_model(self, body):
        h = hashlib.sha256(body).hexdigest()
        final = os.path.join(MODELS_DIR, h + ".glb")
        dedup = True
        with _file_lock:
            if os.path.exists(final):
                dedup = True
            else:
                tmp = final + ".tmp"
                with open(tmp, "wb") as f:
                    f.write(body)
                os.chmod(tmp, 0o644)
                os.replace(tmp, final)
                dedup = False
        # 文件名元数据（模型库清单用）：已存在则保留首次文件名；
        # 路径元数据（分类树用）：X-ModelQA-Path 合并进 paths 数组——dedup 命中也写回（存量补录依赖此行为）
        meta_path = os.path.join(MODELS_DIR, h + ".json")
        new_path = sanitize_path(self.headers.get("X-ModelQA-Path") or "")
        meta = None
        if os.path.exists(meta_path):
            try:
                with open(meta_path, "r", encoding="utf-8") as f:
                    meta = json.load(f)
            except Exception:
                meta = None
        created = meta is None
        if created:
            meta = {
                "fileName": sanitize_filename(self.headers.get("X-Model-Filename") or h[:12]),
                "size": len(body),
                "uploadedAt": time.strftime("%Y-%m-%dT%H:%M:%S"),
            }
        changed = False
        if new_path:
            paths = [p for p in (meta.get("paths") or []) if isinstance(p, str)]
            if new_path not in paths:
                paths.append(new_path)
                meta["paths"] = paths[-20:]   # 上限 20，超出淘汰最早
                changed = True
        if created or changed:
            atomic_write(meta_path, json.dumps(meta, ensure_ascii=False).encode("utf-8"))
        log("model uploaded: %s (%d bytes, dedup=%s, path=%s)" % (h[:12], len(body), dedup, new_path or "-"))
        self.send_json(200, {"hash": h, "url": "/data/models/%s.glb" % h, "dedup": dedup})

    def list_models(self):
        items = []
        try:
            names = sorted(os.listdir(MODELS_DIR))
        except OSError:
            names = []
        for fn in names:
            if not fn.endswith(".glb"):
                continue
            h = fn[:-4]
            path = os.path.join(MODELS_DIR, fn)
            file_name, size, paths, projects, uploaded_at = h[:12], os.path.getsize(path), [], [], ""
            try:
                with open(os.path.join(MODELS_DIR, h + ".json"), "r", encoding="utf-8") as f:
                    meta = json.load(f)
                file_name = str(meta.get("fileName") or file_name)
                size = int(meta.get("size") or size)
                uploaded_at = str(meta.get("uploadedAt") or "")
                paths = [p for p in (meta.get("paths") or []) if isinstance(p, str)]
                projects = [{"id": str(p.get("id") or ""), "name": str(p.get("name") or "")}
                            for p in (meta.get("projects") or []) if isinstance(p, dict) and p.get("id")]
            except Exception:
                pass
            items.append({"hash": h, "fileName": file_name, "size": size, "url": "/data/models/%s" % fn,
                          "uploadedAt": uploaded_at, "paths": paths, "projects": projects})
        self.send_json(200, {"models": items})

    def post_upload(self, body):
        """审核包上传：短 ID 落盘，原始文件名收进 sidecar 元数据（URL 与显示名解耦）。"""
        orig = sanitize_filename(self.headers.get("X-Filename") or "review")
        with _file_lock:
            candidate = new_review_id() + ".html"
            path = os.path.join(REVIEWS_DIR, candidate)
            with open(path, "wb") as f:
                f.write(body)
            os.chmod(path, 0o644)
        write_review_meta(candidate, name=orig, reviewed=False)
        url = "%s/reviews/%s" % (PUBLIC_ORIGIN, candidate)
        log("review uploaded: %s -> %s (%d bytes)" % (orig, candidate, len(body)))
        self.send_json(200, {"url": url})

    def post_asset(self, body):
        """在线预览外链模型上传（payload v4）：sha256 内容寻址落盘 reviews/assets/。

        请求头 X-Asset-SHA256 必须与请求体实际 sha256 一致（防错存/损坏）；
        已存在同名文件直接 dedup 返回（幂等，支持断点重试）。
        静态直出由 Nginx location /reviews/assets/ 承担（immutable 强缓存 + CORS）。
        文件不随 review 删除（内容寻址、多预览可共享）。
        """
        claimed = str(self.headers.get("X-Asset-SHA256") or "").strip().lower()
        if not re.fullmatch(r"[0-9a-f]{64}", claimed):
            return self.send_json(400, {"error": "missing/invalid X-Asset-SHA256"})
        actual = hashlib.sha256(body).hexdigest()
        if claimed != actual:
            return self.send_json(400, {"error": "sha256 mismatch (body %s != claimed %s)" % (actual[:12], claimed[:12])})
        final = os.path.join(REVIEWS_ASSETS_DIR, claimed + ".glb")
        dedup = True
        with _file_lock:
            if os.path.exists(final):
                dedup = True
            else:
                tmp = final + ".tmp"
                with open(tmp, "wb") as f:
                    f.write(body)
                os.chmod(tmp, 0o644)
                os.replace(tmp, final)
                dedup = False
        os.chmod(REVIEWS_ASSETS_DIR, 0o755)
        url = "%s/reviews/assets/%s.glb" % (PUBLIC_ORIGIN, claimed)
        log("asset uploaded: %s (%d bytes, dedup=%s)" % (claimed[:12], len(body), dedup))
        self.send_json(200, {"hash": claimed, "url": url, "dedup": dedup})

    # ---- 在线预览链接管理（P3）----

    def list_reviews(self):
        """列出 /reviews/ 顶层审核包。

        短 ID 文件读 sidecar meta 还原显示名与 reviewed；无 meta 的旧文件回退
        「存在对应 -已审 文件则 reviewed」的文件名推导（零迁移，旧长链接不受影响）。
        """
        entries = {}
        try:
            names = sorted(os.listdir(REVIEWS_DIR))
        except OSError:
            names = []
        for fn in names:
            if not fn.endswith(".html") or fn.startswith("_"):
                continue
            p = os.path.join(REVIEWS_DIR, fn)
            if not os.path.isfile(p):
                continue
            entries[fn] = {"size": os.path.getsize(p), "mtime": os.path.getmtime(p)}
        items = []
        for fn, info in entries.items():
            m = read_review_meta(fn)
            if m and isinstance(m, dict) and m.get("name"):
                name = str(m["name"])
                reviewed = bool(m.get("reviewed"))
            else:
                base = fn[:-5]
                name = fn
                reviewed = base.endswith(REVIEWED_SUFFIX) or (base + REVIEWED_SUFFIX + ".html") in entries
            items.append({
                "name": name,
                "size": info["size"],
                "uploadedAt": iso_mtime(info["mtime"]),
                "url": "%s/reviews/%s" % (PUBLIC_ORIGIN, urllib.parse.quote(fn)),
                "reviewed": reviewed,
            })
        items.sort(key=lambda x: x["uploadedAt"], reverse=True)
        self.send_json(200, {"reviews": items})

    def delete_review(self, raw, hard=False):
        """删除审核包：默认软删除——移入 reviews/_archive/ 可人工恢复；hard=True 彻底删除。

        彻底删除（?hard=1）把文件与 sidecar 元数据直接从磁盘移除（os.remove），不可恢复。

        <name> 兼容四种形态：短 ID 落盘名（R7kQ2x.html）、旧服务端落盘全名（中文名.html）、
        新服务端显示名（= sidecar meta 的 name）——meta name 两种形态：含 .html（submit 的
        「<原名>-已审.html」）与不含（upload 的 X-Filename 前端去掉过后缀）。落盘名未命中时按 meta 反查。
        短 ID 文件删除时把 <id>.meta.json 一并处理（软删移入 _archive/，硬删直接移除）。
        """
        name = sanitize_filename(raw)
        # 无 .html 结尾的显示名先补后缀尝试（upload meta name 即无后缀形态）
        candidates = [name] if name.endswith(".html") else [name + ".html", name]
        if all(not c.endswith(".html") for c in candidates):
            return self.send_json(400, {"error": "invalid filename"})
        src = None
        for cand in candidates:
            p = os.path.join(REVIEWS_DIR, cand)
            if os.path.isfile(p):
                src = p
                break
        if src is None:
            # 显示名回退：扫 sidecar meta 反查短 ID
            hit = None
            try:
                wanted = set(candidates)
                for fn in sorted(os.listdir(REVIEWS_DIR)):
                    if not fn.endswith(".meta.json"):
                        continue
                    m = read_review_meta(fn[:-len(".meta.json")] + ".html")
                    if isinstance(m, dict) and str(m.get("name") or "") in wanted:
                        hit = fn[:-len(".meta.json")] + ".html"
                        break
            except OSError:
                pass
            if not hit or not os.path.isfile(os.path.join(REVIEWS_DIR, hit)):
                return self.send_json(404, {"error": "review not found"})
            src = os.path.join(REVIEWS_DIR, hit)
        os.makedirs(REVIEWS_ARCHIVE_DIR, exist_ok=True)
        meta_p = review_meta_path(os.path.basename(src))
        with _file_lock:
            if hard:
                # 彻底删除：文件与 sidecar 元数据直接从磁盘移除，不可恢复
                os.remove(src)
                if meta_p and os.path.isfile(meta_p):
                    os.remove(meta_p)
            else:
                dst = os.path.join(REVIEWS_ARCHIVE_DIR, os.path.basename(src))
                if os.path.exists(dst):
                    os.remove(dst)
                os.rename(src, dst)
                if meta_p and os.path.isfile(meta_p):
                    dst_meta = os.path.join(REVIEWS_ARCHIVE_DIR, os.path.basename(meta_p))
                    if os.path.exists(dst_meta):
                        os.remove(dst_meta)
                    os.rename(meta_p, dst_meta)
        log("review deleted (%s): %s" % ("hard" if hard else "archived", os.path.basename(src)))
        self.send_json(200, {"ok": True})

    def post_submit(self, body):
        """审核端回传已审 HTML：短 ID 落盘，显示名 <原名>-已审.html 收进 sidecar（reviewed=true）。

        覆盖语义：落盘前把同基名的旧「已审」条目移入 _archive（软删可恢复），
        链接面板同项目只保留最新一条已审结果；未审核原链接不受影响。
        """
        raw = self.headers.get("X-Orig-Filename") or ""
        base = sanitize_filename(raw)
        if base.endswith(".html"):
            base = base[:-5]
        if base.endswith(REVIEWED_SUFFIX):
            base = base[: -len(REVIEWED_SUFFIX)]
        base = base[:54].strip("-._")
        if not base:
            base = "review-" + time.strftime("%Y%m%d-%H%M%S")
        display = base + REVIEWED_SUFFIX + ".html"
        with _file_lock:
            superseded = archive_superseded_reviewed(base)
            candidate = new_review_id() + ".html"
            path = os.path.join(REVIEWS_DIR, candidate)
            with open(path, "wb") as f:
                f.write(body)
            os.chmod(path, 0o644)
        write_review_meta(candidate, name=display, reviewed=True)
        if superseded:
            log("review superseded (archived): %s" % ", ".join(superseded))
        url = "%s/reviews/%s" % (PUBLIC_ORIGIN, candidate)
        log("review submitted: %s -> %s (%d bytes)" % (display, candidate, len(body)))
        self.send_json(200, {"ok": True, "url": url})


# ---------------------------------------------------------------- main

def main():
    for d in (PROJECTS_DIR, MODELS_DIR, REVIEWS_DIR, REVIEWS_ARCHIVE_DIR, REVIEWS_ASSETS_DIR):
        os.makedirs(d, exist_ok=True)
    load_config()
    if not TOKEN:
        print("FATAL: Token 未配置（%s）" % CONFIG_PATH, file=sys.stderr)
        sys.exit(1)
    if not SUBMIT_TOKEN:
        log("WARN: submitToken 未配置，审核端回传接口将始终 401")
    server = ThreadingHTTPServer(("127.0.0.1", 8445), Handler)
    server.daemon_threads = True
    log("service started on 127.0.0.1:8445")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
