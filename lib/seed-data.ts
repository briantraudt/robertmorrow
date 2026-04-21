// =======================================================================
// Seed data — 40 example paintings from the design handoff.
// Used as a fallback when Supabase has no rows, and as the input for the
// seed script (scripts/seed.ts) that loads the catalog into Supabase.
// =======================================================================

import type { Painting } from "./types";

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

type Seed = Omit<Painting, "slug" | "images"> & { slug?: string };

const raw: Seed[] = [
  { id: "rm-01", title: "Field Study, No. 1",      year: 2024, series: "abstract", medium: "Oil on linen",  w: 24, h: 30, price: 680, palette: ["#C9B892","#8B6F47","#E8DCC4","#5C4A32"], aspect: 0.8,   status: "available", note: "Begun from a torn paper sketch made at dawn." },
  { id: "rm-02", title: "Interior, Afternoon",     year: 2024, series: "abstract", medium: "Oil on panel",  w: 18, h: 24, price: 540, palette: ["#D4C4A0","#6B5D48","#EDE3CE","#3A3126"], aspect: 0.75,  status: "available" },
  { id: "rm-03", title: "Quiet Weather",           year: 2023, series: "abstract", medium: "Oil on canvas", w: 30, h: 30, price: 720, palette: ["#B8B0A0","#7A8070","#DDD6C6","#4A4A40"], aspect: 1,     status: "available" },
  { id: "rm-04", title: "Margin Notes",            year: 2024, series: "abstract", medium: "Oil on panel",  w: 12, h: 16, price: 280, palette: ["#E3D8BE","#9C7D52","#F0E8D2","#2F2820"], aspect: 0.75,  status: "available" },
  { id: "rm-05", title: "Slow Tide",               year: 2023, series: "abstract", medium: "Oil on canvas", w: 36, h: 24, price: 780, palette: ["#A8B4B8","#5D6E74","#D6DCDE","#2E3638"], aspect: 1.5,   status: "sold" },
  { id: "rm-06", title: "Orchard, Remembered",     year: 2024, series: "abstract", medium: "Oil on panel",  w: 20, h: 20, price: 460, palette: ["#BFA878","#7E6538","#E5D9B8","#3F3420"], aspect: 1,     status: "available" },
  { id: "rm-07", title: "Evening Room",            year: 2022, series: "abstract", medium: "Oil on canvas", w: 24, h: 36, price: 740, palette: ["#6B5B48","#D4C39E","#8A7A5D","#2A241C"], aspect: 0.666, status: "available" },
  { id: "rm-08", title: "Untitled (Cream, Ash)",   year: 2024, series: "abstract", medium: "Oil on linen",  w: 16, h: 16, price: 340, palette: ["#E8E2D2","#B5AC9A","#F2EDE0","#6A6458"], aspect: 1,     status: "available" },
  { id: "rm-09", title: "North Pasture",           year: 2023, series: "nature",   medium: "Oil on canvas", w: 30, h: 20, price: 620, palette: ["#A8A878","#5E6B3E","#D4D0A8","#2E3520"], aspect: 1.5,   status: "available", note: "Mid-July. Sketched from the road, finished in the studio." },
  { id: "rm-10", title: "Two Pines",               year: 2024, series: "nature",   medium: "Oil on panel",  w: 12, h: 16, price: 260, palette: ["#6B7458","#2F3A28","#A8B090","#1C2218"], aspect: 0.75,  status: "available" },
  { id: "rm-11", title: "River Bend",              year: 2023, series: "nature",   medium: "Oil on canvas", w: 24, h: 18, price: 520, palette: ["#88A0AC","#4E6672","#C6D2D6","#253038"], aspect: 1.33,  status: "available" },
  { id: "rm-12", title: "Hayfield, Late August",   year: 2024, series: "nature",   medium: "Oil on linen",  w: 36, h: 24, price: 780, palette: ["#D4B878","#8E6F38","#E8D8A8","#4A3A1E"], aspect: 1.5,   status: "available" },
  { id: "rm-13", title: "Cove",                    year: 2022, series: "nature",   medium: "Oil on panel",  w: 10, h: 12, price: 220, palette: ["#9EB4BC","#5E7682","#D0DDE2","#2E3E46"], aspect: 0.833, status: "available" },
  { id: "rm-14", title: "Morning Frost",           year: 2024, series: "nature",   medium: "Oil on canvas", w: 20, h: 24, price: 480, palette: ["#D8D4C4","#90927E","#EFEBDE","#44463A"], aspect: 0.833, status: "available" },
  { id: "rm-15", title: "Red Barn, Snow",          year: 2023, series: "nature",   medium: "Oil on panel",  w: 16, h: 12, price: 320, palette: ["#A85E48","#E8E2D4","#6E3828","#2C221C"], aspect: 1.33,  status: "sold" },
  { id: "rm-16", title: "Marsh Grass",             year: 2024, series: "nature",   medium: "Oil on canvas", w: 24, h: 24, price: 580, palette: ["#B8A878","#7C6838","#D8CCA0","#3A301A"], aspect: 1,     status: "available" },
  { id: "rm-17", title: "Letter, Unsent",          year: 2024, series: "abstract", medium: "Oil on panel",  w: 14, h: 18, price: 360, palette: ["#E0D2B4","#A08558","#EFE6CE","#362C1E"], aspect: 0.777, status: "available" },
  { id: "rm-18", title: "Nocturne",                year: 2023, series: "abstract", medium: "Oil on canvas", w: 30, h: 24, price: 700, palette: ["#3A4048","#1A1E24","#5E6670","#0E1216"], aspect: 1.25,  status: "available" },
  { id: "rm-19", title: "Small Garden",            year: 2024, series: "abstract", medium: "Oil on panel",  w: 10, h: 10, price: 200, palette: ["#BFA890","#7A6850","#DDD0B8","#3A302A"], aspect: 1,     status: "available" },
  { id: "rm-20", title: "Weather Coming",          year: 2023, series: "abstract", medium: "Oil on canvas", w: 40, h: 30, price: 800, palette: ["#8A8E98","#4A4E58","#B8BCC4","#2A2E34"], aspect: 1.33,  status: "available" },
  { id: "rm-21", title: "Study in Umber",          year: 2024, series: "abstract", medium: "Oil on linen",  w: 18, h: 18, price: 420, palette: ["#8E6838","#E3D2A8","#5A3E1E","#2E2010"], aspect: 1,     status: "available" },
  { id: "rm-22", title: "Window, West Light",      year: 2022, series: "abstract", medium: "Oil on panel",  w: 20, h: 28, price: 620, palette: ["#D8C498","#8E7248","#EFE2BE","#3E3220"], aspect: 0.714, status: "available" },
  { id: "rm-23", title: "Blue Hour",               year: 2024, series: "abstract", medium: "Oil on canvas", w: 24, h: 24, price: 560, palette: ["#5E7080","#2E3A46","#8EA0AE","#1A222A"], aspect: 1,     status: "available" },
  { id: "rm-24", title: "Passage",                 year: 2023, series: "abstract", medium: "Oil on panel",  w: 12, h: 24, price: 380, palette: ["#CEB890","#6A5638","#EADFC0","#2E241A"], aspect: 0.5,   status: "available" },
  { id: "rm-25", title: "Apple Tree, November",    year: 2023, series: "nature",   medium: "Oil on panel",  w: 14, h: 14, price: 300, palette: ["#9E7848","#E8DCB8","#6A4E28","#2C1E10"], aspect: 1,     status: "available" },
  { id: "rm-26", title: "Dunes",                   year: 2024, series: "nature",   medium: "Oil on linen",  w: 30, h: 18, price: 640, palette: ["#E0CC9A","#9E8858","#F0E3C4","#4A3E22"], aspect: 1.666, status: "available" },
  { id: "rm-27", title: "Brook",                   year: 2022, series: "nature",   medium: "Oil on canvas", w: 16, h: 20, price: 420, palette: ["#7A8A7A","#3E4E3E","#B0BEB0","#1E281E"], aspect: 0.8,   status: "available" },
  { id: "rm-28", title: "First Light",             year: 2024, series: "nature",   medium: "Oil on canvas", w: 24, h: 30, price: 720, palette: ["#D8B890","#A07C48","#F0DDB8","#4A3620"], aspect: 0.8,   status: "available" },
  { id: "rm-29", title: "Old Orchard",             year: 2023, series: "nature",   medium: "Oil on panel",  w: 20, h: 16, price: 420, palette: ["#B8A878","#6E5A38","#D8CCA0","#322820"], aspect: 1.25,  status: "available" },
  { id: "rm-30", title: "Stone Wall",              year: 2024, series: "nature",   medium: "Oil on linen",  w: 18, h: 14, price: 360, palette: ["#B8B0A0","#7A7060","#D8D0C0","#3E382E"], aspect: 1.285, status: "available" },
  { id: "rm-31", title: "Pond in April",           year: 2024, series: "nature",   medium: "Oil on canvas", w: 28, h: 22, price: 640, palette: ["#A8B4A0","#5E6E58","#CAD4C0","#2E3828"], aspect: 1.27,  status: "available" },
  { id: "rm-32", title: "Birch Stand",             year: 2023, series: "nature",   medium: "Oil on panel",  w: 12, h: 18, price: 320, palette: ["#E8E2D2","#7A7058","#B8AC94","#2E2820"], aspect: 0.666, status: "sold" },
  { id: "rm-33", title: "Small Study I",           year: 2024, series: "abstract", medium: "Oil on panel",  w: 8,  h: 10, price: 200, palette: ["#D4C39E","#8E7448","#EADFC0","#3A2E20"], aspect: 0.8,   status: "available" },
  { id: "rm-34", title: "Small Study II",          year: 2024, series: "abstract", medium: "Oil on panel",  w: 8,  h: 10, price: 200, palette: ["#B8AC94","#70684E","#D8CEBC","#302A20"], aspect: 0.8,   status: "available" },
  { id: "rm-35", title: "Small Study III",         year: 2024, series: "nature",   medium: "Oil on panel",  w: 8,  h: 10, price: 200, palette: ["#8E9882","#4A564A","#B8C0AE","#1E261E"], aspect: 0.8,   status: "available" },
  { id: "rm-36", title: "Small Study IV",          year: 2024, series: "nature",   medium: "Oil on panel",  w: 8,  h: 10, price: 220, palette: ["#C8B494","#8E7048","#E2D3B4","#3A2E1E"], aspect: 0.8,   status: "available" },
  { id: "rm-37", title: "Paper Boats",             year: 2023, series: "abstract", medium: "Oil on canvas", w: 22, h: 18, price: 480, palette: ["#E0D4B8","#9C8258","#C6B088","#3A2E1E"], aspect: 1.22,  status: "available" },
  { id: "rm-38", title: "Elm, Alone",              year: 2024, series: "nature",   medium: "Oil on panel",  w: 18, h: 24, price: 500, palette: ["#B0A890","#5E5848","#D0C8B4","#2A241C"], aspect: 0.75,  status: "available" },
  { id: "rm-39", title: "Sheltered Cove",          year: 2022, series: "nature",   medium: "Oil on canvas", w: 26, h: 20, price: 580, palette: ["#A8B8BC","#5E7278","#CEDADD","#2A343A"], aspect: 1.3,   status: "available" },
  { id: "rm-40", title: "Late Afternoon",          year: 2024, series: "abstract", medium: "Oil on linen",  w: 22, h: 28, price: 660, palette: ["#D4B890","#9E7E48","#EAD8B4","#4A3822"], aspect: 0.785, status: "available" },
];

export const SEED_PAINTINGS: Painting[] = raw.map((p) => ({
  ...p,
  slug: p.slug ?? slugify(p.title),
  images: [],
  note: p.note ?? null,
}));

export function findPainting(idOrSlug: string): Painting | undefined {
  return SEED_PAINTINGS.find(
    (p) => p.id === idOrSlug || p.slug === idOrSlug,
  );
}
