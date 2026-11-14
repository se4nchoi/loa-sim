// Order core data loads per class in the app (order-cores.ts); tests read any class, so every class is loaded first.
import { loadOrderCores } from '$lib/upgrade-planner/order-cores';

await loadOrderCores();
