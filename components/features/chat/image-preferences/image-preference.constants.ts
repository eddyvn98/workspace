export const FLOOR_PLAN_STYLES: ImagePreferenceOption[] = [
	{ value: "modern style, white and wood tones", label: "Modern (White & Wood)", thumbnail: "/images/thumbnails/floor-plan/style/modern.png" },
	{ value: "minimalist style, smart furniture", label: "Minimalist Smart", thumbnail: "/images/thumbnails/floor-plan/style/minimalist.png" },
	{ value: "Scandinavian style, natural light", label: "Scandinavian Natural", thumbnail: "/images/thumbnails/floor-plan/style/scandinavian.png" },
	{ value: "luxury style, premium materials like marble and gold-plated metal", label: "Luxury Premium", thumbnail: "/images/thumbnails/floor-plan/style/luxury.png" },
	{ value: "Indochine style, combination of traditional and modern", label: "Indochine Fusion", thumbnail: "/images/thumbnails/floor-plan/style/indochine.png" },
];

export const ROOM_TYPES: ImagePreferenceOption[] = [
	{ value: "bedroom", label: "Bedroom", thumbnail: "/images/thumbnails/interior/room/bedroom.png" },
	{ value: "living room", label: "Living Room", thumbnail: "/images/thumbnails/interior/room/living_room.png" },
	{ value: "kitchen", label: "Kitchen", thumbnail: "/images/thumbnails/interior/room/kitchen.png" },
	{ value: "dining room", label: "Dining Room", thumbnail: "/images/thumbnails/interior/room/dining_room.png" },
	{ value: "bathroom", label: "Bathroom", thumbnail: "/images/thumbnails/interior/room/bathroom.png" },
	{ value: "home office", label: "Home Office", thumbnail: "/images/thumbnails/interior/room/home_office.png" },
	{ value: "worship room", label: "Worship Room", thumbnail: "/images/thumbnails/interior/room/worship_room.png" },
	{ value: "lobby", label: "Lobby", thumbnail: "/images/thumbnails/interior/room/lobby.png" },
];

export const COLORING_STYLES: ImagePreferenceOption[] = [
	{ value: "Colorize floorplan in semi-realistic style", label: "Semi-Realistic", thumbnail: "/images/thumbnails/floor-plan/coloring/semi-realistic.png" },
	{ value: "Colorize floorplan with black background and white lines, technical drawing style", label: "Technical Drawing", thumbnail: "/images/thumbnails/floor-plan/coloring/technical-drawing.png" },
	{ value: "Colorize floorplan in Material Base style, highlighting wood, brick, concrete", label: "Material Base", thumbnail: "/images/thumbnails/floor-plan/coloring/material-base.png" },
	{ value: "Colorize floorplan in Marker Style, hand-drawn look", label: "Marker Style", thumbnail: "/images/thumbnails/floor-plan/coloring/marker-style.png" },
	{ value: "Colorize floorplan in Watercolor Style", label: "Watercolor", thumbnail: "/images/thumbnails/floor-plan/coloring/watercolor.png" },
	{ value: "Colorize floorplan in Photorealistic style, with shading and realistic materials", label: "Photorealistic", thumbnail: "/images/thumbnails/floor-plan/coloring/photorealistic.png" },
];

export interface ImagePreferenceOption {
	label: string;
	value: string;
	thumbnail?: string;
	group?: string;
}

export const STYLE_IMAGE_OPTIONS: ImagePreferenceOption[] = [
	{ value: "Real site photograph of the actual construction", label: "Real Site Photo" },
	{ value: "V-Ray rendered visualization", label: "V-Ray Render" },
];

export const STYLE_OPTIONS: ImagePreferenceOption[] = [
	{ value: "Sleek International", label: "Sleek International", thumbnail: "/images/thumbnails/architecture/international.png" },
	{ value: "Eco Futurism", label: "Eco Futurism", thumbnail: "/images/thumbnails/architecture/eco_futurism.png" },
	{ value: "Hight Tech", label: "Hight Tech", thumbnail: "/images/thumbnails/architecture/high_tech.png" },
	{ value: "Biomorphic", label: "Biomorphic", thumbnail: "/images/thumbnails/architecture/biomorphic.png" },
	{ value: "Neo Futurism", label: "Neo Futurism", thumbnail: "/images/thumbnails/architecture/futuristic.png" },
	{ value: "Smart City", label: "Smart City", thumbnail: "/images/thumbnails/architecture/smart_city.png" },
	{ value: "Space Colony", label: "Space Colony", thumbnail: "/images/thumbnails/architecture/space_colony.png" },
	{ value: "Minimalisme Verrier", label: "Minimalisme Verrier", thumbnail: "/images/thumbnails/architecture/minimalisme_verrier.png" },
	{ value: "Dynamic Parametric", label: "Dynamic Parametric", thumbnail: "/images/thumbnails/architecture/parametric.png" },
	{ value: "Eco Friendly Sustainable", label: "Eco Friendly Sustainable", thumbnail: "/images/thumbnails/architecture/eco_friendly_sustainable.png" },
	{ value: "Expressive High Tech", label: "Expressive High Tech", thumbnail: "/images/thumbnails/architecture/expressive_high_tech.png" },
	{ value: "Warm Wooden Modern", label: "Warm Wooden Modern", thumbnail: "/images/thumbnails/architecture/warm_wooden_modern.png" },
	{ value: "Cantilevered Contemporary", label: "Cantilevered Contemporary", thumbnail: "/images/thumbnails/architecture/contemporary.png" },
	{ value: "Warehouse Conversion", label: "Warehouse Conversion", thumbnail: "/images/thumbnails/architecture/warehouse_conversion.png" },
	{ value: "Fatory Loft", label: "Fatory Loft", thumbnail: "/images/thumbnails/architecture/factory_loft.png" },
	{ value: "Steel Frame Vintage", label: "Steel Frame Vintage", thumbnail: "/images/thumbnails/architecture/steel_frame_vintage.png" },
	{ value: "Industrial Chic Townhouse", label: "Industrial Chic Townhouse", thumbnail: "/images/thumbnails/architecture/industrial_chic_townhouse.png" },
	{ value: "Repurposed Factory", label: "Repurposed Factory", thumbnail: "/images/thumbnails/architecture/repurposed_factory.png" },
	{ value: "Industrial Farmhouse", label: "Industrial Farmhouse", thumbnail: "/images/thumbnails/architecture/industrial_farmhouse.png" },
	{ value: "Enchanting Gothic", label: "Enchanting Gothic", thumbnail: "/images/thumbnails/architecture/gothic.png" },
	{ value: "Opulent Baroque", label: "Opulent Baroque", thumbnail: "/images/thumbnails/architecture/opulent_baroque.png" },
	{ value: "Earthy Vernacular", label: "Earthy Vernacular", thumbnail: "/images/thumbnails/architecture/earthy_vernacular.png" },
	{ value: "Graceful Moorish", label: "Graceful Moorish", thumbnail: "/images/thumbnails/architecture/graceful_moorish.png" },
	{ value: "Whimsical Art Deco", label: "Whimsical Art Deco", thumbnail: "/images/thumbnails/architecture/art_deco.png" },
	{ value: "Bold Brutalist", label: "Bold Brutalist", thumbnail: "/images/thumbnails/architecture/brutalist.png" },
	{ value: "Playful Post-Modern", label: "Playful Post-Modern", thumbnail: "/images/thumbnails/architecture/postmodern.png" },
	{ value: "Serene Scandinavian", label: "Serene Scandinavian", thumbnail: "/images/thumbnails/architecture/scandinavian.png" },
	{ value: "Curvaceouse Organic", label: "Curvaceouse Organic", thumbnail: "/images/thumbnails/architecture/organic.png" },
	{ value: "Dramatic Deconstructivist", label: "Dramatic Deconstructivist", thumbnail: "/images/thumbnails/architecture/deconstructivism.png" },
	{ value: "Romanesque Revival", label: "Romanesque Revival", thumbnail: "/images/thumbnails/architecture/romanesque.png" },
	{ value: "Gothic Revival", label: "Gothic Revival", thumbnail: "/images/thumbnails/architecture/gothic_revival.png" },
	{ value: "Art Nouveau Revival", label: "Art Nouveau Revival", thumbnail: "/images/thumbnails/architecture/art_nouveau.png" },
	{ value: "Neogothic Revival", label: "Neogothic Revival", thumbnail: "/images/thumbnails/architecture/neogothic_revival.png" },
	{ value: "Tropical Bamboo", label: "Tropical Bamboo", thumbnail: "/images/thumbnails/architecture/tropical_bamboo.png" },
	{ value: "Mediterranean Village", label: "Mediterranean Village", thumbnail: "/images/thumbnails/architecture/mediterranean.png" },
	{ value: "Scandinavian Log Cabin", label: "Scandinavian Log Cabin", thumbnail: "/images/thumbnails/architecture/scandinavian_log_cabin.png" },
	{ value: "Modern", label: "Modern", thumbnail: "/images/thumbnails/architecture/modern.png" },
	{ value: "Neoclassical", label: "Neoclassical", thumbnail: "/images/thumbnails/architecture/neoclassic.png" },
	{ value: "Minimalism", label: "Minimalism", thumbnail: "/images/thumbnails/architecture/minimalist.png" },
	{ value: "Indochine", label: "Indochine", thumbnail: "/images/thumbnails/architecture/indochine.png" },
	{ value: "Nordic (Scandinavian)", label: "Nordic (Scandinavian)", thumbnail: "/images/thumbnails/architecture/scandinavian.png" },
	{ value: "Wabi Sabi", label: "Wabi Sabi", thumbnail: "/images/thumbnails/architecture/wabi_sabi.png" },
	{ value: "Industry", label: "Industry", thumbnail: "/images/thumbnails/architecture/industrial.png" },
	{ value: "Tropical", label: "Tropical", thumbnail: "/images/thumbnails/architecture/tropical.png" },
	{ value: "Classical", label: "Classical", thumbnail: "/images/thumbnails/architecture/classical.png" },
	{ value: "Rustic", label: "Rustic", thumbnail: "/images/thumbnails/architecture/rustic.png" },
	{ value: "Free-spirited (Bohemian / Boho)", label: "Free-spirited (Bohemian / Boho)", thumbnail: "/images/thumbnails/architecture/bohemian.png" },
	{ value: "Vietnamese Shophouse", label: "Vietnamese Shophouse", thumbnail: "/images/thumbnails/architecture/vietnamese_shophouse.png" },
];

