# Browser test notes

`npm test` runs the portable pure-model and local API checks. It creates temporary synthetic databases under work/, uses an ephemeral test port, and does not connect to a private deployment.

Manual checks to repeat on supported browsers and real phones:

- Name a new note, rename an existing note, cancel a rename, and clear its name.
- Append, edit, and restore an entry. Verify other entries and history remain intact.
- Arrange a thread, cancel and save the order, then reload.
- Export a note with continuations and pictures, and export a very long thread. Check every split image.
- Install the PWA, verify login behavior, go offline, and reconnect.
- On supported phones, use the native image share panel as well as download or long-press save.

Screenshots published in docs/screenshots/ use only synthetic data and the original SVG shipped in this repository. Machine-specific testing scripts from the private workspace are intentionally excluded.
