import { Request, Response } from "express";
import axios from "axios";

const normalizeHotelResponse = (hotel: any, fallbackCity: string, fallbackCountry: string) => {
  const property = hotel?.property ?? {};
  const priceInfo = property?.priceBreakdown ?? {};
  const grossPrice = priceInfo?.grossPrice ?? {};
  const originalPrice = priceInfo?.strikethroughPrice ?? {};

  return {
    id: String(hotel?.hotel_id ?? property?.id ?? `${fallbackCity}-${Date.now()}`),
    name: property?.name ?? fallbackCity,
    location: property?.location ?? `${fallbackCity} City Center`,
    country: fallbackCountry || property?.countryCode || "Thailand",
    price: Number(grossPrice?.value ?? 0),
    originalPrice: Number(originalPrice?.value ?? grossPrice?.value ?? 0),
    rating: Number(property?.reviewScore ?? 0),
    reviews: Number(property?.reviewCount ?? 0),
    stars: Number(property?.propertyClass ?? property?.accuratePropertyClass ?? 4),
    tag: property?.isPreferred ? "Preferred" : "Popular",
    image: property?.photoUrls?.[0] ?? "",
    imageAlt: `${property?.name ?? fallbackCity} exterior`,
    features: ["Free Wi‑Fi", "Breakfast", "Airport transfer"],
    distance: "Near city center",
  };
};

const resolveDestinationId = async (destination: string, country: string, rapidApiHost: string, rapidApiKey: string) => {
  const query = `${destination} ${country}`.trim();

  const response = await axios.request({
    method: "GET",
    url: `https://${rapidApiHost}/api/v1/hotels/searchDestination`,
    params: { query },
    headers: {
      "x-rapidapi-key": rapidApiKey,
      "x-rapidapi-host": rapidApiHost,
    },
  });

  const items = response.data?.data ?? [];
  if (!Array.isArray(items) || items.length === 0) {
    return null;
  }

  const normalizedDestination = destination.toLowerCase();
  const exactMatch = items.find((item: any) => {
    const cityName = String(item?.city_name ?? "").toLowerCase();
    const name = String(item?.name ?? "").toLowerCase();
    const label = String(item?.label ?? "").toLowerCase();
    return cityName === normalizedDestination || name === normalizedDestination || label.includes(normalizedDestination);
  });

  const cityMatch = items.find((item: any) => item?.search_type === "city") ?? items[0];
  const selected = exactMatch ?? cityMatch;

  return selected
    ? {
        dest_id: selected.dest_id,
        search_type: selected.search_type ?? "city",
        name: selected.name ?? destination,
      }
    : null;
};

const normalizeHotelDetails = (raw: any, fallbackId: string) => {
  // booking-com15 อาจคืนรูป { data: { hotel: {...} } } หรือ { data: {...} }
  // normalize แบบทนทาน — field ไหนไม่มีได้ค่าว่าง ไม่พัง
  const root = raw?.data ?? raw ?? {};
  const hotel = root?.hotel ?? root?.property ?? root ?? {};

  const photos: string[] = Array.isArray(hotel?.photos)
    ? hotel.photos.map((photo: any) =>
        typeof photo === "string" ? photo : (photo?.url ?? photo?.photoUrl ?? ""),
      ).filter(Boolean)
    : (Array.isArray(hotel?.photoUrls) ? hotel.photoUrls : []);

  const facilities: string[] = Array.isArray(hotel?.facilities)
    ? hotel.facilities.map((facility: any) =>
        typeof facility === "string" ? facility : (facility?.name ?? ""),
      ).filter(Boolean)
    : [];

  const roomsRaw: any[] = Array.isArray(hotel?.rooms)
    ? hotel.rooms
    : (Array.isArray(root?.rooms) ? root.rooms : []);

  return {
    id: String(hotel?.hotel_id ?? hotel?.id ?? fallbackId),
    name: hotel?.name ?? "",
    address: hotel?.address ?? hotel?.location ?? "",
    rating: Number(hotel?.reviewScore ?? hotel?.rating ?? 0),
    reviews: Number(hotel?.reviewCount ?? hotel?.review_count ?? 0),
    stars: Number(hotel?.propertyClass ?? hotel?.class ?? 0),
    description: hotel?.description ?? "",
    images: photos,
    amenities: facilities,
    policies: {
      checkIn: hotel?.checkinTime ?? hotel?.checkIn ?? "",
      checkOut: hotel?.checkoutTime ?? hotel?.checkOut ?? "",
      cancellation: hotel?.cancellationPolicy ?? "",
    },
    rooms: roomsRaw.map((room: any, index: number) => ({
      id: String(room?.id ?? `${fallbackId}-room-${index}`),
      name: room?.name ?? room?.roomName ?? "",
      price: Number(room?.price?.value ?? room?.price ?? 0),
      perks: Array.isArray(room?.benefits) ? room.benefits : [],
    })),
  };
};

