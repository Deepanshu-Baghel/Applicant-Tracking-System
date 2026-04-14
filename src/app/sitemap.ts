import type { MetadataRoute } from "next";

const baseUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.webresume.tech").replace(/\/$/, "");

const getUrl = (path: string): string => `${baseUrl}${path}`;

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();

  return [
    {
      url: getUrl("/"),
      lastModified,
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: getUrl("/overview"),
      lastModified,
      changeFrequency: "weekly",
      priority: 0.9,
    },
  ];
}