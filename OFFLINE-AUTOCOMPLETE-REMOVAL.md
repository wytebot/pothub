# Offline autocomplete removal

Removed the experimental WebLLM/WebGPU offline autocomplete feature from the repository editor. This removes its UI, model initialization/generation handlers, Tab-to-insert completion behavior, styling, and `@mlc-ai/web-llm` dependency.

Normal chat submission remains Enter-to-send and Shift+Enter for a newline. Repository chat continues to use the user's configured AI agent/provider.
