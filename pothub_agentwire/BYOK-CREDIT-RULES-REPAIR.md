# BYOK credit rules — final routing pass

- Live model discovery and agent configuration are free. They do not reserve, commit, or spend PotHub credits.
- A BYOK agent workflow costs one credit only when the workflow completes successfully. Failed workflows release their reservation; retrying a fallback model inside the same workflow adds no extra credit.
- Provider inference charges, if any, are billed by the user's own provider account. PotHub must not silently replace a user's configured model with a PotHub-funded model.
- Model catalogs are fetched live where the provider exposes a compatible catalog endpoint. If the catalog is reachable and the configured model is absent, routing skips it and tries the next configured candidate. If catalog discovery itself is unavailable, inference is attempted normally rather than being blocked by a discovery outage.
