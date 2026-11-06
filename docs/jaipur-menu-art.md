# 首页插画

游戏使用 `src/assets/jaipur-palace-camel-v2.jpg`，1000 × 1250。只将这张最终插画纳入发布；迭代草稿留在本地。

使用内置 imagegen 生成，导出 JPEG 用于网页。原始生成文件保留在本机 Codex 生成目录中。真实建筑照片仅作调研参考，没有放进产品。

最终生成提示词：

> Use case: style-transfer. Redesign this Jaipur game-menu illustration to be MUCH SIMPLER AND QUIETER. The user rejects the ornate Hawa Mahal facade as too busy. Replace the building entirely with an elegant simplified Jaipur pink-stone palace entrance and low arched colonnades, a single central pavilion above a broad triple-arched gateway, balanced low wings. Architecture is represented by LARGE SOLID SHAPES with just 3 large entrance arches and at most 4 small windows total. Strong restrained graphic silhouette, sophisticated flat screenprint / cut-paper poster, matching a minimalist solid-silhouette board game icon system. NOT a faithful Hawa Mahal, NOT many balconies. Keep the warm cream empty sky, one muted gold sun disk behind the silhouette, very sparse palms at the outer edges and low flat ground terraces. Limit to 6 solid colors: cream #f4e5ce background, dusty terracotta #b9684d, deep rust #963e2c, sandstone #dfbd99, muted gold #bb893d, small muted green #526746. Use a few broad shadow shapes, no shading or gradient. Portrait 4:5 artwork. Center building across 70% width and 30%-78% height. Plenty of breathing space above and below. The design should read instantly at thumbnail size, like a tasteful board game box illustration. STRICTLY NO decorative filigree, no flowers, no lattice, no repeated small windows, no tessellations, no complicated domes, no photorealism, no 3D, no texture, no text, no borders, no cards, no people, no symbols. Output just the full-bleed illustration.

建筑调研参考：

- [印度旅游局：风之宫](https://www.incredibleindia.gov.in/en/rajasthan/jaipur/hawa-mahal)
- [Dudva，风之宫立面照片，CC0](https://commons.wikimedia.org/wiki/File:East_facade_of_the_Hawa_Mahal,_Jaipur.jpg)

插画是经过简化的主题场景，不是具体建筑的准确复原。

## 骆驼版本

内置 imagegen 在简洁宫门版本上编辑，提示词：

> Use case: precise-object-edit. Keep the supplied Jaipur palace illustration EXACTLY as it is: same composition, architecture, palette, sun, sky, palms, stairs, background, dimensions, and flat simplified style. Make ONE change only: add ONE small elegant stylized single-humped camel standing in side profile, facing right, on the frontmost terrace in the lower-left foreground. Place its feet on the terrace at around 83% image height, its body around 75-79% height, spanning roughly 12%-29% of image width. It must feel like a small merchant camel in the scene, with long thin legs, curved neck, one clearly readable hump and a simple small saddle blanket, no rider, no reins crossing the picture. Render it in solid warm deep brown #674c35 with just a small sandstone saddle shape #dfbd99, in the same flat cut-paper graphic illustration style as the building. Do not introduce realistic animal detail, fur, eyes, shading, or outlines. Keep camel small relative to the palace, do not block the central three arches, do not cover the quiet bottom 12% reserved for a separate caption. No text, no cards, no extra people, no extra objects, no new decorations. Preserve all other pixels and shapes as closely as possible.

## 骆驼放大版本

内置 imagegen 编辑提示词：

> Use case: precise-object-edit. Edit the supplied flat Jaipur palace illustration. Change ONLY the camel: make the existing single camel in the lower-left foreground approximately 1.6 times larger in both width and height. Keep its feet at the same ground baseline, and keep it within the left foreground so it does not obstruct the central palace entrance. It should be clearly visible at small web-menu display size, about 23% of image width. Preserve the same side profile facing right, single hump, warm deep brown silhouette and sandstone saddle blanket. Preserve the palace, arches, sun disk, sky, palms, terraces, colors, style, crop and all other elements exactly. No text, no extra camels, no additional objects, no photorealism. The camel should remain a restrained flat graphic silhouette matching the illustration.
