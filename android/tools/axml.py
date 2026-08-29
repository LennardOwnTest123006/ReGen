"""Binary AndroidManifest.xml (AXML) writer.

Android does not accept a text manifest inside an APK; it wants the compiled
binary XML that aapt normally produces. This module builds that format
directly, which is what lets ReGen produce an APK without the Android SDK.

Format reference: frameworks/base ResourceTypes.h.
"""
import struct

RES_STRING_POOL_TYPE = 0x0001
RES_XML_TYPE = 0x0003
RES_XML_START_NAMESPACE_TYPE = 0x0100
RES_XML_END_NAMESPACE_TYPE = 0x0101
RES_XML_START_ELEMENT_TYPE = 0x0102
RES_XML_END_ELEMENT_TYPE = 0x0103
RES_XML_RESOURCE_MAP_TYPE = 0x0180

TYPE_REFERENCE = 0x01
TYPE_STRING = 0x03
TYPE_INT_DEC = 0x10
TYPE_INT_HEX = 0x11
TYPE_INT_BOOLEAN = 0x12

ANDROID_NS = "http://schemas.android.com/apk/res/android"

# Framework attribute resource ids used by the manifest.
ATTR_IDS = {
    "theme": 0x01010000,
    "label": 0x01010001,
    "icon": 0x01010002,
    "name": 0x01010003,
    "debuggable": 0x0101000F,
    "exported": 0x01010010,
    "launchMode": 0x0101001D,
    "screenOrientation": 0x0101001E,
    "configChanges": 0x0101001F,
    "minSdkVersion": 0x0101020C,
    "versionCode": 0x0101021B,
    "versionName": 0x0101021C,
    "targetSdkVersion": 0x01010270,
    "allowBackup": 0x01010280,
    "hardwareAccelerated": 0x010102D3,
    "supportsRtl": 0x010103AF,
    "roundIcon": 0x0101052C,
    "appCategory": 0x01010545,
    "compileSdkVersion": 0x01010572,
    "compileSdkVersionCodename": 0x01010573,
    "extractNativeLibs": 0x010104EA,
    "resizeableActivity": 0x010104F6,
    "isGame": 0x10103F4,
}


class StringPool(object):
    """UTF-16 string pool. Attribute names must be added first and in the same
    order as the resource-map ids that follow them."""

    def __init__(self):
        self.strings = []
        self.index = {}

    def add(self, s):
        if s is None:
            return -1
        if s in self.index:
            return self.index[s]
        self.index[s] = len(self.strings)
        self.strings.append(s)
        return self.index[s]

    def build(self):
        offsets = []
        data = bytearray()
        for s in self.strings:
            offsets.append(len(data))
            encoded = s.encode("utf-16-le")
            n = len(encoded) // 2
            if n > 0x7FFF:
                raise ValueError("string too long for the pool: %r" % s[:40])
            data += struct.pack("<H", n) + encoded + b"\x00\x00"
        while len(data) % 4:
            data += b"\x00"

        header_size = 28
        strings_start = header_size + 4 * len(offsets)
        size = strings_start + len(data)
        out = bytearray()
        out += struct.pack("<HHI", RES_STRING_POOL_TYPE, header_size, size)
        out += struct.pack("<IIIII", len(offsets), 0, 0, strings_start, 0)
        for o in offsets:
            out += struct.pack("<I", o)
        out += data
        return bytes(out)


class Attr(object):
    def __init__(self, name, value_type, value, raw=None, ns=ANDROID_NS):
        self.name = name
        self.type = value_type
        self.value = value
        self.raw = raw
        self.ns = ns


class Element(object):
    def __init__(self, name, attrs=None, children=None):
        self.name = name
        self.attrs = attrs or []
        self.children = children or []


def _sorted_attrs(attrs):
    """aapt emits android-namespaced attributes ordered by resource id, then
    any attribute that has no id. The framework's styled-attribute lookup
    relies on that ordering."""
    withid = [a for a in attrs if a.ns == ANDROID_NS]
    withid.sort(key=lambda a: ATTR_IDS[a.name])
    plain = [a for a in attrs if a.ns != ANDROID_NS]
    return withid + plain


def build(root):
    pool = StringPool()

    # 1. every android attribute name, ordered by resource id: these must
    #    occupy the first slots of the pool to match the resource map.
    used = set()

    def collect(el):
        for a in el.attrs:
            if a.ns == ANDROID_NS:
                used.add(a.name)
        for c in el.children:
            collect(c)

    collect(root)
    attr_names = sorted(used, key=lambda n: ATTR_IDS[n])
    for n in attr_names:
        pool.add(n)
    res_map = [ATTR_IDS[n] for n in attr_names]

    # 2. everything else
    pool.add("android")
    pool.add(ANDROID_NS)

    def collect2(el):
        pool.add(el.name)
        for a in el.attrs:
            if a.ns != ANDROID_NS:
                pool.add(a.name)
            if a.type == TYPE_STRING:
                pool.add(a.value)
            elif a.raw is not None:
                pool.add(a.raw)
        for c in el.children:
            collect2(c)

    collect2(root)

    ns_prefix = pool.index["android"]
    ns_uri = pool.index[ANDROID_NS]

    body = bytearray()

    def node(chunk_type, ext, header_size=16):
        size = header_size + len(ext)
        return struct.pack("<HHIIi", chunk_type, header_size, size, 1, -1) + ext

    body += node(RES_XML_START_NAMESPACE_TYPE, struct.pack("<II", ns_prefix, ns_uri))

    def emit(el):
        out = bytearray()
        attrs = _sorted_attrs(el.attrs)
        ext = bytearray()
        ext += struct.pack("<iI", -1, pool.index[el.name])
        ext += struct.pack("<HHHHHH", 20, 20, len(attrs), 0, 0, 0)
        for a in attrs:
            ns = ns_uri if a.ns == ANDROID_NS else -1
            name_idx = pool.index[a.name]
            if a.type == TYPE_STRING:
                raw = pool.index[a.value]
                data = raw
            else:
                raw = pool.index[a.raw] if a.raw is not None else -1
                data = a.value & 0xFFFFFFFF
            ext += struct.pack("<iIi", ns, name_idx, raw)
            ext += struct.pack("<HBBI", 8, 0, a.type, data)
        out += node(RES_XML_START_ELEMENT_TYPE, bytes(ext))
        for c in el.children:
            out += emit(c)
        out += node(RES_XML_END_ELEMENT_TYPE, struct.pack("<iI", -1, pool.index[el.name]))
        return out

    body += emit(root)
    body += node(RES_XML_END_NAMESPACE_TYPE, struct.pack("<II", ns_prefix, ns_uri))

    pool_bytes = pool.build()
    map_size = 8 + 4 * len(res_map)
    map_bytes = struct.pack("<HHI", RES_XML_RESOURCE_MAP_TYPE, 8, map_size)
    map_bytes += b"".join(struct.pack("<I", r) for r in res_map)

    total = 8 + len(pool_bytes) + len(map_bytes) + len(body)
    return struct.pack("<HHI", RES_XML_TYPE, 8, total) + pool_bytes + map_bytes + bytes(body)