export const SETTING_OPTIONS: ImagePreferenceOption[] = [
	// Exactly 19 backgrounds
	{ value: "on a City Street", label: "City Street", thumbnail: "/images/thumbnails/architecture/setting/city_street.png" },
	{ value: "in a Rural Village", label: "Rural Village", thumbnail: "/images/thumbnails/architecture/setting/rural.png" },
	{ value: "in a modern Urban Area", label: "Modern Urban Area", thumbnail: "/images/thumbnails/architecture/setting/vinhomes.png" },
	{ value: "at a street Intersection", label: "Street Intersection", thumbnail: "/images/thumbnails/architecture/setting/intersection.png" },
	{ value: "by the Sea Beach", label: "Sea Beach", thumbnail: "/images/thumbnails/architecture/setting/sea.png" },
	{ value: "on a Hilltop", label: "Hilltop", thumbnail: "/images/thumbnails/architecture/setting/hill.png" },
	{ value: "in a Tropical Garden", label: "Tropical Garden", thumbnail: "/images/thumbnails/architecture/setting/tropical.png" },
	{ value: "next to a Lakeside", label: "Lakeside", thumbnail: "/images/thumbnails/architecture/setting/lake.png" },
	{ value: "at the Forest Edge", label: "Forest Edge", thumbnail: "/images/thumbnails/architecture/setting/forest.png" },
	{ value: "in a Desert Oasis", label: "Desert Oasis", thumbnail: "/images/thumbnails/architecture/setting/desert.png" },
	{ value: "in majestic Mountains", label: "Majestic Mountain", thumbnail: "/images/thumbnails/architecture/setting/mountain.png" },
	{ value: "on a Coastal Cliff", label: "Coastal Cliff", thumbnail: "/images/thumbnails/architecture/setting/coastal_cliff.png" },
	{ value: "on a green Grassland", label: "Grassland", thumbnail: "/images/thumbnails/architecture/setting/grassland.png" },
	{ value: "in a snowy Tundra", label: "Snowy Tundra", thumbnail: "/images/thumbnails/architecture/setting/snowy_tundra.png" },
	{ value: "in wetlands", label: "Wetland", thumbnail: "/images/thumbnails/architecture/setting/wetland.png" },
	{ value: "in an Industrial Park", label: "Industrial Park", thumbnail: "/images/thumbnails/architecture/setting/industrial_park.png" },
	{ value: "in a Historical District", label: "Historical District", thumbnail: "/images/thumbnails/architecture/setting/historical_district.png" },
	{ value: "in a Suburban Neighborhood", label: "Suburban", thumbnail: "/images/thumbnails/architecture/setting/suburban.png" },
	{ value: "on a Riverfront", label: "Riverfront", thumbnail: "/images/thumbnails/architecture/setting/riverfront.png" },
];

export const LIGHTING_OPTIONS: ImagePreferenceOption[] = [
	// Time of day
	{ value: "Midday", label: "Midday", group: "Time of day", thumbnail: "/images/thumbnails/architecture/lighting/midday.png" },
	{ value: "Night", label: "Night", group: "Time of day", thumbnail: "/images/thumbnails/architecture/lighting/night_moonlight.png" },
	{ value: "Sunset", label: "Sunset", group: "Time of day", thumbnail: "/images/thumbnails/architecture/lighting/warm_sunset.png" },
	{ value: "Sunrise", label: "Sunrise", group: "Time of day", thumbnail: "/images/thumbnails/architecture/lighting/sunrise_clear.png" },
	{ value: "Golden Hour", label: "Golden Hour", group: "Time of day", thumbnail: "/images/thumbnails/architecture/lighting/golden_hour.png" },
	{ value: "Morning", label: "Morning", group: "Time of day", thumbnail: "/images/thumbnails/architecture/lighting/morning.png" },
	{ value: "Noon", label: "Noon", group: "Time of day", thumbnail: "/images/thumbnails/architecture/lighting/noon_light.png" },
	{ value: "Afternoon", label: "Afternoon", group: "Time of day", thumbnail: "/images/thumbnails/architecture/lighting/afternoon_light.png" },
	{ value: "Dusk", label: "Dusk", group: "Time of day", thumbnail: "/images/thumbnails/architecture/lighting/dusk.png" },
	{ value: "Overcast", label: "Overcast", group: "Time of day", thumbnail: "/images/thumbnails/architecture/lighting/overcast_soft.png" },
	{ value: "Blue Hour", label: "Blue Hour", group: "Time of day", thumbnail: "/images/thumbnails/architecture/lighting/blue_hour.png" },
	{ value: "Natural daylight", label: "Natural daylight", group: "Time of day", thumbnail: "/images/thumbnails/architecture/lighting/natural_daylight.png" },
	{ value: "Warm sunset light, long shadows", label: "Warm sunset light", group: "Time of day", thumbnail: "/images/thumbnails/architecture/lighting/warm_sunset.png" },
	{ value: "Night light, panoramic moonlight", label: "Night light, moonlight", group: "Time of day", thumbnail: "/images/thumbnails/architecture/lighting/night_moonlight.png" },

	// Sky / Weather
	{ value: "Blue", label: "Blue", group: "Sky / Weather", thumbnail: "/images/thumbnails/architecture/lighting/blue.png" },
	{ value: "Storm", label: "Storm", group: "Sky / Weather", thumbnail: "/images/thumbnails/architecture/lighting/storm.png" },
	{ value: "Light rain", label: "Light rain", group: "Sky / Weather", thumbnail: "/images/thumbnails/architecture/lighting/light_rain.png" },
	{ value: "Murky", label: "Murky", group: "Sky / Weather", thumbnail: "/images/thumbnails/architecture/lighting/murky.png" },
	{ value: "Fog", label: "Fog", group: "Sky / Weather", thumbnail: "/images/thumbnails/architecture/lighting/mystical_fog.png" },
	{ value: "Scorching sun", label: "Scorching sun", group: "Sky / Weather", thumbnail: "/images/thumbnails/architecture/lighting/scorching_sun.png" },
	{ value: "Cloudy Sky", label: "Cloudy Sky", group: "Sky / Weather", thumbnail: "/images/thumbnails/architecture/lighting/cloudy_sky.png" },
	{ value: "Rainy Sky", label: "Rainy Sky", group: "Sky / Weather", thumbnail: "/images/thumbnails/architecture/lighting/rainy_sky.png" },
	{ value: "Misty Sky", label: "Misty Sky", group: "Sky / Weather", thumbnail: "/images/thumbnails/architecture/lighting/misty_sky.png" },
	{ value: "Snowy Sky", label: "Snowy Sky", group: "Sky / Weather", thumbnail: "/images/thumbnails/architecture/lighting/snowy_sky.png" },

	// Season
	{ value: "Spring", label: "Spring", group: "Season", thumbnail: "/images/thumbnails/architecture/lighting/spring_blossom.png" },
	{ value: "Summer", label: "Summer", group: "Season", thumbnail: "/images/thumbnails/architecture/lighting/summer_vibrant.png" },
	{ value: "Autumn", label: "Autumn", group: "Season", thumbnail: "/images/thumbnails/architecture/lighting/autumn_golden.png" },
	{ value: "Winter", label: "Winter", group: "Season", thumbnail: "/images/thumbnails/architecture/lighting/winter_cold.png" },

	// Atmosphere
	{ value: "just after rain with slightly wet ground and light cloudy sky", label: "Just after rain, wet ground & light clouds", group: "Atmosphere", thumbnail: "/images/thumbnails/architecture/lighting/after_rain.png" },
	{ value: "overcast sky with soft diffused light and no harsh shadows", label: "Overcast, soft light & no harsh shadows", group: "Atmosphere", thumbnail: "/images/thumbnails/architecture/lighting/overcast_soft.png" },
	{ value: "dense early morning fog creating a mystical atmosphere", label: "Dense morning fog, mystical atmosphere", group: "Atmosphere", thumbnail: "/images/thumbnails/architecture/lighting/mystical_fog.png" },
	{ value: "fresh sunrise with crisp clear air and pristine morning light", label: "Fresh sunrise, crisp clear air & morning light", group: "Atmosphere", thumbnail: "/images/thumbnails/architecture/lighting/sunrise_clear.png" },
];


