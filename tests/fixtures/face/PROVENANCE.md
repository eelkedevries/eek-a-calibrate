# Provenance: fixture face (`portrait.jpg`)

The face that the end-to-end tests show to Chromium's fake camera
(`scripts/make-fake-video.sh` turns it into `tests/fixtures/generated/face.mjpeg`).

| Item | Value |
|---|---|
| Subject | Sally Ride, official NASA astronaut portrait, June 1984 |
| Commons file | [File:Sally Ride (1984).jpg](https://commons.wikimedia.org/wiki/File:Sally_Ride_(1984).jpg) |
| Downloaded from | `https://upload.wikimedia.org/wikipedia/commons/thumb/0/0c/Sally_Ride_(1984).jpg/960px-Sally_Ride_(1984).jpg` (960 × 1200, 189,900 bytes, SHA-256 `35f6f6394e1550e2f1691b4e3f20a53babe037912206d5de80f56a8880baade4`) |
| Original source | NASA Johnson Space Center, image S84-37256 (alternate id GPN-2004-00019): <https://images.nasa.gov/details-S84-37256.html> |
| Author | NASA; retouched by the Wikimedia Commons user Coffeeandcrumbs (removal of scratches and minor imperfections) |
| Licence tag | `{{PD-USGov-NASA}}`: public domain as a work of NASA, an agency of the US federal government |
| Retrieved | 1 November 2026 |
| Changes here | Scaled to 800 × 1000 and re-encoded as JPEG with ffmpeg (`-q:v 3`), metadata removed: 93,106 bytes, SHA-256 `ed272f45008087a1210cf4ecc5a4e60ca12ea48ddc2786f973f3cd3cf3a0c081` |

NASA's media guidelines ask that NASA material not be used to imply endorsement; this test
fixture implies none. The image is used only as a synthetic camera input for automated tests
and is never shown in the app.
