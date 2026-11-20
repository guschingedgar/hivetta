import type { MetadataRoute } from "next";

export const dynamic = "force-dynamic";

/** Hidden from search engines while the private beta is on. */
export default function robots(): MetadataRoute.Robots {
  return process.env.HIVETTA_ACCESS_CODE ? { rules: { userAgent: "*", disallow: "/" } } : { rules: { userAgent: "*", allow: "/" } };
}
