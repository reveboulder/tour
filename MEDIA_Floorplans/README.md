# MEDIA_Floorplans

Floorplan images for **Documents › Floorplans** in the app. Every JPG, PNG, WEBP, GIF or PDF in this folder is listed automatically — no code change needed. After uploading, click **Refresh list** on the Floorplans tab (the list otherwise refreshes every 15 minutes).

## Naming

`FLOORPLAN-SQFT-tags.ext` — the floorplan code first, then the square footage, then any tags. Separate parts with `-` (`_` or spaces also work).

| File name | Matches |
|---|---|
| `B5-1211.jpg` | B5 units with 1,211 sq ft |
| `A3-741-767.jpg` | A3 units with 741 or 767 sq ft |
| `TH2.jpg` | every TH2 unit |

## Tags

Add as many as apply, **in any order**, upper or lower case:

| Tag | Meaning | App filter |
|---|---|---|
| `2D` / `3D` | 2D layout or 3D render | Style |
| `upper` / `lower` | one floor of a townhome / live-work unit | Floors |
| `combined` | one image showing both floors | Floors |
| `mirror` | same layout, mirror image | Tags |
| `measurements` | floorplan with measurements | Tags |
| `balcony` | balcony version | Tags |

Examples: `LW1-1732-upper.jpg`, `LW1-1732-combined.jpg`, `LW1-1732-mirror.jpg`, `LW1-1732-upper-mirror.jpg` (same as `LW1-1732-mirror-upper.jpg`), `LW1-1732-combined-mirror-3D.jpg`, `B5-1211-2D-measurements.pdf`.

The Beds, Level, Building and unit counts in the app come from the unit roster (Settings › Unit Info) for the units that match the floorplan and square footage.
