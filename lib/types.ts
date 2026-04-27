// =======================================================================
// Shared types
// =======================================================================

export type PaintingStatus = "available" | "sold" | "reserved";
export type Series = "abstract" | "nature";

export type PaintingImage = {
  url: string;
  alt?: string;
  width?: number;
  height?: number;
  is_primary?: boolean;
  sort_order?: number;
};

export type Painting = {
  id: string;
  slug: string;
  title: string;
  year: number;
  series: Series;
  medium: string;
  w: number; // inches
  h: number; // inches
  price: number; // USD
  status: PaintingStatus;
  framing?: string | null;
  note?: string | null;
  images: PaintingImage[];
  // Placeholder palette & aspect ratio — used by <PaintingImage> when no real
  // image has been uploaded yet. Safe to remove once every painting has a photo.
  palette?: string[];
  aspect?: number;
};
