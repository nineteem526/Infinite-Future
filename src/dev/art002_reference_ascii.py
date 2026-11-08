"""ASCII preview of the 2D frame reference (inspection only)."""
from PIL import Image, ImageOps

image = Image.open("art-pipeline/gallery-frame-front-reference.jpg").convert("L")
image = ImageOps.autocontrast(image)
width = 64
height = max(1, round(image.height / image.width * width * 0.5))
small = image.resize((width, height), Image.LANCZOS)
chars = " .:-=+*#%@"
pixels = list(small.getdata())
for y in range(height):
    row = pixels[y * width:(y + 1) * width]
    print("".join(chars[min(len(chars) - 1, value * len(chars) // 256)] for value in row))
