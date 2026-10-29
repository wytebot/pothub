# Authentication provider separation

- **GitHub:** Direct browser navigation to the backend's `/api/auth/github` endpoint. The backend redirects the browser to GitHub's official OAuth authorization page, handles the callback, creates the Pothub server session, and returns to the frontend. Firebase is not involved in GitHub authentication.
- **Google:** Firebase Authentication only, using `GoogleAuthProvider` with popup and redirect fallback.
- **Separate deployments:** Set `APP_URL` or `FRONTEND_URL` on the API server to the frontend origin. Register the API callback URL with GitHub OAuth.
- **API URL normalization:** `VITE_API_BASE_URL` can be the API origin or an API origin ending in `/api`; the client avoids `/api/api` paths.
- **Session priority:** On app startup, a valid GitHub server session takes precedence over a Firebase Google session, so a signed-in Firebase user cannot accidentally overwrite the active GitHub profile.

Note: existing repository, deployment, and credit APIs currently require a GitHub server session. Firebase Google sign-in authenticates the Google identity but does not itself grant GitHub repository access; linking/authorization for those operations remains a separate permission requirement.