export const INTERIOR_STYLE_OPTIONS: ImagePreferenceOption[] = [
	{ value: "Luxury Modern", label: "Luxury Modern", thumbnail: "/images/thumbnails/interior/luxury.png" },
	{ value: "Wabi Sabi Luxury", label: "Wabi Sabi Luxury", thumbnail: "/images/thumbnails/interior/wabi_sabi.png" },
	{ value: "Neoclassical", label: "Neoclassical", thumbnail: "/images/thumbnails/interior/neoclassical.png" },
	{ value: "Indochine", label: "Indochine", thumbnail: "/images/thumbnails/interior/indochine.png" },
	{ value: "Minimalist", label: "Minimalist", thumbnail: "/images/thumbnails/interior/minimalism.png" },
	{ value: "Industrial Luxury", label: "Industrial Luxury", thumbnail: "/images/thumbnails/interior/industrial.png" },
	{ value: "Contemporary", label: "Contemporary", thumbnail: "/images/thumbnails/interior/modern.png" },
	{ value: "Minimalist Haven", label: "Minimalist Haven", thumbnail: "/images/thumbnails/interior/minimalist_haven.png" },
	{ value: "Modern Fusion", label: "Modern Fusion", thumbnail: "/images/thumbnails/interior/modern_fusion.png" },
	{ value: "Contemporary Elegance", label: "Contemporary Elegance", thumbnail: "/images/thumbnails/interior/contemporary_elegance.png" },
	{ value: "Industrial Loft", label: "Industrial Loft", thumbnail: "/images/thumbnails/interior/industrial_loft.png" },
	{ value: "Bohemian Oasis", label: "Bohemian Oasis", thumbnail: "/images/thumbnails/interior/bohemian_oasis.png" },
	{ value: "Coastal Breeze", label: "Coastal Breeze", thumbnail: "/images/thumbnails/interior/coastal_breeze.png" },
	{ value: "Desert Retreat", label: "Desert Retreat", thumbnail: "/images/thumbnails/interior/desert_retreat.png" },
	{ value: "Moutain Escape", label: "Moutain Escape", thumbnail: "/images/thumbnails/interior/moutain_escape.png" },
	{ value: "Art Deco Glamour", label: "Art Deco Glamour", thumbnail: "/images/thumbnails/interior/art_deco.png" },
	{ value: "Mid-Century Modern", label: "Mid-Century Modern", thumbnail: "/images/thumbnails/interior/mid_century_modern.png" },
	{ value: "French Country Charm", label: "French Country Charm", thumbnail: "/images/thumbnails/interior/french_country_charm.png" },
	{ value: "Scandinavian Sanctuary", label: "Scandinavian Sanctuary", thumbnail: "/images/thumbnails/interior/scandinavian.png" },
	{ value: "Japanese Zen", label: "Japanese Zen", thumbnail: "/images/thumbnails/interior/japanese_zen.png" },
	{ value: "Moroccan Mystique", label: "Moroccan Mystique", thumbnail: "/images/thumbnails/interior/moroccan_mystique.png" },
	{ value: "Mediterranean Retreat", label: "Mediterranean Retreat", thumbnail: "/images/thumbnails/interior/mediterranean_retreat.png" },
	{ value: "Traveler's Trove", label: "Traveler's Trove", thumbnail: "/images/thumbnails/interior/travelers_trove.png" },
	{ value: "Cyber Eclectic Fusion", label: "Cyber Eclectic Fusion", thumbnail: "/images/thumbnails/interior/cyber_eclectic_fusion.png" },
	{ value: "Neon Noir", label: "Neon Noir", thumbnail: "/images/thumbnails/interior/neon_noir.png" },
	{ value: "Techno Wonderland", label: "Techno Wonderland", thumbnail: "/images/thumbnails/interior/techno_wonderland.png" },
	{ value: "Retro Futurism", label: "Retro Futurism", thumbnail: "/images/thumbnails/interior/retro_futurism.png" },
	{ value: "Digital Zen", label: "Digital Zen", thumbnail: "/images/thumbnails/interior/digital_zen.png" },
	{ value: "Rustic", label: "Rustic", thumbnail: "/images/thumbnails/interior/rustic.png" },
	{ value: "Vintage", label: "Vintage", thumbnail: "/images/thumbnails/interior/vintage.png" },
	{ value: "Shabby Chic", label: "Shabby Chic", thumbnail: "/images/thumbnails/interior/shabby_chic.png" }
];

export const INTERIOR_SETTING_OPTIONS: ImagePreferenceOption[] = [
	// Group 1
	{ value: "Livingroom", label: "Livingroom", group: "Residential", thumbnail: "/images/thumbnails/interior/setting/living_room.png" },
	{ value: "Kitchen", label: "Kitchen", group: "Residential", thumbnail: "/images/thumbnails/interior/room/kitchen.png" },
	{ value: "Bedroom", label: "Bedroom", group: "Residential", thumbnail: "/images/thumbnails/interior/room/bedroom.png" },
	{ value: "Bathroom", label: "Bathroom", group: "Residential", thumbnail: "/images/thumbnails/interior/setting/bathroom.png" },
	{ value: "Mudroom", label: "Mudroom", group: "Residential" },
	{ value: "Dining room", label: "Dining room", group: "Residential", thumbnail: "/images/thumbnails/interior/room/dining_room.png" },

	// Group 2
	{ value: "Study Room", label: "Study Room", group: "Private & Outdoor" },
	{ value: "Home Office", label: "Home Office", group: "Private & Outdoor", thumbnail: "/images/thumbnails/interior/setting/home_office.png" },
	{ value: "Walk in Closet", label: "Walk in Closet", group: "Private & Outdoor" },
	{ value: "Balcony", label: "Balcony", group: "Private & Outdoor" },
	{ value: "Rooftop", label: "Rooftop", group: "Private & Outdoor" },
	{ value: "Toilet", label: "Toilet", group: "Private & Outdoor" },

	// Group 3
	{ value: "Outdoor Pool Area", label: "Outdoor Pool Area", group: "Leisure & Fitness" },
	{ value: "Outdoor Patio", label: "Outdoor Patio", group: "Leisure & Fitness" },
	{ value: "Fitness/Gym", label: "Fitness/Gym", group: "Leisure & Fitness" },

	// Group 4
	{ value: "Meeting Room", label: "Meeting Room", group: "Work & Office" },
	{ value: "Workshop", label: "Workshop", group: "Work & Office" },
	{ value: "Office", label: "Office", group: "Work & Office" },
	{ value: "Coworking Space", label: "Coworking Space", group: "Work & Office" },

	// Group 5
	{ value: "Coffee Shop", label: "Coffee Shop", group: "Commercial & Hospitality" },
	{ value: "Clothing Store", label: "Clothing Store", group: "Commercial & Hospitality" },
	{ value: "Restaurant", label: "Restaurant", group: "Commercial & Hospitality" },
	{ value: "Hotel Lobby", label: "Hotel Lobby", group: "Commercial & Hospitality", thumbnail: "/images/thumbnails/interior/setting/lobby.png" },
	{ value: "Hotel Room", label: "Hotel Room", group: "Commercial & Hospitality" },
	{ value: "Showroom", label: "Showroom", group: "Commercial & Hospitality" },
	{ value: "Hotel Ballroom", label: "Hotel Ballroom", group: "Commercial & Hospitality" },
	{ value: "Exhibition Space", label: "Exhibition Space", group: "Commercial & Hospitality" },

	// Group 6
	{ value: "Outdoor Garden", label: "Outdoor Garden", group: "Recreation & Exterior" },
	{ value: "Bar", label: "Bar", group: "Recreation & Exterior" },
	{ value: "Gaming Room", label: "Gaming Room", group: "Recreation & Exterior" },
	{ value: "Barn", label: "Barn", group: "Recreation & Exterior" },
	{ value: "House Exterior", label: "House Exterior", group: "Recreation & Exterior" }
];

