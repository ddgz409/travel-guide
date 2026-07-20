# Xiaohongshu / Ctrip Scrape Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 完整生成时并行爬取小红书与携程公开搜索结果，写入 `Trip.external_refs`，注入 LLM Prompt，并在详情/分享页展示。

**Architecture:** 两个独立 client（直连 HTML → 空则 Bing `site:` 降级）产出统一 `ExternalTip`；`generator.generate` 在 POI 之后并行调用并落库；`TripOut` 透出字段；前端复用同一数据渲染两个参考区块。按天重生不重新爬取。

**Tech Stack:** FastAPI · SQLAlchemy · httpx · Pydantic v2 · Next.js · TypeScript · pytest（新建）

**Spec:** `docs/superpowers/specs/2026-07-20-xhs-ctrip-scrape-design.md`

## Global Constraints

- 每平台最多 6 条；Prompt 每源最多前 4 条标题+摘要
- 超时约 8s；每平台最多重试 2 次后返回 `[]`
- 不模拟登录、不绕验证码、不抓详情全文
- 爬虫失败不阻断主生成；`external_refs` 始终含 `xiaohongshu` / `ctrip` 两个 key
- 仅完整生成触发爬取；`regenerate-day` 沿用已有 refs
- `TripListItem` 不含 `external_refs`

---

## File Structure

| File | Responsibility |
|------|----------------|
| `backend/app/schemas/trip.py` | `ExternalTip` / `ExternalRefs` / `TripOut.external_refs` |
| `backend/app/models/__init__.py` | `Trip.external_refs` JSON 列 |
| `backend/app/core/database.py` | SQLite 缺列时 `ALTER TABLE` |
| `backend/app/main.py` | startup 调用 ensure_schema |
| `backend/app/services/scrape_utils.py` | UA、重试 GET、剥标签、Bing site 搜索 |
| `backend/app/services/xiaohongshu_client.py` | `search_xiaohongshu(destination) -> list[dict]` |
| `backend/app/services/ctrip_client.py` | `search_ctrip(destination) -> list[dict]` |
| `backend/app/services/generator.py` | 并行爬取、落库、Prompt 段 |
| `frontend/lib/types.ts` | `ExternalTip` / `ExternalRefs` / `Trip.external_refs` |
| `frontend/components/external-refs.tsx` | 两区块 UI |
| `frontend/app/trips/[id]/page.tsx` | 挂载组件 |
| `frontend/app/share/[token]/page.tsx` | 挂载组件 |
| `backend/tests/test_scrape_utils.py` | 工具单测 |
| `backend/tests/test_external_clients.py` | client 解析/降级单测（mock httpx） |
| `backend/tests/test_external_refs_schema.py` | schema / 默认值 |
| `README.md` | 已知限制说明一行 |

---

### Task 1: Schema + Model + SQLite 列兼容

**Files:**
- Modify: `backend/app/schemas/trip.py`
- Modify: `backend/app/models/__init__.py`
- Modify: `backend/app/core/database.py`
- Modify: `backend/app/main.py`
- Create: `backend/tests/test_external_refs_schema.py`
- Create: `backend/tests/conftest.py`（若尚无）

**Interfaces:**
- Produces: `ExternalTip`, `ExternalRefs`, `EMPTY_EXTERNAL_REFS`, `Trip.external_refs`, `ensure_sqlite_columns()`

- [ ] **Step 1: 写失败测试**

创建 `backend/tests/conftest.py`:

```python
import pytest


@pytest.fixture
def anyio_backend():
    return "asyncio"
```

创建 `backend/tests/test_external_refs_schema.py`:

