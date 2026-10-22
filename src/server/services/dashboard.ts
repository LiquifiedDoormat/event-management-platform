import "server-only";
import { prisma } from "@/lib/db/prisma";
import type { SessionUser } from "@/lib/auth/session";
import type { BusStatus } from "@/generated/prisma/enums";
import { can, type Actor } from "@/server/policies";
import { forbidden } from "@/server/errors";
import { STATUS_KIND, type StatusKind } from "@/lib/transport/status";
import { eventOf } from "./context";

/** Event-wide counts for Owner/Admin. Throws if the actor isn't staff. */
export async function getEventOverview(actor: Actor) {
  if (!can(actor, "dashboard.viewAll")) throw new Error("forbidden");
  const eventId = eventOf(actor);
  const member = (role: "CUSTOMER" | "COORDINATOR", extra = {}) =>
    prisma.eventMember.count({ where: { eventId, user: { role, status: "ACTIVE" }, ...extra } });
  const [hotels, buses, attendees, coordinators, hotelsWithoutCoordinator, attendeesWithoutHotel] =
    await Promise.all([
      prisma.hotel.count({ where: { eventId, isActive: true } }),
      prisma.bus.count({ where: { isActive: true, hotel: { eventId } } }),
      member("CUSTOMER"),
      member("COORDINATOR"),
      prisma.hotel.count({
        where: { eventId, isActive: true, members: { none: { user: { role: "COORDINATOR", status: "ACTIVE" } } } },
      }),
      member("CUSTOMER", { hotelId: null }),
    ]);
  return { hotels, buses, attendees, coordinators, hotelsWithoutCoordinator, attendeesWithoutHotel };
}

/** A cluster coordinator's cluster and its hotels, in the current event. View only. */
export async function getClusterCoordinatorOverview(user: SessionUser) {
  const eventId = eventOf(user);
  const membership = await prisma.eventMember.findUnique({
    where: { eventId_userId: { eventId, userId: user.id } },
    select: { cluster: { select: { id: true, name: true } } },
  });
  if (!membership?.cluster) return { cluster: null, hotels: [] };
  const hotels = await prisma.hotel.findMany({
    where: { eventId, clusterId: membership.cluster.id },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      address: true,
      members: {
        where: { user: { role: "COORDINATOR", status: "ACTIVE" } },
        select: { user: { select: { name: true, phone: true } } },
      },
      _count: {
        select: {
          buses: { where: { isActive: true } },
          members: { where: { user: { role: "CUSTOMER", status: "ACTIVE" } } },
        },
      },
    },
  });
  return {
    cluster: membership.cluster,
    hotels: hotels.map(({ members, _count, ...h }) => ({
      ...h,
      coordinators: members.map((m) => m.user),
      busCount: _count.buses,
      attendeeCount: _count.members,
    })),
  };
}

/** A coordinator's assigned hotel and the buses they accompany, in the current event. */
export async function getCoordinatorOverview(user: SessionUser) {
  const eventId = eventOf(user);
  const [membership, buses] = await Promise.all([
    prisma.eventMember.findUnique({
      where: { eventId_userId: { eventId, userId: user.id } },
      select: { hotel: { select: { name: true, address: true } } },
    }),
    prisma.bus.findMany({
      where: { coordinatorId: user.id, isActive: true, hotel: { eventId } },
      select: { id: true, label: true, hotel: { select: { name: true } } },
      orderBy: { label: "asc" },
    }),
  ]);
  return { hotel: membership?.hotel ?? null, buses };
}

export type OpsBusRow = {
  id: string;
  label: string;
  registration: string | null;
  hotelId: string;
  hotelName: string;
  clusterId: string | null;
  clusterName: string | null;
  coordinatorName: string | null;
  coordinatorPhone: string | null;
  status: BusStatus | null;
  statusChangedAt: Date | null;
  isDelayed: boolean;
  kind: StatusKind | "notRunning";
};

/**
 * Airport-board-style view of every active bus in the event, unpaginated
 * (sized for ~150 buses, not the 25-row keyset pages used elsewhere).
 * `summary` always counts the whole fleet; `buses` reflects the filters.
 */
export async function getOpsDashboard(
  actor: Actor,
  opts: { statusKind?: StatusKind | "notRunning"; hotelId?: string; clusterId?: string; delayedOnly?: boolean } = {},
) {
  if (!can(actor, "dashboard.viewAll")) throw forbidden();
  const eventId = eventOf(actor);
  const rows = await prisma.bus.findMany({
    where: { isActive: true, hotel: { eventId } },
    orderBy: [{ hotel: { name: "asc" } }, { label: "asc" }],
    select: {
      id: true,
      label: true,
      registration: true,
      hotel: { select: { id: true, name: true, clusterId: true, cluster: { select: { name: true } } } },
      coordinator: { select: { name: true, phone: true } },
      trips: { where: { endedAt: null }, take: 1, select: { status: true, statusChangedAt: true, isDelayed: true } },
    },
  });

  const all: OpsBusRow[] = rows.map((b) => {
    const trip = b.trips[0];
    return {
      id: b.id,
      label: b.label,
      registration: b.registration,
      hotelId: b.hotel.id,
      hotelName: b.hotel.name,
      clusterId: b.hotel.clusterId,
      clusterName: b.hotel.cluster?.name ?? null,
      coordinatorName: b.coordinator?.name ?? null,
      coordinatorPhone: b.coordinator?.phone ?? null,
      status: trip?.status ?? null,
      statusChangedAt: trip?.statusChangedAt ?? null,
      isDelayed: trip?.isDelayed ?? false,
      kind: trip ? STATUS_KIND[trip.status] : "notRunning",
    };
  });

  const summary = { boarding: 0, moving: 0, arrived: 0, notRunning: 0, delayed: 0, total: all.length };
  for (const b of all) {
    summary[b.kind]++;
    if (b.isDelayed) summary.delayed++;
  }

  const buses = all.filter(
    (b) =>
      (!opts.statusKind || b.kind === opts.statusKind) &&
      (!opts.hotelId || b.hotelId === opts.hotelId) &&
      (!opts.clusterId || b.clusterId === opts.clusterId) &&
      (!opts.delayedOnly || b.isDelayed),
  );

  return { summary, buses };
}
