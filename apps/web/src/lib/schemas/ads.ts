import { z } from "zod";

export const AdPlacementSchema = z.enum(["home_feed", "browse_tile"]);

export const AdMediaTypeSchema = z.enum(["image", "video"]);

export const CreateAdCampaignSchema = z
  .object({
    title: z.string().min(3).max(100),
    image_url: z.string().url(),
    media_type: AdMediaTypeSchema.default("image"),
    link_url: z.string().url().optional(), // pas tout le monde n'a un lien à donner — pub non cliquable si absent
    placement: AdPlacementSchema,
    start_date: z.string().datetime({ message: "start_date doit être une date ISO 8601" }),
    end_date: z.string().datetime({ message: "end_date doit être une date ISO 8601" }),
  })
  .refine((data) => new Date(data.end_date) > new Date(data.start_date), {
    message: "La date de fin doit être après la date de début",
    path: ["end_date"],
  });

export const RejectAdSchema = z.object({
  reason: z.string().min(10, "La raison doit être expliquée (min 10 caractères)"),
});

export const SubmitAdPaymentSchema = z.object({
  reference_note: z.string().min(3).max(200),
});