```python
from app.schemas.trip import EMPTY_EXTERNAL_REFS, ExternalRefs, ExternalTip, TripOut


def test_empty_external_refs_keys():
    assert set(EMPTY_EXTERNAL_REFS.keys()) == {"xiaohongshu", "ctrip"}
    assert EMPTY_EXTERNAL_REFS["xiaohongshu"] == []
    assert EMPTY_EXTERNAL_REFS["ctrip"] == []


def test_external_tip_roundtrip():
    tip = ExternalTip(
        source="xiaohongshu",
        title="成都三日游",
        snippet="宽窄巷子必去",
        url="https://www.xiaohongshu.com/explore/abc",
        meta={"likes": "1.2万"},
    )
    data = tip.model_dump()
    assert data["source"] == "xiaohongshu"
    assert data["meta"]["likes"] == "1.2万"


def test_trip_out_includes_external_refs():
    fields = TripOut.model_fields
    assert "external_refs" in fields
```

- [ ] **Step 2: 运行测试确认失败**

Run（在 `backend/` 下，已激活 venv）:

```bash
pip install pytest -q
python -m pytest tests/test_external_refs_schema.py -v
```

Expected: FAIL（`ExternalTip` / `EMPTY_EXTERNAL_REFS` 未定义）

- [ ] **Step 3: 实现 schema**

在 `backend/app/schemas/trip.py` 顶部附近（`TripStatus` 之后）加入：

```python
from typing import Any

ExternalSource = Literal["xiaohongshu", "ctrip"]


class ExternalTip(BaseModel):
    """小红书 / 携程参考条目。"""

    source: ExternalSource
    title: str
    snippet: str = ""
    url: str
    meta: dict[str, Any] | None = None


class ExternalRefs(BaseModel):
    """按来源分组的外部参考。"""

    xiaohongshu: list[ExternalTip] = Field(default_factory=list)
    ctrip: list[ExternalTip] = Field(default_factory=list)


EMPTY_EXTERNAL_REFS: dict[str, list] = {"xiaohongshu": [], "ctrip": []}
```

在 `TripOut` 中增加字段（`preferences` 之后）：

```python
    external_refs: dict = Field(default_factory=lambda: {"xiaohongshu": [], "ctrip": []})
```

- [ ] **Step 4: 实现 model 列**

在 `Trip` 类（`backend/app/models/__init__.py`）`preferences` 之后增加：

```python
    # 小红书/携程参考 {xiaohongshu: [...], ctrip: [...]}
    external_refs: Mapped[dict] = mapped_column(
        JSON, default=lambda: {"xiaohongshu": [], "ctrip": []}, nullable=False
    )
```

注意：若 SQLAlchemy `default` 对 mutable dict 有告警，可改用 `default=dict` 并在创建 Trip 时显式赋值 `EMPTY_EXTERNAL_REFS` 的拷贝。

- [ ] **Step 5: 实现 ensure_sqlite_columns**

在 `backend/app/core/database.py` 末尾增加：

```python
from sqlalchemy import inspect, text


def ensure_sqlite_columns() -> None:
    """为已有 SQLite 库补齐 create_all 不会添加的新列。"""
    if not settings.is_sqlite:
        return
    inspector = inspect(engine)
    if "trips" not in inspector.get_table_names():
        return
    cols = {c["name"] for c in inspector.get_columns("trips")}
    if "external_refs" not in cols:
        with engine.begin() as conn:
            conn.execute(
                text(
                    "ALTER TABLE trips ADD COLUMN external_refs JSON "
                    "DEFAULT '{\"xiaohongshu\":[],\"ctrip\":[]}'"
                )
            )
```

在 `backend/app/main.py` 的 `on_startup`：

```python
from app.core.database import Base, engine, ensure_sqlite_columns

@app.on_event("startup")
def on_startup() -> None:
    Base.metadata.create_all(bind=engine)
    ensure_sqlite_columns()
```

- [ ] **Step 6: 跑通测试**

