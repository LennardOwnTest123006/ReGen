"""Assembles the unsigned ReGen APK.

usage: assemble.py <out.apk> <classes.dex> <assets-dir> <icon-dir>
                   <package> <versionCode> <versionName> <minSdk> <targetSdk>
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import arsc
import mkapk

DENSITIES = [
    ("mdpi", 160, 48),
    ("hdpi", 240, 72),
    ("xhdpi", 320, 96),
    ("xxhdpi", 480, 144),
    ("xxxhdpi", 640, 192),
]


def collect(root):
    """Every file under root, as (archive-relative path, bytes), sorted so the
    build is byte-for-byte reproducible."""
    out = []
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames.sort()
        for name in sorted(filenames):
            full = os.path.join(dirpath, name)
            rel = os.path.relpath(full, root).replace(os.sep, "/")
            with open(full, "rb") as f:
                out.append((rel, f.read()))
    return out


def main():
    (out_apk, dex_path, assets_dir, icon_dir, pkg,
     version_code, version_name, min_sdk, target_sdk) = sys.argv[1:10]
    version_code = int(version_code)
    min_sdk = int(min_sdk)
    target_sdk = int(target_sdk)

    manifest = mkapk.build_manifest(pkg, version_code, version_name, min_sdk, target_sdk)

    icon_entries = []
    for folder, density, px in DENSITIES:
        src = os.path.join(icon_dir, "icon-%d.png" % px)
        if not os.path.exists(src):
            raise SystemExit("missing icon: " + src)
        icon_entries.append((density, "res/mipmap-%s/ic_launcher.png" % folder, src))

    table = arsc.build(pkg, 0x7F, "mipmap",
                       [("ic_launcher", [(d, path) for d, path, _ in icon_entries])])

    apk = mkapk.ApkWriter(out_apk)
    # Order matters only for readability, but manifest-first matches aapt.
    apk.add("AndroidManifest.xml", manifest, method=mkapk.DEFLATE)

    with open(dex_path, "rb") as f:
        apk.add("classes.dex", f.read(), method=mkapk.DEFLATE)

    for _, arch_path, src in icon_entries:
        with open(src, "rb") as f:
            apk.add(arch_path, f.read(), method=mkapk.STORE, align=4)

    for rel, data in collect(assets_dir):
        apk.add("assets/" + rel, data)

    # resources.arsc must be stored uncompressed and 4-byte aligned for
    # Android 11 and above to accept the package.
    apk.add("resources.arsc", table, method=mkapk.STORE, align=4)
    apk.close()

    size = os.path.getsize(out_apk)
    print("unsigned apk: %s (%.2f MB)" % (out_apk, size / 1048576.0))
    print("  manifest %d bytes, resources.arsc %d bytes" % (len(manifest), len(table)))


if __name__ == "__main__":
    main()
