# Pothub workspace roles

The browser now asks the user to choose **Developer** or **Creator** before showing the provider sign-in page. The choice is stored as `pothub_workspace_role` in local browser storage and survives reloads.

- **Developer** opens the code/deployment workspace and its developer navigation.
- **Creator** opens Creator Studio first and shows creator-oriented navigation (Creator Studio, Credits, History, Settings, Help). Developer-only navigation is hidden and navigation requests are redirected to Creator Studio.
- Both roles require successful Google or GitHub authentication before any workspace interface is displayed.
- **Switch workspace** returns to the role selector without forcing a sign-out. **Change workspace** is also available on the provider sign-in page.

The selected role is currently a client-side workspace preference, not a server-side authorization boundary. Sensitive backend operations must continue to enforce authentication and their own permissions independently.
