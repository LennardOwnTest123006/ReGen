"""Structural verification of a built APK.

Checks the things that make the difference between an APK Android installs
and one it silently rejects: required entries, the storage/alignment rules
for resources.arsc, dex and zip validity, a v1 signature, and a full decode
of the binary manifest back into readable XML.
"""
import os
import struct
import sys
import zipfile

REQUIRED = [
    "AndroidManifest.xml",
    "classes.dex",
    "resources.arsc",
    "assets/game/index.html",
    "assets/game/style.css",
    "res/mipmap-mdpi/ic_launcher.png",
    "res/mipmap-xxxhdpi/ic_launcher.png",
]

ATTR_NAMES = {}


def decode_pool(data, off):
    t, header_size, size = struct.unpack_from("<HHI", data, off)
    count, style_count, flags, strings_start, styles_start = struct.unpack_from("<IIIII", data, off + 8)
    utf8 = bool(flags & (1 << 8))
    offsets = struct.unpack_from("<%dI" % count, data, off + header_size)
    base = off + strings_start
    out = []
    for o in offsets:
        p = base + o
        if utf8:
            n = data[p]
            p += 1
            if n & 0x80:
                n = ((n & 0x7F) << 8) | data[p]; p += 1
            m = data[p]; p += 1
            if m & 0x80:
                m = ((m & 0x7F) << 8) | data[p]; p += 1
            out.append(data[p:p + m].decode("utf-8", "replace"))
        else:
            n = struct.unpack_from("<H", data, p)[0]
            p += 2
            if n & 0x8000:
                n = ((n & 0x7FFF) << 16) | struct.unpack_from("<H", data, p)[0]; p += 2
            out.append(data[p:p + n * 2].decode("utf-16-le", "replace"))
    return out, size


def fmt_value(vtype, data, strings):
    if vtype == 0x03:
        return '"%s"' % strings[data]
    if vtype == 0x01:
        return "@0x%08x" % data
    if vtype == 0x12:
        return "true" if data else "false"
    if vtype == 0x11:
        return "0x%08x" % data
    if vtype == 0x10:
        return str(struct.unpack("<i", struct.pack("<I", data))[0])
    return "0x%08x(type %d)" % (data, vtype)


def decode_axml(data):
    """Returns the manifest as indented text."""
    t, hs, total = struct.unpack_from("<HHI", data, 0)
    if t != 0x0003:
        raise ValueError("not a binary XML document (type 0x%04x)" % t)
    if total != len(data):
        raise ValueError("declared size %d, actual %d" % (total, len(data)))
    off = 8
    strings, pool_size = decode_pool(data, off)
    off += pool_size
    resmap = []
    lines = []
    depth = 0
    while off < len(data):
        ctype, chdr, csize = struct.unpack_from("<HHI", data, off)
        if csize <= 0:
            raise ValueError("zero-size chunk at %d" % off)
        if ctype == 0x0180:
            n = (csize - 8) // 4
            resmap = list(struct.unpack_from("<%dI" % n, data, off + 8))
        elif ctype == 0x0102:
            ns, name, astart, asize, acount, idi, cli, sti = struct.unpack_from("<iIHHHHHH", data, off + 16)
            attrs = []
            ap = off + 16 + 20
            for i in range(acount):
                a_ns, a_name, a_raw = struct.unpack_from("<iIi", data, ap)
                vsize, res0, vtype, vdata = struct.unpack_from("<HBBI", data, ap + 12)
                prefix = "android:" if a_ns >= 0 else ""
                attrs.append("%s%s=%s" % (prefix, strings[a_name], fmt_value(vtype, vdata, strings)))
                ap += 20
            lines.append("  " * depth + "<" + strings[name] +
                         ("".join(" " + a for a in attrs)) + ">")
            depth += 1
        elif ctype == 0x0103:
            depth -= 1
            ns, name = struct.unpack_from("<iI", data, off + 16)
            lines.append("  " * depth + "</" + strings[name] + ">")
        off += csize
    if depth != 0:
        raise ValueError("unbalanced elements (depth %d at end)" % depth)
    return "\n".join(lines), resmap, strings


