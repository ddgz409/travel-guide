"""兼容层：旧代码可继续 from app.services.zhipu_client import ...

实际实现见 llm_client.py（支持 DeepSeek / 智谱 / OpenAI 兼容端点）。
"""
from app.services.llm_client import (  # noqa: F401
    LLMClient,
    LLMError,
    ZhipuClient,
    get_llm_client,
    get_zhipu_client,
)