export const INTERIOR_LIGHTING_OPTIONS: ImagePreferenceOption[] = [
	...LIGHTING_OPTIONS,
	{ value: "natural daylight", label: "Natural Daylight", group: "Lighting", thumbnail: "/images/thumbnails/interior/lighting/natural_daylight.png" },
	{ value: "warm night light", label: "Warm Night Light", group: "Lighting", thumbnail: "/images/thumbnails/interior/lighting/warm_night_light.png" },
	{ value: "golden hour", label: "Golden Hour", group: "Lighting", thumbnail: "/images/thumbnails/interior/lighting/golden_hour.png" },
	{ value: "blue hour", label: "Blue Hour", group: "Lighting", thumbnail: "/images/thumbnails/interior/lighting/blue_hour.png" },
	{ value: "studio lighting", label: "Studio Lighting", group: "Lighting", thumbnail: "/images/thumbnails/interior/lighting/studio_lighting.png" },
	{ value: "soft overcast", label: "Soft Overcast", group: "Lighting", thumbnail: "/images/thumbnails/interior/lighting/soft_overcast.png" },
];

export const PLANNING_TARGET_OPTIONS: ImagePreferenceOption[] = [
	{ value: "Urban Area", label: "Urban Area", thumbnail: "/images/thumbnails/planning/target/urban_area.png" },
	{ value: "Industrial Zone", label: "Industrial Zone", thumbnail: "/images/thumbnails/planning/target/industrial_zone.png" },
	{ value: "Tourism Area", label: "Tourism Area", thumbnail: "/images/thumbnails/planning/target/tourism_area.png" },
	{ value: "Rural Residential", label: "Rural Residential", thumbnail: "/images/thumbnails/planning/target/rural_residential.png" },
	{ value: "Theme Park", label: "Theme Park", thumbnail: "/images/thumbnails/planning/target/theme_park.png" },
	{ value: "Technical Infrastructure", label: "Infrastructure", thumbnail: "/images/thumbnails/planning/target/infrastructure.png" },
];

export const PLANNING_STYLE_OPTIONS: ImagePreferenceOption[] = [
	{ value: "Garden City", label: "Garden City", thumbnail: "/images/thumbnails/planning/style/garden_city.png" },
	{ value: "New Urbanism", label: "New Urbanism", thumbnail: "/images/thumbnails/planning/style/new_urbanism.png" },
	{ value: "Transit-Oriented Development", label: "Transit-Oriented Development", thumbnail: "/images/thumbnails/planning/style/transit_oriented_development.png" },
	{ value: "Smart City", label: "Smart City", thumbnail: "/images/thumbnails/planning/style/smart_city.png" },
	{ value: "Eco-City", label: "Eco-City", thumbnail: "/images/thumbnails/planning/style/eco_city.png" },
	{ value: "Sponge City", label: "Sponge City", thumbnail: "/images/thumbnails/planning/style/sponge_city.png" },
	{ value: "Biophilic City", label: "Biophilic City", thumbnail: "/images/thumbnails/planning/style/biophilic_city.png" },
	{ value: "15-Minute City", label: "15-Minute City", thumbnail: "/images/thumbnails/planning/style/15_minute_city.png" },
	{ value: "Carbon-Neutral District", label: "Carbon-Neutral District", thumbnail: "/images/thumbnails/planning/style/carbon_neutral_district.png" },
	{ value: "Compact City", label: "Compact City", thumbnail: "/images/thumbnails/planning/style/compact_city.png" },
	{ value: "Modernist Superblock", label: "Modernist Superblock", thumbnail: "/images/thumbnails/planning/style/modernist_superblock.png" },
	{ value: "Radiant City", label: "Radiant City", thumbnail: "/images/thumbnails/planning/style/radiant_city.png" },
	{ value: "Traditional Neighborhood", label: "Traditional Neighborhood", thumbnail: "/images/thumbnails/planning/style/traditional_neighborhood.png" },
	{ value: "Brutalist Megastructure", label: "Brutalist Megastructure", thumbnail: "/images/thumbnails/planning/style/brutalist_megastructure.png" },
	{ value: "Post-Modern Urbanism", label: "Post-Modern Urbanism", thumbnail: "/images/thumbnails/planning/style/post_modern_urbanism.png" },
	{ value: "Deconstructivist Masterplan", label: "Deconstructivist Masterplan", thumbnail: "/images/thumbnails/planning/style/deconstructivist_masterplan.png" },
	{ value: "Parametric Urbanism", label: "Parametric Urbanism", thumbnail: "/images/thumbnails/planning/style/parametric_urbanism.png" },
	{ value: "Arcology", label: "Arcology", thumbnail: "/images/thumbnails/planning/style/arcology.png" },
	{ value: "Mediterranean Old Town", label: "Mediterranean Old Town", thumbnail: "/images/thumbnails/planning/style/mediterranean_old_town.png" },
	{ value: "Arabic Medina", label: "Arabic Medina", thumbnail: "/images/thumbnails/planning/style/arabic_medina.png" },
	{ value: "Chinese Classical Courtyard", label: "Chinese Classical Courtyard", thumbnail: "/images/thumbnails/planning/style/chinese_classical_courtyard.png" },
	{ value: "Japanese Machiya", label: "Japanese Machiya", thumbnail: "/images/thumbnails/planning/style/japanese_machiya.png" },
	{ value: "Latin Colonial Grid", label: "Latin Colonial Grid", thumbnail: "/images/thumbnails/planning/style/latin_colonial_grid.png" },
	{ value: "Nordic Cooperative", label: "Nordic Cooperative", thumbnail: "/images/thumbnails/planning/style/nordic_cooperative.png" }
];

export const PLANNING_BUILDING_OPTIONS: ImagePreferenceOption[] = [
	{ value: "Detached Villa", label: "Detached Villa", thumbnail: "/images/thumbnails/planning/building/detached_villa.png" },
	{ value: "Townhouse & Shophouse", label: "Townhouse", thumbnail: "/images/thumbnails/planning/building/townhouse.png" },
	{ value: "High-rise Building", label: "High-rise", thumbnail: "/images/thumbnails/planning/building/high_rise.png" },
	{ value: "Shopping Center", label: "Shopping Center", thumbnail: "/images/thumbnails/planning/building/shopping_center.png" },
	{ value: "School", label: "School", thumbnail: "/images/thumbnails/planning/building/school.png" },
	{ value: "Green Park", label: "Green Park", thumbnail: "/images/thumbnails/planning/building/green_park.png" },
	{ value: "Lake", label: "Lake", thumbnail: "/images/thumbnails/planning/building/lake.png" },
	{ value: "Cafe Shop", label: "Cafe Shop", thumbnail: "/images/thumbnails/planning/building/cafe_shop.png" },
	{ value: "Bungalow", label: "Bungalow", thumbnail: "/images/thumbnails/planning/building/bungalow.png" },
	{ value: "Central Square", label: "Central Square", thumbnail: "/images/thumbnails/planning/building/central_square.png" },
];

export const PLANNING_CONTEXT_OPTIONS: ImagePreferenceOption[] = [
	{ value: "Surrounding it are fields and villages", label: "Surrounding it are fields and villages", thumbnail: "/images/thumbnails/planning/context/rural_fields.png" },
	{ value: "Surrounding areas include urban centers and transportation routes", label: "Surrounding areas include urban centers and transportation routes", thumbnail: "/images/thumbnails/planning/context/urban_traffic.png" },
	{ value: "Surrounded by majestic hills and valleys", label: "Surrounded by majestic hills and valleys", thumbnail: "/images/thumbnails/planning/context/mountains.png" },
	{ value: "Surrounding the area are parks, lakes, and greenery", label: "Surrounding the area are parks, lakes, and greenery", thumbnail: "/images/thumbnails/planning/context/parks_lakes.png" },
	{ value: "Surrounded by the coast and resort areas", label: "Surrounded by the coast and resort areas", thumbnail: "/images/thumbnails/planning/context/coastline.png" },
	{ value: "Surrounding area includes a high-tech and industrial complex", label: "Surrounding area includes a high-tech and industrial complex", thumbnail: "/images/thumbnails/planning/context/industrial_complexes.png" },
];

