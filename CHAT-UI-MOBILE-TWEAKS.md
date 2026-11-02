# Chat UI mobile tweaks

- Removed the optional offline Tab autocomplete feature from the repository editor. It required WebGPU support and a large local model download, which was unreliable on some mobile WebViews.
- Repository editing continues to use the configured server-side AI provider. No local model is downloaded or initialized.
- The compact PotHub-themed chat composer and repository context controls remain available.
