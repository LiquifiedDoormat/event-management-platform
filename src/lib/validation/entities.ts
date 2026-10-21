import { z } from "zod";
import { bothOrNeither, coordinates, optionalId, optionalText, phone, requiredText } from "./common";

export const clusterInput = z.object({ name: requiredText(120) });
export type ClusterInput = z.infer<typeof clusterInput>;

export const hotelInput = z
  .object({
    name: requiredText(120),
    address: requiredText(300),
    ...coordinates,
    notes: optionalText(2000),
  })
  .refine(bothOrNeither, { message: "coordsPair", path: ["latitude"] });
export type HotelInput = z.infer<typeof hotelInput>;

export const busInput = z.object({
  label: requiredText(60),
  registration: optionalText(20).transform((v) => v?.toUpperCase().replace(/\s+/g, "")),
  routeNotes: optionalText(2000),
});
export type BusInput = z.infer<typeof busInput>;

export const busCreateInput = busInput.extend({ hotelId: z.string().min(1, "required").max(40) });

export const stopInput = z
  .object({
    name: requiredText(120),
    address: optionalText(300),
    ...coordinates,
    timeNote: optionalText(120),
  })
  .refine(bothOrNeither, { message: "coordsPair", path: ["latitude"] });
export type StopInput = z.infer<typeof stopInput>;

export const roleSchema = z.enum(["OWNER", "ADMIN", "CLUSTER_COORDINATOR", "COORDINATOR", "CUSTOMER"]);
export const statusSchema = z.enum(["ACTIVE", "INACTIVE"]);

export const personCreateInput = z.object({
  name: requiredText(120),
  phone,
  role: z.enum(["ADMIN", "CLUSTER_COORDINATOR", "COORDINATOR", "CUSTOMER"]),
  hotelId: optionalId,
});
export type PersonCreateInput = z.infer<typeof personCreateInput>;

export const personUpdateInput = z.object({ name: requiredText(120), phone });
export type PersonUpdateInput = z.infer<typeof personUpdateInput>;

export const peopleFilter = z.object({
  role: roleSchema.optional().catch(undefined),
  status: statusSchema.optional().catch(undefined),
  hotelId: z.string().max(40).optional().catch(undefined),
});
