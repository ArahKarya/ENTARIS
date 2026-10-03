import type { WfIconName } from "./heroData";

export const WF_ASSET_BASE = "/assets/assets/images";

/** `<svg class="wf-ui-icon"><use href="workflow-ui-icons.svg#workflow-icon-*">` sprite icon. */
export function WfIcon({ name }: { name: WfIconName }) {
  return (
    <svg className="wf-ui-icon" aria-hidden="true">
      <use href={`${WF_ASSET_BASE}/workflow-ui-icons.svg#workflow-icon-${name}`} />
    </svg>
  );
}

/** Plugin logo from plugin-logos.svg (`#plugin-<id>`). */
export function PluginLogo({ id }: { id: string }) {
  return (
    <svg aria-hidden="true">
      <use href={`${WF_ASSET_BASE}/plugin-logos.svg#plugin-${id}`} />
    </svg>
  );
}
