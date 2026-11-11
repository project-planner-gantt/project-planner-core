import { onMount } from "svelte";
import { todayIso } from "../core/taskLineEditor";

export function createToday() {
  let iso = $state(todayIso());
  const refresh = () => { iso = todayIso(); };
  onMount(() => {
    refresh();
    const timer = setInterval(refresh, 60_000);
    return () => clearInterval(timer);
  });
  return { get iso() { return iso; }, refresh };
}
