import type { GroupedGroupOption } from "./grouped-type-selector";

export const INTERIOR_ROOM_GROUPS: GroupedGroupOption[] = [
	{
		value: "Residential",
		label: "Residential",
		subtypes: [
			{ value: "Livingroom", label: "Livingroom", thumbnail: "/images/thumbnails/interior/room/living_room.png" },
			{ value: "Kitchen", label: "Kitchen", thumbnail: "/images/thumbnails/interior/room/kitchen.png" },
			{ value: "Bedroom", label: "Bedroom", thumbnail: "/images/thumbnails/interior/room/bedroom.png" },
			{ value: "Bathroom", label: "Bathroom", thumbnail: "/images/thumbnails/interior/setting/bathroom.png" },
			{ value: "Mudroom", label: "Mudroom", thumbnail: "/images/thumbnails/interior/room/mudroom.png" },
			{ value: "Dining room", label: "Dining room", thumbnail: "/images/thumbnails/interior/room/dining_room.png" },
		],
	},
	{
		value: "Private & Outdoor",
		label: "Private & Outdoor",
		subtypes: [
			{ value: "Study Room", label: "Study Room", thumbnail: "/images/thumbnails/interior/room/study_room.png" },
			{ value: "Home Office", label: "Home Office", thumbnail: "/images/thumbnails/interior/setting/home_office.png" },
			{ value: "Walk in Closet", label: "Walk in Closet", thumbnail: "/images/thumbnails/interior/room/walk_in_closet.png" },
			{ value: "Balcony", label: "Balcony", thumbnail: "/images/thumbnails/interior/room/balcony.png" },
			{ value: "Rooftop", label: "Rooftop", thumbnail: "/images/thumbnails/interior/room/rooftop.png" },
			{ value: "Toilet", label: "Toilet", thumbnail: "/images/thumbnails/interior/room/toilet.png" },
		],
	},
	{
		value: "Leisure & Fitness",
		label: "Leisure & Fitness",
		subtypes: [
			{ value: "Outdoor Pool Area", label: "Outdoor Pool Area", thumbnail: "/images/thumbnails/interior/room/outdoor_pool_area.png" },
			{ value: "Outdoor Patio", label: "Outdoor Patio", thumbnail: "/images/thumbnails/interior/room/outdoor_patio.png" },
			{ value: "Fitness/Gym", label: "Fitness/Gym", thumbnail: "/images/thumbnails/interior/room/fitnessgym.png" },
		],
	},
	{
		value: "Work & Office",
		label: "Work & Office",
		subtypes: [
			{ value: "Meeting Room", label: "Meeting Room", thumbnail: "/images/thumbnails/interior/room/meeting_room.png" },
			{ value: "Workshop", label: "Workshop", thumbnail: "/images/thumbnails/interior/room/workshop.png" },
			{ value: "Office", label: "Office", thumbnail: "/images/thumbnails/interior/room/office.png" },
			{ value: "Coworking Space", label: "Coworking Space", thumbnail: "/images/thumbnails/interior/room/coworking_space.png" },
		],
	},
	{
		value: "Commercial & Hospitality",
		label: "Commercial & Hospitality",
		subtypes: [
			{ value: "Coffee Shop", label: "Coffee Shop", thumbnail: "/images/thumbnails/interior/room/coffee_shop.png" },
			{ value: "Clothing Store", label: "Clothing Store", thumbnail: "/images/thumbnails/interior/room/clothing_store.png" },
			{ value: "Restaurant", label: "Restaurant", thumbnail: "/images/thumbnails/interior/room/restaurant.png" },
			{ value: "Hotel Lobby", label: "Hotel Lobby", thumbnail: "/images/thumbnails/interior/setting/lobby.png" },
			{ value: "Hotel Room", label: "Hotel Room", thumbnail: "/images/thumbnails/interior/room/hotel_room.png" },
			{ value: "Showroom", label: "Showroom", thumbnail: "/images/thumbnails/interior/room/showroom.png" },
			{ value: "Hotel Ballroom", label: "Hotel Ballroom", thumbnail: "/images/thumbnails/interior/room/hotel_ballroom.png" },
			{ value: "Exhibition Space", label: "Exhibition Space", thumbnail: "/images/thumbnails/interior/room/exhibition_space.png" },
		],
	},
	{
		value: "Recreation & Exterior",
		label: "Recreation & Exterior",
		subtypes: [
			{ value: "Outdoor Garden", label: "Outdoor Garden", thumbnail: "/images/thumbnails/interior/room/outdoor_garden.png" },
			{ value: "Bar", label: "Bar", thumbnail: "/images/thumbnails/interior/room/bar.png" },
			{ value: "Gaming Room", label: "Gaming Room", thumbnail: "/images/thumbnails/interior/room/gaming_room.png" },
			{ value: "Barn", label: "Barn", thumbnail: "/images/thumbnails/interior/room/barn.png" },
			{ value: "House Exterior", label: "House Exterior", thumbnail: "/images/thumbnails/interior/room/house_exterior.png" },
		],
	},
];

