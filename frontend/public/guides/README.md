# Installation Guide PDFs

Place the three field-guide PDFs in this directory using the exact filenames below.
The **Installation Guides** tab and the command palette both link to these paths.

| Guide | File name (required) |
|-------|----------------------|
| DJI Dock 3 DroneSense Installation | `dji-dock-3-dronesense-installation.pdf` |
| DroneTag Scout Installation Guide  | `dronetag-scout-installation.pdf` |
| Site Assessment Field Guide        | `site-assessment-guide.pdf` |

Notes:

- Filenames are case-sensitive on the Azure host — keep them lowercase-with-dashes.
- To update a guide, replace the PDF in place and redeploy. No code changes needed.
- Static export copies `frontend/public/*` verbatim to the deployed site, so these
  PDFs will be reachable at `/guides/<filename>.pdf` in production.
