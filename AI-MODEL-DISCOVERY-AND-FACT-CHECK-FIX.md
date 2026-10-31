# AI model discovery, fallback and response-grounding update

## Root causes found
- The shared provider registry used `gemini-3.8-flash` as the default and exposed other hard-coded Gemini IDs. This meant an unconfigured/default route could still attempt that ID.
- The text/JSON router computed a normalized provider for validation, but recomputed it without the Gemini default inside the route. A legacy record with no provider could therefore become `null` and be rejected.
- The agent editor did not restore the saved model fallback list when editing an existing agent.
- Fallback candidates were expanded key-by-key, allowing the first key's model variants to consume the candidate limit before later API keys were tried.

## Changes
- Replaced the bogus default with `gemini-2.5-flash`; legacy `gemini-3.8-flash` records are transparently mapped to that stable baseline for requests.
- Normalize provider IDs and common labels such as `Google Gemini`; missing legacy provider fields default to Gemini, while unknown provider names are rejected clearly.
- Use the already-validated provider ID throughout the generation adapter.
- Gemini model discovery now reads the live Models API, follows pagination, and only suggests models advertising `generateContent`; image, embedding, video, live and TTS-only model entries are excluded from text suggestions.
- Restore fallback model IDs when editing saved agents.
- Interleave candidates across saved API keys and their model variants so one key cannot starve the others.
- Agent Test now tests the configured model sequence and reports success if any configured model responds.
- Repository Edit prompts now require claims to be grounded in inspected repository evidence, distinguish facts from assumptions, and prohibit invented file paths, line numbers, tests or deployment facts.

## Important limits
- Live model discovery requires a valid provider API key and the provider's model-list endpoint. It cannot guarantee account-specific quota or regional availability until a real generation test is made.
- No AI system can guarantee every answer is factually correct. Repository answers are now instructed to cite inspected paths and say when evidence is missing; users should still review generated code and run tests before committing.
- This update was syntax-checked for the server and the provider registry tests were run. A full production build and live provider requests require installing dependencies and valid provider credentials.