export const PLANNING_LIGHTING_OPTIONS: ImagePreferenceOption[] = [
	{ value: "Early Morning", label: "Early Morning", thumbnail: "/images/thumbnails/planning/lighting/early_morning.png" },
	{ value: "Bright Daylight", label: "Bright Daylight", thumbnail: "/images/thumbnails/planning/lighting/bright_daylight.png" },
	{ value: "Golden Hour", label: "Golden Hour", thumbnail: "/images/thumbnails/planning/lighting/golden_hour.png" },
	{ value: "Purple Sunset", label: "Purple Sunset", thumbnail: "/images/thumbnails/planning/lighting/purple_sunset.png" },
	{ value: "Urban Night", label: "Urban Night", thumbnail: "/images/thumbnails/planning/lighting/urban_night.png" },
	{ value: "Overcast", label: "Overcast", thumbnail: "/images/thumbnails/planning/lighting/overcast.png" },
	{ value: "Misty Morning", label: "Misty Morning", thumbnail: "/images/thumbnails/planning/lighting/misty_morning.png" },
];

export const CAMERA_ANGLE_OPTIONS: ImagePreferenceOption[] = [
	{ value: "Top-down high angle", label: "Top-down", thumbnail: "/images/thumbnails/camera/top_down.png" },
	{ value: "Low angle (majestic)", label: "Low Angle", thumbnail: "/images/thumbnails/camera/low_angle.png" },
	{ value: "3/4 view from left", label: "3/4 Left", thumbnail: "/images/thumbnails/camera/three_quarter_left.png" },
	{ value: "3/4 view from right", label: "3/4 Right", thumbnail: "/images/thumbnails/camera/three_quarter_right.png" },
	{ value: "Macro detail shot", label: "Macro Detail", thumbnail: "/images/thumbnails/camera/macro_detail.png" },
	{ value: "Frontal symmetrical shot", label: "Frontal", thumbnail: "/images/thumbnails/camera/frontal_symmetrical.png" },
];

export const ARCHITECTURE_PRESET_OPTIONS: ImagePreferenceOption[] = [
	{ value: "PANORAMA 1 (SUNRISE)", label: "Panorama Sunrise", thumbnail: "/images/thumbnails/architecture/preset/panorama_sunrise.png" },
	{ value: "PANORAMA 2 (SUNSET)", label: "Panorama Sunset", thumbnail: "/images/thumbnails/architecture/preset/panorama_sunset.png" },
	{ value: "PANORAMA 3 (BIRD'S EYE)", label: "Bird's Eye", thumbnail: "/images/thumbnails/architecture/preset/panorama_birds_eye.png" },
	{ value: "CLOSEUP 1 (SURFACE MATERIAL)", label: "Surface Material", thumbnail: "/images/thumbnails/architecture/preset/closeup_material.png" },
	{ value: "CLOSEUP 2 (STRUCTURAL DETAIL)", label: "Structural Detail", thumbnail: "/images/thumbnails/architecture/preset/closeup_structural.png" },
	{ value: "CLOSEUP 3 (ENTRANCE & LOBBY)", label: "Entrance & Lobby", thumbnail: "/images/thumbnails/architecture/preset/closeup_entrance.png" },
	{ value: "CLOSEUP 4 (ARCHITECTURAL ANGLE)", label: "Arch Angle", thumbnail: "/images/thumbnails/architecture/preset/closeup_angle.png" },
	{ value: "ARTISTIC 1 (FOREGROUND BOKEH)", label: "Artistic Bokeh", thumbnail: "/images/thumbnails/architecture/preset/artistic_bokeh.png" },
	{ value: "ARTISTIC 2 (NIGHT VIEW)", label: "Artistic Night", thumbnail: "/images/thumbnails/architecture/preset/artistic_night.png" },
];

export const INTERIOR_PRESET_OPTIONS: ImagePreferenceOption[] = [
	{ value: "CLOSEUP SOFA & FABRIC", label: "Sofa & Fabric", thumbnail: "/images/thumbnails/interior/preset/interior_sofa.png" },
	{ value: "CLOSEUP TABLE & DECOR", label: "Table & Decor", thumbnail: "/images/thumbnails/interior/preset/interior_table.png" },
	{ value: "CLOSEUP LIGHTS & ILLUMINATION", label: "Lights & Illumination", thumbnail: "/images/thumbnails/interior/preset/interior_lights.png" },
	{ value: "WOOD & STONE TEXTURE DETAILS", label: "Wood & Stone", thumbnail: "/images/thumbnails/interior/preset/interior_wood_stone.png" },
	{ value: "METAL & JOINT DETAILS", label: "Metal & Joint", thumbnail: "/images/thumbnails/interior/preset/interior_metal_joint.png" },
	{ value: "ARTISTIC DECOR ANGLE", label: "Decor Angle", thumbnail: "/images/thumbnails/interior/preset/interior_decor_angle.png" },
	{ value: "BOKEH (BACKGROUND BLUR)", label: "Bokeh Blur", thumbnail: "/images/thumbnails/interior/preset/interior_bokeh.png" },
	{ value: "CHIAROSCURO CONTRAST", label: "Chiaroscuro", thumbnail: "/images/thumbnails/interior/preset/interior_chiaroscuro.png" },
	{ value: "MINIMALIST COMPOSITION", label: "Minimalist", thumbnail: "/images/thumbnails/interior/preset/interior_minimalist.png" },
];

export interface BuildingSubtype {
	value: string;
	label: string;
	thumbnail?: string;
}

export interface BuildingCategory {
	value: string;
	label: string;
	subtypes: BuildingSubtype[];
}

export const EXTERIOR_BUILDING_CATEGORIES: BuildingCategory[] = [
	{
		value: "Residential",
		label: "Residential",
		subtypes: [
			{ value: "Single Family", label: "Single Family", thumbnail: "/images/thumbnails/architecture/type/single_family.png" },
			{ value: "Townhouse", label: "Townhouse", thumbnail: "/images/thumbnails/architecture/type/townhouse.png" },
			{ value: "Condominium", label: "Condominium", thumbnail: "/images/thumbnails/architecture/type/condominium.png" },
			{ value: "Apartment", label: "Apartment", thumbnail: "/images/thumbnails/architecture/type/apartment.png" },
		],
	},
	{
		value: "Commercial",
		label: "Commercial",
		subtypes: [
			{ value: "Office Building", label: "Office Building", thumbnail: "/images/thumbnails/architecture/type/office_building.png" },
			{ value: "Bank", label: "Bank", thumbnail: "/images/thumbnails/architecture/type/bank.png" },
			{ value: "Shopping Mall", label: "Shopping Mall", thumbnail: "/images/thumbnails/architecture/type/shopping_mall.png" },
			{ value: "Hotel", label: "Hotel", thumbnail: "/images/thumbnails/architecture/type/hotel.png" },
			{ value: "Retail Store", label: "Retail Store", thumbnail: "/images/thumbnails/architecture/type/retail_store.png" },
			{ value: "Restaurant", label: "Restaurant", thumbnail: "/images/thumbnails/architecture/type/restaurant.png" },
		],
	},
	{
		value: "Public",
		label: "Public",
		subtypes: [
			{ value: "School", label: "School", thumbnail: "/images/thumbnails/architecture/type/school.png" },
			{ value: "University", label: "University", thumbnail: "/images/thumbnails/architecture/type/university.png" },
			{ value: "Hospital", label: "Hospital", thumbnail: "/images/thumbnails/architecture/type/hospital.png" },
			{ value: "Library", label: "Library", thumbnail: "/images/thumbnails/architecture/type/library.png" },
			{ value: "Public Services", label: "Public Services", thumbnail: "/images/thumbnails/architecture/type/public_services.png" },
			{ value: "Courthouse", label: "Courthouse", thumbnail: "/images/thumbnails/architecture/type/courthouse.png" },
		],
	},
	{
		value: "Cultural",
		label: "Cultural",
		subtypes: [
			{ value: "Sports Arena", label: "Sports Arena", thumbnail: "/images/thumbnails/architecture/type/sports_arena.png" },
			{ value: "Concert Hall", label: "Concert Hall", thumbnail: "/images/thumbnails/architecture/type/concert_hall.png" },
			{ value: "Theater", label: "Theater", thumbnail: "/images/thumbnails/architecture/type/theater.png" },
			{ value: "Museum", label: "Museum", thumbnail: "/images/thumbnails/architecture/type/museum.png" },
		],
	},
	{
		value: "Transportation",
		label: "Transportation",
		subtypes: [
			{ value: "Airport", label: "Airport", thumbnail: "/images/thumbnails/architecture/type/airport.png" },
			{ value: "Bus Station", label: "Bus Station", thumbnail: "/images/thumbnails/architecture/type/bus_station.png" },
			{ value: "Subway Station", label: "Subway Station", thumbnail: "/images/thumbnails/architecture/type/subway_station.png" },
			{ value: "Train Station", label: "Train Station", thumbnail: "/images/thumbnails/architecture/type/train_station.png" },
		],
	},
	{
		value: "Custom",
		label: "Custom",
		subtypes: [],
	},
];

