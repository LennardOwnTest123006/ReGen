"""Assembles an unsigned APK: binary manifest, resource table, dex, icons and
the game assets, written into a zip with the alignment Android requires.

Python's zipfile cannot control entry alignment, and resources.arsc must be
stored uncompressed on a 4-byte boundary for Android 11 and newer, so the
archive is written by hand.
"""
import os
import struct
import sys
import time
import zlib

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import axml
import arsc

STORE = 0
DEFLATE = 8

# Files that are already compressed, or that Android wants uncompressed.
STORE_EXT = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".ogg", ".mp3", ".arsc"}


def dos_time(ts):
    t = time.localtime(ts)
    if t.tm_year < 1980:
        t = time.localtime(315532800)
    dt = ((t.tm_year - 1980) << 9) | (t.tm_mon << 5) | t.tm_mday
    tm = (t.tm_hour << 11) | (t.tm_min << 5) | (t.tm_sec // 2)
    return tm, dt


class ApkWriter(object):
    def __init__(self, path):
        self.f = open(path, "wb")
        self.entries = []
        self.now = dos_time(time.time())

    def add(self, name, data, method=None, align=None):
        if method is None:
            ext = os.path.splitext(name)[1].lower()
            method = STORE if ext in STORE_EXT else DEFLATE
        if align is None:
            align = 4 if method == STORE else 1

        raw = data
        if method == DEFLATE:
            comp = zlib.compressobj(9, zlib.DEFLATED, -15)
            payload = comp.compress(raw) + comp.flush()
        else:
            payload = raw

        name_bytes = name.encode("utf-8")
        offset = self.f.tell()
        header_len = 30 + len(name_bytes)
        extra = b""
        if align > 1:
            pad = (align - ((offset + header_len) % align)) % align
            if pad:
                # a zero-length "extra field" of padding bytes; zipalign uses
                # the same trick, and every unzip implementation skips it
                extra = b"\x00" * pad

        crc = zlib.crc32(raw) & 0xFFFFFFFF
        self.f.write(struct.pack(
            "<IHHHHHIIIHH", 0x04034B50, 20, 0, method,
            self.now[0], self.now[1], crc, len(payload), len(raw),
            len(name_bytes), len(extra)))
        self.f.write(name_bytes)
        self.f.write(extra)
        self.f.write(payload)

        self.entries.append({
            "name": name_bytes, "method": method, "crc": crc,
            "csize": len(payload), "usize": len(raw), "offset": offset,
        })

    def close(self):
        cd_offset = self.f.tell()
        cd = bytearray()
        for e in self.entries:
            cd += struct.pack(
                "<IHHHHHHIIIHHHHHII", 0x02014B50, 20, 20, 0, e["method"],
                self.now[0], self.now[1], e["crc"], e["csize"], e["usize"],
                len(e["name"]), 0, 0, 0, 0, 0, e["offset"])
            cd += e["name"]
        self.f.write(cd)
        self.f.write(struct.pack(
            "<IHHHHIIH", 0x06054B50, 0, 0, len(self.entries), len(self.entries),
            len(cd), cd_offset, 0))
        self.f.close()


def build_manifest(pkg, version_code, version_name, min_sdk, target_sdk):
    A = axml.Attr
    E = axml.Element
    S, D, B, R = axml.TYPE_STRING, axml.TYPE_INT_DEC, axml.TYPE_INT_BOOLEAN, axml.TYPE_REFERENCE
    H = axml.TYPE_INT_HEX

    # orientation | screenSize | smallestScreenSize | keyboard(Hidden) |
    # screenLayout | uiMode | density | navigation | touchscreen |
    # layoutDirection | locale | fontScale
    CONFIG_CHANGES = 0x40003FFC
    SENSOR_LANDSCAPE = 6

    activity = E("activity", [
        A("name", S, pkg + ".MainActivity"),
        A("label", S, "ReGen"),
        A("exported", B, 0xFFFFFFFF),
        A("screenOrientation", D, SENSOR_LANDSCAPE),
        A("configChanges", H, CONFIG_CHANGES),
        A("resizeableActivity", B, 0),
        A("theme", R, 0x01030007),   # @android:style/Theme.NoTitleBar.Fullscreen
    ], [
        E("intent-filter", [], [
            E("action", [A("name", S, "android.intent.action.MAIN")]),
            E("category", [A("name", S, "android.intent.category.LAUNCHER")]),
        ])
    ])

    application = E("application", [
        A("label", S, "ReGen"),
        A("icon", R, 0x7F010000),
        A("roundIcon", R, 0x7F010000),
        A("allowBackup", B, 0xFFFFFFFF),
        A("supportsRtl", B, 0xFFFFFFFF),
        A("hardwareAccelerated", B, 0xFFFFFFFF),
        A("extractNativeLibs", B, 0),
        A("appCategory", D, 0),      # APPLICATION_CATEGORY_GAME
    ], [activity])

    manifest = E("manifest", [
        A("versionCode", D, version_code),
        A("versionName", S, version_name),
        A("compileSdkVersion", D, target_sdk),
        A("compileSdkVersionCodename", S, "14"),
        A("package", S, pkg, ns=None),
        A("platformBuildVersionCode", D, target_sdk, ns=None),
        A("platformBuildVersionName", S, "14", ns=None),
    ], [
        E("uses-sdk", [
            A("minSdkVersion", D, min_sdk),
            A("targetSdkVersion", D, target_sdk),
        ]),
        application,
    ])
    return axml.build(manifest)
