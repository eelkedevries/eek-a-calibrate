# JetBrains Mono 400 and 500 (Latin subsets)

- **Family and licence:** JetBrains Mono by JetBrains, SIL Open Font License 1.1 (`OFL.txt`,
  copied from the same branch). No Reserved Font Name.
- **Upstream repository:** https://github.com/JetBrains/JetBrainsMono, branch `master` as of
  the retrieval date (the release in the name table is "Version 2.305").
- **Source files:**
  - https://raw.githubusercontent.com/JetBrains/JetBrainsMono/master/fonts/ttf/JetBrainsMono-Regular.ttf,
    sha256 `e6fd0d7e91550b3ed2b735d4312474362c4716edc4fc0577a0f61ed782d5aed1`;
  - https://raw.githubusercontent.com/JetBrains/JetBrainsMono/master/fonts/ttf/JetBrainsMono-Medium.ttf,
    sha256 `d16e6dc99672734698d629705f617c79f6eb6040f5113efe3a145204dc988109`.
- **Licence file:** https://raw.githubusercontent.com/JetBrains/JetBrainsMono/master/OFL.txt,
  sha256 `a76abf002c49097d146e86740a3105a5d00450b1592e820a1109a8c5680cd697`.
- **Retrieved:** 4 November 2026, through the session's egress proxy.
- **Shipped files:**
  - `jetbrains-mono-latin-400-normal.woff2`, sha256 `df305de6a8c9b779ef53a7990f871b0632865ba0f3ef79af32a78131e1f8ade4`;
  - `jetbrains-mono-latin-500-normal.woff2`, sha256 `b1924a335f10d3b9949d3e74a3862f226156f37740e2d3708906611173e5fd5c`.
- **Processing:** Subset with fontTools 4.55.3 (`pyftsubset <source> --unicodes=<range> --layout-features='kern,liga,calt,ccmp,locl,mark,mkmk,tnum,lnum,case' --name-IDs='*' --name-languages='*' --flavor=woff2`) to the Latin range `U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2190-2193,U+2212,U+2215,U+2248,U+2264-2265,U+FEFF,U+FFFD`. The name table is kept whole, so the copyright and licence entries stay in each file. Nothing else was changed.