export const TREES_FLOWERS_OPTIONS: ImagePreferenceOption[] = [
	{ value: "Urban sidewalk trees (Banyan, Flame Tree, Crape Myrtle)", label: "Urban sidewalk trees (Banyan, Flame Tree, Crape Myrtle)" },
	{ value: "Climbing trellis for gates/Balconies (Bougainvillea, Honeysuckle)", label: "Climbing trellis for gates/Balconies (Bougainvillea, Honeysuckle)" },
	{ value: "Tropical garden landscape (Ornamental banana, Anubias, Ferns)", label: "Tropical garden landscape (Ornamental banana, Anubias, Ferns)" },
	{ value: "Ornamental Bamboo/Reed plants along fence", label: "Ornamental Bamboo/Reed plants along fence" },
	{ value: "Bonsai trees and ceramic pots decorate front yard", label: "Bonsai trees and ceramic pots decorate front yard" },
	{ value: "Rooftop fruit/Vegetable garden", label: "Rooftop fruit/Vegetable garden" },
	{ value: "Japanese velvet grass combined with stepping stones", label: "Japanese velvet grass combined with stepping stones" },
	{ value: "Modern neatly trimmed low shrub", label: "Modern neatly trimmed low shrub" },
	{ value: "Natural lush garden style", label: "Natural lush garden style" },
];

export const PEOPLE_ACTIVITIES_OPTIONS: ImagePreferenceOption[] = [
	{ value: "No people (Focus on architecture)", label: "No people (Focus on architecture)" },
	{ value: "Vietnamese people riding motorbikes on the road", label: "Vietnamese people riding motorbikes on the road" },
	{ value: "Pedestrians on sidewalk (Vietnamese traditional clothing)", label: "Pedestrians on sidewalk (Vietnamese traditional clothing)" },
	{ value: "Young Vietnamese family (Husband, wife and young child)", label: "Young Vietnamese family (Husband, wife and young child)" },
	{ value: "Group of students going to school", label: "Group of students going to school" },
	{ value: "Elderly person doing Tai Chi/taking a walk", label: "Elderly person doing Tai Chi/taking a walk" },
	{ value: "People sitting drinking coffee/iced tea on sidewalk", label: "People sitting drinking coffee/iced tea on sidewalk" },
	{ value: "Office workers going to work in a polite manner", label: "Office workers going to work in a polite manner" },
];

export const PAVEMENT_SITE_OPTIONS: ImagePreferenceOption[] = [
	{ value: "Sidewalk paved with interlocking Terrazzon/Block tiles", label: "Sidewalk paved with interlocking Terrazzon/Block tiles" },
	{ value: "Sidewalks paved with Thanh Hoa blue stone", label: "Sidewalks paved with Thanh Hoa blue stone" },
	{ value: "Traditional Ha Long red brick paved courtyard", label: "Traditional Ha Long red brick paved courtyard" },
	{ value: "The patio is paved with non-slip, textured granite", label: "The patio is paved with non-slip, textured granite" },
	{ value: "Clean concrete yard", label: "Clean concrete yard" },
	{ value: "Grass pavers - cool green", label: "Grass pavers - cool green" },
	{ value: "Outdoor Resin wood decking for balconies", label: "Outdoor Resin wood decking for balconies" },
	{ value: "Asphalt road with traffic lane markings", label: "Asphalt road with traffic lane markings" },
];

export interface LandscapeSubtype {
	value: string;
	label: string;
	thumbnail?: string;
}

export interface LandscapeCategory {
	value: string;
	label: string;
	subtypes: LandscapeSubtype[];
}

export const LANDSCAPE_TYPE_GROUPS: LandscapeCategory[] = [
	{
		value: "Residential",
		label: "Residential",
		subtypes: [
			{ value: "Residential Yard", label: "Residential Yard", thumbnail: "/images/thumbnails/landscape/type/residential_yard.png" },
			{ value: "Courtyard", label: "Courtyard", thumbnail: "/images/thumbnails/landscape/type/courtyard.png" },
			{ value: "Pool Landscape", label: "Pool Landscape", thumbnail: "/images/thumbnails/landscape/type/pool_landscape.png" },
		],
	},
	{
		value: "Garden",
		label: "Garden",
		subtypes: [
			{ value: "Botanical Garden", label: "Botanical Garden", thumbnail: "/images/thumbnails/landscape/type/botanical_garden.png" },
			{ value: "Japanese Garden", label: "Japanese Garden", thumbnail: "/images/thumbnails/landscape/type/japanese_garden.png" },
			{ value: "Sculpture Garden", label: "Sculpture Garden", thumbnail: "/images/thumbnails/landscape/type/sculpture_garden.png" },
			{ value: "Community Garden", label: "Community Garden", thumbnail: "/images/thumbnails/landscape/type/community_garden.png" },
			{ value: "Rooftop Garden", label: "Rooftop Garden", thumbnail: "/images/thumbnails/landscape/type/rooftop_garden.png" },
		],
	},
	{
		value: "Public",
		label: "Public",
		subtypes: [
			{ value: "Urban Park", label: "Urban Park", thumbnail: "/images/thumbnails/landscape/type/urban_park.png" },
			{ value: "Plaza", label: "Plaza", thumbnail: "/images/thumbnails/landscape/type/plaza.png" },
			{ value: "Waterfront Promenade", label: "Waterfront Promenade", thumbnail: "/images/thumbnails/landscape/type/waterfront_promenade.png" },
			{ value: "Playground", label: "Playground", thumbnail: "/images/thumbnails/landscape/type/playground.png" },
			{ value: "Memorial Park", label: "Memorial Park", thumbnail: "/images/thumbnails/landscape/type/memorial_park.png" },
			{ value: "Campus Quad", label: "Campus Quad", thumbnail: "/images/thumbnails/landscape/type/campus_quad.png" },
		],
	},
	{
		value: "Recreational",
		label: "Recreational",
		subtypes: [
			{ value: "Golf Course", label: "Golf Course", thumbnail: "/images/thumbnails/landscape/type/golf_course.png" },
			{ value: "Campground", label: "Campground", thumbnail: "/images/thumbnails/landscape/type/campground.png" },
			{ value: "Marina", label: "Marina", thumbnail: "/images/thumbnails/landscape/type/marina.png" },
			{ value: "Ski Resort", label: "Ski Resort", thumbnail: "/images/thumbnails/landscape/type/ski_resort.png" },
		],
	},
	{
		value: "Natural",
		label: "Natural",
		subtypes: [
			{ value: "Vineyard", label: "Vineyard", thumbnail: "/images/thumbnails/landscape/type/vineyard.png" },
			{ value: "Orchard", label: "Orchard", thumbnail: "/images/thumbnails/landscape/type/orchard.png" },
			{ value: "Wetland Restoration", label: "Wetland Restoration", thumbnail: "/images/thumbnails/landscape/type/wetland_restoration.png" },
			{ value: "Nature Trail", label: "Nature Trail", thumbnail: "/images/thumbnails/landscape/type/nature_trail.png" },
		],
	},
];

