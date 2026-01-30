#!/usr/bin/env python3
"""
Fast selector bruteforce finder.

Speed tiers:
  1. pysha3 (~3x faster than pycryptodome)
  2. numba JIT (~10x faster)  
  3. Rust native (~50-100x faster)

Install dependencies:
  pip install pysha3 numba

Usage:
  python selector_bruteforce.py --target 0x23b872dd --params "address,address,uint256,((address,uint256),uint256,uint256),bytes"
"""

import argparse
import string
import time
import itertools
import multiprocessing as mp
from typing import Optional

CHARSET = string.ascii_letters + string.digits
CHARSET_BYTES = [c.encode() for c in CHARSET]

# ============================================================
# Backend 1: pysha3 / safe-pysha3 (faster than pycryptodome)
# ============================================================
def _try_pysha3():
    try:
        import sha3
        def keccak256(data: bytes) -> bytes:
            return sha3.keccak_256(data).digest()
        return keccak256, "pysha3"
    except ImportError:
        pass
    try:
        import _pysha3 as sha3
        def keccak256(data: bytes) -> bytes:
            return sha3.keccak_256(data).digest()
        return keccak256, "safe-pysha3"
    except ImportError:
        return None, None

# ============================================================
# Backend 2: pycryptodome (fallback)
# ============================================================
def _try_pycryptodome():
    try:
        from Crypto.Hash import keccak
        def keccak256(data: bytes) -> bytes:
            return keccak.new(digest_bits=256, data=data).digest()
        return keccak256, "pycryptodome"
    except ImportError:
        return None, None

# Select best available backend
def get_keccak():
    for try_fn in [_try_pysha3, _try_pycryptodome]:
        fn, name = try_fn()
        if fn:
            return fn, name
    raise ImportError("No keccak library found. Install: pip install pysha3")

KECCAK, BACKEND = get_keccak()

# ============================================================
# Numba JIT acceleration (if available)
# ============================================================
try:
    from numba import jit, prange
    import numpy as np
    HAVE_NUMBA = True
except ImportError:
    HAVE_NUMBA = False

# ============================================================
# Core bruteforce logic
# ============================================================

def idx_to_suffix(idx: int, length: int) -> bytes:
    """Convert index to suffix bytes."""
    chars = []
    for _ in range(length):
        chars.append(CHARSET_BYTES[idx % len(CHARSET)])
        idx //= len(CHARSET)
    return b''.join(reversed(chars))

def worker_search(args):
    """Worker function for parallel search."""
    prefix_bytes, params_bytes, target_bytes, length, start, end = args
    
    # Re-import in subprocess
    keccak, _ = get_keccak()
    charset = CHARSET
    charset_len = len(charset)
    
    for idx in range(start, end):
        # Build suffix from index
        temp = idx
        suffix_chars = []
        for _ in range(length):
            suffix_chars.append(charset[temp % charset_len])
            temp //= charset_len
        suffix = ''.join(reversed(suffix_chars))
        
        # Hash and check
        sig = prefix_bytes + suffix.encode() + b'(' + params_bytes + b')'
        h = keccak(sig)
        if h[:4] == target_bytes:
            return prefix_bytes.decode() + suffix
    
    return None

