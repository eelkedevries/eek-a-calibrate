# Spectral 600 (Latin subset)

- **Family and licence:** Spectral by Production Type, SIL Open Font License 1.1 (`OFL.txt`,
  copied from the same commit). No Reserved Font Name.
- **Upstream repository:** https://github.com/productiontype/Spectral, commit
  `dbc06862d7030eedb1b01b60cdad8f6102f4ddfa` (the commit Google Fonts builds from).
- **Source file:** https://raw.githubusercontent.com/productiontype/Spectral/dbc06862d7030eedb1b01b60cdad8f6102f4ddfa/fonts/ttf/Spectral-SemiBold.ttf
  (name table: "Version 2.005"), sha256
  `5f86915a744832ecf6e4a17ab04bea091b9fa992ef5164ff65ae34c1da2fe94b`.
- **Licence file:** https://raw.githubusercontent.com/productiontype/Spectral/dbc06862d7030eedb1b01b60cdad8f6102f4ddfa/ofl.txt,
  sha256 `6df9374cc60c5b64f15280ff4cc43596f0dbcafb46d3bbfd48385f5f78da60f2`.
- **Retrieved:** 4 November 2026, through the session's egress proxy.
- **Shipped file:** `spectral-latin-600-normal.woff2`, sha256
  `4bf106bac19d6705930efaccc68e9b24dd7a66925624afb8e7d22268953f9b9f`.
- **Processing:** Subset with fontTools 4.55.3 (`pyftsubset <source> --unicodes=<range> --layout-features='kern,liga,calt,ccmp,locl,mark,mkmk,tnum,lnum,case' --name-IDs='*' --name-languages='*' --flavor=woff2`) to the Latin range `U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2190-2193,U+2212,U+2215,U+2248,U+2264-2265,U+FEFF,U+FFFD`. The name table is kept whole, so the copyright and licence entries stay in each file. Nothing else was changed.