export const LANDSCAPE_STYLE_OPTIONS: ImagePreferenceOption[] = [
	{ value: "English Cottage Garden", label: "English Cottage Garden", thumbnail: "/images/thumbnails/landscape/style/english_cottage_garden.png" },
	{ value: "English Knot Garden", label: "English Knot Garden", thumbnail: "/images/thumbnails/landscape/style/english_knot_garden.png" },
	{ value: "French Formal", label: "French Formal", thumbnail: "/images/thumbnails/landscape/style/french_formal.png" },
	{ value: "Italian Renaissance Garden", label: "Italian Renaissance", thumbnail: "/images/thumbnails/landscape/style/italian_renaissance.png" },
	{ value: "Japanese Zen Garden", label: "Japanese Zen Garden", thumbnail: "/images/thumbnails/landscape/style/japanese_zen_garden.png" },
	{ value: "Japanese Tea Garden", label: "Japanese Tea Garden", thumbnail: "/images/thumbnails/landscape/style/japanese_tea_garden.png" },
	{ value: "Japanese Stroll Garden", label: "Japanese Stroll Garden", thumbnail: "/images/thumbnails/landscape/style/japanese_stroll_garden.png" },
	{ value: "Chinese Scholar Garden", label: "Chinese Scholar Garden", thumbnail: "/images/thumbnails/landscape/style/chinese_scholar_garden.png" },
	{ value: "Korean Traditional Garden", label: "Korean Traditional", thumbnail: "/images/thumbnails/landscape/style/korean_traditional.png" },
	{ value: "Persian Paradise Garden", label: "Persian Paradise Garden", thumbnail: "/images/thumbnails/landscape/style/persian_paradise_garden.png" },
	{ value: "Mughal Charbagh Garden", label: "Mughal Charbagh", thumbnail: "/images/thumbnails/landscape/style/mughal_charbagh.png" },
	{ value: "Moroccan Riad Garden", label: "Moroccan Riad", thumbnail: "/images/thumbnails/landscape/style/moroccan_riad.png" },
	{ value: "Andalusian Courtyard Garden", label: "Andalusian Courtyard", thumbnail: "/images/thumbnails/landscape/style/andalusian_courtyard.png" },
	{ value: "Victorian Conservatory Garden", label: "Victorian Conservatory", thumbnail: "/images/thumbnails/landscape/style/victorian_conservatory.png" },
	{ value: "Mediterranean Garden", label: "Mediterranean", thumbnail: "/images/thumbnails/landscape/style/mediterranean.png" },
	{ value: "Tropical Paradise Garden", label: "Tropical Paradise", thumbnail: "/images/thumbnails/landscape/style/tropical_paradise.png" },
	{ value: "Desert Xeriscape Garden", label: "Desert Xeriscape", thumbnail: "/images/thumbnails/landscape/style/desert_xp_garden.png" }, // Wait, let's keep name short and standard
	{ value: "Alpine Rockery Garden", label: "Alpine Rockery", thumbnail: "/images/thumbnails/landscape/style/alpine_rockery.png" },
	{ value: "Scandinavian Naturalistic Garden", label: "Scandinavian Naturalistic", thumbnail: "/images/thumbnails/landscape/style/scandinavian_naturalistic.png" },
	{ value: "Coastal Dune Garden", label: "Coastal Dune", thumbnail: "/images/thumbnails/landscape/style/coastal_dune.png" },
	{ value: "Woodland Shade Garden", label: "Woodland Shade", thumbnail: "/images/thumbnails/landscape/style/woodland_shade.png" },
	{ value: "Tropical Resort Garden", label: "Tropical Resort", thumbnail: "/images/thumbnails/landscape/style/tropical_resort.png" },
	{ value: "Modernist Minimalist Garden", label: "Modernist Minimalist", thumbnail: "/images/thumbnails/landscape/style/modernist_minimalist.png" },
	{ value: "Contemporary Sculptural Garden", label: "Contemporary Sculptural", thumbnail: "/images/thumbnails/landscape/style/contemporary_sculptural.png" },
	{ value: "Biophilic Urban Garden", label: "Biophilic Urban", thumbnail: "/images/thumbnails/landscape/style/biophilic_urban.png" },
	{ value: "High Line Post-Industrial Garden", label: "High Line Post-Industrial", thumbnail: "/images/thumbnails/landscape/style/high_line_post_industrial.png" },
	{ value: "Rooftop Urban Garden", label: "Rooftop Urban", thumbnail: "/images/thumbnails/landscape/style/rooftop_urban.png" },
	{ value: "Memorial Reflective Garden", label: "Memorial Reflective", thumbnail: "/images/thumbnails/landscape/style/memorial_reflective.png" },
	{ value: "Naturalistic Prairie Garden", label: "Naturalistic Prairie", thumbnail: "/images/thumbnails/landscape/style/naturalistic_prairie.png" },
	{ value: "Wildflower Meadow Garden", label: "Wildflower Meadow", thumbnail: "/images/thumbnails/landscape/style/wildflower_meadow.png" },
	{ value: "Rain Garden", label: "Rain Garden", thumbnail: "/images/thumbnails/landscape/style/rain_garden.png" },
	{ value: "Permaculture Garden", label: "Permaculture", thumbnail: "/images/thumbnails/landscape/style/permaculture.png" },
	{ value: "Edible Garden", label: "Edible Garden", thumbnail: "/images/thumbnails/landscape/style/edible_garden.png" },
	{ value: "Ecological Restoration Garden", label: "Ecological Restoration", thumbnail: "/images/thumbnails/landscape/style/ecological_restoration.png" },
];

// ── 3D Floor Plan ────────────────────────────────────────────────────────────

export const FLOOR_PLAN_3D_ANGLE_OPTIONS: ImagePreferenceOption[] = [
	{ value: "Isometric view", label: "Isometric" },
	{ value: "Top-down view", label: "Top Down View" },
	{ value: "Bird's-eye view (perspective)", label: "Bird's-Eye View (Perspective)" },
];

export const COLOR_PALETTE_OPTIONS: ImagePreferenceOption[] = [
	{ value: "Custom", label: "Custom" },
	{ value: "Neutral Earthy", label: "Neutral Earthy" },
	{ value: "Monochrome Black and White", label: "Monochrome Black and White" },
	{ value: "Creamy Off-White", label: "Creamy Off-White" },
	{ value: "Sage Green & Wood", label: "Sage Green & Wood" },
	{ value: "Dark & Moody", label: "Dark & Moody" },
	{ value: "Muted Pastels", label: "Muted Pastels" },
	{ value: "Warm Terracotta", label: "Warm Terracotta" },
	{ value: "Bold Jewel Tones", label: "Bold Jewel Tones" },
	{ value: "Coastal Breeze", label: "Coastal Breeze" },
	{ value: "Industrial Grays", label: "Industrial Grays" },
];

// Not yet defined by the team — left empty so the dropdown renders with "No options found" until filled in.
export const FLOOR_PLAN_3D_TYPE_OPTIONS: ImagePreferenceOption[] = [];
export const FLOOR_PLAN_3D_STYLE_DESIGN_OPTIONS: ImagePreferenceOption[] = [];
export const FLOOR_PLAN_3D_LIGHTING_OPTIONS: ImagePreferenceOption[] = [];

// ── Floor Plan to 3D View Room ───────────────────────────────────────────────

export const ROOM_VIEW_ANGLE_OPTIONS: ImagePreferenceOption[] = [
	{ value: "Eye level", label: "Eye Level" },
	{ value: "Low angle", label: "Low Angle" },
	{ value: "Height angle", label: "Height Angle" },
	{ value: "Straight on", label: "Straight On" },
	{ value: "Top-down", label: "Top Down" },
];

export const LENS_OPTIONS: ImagePreferenceOption[] = [
	{ value: "24mm lens", label: "24mm" },
	{ value: "28mm lens", label: "28mm" },
	{ value: "35mm lens", label: "35mm" },
	{ value: "50mm lens", label: "50mm" },
];

// Not yet defined by the team — left empty so the dropdown renders with "No options found" until filled in.
export const ROOM_VIEW_TYPE_OPTIONS: ImagePreferenceOption[] = [];
export const ROOM_VIEW_STYLE_DESIGN_OPTIONS: ImagePreferenceOption[] = [];
export const ROOM_VIEW_LIGHTING_OPTIONS: ImagePreferenceOption[] = [];

// ── View Creator Constants ──────────────────────────────────────────────────
export const CAMERA_ANGLE_NEW_OPTIONS: ImagePreferenceOption[] = [
	{ value: "High angle shot", label: "High Angle Shot" },
	{ value: "Low angle shot", label: "Low Angle Shot" },
	{ value: "3/4 view from left", label: "3/4 View from Left" },
	{ value: "3/4 view from right", label: "3/4 View from Right" },
	{ value: "Detailed close-up shot", label: "Detailed Close-up Shot" },
	{ value: "straight on symmetric shot", label: "Straight on Symmetric Shot" },
	{ value: "wide angle", label: "Wide Angle" },
	{ value: "paronama", label: "Panorama (Paronama)" },
	{ value: "top-down view", label: "Top-down View" },
	{ value: "eye level", label: "Eye Level" },
];

