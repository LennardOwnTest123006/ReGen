"""Minimal resources.arsc writer.

Android resolves android:icon through the resource table, so an APK with a
launcher icon needs a real compiled table even if it contains a single
drawable. This builds one: package 0x7f, type "mipmap", key "ic_launcher",
with a density-qualified entry per bitmap so launchers pick the right size.

Format reference: frameworks/base ResourceTypes.h.
"""
import struct

RES_STRING_POOL_TYPE = 0x0001
RES_TABLE_TYPE = 0x0002
RES_TABLE_PACKAGE_TYPE = 0x0200
RES_TABLE_TYPE_TYPE = 0x0201
RES_TABLE_TYPE_SPEC_TYPE = 0x0202

TYPE_STRING = 0x03
CONFIG_SIZE = 48


def _string_pool(strings):
    offsets = []
    data = bytearray()
    for s in strings:
        offsets.append(len(data))
        enc = s.encode("utf-16-le")
        n = len(enc) // 2
        if n > 0x7FFF:
            raise ValueError("string too long for the pool")
        data += struct.pack("<H", n) + enc + b"\x00\x00"
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


def _config(density=0, sdk=0):
    """A default ResTable_config with only the density (and optionally the
    sdk) qualifier set. Everything else zero means "matches anything"."""
    c = bytearray(CONFIG_SIZE)
    struct.pack_into("<I", c, 0, CONFIG_SIZE)
    struct.pack_into("<H", c, 14, density)   # screenType.density
    struct.pack_into("<H", c, 24, sdk)       # version.sdkVersion
    return bytes(c)


def build(package_name, package_id, type_name, entries):
    """entries: list of (key_name, [(density, value_string), ...])

    All entries must declare the same set of densities, which is the normal
    case for a launcher icon."""
    if not entries:
        raise ValueError("a resource table needs at least one entry")

    keys = [e[0] for e in entries]
    densities = [d for d, _ in entries[0][1]]
    for name, variants in entries:
        if [d for d, _ in variants] != densities:
            raise ValueError("every entry must define the same densities")

    # global value pool: the file paths the entries point at
    values = []
    value_index = {}
    for _, variants in entries:
        for _, v in variants:
            if v not in value_index:
                value_index[v] = len(values)
                values.append(v)

    global_pool = _string_pool(values)
    type_pool = _string_pool([type_name])
    key_pool = _string_pool(keys)

    entry_count = len(entries)

    # type spec: one flags word per entry
    spec = bytearray()
    spec += struct.pack("<HHI", RES_TABLE_TYPE_SPEC_TYPE, 16, 16 + 4 * entry_count)
    spec += struct.pack("<BBHI", 1, 0, 0, entry_count)
    for _ in range(entry_count):
        spec += struct.pack("<I", 0)

    type_chunks = bytearray()
    for di, density in enumerate(densities):
        body = bytearray()
        offsets = []
        for key_idx, (_, variants) in enumerate(entries):
            offsets.append(len(body))
            # ResTable_entry
            body += struct.pack("<HHI", 8, 0, key_idx)
            # Res_value: a string pointing at the packaged file
            body += struct.pack("<HBBI", 8, 0, TYPE_STRING, value_index[variants[di][1]])
        header_size = 20 + CONFIG_SIZE
        entries_start = header_size + 4 * entry_count
        size = entries_start + len(body)
        chunk = bytearray()
        chunk += struct.pack("<HHI", RES_TABLE_TYPE_TYPE, header_size, size)
        chunk += struct.pack("<BBHII", 1, 0, 0, entry_count, entries_start)
        chunk += _config(density)
        for o in offsets:
            chunk += struct.pack("<I", o)
        chunk += body
        type_chunks += chunk

    pkg_header_size = 288
    type_strings_off = pkg_header_size
    key_strings_off = pkg_header_size + len(type_pool)
    pkg_size = pkg_header_size + len(type_pool) + len(key_pool) + len(spec) + len(type_chunks)

    name_utf16 = package_name.encode("utf-16-le")[:254]
    name_field = name_utf16 + b"\x00" * (256 - len(name_utf16))

    pkg = bytearray()
    pkg += struct.pack("<HHI", RES_TABLE_PACKAGE_TYPE, pkg_header_size, pkg_size)
    pkg += struct.pack("<I", package_id)
    pkg += name_field
    pkg += struct.pack("<IIIII", type_strings_off, 1, key_strings_off, len(keys), 0)
    pkg += type_pool
    pkg += key_pool
    pkg += spec
    pkg += type_chunks

    total = 12 + len(global_pool) + len(pkg)
    out = bytearray()
    out += struct.pack("<HHI", RES_TABLE_TYPE, 12, total)
    out += struct.pack("<I", 1)
    out += global_pool
    out += pkg
    return bytes(out)