def decode_arsc(data):
    """Returns {resource id: [value strings]} for the single package we emit."""
    t, hs, total = struct.unpack_from("<HHI", data, 0)
    if t != 0x0002:
        raise ValueError("resources.arsc is not a resource table")
    if total != len(data):
        raise ValueError("arsc declared size %d, actual %d" % (total, len(data)))
    pkg_count = struct.unpack_from("<I", data, 8)[0]
    off = hs
    values, pool_size = decode_pool(data, off)
    off += pool_size

    ptype, phdr, psize = struct.unpack_from("<HHI", data, off)
    if ptype != 0x0200:
        raise ValueError("expected a package chunk, got 0x%04x" % ptype)
    pkg_id = struct.unpack_from("<I", data, off + 8)[0]
    name = data[off + 12:off + 12 + 256].decode("utf-16-le").split("\x00")[0]
    type_off, last_type, key_off, last_key, _ = struct.unpack_from("<IIIII", data, off + 268)
    types, _ = decode_pool(data, off + type_off)
    keys, _ = decode_pool(data, off + key_off)

    found = {}
    p = off + phdr
    end = off + psize
    while p < end:
        ctype, chdr, csize = struct.unpack_from("<HHI", data, p)
        if ctype == 0x0201:
            tid, res0, res1, entry_count, entries_start = struct.unpack_from("<BBHII", data, p + 8)
            density = struct.unpack_from("<H", data, p + 20 + 14)[0]
            offsets = struct.unpack_from("<%dI" % entry_count, data, p + chdr)
            for i, eo in enumerate(offsets):
                if eo == 0xFFFFFFFF:
                    continue
                ep = p + entries_start + eo
                esize, eflags, ekey = struct.unpack_from("<HHI", data, ep)
                vsize, vres0, vtype, vdata = struct.unpack_from("<HBBI", data, ep + esize)
                rid = (pkg_id << 24) | (tid << 16) | i
                found.setdefault(rid, []).append(
                    (types[tid - 1], keys[ekey], density, values[vdata] if vtype == 0x03 else vdata))
        p += csize
    return name, pkg_id, found


def main():
    apk = sys.argv[1]
    problems = []
    with zipfile.ZipFile(apk) as z:
        bad = z.testzip()
        if bad:
            problems.append("corrupt zip entry: " + bad)
        names = z.namelist()
        for r in REQUIRED:
            if r not in names:
                problems.append("missing entry: " + r)

        info = {i.filename: i for i in z.infolist()}
        arsc_info = info.get("resources.arsc")
        if arsc_info:
            if arsc_info.compress_type != zipfile.ZIP_STORED:
                problems.append("resources.arsc must be stored uncompressed")
            if arsc_info.header_offset is not None:
                z.fp.seek(arsc_info.header_offset + 26)
                nlen, elen = struct.unpack("<HH", z.fp.read(4))
                data_off = arsc_info.header_offset + 30 + nlen + elen
                if data_off % 4 != 0:
                    problems.append("resources.arsc is not 4-byte aligned (offset %d)" % data_off)
                else:
                    print("resources.arsc: stored, aligned at offset %d" % data_off)

        dex = z.read("classes.dex") if "classes.dex" in names else b""
        if not dex.startswith(b"dex\n"):
            problems.append("classes.dex has a bad magic header")
        else:
            print("classes.dex: %s, %d bytes" % (dex[:7].decode("ascii", "replace").strip(), len(dex)))

        sig = [n for n in names if n.startswith("META-INF/") and n.endswith((".RSA", ".DSA", ".EC"))]
        mf = [n for n in names if n == "META-INF/MANIFEST.MF"]
        if not sig or not mf:
            problems.append("no v1 (JAR) signature found")
        else:
            print("v1 signature: %s" % sig[0])

        manifest_xml, resmap, strings = decode_axml(z.read("AndroidManifest.xml"))
        print("--- AndroidManifest.xml (decoded) ---")
        print(manifest_xml)
        print("--- end manifest ---")

        pkg_name, pkg_id, res = decode_arsc(z.read("resources.arsc"))
        print("resource package: %s (0x%02x)" % (pkg_name, pkg_id))
        for rid, variants in sorted(res.items()):
            print("  0x%08x %s/%s" % (rid, variants[0][0], variants[0][1]))
            for tname, key, density, value in variants:
                print("    density %-4d -> %s" % (density, value))
                if value not in names:
                    problems.append("resource points at a missing file: " + str(value))

        icon_ref = None
        for line in manifest_xml.split("\n"):
            if "android:icon=@" in line:
                icon_ref = int(line.split("android:icon=@")[1].split()[0].rstrip(">"), 16)
                break
        if icon_ref is None:
            problems.append("the manifest declares no android:icon")
        elif icon_ref not in res:
            problems.append("android:icon=0x%08x is not present in resources.arsc" % icon_ref)
        else:
            print("android:icon 0x%08x resolves inside the table" % icon_ref)

        assets = [n for n in names if n.startswith("assets/game/")]
        print("assets: %d files under assets/game/" % len(assets))
        if len(assets) < 15:
            problems.append("only %d game assets were packaged" % len(assets))

    if problems:
        print("\nVERIFICATION FAILED:")
        for p in problems:
            print("  - " + p)
        sys.exit(1)
    print("\nAPK structure verified.")


if __name__ == "__main__":
    main()
