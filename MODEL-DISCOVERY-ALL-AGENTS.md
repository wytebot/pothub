# Model discovery across PotHub agents

- The live model picker now sends the selected agent function (`Diagnosis`, `Fix`, `Chat`, `Image`, or `Video`) to `/api/agent/models`; previously the UI omitted this field and Gemini discovery defaulted to Diagnosis.
- Gemini discovery filters by the model's advertised `supportedGenerationMethods` for text/image and by video/Veo naming for video. OpenAI-compatible and Anthropic-compatible catalogs use conservative model-name filtering for task-specific lists.
- Official deprecation filtering remains in place. The user-facing Test action is still required to verify that the current key/account can actually invoke a listed model; a catalog listing is not an access guarantee.
- Live model listing is available only for providers whose APIs expose compatible model-list endpoints (Gemini, OpenAI-compatible providers with a base URL, and Anthropic-compatible endpoints). Provider-specific image/video APIs such as Replicate, fal.ai, Stability, BFL, Runway, Luma and Kling still need dedicated catalog adapters; they must not be represented as live-discovered just because a static model ID is listed.
- Refresh the picker with **Fetch** after adding a key or switching provider/function. Catalog calls do not charge PotHub credits, though providers may apply their own API limits.
