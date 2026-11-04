# Lexend 400 and 500 (Latin subsets)

- **Family and licence:** Lexend by Bonnie Shaver-Troup, Thomas Jockin, Santiago Orozco, Héctor
  Gómez and Superunion, SIL Open Font License 1.1 (`OFL.txt`, copied from the same commit). The
  Reserved Font Name is "RevReading Lexend", which these files do not use.
- **Upstream repository:** https://github.com/googlefonts/lexend, commit
  `20491885ca2cf7ffc556432973e7bdbc701952b5` (the commit Google Fonts builds from).
- **Source files** (static instances; name table "Version 1.007"):
  - https://raw.githubusercontent.com/googlefonts/lexend/20491885ca2cf7ffc556432973e7bdbc701952b5/fonts/lexend/ttf/Lexend-Regular.ttf,
    sha256 `c44abba0820cefd1264e390cc50bcbf74f7a0b20ef95fb083b823eb671826083`;
  - https://raw.githubusercontent.com/googlefonts/lexend/20491885ca2cf7ffc556432973e7bdbc701952b5/fonts/lexend/ttf/Lexend-Medium.ttf,
    sha256 `9fdbbff7ae611162792f32b931f045824b75c6f6fd5fb75633054bfb7b92c73e`.
- **Licence file:** https://raw.githubusercontent.com/googlefonts/lexend/20491885ca2cf7ffc556432973e7bdbc701952b5/OFL.txt,
  sha256 `5da8505887d0fa7fe963445fd58852707fda34adfeb65af25c99d152bab285bd`.
- **Retrieved:** 4 November 2026, through the session's egress proxy.
- **Shipped files:**
  - `lexend-latin-400-normal.woff2`, sha256 `e1baaef9da75303deeca2b84c23e2f240a5bf11473a895216b06baf42f46edc9`;
  - `lexend-latin-500-normal.woff2`, sha256 `ee54ddbe3783d0dbcee61298f45af1719d58ee11ace267651c92dab21df826d6`.
- **Processing:** Subset with fontTools 4.55.3 (`pyftsubset <source> --unicodes=<range> --layout-features='kern,liga,calt,ccmp,locl,mark,mkmk,tnum,lnum,case' --name-IDs='*' --name-languages='*' --flavor=woff2`) to the Latin range `U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2190-2193,U+2212,U+2215,U+2248,U+2264-2265,U+FEFF,U+FFFD`. The name table is kept whole, so the copyright and licence entries stay in each file. Nothing else was changed.
