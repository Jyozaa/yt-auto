"""Fetch and verify files for offline speech inference."""
import hashlib
import json
import os
from pathlib import Path
import tempfile
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / "config" / "voice-models.json"


def assets():
    directory = Path(os.environ.get("VOICE_MODEL_DIR") or ROOT / ".cache" / "voice-models")
    directory.mkdir(parents=True, exist_ok=True)
    output = {}
    for name, entry in json.loads(MANIFEST.read_text()).items():
        target = directory / name
        if target.is_file():
            with target.open("rb") as stream:
                if hashlib.file_digest(stream, "sha256").hexdigest() == entry["sha256"]:
                    output[name] = target
                    continue
        with tempfile.NamedTemporaryFile(dir=directory, suffix=".part", delete=False) as stream:
            staging = Path(stream.name)
            try:
                digest = hashlib.sha256()
                with urlopen(entry["url"], timeout=60) as response:
                    while data := response.read(1024 * 1024):
                        digest.update(data)
                        stream.write(data)
                if digest.hexdigest() != entry["sha256"]:
                    raise ValueError(f"Checksum mismatch for {name}")
                stream.close()
                staging.replace(target)
            finally:
                staging.unlink(missing_ok=True)
        output[name] = target
    return output


if __name__ == "__main__":
    assets()
    print("Verified all speech assets")