// ── Image Editor Constants ──────────────────────────────────────────────────
export const PEOPLE_NUMBER_OPTIONS: ImagePreferenceOption[] = [
	{ value: "1", label: "1 person" },
	{ value: "2", label: "2 people" },
	{ value: "3", label: "3 people" },
	{ value: "Group", label: "A group of people" },
	{ value: "Crowd", label: "A crowd" },
];

export const PEOPLE_AGE_GROUP_OPTIONS: ImagePreferenceOption[] = [
	{ value: "Baby", label: "Baby" },
	{ value: "Child", label: "Child" },
	{ value: "Teenager", label: "Teenager" },
	{ value: "Young Adult", label: "Young Adult" },
	{ value: "Adult", label: "Adult" },
	{ value: "Elderly", label: "Elderly" },
];

export const PEOPLE_WHO_OPTIONS: ImagePreferenceOption[] = [
	{ value: "Family", label: "Family" },
	{ value: "Couple", label: "Couple" },
	{ value: "Friends", label: "Friends" },
	{ value: "Business professionals", label: "Business Professionals" },
	{ value: "Architects / Designers", label: "Architects / Designers" },
	{ value: "Tourists", label: "Tourists" },
	{ value: "Passersby", label: "Passersby" },
];

export const PEOPLE_DOING_OPTIONS: ImagePreferenceOption[] = [
	{ value: "Walking", label: "Walking" },
	{ value: "Sitting", label: "Sitting & relaxing" },
	{ value: "Talking", label: "Talking / Socializing" },
	{ value: "Working on laptop", label: "Working on laptop" },
	{ value: "Drinking coffee", label: "Drinking coffee" },
	{ value: "Taking photos", label: "Taking photos" },
	{ value: "Running / Jogging", label: "Running / Jogging" },
];

export const PEOPLE_CLOTHING_OPTIONS: ImagePreferenceOption[] = [
	{ value: "Casual wear", label: "Casual Wear" },
	{ value: "Smart formal", label: "Smart Formal (suits, dresses)" },
	{ value: "Sportswear", label: "Sportswear" },
	{ value: "Minimalist fashion", label: "Minimalist / Neutral Colors" },
	{ value: "Seasonal winter wear", label: "Seasonal Winter Wear" },
];

export const PEOPLE_STYLE_OPTIONS: ImagePreferenceOption[] = [
	{ value: "Modern & Trendy", label: "Modern & Trendy" },
	{ value: "Elegant & Professional", label: "Elegant & Professional" },
	{ value: "Minimalist", label: "Minimalist" },
	{ value: "Vintage", label: "Vintage / Retro" },
	{ value: "Architectural entourage style", label: "Architectural Entourage Style" },
];

export const PEOPLE_RACE_OPTIONS: ImagePreferenceOption[] = [
	{ value: "Asian", label: "Asian" },
	{ value: "Caucasian", label: "Caucasian" },
	{ value: "Black / African descent", label: "Black / African Descent" },
	{ value: "Hispanic", label: "Hispanic" },
	{ value: "Middle Eastern", label: "Middle Eastern" },
	{ value: "Mixed", label: "Mixed / Diverse" },
];

export const PEOPLE_GENDER_OPTIONS: ImagePreferenceOption[] = [
	{ value: "Male", label: "Male" },
	{ value: "Female", label: "Female" },
	{ value: "Non-binary", label: "Non-binary" },
	{ value: "Mixed genders", label: "Mixed Genders" },
];

export const IMAGE_EDITOR_LIGHTING_OPTIONS: ImagePreferenceOption[] = [
	{ value: "Edit", label: "Edit (Analyze and modify lighting)" },
	{ value: "New", label: "New (Create new lighting environment)" },
];

export const SUGGESTED_LIGHTING_DESCRIPTIONS: ImagePreferenceOption[] = [
	{ value: "Golden hour sunset lighting, long soft shadows, warm orange glow", label: "Golden Hour sunset" },
	{ value: "Overcast day diffused soft lighting, no harsh shadows, natural colors", label: "Overcast day soft light" },
	{ value: "Bright sunny midday daylight, crisp sharp shadows, high contrast", label: "Bright midday sun" },
	{ value: "Dramatic studio key lighting, rim lights, high contrast, clean backdrop look", label: "Dramatic studio setup" },
	{ value: "Moody night twilight lighting, dark ambient, neon light glow accents", label: "Moody twilight neon" },
	{ value: "Warm interior ambient lighting, cozy fireplace glow, soft incandescent lamps", label: "Cozy warm interior" },
];

// ── Other Tools Constants ───────────────────────────────────────────────────
export const COLORING_TYPE_OPTIONS: ImagePreferenceOption[] = [
	{ value: "3D View", label: "3D View Coloring" },
	{ value: "2D View", label: "2D View Coloring" },
	{ value: "2D Floorplan", label: "2D Floorplan Coloring" },
];

export const COLORING_PRESET_STYLE_OPTIONS: ImagePreferenceOption[] = [
	{ value: "Real Material", label: "Real Material" },
	{ value: "Water Color", label: "Water Color" },
	{ value: "Color Block", label: "Color Block" },
	{ value: "Sketch", label: "Sketch" },
	{ value: "Painting", label: "Painting" },
	{ value: "Marker", label: "Marker" },
	{ value: "Semi-realistics style", label: "Semi-realistics Style" },
	{ value: "Technical Blueprint style", label: "Technical Blueprint Style" },
	{ value: "Material Base style", label: "Material Base Style" },
	{ value: "Photorealistics style", label: "Photorealistics Style" },
	{ value: "Vintage", label: "Vintage" },
];

// ── Basic option fields (Pair Canvas) ───────────────────────────────────────
// These mirror the global settings in useImageSettingsStore rather than a
// per-flow value, so a node created for one of these keys reads/writes the
// same store the chat input's Model Selector / Generation Settings / Enhance
// Prompt controls use — editing either place updates both immediately.
// "generationSettings" bundles aspect ratio + resolution + seed + image count
// together, mirroring the single Generation Settings popover it's dragged from.
export const BASIC_OPTION_FIELD_KEYS = [
	"imageModel",
	"generationSettings",
	"enhancePrompt",
] as const;

/** Display labels for canvas option-field nodes — shared by OptionFieldNode (per-field UI) and buildFlowOptionSections (Flow Prompt compile) so the two never drift apart. */
export const OPTION_FIELD_LABELS: Record<string, string> = {
	mainMode: "Main mode",
	subMode: "Sub mode",
	imageCount: "Image count",
	preserveGroup: "Preserve options",
	changeScope: "Change scope",
	referenceStrength: "Reference strength",
	styleImageType: "Style image",
	style: "Style",
	setting: "Setting",
	lighting: "Lighting",
	negativePrompt: "Negative prompt",
	planningTarget: "Planning target",
	planningBuildings: "Planning buildings",
	floorplanObjective: "Floor plan objective",
	floorplanStyle: "Floor plan style",
	floorplanRoomType: "Room type",
	roomType: "Room type",
	floorplanColoring: "Coloring",
	floorplanPrompt: "Floor plan prompt",
	floorPlan3dAngle: "Style image angle",
	floorPlan3dType: "Type",
	floorPlan3dStyleDesign: "Style design",
	floorPlan3dLighting: "Lighting",
	floorPlan3dColorPalette: "Color palette",
	roomViewAngle: "Style image angle",
	roomViewLens: "Lens",
	roomViewType: "Type",
	roomViewStyleDesign: "Style design",
	roomViewLighting: "Lighting",
	exteriorBuildingType: "Building type",
	exteriorBuildingSubtype: "Building subtype",
	treesFlowers: "Trees & flowers",
	peopleActivities: "People activities",
	pavementSite: "Pavement & site",
	detailedDescription: "Detailed description",
	viewCreatorCameraAngle: "Camera angle",
	drawArea: "Draw area",
	peopleNumber: "People count",
	peopleAgeGroup: "People age group",
	peopleWho: "People description",
	peopleDoing: "People activity",
	peopleAppearanceClothing: "People clothing",
	peopleAppearanceStyle: "People style",
	peopleIdentityRace: "People race",
	peopleIdentityGender: "People gender",
	imageEditorLighting: "Lighting mode",
	coloringSubtype: "Coloring subtype",
	coloringPresetStyle: "Coloring preset style",
	imageModel: "Model",
	generationSettings: "Generation settings",
	enhancePrompt: "Enhance prompt",
};
