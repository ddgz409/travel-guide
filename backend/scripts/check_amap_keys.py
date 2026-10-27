"""Print configured Amap key count and masked suffixes."""
from app.core.config import get_settings
from app.services.amap_client import _exhausted_until, get_amap_client

s = get_settings()
keys = s.amap_api_keys
print("configured_keys:", len(keys))
for i, k in enumerate(keys):
    print(f"  key{i+1}: ...{k[-8:] if len(k) >= 8 else k}")
print("exhausted_cooldowns:", len(_exhausted_until))
for k, until in _exhausted_until.items():
    print(f"  ...{k[-8:]} until {until}")
print("active_now:", len(keys) - len(_exhausted_until))
client = get_amap_client()
print("client_has_key:", bool(client.api_key))
