#!/usr/bin/env python3
import argparse
import os
from binascii import hexlify
from concurrent.futures import ThreadPoolExecutor, as_completed

# --- fast JSON (orjson if available) ---
try:
    import orjson as _json
    def json_loads(b: bytes):
        return _json.loads(b)
except Exception:
    import json as _json
    def json_loads(b: bytes):
        return _json.loads(b.decode("utf-8", errors="ignore"))

# --- keccak256 ---
try:
    from Crypto.Hash import keccak as _keccak
except Exception as e:
    raise SystemExit("Missing dependency: pip install pycryptodome") from e

def keccak256(data: bytes) -> bytes:
    # fastest form in pycryptodome
    return _keccak.new(digest_bits=256, data=data).digest()

# memoize signature->selector (huge speedup across many files)
_sig2sel = {}

def selector_of(signature: str) -> str:
    sel = _sig2sel.get(signature)
    if sel is not None:
        return sel
    h = keccak256(signature.encode("utf-8"))
    sel = "0x" + hexlify(h[:4]).decode()
    _sig2sel[signature] = sel
    return sel

def fn_signature(item: dict) -> str:
    name = item["name"]
    types = ",".join(inp["type"] for inp in item.get("inputs", []))
    return f"{name}({types})"

def extract_abi(obj):
    # plain ABI file: [ ... ]
    if isinstance(obj, list):
        return obj
    # hardhat/foundry style: {"abi":[...], ...}
    if isinstance(obj, dict) and isinstance(obj.get("abi"), list):
        return obj["abi"]
    return None

def iter_json_files_fast(root: str):
    # faster than pathlib.rglob for big trees
    stack = [root]
    while stack:
        path = stack.pop()
        try:
            with os.scandir(path) as it:
                for entry in it:
                    if entry.is_dir(follow_symlinks=False):
                        stack.append(entry.path)
                    elif entry.is_file(follow_symlinks=False) and entry.name.endswith(".json"):
                        yield entry.path
        except (FileNotFoundError, NotADirectoryError, PermissionError):
            continue

def parse_file(fp: str):
    try:
        with open(fp, "rb") as f:
            b = f.read()
        obj = json_loads(b)
        abi = extract_abi(obj)
        if not abi:
            return fp, None
        out = []
        for it in abi:
            if isinstance(it, dict) and it.get("type") == "function" and "name" in it:
                sig = fn_signature(it)
                sel = selector_of(sig).lower()
                out.append((sel, sig))
        return fp, out
    except Exception:
        return fp, None

def build_index(path: str, workers: int):
    sel_to = {}  # selector -> [(sig, file), ...]
    files = list(iter_json_files_fast(path))

    with ThreadPoolExecutor(max_workers=workers) as ex:
        futs = [ex.submit(parse_file, fp) for fp in files]
        for fut in as_completed(futs):
            fp, items = fut.result()
            if not items:
                continue
            for sel, sig in items:
                sel_to.setdefault(sel, []).append((sig, fp))
    return sel_to

def cmd_find(args):
    idx = build_index(args.path, args.workers)
    target = args.target.lower()
    hits = idx.get(target, [])
    print("Target selector:", target)
    if not hits:
        print("No matches found.")
        return
    print(f"Matches ({len(hits)}):")
    for sig, fp in hits:
        print("  -", sig)
        if args.show_files:
            print("    file:", fp)

def cmd_collisions(args):
    idx = build_index(args.path, args.workers)
    cols = {sel: entries for sel, entries in idx.items() if len(entries) > 1}
    if not cols:
        print("No duplicate selectors found.")
        return
    print("Duplicate selectors (collisions):")
    for sel in sorted(cols):
        print(sel)
        for sig, fp in cols[sel]:
            print("  -", sig)
            if args.show_files:
                print("    file:", fp)

def cmd_compat(args):
    old_idx = build_index(args.old, args.workers)
    new_idx = build_index(args.new, args.workers)

    missing = sorted(set(old_idx.keys()) - set(new_idx.keys()))
    if not missing:
        print("✅ Backward compatibility OK: all old selectors exist in new build.")
        return

    print("❌ Backward compatibility break: missing selectors in new build:")
    for sel in missing:
        print(sel)
        for sig, fp in old_idx.get(sel, []):
            print("  - was:", sig)
            if args.show_files:
                print("    file:", fp)

# --- Bruteforce selector finder ---
import itertools
import multiprocessing
import string

