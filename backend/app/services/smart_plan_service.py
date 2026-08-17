"""智能规划：用 LLM 将口语化关键词优化为完整规划描述。"""
from __future__ import annotations

from datetime import date
from typing import Any

from app.services.llm_client import LLMClient, LLMError

OPTIMIZE_SYSTEM = """你是「知径」旅行规划助手。用户输入简短、口语化的出行想法，你需要改写成一条完整、清晰、可直接用于 AI 生成行程的规划描述。

改写规则：
1. 以「帮我规划」开头（用户已写「帮我/请帮我」则保留）
2. 必须写清：目的地、出发/游玩时间、行程天数（天数见下方「已解析信息」；用户没写天数时按已解析天数补全，不要省略）
3. 将隐含诉求转为明确子任务，写进同一句末尾，例如：
   - 「带伞吗/会下雨吗」→「并查询是否需要带伞」
   - 「穿多少/冷不冷」→「并建议穿衣搭配」
   - 「吃什么」→「重点安排当地美食」
   - 「带娃/亲子」→「适合亲子出行」
4. 只输出 JSON：{{"query":"..."}}，query 为单句中文，15-90 字，无 markdown、无换行、无解释
5. 不要编造用户未提及的具体景点名称
6. 若用户只给了地名、未写天数或时间，必须在 query 中补全合理的天数与时间表述

今天是 {today}。"""


def optimize_plan_query(
    *,
    keywords: str,
    destination: str,
    days: int,
    start_date: str,
    end_date: str,
    provider: str,
    api_key: str,
    model: str,
    base_url: str,
) -> str:
    """调用 LLM 优化用户关键词为规划描述。"""
    raw = (keywords or "").strip()
    if not raw:
        raise LLMError("关键词为空")

    client = LLMClient(
        provider=provider,
        api_key=api_key,
        model=model,
        base_url=base_url,
    )
    user_prompt = (
        f"已解析信息：目的地={destination}，{days}天，{start_date} 至 {end_date}\n"
        f"用户原话：{raw}"
    )
    result = client.chat_json(
        OPTIMIZE_SYSTEM.format(today=date.today().isoformat()),
        user_prompt,
        temperature=0.35,
        max_tokens=320,
    )
    query = str(result.get("query") or "").strip()
    if not query:
        raise LLMError("模型未返回规划描述")
    # 去掉偶发的 markdown 包裹
    if query.startswith("```"):
        query = query.strip("`").strip()
        if query.lower().startswith("json"):
            query = query[4:].strip()
    return query