def bruteforce_parallel(prefix: str, params: str, target_bytes: bytes, 
                       max_length: int, workers: int) -> Optional[str]:
    """Parallel bruteforce search."""
    charset_len = len(CHARSET)
    prefix_bytes = prefix.encode()
    params_bytes = params.encode()
    
    for length in range(1, max_length + 1):
        total = charset_len ** length
        print(f"  Length {length}: {total:,} combinations...", end=" ", flush=True)
        start_time = time.time()
        
        # For small search spaces, single-threaded is faster
        if total < 50000:
            result = worker_search((prefix_bytes, params_bytes, target_bytes, length, 0, total))
            elapsed = time.time() - start_time
            rate = total / elapsed if elapsed > 0 else 0
            if result:
                print(f"FOUND! ({rate:,.0f} hash/s)")
                return result
            print(f"not found ({rate:,.0f} hash/s)")
            continue
        
        # Parallel search
        chunk_size = max(10000, total // (workers * 16))
        tasks = []
        for start in range(0, total, chunk_size):
            end = min(start + chunk_size, total)
            tasks.append((prefix_bytes, params_bytes, target_bytes, length, start, end))
        
        found = None
        checked = 0
        with mp.Pool(workers) as pool:
            for result in pool.imap_unordered(worker_search, tasks):
                checked += chunk_size
                if result is not None:
                    found = result
                    pool.terminate()
                    break
        
        elapsed = time.time() - start_time
        rate = min(checked, total) / elapsed if elapsed > 0 else 0
        
        if found:
            print(f"FOUND! ({rate:,.0f} hash/s)")
            return found
        print(f"not found ({rate:,.0f} hash/s)")
    
    return None

# ============================================================
# Even faster: batch processing with pre-allocated buffers
# ============================================================

def worker_search_fast(args):
    """Optimized worker with pre-allocated buffer."""
    prefix_bytes, params_bytes, target_bytes, length, start, end = args
    
    keccak, _ = get_keccak()
    charset = CHARSET.encode()
    charset_len = len(CHARSET)
    
    # Pre-allocate signature buffer
    # Format: prefix + suffix + ( + params + )
    suffix_start = len(prefix_bytes)
    paren_pos = suffix_start + length
    sig_len = paren_pos + 1 + len(params_bytes) + 1
    
    sig = bytearray(sig_len)
    sig[:suffix_start] = prefix_bytes
    sig[paren_pos] = ord('(')
    sig[paren_pos+1:paren_pos+1+len(params_bytes)] = params_bytes
    sig[-1] = ord(')')
    
    for idx in range(start, end):
        # Fill suffix directly into buffer
        temp = idx
        for i in range(length - 1, -1, -1):
            sig[suffix_start + i] = charset[temp % charset_len]
            temp //= charset_len
        
        # Hash and check
        h = keccak(bytes(sig))
        if h[:4] == target_bytes:
            return bytes(sig[suffix_start:paren_pos]).decode()
    
    return None

def bruteforce_fast(prefix: str, params: str, target_bytes: bytes,
                   min_length: int, max_length: int, workers: int, 
                   randomize: bool = False) -> Optional[str]:
    """Faster parallel bruteforce with optimized workers."""
    import random
    
    charset_len = len(CHARSET)
    prefix_bytes = prefix.encode()
    params_bytes = params.encode()
    
    for length in range(min_length, max_length + 1):
        total = charset_len ** length
        print(f"  Length {length}: {total:,} combinations...", end=" ", flush=True)
        start_time = time.time()
        
        if total < 50000:
            result = worker_search_fast((prefix_bytes, params_bytes, target_bytes, length, 0, total))
            elapsed = time.time() - start_time
            rate = total / elapsed if elapsed > 0 else 0
            if result:
                print(f"FOUND! ({rate:,.0f} hash/s)")
                return prefix + result
            print(f"not found ({rate:,.0f} hash/s)")
            continue
        
        chunk_size = max(20000, total // (workers * 8))
        tasks = []
        for start in range(0, total, chunk_size):
            end = min(start + chunk_size, total)
            tasks.append((prefix_bytes, params_bytes, target_bytes, length, start, end))
        
        # Randomize task order for better luck
        if randomize:
            random.shuffle(tasks)
        
        found = None
        with mp.Pool(workers) as pool:
            for result in pool.imap_unordered(worker_search_fast, tasks):
                if result is not None:
                    found = prefix + result
                    pool.terminate()
                    break
        
        elapsed = time.time() - start_time
        rate = total / elapsed if elapsed > 0 else 0
        
        if found:
            print(f"FOUND! ({rate:,.0f} hash/s)")
            return found
        print(f"not found ({rate:,.0f} hash/s)")
    
    return None

# ============================================================
# Main
# ============================================================

def main():
    parser = argparse.ArgumentParser(description="Fast selector bruteforce finder")
    parser.add_argument("--target", required=True, help="Target selector (e.g., 0x23b872dd)")
    parser.add_argument("--params", required=True, help="Function parameters")
    parser.add_argument("--prefix", default="func_", help="Function name prefix")
    parser.add_argument("--min-length", type=int, default=1, help="Min suffix length (skip shorter)")
    parser.add_argument("--max-length", type=int, default=8, help="Max suffix length")
    parser.add_argument("--workers", type=int, default=mp.cpu_count(), help="Parallel workers")
    parser.add_argument("--fast", action="store_true", help="Use optimized search")
    parser.add_argument("--random", action="store_true", help="Randomize search order (faster if lucky)")
    args = parser.parse_args()
    
    target = args.target.lower()
    if target.startswith("0x"):
        target = target[2:]
    target_bytes = bytes.fromhex(target)
    
    print(f"Selector Bruteforce Finder")
    print(f"=" * 50)
    print(f"Backend: {BACKEND}")
    print(f"Target: 0x{target}")
    print(f"Prefix: {args.prefix}")
    print(f"Params: ({args.params})")
    print(f"Workers: {args.workers}")
    print(f"Length: {args.min_length}-{args.max_length}")
    if args.random:
        print(f"Mode: randomized search")
    print()
    
    result = bruteforce_fast(args.prefix, args.params, target_bytes, 
                            args.min_length, args.max_length, args.workers, args.random)
    
    if result:
        full_sig = f"{result}({args.params})"
        print()
        print(f"✅ Found: {result}")
        print(f"   Signature: {full_sig}")
        print(f"   Selector: 0x{target}")
    else:
        print()
        print(f"❌ No match found within suffix length {args.max_length}")

if __name__ == "__main__":
    main()