# Character set for suffix generation (alphanumeric)
CHARSET = string.ascii_letters + string.digits

def _bruteforce_worker(args_tuple):
    """Worker function for bruteforce search."""
    prefix, params, target_bytes, start_suffix, count = args_tuple

    # Local import for subprocess isolation
    from Crypto.Hash import keccak as _keccak

    def keccak256_fast(data: bytes) -> bytes:
        return _keccak.new(digest_bits=256, data=data).digest()

    params_bytes = params.encode('utf-8')
    prefix_bytes = prefix.encode('utf-8')

    # Generate suffixes starting from start_suffix
    for suffix_tuple in itertools.islice(
        itertools.product(CHARSET, repeat=len(start_suffix)),
        start_suffix, start_suffix + count
    ):
        suffix = ''.join(suffix_tuple)
        sig = prefix_bytes + suffix.encode('utf-8') + b'(' + params_bytes + b')'
        h = keccak256_fast(sig)
        if h[:4] == target_bytes:
            return prefix + suffix
    return None

def _bruteforce_length(prefix: str, params: str, target_bytes: bytes, length: int, workers: int):
    """Search all suffixes of a given length."""
    total = len(CHARSET) ** length
    chunk_size = max(1, total // (workers * 4))  # More chunks than workers for better load balancing

    tasks = []
    for start in range(0, total, chunk_size):
        count = min(chunk_size, total - start)
        # Convert start index to suffix tuple index
        tasks.append((prefix, params, target_bytes, start, count))

    with multiprocessing.Pool(workers) as pool:
        for result in pool.imap_unordered(_bruteforce_worker_indexed, tasks):
            if result is not None:
                pool.terminate()
                return result
    return None

def _bruteforce_worker_indexed(args_tuple):
    """Worker that uses index-based suffix generation."""
    prefix, params, target_bytes, start_idx, count = args_tuple

    from Crypto.Hash import keccak as _keccak

    def keccak256_fast(data: bytes) -> bytes:
        return _keccak.new(digest_bits=256, data=data).digest()

    params_bytes = params.encode('utf-8')
    prefix_bytes = prefix.encode('utf-8')
    charset_len = len(CHARSET)

    for idx in range(start_idx, start_idx + count):
        # Convert index to suffix string
        suffix_chars = []
        temp = idx
        # Determine suffix length from the index range
        # We need to figure out the length - use log or iterate
        # Actually, we'll compute length from total range
        length = 1
        total = charset_len
        remaining = idx
        while remaining >= total:
            remaining -= total
            length += 1
            total *= charset_len

        # Generate suffix of determined length
        temp = idx
        suffix_chars = []
        for _ in range(length):
            suffix_chars.append(CHARSET[temp % charset_len])
            temp //= charset_len
        suffix = ''.join(reversed(suffix_chars)) if suffix_chars else CHARSET[0]

        sig = prefix_bytes + suffix.encode('utf-8') + b'(' + params_bytes + b')'
        h = keccak256_fast(sig)
        if h[:4] == target_bytes:
            return prefix + suffix
    return None

def _bruteforce_simple(prefix: str, params: str, target_bytes: bytes, max_length: int, workers: int):
    """Simple bruteforce: try all suffix lengths sequentially."""
    from Crypto.Hash import keccak as _keccak

    def keccak256_fast(data: bytes) -> bytes:
        return _keccak.new(digest_bits=256, data=data).digest()

    params_bytes = params.encode('utf-8')
    prefix_bytes = prefix.encode('utf-8')
    charset = CHARSET

    for length in range(1, max_length + 1):
        total = len(charset) ** length
        print(f"  Trying length {length} ({total:,} combinations)...", end=" ", flush=True)

        found = None
        checked = 0

        for suffix_tuple in itertools.product(charset, repeat=length):
            suffix = ''.join(suffix_tuple)
            sig = prefix_bytes + suffix.encode('utf-8') + b'(' + params_bytes + b')'
            h = keccak256_fast(sig)
            checked += 1
            if h[:4] == target_bytes:
                found = prefix + suffix
                break

        if found:
            print(f"FOUND after {checked:,} checks!")
            return found
        print(f"not found")

    return None

def _worker_chunk(args):
    """Process a chunk of the search space."""
    prefix, params, target_bytes, length, start, end = args

    from Crypto.Hash import keccak as _keccak

    def keccak256_fast(data: bytes) -> bytes:
        return _keccak.new(digest_bits=256, data=data).digest()

    params_bytes = params.encode('utf-8')
    prefix_bytes = prefix.encode('utf-8')
    charset = CHARSET
    charset_len = len(charset)

    for idx in range(start, end):
        # Convert index to suffix
        temp = idx
        suffix_chars = []
        for _ in range(length):
            suffix_chars.append(charset[temp % charset_len])
            temp //= charset_len
        suffix = ''.join(reversed(suffix_chars))

        sig = prefix_bytes + suffix.encode('utf-8') + b'(' + params_bytes + b')'
        h = keccak256_fast(sig)
        if h[:4] == target_bytes:
            return prefix + suffix
    return None

def bruteforce_parallel(prefix: str, params: str, target_bytes: bytes, max_length: int, workers: int):
    """Parallel bruteforce search."""
    charset_len = len(CHARSET)

    for length in range(1, max_length + 1):
        total = charset_len ** length
        print(f"  Trying length {length} ({total:,} combinations)...", end=" ", flush=True)

        # For small search spaces, don't bother with multiprocessing
        if total < 10000:
            result = _worker_chunk((prefix, params, target_bytes, length, 0, total))
            if result:
                print(f"FOUND!")
                return result
            print("not found")
            continue

        # Chunk the work
        chunk_size = max(10000, total // (workers * 8))
        tasks = []
        for start in range(0, total, chunk_size):
            end = min(start + chunk_size, total)
            tasks.append((prefix, params, target_bytes, length, start, end))

        found = None
        with multiprocessing.Pool(workers) as pool:
            for result in pool.imap_unordered(_worker_chunk, tasks):
                if result is not None:
                    found = result
                    pool.terminate()
                    break

        if found:
            print(f"FOUND!")
            return found
        print("not found")

    return None

def cmd_bruteforce(args):
    target = args.target.lower()
    if target.startswith("0x"):
        target = target[2:]
    target_bytes = bytes.fromhex(target)

    prefix = args.prefix
    params = args.params
    max_len = args.max_length
    workers = args.workers

    print(f"Target selector: 0x{target}")
    print(f"Function prefix: {prefix}")
    print(f"Parameters: ({params})")
    print(f"Max suffix length: {max_len}")
    print(f"Workers: {workers}")
    print()

    result = bruteforce_parallel(prefix, params, target_bytes, max_len, workers)

    if result:
        full_sig = f"{result}({params})"
        print()
        print(f"✅ Found: {result}")
        print(f"   Signature: {full_sig}")
        print(f"   Selector: 0x{target}")
    else:
        print()
        print(f"❌ No match found within suffix length {max_len}")

def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)

    def add_workers(p):
        # IO-bound; threads help. Good default on mac.
        p.add_argument("--workers", type=int, default=min(32, (os.cpu_count() or 8) * 4))

    p1 = sub.add_parser("find", help="Find functions matching a selector")
    p1.add_argument("--path", required=True)
    p1.add_argument("--target", required=True, help="e.g. 0x23b872dd")
    p1.add_argument("--show-files", action="store_true")
    add_workers(p1)
    p1.set_defaults(func=cmd_find)

    p2 = sub.add_parser("collisions", help="Show duplicate selectors")
    p2.add_argument("--path", required=True)
    p2.add_argument("--show-files", action="store_true")
    add_workers(p2)
    p2.set_defaults(func=cmd_collisions)

    p3 = sub.add_parser("compat", help="Check old selectors exist in new build")
    p3.add_argument("--old", required=True)
    p3.add_argument("--new", required=True)
    p3.add_argument("--show-files", action="store_true")
    add_workers(p3)
    p3.set_defaults(func=cmd_compat)

    p4 = sub.add_parser("bruteforce", help="Find function name matching target selector")
    p4.add_argument("--target", required=True, help="Target selector, e.g. 0x23b872dd")
    p4.add_argument("--params", required=True, help="Parameter types, e.g. 'address,address,uint256'")
    p4.add_argument("--prefix", default="func_", help="Function name prefix (default: func_)")
    p4.add_argument("--max-length", type=int, default=8, help="Max suffix length to try (default: 8)")
    p4.add_argument("--workers", type=int, default=max(1, os.cpu_count() or 4), help="Number of parallel workers")
    p4.set_defaults(func=cmd_bruteforce)

    args = ap.parse_args()
    args.func(args)

if __name__ == "__main__":
    main()