export const getHotelDetails = async (req: Request, res: Response) => {
  try {
    const hotelId = (req.params.id as string | undefined)?.trim() ?? "";

    if (!hotelId) {
      return res.status(400).json({
        success: false,
        message: "Please provide a hotel id",
      });
    }

    const rapidApiHost = process.env.RAPIDAPI_HOST;
    const rapidApiKey = process.env.RAPIDAPI_KEY;

    if (!rapidApiHost || !rapidApiKey) {
      return res.status(503).json({
        success: false,
        message: "RapidAPI environment variables are not configured",
      });
    }

    const response = await axios.request({
      method: "GET",
      url: `https://${rapidApiHost}/api/v1/hotels/getHotelDetails`,
      params: {
        hotel_id: hotelId,
        // NOTE: ยืนยัน params เพิ่ม (checkin/checkout/adults) อีกทีตอนโควต้ากลับมา
        ...(req.query.checkIn ? { arrival_date: req.query.checkIn } : {}),
        ...(req.query.checkOut ? { departure_date: req.query.checkOut } : {}),
        ...(req.query.adults ? { adults_number: req.query.adults } : {}),
      },
      headers: {
        "x-rapidapi-key": rapidApiKey,
        "x-rapidapi-host": rapidApiHost,
      },
    });

    return res.status(200).json({
      success: true,
      data: normalizeHotelDetails(response.data, hotelId),
    });
  } catch (error: any) {
    console.error("Error fetching hotel details:", error?.response?.data || error.message);
    return res.status(error?.response?.status ?? 500).json({
      success: false,
      message: "Failed to fetch hotel details",
      error: error?.response?.data || error.message,
    });
  }
};

export const Destination = async (req: Request, res: Response) => {
  try {
    const rawQuery =
      (req.query.query as string | undefined) ||
      (req.body?.query as string | undefined) ||
      "";
    const query = rawQuery.trim();

    if (!query) {
      return res.status(400).json({
        success: false,
        message: "Please provide a search query",
      });
    }

    const rapidApiHost = process.env.RAPIDAPI_HOST;
    const rapidApiKey = process.env.RAPIDAPI_KEY;

    if (!rapidApiHost || !rapidApiKey) {
      return res.status(503).json({
        success: false,
        message: "RapidAPI environment variables are not configured",
      });
    }

    const options = {
      method: "GET",
      url: `https://${rapidApiHost}/api/v1/hotels/searchDestination`,
      params: {
        query: query.trim(),
      },
      headers: {
        "x-rapidapi-key": rapidApiKey,
        "x-rapidapi-host": rapidApiHost,
      },
    };

    const response = await axios.request(options);
    const items = response.data?.data ?? response.data?.results ?? response.data ?? [];
    return res.status(200).json({ success: true, items });
  } catch (error: any) {
    console.log("Error searching destinations:", error?.response?.data || error.message);
    return res.status(500).json({
      success: false,
      message: "Failed to search destinations",
      error: error?.response?.data || error.message,
    });
  }
};

export const searchHotels = async (req: Request, res: Response) => {
  try {
    const payload = req.method === "POST" ? req.body ?? {} : req.query ?? {};
    const destination =
      (payload.destination as string | undefined) ||
      (payload.city as string | undefined) ||
      (req.query.destination as string | undefined) ||
      "Bangkok";
    const country =
      (payload.country as string | undefined) ||
      (req.query.country as string | undefined) ||
      "Thailand";
    const checkIn =
      (payload.checkIn as string | undefined) ||
      (payload.arrival_date as string | undefined) ||
      (req.query.checkIn as string | undefined) ||
      "2026-10-11";
    const checkOut =
      (payload.checkOut as string | undefined) ||
      (payload.departure_date as string | undefined) ||
      (req.query.checkOut as string | undefined) ||
      "2026-10-14";
    const adults = Number(payload.adults ?? req.query.adults ?? 2);
    const children = Number(payload.children ?? req.query.children ?? 0);
    const rooms = Number(payload.rooms ?? req.query.rooms ?? 1);

    const rapidApiHost = process.env.RAPIDAPI_HOST;
    const rapidApiKey = process.env.RAPIDAPI_KEY;

    if (!rapidApiHost || !rapidApiKey) {
      return res.status(503).json({
        success: false,
        message: "RapidAPI environment variables are not configured",
      });
    }

    let destId = (payload.dest_id as string | undefined) ?? (req.query.dest_id as string | undefined) ?? "";
    let searchType = (payload.search_type as string | undefined) ?? (req.query.search_type as string | undefined) ?? "city";

    if (!destId) {
      const resolvedDestination = await resolveDestinationId(destination, country, rapidApiHost, rapidApiKey);
      if (!resolvedDestination) {
        return res.status(400).json({
          success: false,
          message: `Could not find a Booking.com destination for ${destination}`,
        });
      }
      destId = String(resolvedDestination.dest_id);
      searchType = resolvedDestination.search_type ?? searchType;
    }

    const options = {
      method: "GET",
      url: `https://${rapidApiHost}/api/v1/hotels/searchHotels`,
      params: {
        dest_id: destId,
        search_type: searchType,
        arrival_date: checkIn,
        departure_date: checkOut,
        adults_number: adults,
        children_number: children,
        room_number: rooms,
      },
      headers: {
        "x-rapidapi-key": rapidApiKey,
        "x-rapidapi-host": rapidApiHost,
      },
    };

    const response = await axios.request(options);
    const rawHotels = response.data?.data?.hotels ?? response.data?.hotels ?? response.data?.data ?? [];
    const items = Array.isArray(rawHotels)
      ? rawHotels.map((hotel: any) => normalizeHotelResponse(hotel, destination, country))
      : [];

    return res.status(200).json({
      success: true,
      items,
      meta: { destination, country, checkIn, checkOut, adults, children, rooms },
    });
  } catch (error: any) {
    console.error("Error searching hotels:", error?.response?.data || error.message);
    return res.status(500).json({
      success: false,
      message: "Failed to search hotels",
      error: error?.response?.data || error.message,
    });
  }
};