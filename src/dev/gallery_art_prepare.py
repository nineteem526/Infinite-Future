"""Generate the two temporary gallery painting textures (sources untouched)."""
from pathlib import Path

from PIL import Image

TARGET_WIDTH = 1088
TARGET_HEIGHT = 704  # 3.4:2.2 canvas aspect
SOURCES = [
    ("art-pipeline/暮色钟城广场.png", "public/assets/gallery-art-2026.jpg"),
    ("art-pipeline/末日钟塔广场的黄昏废墟.png", "public/assets/gallery-art-2126.jpg"),
]
aspect = TARGET_WIDTH / TARGET_HEIGHT
for source, destination in SOURCES:
    image = Image.open(source).convert("RGB")
    width, height = image.size
    # Center-crop to the canvas aspect, then downscale to a local texture size.
    if width / height > aspect:
        crop_width = round(height * aspect)
        left = (width - crop_width) // 2
        image = image.crop((left, 0, left + crop_width, height))
    else:
        crop_height = round(width / aspect)
        top = (height - crop_height) // 2
        image = image.crop((0, top, width, top + crop_height))
    image = image.resize((TARGET_WIDTH, TARGET_HEIGHT), Image.LANCZOS)
    destination_path = Path(destination)
    destination_path.parent.mkdir(parents=True, exist_ok=True)
    image.save(destination_path, "JPEG", quality=86, optimize=True)
    print(f"{source} -> {destination} ({destination_path.stat().st_size} bytes, {image.size[0]}x{image.size[1]})")