export const PLANNING_TYPE_GROUPS: GroupedGroupOption[] = [
	{
		value: "Districts",
		label: "Districts",
		subtypes: [
			{ value: "Downtown Core", label: "Downtown Core", thumbnail: "/images/thumbnails/planning/target/downtown_core.png" },
			{ value: "Mixed-Use District", label: "Mixed-Use District", thumbnail: "/images/thumbnails/planning/target/mixed_use_district.png" },
			{ value: "Business District", label: "Business District", thumbnail: "/images/thumbnails/planning/target/business_district.png" },
			{ value: "Residential District", label: "Residential District", thumbnail: "/images/thumbnails/planning/target/residential_district.png" },
			{ value: "Cultural Quarter", label: "Cultural Quarter", thumbnail: "/images/thumbnails/planning/target/cultural_quarter.png" },
			{ value: "Innovation District", label: "Innovation District", thumbnail: "/images/thumbnails/planning/target/innovation_district.png" },
			{ value: "Rural residential", label: "Rural residential", thumbnail: "/images/thumbnails/planning/target/rural_residential.png" },
			{ value: "Industrial zone", label: "Industrial zone", thumbnail: "/images/thumbnails/planning/target/industrial_zone.png" },
			{ value: "Tourism area", label: "Tourism area", thumbnail: "/images/thumbnails/planning/target/tourism_area.png" },
			{ value: "Urban area", label: "Urban area", thumbnail: "/images/thumbnails/planning/target/urban_area.png" },
		],
	},
	{
		value: "Streetscapes",
		label: "Streetscapes",
		subtypes: [
			{ value: "Pedestrian Street", label: "Pedestrian Street", thumbnail: "/images/thumbnails/planning/target/pedestrian_street.png" },
			{ value: "Transit Corridor", label: "Transit Corridor", thumbnail: "/images/thumbnails/planning/target/transit_corridor.png" },
			{ value: "Commercial Street", label: "Commercial Street", thumbnail: "/images/thumbnails/planning/target/commercial_street.png" },
			{ value: "Boulevard Corridor", label: "Boulevard Corridor", thumbnail: "/images/thumbnails/planning/target/boulevard_corridor.png" },
			{ value: "Bicycle Boulevard", label: "Bicycle Boulevard", thumbnail: "/images/thumbnails/planning/target/bicycle_boulevard.png" },
		],
	},
	{
		value: "Public Space",
		label: "Public Space",
		subtypes: [
			{ value: "Civic Plaza", label: "Civic Plaza", thumbnail: "/images/thumbnails/planning/target/civic_plaza.png" },
			{ value: "Public Square", label: "Public Square", thumbnail: "/images/thumbnails/planning/target/public_square.png" },
			{ value: "Theme park", label: "Theme park", thumbnail: "/images/thumbnails/planning/target/theme_park.png" },
			{ value: "Park System", label: "Park System", thumbnail: "/images/thumbnails/planning/target/park_system.png" },
			{ value: "Urban Greenway", label: "Urban Greenway", thumbnail: "/images/thumbnails/planning/target/urban_greenway.png" },
		],
	},
	{
		value: "Master Plan",
		label: "Master Plan",
		subtypes: [
			{ value: "New Town", label: "New Town", thumbnail: "/images/thumbnails/planning/target/new_town.png" },
			{ value: "Eco-District", label: "Eco-District", thumbnail: "/images/thumbnails/planning/target/eco_district.png" },
			{ value: "University Campus", label: "University Campus", thumbnail: "/images/thumbnails/planning/target/university_campus.png" },
			{ value: "Tech Campus", label: "Tech Campus", thumbnail: "/images/thumbnails/planning/target/tech_campus.png" },
			{ value: "Transit-Oriented Development", label: "Transit-Oriented Development", thumbnail: "/images/thumbnails/planning/target/transit_oriented_development.png" },
		],
	},
	{
		value: "Infrastructure",
		label: "Infrastructure",
		subtypes: [
			{ value: "Station Area", label: "Station Area", thumbnail: "/images/thumbnails/planning/target/station_area.png" },
			{ value: "Bridge Corridor", label: "Bridge Corridor", thumbnail: "/images/thumbnails/planning/target/infrastructure.png" },
			{ value: "Highway Interchange", label: "Highway Interchange", thumbnail: "/images/thumbnails/planning/target/highway_interchange.png" },
		],
	},
	{
		value: "Regeneration",
		label: "Regeneration",
		subtypes: [
			{ value: "Historic Quarter", label: "Historic Quarter", thumbnail: "/images/thumbnails/planning/target/historic_quarter.png" },
			{ value: "Post-Industrial Regeneration", label: "Post-Industrial Regeneration", thumbnail: "/images/thumbnails/planning/target/post_industrial_regeneration.png" },
			{ value: "Waterfront Redevelopment", label: "Waterfront Redevelopment", thumbnail: "/images/thumbnails/planning/target/waterfront_redevelopment.png" },
		],
	},
];
