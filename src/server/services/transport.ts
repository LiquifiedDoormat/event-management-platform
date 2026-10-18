import "server-only";
import { prisma } from "@/lib/db/prisma";
import type { SessionUser } from "@/lib/auth/session";
import { canViewBus, isStaff, type Actor } from "@/server/policies";
import { loadScope } from "@/server/policies/scope";
import { notFound } from "@/server/errors";

const DEFAULT_CONFIG = { eventName: "", staleLocationSeconds: 120 };

/** Event-wide display settings (single row; falls back to defaults if not created yet). */
export async function getEventSettings() {
  const config = await prisma.eventConfig.findUnique({
    where: { id: 1 },
    select: { eventName: true, staleLocationSeconds: true },
  });
  return config ?? DEFAULT_CONFIG;
}

/**
 * An attendee's homepage data: their own hotel (read from their current
 * allotment), its coordinator's name and phone only, and its active buses with
 * the latest status and location timestamp. Never includes other hotels.
 */
export async function getCustomerHome(user: SessionUser) {
  const [settings, hotel] = await Promise.all([
    getEventSettings(),
    user.hotelId
      ? prisma.hotel.findFirst({
          where: { id: user.hotelId, isActive: true },
          select: {
            name: true,
            address: true,
            latitude: true,
            longitude: true,
            coordinator: { where: { status: "ACTIVE" }, select: { name: true, phone: true } },
            buses: {
              where: { isActive: true },
              orderBy: { label: "asc" },
              select: {
                id: true,
                label: true,
                _count: { select: { stops: true } },
                trips: { where: { endedAt: null }, take: 1, select: { status: true, statusChangedAt: true } },
                location: { select: { recordedAt: true } },
              },
            },
          },
        })
      : Promise.resolve(null),
  ]);
  return { settings, hotel };
}

/**
 * One bus as attendees see it: status, latest position, ordered stops and the
 * coordinator on board. Visible to staff, to attendees of the bus's hotel and to
 * coordinators with that hotel in scope. Anything else is reported as not found.
 */
export async function getTrackedBus(actor: Actor, busId: string) {
  const bus = await prisma.bus.findUnique({
    where: { id: busId },
    select: {
      id: true,
      label: true,
      registration: true,
      isActive: true,
      hotelId: true,
      hotel: { select: { name: true, address: true, latitude: true, longitude: true } },
      stops: {
        orderBy: { sequence: "asc" },
        select: { id: true, sequence: true, name: true, address: true, latitude: true, longitude: true, timeNote: true },
      },
      trips: {
        where: { endedAt: null },
        take: 1,
        select: {
          status: true,
          statusChangedAt: true,
          sharingLocation: true,
          // Contact for the person accompanying this bus (operational purpose).
          coordinator: { select: { name: true, phone: true } },
        },
      },
      location: { select: { latitude: true, longitude: true, accuracy: true, recordedAt: true } },
    },
  });
  if (!bus || (!bus.isActive && !isStaff(actor))) throw notFound();
  const scope = await loadScope(actor);
  if (!canViewBus(actor, scope, bus)) throw notFound();
  const settings = await getEventSettings();
  return { bus, settings };
}
