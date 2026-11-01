# Credit and image-batch policy update

- Daily free allowance is now 5 credits per UTC day, granted separately from purchased credits and protected by the existing idempotent daily grant reference.
- Existing accounts that already received the old 10-credit grant for the current UTC day are not granted an extra 5 credits by this update; the new amount applies on subsequent daily grant references.
- Image generation accepts 1–5 images per request and consumes 1 credit for the whole batch.
- Creator UI only offers 1–5 images, displays the batch as 1 credit, and Launchpad preselects 5 images.
- The image endpoint enforces the maximum server-side; clients cannot request a 6–10 image batch.