```bash
cd backend
python -m pytest tests/test_external_refs_schema.py -v
```

Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add backend/app/schemas/trip.py backend/app/models/__init__.py backend/app/core/database.py backend/app/main.py backend/tests/
git commit -m "feat: add Trip.external_refs schema and sqlite column migrate"
```

---

### Task 2: scrape_utils（重试 GET + Bing site）

**Files:**
- Create: `backend/app/services/scrape_utils.py`
- Create: `backend/tests/test_scrape_utils.py`

**Interfaces:**
- Produces:
  - `DEFAULT_HEADERS: dict`
  - `fetch_text(url: str, *, retries: int = 2, timeout: float = 8.0) -> str | None`
  - `strip_html(html: str) -> str`
  - `bing_site_search(site: str, query: str, max_results: int = 6) -> list[dict[str, str]]`  
    每项含 `title`, `snippet`, `url`

- [ ] **Step 1: 写失败测试**

`backend/tests/test_scrape_utils.py`:

```python
from unittest.mock import MagicMock, patch

from app.services.scrape_utils import bing_site_search, fetch_text, strip_html


def test_strip_html_removes_tags():
    assert "你好" in strip_html("<p>你好</p><script>x</script>")
    assert "script" not in strip_html("<script>alert(1)</script>hi").lower() or "alert" not in strip_html("<script>alert(1)</script>hi")


def test_fetch_text_retries_then_none():
    with patch("app.services.scrape_utils.httpx.Client") as Client:
        client = MagicMock()
        Client.return_value.__enter__.return_value = client
        client.get.side_effect = Exception("boom")
        assert fetch_text("https://example.com", retries=2) is None
        assert client.get.call_count == 3  # 初次 + 2 次重试


def test_bing_site_search_parses_h2_links():
    html = '''
    <html><body>
    <h2><a href="https://www.xiaohongshu.com/explore/1">成都攻略</a></h2>
    <p>宽窄巷子很棒</p>
    <h2><a href="https://www.bing.com/foo">skip</a></h2>
    </body></html>
    '''
    with patch("app.services.scrape_utils.fetch_text", return_value=html):
        results = bing_site_search("xiaohongshu.com", "成都 旅游攻略", max_results=6)
    assert len(results) == 1
    assert results[0]["title"] == "成都攻略"
    assert "xiaohongshu.com" in results[0]["url"]
```

- [ ] **Step 2: 跑测试确认失败**

```bash
python -m pytest tests/test_scrape_utils.py -v
```

Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现 scrape_utils.py**

```python
"""爬取共用工具：HTTP 重试、剥标签、Bing site 搜索。"""
import logging
import re
import time
from typing import Any
from urllib.parse import quote

import httpx

logger = logging.getLogger(__name__)

DEFAULT_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml",
    "Accept-Language": "zh-CN,zh;q=0.9",
}


