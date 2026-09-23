import math
from PIL import Image, ImageDraw, ImageFilter

def create_pwa_icon(size, is_maskable=False):
    # Base image with high resolution supersampling (4x) for smooth antialiasing
    scale = 4
    canvas_size = size * scale
    img = Image.new("RGBA", (canvas_size, canvas_size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Background
    bg_color = (11, 19, 38, 255) # #0b1326
    
    if is_maskable:
        # Full bleed background for adaptive icons
        draw.rectangle([(0, 0), (canvas_size, canvas_size)], fill=bg_color)
    else:
        # Rounded squircle for standard icon / apple icon
        corner_radius = int(canvas_size * 0.22)
        draw.rounded_rectangle(
            [(0, 0), (canvas_size - 1, canvas_size - 1)],
            radius=corner_radius,
            fill=bg_color
        )

    # Subtle inner border/ring
    ring_margin = int(canvas_size * 0.03)
    if not is_maskable:
        corner_inner = max(4, corner_radius - ring_margin)
        draw.rounded_rectangle(
            [(ring_margin, ring_margin), (canvas_size - 1 - ring_margin, canvas_size - 1 - ring_margin)],
            radius=corner_inner,
            outline=(76, 215, 246, 35), # 4cd7f6 with subtle opacity
            width=scale * 2
        )

    # Center coordinates
    cx = canvas_size // 2
    cy = canvas_size // 2

    # Scale of graphic inside icon:
    # If maskable, safe zone is 80% diameter (r = 40% of size).
    # Normal icon can be slightly larger.
    target_radius = int(canvas_size * (0.28 if is_maskable else 0.32))

    # Glow layer
    glow_img = Image.new("RGBA", (canvas_size, canvas_size), (0, 0, 0, 0))
    glow_draw = ImageDraw.Draw(glow_img)
    
    # Outer circular glow
    glow_draw.ellipse(
        [(cx - target_radius - 20 * scale, cy - target_radius - 20 * scale),
         (cx + target_radius + 20 * scale, cy + target_radius + 20 * scale)],
        fill=(76, 215, 246, 40)
    )
    glow_img = glow_img.filter(ImageFilter.GaussianBlur(radius=15 * scale))
    img.alpha_composite(glow_img)

    # Circular Badge in center
    badge_img = Image.new("RGBA", (canvas_size, canvas_size), (0, 0, 0, 0))
    badge_draw = ImageDraw.Draw(badge_img)
    
    badge_draw.ellipse(
        [(cx - target_radius, cy - target_radius),
         (cx + target_radius, cy + target_radius)],
        fill=(23, 31, 51, 230), # #171f33
        outline=(76, 215, 246, 220), # #4cd7f6
        width=int(scale * 3.5)
    )

    # Draw stylish music note in cyan / teal gradient inside badge
    # Musical note path:
    # Note head (circle at bottom left): cx - note_r, cy + note_offset
    # Stem going up to cy - note_top
    # Note flag curving right
    note_color = (76, 215, 246, 255) # #4cd7f6 primary
    head_r = int(target_radius * 0.38)
    head_cx = cx - int(target_radius * 0.22)
    head_cy = cy + int(target_radius * 0.32)

    # Elliptical rotated note head
    badge_draw.ellipse(
        [(head_cx - head_r, head_cy - int(head_r * 0.75)),
         (head_cx + head_r, head_cy + int(head_r * 0.75))],
        fill=note_color
    )

    # Stem
    stem_w = int(scale * 4.5)
    stem_x = head_cx + head_r - stem_w // 2
    stem_y_top = cy - int(target_radius * 0.52)
    stem_y_bottom = head_cy
    badge_draw.rectangle(
        [(stem_x, stem_y_top), (stem_x + stem_w, stem_y_bottom)],
        fill=note_color
    )

    # Flag / Beam
    beam_w = int(target_radius * 0.58)
    beam_h = int(target_radius * 0.24)
    badge_draw.polygon(
        [
            (stem_x, stem_y_top),
            (stem_x + beam_w, stem_y_top + int(scale * 5)),
            (stem_x + beam_w, stem_y_top + beam_h + int(scale * 5)),
            (stem_x, stem_y_top + beam_h)
        ],
        fill=note_color
    )

    # Accent audio equalizer dots/waves on right side
    wave_x = cx + int(target_radius * 0.46)
    for i, bar_h in enumerate([0.3, 0.55, 0.38]):
        bx = wave_x + i * int(scale * 6)
        bh = int(target_radius * bar_h)
        by1 = cy - bh // 2
        by2 = cy + bh // 2
        badge_draw.line(
            [(bx, by1), (bx, by2)],
            fill=(208, 188, 255, 230), # secondary color #d0bcff
            width=int(scale * 2.5)
        )

    img.alpha_composite(badge_img)

    # Downsample cleanly using Lanczos
    result = img.resize((size, size), Image.Resampling.LANCZOS)
    return result

if __name__ == "__main__":
    import os
    out_dir = "/home/student12/Documents/Music_Player/public"
    os.makedirs(out_dir, exist_ok=True)

    sizes = [
        (192, "icon-192.png", False),
        (512, "icon-512.png", False),
        (512, "icon-512-maskable.png", True),
        (180, "apple-touch-icon.png", False),
    ]

    for size, filename, is_maskable in sizes:
        filepath = os.path.join(out_dir, filename)
        icon = create_pwa_icon(size, is_maskable=is_maskable)
        icon.save(filepath, "PNG")
        print(f"Generated {filepath} ({size}x{size}, maskable={is_maskable})")
