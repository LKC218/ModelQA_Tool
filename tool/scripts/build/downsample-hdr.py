"""降采样 Radiance RGBE .hdr，输出更小的离线环境贴图。"""
from __future__ import annotations

import argparse
import base64
import re
import struct
import sys
from pathlib import Path

import numpy as np


def decode_rgbe(data: bytes) -> tuple[np.ndarray, int, int]:
    if not data.startswith(b"#?RADIANCE") and not data.startswith(b"#?RGBE"):
        raise ValueError("not a Radiance HDR file")
    # 头部以空行结束，随后是分辨率行
    split = data.find(b"\n\n")
    if split < 0:
        raise ValueError("HDR header terminator not found")
    rest = data[split + 2 :]
    # 分辨率行可能带 \r
    nl = rest.find(b"\n")
    res = rest[:nl].decode("ascii", "replace").strip()
    body = rest[nl + 1 :]
    m = re.match(r"-Y\s+(\d+)\s+\+X\s+(\d+)$", res)
    if not m:
        raise ValueError(f"unsupported resolution line: {res!r}")
    height, width = int(m.group(1)), int(m.group(2))

    # 自适应 RLE：每条扫描线以 02 02 HH LL 开头
    if width >= 8 and width < 0x7FFF and len(body) >= 4 and body[0] == 2 and body[1] == 2 and body[2] == (width >> 8) & 0xFF and body[3] == width & 0xFF:
        pixels = np.zeros((height, width, 4), dtype=np.uint8)
        pos = 0
        for y in range(height):
            if body[pos] != 2 or body[pos + 1] != 2 or body[pos + 2] != (width >> 8) & 0xFF or body[pos + 3] != width & 0xFF:
                raise ValueError(f"bad RLE scanline header at y={y}")
            pos += 4
            for ch in range(4):
                x = 0
                while x < width:
                    count = body[pos]
                    pos += 1
                    if count > 128:  # run
                        count -= 128
                        val = body[pos]
                        pos += 1
                        pixels[y, x : x + count, ch] = val
                        x += count
                    else:  # dump
                        chunk = np.frombuffer(body[pos : pos + count], dtype=np.uint8)
                        pixels[y, x : x + count, ch] = chunk
                        pos += count
                        x += count
        return pixels, width, height

    # 旧格式：连续 RGBE
    need = width * height * 4
    raw = body[:need]
    if len(raw) < need:
        raise ValueError(f"truncated RGBE body: {len(raw)} < {need}")
    return np.frombuffer(raw, dtype=np.uint8).reshape(height, width, 4).copy(), width, height


def rgbe_to_float(pixels: np.ndarray) -> np.ndarray:
    out = pixels.astype(np.float32)
    exp = out[..., 3].astype(np.int32)
    # 2^(E-128-8)；E==0 视为黑像素
    scale = np.where(exp == 0, 0.0, np.exp2(exp.astype(np.float32) - 136.0))
    return out[..., :3] * scale[..., None]


def float_to_rgbe(rgb: np.ndarray) -> np.ndarray:
    h, w, _ = rgb.shape
    out = np.zeros((h, w, 4), dtype=np.uint8)
    m = np.max(np.abs(rgb), axis=2)
    nonzero = m > 1e-32
    exp = np.zeros((h, w), dtype=np.int32)
    frexp_exp = np.frexp(m[nonzero])[1] + 128
    exp[nonzero] = frexp_exp
    exp = np.clip(exp, 0, 255)
    scale = np.where(nonzero, np.exp2(128.0 - exp.astype(np.float32)) * 256.0, 0.0)
    out[..., 0] = np.clip(rgb[..., 0] * scale, 0, 255).astype(np.uint8)
    out[..., 1] = np.clip(rgb[..., 1] * scale, 0, 255).astype(np.uint8)
    out[..., 2] = np.clip(rgb[..., 2] * scale, 0, 255).astype(np.uint8)
    out[..., 3] = exp.astype(np.uint8)
    return out


def encode_rgbe_old(pixels: np.ndarray) -> bytes:
    header = b"#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n"
    h, w, _ = pixels.shape
    res = f"-Y {h} +X {w}\n".encode("ascii")
    # 旧格式：直接像素字节，RGBELoader 可读
    return header + res + pixels.reshape(-1, 4).tobytes()


def box_downsample(rgb: np.ndarray, tw: int, th: int) -> np.ndarray:
    h, w, _ = rgb.shape
    if tw == w and th == h:
        return rgb.astype(np.float32)
    # 区域平均，边界用最近像素补齐
    ys = (np.arange(th) * (h / th)).astype(np.int32)
    xs = (np.arange(tw) * (w / tw)).astype(np.int32)
    # 每个目标像素取源图小窗口均值
    out = np.zeros((th, tw, 3), dtype=np.float32)
    y0s = (np.arange(th) * h / th).astype(np.int32)
    y1s = np.maximum(y0s + 1, ((np.arange(th) + 1) * h / th).astype(np.int32))
    x0s = (np.arange(tw) * w / tw).astype(np.int32)
    x1s = np.maximum(x0s + 1, ((np.arange(tw) + 1) * w / tw).astype(np.int32))
    for yi in range(th):
        for xi in range(tw):
            out[yi, xi] = rgb[y0s[yi] : y1s[yi], x0s[xi] : x1s[xi]].mean(axis=(0, 1))
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("src")
    ap.add_argument("dst")
    ap.add_argument("--width", type=int, default=512)
    ap.add_argument("--height", type=int, default=256)
    args = ap.parse_args()

    src = Path(args.src)
    dst = Path(args.dst)
    raw = src.read_bytes()
    pixels, w, h = decode_rgbe(raw)
    rgb = rgbe_to_float(pixels)
    print(f"source: {src.name} {w}x{h} {len(raw)} bytes")
    small = box_downsample(rgb, args.width, args.height)
    encoded = encode_rgbe_old(float_to_rgbe(small))
    dst.parent.mkdir(parents=True, exist_ok=True)
    dst.write_bytes(encoded)
    b64 = base64.b64encode(encoded)
    print(f"output: {dst.name} {args.width}x{args.height} {len(encoded)} bytes")
    print(f"base64: {len(b64)} bytes ({len(b64) / 1024:.1f} KB)")
    # 验证可解码
    _, w2, h2 = decode_rgbe(dst.read_bytes())
    print(f"verify: decoded {w2}x{h2}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