def strip_html(html: str) -> str:
    html = re.sub(r"<(script|style|nav|footer|header)[^>]*>.*?</\1>", "", html, flags=re.S | re.I)
    text = re.sub(r"<[^>]+>", " ", html)
    text = re.sub(r"&[a-zA-Z]+;", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def fetch_text(url: str, *, retries: int = 2, timeout: float = 8.0) -> str | None:
    """GET 文本；失败重试 retries 次（共 1+retries 次尝试）。"""
    last_err: Exception | None = None
    attempts = retries + 1
    for i in range(attempts):
        try:
            with httpx.Client(timeout=timeout, follow_redirects=True) as client:
                resp = client.get(url, headers=DEFAULT_HEADERS)
                resp.raise_for_status()
                return resp.text
        except Exception as e:
            last_err = e
            logger.warning("fetch_text fail %s attempt %s: %s", url, i + 1, e)
            if i < attempts - 1:
                time.sleep(0.5)
    logger.warning("fetch_text gave up %s: %s", url, last_err)
    return None


def bing_site_search(site: str, query: str, max_results: int = 6) -> list[dict[str, str]]:
    """Bing site: 搜索，返回 [{title, snippet, url}]。"""
    q = f"site:{site} {query}"
    url = f"https://www.bing.com/search?q={quote(q)}&count={max_results}"
    html = fetch_text(url, retries=2, timeout=10.0)
    if not html:
        return []
    results: list[dict[str, str]] = []
    pairs = re.findall(
        r'<h2[^>]*>\s*<a[^>]+href="(https?://[^"]+)"[^>]*>(.*?)</a>',
        html,
        re.S,
    )
    for href, title_html in pairs:
        if "bing.com" in href or "microsoft.com" in href:
            continue
        title = re.sub(r"<[^>]+>", "", title_html).strip()[:120]
        if not title:
            continue
        snippet = ""
        idx = html.find(href)
        if idx >= 0:
            after = html[idx : idx + 2000]
            p_match = re.search(r"<p[^>]*>(.*?)</p>", after, re.S)
            if p_match:
                snippet = re.sub(r"<[^>]+>", "", p_match.group(1)).strip()[:300]
        results.append({"title": title, "snippet": snippet, "url": href})
        if len(results) >= max_results:
            break
    return results
```

- [ ] **Step 4: 跑测试通过**

```bash
python -m pytest tests/test_scrape_utils.py -v
```

Expected: PASS（若 `test_strip_html` 断言过严，按实现微调断言）

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/scrape_utils.py backend/tests/test_scrape_utils.py
git commit -m "feat: add scrape_utils with retry and bing site search"
```

---

### Task 3: 小红书 + 携程 clients

**Files:**
- Create: `backend/app/services/xiaohongshu_client.py`
- Create: `backend/app/services/ctrip_client.py`
- Create: `backend/tests/test_external_clients.py`

**Interfaces:**
- Consumes: `fetch_text`, `bing_site_search`, `strip_html`
- Produces:
  - `search_xiaohongshu(destination: str, max_results: int = 6) -> list[dict]`
  - `search_ctrip(destination: str, max_results: int = 6) -> list[dict]`
  - 每项：`{"source", "title", "snippet", "url", "meta"}`（meta 可为 `None` 或 dict）

- [ ] **Step 1: 写失败测试**

`backend/tests/test_external_clients.py`:

```python
from unittest.mock import patch

from app.services.ctrip_client import search_ctrip
from app.services.xiaohongshu_client import search_xiaohongshu


def test_xhs_parses_note_links_from_html():
    html = '''
    <html><a href="https://www.xiaohongshu.com/explore/64abc">成都必去</a>
    <a href="https://www.xiaohongshu.com/explore/64def">美食清单</a>
    </html>
    '''
    with patch("app.services.xiaohongshu_client.fetch_text", return_value=html):
        with patch("app.services.xiaohongshu_client.bing_site_search") as bing:
            tips = search_xiaohongshu("成都", max_results=6)
            bing.assert_not_called()
    assert len(tips) == 2
    assert tips[0]["source"] == "xiaohongshu"
    assert tips[0]["url"].startswith("https://www.xiaohongshu.com/")


def test_xhs_falls_back_to_bing_when_empty():
    with patch("app.services.xiaohongshu_client.fetch_text", return_value="<html></html>"):
        with patch(
            "app.services.xiaohongshu_client.bing_site_search",
            return_value=[{
                "title": "笔记A",
                "snippet": "摘要",
                "url": "https://www.xiaohongshu.com/explore/1",
            }],
        ):
            tips = search_xiaohongshu("成都")
    assert len(tips) == 1
    assert tips[0]["source"] == "xiaohongshu"


def test_ctrip_falls_back_to_bing():
    with patch("app.services.ctrip_client.fetch_text", return_value=None):
        with patch(
            "app.services.ctrip_client.bing_site_search",
            return_value=[{
                "title": "景点B",
                "snippet": "评分4.8",
                "url": "https://you.ctrip.com/sight/chengdu/1.html",
            }],
        ):
            tips = search_ctrip("成都")
    assert len(tips) == 1
    assert tips[0]["source"] == "ctrip"
```

- [ ] **Step 2: 跑测试确认失败**

```bash
python -m pytest tests/test_external_clients.py -v
```

Expected: FAIL

- [ ] **Step 3: 实现 xiaohongshu_client.py**

```python
"""小红书公开搜索爬取（直连失败则 Bing site 降级）。"""
import logging
import re
from typing import Any
from urllib.parse import quote

from app.services.scrape_utils import bing_site_search, fetch_text

logger = logging.getLogger(__name__)

_NOTE_HREF = re.compile(
    r'href="(https://www\.xiaohongshu\.com/(?:explore|search_result)/[^"]+)"[^>]*>([^<]{2,80})',
    re.I,
)


def _parse_xhs_html(html: str, max_results: int) -> list[dict[str, Any]]:
    tips: list[dict[str, Any]] = []
    seen: set[str] = set()
    for url, title in _NOTE_HREF.findall(html):
        if url in seen:
            continue
        seen.add(url)
        tips.append({
            "source": "xiaohongshu",
            "title": title.strip()[:120],
            "snippet": "",
            "url": url,
            "meta": None,
        })
        if len(tips) >= max_results:
            break
    return tips


def search_xiaohongshu(destination: str, max_results: int = 6) -> list[dict[str, Any]]:
    keyword = quote(f"{destination} 旅游攻略")
    url = f"https://www.xiaohongshu.com/search_result?keyword={keyword}"
    html = fetch_text(url, retries=2)
    tips = _parse_xhs_html(html or "", max_results) if html else []
    if tips:
        logger.info("xiaohongshu direct: %d tips for %s", len(tips), destination)
        return tips[:max_results]

    logger.info("xiaohongshu fallback bing for %s", destination)
    raw = bing_site_search("xiaohongshu.com", f"{destination} 旅游攻略", max_results=max_results)
    return [
        {
            "source": "xiaohongshu",
            "title": r["title"][:120],
            "snippet": (r.get("snippet") or "")[:300],
            "url": r["url"],
            "meta": None,
        }
        for r in raw
    ][:max_results]
```

- [ ] **Step 4: 实现 ctrip_client.py**

```python
"""携程攻略站公开搜索爬取（直连失败则 Bing site 降级）。"""
import logging
import re
from typing import Any
from urllib.parse import quote

from app.services.scrape_utils import bing_site_search, fetch_text

logger = logging.getLogger(__name__)

_CTRIP_HREF = re.compile(
    r'href="(https?://(?:you\.)?ctrip\.com/[^"]+)"[^>]*>([^<]{2,100})',
    re.I,
)


def _parse_ctrip_html(html: str, max_results: int) -> list[dict[str, Any]]:
    tips: list[dict[str, Any]] = []
    seen: set[str] = set()
    for url, title in _CTRIP_HREF.findall(html):
        if "javascript" in url.lower():
            continue
        if url in seen:
            continue
        seen.add(url)
        full = url if url.startswith("http") else f"https:{url}"
        tips.append({
            "source": "ctrip",
            "title": title.strip()[:120],
            "snippet": "",
            "url": full,
            "meta": None,
        })
        if len(tips) >= max_results:
            break
    return tips


def search_ctrip(destination: str, max_results: int = 6) -> list[dict[str, Any]]:
    path = quote(destination)
    url = f"https://you.ctrip.com/searchsite/{path}"
    html = fetch_text(url, retries=2)
    tips = _parse_ctrip_html(html or "", max_results) if html else []
    if tips:
        logger.info("ctrip direct: %d tips for %s", len(tips), destination)
        return tips[:max_results]

    logger.info("ctrip fallback bing for %s", destination)
    raw = bing_site_search("ctrip.com", f"{destination} 旅游攻略", max_results=max_results)
    return [
        {
            "source": "ctrip",
            "title": r["title"][:120],
            "snippet": (r.get("snippet") or "")[:300],
            "url": r["url"],
            "meta": None,
        }
        for r in raw
    ][:max_results]
```

- [ ] **Step 5: 跑测试通过**

```bash
python -m pytest tests/test_external_clients.py tests/test_scrape_utils.py -v
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add backend/app/services/xiaohongshu_client.py backend/app/services/ctrip_client.py backend/tests/test_external_clients.py
git commit -m "feat: add xiaohongshu and ctrip search scrape clients"
```

---

### Task 4: Generator 并行接入 + Prompt

**Files:**
- Modify: `backend/app/services/generator.py`
- Create: `backend/tests/test_generator_external_refs.py`

**Interfaces:**
- Consumes: `search_xiaohongshu`, `search_ctrip`
- Produces: `generate()` 在调 LLM 前设置 `trip.external_refs` 并 `db.commit()`；`_build_user_prompt` 接受可选 `external_refs`

- [ ] **Step 1: 写失败测试（Prompt 段）**

`backend/tests/test_generator_external_refs.py`:

```python
from datetime import date
from types import SimpleNamespace

from app.services.generator import GuideGenerator


def test_build_user_prompt_includes_external_refs():
    gen = GuideGenerator.__new__(GuideGenerator)
    trip = SimpleNamespace(
        destination="成都",
        start_date=date(2026, 7, 1),
        end_date=date(2026, 7, 3),
        travelers=2,
        preferences={"interests": ["美食"], "budget_level": "中等", "transport": "公共交通"},
    )
    pool = {"attraction": [], "meal": [], "hotel": []}
    refs = {
        "xiaohongshu": [{
            "source": "xiaohongshu",
            "title": "宽窄巷子打卡",
            "snippet": "早上去人少",
            "url": "https://www.xiaohongshu.com/explore/1",
            "meta": None,
        }],
        "ctrip": [{
            "source": "ctrip",
            "title": "大熊猫基地",
            "snippet": "建议预留半天",
            "url": "https://you.ctrip.com/sight/1.html",
            "meta": None,
        }],
    }
    prompt = gen._build_user_prompt(pool, trip, 3, web_results=None, external_refs=refs)
    assert "小红书" in prompt
    assert "宽窄巷子打卡" in prompt
    assert "携程" in prompt
    assert "大熊猫基地" in prompt
    assert "候选" in prompt or "可选景点" in prompt
```

- [ ] **Step 2: 跑测试确认失败**

```bash
python -m pytest tests/test_generator_external_refs.py -v
```

Expected: FAIL（`external_refs` 参数不存在或文案未出现）

- [ ] **Step 3: 改 generator.py**

1. 增加 import：

```python
from concurrent.futures import ThreadPoolExecutor, as_completed

from app.schemas.trip import EMPTY_EXTERNAL_REFS
from app.services.ctrip_client import search_ctrip
from app.services.xiaohongshu_client import search_xiaohongshu
```

2. 在 `SYSTEM_PROMPT` 的核心原则中追加一条（编号顺延）：

```text
9. 若提供了小红书/携程参考，可吸收口碑与热门玩法建议，但地点名称仍必须来自候选列表
```

3. 在 `GuideGenerator` 增加方法：

```python
    def _fetch_external_refs(self, destination: str) -> dict[str, list]:
        """并行爬取小红书/携程；单源失败返回空列表。"""
        refs = {"xiaohongshu": [], "ctrip": []}
        with ThreadPoolExecutor(max_workers=2) as pool:
            futures = {
                pool.submit(search_xiaohongshu, destination): "xiaohongshu",
                pool.submit(search_ctrip, destination): "ctrip",
            }
            for fut in as_completed(futures):
                key = futures[fut]
                try:
                    refs[key] = fut.result() or []
                except Exception as e:
                    logger.warning("external_refs %s failed: %s", key, e)
                    refs[key] = []
        return refs
```

4. 在 `generate()` 中，`web_results = search_travel_tips(...)` **之后**、`_generate_via_llm` **之前**插入：

```python
            external_refs = self._fetch_external_refs(trip.destination)
            trip.external_refs = external_refs
            db.commit()
            logger.info(
                "external_refs %s: xhs=%d ctrip=%d",
                trip.destination,
                len(external_refs.get("xiaohongshu") or []),
                len(external_refs.get("ctrip") or []),
            )
```

并把 LLM 调用改为：

```python
                day_plans = self._generate_via_llm(
                    pool, trip, days_count, web_results, external_refs
                )
```

**不要**改 `regenerate_day` / `_run_regen` 路径去重新爬取。

5. 更新 `_generate_via_llm` 与 `_build_user_prompt` 签名，增加 `external_refs: dict | None = None`。

在 `_build_user_prompt` 的 `web_section` 之后构造：

```python
        ext_section = ""
        if external_refs:
            parts = []
            for source, label in (("xiaohongshu", "小红书"), ("ctrip", "携程")):
                items = (external_refs.get(source) or [])[:4]
                if not items:
                    continue
                lines = []
                for it in items:
                    sn = (it.get("snippet") or "").strip()
                    line = f"- {it.get('title', '')}"
                    if sn:
                        line += f"：{sn[:200]}"
                    lines.append(line)
                parts.append(f"【{label}】\n" + "\n".join(lines))
            if parts:
                ext_section = (
                    f"\n📱 小红书/携程口碑参考（仅作玩法与热度参考，地点必须来自候选列表）：\n"
                    + "\n\n".join(parts)
                )
```

把 `{must_section}{web_section}` 改为 `{must_section}{web_section}{ext_section}`，结尾提示句在有 `external_refs` 任一侧非空时也可追加「并参考小红书/携程口碑」。

- [ ] **Step 4: 跑测试通过**

```bash
python -m pytest tests/test_generator_external_refs.py -v
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/generator.py backend/tests/test_generator_external_refs.py
git commit -m "feat: wire xhs/ctrip scrape into guide generator and prompt"
```

---

### Task 5: 前端类型 + ExternalRefs 组件 + 详情/分享页

**Files:**
- Modify: `frontend/lib/types.ts`
- Create: `frontend/components/external-refs.tsx`
- Modify: `frontend/app/trips/[id]/page.tsx`
- Modify: `frontend/app/share/[token]/page.tsx`
- Modify: `README.md`（已知限制加 1 行）

**Interfaces:**
- Consumes: `Trip.external_refs`
- Produces: `<ExternalRefsPanel refs={trip.external_refs} />`

- [ ] **Step 1: 扩展 types.ts**

在 `TripPreferences` 之前加入：

```typescript
export type ExternalSource = "xiaohongshu" | "ctrip";

export interface ExternalTip {
  source: ExternalSource;
  title: string;
  snippet: string;
  url: string;
  meta?: {
    rating?: string;
    price?: string;
    likes?: string;
  } | null;
}

export interface ExternalRefs {
  xiaohongshu: ExternalTip[];
  ctrip: ExternalTip[];
}
```

在 `Trip` 接口中 `preferences` 后增加：

```typescript
  external_refs?: ExternalRefs;
```

- [ ] **Step 2: 创建 external-refs.tsx**

```tsx
"use client";

import type { ExternalRefs, ExternalTip } from "@/lib/types";

function TipList({ tips, empty }: { tips: ExternalTip[]; empty: string }) {
  if (!tips?.length) {
    return <p className="text-sm text-gray-400">{empty}</p>;
  }
  return (
    <ul className="space-y-2">
      {tips.map((t) => (
        <li key={t.url} className="text-sm">
          <a
            href={t.url}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-orange-600 hover:underline"
          >
            {t.title}
          </a>
          {t.snippet ? (
            <p className="text-gray-500 mt-0.5 line-clamp-2">{t.snippet}</p>
          ) : null}
          {t.meta && (t.meta.rating || t.meta.price || t.meta.likes) ? (
            <p className="text-xs text-gray-400 mt-0.5">
              {[t.meta.rating && `评分 ${t.meta.rating}`, t.meta.price && `参考价 ${t.meta.price}`, t.meta.likes && `热度 ${t.meta.likes}`]
                .filter(Boolean)
                .join(" · ")}
            </p>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

export function ExternalRefsPanel({ refs }: { refs?: ExternalRefs | null }) {
  const xhs = refs?.xiaohongshu ?? [];
  const ctrip = refs?.ctrip ?? [];
  return (
    <div className="grid md:grid-cols-2 gap-4 mb-6">
      <section className="border border-gray-200 rounded-lg p-4 bg-white">
        <h3 className="font-semibold text-sm mb-3">小红书参考</h3>
        <TipList tips={xhs} empty="暂无参考" />
      </section>
      <section className="border border-gray-200 rounded-lg p-4 bg-white">
        <h3 className="font-semibold text-sm mb-3">携程参考</h3>
        <TipList tips={ctrip} empty="暂无参考" />
      </section>
    </div>
  );
}
```

- [ ] **Step 3: 挂到详情页**

在 `frontend/app/trips/[id]/page.tsx`：

- import `ExternalRefsPanel`
- 在标题栏/`shareUrl` 提示之后、天数切换之前插入：

```tsx
      <ExternalRefsPanel refs={trip.external_refs} />
```

（仅 `ready` 成功分支；generating/failed 早期 return 不受影响。若 failed 也要展示，可在 failed 分支同样挂载——按 spec：failed 若有已写入 refs 可展示；可选在 failed UI 底部加同一组件。）

- [ ] **Step 4: 挂到分享页**

在 `frontend/app/share/[token]/page.tsx` 标题块之后、`days.map` 之前：

```tsx
      <ExternalRefsPanel refs={trip.external_refs} />
```

并补 import。

- [ ] **Step 5: README 已知限制**

在「已知限制」列表增加：

```markdown
- 小红书/携程参考依赖公开页爬取，反爬或改版时可能为空（生成仍继续）
```

- [ ] **Step 6: 类型检查（可选）**

```bash
cd frontend
npx tsc --noEmit
```

Expected: 无因 `external_refs` 引起的错误

- [ ] **Step 7: Commit**

```bash
git add frontend/lib/types.ts frontend/components/external-refs.tsx frontend/app/trips/[id]/page.tsx frontend/app/share/[token]/page.tsx README.md
git commit -m "feat: show Xiaohongshu and Ctrip refs on trip detail and share"
```

---

### Task 6: 手工验收

**Files:** 无代码（除非修 bug）

- [ ] **Step 1: 启动后端与前端**

```bash
# backend
cd backend
# 激活 .venv
uvicorn app.main:app --reload --port 8000

# frontend（另一终端）
cd frontend
npm run dev
```

- [ ] **Step 2: 完整生成一条攻略**

用真实目的地（如「成都」）走 `/generate`，等到 `ready`。

检查：

1. `GET http://127.0.0.1:8000/api/v1/trips/{id}` JSON 含 `external_refs.xiaohongshu` 与 `external_refs.ctrip`（可为 `[]`）
2. 详情页出现两区块；空则「暂无参考」；有则外链可点
3. 后端日志有 `external_refs ... xhs=N ctrip=M` 或 fallback 日志

- [ ] **Step 3: 软降级烟测**

临时在 client 内让 `fetch_text` 恒返回 `None`（或断外网），再生成一次：行程仍应能完成（高德+GLM 正常时 `ready`），`external_refs` 两 key 存在。

- [ ] **Step 4: 列表接口确认**

`GET /api/v1/trips` 列表项 **没有** `external_refs` 字段（或可忽略）。

- [ ] **Step 5: 全量单测**

```bash
cd backend
python -m pytest tests/ -v
```

Expected: 全部 PASS

- [ ] **Step 6: 若有验收修修补补则再 commit**

```bash
git add -A
git commit -m "fix: polish external refs scrape after manual QA"
```

（无改动则跳过）

---

## Self-Review Checklist

| Spec 要求 | Task |
|-----------|------|
| ExternalTip + Trip.external_refs + ALTER | Task 1 |
| scrape_utils 重试 / Bing site | Task 2 |
| 小红书/携程 client + 降级 | Task 3 |
| 并行生成接入 + Prompt + 不改 regen-day | Task 4 |
| TripOut 字段（随 model）+ 前端双页 | Task 1 + 5 |
| 软降级验收 | Task 6 |
| README 限制说明 | Task 5 |

无 TBD/TODO 占位；函数名 `search_xiaohongshu` / `search_ctrip` / `_fetch_external_refs` / `ExternalRefsPanel` 前后一致。
