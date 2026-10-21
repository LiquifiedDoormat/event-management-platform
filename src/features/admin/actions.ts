"use server";

// Form Server Actions for hotels, buses, stops and people. Each one:
// authenticates → validates with Zod → calls a service (which enforces the
// policy) → refreshes pages. Next.js rejects cross-origin Server Action calls.

import { z } from "zod";
import {
  busCreateInput,
  busInput,
  clusterInput,
  hotelInput,
  personCreateInput,
  personUpdateInput,
  roleSchema,
  statusSchema,
  stopInput,
} from "@/lib/validation/entities";
import * as hotels from "@/server/services/hotels";
import * as buses from "@/server/services/buses";
import * as people from "@/server/services/people";
import * as clusters from "@/server/services/clusters";
import * as settings from "@/server/services/settings";
import { run } from "@/features/run-action";
import type { ActionState } from "./action-state";

const id = z.string().min(1).max(40);
const optionalRef = z.preprocess((v) => (v === "" ? null : v), z.string().min(1).max(40).nullable());

// ---- Hotels ---------------------------------------------------------------

export async function createHotelAction(_: ActionState, form: FormData) {
  return run(form, async (u, d) => `/hotels/${(await hotels.createHotel(u, hotelInput.parse(d))).id}`);
}

export async function updateHotelAction(_: ActionState, form: FormData) {
  return run(form, (u, d) => hotels.updateHotel(u, id.parse(d.id), hotelInput.parse(d)));
}

export async function setHotelActiveAction(_: ActionState, form: FormData) {
  return run(form, (u, d) => hotels.setHotelActive(u, id.parse(d.id), d.active === "true"));
}

export async function addHotelCoordinatorAction(_: ActionState, form: FormData) {
  return run(form, (u, d) => hotels.addHotelCoordinator(u, id.parse(d.id), id.parse(d.coordinatorId)));
}

export async function removeHotelCoordinatorAction(_: ActionState, form: FormData) {
  return run(form, (u, d) => hotels.removeHotelCoordinator(u, id.parse(d.id), id.parse(d.coordinatorId)));
}

// ---- Buses & stops --------------------------------------------------------

export async function createBusAction(_: ActionState, form: FormData) {
  return run(form, async (u, d) => `/buses/${(await buses.createBus(u, busCreateInput.parse(d))).id}`);
}

export async function updateBusAction(_: ActionState, form: FormData) {
  return run(form, (u, d) => buses.updateBus(u, id.parse(d.id), busInput.parse(d)));
}

export async function setBusActiveAction(_: ActionState, form: FormData) {
  return run(form, (u, d) => buses.setBusActive(u, id.parse(d.id), d.active === "true"));
}

export async function reassignBusHotelAction(_: ActionState, form: FormData) {
  return run(form, (u, d) => buses.reassignBusHotel(u, id.parse(d.id), id.parse(d.hotelId)));
}

export async function assignBusCoordinatorAction(_: ActionState, form: FormData) {
  return run(form, (u, d) => buses.assignBusCoordinator(u, id.parse(d.id), optionalRef.parse(d.coordinatorId)));
}

export async function addStopAction(_: ActionState, form: FormData) {
  return run(form, (u, d) => buses.addStop(u, id.parse(d.busId), stopInput.parse(d)));
}

export async function updateStopAction(_: ActionState, form: FormData) {
  return run(form, (u, d) => buses.updateStop(u, id.parse(d.id), stopInput.parse(d)));
}

export async function removeStopAction(_: ActionState, form: FormData) {
  return run(form, (u, d) => buses.removeStop(u, id.parse(d.id)));
}

export async function moveStopAction(_: ActionState, form: FormData) {
  return run(form, (u, d) => buses.moveStop(u, id.parse(d.id), z.enum(["up", "down"]).parse(d.direction)));
}

// ---- People ---------------------------------------------------------------

export async function createPersonAction(_: ActionState, form: FormData) {
  return run(form, async (u, d) => `/people/${(await people.createPerson(u, personCreateInput.parse(d))).id}`);
}

/** Removes the PIN; the person chooses a new one at their next sign-in. */
export async function resetPinAction(_: ActionState, form: FormData) {
  return run(form, (u, d) => people.resetPin(u, id.parse(d.id)));
}

export async function updatePersonAction(_: ActionState, form: FormData) {
  return run(form, (u, d) => people.updatePerson(u, id.parse(d.id), personUpdateInput.parse(d)));
}

export async function setPersonHotelAction(_: ActionState, form: FormData) {
  return run(form, (u, d) => people.setPersonHotel(u, id.parse(d.id), optionalRef.parse(d.hotelId)));
}

export async function changeRoleAction(_: ActionState, form: FormData) {
  return run(form, (u, d) => people.changeRole(u, id.parse(d.id), roleSchema.parse(d.role)));
}

export async function setPersonStatusAction(_: ActionState, form: FormData) {
  return run(form, (u, d) => people.setPersonStatus(u, id.parse(d.id), statusSchema.parse(d.status)));
}

// ---- Clusters ---------------------------------------------------------------

export async function createClusterAction(_: ActionState, form: FormData) {
  return run(form, async (u, d) => `/clusters/${(await clusters.createCluster(u, clusterInput.parse(d))).id}`);
}

export async function updateClusterAction(_: ActionState, form: FormData) {
  return run(form, (u, d) => clusters.updateCluster(u, id.parse(d.id), clusterInput.parse(d)));
}

export async function addClusterHotelAction(_: ActionState, form: FormData) {
  return run(form, (u, d) => clusters.addClusterHotel(u, id.parse(d.id), id.parse(d.hotelId)));
}

export async function removeClusterHotelAction(_: ActionState, form: FormData) {
  return run(form, (u, d) => clusters.removeClusterHotel(u, id.parse(d.id), id.parse(d.hotelId)));
}

export async function addClusterCoordinatorAction(_: ActionState, form: FormData) {
  return run(form, (u, d) => clusters.addClusterCoordinator(u, id.parse(d.id), id.parse(d.coordinatorId)));
}

export async function removeClusterCoordinatorAction(_: ActionState, form: FormData) {
  return run(form, (u, d) => clusters.removeClusterCoordinator(u, id.parse(d.id), id.parse(d.coordinatorId)));
}

// ---- Event settings (Owner) ------------------------------------------------

export async function updateSettingsAction(_: ActionState, form: FormData) {
  return run(form, (u, d) => settings.updateSettings(u, settings.settingsInput.parse(d)));
}
