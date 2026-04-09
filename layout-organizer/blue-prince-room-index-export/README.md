# Blue Prince Room Index Export

This bundle is intended for small external tools/apps.

Contents:
- rooms.json        compact manifest for app lookup/filtering
- rooms_full.json   fuller raw export from wiki parsing
- rooms_full.yaml   same fuller data in YAML
- icons/            110 square room tile PNGs (512x512)

rooms.json schema:
- id: numeric room order in the canonical directory-based export
- title: canonical room name
- slug: stable lowercase hyphen slug
- group: one of blueprints, bedrooms, hallways, green_rooms, shops, red_rooms, studio_additions, found_floorplans, outer_rooms
- groupColor: display color/category hint
- groupOrder: ordinal within its group
- typeTags: parsed type/category tags from the room page
- rarity: parsed rarity field when available
- cost: parsed gem cost field when available
- description: parsed gameplay description when available
- directoryBlurb: the Mount Holly Directory flavor blurb when available
- unlock: parsed unlock text when available
- secrets: short parsed secrets list when available
- icon: relative path to the square tile PNG for the room
